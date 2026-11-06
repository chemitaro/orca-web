import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrcaCli, READ_COMMANDS, ReadOnlyOrcaCli } from '../../src/orca/orca-cli.ts';
import type { CliRecording, RpcRecording } from '../../src/orca/replay/recording.ts';
import { ReplayCliRunner, ReplayRpcTransport } from '../../src/orca/replay/replay.ts';
import { READ_METHODS, ReadOnlyRpc } from '../../src/orca/rpc.ts';
import { collectLive, summarizeLive } from '../../src/tools/live-probe.ts';

const WT1 = 'uuid-1::/p-1/p-2';
const WT2 = 'uuid-2::/p-1/p-3';
const ok = (result: unknown) => JSON.stringify({ ok: true, result });
const line = (result: unknown) =>
  `${JSON.stringify({ id: '$ID', ok: true, result, _meta: { runtimeId: 'uuid-9' } })}\n`;

const tabs1 = {
  worktree: WT1,
  tabs: [
    {
      type: 'terminal',
      id: 'uuid-10',
      parentTabId: 'uuid-10',
      leafId: 'uuid-11',
      ptyId: 'hex-1',
      status: 'ready',
      terminal: 'term_uuid-12',
      title: 'text-1',
      agentStatus: {
        state: 'working',
        agentType: 'claude',
        model: 'claude-opus-5-5',
        paneKey: 'uuid-10:uuid-11',
        prompt: 'text-2',
        providerSession: { key: 'claude', id: 'uuid-13', effort: 'high', transcriptPath: '/p-4/p-5' },
      },
    },
    {
      type: 'terminal',
      id: 'uuid-20',
      parentTabId: 'uuid-20',
      leafId: 'uuid-21',
      ptyId: 'hex-2',
      status: 'ready',
      terminal: 'term_uuid-22',
      agentStatus: {
        state: 'waiting',
        agentType: 'codex',
        paneKey: 'uuid-20:uuid-21',
        providerSession: { key: 'codex', id: 'uuid-23' },
      },
    },
    {
      type: 'terminal',
      id: 'uuid-30',
      parentTabId: 'uuid-30',
      leafId: 'uuid-31',
      ptyId: null,
      status: 'pending-handle',
      terminal: null,
      launchAgent: 'claude',
    },
    { type: 'markdown', id: 'uuid-40', title: 'text-3' },
  ],
};

const cli: CliRecording = {
  version: 1,
  kind: 'cli',
  entries: [
    {
      argv: ['worktree', 'list', '--limit', '1000', '--json'],
      exitCode: 0,
      stdout: ok({
        worktrees: [
          { id: WT1, isArchived: false },
          { id: WT2, isArchived: false },
          { id: 'uuid-3::/p-6', isArchived: true },
        ],
        truncated: false,
      }),
      stderr: '',
      delayMs: 0,
    },
    {
      argv: ['worktree', 'ps', '--limit', '1000', '--json'],
      exitCode: 0,
      stdout: ok({
        worktrees: [
          {
            worktreeId: WT1,
            agents: [
              { paneKey: 'uuid-10:uuid-11', agentType: 'claude', state: 'working', hasLivePty: true, prompt: 'text-2' },
              { paneKey: 'uuid-20:uuid-21', agentType: 'codex', state: 'waiting', hasLivePty: true },
              { paneKey: 'uuid-30:uuid-31', agentType: 'claude', state: 'done', hasLivePty: false },
            ],
          },
        ],
        truncated: false,
      }),
      stderr: '',
      delayMs: 0,
    },
    {
      argv: ['terminal', 'list', '--limit', '1000', '--json'],
      exitCode: 0,
      stdout: ok({
        terminals: [
          {
            handle: 'term_uuid-12',
            worktreeId: WT1,
            tabId: 'uuid-10',
            leafId: 'uuid-11',
            ptyId: 'hex-1',
            connected: true,
          },
          {
            handle: 'term_uuid-22',
            worktreeId: WT1,
            tabId: 'uuid-20',
            leafId: 'uuid-21',
            ptyId: 'hex-2',
            connected: true,
          },
        ],
        truncated: false,
      }),
      stderr: '',
      delayMs: 0,
    },
  ],
};

const rpc: RpcRecording = {
  version: 1,
  kind: 'rpc',
  exchanges: [
    { method: 'session.tabs.list', params: { worktree: `id:${WT1}` }, chunks: [line(tabs1)], end: 'close' },
    {
      method: 'session.tabs.list',
      params: { worktree: `id:${WT2}` },
      chunks: [line({ worktree: WT2, tabs: [] })],
      end: 'close',
    },
    {
      method: 'nativeChat.readSession',
      params: { agent: 'claude', sessionId: 'uuid-13', transcriptPath: '/p-4/p-5', limit: 1 },
      chunks: [line({ messages: [{ role: 'user', text: 'text-5' }], hasMore: true })],
      end: 'close',
    },
    {
      method: 'nativeChat.readSession',
      params: { agent: 'codex', sessionId: 'uuid-23', limit: 1 },
      chunks: [
        `${JSON.stringify({ id: '$ID', ok: false, error: { code: 'session_not_found', message: 'text-6' } })}\n`,
      ],
      end: 'close',
    },
  ],
};

async function collect() {
  const runner = new ReplayCliRunner(cli);
  const transport = new ReplayRpcTransport(rpc);
  const observation = await collectLive({
    cli: new ReadOnlyOrcaCli(new OrcaCli(runner)),
    rpc: new ReadOnlyRpc(transport),
  });
  return { observation, runner, transport };
}

test('collectLive は読むコマンドと読む RPC だけを呼ぶ', async () => {
  const { runner, transport } = await collect();
  for (const argv of runner.calls) {
    assert.ok(
      READ_COMMANDS.some((c) => c.every((w, i) => argv[i] === w)),
      argv.join(' '),
    );
  }
  for (const call of transport.calls) assert.ok(READ_METHODS.includes(call.method), call.method);
  assert.equal(transport.calls.filter((c) => c.method === 'session.tabs.list').length, 2);
});

test('summarizeLive はモデルと推論の有無、スリープの見え方、結べた数、会話の読み取りを集計する', async () => {
  const { observation } = await collect();
  const s = summarizeLive(observation);
  assert.deepEqual(s.counts, {
    worktrees: 2,
    tabsRead: 2,
    tabsFailed: 0,
    terminalTabs: 3,
    tabsByType: { terminal: 3, markdown: 1 },
  });
  assert.deepEqual(s.modelEffort.claude, {
    agentTabs: 1,
    workers: 0,
    withModel: 1,
    modelShapes: { 'claude-opus-N-N': 1 },
    withProviderSession: 1,
    withEffort: 1,
    effortValues: { high: 1 },
  });
  assert.equal(s.modelEffort.codex?.withModel, 0);
  assert.equal(s.modelEffort.codex?.withEffort, 0);
  assert.deepEqual(s.sleep.tabCombos, {
    'status=ready pty=yes agentStatus=working launchAgent=no': 1,
    'status=ready pty=yes agentStatus=waiting launchAgent=no': 1,
    'status=pending-handle pty=no agentStatus=none launchAgent=yes': 1,
  });
  assert.deepEqual(s.sleep.psAgentsWithoutLivePty, { done: 1 });
  assert.deepEqual(s.linking.tabToTerminal, { unique: 2, none: 1, multiple: 0 });
  assert.equal(s.linking.handleAgrees, 2);
  assert.deepEqual(s.linking.tabToPsAgent, { unique: 3, none: 0, multiple: 0 });
  assert.equal(s.linking.readyTabs, 2);
  assert.deepEqual(s.linking.byHandle, { 'tabId=parentTabId leaf=same worktree=same': 2 });
  assert.equal(s.linking.terminalsWithPlaceholderTabId, 0);
  assert.equal(s.linking.psAgentsMatchedToTab, 3);
  assert.equal(s.linking.agentStatusPaneKeyAgrees, 2);
  assert.deepEqual(s.linking.providerSessions, { present: 2, distinct: 2, shared: 0 });
  assert.deepEqual(s.transcript, {
    attempted: 2,
    ok: 1,
    withMessages: 1,
    okByAgent: { claude: 1 },
    failedByCode: { session_not_found: 1 },
  });
});

test('summarizeLive の出力に、本文、題名、パス、ID が出ない', async () => {
  const { observation } = await collect();
  const text = JSON.stringify(summarizeLive(observation));
  for (const leak of ['text-', 'uuid-', '/p-', 'hex-', 'term_']) assert.ok(!text.includes(leak), leak);
});

test('agentType も launchAgent もないタブの会話は読まない（provider のキーの名前をエージェント名に使わない）', async () => {
  const unknownTab = {
    type: 'terminal',
    id: 'uuid-50',
    parentTabId: 'uuid-50',
    leafId: 'uuid-51',
    status: 'ready',
    terminal: 'term_uuid-52',
    agentStatus: { state: 'done', paneKey: 'uuid-50:uuid-51', providerSession: { key: 'session_id', id: 'uuid-53' } },
  };
  const rec: RpcRecording = {
    version: 1,
    kind: 'rpc',
    exchanges: [{ method: 'session.tabs.list', chunks: [line({ worktree: WT1, tabs: [unknownTab] })], end: 'close' }],
  };
  const cliRec: CliRecording = {
    ...cli,
    entries: cli.entries.map((e) =>
      e.argv[0] === 'worktree' && e.argv[1] === 'list' ? { ...e, stdout: ok({ worktrees: [{ id: WT1 }] }) } : e,
    ),
  };
  const transport = new ReplayRpcTransport(rec);
  const o = await collectLive({
    cli: new ReadOnlyOrcaCli(new OrcaCli(new ReplayCliRunner(cliRec))),
    rpc: new ReadOnlyRpc(transport),
  });
  assert.deepEqual(o.transcripts, []);
  assert.ok(summarizeLive(o).modelEffort.unknown);
});
