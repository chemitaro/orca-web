import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CapabilityCache, type CapabilityReport, probeCapabilities } from '../../src/orca/capabilities.ts';
import { OrcaCli, ReadOnlyOrcaCli } from '../../src/orca/orca-cli.ts';
import type { CliRecording, RpcRecording } from '../../src/orca/replay/recording.ts';
import { ReplayCliRunner, ReplayRpcTransport } from '../../src/orca/replay/replay.ts';
import { ReadOnlyRpc } from '../../src/orca/rpc.ts';
import { type LocateOutcome, RuntimeEndpoint } from '../../src/orca/runtime.ts';

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/recordings/${name}`, import.meta.url), 'utf8')) as T;

type Json = Record<string, unknown>;

/** 録画の写しを作り、CLI の stdout の JSON を変える。 */
function editCli(edit: (argv0: string, doc: Json) => void): CliRecording {
  const rec = load<CliRecording>('cli-orca-1.4.251.json');
  for (const e of rec.entries) {
    if (!e.stdout.startsWith('{')) continue;
    const doc = JSON.parse(e.stdout) as Json;
    edit(e.argv[0] ?? '', doc);
    e.stdout = JSON.stringify(doc);
  }
  return rec;
}

function editRpc(edit: (method: string, frame: Json) => void): RpcRecording {
  const rec = load<RpcRecording>('rpc-orca-1.4.251.json');
  for (const e of rec.exchanges) {
    e.chunks = e.chunks.map((c) => {
      const frame = JSON.parse(c) as Json;
      edit(e.method, frame);
      return `${JSON.stringify(frame)}\n`;
    });
  }
  return rec;
}

const locator = (runtimeId: string | null) => ({
  locate: async (): Promise<LocateOutcome> => ({ ok: true, endpoint: new RuntimeEndpoint(runtimeId, '/p-1', 'x') }),
});

async function probe(
  cliRec = load<CliRecording>('cli-orca-1.4.251.json'),
  rpcRec = load<RpcRecording>('rpc-orca-1.4.251.json'),
  fileRuntimeId: string | null = 'uuid-1',
) {
  const rpc = new ReplayRpcTransport(rpcRec);
  const report = await probeCapabilities({
    cli: new ReadOnlyOrcaCli(new OrcaCli(new ReplayCliRunner(cliRec))),
    rpc: new ReadOnlyRpc(rpc),
    locator: locator(fileRuntimeId),
    now: () => new Date('2026-11-06T00:00:00Z'),
  });
  return { report, rpc };
}

const available = (r: CapabilityReport) =>
  Object.fromEntries(Object.entries(r.features).map(([name, f]) => [name, f.available]));

test('揃った録画から、機能ごとの期待する結果を返す', async () => {
  const { report, rpc } = await probe();
  assert.equal(report.checkedAt, '2026-11-06T00:00:00.000Z');
  assert.equal(report.cliVersion, '1.4.251');
  assert.equal(report.appVersion, '1.4.251');
  assert.equal(report.runtimeId, 'uuid-1');
  assert.equal(report.runtimeIdConsistent, true);
  assert.deepEqual(report.connection, { state: 'connected' });
  assert.deepEqual(available(report), {
    readState: true,
    readTabs: true,
    openExistingTab: true,
    readTranscript: true,
    sendTerminal: true,
    sendChat: false,
  });
  assert.deepEqual(report.features.openExistingTab.deferred, ['rpc:session.tabs.activate', 'rpc:worktree.activate']);
  assert.deepEqual(report.features.openExistingTab.missing, []);
  assert.deepEqual(report.features.sendTerminal.missing, []);
  assert.deepEqual(report.features.sendChat.missing, [
    'capability:agent-session.structured.v1',
    'capability:agent-session.send-recorded.v1',
  ]);
  assert.ok(report.features.sendTerminal.satisfied.includes('capability:terminal.prompt-delivery.v1'));
  assert.ok(report.features.readState.satisfied.includes('command:orchestration worker-show'));
  // 確かめで送るのは読む RPC だけ
  assert.deepEqual(rpc.calls.map((c) => c.method).sort(), ['nativeChat.readSession', 'session.tabs.listAll']);
});

test('capability が欠けると、それを要る機能だけが理由つきで使えない', async () => {
  const cli = editCli((argv0, doc) => {
    if (argv0 !== 'status') return;
    const runtime = (doc.result as Json).runtime as Json;
    runtime.capabilities = (runtime.capabilities as string[]).filter(
      (c) => c !== 'session-tabs.authoritative-inventory.v1',
    );
  });
  const { report } = await probe(cli);
  assert.equal(report.features.openExistingTab.available, false);
  assert.deepEqual(report.features.openExistingTab.missing, ['capability:session-tabs.authoritative-inventory.v1']);
  assert.equal(report.features.readState.available, true);
  assert.equal(report.features.readTabs.available, true);
  assert.equal(report.features.readTranscript.available, true);
});

test('コマンドやフラグが欠けると、それを要る機能だけが使えない', async () => {
  const cli = editCli((argv0, doc) => {
    if (argv0 !== 'agent-context') return;
    const commands = doc.commands as { path: string[]; flags: string[] }[];
    doc.commands = commands
      .filter((c) => c.path.join(' ') !== 'orchestration worker-show')
      .map((c) =>
        c.path.join(' ') === 'terminal switch' ? { ...c, flags: c.flags.filter((f) => f !== 'terminal') } : c,
      );
  });
  const { report } = await probe(cli);
  assert.deepEqual(report.features.readState.missing, ['command:orchestration worker-show']);
  assert.deepEqual(report.features.openExistingTab.missing, ['flag:terminal switch --terminal']);
  assert.equal(report.features.readTabs.available, true);
  assert.equal(report.features.readTranscript.available, true);
});

test('nativeChat.readSession が method_not_found なら readTranscript だけが使えない', async () => {
  const rpc = editRpc((method, frame) => {
    if (method === 'nativeChat.readSession') frame.error = { code: 'method_not_found', message: 'text-1' };
  });
  const { report } = await probe(undefined, rpc);
  assert.equal(report.features.readTranscript.available, false);
  assert.deepEqual(report.features.readTranscript.missing, ['rpc:nativeChat.readSession']);
  assert.equal(report.features.readTabs.available, true);
  assert.equal(report.features.openExistingTab.available, true);
});

test('タブの識別子が欠けると readTabs と openExistingTab が使えず、readState は使える', async () => {
  const rpc = editRpc((method, frame) => {
    if (method !== 'session.tabs.listAll') return;
    const snapshots = (frame.result as Json).snapshots as { tabs: Json[] }[];
    delete snapshots[0]?.tabs[0]?.leafId;
  });
  const { report } = await probe(undefined, rpc);
  assert.equal(report.features.readTabs.available, false);
  assert.deepEqual(report.features.readTabs.missing, ['shape:session.tabs.listAll']);
  assert.equal(report.features.openExistingTab.available, false);
  assert.ok(report.features.openExistingTab.missing.includes('feature:readTabs'));
  assert.equal(report.features.readState.available, true);
});

test('session.tabs.listAll が未知の形なら readTabs が使えない', async () => {
  const rpc = editRpc((method, frame) => {
    if (method === 'session.tabs.listAll') frame.result = { worktrees: [] };
  });
  const { report } = await probe(undefined, rpc);
  assert.deepEqual(report.features.readTabs.missing, ['shape:session.tabs.listAll']);
});

test('runtime の ID が食い違うと、書き込みの機能が使えず、読む機能は使える', async () => {
  const { report } = await probe(undefined, undefined, 'uuid-99');
  assert.equal(report.runtimeIdConsistent, false);
  assert.equal(report.features.openExistingTab.available, false);
  assert.ok(report.features.openExistingTab.missing.includes('runtime-id:consistent'));
  assert.ok(report.features.sendTerminal.missing.includes('runtime-id:consistent'));
  assert.equal(report.features.readState.available, true);
  assert.equal(report.features.readTabs.available, true);
});

test('RPC の応答の _meta.runtimeId だけが食い違っても、書き込みの機能が使えない（FQG-001）', async () => {
  const rpc = editRpc((method, frame) => {
    if (method === 'session.tabs.listAll') frame._meta = { runtimeId: 'uuid-other' };
  });
  const { report } = await probe(undefined, rpc, 'uuid-1');
  assert.equal(report.runtimeId, 'uuid-1');
  assert.equal(report.runtimeIdConsistent, false);
  assert.ok(report.features.openExistingTab.missing.includes('runtime-id:consistent'));
  assert.ok(report.features.sendTerminal.missing.includes('runtime-id:consistent'));
  assert.equal(report.features.readTabs.available, true);

  const { report: same } = await probe(undefined, undefined, 'uuid-1');
  assert.equal(same.runtimeIdConsistent, true);
});

test('Orca が動いていないとき、connection が unreachable で、runtime を要る機能が理由つきで使えない', async () => {
  const cli = load<CliRecording>('cli-orca-1.4.251.json');
  const status = cli.entries.find((e) => e.argv[0] === 'status');
  assert.ok(status);
  status.exitCode = 1;
  status.stdout = JSON.stringify({ ok: false, error: { code: 'runtime_unavailable', message: 'text-1' } });
  const rpc: RpcRecording = { version: 1, kind: 'rpc', exchanges: [] };
  const { report } = await probe(cli, rpc, null);
  assert.equal(report.connection.state, 'unreachable');
  assert.match(report.connection.state === 'unreachable' ? report.connection.reason : '', /runtime_unavailable/);
  for (const f of Object.values(report.features)) {
    assert.equal(f.available, false);
    assert.ok(f.missing.includes('runtime:reachable'));
  }
});

test('status が届いても runtime が ready でなければ unreachable', async () => {
  const cli = editCli((argv0, doc) => {
    if (argv0 === 'status')
      Object.assign((doc.result as Json).runtime as Json, { state: 'starting', reachable: false });
  });
  const { report } = await probe(cli, { version: 1, kind: 'rpc', exchanges: [] });
  assert.equal(report.connection.state, 'unreachable');
});

test('CLI が起動できないときも例外で落ちずに unreachable を返す', async () => {
  const cli: CliRecording = {
    version: 1,
    kind: 'cli',
    entries: ['--version', 'status', 'agent-context'].map((a) => ({
      argv: a === '--version' ? [a] : [a, '--json'],
      exitCode: null,
      stdout: '',
      stderr: '',
      delayMs: 0,
      spawnError: 'ENOENT',
    })),
  };
  const { report } = await probe(cli, { version: 1, kind: 'rpc', exchanges: [] }, null);
  assert.equal(report.cliVersion, null);
  assert.equal(report.connection.state, 'unreachable');
  assert.ok(report.features.readState.missing.includes('cli:agent-context'));
});

test('CapabilityCache は runtime の ID が同じ間は結果を使い、変わったら確かめ直す', async () => {
  let current: string | null = 'uuid-1';
  let probes = 0;
  const cache = new CapabilityCache(
    async () => {
      probes += 1;
      return { ...(await probe()).report, runtimeId: current };
    },
    async () => current,
  );
  await cache.get();
  await cache.get();
  assert.equal(probes, 1);
  current = 'uuid-2';
  const fresh = await cache.get();
  assert.equal(probes, 2);
  assert.equal(fresh.runtimeId, 'uuid-2');
});

test('CapabilityCache は接続できなかった結果を持たない', async () => {
  let probes = 0;
  const cache = new CapabilityCache(
    async () => {
      probes += 1;
      const { report } = await probe();
      return { ...report, connection: { state: 'unreachable', reason: 'down' } };
    },
    async () => 'uuid-1',
  );
  await cache.get();
  await cache.get();
  assert.equal(probes, 2);
});

test('送信の各 capability と読む機能の不足を分け、書く RPC は確かめない', async () => {
  const caps = ['terminal.prompt-delivery.v1', 'agent-session.structured.v1', 'agent-session.send-recorded.v1'];
  const cliWith = (missing?: string) =>
    editCli((argv0, doc) => {
      if (argv0 === 'status') ((doc.result as Json).runtime as Json).capabilities = caps.filter((c) => c !== missing);
    });
  const { report, rpc } = await probe(cliWith());
  assert.ok(report.features.sendTerminal.available);
  assert.ok(report.features.sendChat.available);
  assert.deepEqual(report.features.sendTerminal.deferred, [
    'rpc:terminal.send',
    'rpc:terminal.agentStatus',
    'rpc:terminal.inspectProcess',
    'rpc:orchestration.requestShow',
  ]);
  assert.deepEqual(report.features.sendChat.deferred, ['rpc:agentSession.send', 'rpc:agentSession.sendRecorded']);
  assert.deepEqual(rpc.calls.map((c) => c.method).sort(), ['nativeChat.readSession', 'session.tabs.listAll']);
  for (const cap of caps) {
    const { report: r } = await probe(cliWith(cap));
    assert.ok(
      (cap.startsWith('terminal') ? r.features.sendTerminal : r.features.sendChat).missing.includes(
        `capability:${cap}`,
      ),
    );
  }
  const { report: noTabs } = await probe(
    cliWith(),
    editRpc((method, frame) => {
      if (method === 'session.tabs.listAll') frame.result = { wrong: [] };
    }),
  );
  assert.ok(noTabs.features.sendTerminal.missing.includes('feature:readTabs'));
  assert.ok(noTabs.features.sendChat.missing.includes('feature:readTabs'));
  const { report: noTranscript } = await probe(
    cliWith(),
    editRpc((method, frame) => {
      if (method === 'nativeChat.readSession') frame.error = { code: 'method_not_found' };
    }),
  );
  assert.ok(noTranscript.features.sendTerminal.available);
  assert.ok(noTranscript.features.sendChat.missing.includes('feature:readTranscript'));
  const { report: inconsistent } = await probe(cliWith(), undefined, 'other-runtime');
  assert.ok(inconsistent.features.sendChat.missing.includes('runtime-id:consistent'));
});
