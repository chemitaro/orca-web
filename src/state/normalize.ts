// 取得元ごとの最後に読めた記録から、正規化した状態の文書を作る純粋な関数。
// 値は取得元と Orca の項目の名前を付けて返し、取れない値は別の値で埋めずに null と欠けた理由で返す。
import type {
  OrcaLaunch,
  OrcaPsAgent,
  OrcaPsWorktree,
  OrcaRepo,
  OrcaRun,
  OrcaTab,
  OrcaTabSnapshot,
  OrcaTask,
  OrcaTerminal,
  OrcaWorker,
  OrcaWorktree,
  SourceError,
  SourceName,
} from '../orca/read-state.ts';
import { SOURCE_NAMES } from '../orca/read-state.ts';
import {
  type AgentState,
  type CiValue,
  type Connection,
  type Fact,
  type MissingReason,
  type PrValue,
  type Reading,
  type ReadingFact,
  type RepoState,
  type RunState,
  type SourceStatus,
  STATE_SCHEMA,
  type StateDocument,
  type TaskState,
  type ValueMeaning,
  type WorkerLink,
  type WorkerState,
  type WorktreeState,
} from './model.ts';

export interface SourceSnapshot<T> {
  /** 最後に成功した記録。一度も成功していなければ null。 */
  data: T | null;
  fetchedAt: number | null;
  lastSuccessAt: number | null;
  /** 最後の取得の誤り。成功したら null。 */
  error: SourceError | null;
  truncated: boolean;
  /** 今の間隔。鮮度の判定に使う。 */
  intervalMs: number;
}

export interface NormalizeSources {
  repos: SourceSnapshot<OrcaRepo[]>;
  worktrees: SourceSnapshot<OrcaWorktree[]>;
  worktreePs: SourceSnapshot<OrcaPsWorktree[]>;
  terminals: SourceSnapshot<OrcaTerminal[]>;
  tabs: SourceSnapshot<OrcaTabSnapshot[]>;
  runs: SourceSnapshot<OrcaRun[]>;
  tasks: SourceSnapshot<OrcaTask[]>;
  workers: SourceSnapshot<OrcaWorker[]>;
  /** Dispatch ごとの、成功した worker-show の起動の値。 */
  workerLaunch: SourceSnapshot<ReadonlyMap<string, OrcaLaunch>>;
}

export interface NormalizeInput {
  now: number;
  connection: Connection;
  orca: StateDocument['orca'];
  sources: NormalizeSources;
}

/** 端末の分割タブを、状態と受け箱で同じ識別子に結ぶ。 */
export function terminalTabIdentity(tab: Pick<OrcaTab, 'parentTabId' | 'leafId' | 'id'>): {
  paneKey: string | null;
  id: string | null;
} {
  const paneKey = tab.parentTabId && tab.leafId ? `${tab.parentTabId}:${tab.leafId}` : null;
  return { paneKey, id: paneKey ?? tab.id };
}

/** 鮮度の判定：最後の成功から、間隔のこの倍を過ぎたら古い。 */
export const STALE_FACTOR = 3;
const TITLE_MAX = 200;

const SETTLED_WORKER_STATES = new Set(['succeeded', 'failed', 'stopped', 'abandoned', 'cancelled']);

/** 担当の worker-show を読む対象か。終わっていないか、端末を返していない担当だけ。 */
export function needsLaunch(worker: Pick<OrcaWorker, 'workerState' | 'terminalState'>): boolean {
  const settled = worker.workerState !== null && SETTLED_WORKER_STATES.has(worker.workerState);
  return !settled || worker.terminalState !== 'released';
}

const MEANING_ORDER: readonly ValueMeaning[] = [
  'current-selection',
  'last-observed',
  'launch-resolved',
  'launch-requested',
];

export function isoFromMs(value: number | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Orca の `YYYY-MM-DD HH:MM:SS`（SQLite の UTC）か ISO 8601 を、ISO 8601 の UTC にする。読めなければ undefined。 */
export function isoFromText(value: string): string | undefined {
  const sqlite = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(value);
  const text = sqlite ? `${sqlite[1]}T${sqlite[2]}Z` : value;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const clipTitle = (s: string | null): string | null =>
  s === null ? null : s.length <= TITLE_MAX ? s : `${s.slice(0, TITLE_MAX - 1)}…`;

const stripBranch = (s: string | null): string | null => (s === null ? null : s.replace(/^refs\/heads\//, ''));

type Candidate<T> = readonly [value: T | null | undefined, source: SourceName, field: string];

export function normalizeState(input: NormalizeInput): StateDocument {
  const { now, sources } = input;

  /** 取得元が一度も成功していないときの理由。成功していれば null。 */
  const absent = (name: SourceName): MissingReason | null => {
    const s = sources[name];
    if (s.data !== null) return null;
    return s.error?.kind === 'unavailable' ? 'source-unavailable' : 'source-failed';
  };

  const missingFact = <T>(source: SourceName | null, field: string | null, missing: MissingReason): Fact<T> => ({
    value: null,
    source,
    field,
    missing,
  });

  /** 候補の順に最初の値。どれもなければ、最初の候補の取得元と項目で、欠けた理由を返す。 */
  function first<T>(candidates: readonly Candidate<T>[], fallback: MissingReason = 'not-provided'): Fact<T> {
    for (const [value, source, field] of candidates) {
      if (value !== null && value !== undefined) return { value, source, field, missing: null };
    }
    const head = candidates[0];
    if (!head) return missingFact(null, null, 'no-source');
    const allAbsent = candidates.every(([, source]) => absent(source) !== null);
    return missingFact(head[1], head[2], allAbsent ? (absent(head[1]) ?? fallback) : fallback);
  }

  const time = (candidates: readonly Candidate<number>[]): Fact<string> => {
    const f = first(candidates);
    return f.value === null ? (f as unknown as Fact<string>) : { ...f, value: isoFromMs(f.value) };
  };

  const textTime = (value: string | null, source: SourceName, field: string): Fact<string> => {
    if (value === null) return first<string>([[null, source, field]]);
    const iso = isoFromText(value);
    return iso === undefined
      ? missingFact(source, field, 'invalid-value')
      : { value: iso, source, field, missing: null };
  };

  const readingFact = (readings: Reading[], missing: Fact<string>): ReadingFact => {
    readings.sort((a, b) => MEANING_ORDER.indexOf(a.meaning) - MEANING_ORDER.indexOf(b.meaning));
    const head = readings[0];
    if (!head) return { ...missing, meaning: null, readings: [] };
    return {
      value: head.value,
      source: head.source,
      field: head.field,
      missing: null,
      meaning: head.meaning,
      readings,
    };
  };

  const launches = sources.workerLaunch.data ?? new Map<string, OrcaLaunch>();
  const workersById = new Map((sources.workers.data ?? []).map((w) => [w.dispatchId, w]));
  const workersByHandle = new Map(
    (sources.workers.data ?? []).filter((w) => w.terminalHandle !== null).map((w) => [w.terminalHandle, w]),
  );

  const launchReadings = (dispatchId: string, key: 'model' | 'effort'): Reading[] => {
    const launch = launches.get(dispatchId);
    const out: Reading[] = [];
    const effective = launch?.effective?.[key];
    const requested = launch?.requested?.[key];
    if (effective) {
      out.push({
        value: effective,
        meaning: 'launch-resolved',
        source: 'workerLaunch',
        field: `startOptions.launch.effective.${key}`,
      });
    }
    if (requested) {
      out.push({
        value: requested,
        meaning: 'launch-requested',
        source: 'workerLaunch',
        field: `startOptions.launch.requested.${key}`,
      });
    }
    return out;
  };

  /** 担当の起動の値が欠けた理由。 */
  const launchMissing = (dispatchId: string, key: 'model' | 'effort'): Fact<string> => {
    const field = `startOptions.launch.effective.${key}`;
    if (launches.has(dispatchId)) return missingFact('workerLaunch', field, 'not-provided');
    const worker = workersById.get(dispatchId);
    if (worker && !needsLaunch(worker)) return missingFact('workerLaunch', field, 'not-fetched');
    return missingFact('workerLaunch', field, 'source-failed');
  };

  // repo
  const repos: RepoState[] = (sources.repos.data ?? []).map((r) => ({
    id: r.id,
    displayName: first([[r.displayName, 'repos', 'displayName']]),
    path: first([[r.path, 'repos', 'path']]),
    kind: first([[r.kind, 'repos', 'kind']]),
    remoteKey: first([[r.remoteKey, 'repos', 'gitRemoteIdentity.canonicalKey']]),
  }));

  // worktree
  const listById = new Map((sources.worktrees.data ?? []).map((w) => [w.id, w]));
  const psById = new Map((sources.worktreePs.data ?? []).map((w) => [w.worktreeId, w]));
  const worktreeIds = [...new Set([...listById.keys(), ...psById.keys()])];
  const worktrees: WorktreeState[] = worktreeIds.map((id) => {
    const w = listById.get(id);
    const p = psById.get(id);
    const pr = p?.linkedPR ?? null;
    const prFact: Fact<PrValue> = pr
      ? {
          value: { number: pr.number, state: pr.state, title: clipTitle(pr.title), url: pr.url },
          source: 'worktreePs',
          field: 'linkedPR',
          missing: null,
        }
      : first<PrValue>([[null, 'worktreePs', 'linkedPR']]);
    const ciFact: Fact<CiValue> =
      pr && (pr.checksStatus !== null || pr.checks !== null)
        ? {
            value: {
              status: pr.checksStatus,
              total: pr.checks?.total ?? 0,
              passed: pr.checks?.passed ?? 0,
              failed: pr.checks?.failed ?? 0,
              pending: pr.checks?.pending ?? 0,
              cancelled: pr.checks?.cancelled ?? 0,
              neutral: pr.checks?.neutral ?? 0,
            },
            source: 'worktreePs',
            field: 'linkedPR.checksSummary',
            missing: null,
          }
        : first<CiValue>([[null, 'worktreePs', 'linkedPR.checksSummary']]);
    return {
      id,
      repoId: w?.repoId ?? p?.repoId ?? null,
      path: first([
        [w?.path, 'worktrees', 'path'],
        [p?.path, 'worktreePs', 'path'],
      ]),
      branch: first([
        [stripBranch(w?.branch ?? null), 'worktrees', 'branch'],
        [stripBranch(p?.branch ?? null), 'worktreePs', 'branch'],
      ]),
      displayName: first([
        [w?.displayName, 'worktrees', 'displayName'],
        [p?.displayName, 'worktreePs', 'displayName'],
      ]),
      isMainWorktree: first([
        [w?.isMainWorktree, 'worktrees', 'isMainWorktree'],
        [p?.isMainWorktree, 'worktreePs', 'isMainWorktree'],
      ]),
      isArchived: first([
        [w?.isArchived, 'worktrees', 'isArchived'],
        [p?.isArchived, 'worktreePs', 'isArchived'],
      ]),
      parentWorktreeId: first([
        [w?.parentWorktreeId, 'worktrees', 'parentWorktreeId'],
        [p?.parentWorktreeId, 'worktreePs', 'parentWorktreeId'],
      ]),
      childWorktreeIds: first([
        [w?.childWorktreeIds, 'worktrees', 'childWorktreeIds'],
        [p?.childWorktreeIds, 'worktreePs', 'childWorktreeIds'],
      ]),
      status: first([[p?.status, 'worktreePs', 'status']]),
      lastActivityAt: time([
        [w?.lastActivityAt, 'worktrees', 'lastActivityAt'],
        [p?.lastActivityAt, 'worktreePs', 'lastActivityAt'],
      ]),
      lastOutputAt: time([[p?.lastOutputAt, 'worktreePs', 'lastOutputAt']]),
      pr: prFact,
      ci: ciFact,
    };
  });
  worktrees.sort(
    (a, b) => (b.lastActivityAt.value ?? '').localeCompare(a.lastActivityAt.value ?? '') || a.id.localeCompare(b.id),
  );

  // エージェント
  const psByPane = new Map<string, { worktreeId: string; agent: OrcaPsAgent }>();
  for (const w of sources.worktreePs.data ?? []) {
    for (const agent of w.agents) if (agent.paneKey) psByPane.set(agent.paneKey, { worktreeId: w.worktreeId, agent });
  }
  const terminalsByHandle = new Map((sources.terminals.data ?? []).map((t) => [t.handle, t]));
  const usedPanes = new Set<string>();
  const agents: AgentState[] = [];

  const lastOutput = (handle: string | null): Fact<string> => {
    const field = 'lastOutputAt';
    const reason = absent('terminals');
    if (reason) return missingFact('terminals', field, reason);
    const t = handle === null ? undefined : terminalsByHandle.get(handle);
    if (!t) return missingFact('terminals', field, 'not-linked');
    return time([[t.lastOutputAt, 'terminals', field]]);
  };

  const terminalTab = (worktreeId: string, tab: OrcaTab): AgentState | null => {
    const { paneKey, id } = terminalTabIdentity(tab);
    const ps = paneKey ? psByPane.get(paneKey)?.agent : undefined;
    const as = tab.agentStatus;
    if (!as && !tab.launchAgent && !ps) return null;
    if (!id) return null;
    if (paneKey) usedPanes.add(paneKey);
    const o = as?.orchestration ?? null;
    let worker: WorkerLink | null = null;
    if (o?.dispatchId) worker = { dispatchId: o.dispatchId, taskId: o.taskId, runId: o.runId };
    else if (tab.terminal) {
      const w = workersByHandle.get(tab.terminal);
      if (w) worker = { dispatchId: w.dispatchId, taskId: w.taskId, runId: w.runId };
    }
    const agentType = first<string>([
      [as?.agentType, 'tabs', 'agentStatus.agentType'],
      [ps?.agentType, 'worktreePs', 'agents.agentType'],
      [tab.launchAgent, 'tabs', 'launchAgent'],
    ]);
    const modelReadings: Reading[] = [];
    const effortReadings: Reading[] = [];
    if (as?.model) {
      modelReadings.push({ value: as.model, meaning: 'last-observed', source: 'tabs', field: 'agentStatus.model' });
    }
    if (as?.effort) {
      effortReadings.push({
        value: as.effort,
        meaning: 'current-selection',
        source: 'tabs',
        field: 'agentStatus.providerSession.effort',
      });
    }
    if (worker) {
      modelReadings.push(...launchReadings(worker.dispatchId, 'model'));
      effortReadings.push(...launchReadings(worker.dispatchId, 'effort'));
    }
    const modelMissing = worker
      ? launchMissing(worker.dispatchId, 'model')
      : missingFact<string>('tabs', 'agentStatus.model', 'not-provided');
    const effortMissing = worker
      ? launchMissing(worker.dispatchId, 'effort')
      : agentType.value === 'claude'
        ? missingFact<string>('tabs', 'agentStatus.providerSession.effort', 'not-provided')
        : missingFact<string>(null, null, 'no-source');
    const terminalValue =
      tab.status === 'ready' ? 'attached' : tab.status === 'pending-handle' ? 'awaiting-restore' : tab.status;
    return {
      id,
      kind: 'terminal-tab',
      worktreeId,
      paneKey,
      tabId: tab.parentTabId ?? tab.id,
      terminalHandle: tab.terminal,
      agentType,
      state: first([
        [as?.state, 'tabs', 'agentStatus.state'],
        [ps?.state, 'worktreePs', 'agents.state'],
      ]),
      stateStartedAt: time([
        [as?.stateStartedAt, 'tabs', 'agentStatus.stateStartedAt'],
        [ps?.stateStartedAt, 'worktreePs', 'agents.stateStartedAt'],
      ]),
      lastOutputAt: lastOutput(tab.terminal),
      title: first([
        [clipTitle(o?.taskTitle ?? null), 'tabs', 'agentStatus.orchestration.taskTitle'],
        [clipTitle(ps?.taskTitle ?? null), 'worktreePs', 'agents.taskTitle'],
        [clipTitle(tab.customTitle), 'tabs', 'customTitle'],
        [clipTitle(tab.title), 'tabs', 'title'],
      ]),
      parentPaneKey: first([
        [o?.parentPaneKey, 'tabs', 'agentStatus.orchestration.parentPaneKey'],
        [ps?.parentPaneKey, 'worktreePs', 'agents.parentPaneKey'],
      ]),
      terminal: first([[terminalValue, 'tabs', 'status']]),
      worker,
      model: readingFact(modelReadings, modelMissing),
      effort: readingFact(effortReadings, effortMissing),
    };
  };

  const noSource = (): ReadingFact => ({
    ...missingFact<string>(null, null, 'no-source'),
    meaning: null,
    readings: [],
  });

  const chatTab = (worktreeId: string, tab: OrcaTab): AgentState | null => {
    if (!tab.id) return null;
    return {
      id: `chat:${tab.id}`,
      kind: 'chat-tab',
      worktreeId,
      paneKey: null,
      tabId: tab.id,
      terminalHandle: null,
      agentType: first([[tab.agent, 'tabs', 'agent']]),
      state: first([[tab.chatState, 'tabs', 'chatStatus.state']]),
      stateStartedAt: time([[tab.chatStateStartedAt, 'tabs', 'chatStatus.mainAgent.stateStartedAt']]),
      lastOutputAt: missingFact(null, null, 'no-source'),
      title: first([
        [clipTitle(tab.customTitle), 'tabs', 'customTitle'],
        [clipTitle(tab.title), 'tabs', 'title'],
      ]),
      parentPaneKey: missingFact(null, null, 'no-source'),
      terminal: missingFact(null, null, 'no-source'),
      worker: null,
      model: noSource(),
      effort: noSource(),
    };
  };

  for (const snapshot of sources.tabs.data ?? []) {
    for (const tab of snapshot.tabs) {
      const agent =
        tab.type === 'terminal'
          ? terminalTab(snapshot.worktreeId, tab)
          : tab.type === 'agent-session'
            ? chatTab(snapshot.worktreeId, tab)
            : null;
      if (agent) agents.push(agent);
    }
  }

  const tabsReason = absent('tabs');
  for (const [paneKey, { worktreeId, agent: ps }] of psByPane) {
    if (usedPanes.has(paneKey)) continue;
    const viaTabs = (field: string, otherwise: MissingReason, source: SourceName | null = 'tabs'): ReadingFact => ({
      ...missingFact<string>(
        tabsReason ? 'tabs' : source,
        tabsReason ? field : source ? field : null,
        tabsReason ?? otherwise,
      ),
      meaning: null,
      readings: [],
    });
    agents.push({
      id: paneKey,
      kind: 'untabbed',
      worktreeId,
      paneKey,
      tabId: null,
      terminalHandle: null,
      agentType: first([[ps.agentType, 'worktreePs', 'agents.agentType']]),
      state: first([[ps.state, 'worktreePs', 'agents.state']]),
      stateStartedAt: time([[ps.stateStartedAt, 'worktreePs', 'agents.stateStartedAt']]),
      lastOutputAt: missingFact('terminals', 'lastOutputAt', 'not-linked'),
      title: first([[clipTitle(ps.taskTitle), 'worktreePs', 'agents.taskTitle']]),
      parentPaneKey: first([[ps.parentPaneKey, 'worktreePs', 'agents.parentPaneKey']]),
      terminal: missingFact('tabs', 'status', tabsReason ?? 'not-linked'),
      worker: null,
      model: viaTabs('agentStatus.model', 'no-source', null),
      effort: viaTabs('agentStatus.providerSession.effort', 'no-source', null),
    });
  }
  agents.sort(
    (a, b) =>
      a.worktreeId.localeCompare(b.worktreeId) ||
      (a.stateStartedAt.value ?? '￿').localeCompare(b.stateStartedAt.value ?? '￿') ||
      a.id.localeCompare(b.id),
  );

  // オーケストレーション
  const coordinatorWorktree = (handle: string | null): Fact<string> => {
    if (handle === null) return missingFact('terminals', 'worktreeId', 'not-provided');
    const terminal = terminalsByHandle.get(handle);
    if (terminal?.worktreeId != null) return first([[terminal.worktreeId, 'terminals', 'worktreeId']]);
    const agent = agents.find((a) => a.terminalHandle === handle);
    if (agent) return first([[agent.worktreeId, 'tabs', 'worktree']]);
    return missingFact('terminals', 'worktreeId', sources.terminals.data === null ? 'source-failed' : 'not-linked');
  };
  const tasks: TaskState[] = (sources.tasks.data ?? []).map((t) => {
    let deps: Fact<string[]>;
    if (t.deps === null) deps = first<string[]>([[null, 'tasks', 'deps']]);
    else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(t.deps);
      } catch {
        parsed = undefined;
      }
      deps =
        Array.isArray(parsed) && parsed.every((d) => typeof d === 'string')
          ? { value: parsed as string[], source: 'tasks', field: 'deps', missing: null }
          : missingFact('tasks', 'deps', 'invalid-value');
    }
    return {
      id: t.id,
      runId: t.runId,
      createdByTerminalHandle: t.createdByTerminalHandle,
      parentId: first([[t.parentId, 'tasks', 'parent_id']]),
      deps,
      title: first([
        [clipTitle(t.title), 'tasks', 'task_title'],
        [clipTitle(t.displayName), 'tasks', 'display_name'],
      ]),
      status: first([[t.status, 'tasks', 'status']]),
      createdAt: textTime(t.createdAt, 'tasks', 'created_at'),
      completedAt: textTime(t.completedAt, 'tasks', 'completed_at'),
    };
  });
  tasks.sort(
    (a, b) =>
      (a.runId ?? '').localeCompare(b.runId ?? '') ||
      (a.createdAt.value ?? '').localeCompare(b.createdAt.value ?? '') ||
      a.id.localeCompare(b.id),
  );

  const runs: RunState[] = (sources.runs.data ?? []).map((r) => {
    let activeCoordinatorHandle = r.coordinatorHandle;
    let coordinatorResolvedBy: RunState['coordinatorResolvedBy'] = null;
    if (r.coordinatorHandle !== null && terminalsByHandle.has(r.coordinatorHandle)) {
      coordinatorResolvedBy = 'run';
    } else {
      // tasks は Run、正規化した時刻、id の順。最後の候補が今の統括。
      const latest = tasks.findLast(
        (t) =>
          t.runId === r.id &&
          t.parentId.value === null &&
          t.createdByTerminalHandle !== null &&
          terminalsByHandle.has(t.createdByTerminalHandle),
      );
      if (latest) {
        activeCoordinatorHandle = latest.createdByTerminalHandle;
        coordinatorResolvedBy = 'latest-task';
      }
    }
    return {
      id: r.id,
      coordinatorHandle: r.coordinatorHandle,
      activeCoordinatorHandle,
      coordinatorResolvedBy,
      coordinatorWorktreeId: coordinatorWorktree(activeCoordinatorHandle),
      title: first([[clipTitle(r.objective), 'runs', 'objective']]),
    };
  });

  const workers: WorkerState[] = (sources.workers.data ?? []).map((w) => ({
    dispatchId: w.dispatchId,
    taskId: w.taskId,
    runId: w.runId,
    terminalHandle: w.terminalHandle,
    worktreeId: first([[w.worktreeId, 'workers', 'projection.workspace.id']]),
    state: first([[w.workerState, 'workers', 'workerState']]),
    dispatchStatus: first([[w.dispatchStatus, 'workers', 'dispatchStatus']]),
    liveness: first([[w.liveness, 'workers', 'projection.liveness.verdict']]),
    model: readingFact(launchReadings(w.dispatchId, 'model'), launchMissing(w.dispatchId, 'model')),
    effort: readingFact(launchReadings(w.dispatchId, 'effort'), launchMissing(w.dispatchId, 'effort')),
  }));

  const sourceStatus = {} as Record<SourceName, SourceStatus>;
  for (const name of SOURCE_NAMES) {
    const s = sources[name];
    sourceStatus[name] = {
      fetchedAt: isoFromMs(s.fetchedAt),
      lastSuccessAt: isoFromMs(s.lastSuccessAt),
      stale: s.error !== null || s.lastSuccessAt === null || now - s.lastSuccessAt > STALE_FACTOR * s.intervalMs,
      truncated: s.truncated,
      error: s.error,
    };
  }

  return {
    schema: STATE_SCHEMA,
    generatedAt: new Date(now).toISOString(),
    stale: SOURCE_NAMES.some((name) => sourceStatus[name].stale),
    connection: input.connection,
    orca: input.orca,
    sources: sourceStatus,
    repos,
    worktrees,
    agents,
    runs,
    tasks,
    workers,
  };
}
