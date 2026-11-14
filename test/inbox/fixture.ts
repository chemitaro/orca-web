import type { BuildInboxInput, InboxGate, InboxMessage, MailSnapshot } from '../../src/inbox/model.ts';
import { SOURCE_NAMES } from '../../src/orca/read-state.ts';
import type {
  AgentState,
  Fact,
  ReadingFact,
  RepoState,
  StateDocument,
  TaskState,
  WorkerState,
  WorktreeState,
} from '../../src/state/model.ts';

export const NOW = Date.parse('2026-01-02T12:00:00.000Z');
export const STARTED = '2026-01-02T11:00:00.000Z';

export function fact(value: null, missing?: Fact<never>['missing']): Fact<never>;
export function fact<T>(value: T | null, missing?: Fact<T>['missing']): Fact<T>;
export function fact<T>(value: T | null, missing: Fact<T>['missing'] = null): Fact<T> {
  return { value, source: null, field: null, missing: value === null ? (missing ?? 'not-provided') : null };
}

function reading(): ReadingFact {
  return { ...fact<string>(null), meaning: null, readings: [] };
}

export function repo(id = 'repo-a', name = '仮のプロジェクト'): RepoState {
  return { id, displayName: fact(name), path: fact(null), kind: fact(null), remoteKey: fact(null) };
}

export function worktree(patch: Partial<WorktreeState> = {}): WorktreeState {
  return {
    id: 'wt-a',
    repoId: 'repo-a',
    path: fact(null),
    branch: fact('iss-17'),
    displayName: fact('仮の作業'),
    isMainWorktree: fact(false),
    isArchived: fact(false),
    parentWorktreeId: fact(null),
    childWorktreeIds: fact([]),
    status: fact(null),
    lastActivityAt: fact(null),
    lastOutputAt: fact(null),
    pr: fact(null),
    ci: fact(null),
    ...patch,
  };
}

export function agent(id = 'agent-a', patch: Partial<AgentState> = {}): AgentState {
  return {
    id,
    kind: 'terminal-tab',
    worktreeId: 'wt-a',
    paneKey: id,
    tabId: 'tab-a',
    terminalHandle: 'term-a',
    agentType: fact('codex'),
    state: fact('working'),
    workingMode: fact(null),
    stateStartedAt: fact(STARTED),
    lastOutputAt: fact(null),
    title: fact('仮のエージェント'),
    parentPaneKey: fact(null),
    terminal: fact('attached'),
    worker: null,
    model: reading(),
    effort: reading(),
    ...patch,
  };
}

export function worker(patch: Partial<WorkerState> = {}): WorkerState {
  return {
    dispatchId: 'dispatch-a',
    taskId: 'task-a',
    runId: 'run-a',
    terminalHandle: 'term-a',
    worktreeId: fact('wt-a'),
    state: fact('working'),
    dispatchStatus: fact(null),
    liveness: fact(null),
    model: reading(),
    effort: reading(),
    ...patch,
  };
}

export function task(patch: Partial<TaskState> = {}): TaskState {
  return {
    id: 'task-a',
    runId: 'run-a',
    parentId: fact(null),
    createdByTerminalHandle: null,
    deps: fact([]),
    title: fact('仮の iss-42'),
    status: fact(null),
    createdAt: fact(null),
    completedAt: fact(null),
    ...patch,
  };
}

export function message(patch: Partial<InboxMessage> = {}): InboxMessage {
  return {
    id: 'mail-a',
    runId: 'run-a',
    type: 'question',
    toHandle: 'run:run-a',
    createdAt: STARTED,
    subject: '仮の確認事項',
    dispatchId: 'dispatch-a',
    taskId: 'task-a',
    outcome: null,
    prUrl: null,
    ...patch,
  };
}

export function gate(patch: Partial<InboxGate> = {}): InboxGate {
  return { id: 'gate-a', taskId: 'task-a', status: 'pending', createdAt: STARTED, question: '仮の判断の門', ...patch };
}

export function mail(patch: Partial<MailSnapshot> = {}): MailSnapshot {
  return {
    messages: [],
    gates: [],
    fetchedAt: STARTED,
    lastSuccessAt: STARTED,
    stale: false,
    error: null,
    runsRead: 1,
    runsFailed: 0,
    ...patch,
  };
}

export function input(patch: Partial<StateDocument> = {}): BuildInboxInput {
  const sources = Object.fromEntries(
    SOURCE_NAMES.map((name) => [
      name,
      {
        fetchedAt: STARTED,
        lastSuccessAt: STARTED,
        stale: false,
        truncated: false,
        error: null,
      },
    ]),
  ) as StateDocument['sources'];
  return {
    state: {
      schema: 'orca-web.state/v1',
      generatedAt: STARTED,
      stale: false,
      connection: { state: 'connected', reason: null, checkedAt: STARTED },
      orca: null,
      sources,
      repos: [repo()],
      worktrees: [worktree()],
      agents: [],
      workers: [],
      tasks: [],
      runs: [],
      ...patch,
    },
    mail: mail(),
    lastWords: new Map(),
    now: NOW,
    stallMs: 30 * 60_000,
    project: null,
  };
}

export function pr(state = 'open', url = 'https://github.com/example/demo/pull/17'): WorktreeState['pr'] {
  return fact({ number: 17, state, title: '仮の PR', url });
}

export function ci(status = 'failure'): WorktreeState['ci'] {
  return fact({ status, total: 1, passed: 0, failed: 1, pending: 0, cancelled: 0, neutral: 0 });
}
