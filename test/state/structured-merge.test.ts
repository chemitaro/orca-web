// 構造化 Chat のタブと、Orca の式で同じ sessionId を指す ps の行を、1つのエージェントにまとめる（iss-00039）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInbox } from '../../src/inbox/classify.ts';
import type {
  OrcaAgentStatus,
  OrcaPsAgent,
  OrcaPsWorktree,
  OrcaTab,
  OrcaTabSnapshot,
  SourceName,
} from '../../src/orca/read-state.ts';
import { SOURCE_NAMES } from '../../src/orca/read-state.ts';
import type { StateDocument } from '../../src/state/model.ts';
import { type NormalizeSources, normalizeState, type SourceSnapshot } from '../../src/state/normalize.ts';
import { buildWorktreeSummary } from '../../src/summary/build.ts';
import { buildDetail } from '../../web/embed/agent-view.js';
import { input as inboxInput } from '../inbox/fixture.ts';
import { replayReader } from './helpers.ts';

const NOW = Date.parse('2026-11-16T12:00:00.000Z');
const T = (minutes: number) => NOW - minutes * 60_000;

// Orca v1.4.259 の structuredAgentSessionPaneKey を、sha256 の先頭16バイトから手で計算して書いた期待値。
const SESSION_A = '9bb05770-52fd-4fdf-80f7-020aca01d9b4';
const PANE_A = `structured-agent-session-${SESSION_A}:1e844bd7-cd04-497b-abc5-1b92b2985573`;
const SESSION_B = 'claude_4d9cd46a_9d3d_4595_b792_dfabe6a80299';
const PANE_B = `structured-agent-session-${SESSION_B}:e699f44a-7255-41a9-a7cd-9398a3241e56`;

function snap<T>(data: T | null, error: SourceSnapshot<T>['error'] = null): SourceSnapshot<T> {
  return {
    data,
    fetchedAt: T(0),
    lastSuccessAt: data === null ? null : T(0),
    error,
    truncated: false,
    intervalMs: 5000,
  };
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
    title: 'タブの題名',
    customTitle: null,
    agent: 'claude',
    sessionId: SESSION_A,
    chatState: 'working',
    chatWorkingMode: null,
    chatStateStartedAt: T(10),
    agentStatus: null,
    ...patch,
  };
}

function psAgent(paneKey: string, patch: Partial<OrcaPsAgent> = {}): OrcaPsAgent {
  return {
    paneKey,
    parentPaneKey: null,
    agentType: 'claude',
    state: 'waiting',
    workingMode: 'monitoring',
    stateStartedAt: T(20),
    taskTitle: 'ps の題名',
    ...patch,
  };
}

function psWorktree(worktreeId: string, agents: OrcaPsAgent[]): OrcaPsWorktree {
  return {
    worktreeId,
    repoId: 'repo-a',
    path: null,
    branch: null,
    displayName: worktreeId,
    status: null,
    isArchived: false,
    isMainWorktree: false,
    parentWorktreeId: null,
    childWorktreeIds: [],
    lastActivityAt: T(1),
    lastOutputAt: null,
    linkedPR: null,
    agents,
  };
}

function terminalWorker(parentPaneKey: string): OrcaTab {
  const agentStatus: OrcaAgentStatus = {
    lastAssistantMessage: null,
    agentType: 'codex',
    state: 'working',
    workingMode: null,
    stateStartedAt: T(5),
    model: null,
    effort: null,
    paneKey: null,
    orchestration: { dispatchId: null, taskId: null, runId: null, parentPaneKey, taskTitle: null },
  };
  return {
    ...chat('term-1'),
    type: 'terminal',
    parentTabId: 'term-1',
    leafId: 'leaf-1',
    status: 'ready',
    terminal: 'term-handle-1',
    agent: null,
    sessionId: null,
    chatState: null,
    chatStateStartedAt: null,
    agentStatus,
  };
}

function normalize(
  tabs: OrcaTabSnapshot[] | null,
  ps: OrcaPsWorktree[] | null,
  errors: Partial<Record<SourceName, SourceSnapshot<unknown>['error']>> = {},
): StateDocument {
  const empty = Object.fromEntries(SOURCE_NAMES.map((name) => [name, snap([])])) as unknown as NormalizeSources;
  return normalizeState({
    now: NOW,
    connection: { state: 'connected', reason: null, checkedAt: new Date(NOW).toISOString() },
    orca: null,
    sources: {
      ...empty,
      workerLaunch: snap(new Map()),
      tabs: snap(tabs, errors.tabs ?? null),
      worktreePs: snap(ps, errors.worktreePs ?? null),
    },
  });
}

const ids = (doc: StateDocument) => doc.agents.map((a) => `${a.kind} ${a.id}`).sort();

test('構造化 Chat のタブと一致する ps の行は、chat の id の1つのエージェントになる', () => {
  const doc = normalize(
    [{ worktreeId: 'wt-a', tabs: [chat('agent-session:x')] }],
    [psWorktree('wt-a', [psAgent(PANE_A, { parentPaneKey: 'coord:leaf' })])],
  );
  assert.deepEqual(ids(doc), ['chat-tab chat:agent-session:x']);
  const agent = doc.agents[0];
  assert.equal(agent?.paneKey, PANE_A);
  assert.deepEqual(agent?.parentPaneKey, {
    value: 'coord:leaf',
    source: 'worktreePs',
    field: 'agents.parentPaneKey',
    missing: null,
  });
  assert.equal(agent?.tabId, 'agent-session:x');
});

test('別の形の sessionId と、再び開いたタブの id でもまとまる', () => {
  const doc = normalize(
    [{ worktreeId: 'wt-a', tabs: [chat('agent-chat-tab-v1-abc', { sessionId: SESSION_B })] }],
    [psWorktree('wt-a', [psAgent(PANE_B)])],
  );
  assert.deepEqual(ids(doc), ['chat-tab chat:agent-chat-tab-v1-abc']);
  assert.equal(doc.agents[0]?.paneKey, PANE_B);
});

test('一致しないときは、今のまま chat-tab と untabbed の2つ', () => {
  const cases: [string, OrcaTabSnapshot[], OrcaPsWorktree[]][] = [
    ['別の worktree', [{ worktreeId: 'wt-a', tabs: [chat('t')] }], [psWorktree('wt-b', [psAgent(PANE_A)])]],
    [
      'leaf が1文字違う',
      [{ worktreeId: 'wt-a', tabs: [chat('t')] }],
      [psWorktree('wt-a', [psAgent(`${PANE_A.slice(0, -1)}4`)])],
    ],
    [
      'タブに sessionId がない',
      [{ worktreeId: 'wt-a', tabs: [chat('t', { sessionId: null })] }],
      [psWorktree('wt-a', [psAgent(PANE_A)])],
    ],
  ];
  for (const [name, tabs, ps] of cases) {
    const doc = normalize(tabs, ps);
    assert.equal(doc.agents.length, 2, name);
    const chatAgent = doc.agents.find((a) => a.kind === 'chat-tab');
    assert.equal(chatAgent?.paneKey, null, name);
    assert.equal(chatAgent?.parentPaneKey.missing, 'no-source', name);
    assert.equal(doc.agents.filter((a) => a.kind === 'untabbed').length, 1, name);
  }
});

test('同じ sessionId のタブが2つなら、タブの順で最初だけがまとまる', () => {
  const doc = normalize(
    [{ worktreeId: 'wt-a', tabs: [chat('first'), chat('second')] }],
    [psWorktree('wt-a', [psAgent(PANE_A)])],
  );
  assert.deepEqual(ids(doc), ['chat-tab chat:first', 'chat-tab chat:second']);
  assert.equal(doc.agents.find((a) => a.id === 'chat:first')?.paneKey, PANE_A);
  assert.equal(doc.agents.find((a) => a.id === 'chat:second')?.paneKey, null);
});

test('取得元が欠けたときは今のまま：tabs の失敗は untabbed、ps の失敗は chat-tab', () => {
  const noTabs = normalize(null, [psWorktree('wt-a', [psAgent(PANE_A)])], {
    tabs: { kind: 'timeout', message: 'x' },
  });
  assert.deepEqual(ids(noTabs), [`untabbed ${PANE_A}`]);
  const noPs = normalize([{ worktreeId: 'wt-a', tabs: [chat('t')] }], null, {
    worktreePs: { kind: 'timeout', message: 'x' },
  });
  assert.deepEqual(ids(noPs), ['chat-tab chat:t']);
  assert.equal(noPs.agents[0]?.paneKey, null);
});

test('値はタブを先に使い、タブにないときだけ ps の行で補う', () => {
  const withTab = normalize(
    [{ worktreeId: 'wt-a', tabs: [chat('t', { chatWorkingMode: null })] }],
    [psWorktree('wt-a', [psAgent(PANE_A)])],
  ).agents[0];
  assert.equal(withTab?.state.value, 'working');
  assert.equal(withTab?.state.source, 'tabs');
  assert.equal(withTab?.workingMode.value, null);
  assert.equal(withTab?.workingMode.source, 'tabs');
  assert.equal(withTab?.stateStartedAt.value, new Date(T(10)).toISOString());
  assert.equal(withTab?.title.value, 'タブの題名');
  assert.equal(withTab?.agentType.source, 'tabs');

  const fromPs = normalize(
    [
      {
        worktreeId: 'wt-a',
        tabs: [chat('t', { chatState: null, chatStateStartedAt: null, title: null, agent: null })],
      },
    ],
    [psWorktree('wt-a', [psAgent(PANE_A)])],
  ).agents[0];
  assert.deepEqual(
    [fromPs?.state.value, fromPs?.state.source, fromPs?.state.field],
    ['waiting', 'worktreePs', 'agents.state'],
  );
  assert.deepEqual([fromPs?.workingMode.value, fromPs?.workingMode.source], ['monitoring', 'worktreePs']);
  assert.deepEqual(
    [fromPs?.stateStartedAt.value, fromPs?.stateStartedAt.source],
    [new Date(T(20)).toISOString(), 'worktreePs'],
  );
  assert.deepEqual([fromPs?.title.value, fromPs?.title.source], ['ps の題名', 'worktreePs']);
  assert.deepEqual([fromPs?.agentType.value, fromPs?.agentType.source], ['claude', 'worktreePs']);
});

test('まとめた文書では、要約・受け箱で1人、端末の worker の親のリンクは chat の id', () => {
  const doc = normalize(
    [{ worktreeId: 'wt-a', tabs: [chat('agent-session:x'), terminalWorker(PANE_A)] }],
    [psWorktree('wt-a', [psAgent(PANE_A)])],
  );
  const summary = buildWorktreeSummary(doc);
  const wt = summary.worktrees.find((w) => w.id === 'wt-a');
  assert.equal(wt?.counts.total, 2);
  assert.equal(wt?.agents.filter((a) => a.id.startsWith('structured-agent-session-')).length, 0);

  const chatOnly = normalize(
    [{ worktreeId: 'wt-a', tabs: [chat('agent-session:x')] }],
    [psWorktree('wt-a', [psAgent(PANE_A)])],
  );
  const one = buildWorktreeSummary(chatOnly).worktrees.find((w) => w.id === 'wt-a');
  assert.equal(one?.counts.total, 1);
  assert.deepEqual(
    one?.agents.map((a) => a.id),
    ['chat:agent-session:x'],
  );

  const base = inboxInput();
  const inbox = buildInbox({ ...base, state: { ...chatOnly, repos: base.state.repos } });
  const rows = inbox.stages.flatMap((s) => s.items).filter((i) => i.kind === 'agent');
  assert.deepEqual(
    rows.map((i) => i.id),
    ['agent:chat:agent-session:x'],
  );

  const detail = buildDetail(doc, 'term-1:leaf-1');
  const parent = detail?.rows.find((r: { label: string }) => r.label === '親');
  assert.equal(parent?.href, `/embed/agent?id=${encodeURIComponent('chat:agent-session:x')}`);
});

test('読み取りは構造化 Chat のタブの sessionId を拾い、状態の文書には出さない', async () => {
  const { reader } = replayReader();
  const tabs = await reader.tabs();
  assert.ok(tabs.ok);
  const chatTab = tabs.data.flatMap((s) => s.tabs).find((t) => t.type === 'agent-session');
  assert.equal(chatTab?.sessionId, 'uuid-81');
  const doc = normalize(tabs.data, []);
  assert.doesNotMatch(JSON.stringify(doc), /uuid-81/);
});
