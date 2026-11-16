// 端末のタブの agentStatus から、Orca が観測したセッションの始まりを sessionStartedAt にする（iss-00043）。
import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrcaAgentStatus, OrcaPsWorktree, OrcaTab, OrcaTabSnapshot } from '../../src/orca/read-state.ts';
import { SOURCE_NAMES } from '../../src/orca/read-state.ts';
import type { StateDocument } from '../../src/state/model.ts';
import { type NormalizeSources, normalizeState, type SourceSnapshot } from '../../src/state/normalize.ts';

const NOW = Date.parse('2026-11-16T12:00:00.000Z');
const T = (minutes: number) => NOW - minutes * 60_000;
const iso = (minutes: number) => new Date(T(minutes)).toISOString();

function snap<T>(data: T | null): SourceSnapshot<T> {
  return { data, fetchedAt: T(0), lastSuccessAt: T(0), error: null, truncated: false, intervalMs: 5000 };
}

function status(patch: Partial<OrcaAgentStatus>): OrcaAgentStatus {
  return {
    lastAssistantMessage: null,
    agentType: 'claude',
    state: 'working',
    workingMode: null,
    stateStartedAt: T(1),
    firstStateStartedAt: null,
    historyStartedAt: null,
    model: null,
    effort: null,
    paneKey: null,
    orchestration: null,
    ...patch,
  };
}

function tab(id: string, patch: Partial<OrcaTab>): OrcaTab {
  return {
    type: 'terminal',
    id,
    parentTabId: id,
    leafId: 'leaf',
    status: 'ready',
    terminal: null,
    launchAgent: null,
    title: null,
    customTitle: null,
    agent: null,
    sessionId: null,
    chatState: null,
    chatWorkingMode: null,
    chatStateStartedAt: null,
    agentStatus: null,
    ...patch,
  };
}

function normalize(tabs: OrcaTabSnapshot[], ps: OrcaPsWorktree[]): StateDocument {
  const empty = Object.fromEntries(SOURCE_NAMES.map((name) => [name, snap([])])) as unknown as NormalizeSources;
  return normalizeState({
    now: NOW,
    connection: { state: 'connected', reason: null, checkedAt: new Date(NOW).toISOString() },
    orca: null,
    sources: { ...empty, workerLaunch: snap(new Map()), tabs: snap(tabs), worktreePs: snap(ps) },
  });
}

test('端末のタブの sessionStartedAt は firstStateStartedAt、なければ stateHistory の値、どちらもなければ欠け', () => {
  const doc = normalize(
    [
      {
        worktreeId: 'wt-a',
        tabs: [
          tab('first', { agentStatus: status({ firstStateStartedAt: T(30), historyStartedAt: T(20) }) }),
          tab('history', { agentStatus: status({ historyStartedAt: T(20) }) }),
          tab('none', { agentStatus: status({}) }),
          tab('no-status', { launchAgent: 'claude' }),
          tab('chat', { type: 'agent-session', agent: 'claude', chatState: 'working', chatStateStartedAt: T(2) }),
        ],
      },
    ],
    [
      {
        worktreeId: 'wt-a',
        repoId: 'repo-a',
        path: null,
        branch: null,
        displayName: 'wt-a',
        status: null,
        isArchived: false,
        isMainWorktree: false,
        parentWorktreeId: null,
        childWorktreeIds: [],
        lastActivityAt: T(1),
        lastOutputAt: null,
        linkedPR: null,
        agents: [
          {
            paneKey: 'lonely:leaf',
            parentPaneKey: null,
            agentType: 'codex',
            state: 'working',
            workingMode: null,
            stateStartedAt: T(3),
            taskTitle: null,
          },
        ],
      },
    ],
  );
  const by = (id: string) => doc.agents.find((a) => a.id === id)?.sessionStartedAt;
  assert.deepEqual(by('first:leaf'), {
    value: iso(30),
    source: 'tabs',
    field: 'agentStatus.firstStateStartedAt',
    missing: null,
  });
  assert.deepEqual(by('history:leaf'), {
    value: iso(20),
    source: 'tabs',
    field: 'agentStatus.stateHistory.startedAt',
    missing: null,
  });
  const absent = { value: null, source: 'tabs', field: 'agentStatus.firstStateStartedAt', missing: 'not-provided' };
  assert.deepEqual(by('none:leaf'), absent);
  assert.deepEqual(by('no-status:leaf'), absent);
  const noSource = { value: null, source: null, field: null, missing: 'no-source' };
  assert.deepEqual(by('chat:chat'), noSource);
  assert.deepEqual(by('lonely:leaf'), noSource);
  assert.equal(doc.agents.find((a) => a.id === 'lonely:leaf')?.kind, 'untabbed');
  for (const agent of doc.agents) assert.ok('sessionStartedAt' in agent, agent.id);
});
