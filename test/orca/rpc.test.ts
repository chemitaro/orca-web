import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { inspect } from 'node:util';
import { ReplayRpcServer, type RpcExchange } from '../../src/orca/replay/rpc-server.ts';
import { ReadOnlyRpc, UnixSocketRpc } from '../../src/orca/rpc.ts';
import { RuntimeLocator } from '../../src/orca/runtime.ts';

const TOKEN = 'secret-token-0123456789abcdef';
let dir = '';

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ow-rpc-'));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function setup(exchanges: RpcExchange[], runtimeOverride?: unknown) {
  const sub = await mkdtemp(path.join(dir, 'c-'));
  const socketPath = path.join(sub, 's.sock');
  const server = new ReplayRpcServer(socketPath, exchanges, { expectedAuthToken: TOKEN });
  await server.start();
  const runtimeFile = runtimeOverride ?? {
    runtimeId: 'rt-1',
    pid: 1,
    transports: [
      { kind: 'unix', endpoint: socketPath },
      { kind: 'websocket', endpoint: 'ws://127.0.0.1:1' },
    ],
    authToken: TOKEN,
    startedAt: 1,
  };
  await writeFile(path.join(sub, 'orca-runtime.json'), JSON.stringify(runtimeFile));
  const locator = new RuntimeLocator({ userDataDir: sub });
  const rpc = new UnixSocketRpc(locator, { timeoutMs: 500 });
  return { server, rpc, locator, sub };
}

const ok = (result: unknown) => `${JSON.stringify({ id: '$ID', ok: true, result, _meta: { runtimeId: 'rt-1' } })}\n`;

function noToken(value: unknown): void {
  const text = typeof value === 'string' ? value : `${JSON.stringify(value)} ${inspect(value, { depth: 10 })}`;
  assert.ok(!text.includes(TOKEN), 'authToken leaked');
}

test('1つの要求を NDJSON の1行で送り、同じ id の応答から result と runtimeId を返す', async () => {
  const { server, rpc } = await setup([
    { method: 'session.tabs.listAll', chunks: [ok({ worktrees: [] })], end: 'close' },
  ]);
  try {
    const outcome = await rpc.call('session.tabs.listAll', null);
    assert.deepEqual(outcome, { ok: true, result: { worktrees: [] }, runtimeId: 'rt-1' });
    assert.equal(server.received.length, 1);
    assert.equal(server.received[0]?.method, 'session.tabs.listAll');
    assert.equal(server.received[0]?.params, null);
    assert.equal(server.received[0]?.authTokenMatched, true);
    noToken(outcome);
  } finally {
    await server.stop();
  }
});

test('分割された行と keepalive の行から、正しい結果を得る', async () => {
  const line = ok({ tabs: [{ id: 't1' }] });
  const chunks = [
    '{"_keepalive":true}\n',
    '{"_keep',
    'alive":true}\n',
    line.slice(0, 7),
    line.slice(7, 20),
    line.slice(20),
  ];
  const { server, rpc } = await setup([
    { method: 'session.tabs.list', params: { worktree: 'w' }, chunks, end: 'hold' },
  ]);
  try {
    const outcome = await rpc.call('session.tabs.list', { worktree: 'w' });
    assert.deepEqual(outcome, { ok: true, result: { tabs: [{ id: 't1' }] }, runtimeId: 'rt-1' });
  } finally {
    await server.stop();
  }
});

test('ok: false の応答は orca-error と Orca の code で返す（method_not_found）', async () => {
  const frame = { id: '$ID', ok: false, error: { code: 'method_not_found', message: 'Unknown method: x' }, _meta: {} };
  const { server, rpc } = await setup([
    { method: 'nativeChat.readSession', chunks: [`${JSON.stringify(frame)}\n`], end: 'close' },
  ]);
  try {
    const outcome = await rpc.call('nativeChat.readSession', {});
    assert.deepEqual(outcome, {
      ok: false,
      kind: 'orca-error',
      code: 'method_not_found',
      message: 'Unknown method: x',
    });
  } finally {
    await server.stop();
  }
});

test('誤りの文に authToken が含まれていても伏せる', async () => {
  const frame = { id: '$ID', ok: false, error: { code: 'forbidden', message: `bad token ${TOKEN}` } };
  const { server, rpc } = await setup([
    { method: 'session.tabs.listAll', chunks: [`${JSON.stringify(frame)}\n`], end: 'close' },
  ]);
  try {
    const outcome = await rpc.call('session.tabs.listAll', null);
    assert.equal(outcome.ok, false);
    noToken(outcome);
  } finally {
    await server.stop();
  }
});

test('時間切れ、接続断、不正な JSON、id の食い違いを区別する', async () => {
  const { server, rpc } = await setup([
    { method: 'a', chunks: [], end: 'hold' },
    { method: 'b', chunks: ['{"id":"$ID","ok":tr'], end: 'close' },
    { method: 'c', chunks: ['not json\n'], end: 'hold' },
    { method: 'd', chunks: [`${JSON.stringify({ id: 'other', ok: true, result: 1 })}\n`], end: 'hold' },
  ]);
  try {
    const kinds = [];
    for (const m of ['a', 'b', 'c', 'd']) {
      const outcome = await rpc.call(m, null);
      assert.equal(outcome.ok, false);
      if (!outcome.ok) kinds.push(outcome.kind);
      noToken(outcome);
    }
    assert.deepEqual(kinds, ['timeout', 'disconnected', 'invalid-frame', 'mismatched-id']);
  } finally {
    await server.stop();
  }
});

test('応答の行が上限を超えたら oversized で止める', async () => {
  const sub = await mkdtemp(path.join(dir, 'o-'));
  const socketPath = path.join(sub, 's.sock');
  const server = new ReplayRpcServer(socketPath, [{ method: 'a', chunks: ['x'.repeat(4096)], end: 'hold' }]);
  await server.start();
  await writeFile(
    path.join(sub, 'orca-runtime.json'),
    JSON.stringify({ runtimeId: 'r', transports: [{ kind: 'unix', endpoint: socketPath }], authToken: TOKEN }),
  );
  try {
    const rpc = new UnixSocketRpc(new RuntimeLocator({ userDataDir: sub }), { timeoutMs: 500, maxFrameBytes: 1024 });
    const outcome = await rpc.call('a', null);
    assert.equal(!outcome.ok && outcome.kind, 'oversized');
  } finally {
    await server.stop();
  }
});

test('orca-runtime.json がない、unix の口がない、ソケットにつながらないときは unavailable を返し、例外で落ちない', async () => {
  const empty = await mkdtemp(path.join(dir, 'e-'));
  const missing = await new UnixSocketRpc(new RuntimeLocator({ userDataDir: empty })).call(
    'session.tabs.listAll',
    null,
  );
  assert.equal(!missing.ok && missing.kind, 'unavailable');

  const noUnix = await mkdtemp(path.join(dir, 'n-'));
  await writeFile(
    path.join(noUnix, 'orca-runtime.json'),
    JSON.stringify({ runtimeId: 'r', transports: [{ kind: 'websocket', endpoint: 'ws://x' }], authToken: TOKEN }),
  );
  const noEndpoint = await new UnixSocketRpc(new RuntimeLocator({ userDataDir: noUnix })).call('x', null);
  assert.equal(!noEndpoint.ok && noEndpoint.kind, 'unavailable');
  noToken(noEndpoint);

  const dead = await mkdtemp(path.join(dir, 'd-'));
  await writeFile(
    path.join(dead, 'orca-runtime.json'),
    JSON.stringify({
      runtimeId: 'r',
      transports: [{ kind: 'unix', endpoint: path.join(dead, 'gone.sock') }],
      authToken: TOKEN,
    }),
  );
  const refused = await new UnixSocketRpc(new RuntimeLocator({ userDataDir: dead })).call('x', null);
  assert.equal(!refused.ok && refused.kind, 'unavailable');

  const broken = await mkdtemp(path.join(dir, 'b-'));
  await writeFile(path.join(broken, 'orca-runtime.json'), '{not json');
  const unreadable = await new UnixSocketRpc(new RuntimeLocator({ userDataDir: broken })).call('x', null);
  assert.equal(!unreadable.ok && unreadable.kind, 'unavailable');
});

test('RuntimeLocator の結果を JSON にしても inspect しても authToken が出ない', async () => {
  const { server, locator } = await setup([]);
  try {
    const located = await locator.locate();
    assert.equal(located.ok, true);
    if (!located.ok) return;
    assert.equal(located.endpoint.runtimeId, 'rt-1');
    noToken(located);
    noToken(String(located.endpoint));
  } finally {
    await server.stop();
  }
});

test('ReadOnlyRpc は一覧にない method を送らずに誤りにする', async () => {
  const { server, rpc } = await setup([{ method: 'session.tabs.list', chunks: [ok({ tabs: [] })], end: 'close' }]);
  try {
    const ro = new ReadOnlyRpc(rpc);
    for (const m of ['session.tabs.activate', 'worktree.activate', 'terminal.send', 'nativeChat.subscribe']) {
      await assert.rejects(ro.call(m, {}), /not a read-only method/);
    }
    assert.equal((await ro.call('session.tabs.list', { worktree: 'w' })).ok, true);
    assert.deepEqual(
      server.received.map((r) => r.method),
      ['session.tabs.list'],
    );
  } finally {
    await server.stop();
  }
});
