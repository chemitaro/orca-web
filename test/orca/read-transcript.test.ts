import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTranscriptReader, type TranscriptTarget } from '../../src/orca/read-transcript.ts';
import { READ_METHODS, ReadOnlyRpc } from '../../src/orca/rpc.ts';
import {
  CHAT_TAB,
  capabilities,
  FakeRpc,
  fakeOrca,
  ok,
  PANE_CLAUDE,
  PANE_CODEX,
  PANE_SLEEPING,
  SESSION_CHAT,
  SESSION_CLAUDE,
  SESSION_CODEX,
  TRANSCRIPT_PATH,
  tabsInventory,
} from '../transcript/fixture.ts';

function reader(rpc = fakeOrca(), caps = capabilities()) {
  return { rpc, reader: createTranscriptReader({ rpc: new ReadOnlyRpc(rpc), capabilities: async () => caps }) };
}

async function target(r: ReturnType<typeof reader>['reader'], id: string): Promise<TranscriptTarget> {
  const resolved = await r.resolve(id);
  assert.ok(resolved.ok, `resolve ${id}`);
  return resolved.target;
}

test('agentSession.history は読む RPC の一覧に入り、streaming の method は入らない', () => {
  assert.ok(READ_METHODS.includes('agentSession.history'));
  assert.ok(!READ_METHODS.includes('nativeChat.subscribe'));
  assert.ok(!READ_METHODS.includes('agentSession.subscribe'));
});

test('端末のタブの paneKey から、Orca がタブに持つセッションの識別子と記録のパスで nativeChat.readSession を読む', async () => {
  const { rpc, reader: r } = reader();
  const t = await target(r, PANE_CLAUDE);
  assert.equal(t.source, 'nativeChat');
  assert.equal(t.agentType, 'claude');
  assert.equal(t.sessionId, SESSION_CLAUDE);
  assert.equal(t.transcriptPath, TRANSCRIPT_PATH);
  assert.match(t.key, /^[0-9a-f]{16}$/);
  const read = await r.read(t, { limit: 40 });
  assert.ok(read.ok);
  assert.equal(read.page.rows.length, 6);
  assert.deepEqual(read.page.before, { offset: 1200 });
  const call = rpc.calls.find((c) => c.method === 'nativeChat.readSession');
  assert.deepEqual(call?.params, {
    agent: 'claude',
    sessionId: SESSION_CLAUDE,
    limit: 40,
    capabilities: { transcriptSourceOrder: 1 },
    transcriptPath: TRANSCRIPT_PATH,
  });
});

test('記録のパスのない Codex は transcriptPath を送らず、前のページは beforeOffset で読む', async () => {
  const { rpc, reader: r } = reader();
  const t = await target(r, PANE_CODEX);
  assert.equal(t.agentType, 'codex');
  assert.equal(t.sessionId, SESSION_CODEX);
  assert.equal(t.transcriptPath, null);
  await r.read(t, { limit: 20, before: { offset: 1200 } });
  assert.deepEqual(rpc.calls.at(-1)?.params, {
    agent: 'codex',
    sessionId: SESSION_CODEX,
    limit: 20,
    capabilities: { transcriptSourceOrder: 1 },
    beforeOffset: 1200,
  });
});

test('構造化 Chat のタブは agentSession.history の tail を読み、前のページは before と window.oldest で読む', async () => {
  const { rpc, reader: r } = reader();
  const t = await target(r, CHAT_TAB);
  assert.equal(t.source, 'agentSession');
  assert.equal(t.sessionId, SESSION_CHAT);
  const read = await r.read(t, { limit: 40 });
  assert.ok(read.ok);
  assert.deepEqual(read.page.before, { cursor: { epoch: 'ep-1', sequence: 1 } });
  assert.deepEqual(rpc.calls.at(-1)?.params, { sessionId: SESSION_CHAT, direction: 'tail', limit: 40 });
  await r.read(t, { limit: 40, before: { cursor: { epoch: 'ep-1', sequence: 1 } } });
  assert.deepEqual(rpc.calls.at(-1)?.params, {
    sessionId: SESSION_CHAT,
    direction: 'before',
    cursor: { epoch: 'ep-1', sequence: 1 },
    limit: 40,
  });
});

test('agentSession.history の reset（ok: false）は、添えられたページを返さず read_failed にする', async () => {
  const rpc = fakeOrca();
  rpc.handlers['agentSession.history'] = () =>
    ok({ ok: false, reset: 'epoch-changed', page: { items: [], hasOlder: false, window: { oldest: null } } });
  const { reader: r } = reader(rpc);
  const t = await target(r, CHAT_TAB);
  assert.deepEqual(await r.read(t, { limit: 40, before: { cursor: { epoch: 'ep-1', sequence: 1 } } }), {
    ok: false,
    error: 'read_failed',
  });
});

test('誤りを区別した code にし、Orca の誤りの文を返さない', async () => {
  const { reader: r } = reader();
  assert.deepEqual(await r.resolve('tab-9:leaf-9'), { ok: false, error: 'agent_not_found' });
  assert.deepEqual(await r.resolve(PANE_SLEEPING), { ok: false, error: 'no_session' });
  assert.deepEqual(await reader(fakeOrca(), capabilities({ connected: false })).reader.resolve(PANE_CLAUDE), {
    ok: false,
    error: 'unreachable',
  });
  assert.deepEqual(await reader(fakeOrca(), capabilities({ readTranscript: false })).reader.resolve(PANE_CLAUDE), {
    ok: false,
    error: 'unsupported',
  });

  const cases: [unknown, string][] = [
    [ok({ error: 'ENOENT: /Users/someone/secret.jsonl', notFound: true }), 'transcript_not_found'],
    [ok({ error: 'Transcript unavailable' }), 'read_failed'],
    [ok({ messages: 'nope' }), 'unknown_shape'],
    [{ ok: false, kind: 'timeout', message: 'nativeChat.readSession: no response' }, 'unreachable'],
    [{ ok: false, kind: 'orca-error', code: 'method_not_found', message: 'Unknown method' }, 'unsupported'],
    [{ ok: false, kind: 'orca-error', code: 'invalid_argument', message: 'Missing session id' }, 'read_failed'],
  ];
  for (const [outcome, error] of cases) {
    const rpc = fakeOrca();
    rpc.handlers['nativeChat.readSession'] = () => outcome as never;
    const { reader: rr } = reader(rpc);
    const result = await rr.read(await target(rr, PANE_CLAUDE), { limit: 40 });
    assert.deepEqual(result, { ok: false, error }, JSON.stringify(outcome));
    assert.ok(!JSON.stringify(result).includes('/Users/'));
  }
});

test('Orca に届かない一覧の読みは unreachable、知らない形の一覧は unknown_shape', async () => {
  const unreachable = new FakeRpc({ 'session.tabs.listAll': () => ({ ok: false, kind: 'unavailable', message: 'x' }) });
  assert.deepEqual(await reader(unreachable).reader.resolve(PANE_CLAUDE), { ok: false, error: 'unreachable' });
  const odd = new FakeRpc({ 'session.tabs.listAll': () => ok({ tabs: [] }) });
  assert.deepEqual(await reader(odd).reader.resolve(PANE_CLAUDE), { ok: false, error: 'unknown_shape' });
});

test('セッションが変わると鍵が変わり、同じセッションなら鍵は同じ', async () => {
  const rpc = fakeOrca();
  const caps = capabilities();
  let now = 0;
  const r = createTranscriptReader({ rpc: new ReadOnlyRpc(rpc), capabilities: async () => caps, now: () => now });
  const first = await target(r, PANE_CLAUDE);
  now += 5_000;
  assert.equal((await target(r, PANE_CLAUDE)).key, first.key);
  rpc.handlers['session.tabs.listAll'] = () =>
    ok(tabsInventory({ claudeSession: 'dddddddd-4444-4444-8444-444444444444' }));
  now += 5_000;
  assert.notEqual((await target(r, PANE_CLAUDE)).key, first.key);
});

test('一覧の読みは1秒の間は共有する', async () => {
  const rpc = fakeOrca();
  let now = 0;
  const r = createTranscriptReader({
    rpc: new ReadOnlyRpc(rpc),
    capabilities: async () => capabilities(),
    now: () => now,
  });
  await Promise.all([r.resolve(PANE_CLAUDE), r.resolve(PANE_CODEX), r.resolve(CHAT_TAB)]);
  assert.equal(rpc.calls.filter((c) => c.method === 'session.tabs.listAll').length, 1);
  now += 1_000;
  await r.resolve(PANE_CLAUDE);
  assert.equal(rpc.calls.filter((c) => c.method === 'session.tabs.listAll').length, 2);
});
