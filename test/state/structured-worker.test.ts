// 構造化 Chat の作業者（worker-list の `structured:<S>`）を、同じ sessionId のタブの chat-tab に結ぶ（iss-00044）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInbox } from '../../src/inbox/classify.ts';
import { OrcaCli, ReadOnlyOrcaCli } from '../../src/orca/orca-cli.ts';
import type { OrcaTab, OrcaTabSnapshot, OrcaWorker } from '../../src/orca/read-state.ts';
import { createStateReader, SOURCE_NAMES } from '../../src/orca/read-state.ts';
import type { CliRecording } from '../../src/orca/replay/recording.ts';
import { ReplayCliRunner, ReplayRpcTransport } from '../../src/orca/replay/replay.ts';
import { ReadOnlyRpc } from '../../src/orca/rpc.ts';
import type { StateDocument } from '../../src/state/model.ts';
import { type NormalizeSources, normalizeState, type SourceSnapshot } from '../../src/state/normalize.ts';
import { fact, input as inboxInput, message, task, worktree } from '../inbox/fixture.ts';
import { rpcRecording } from './fixture.ts';

const NOW = Date.parse('2026-11-17T12:00:00.000Z');
const SESSION = 'session-fake-1';

function snap<T>(data: T | null): SourceSnapshot<T> {
  return { data, fetchedAt: NOW, lastSuccessAt: NOW, error: null, truncated: false, intervalMs: 5000 };
}

function chat(id: string, patch: Partial<OrcaTab> = {}): OrcaTab {
  return {
    type: 'agent-session',
    id,
    parentTabId: null,
    leafId: null,
    status: null,
    terminal: null,
    launchAgent: null,
    title: '仮のタブ',
    customTitle: null,
    agent: 'claude',
    sessionId: SESSION,
    chatState: 'working',
    chatWorkingMode: null,
    chatStateStartedAt: NOW,
    agentStatus: null,
    ...patch,
  };
}

function terminal(id: string, handle: string): OrcaTab {
  return {
    ...chat(id),
    type: 'terminal',
    parentTabId: id,
    leafId: 'leaf-1',
    status: 'ready',
    terminal: handle,
    launchAgent: 'codex',
    agent: null,
    sessionId: null,
    chatState: null,
    chatStateStartedAt: null,
  };
}

function orcaWorker(dispatchId: string, patch: Partial<OrcaWorker> = {}): OrcaWorker {
  return {
    dispatchId,
    taskId: `task:${dispatchId}`,
    runId: 'run-a',
    workerState: 'working',
    dispatchStatus: 'dispatched',
    liveness: 'live',
    terminalHandle: null,
    terminalState: null,
    worktreeId: 'wt-a',
    structuredSessionId: SESSION,
    ...patch,
  };
}

function normalize(tabs: OrcaTabSnapshot[], workers: OrcaWorker[]): StateDocument {
  const empty = Object.fromEntries(SOURCE_NAMES.map((name) => [name, snap([])])) as unknown as NormalizeSources;
  return normalizeState({
    now: NOW,
    connection: { state: 'connected', reason: null, checkedAt: new Date(NOW).toISOString() },
    orca: null,
    sources: { ...empty, workerLaunch: snap(new Map()), tabs: snap(tabs), workers: snap(workers) },
  });
}

const workerOf = (doc: StateDocument, id: string) => doc.agents.find((a) => a.id === id)?.worker;

test('T-01: worker-list の resource.endpointIncarnation が structured:<S> のときだけ S を拾う', async () => {
  const row = (dispatchId: string, resource: unknown) => ({
    dispatchId,
    taskId: 'task-a',
    runId: 'run-a',
    ...(resource === undefined ? {} : { resource }),
  });
  const cli: CliRecording = {
    version: 1,
    kind: 'cli',
    entries: [
      {
        argv: ['orchestration', 'worker-list', '--full', '--limit', '100', '--json'],
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          result: {
            workers: [
              row('d-structured', { endpointIncarnation: 'structured:abc' }),
              row('d-terminal', { endpointIncarnation: 'pty:term-fake:1' }),
              row('d-empty', { endpointIncarnation: 'structured:' }),
              row('d-none', undefined),
              row('d-no-field', { worktreeId: 'wt-a' }),
              row('d-number', { endpointIncarnation: 7 }),
            ],
            page: { limit: 100, total: 6, hasMore: false, nextCursor: null },
          },
        }),
        stderr: '',
        delayMs: 0,
      },
    ],
  };
  const reader = createStateReader(
    new ReadOnlyOrcaCli(new OrcaCli(new ReplayCliRunner(cli))),
    new ReadOnlyRpc(new ReplayRpcTransport(rpcRecording())),
  );
  const workers = await reader.workers();
  assert.ok(workers.ok);
  assert.deepEqual(
    workers.data.map((w) => [w.dispatchId, w.structuredSessionId]),
    [
      ['d-structured', 'abc'],
      ['d-terminal', null],
      ['d-empty', null],
      ['d-none', null],
      ['d-no-field', null],
      ['d-number', null],
    ],
  );
  assert.equal(workers.data[4]?.worktreeId, 'wt-a');
});

test('T-02: S の worker 1行と sessionId が S のタブで、chat-tab の worker が付く（タブの id の形に頼らない）', () => {
  for (const tabId of [`agent-session:${SESSION}`, 'agent-chat-tab-v1-reopened']) {
    const doc = normalize([{ worktreeId: 'wt-a', tabs: [chat(tabId)] }], [orcaWorker('d-1')]);
    assert.deepEqual(workerOf(doc, `chat:${tabId}`), { dispatchId: 'd-1', taskId: 'task:d-1', runId: 'run-a' }, tabId);
    const agent = doc.agents.find((a) => a.id === `chat:${tabId}`);
    assert.equal(agent?.model.missing, 'no-source');
    assert.equal(agent?.effort.missing, 'no-source');
  }
});

test('T-02: S の worker が2行、sessionId の違い、タブに sessionId がない、のときは null', () => {
  const cases: [string, OrcaTab, OrcaWorker[]][] = [
    ['同じ S が2行', chat('t'), [orcaWorker('d-1'), orcaWorker('d-2')]],
    ['同じ S が3行', chat('t'), [orcaWorker('d-1'), orcaWorker('d-2'), orcaWorker('d-3')]],
    ['/clear の後の別のセッション', chat('t', { sessionId: 'session-fake-successor' }), [orcaWorker('d-1')]],
    ['タブに sessionId がない', chat('t', { sessionId: null }), [orcaWorker('d-1')]],
    ['worker が構造化でない', chat('t'), [orcaWorker('d-1', { structuredSessionId: null })]],
  ];
  for (const [name, tab, workers] of cases) {
    const doc = normalize([{ worktreeId: 'wt-a', tabs: [tab] }], workers);
    assert.equal(workerOf(doc, 'chat:t'), null, name);
  }
});

test('T-02: 端末のタブの worker は今のまま terminalHandle で結ぶ', () => {
  const doc = normalize(
    [{ worktreeId: 'wt-a', tabs: [terminal('term-tab', 'term-fake-1'), chat('t')] }],
    [orcaWorker('d-term', { terminalHandle: 'term-fake-1', structuredSessionId: null }), orcaWorker('d-chat')],
  );
  assert.deepEqual(workerOf(doc, 'term-tab:leaf-1'), { dispatchId: 'd-term', taskId: 'task:d-term', runId: 'run-a' });
  assert.deepEqual(workerOf(doc, 'chat:t'), { dispatchId: 'd-chat', taskId: 'task:d-chat', runId: 'run-a' });
});

test('T-05: 状態の文書に structured: や endpointIncarnation、セッションの識別子が出ない', () => {
  const doc = normalize([{ worktreeId: 'wt-a', tabs: [chat('t')] }], [orcaWorker('d-1')]);
  const json = JSON.stringify(doc);
  assert.doesNotMatch(json, /structured:/);
  assert.doesNotMatch(json, /endpointIncarnation/);
  assert.doesNotMatch(json, /structuredSessionId/);
  assert.doesNotMatch(json, new RegExp(SESSION));
});

test('T-05: 結んだ chat-tab の Dispatch の質問は、その chat-tab の行に付き、question の行は出ない', () => {
  const doc = normalize([{ worktreeId: 'wt-a', tabs: [chat('t')] }], [orcaWorker('d-1')]);
  const base = inboxInput();
  const value = {
    ...base,
    state: {
      ...doc,
      repos: base.state.repos,
      worktrees: [worktree({ branch: fact(null), displayName: fact(null) })],
      tasks: [task({ id: 'task:d-1', title: fact('仮の iss-77') })],
    },
  };
  value.mail.messages = [message({ id: 'q-1', dispatchId: 'd-1', taskId: 'task:d-1' })];
  const items = buildInbox(value).stages.flatMap((s) => s.items);
  assert.deepEqual(
    items.map((i) => i.id),
    ['agent:chat:t'],
  );
  const row = items[0];
  assert.deepEqual(
    row?.mail.map((m) => m.id),
    ['q-1'],
  );
  assert.equal(row?.stage, 'needs_action');
  assert.equal(row?.issue, 'iss-00077');

  // 結ぶ前（worker が構造化でない）は、エージェントに付かない質問の行だった。
  const before = normalize(
    [{ worktreeId: 'wt-a', tabs: [chat('t')] }],
    [orcaWorker('d-1', { structuredSessionId: null })],
  );
  const beforeItems = buildInbox({ ...value, state: { ...value.state, agents: before.agents } }).stages.flatMap(
    (s) => s.items,
  );
  assert.deepEqual(beforeItems.map((i) => i.id).sort(), ['agent:chat:t', 'question:q-1']);
});
