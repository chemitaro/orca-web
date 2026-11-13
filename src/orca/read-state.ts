// 状態の API のための、Orca の読み取り。取得元ごとに読み、応答を、その場で決めた項目だけの記録に減らす（許可の一覧で拾う）。
// プロンプト、ツールの入力、Task の spec と result、transcript のパス、端末の preview は拾わない。
// 最後の一言は受け箱専用に500文字まで拾い、状態の文書には出さない。
// 読む口は ReadOnlyOrcaCli と ReadOnlyRpc だけ。ページは最後まで読む。
import type { CliOutcome, ReadOnlyOrcaCli } from './orca-cli.ts';
import { clip } from './orca-cli.ts';
import type { RpcTransport } from './rpc.ts';

export type SourceName =
  | 'repos'
  | 'worktrees'
  | 'worktreePs'
  | 'terminals'
  | 'tabs'
  | 'runs'
  | 'tasks'
  | 'workers'
  | 'workerLaunch';

export const SOURCE_NAMES: readonly SourceName[] = [
  'repos',
  'worktrees',
  'worktreePs',
  'terminals',
  'tabs',
  'runs',
  'tasks',
  'workers',
  'workerLaunch',
];

export interface SourceError {
  /** CliFailureKind、RpcFailureKind、`invalid-shape`、`unavailable` のどれか。 */
  kind: string;
  message: string;
}

export type SourceRead<T> = { ok: true; data: T; truncated: boolean } | { ok: false; error: SourceError };

export interface OrcaRepo {
  id: string;
  displayName: string | null;
  path: string | null;
  kind: string | null;
  /** `gitRemoteIdentity.canonicalKey`（`github.com/<owner>/<name>` の形）。 */
  remoteKey: string | null;
}

export interface OrcaWorktree {
  id: string;
  repoId: string | null;
  path: string | null;
  branch: string | null;
  displayName: string | null;
  isMainWorktree: boolean | null;
  isArchived: boolean | null;
  parentWorktreeId: string | null;
  childWorktreeIds: string[] | null;
  lastActivityAt: number | null;
}

export interface OrcaPr {
  number: number | null;
  state: string | null;
  title: string | null;
  url: string | null;
  checksStatus: string | null;
  checks: { total: number; passed: number; failed: number; pending: number; cancelled: number; neutral: number } | null;
}

export interface OrcaPsAgent {
  paneKey: string | null;
  parentPaneKey: string | null;
  agentType: string | null;
  state: string | null;
  stateStartedAt: number | null;
  taskTitle: string | null;
}

export interface OrcaPsWorktree {
  worktreeId: string;
  repoId: string | null;
  path: string | null;
  branch: string | null;
  displayName: string | null;
  status: string | null;
  isArchived: boolean | null;
  isMainWorktree: boolean | null;
  parentWorktreeId: string | null;
  childWorktreeIds: string[] | null;
  lastActivityAt: number | null;
  lastOutputAt: number | null;
  linkedPR: OrcaPr | null;
  agents: OrcaPsAgent[];
}

export interface OrcaTerminal {
  handle: string;
  worktreeId: string | null;
  connected: boolean | null;
  lastOutputAt: number | null;
}

export interface OrcaTabOrchestration {
  dispatchId: string | null;
  taskId: string | null;
  runId: string | null;
  parentPaneKey: string | null;
  taskTitle: string | null;
}

export interface OrcaAgentStatus {
  /** 受け箱だけで使い、状態の文書には出さない。 */
  lastAssistantMessage: string | null;
  agentType: string | null;
  state: string | null;
  stateStartedAt: number | null;
  /** `agentStatus.model`（エージェントが報告した最後の値。今の Orca では出ない）。 */
  model: string | null;
  /** `agentStatus.providerSession.effort`（Claude Code の今の推論レベル）。 */
  effort: string | null;
  paneKey: string | null;
  orchestration: OrcaTabOrchestration | null;
}

export interface OrcaTab {
  type: string;
  id: string | null;
  parentTabId: string | null;
  leafId: string | null;
  status: string | null;
  terminal: string | null;
  launchAgent: string | null;
  title: string | null;
  customTitle: string | null;
  /** 構造化 Chat のタブのエージェントの種類。 */
  agent: string | null;
  chatState: string | null;
  chatStateStartedAt: number | null;
  agentStatus: OrcaAgentStatus | null;
}

export interface OrcaTabSnapshot {
  worktreeId: string;
  tabs: OrcaTab[];
}

export interface OrcaRun {
  coordinatorHandle: string | null;
  updatedAt: string | null;
  id: string;
  objective: string | null;
}

export interface OrcaTask {
  createdByTerminalHandle: string | null;
  id: string;
  runId: string | null;
  parentId: string | null;
  title: string | null;
  displayName: string | null;
  status: string | null;
  /** Orca の `deps`（JSON の配列の文字列）。解くのは正規化の側。 */
  deps: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

export interface OrcaWorker {
  dispatchId: string;
  taskId: string | null;
  runId: string | null;
  workerState: string | null;
  dispatchStatus: string | null;
  liveness: string | null;
  terminalHandle: string | null;
  terminalState: string | null;
  worktreeId: string | null;
}

export interface OrcaLaunchValues {
  agent: string | null;
  model: string | null;
  effort: string | null;
}

export interface OrcaLaunch {
  requested: OrcaLaunchValues | null;
  effective: OrcaLaunchValues | null;
}

export interface StateReader {
  repos(): Promise<SourceRead<OrcaRepo[]>>;
  worktrees(): Promise<SourceRead<OrcaWorktree[]>>;
  worktreePs(): Promise<SourceRead<OrcaPsWorktree[]>>;
  terminals(): Promise<SourceRead<OrcaTerminal[]>>;
  tabs(): Promise<SourceRead<OrcaTabSnapshot[]>>;
  runs(): Promise<SourceRead<OrcaRun[]>>;
  tasks(runId: string): Promise<SourceRead<OrcaTask[]>>;
  workers(): Promise<SourceRead<OrcaWorker[]>>;
  workerLaunch(dispatchId: string): Promise<SourceRead<OrcaLaunch>>;
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const rec = (v: unknown): Rec | null => (isRecord(v) ? v : null);
const records = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRecord) : []);
const strings = (v: unknown): string[] | null =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;

const FIRST_LIMIT = 10_000;
const MAX_LIMIT = 100_000;
const PAGE_LIMIT = '100';
const MAX_PAGES = 50;

function cliError(o: CliOutcome<unknown> & { ok: false }): SourceError {
  return { kind: o.kind, message: clip(o.code ? `${o.code}: ${o.message}` : o.message, 300) };
}

const shapeError = (what: string): { ok: false; error: SourceError } => ({
  ok: false,
  error: { kind: 'invalid-shape', message: `${what}: unexpected response shape` },
});

function pickRepo(r: Rec): OrcaRepo | null {
  const id = str(r.id);
  if (!id) return null;
  return {
    id,
    displayName: str(r.displayName),
    path: str(r.path),
    kind: str(r.kind),
    remoteKey: str(rec(r.gitRemoteIdentity)?.canonicalKey),
  };
}

function pickWorktree(r: Rec): OrcaWorktree | null {
  const id = str(r.id);
  if (!id) return null;
  return {
    id,
    repoId: str(r.repoId),
    path: str(r.path),
    branch: str(r.branch),
    displayName: str(r.displayName),
    isMainWorktree: bool(r.isMainWorktree),
    isArchived: bool(r.isArchived),
    parentWorktreeId: str(r.parentWorktreeId),
    childWorktreeIds: strings(r.childWorktreeIds),
    lastActivityAt: num(r.lastActivityAt),
  };
}

function pickPr(v: unknown): OrcaPr | null {
  const r = rec(v);
  if (!r) return null;
  const s = rec(r.checksSummary);
  const count = (k: string): number => num(s?.[k]) ?? 0;
  return {
    number: num(r.number),
    state: str(r.state),
    title: str(r.title),
    url: str(r.url),
    checksStatus: str(r.checksStatus),
    checks: s
      ? {
          total: count('total'),
          passed: count('passed'),
          failed: count('failed'),
          pending: count('pending'),
          cancelled: count('cancelled'),
          neutral: count('neutral'),
        }
      : null,
  };
}

function pickPsWorktree(r: Rec): OrcaPsWorktree | null {
  const worktreeId = str(r.worktreeId);
  if (!worktreeId) return null;
  return {
    worktreeId,
    repoId: str(r.repoId),
    path: str(r.path),
    branch: str(r.branch),
    displayName: str(r.displayName),
    status: str(r.status),
    isArchived: bool(r.isArchived),
    isMainWorktree: bool(r.isMainWorktree),
    parentWorktreeId: str(r.parentWorktreeId),
    childWorktreeIds: strings(r.childWorktreeIds),
    lastActivityAt: num(r.lastActivityAt),
    lastOutputAt: num(r.lastOutputAt),
    linkedPR: pickPr(r.linkedPR),
    agents: records(r.agents).map((a) => ({
      paneKey: str(a.paneKey),
      parentPaneKey: str(a.parentPaneKey),
      agentType: str(a.agentType),
      state: str(a.state),
      stateStartedAt: num(a.stateStartedAt),
      taskTitle: str(a.taskTitle),
    })),
  };
}

function pickTerminal(r: Rec): OrcaTerminal | null {
  const handle = str(r.handle);
  if (!handle) return null;
  return { handle, worktreeId: str(r.worktreeId), connected: bool(r.connected), lastOutputAt: num(r.lastOutputAt) };
}

function pickAgentStatus(v: unknown): OrcaAgentStatus | null {
  const a = rec(v);
  if (!a) return null;
  const o = rec(a.orchestration);
  return {
    lastAssistantMessage: str(a.lastAssistantMessage)?.slice(0, 500) ?? null,
    agentType: str(a.agentType),
    state: str(a.state),
    stateStartedAt: num(a.stateStartedAt),
    model: str(a.model),
    effort: str(rec(a.providerSession)?.effort),
    paneKey: str(a.paneKey),
    orchestration: o
      ? {
          dispatchId: str(o.dispatchId),
          taskId: str(o.taskId),
          runId: str(o.orchestrationRunId),
          parentPaneKey: str(o.parentPaneKey),
          taskTitle: str(o.taskTitle),
        }
      : null,
  };
}

function pickTab(r: Rec): OrcaTab {
  const chat = rec(r.chatStatus);
  return {
    type: str(r.type) ?? 'unknown',
    id: str(r.id),
    parentTabId: str(r.parentTabId),
    leafId: str(r.leafId),
    status: str(r.status),
    terminal: str(r.terminal),
    launchAgent: str(r.launchAgent),
    title: str(r.title),
    customTitle: str(r.customTitle),
    agent: str(r.agent),
    chatState: str(chat?.state),
    chatStateStartedAt: num(rec(chat?.mainAgent)?.stateStartedAt),
    agentStatus: pickAgentStatus(r.agentStatus),
  };
}

function pickTask(r: Rec): OrcaTask | null {
  const id = str(r.id);
  if (!id) return null;
  return {
    id,
    runId: str(r.run_id),
    parentId: str(r.parent_id),
    createdByTerminalHandle: str(r.created_by_terminal_handle),
    title: str(r.task_title),
    displayName: str(r.display_name),
    status: str(r.status),
    deps: str(r.deps),
    createdAt: str(r.created_at),
    completedAt: str(r.completed_at),
  };
}

function pickWorker(r: Rec): OrcaWorker | null {
  const dispatchId = str(r.dispatchId);
  if (!dispatchId) return null;
  const p = rec(r.projection);
  return {
    dispatchId,
    taskId: str(r.taskId),
    runId: str(r.runId) ?? str(p?.runId),
    workerState: str(r.workerState),
    dispatchStatus: str(r.dispatchStatus),
    liveness: str(rec(p?.liveness)?.verdict),
    terminalHandle: str(r.agentTerminalHandle),
    terminalState: str(r.terminalState),
    worktreeId: str(rec(p?.workspace)?.id) ?? str(rec(r.resource)?.worktreeId),
  };
}

function pickLaunchValues(v: unknown): OrcaLaunchValues | null {
  const r = rec(v);
  return r ? { agent: str(r.agent), model: str(r.model), effort: str(r.effort) } : null;
}

const notNull = <T>(v: T | null): v is T => v !== null;

export function createStateReader(cli: ReadOnlyOrcaCli, rpc: RpcTransport): StateReader {
  /** カーソルのない一覧。truncated なら totalCount まで上限を上げて1回だけ読み直す。 */
  async function limited<T>(command: string[], key: string, pick: (r: Rec) => T | null): Promise<SourceRead<T[]>> {
    let limit = FIRST_LIMIT;
    for (;;) {
      const o = await cli.json<unknown>([...command, '--limit', String(limit)]);
      if (!o.ok) return { ok: false, error: cliError(o) };
      if (!isRecord(o.result) || !Array.isArray(o.result[key])) return shapeError(command.join(' '));
      const truncated = o.result.truncated === true;
      const total = num(o.result.totalCount);
      if (truncated && limit < MAX_LIMIT && total !== null && total > limit) {
        limit = Math.min(total, MAX_LIMIT);
        continue;
      }
      return { ok: true, data: records(o.result[key]).map(pick).filter(notNull), truncated };
    }
  }

  /** カーソルのある一覧。next が null を返すまで読む。同じカーソルの繰り返しと MAX_PAGES で止めて truncated にする。 */
  async function paged<T>(
    command: string[],
    key: string,
    pick: (r: Rec) => T | null,
    next: (result: Rec) => string | null,
  ): Promise<SourceRead<T[]>> {
    const items: T[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const args = cursor ? [...command, '--cursor', cursor] : command;
      const o = await cli.json<unknown>(args);
      if (!o.ok) return { ok: false, error: cliError(o) };
      if (!isRecord(o.result) || !Array.isArray(o.result[key])) return shapeError(command.join(' '));
      items.push(...records(o.result[key]).map(pick).filter(notNull));
      cursor = next(o.result);
      if (cursor === null) return { ok: true, data: items, truncated: false };
      if (seen.has(cursor)) break;
      seen.add(cursor);
    }
    return { ok: true, data: items, truncated: true };
  }

  return {
    async repos() {
      const o = await cli.json<unknown>(['repo', 'list']);
      if (!o.ok) return { ok: false, error: cliError(o) };
      if (!isRecord(o.result) || !Array.isArray(o.result.repos)) return shapeError('repo list');
      return { ok: true, data: records(o.result.repos).map(pickRepo).filter(notNull), truncated: false };
    },
    worktrees: () => limited(['worktree', 'list'], 'worktrees', pickWorktree),
    worktreePs: () => limited(['worktree', 'ps'], 'worktrees', pickPsWorktree),
    terminals: () => limited(['terminal', 'list'], 'terminals', pickTerminal),
    async tabs() {
      const o = await rpc.call<unknown>('session.tabs.listAll', null);
      if (!o.ok) {
        return {
          ok: false,
          error: { kind: o.kind, message: clip(o.code ? `${o.code}: ${o.message}` : o.message, 300) },
        };
      }
      if (!isRecord(o.result) || !Array.isArray(o.result.snapshots)) return shapeError('session.tabs.listAll');
      const data = records(o.result.snapshots)
        .map((s): OrcaTabSnapshot | null => {
          const worktreeId = str(s.worktree);
          return worktreeId ? { worktreeId, tabs: records(s.tabs).map(pickTab) } : null;
        })
        .filter(notNull);
      return { ok: true, data, truncated: false };
    },
    runs: () =>
      paged(
        ['orchestration', 'run-list', '--full', '--limit', PAGE_LIMIT],
        'runs',
        (r) => {
          const id = str(r.id);
          return id
            ? {
                id,
                objective: str(r.objective),
                updatedAt: str(r.updated_at),
                coordinatorHandle: str(r.coordinator_handle),
              }
            : null;
        },
        (result) => str(result.nextCursor),
      ),
    async tasks(runId: string) {
      const o = await cli.json<unknown>(['orchestration', 'task-list', '--run', runId, '--full']);
      if (!o.ok) return { ok: false, error: cliError(o) };
      if (!isRecord(o.result) || !Array.isArray(o.result.tasks)) return shapeError('orchestration task-list');
      return { ok: true, data: records(o.result.tasks).map(pickTask).filter(notNull), truncated: false };
    },
    workers: () =>
      paged(['orchestration', 'worker-list', '--full', '--limit', PAGE_LIMIT], 'workers', pickWorker, (result) => {
        const page = rec(result.page);
        return page?.hasMore === true ? str(page.nextCursor) : null;
      }),
    async workerLaunch(dispatchId: string) {
      const o = await cli.json<unknown>(['orchestration', 'worker-show', '--dispatch', dispatchId, '--full']);
      if (!o.ok) return { ok: false, error: cliError(o) };
      const worker = isRecord(o.result) ? rec(o.result.worker) : null;
      if (!worker) return shapeError('orchestration worker-show');
      const launch = rec(rec(worker.startOptions)?.launch);
      return {
        ok: true,
        data: { requested: pickLaunchValues(launch?.requested), effective: pickLaunchValues(launch?.effective) },
        truncated: false,
      };
    },
  };
}
