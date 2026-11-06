// 正規化した状態の文書（`orca-web.state/v1`）の型。SpecDock のダッシュボードとの契約。
// 項目を足すときは版を変えず、意味や形を変えるときは版を上げる。
import type { SourceName } from '../orca/read-state.ts';

export const STATE_SCHEMA = 'orca-web.state/v1';

/** 値が欠けた理由。 */
export type MissingReason =
  /** 取得元を読めたが、この対象に値がない。 */
  | 'not-provided'
  /** この種類の対象には取得元がない。 */
  | 'no-source'
  /** 結ぶ鍵がない。 */
  | 'not-linked'
  /** 方針で読まない。 */
  | 'not-fetched'
  /** 取得元が一度も成功していない（workerLaunch では、その Dispatch の読みが成功していない）。 */
  | 'source-failed'
  /** Orca の機能が使えない。 */
  | 'source-unavailable'
  /** 知らない形の値。 */
  | 'invalid-value';

export interface Fact<T> {
  value: T | null;
  /** 値を読んだ（読もうとした）取得元。`sources` を引くと鮮度が分かる。 */
  source: SourceName | null;
  /** Orca の項目の名前。 */
  field: string | null;
  missing: MissingReason | null;
}

/** モデルと推論の値の意味。 */
export type ValueMeaning = 'current-selection' | 'last-observed' | 'launch-resolved' | 'launch-requested';

export interface Reading {
  value: string;
  meaning: ValueMeaning;
  source: SourceName;
  field: string;
}

export interface ReadingFact extends Fact<string> {
  meaning: ValueMeaning | null;
  /** 読めた値のすべて。並びは current-selection、last-observed、launch-resolved、launch-requested。先頭が代表。 */
  readings: Reading[];
}

export interface SourceStatus {
  /** 最後に読もうとした時刻。 */
  fetchedAt: string | null;
  lastSuccessAt: string | null;
  stale: boolean;
  truncated: boolean;
  error: { kind: string; message: string } | null;
}

export interface Connection {
  state: 'connected' | 'unreachable' | 'starting';
  reason: string | null;
  checkedAt: string | null;
}

export interface RepoState {
  id: string;
  displayName: Fact<string>;
  path: Fact<string>;
  kind: Fact<string>;
  remoteKey: Fact<string>;
}

export interface PrValue {
  number: number | null;
  state: string | null;
  title: string | null;
  url: string | null;
}

export interface CiValue {
  status: string | null;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  cancelled: number;
  neutral: number;
}

export interface WorktreeState {
  id: string;
  repoId: string | null;
  path: Fact<string>;
  branch: Fact<string>;
  displayName: Fact<string>;
  isMainWorktree: Fact<boolean>;
  isArchived: Fact<boolean>;
  parentWorktreeId: Fact<string>;
  childWorktreeIds: Fact<string[]>;
  status: Fact<string>;
  lastActivityAt: Fact<string>;
  lastOutputAt: Fact<string>;
  pr: Fact<PrValue>;
  ci: Fact<CiValue>;
}

export type AgentKind = 'terminal-tab' | 'chat-tab' | 'untabbed';

export interface WorkerLink {
  dispatchId: string;
  taskId: string | null;
  runId: string | null;
}

export interface AgentState {
  id: string;
  kind: AgentKind;
  worktreeId: string;
  paneKey: string | null;
  tabId: string | null;
  terminalHandle: string | null;
  agentType: Fact<string>;
  state: Fact<string>;
  stateStartedAt: Fact<string>;
  lastOutputAt: Fact<string>;
  title: Fact<string>;
  parentPaneKey: Fact<string>;
  terminal: Fact<string>;
  worker: WorkerLink | null;
  model: ReadingFact;
  effort: ReadingFact;
}

export interface RunState {
  id: string;
  title: Fact<string>;
}

export interface TaskState {
  id: string;
  runId: string | null;
  parentId: Fact<string>;
  deps: Fact<string[]>;
  title: Fact<string>;
  status: Fact<string>;
  createdAt: Fact<string>;
  completedAt: Fact<string>;
}

export interface WorkerState {
  dispatchId: string;
  taskId: string | null;
  runId: string | null;
  terminalHandle: string | null;
  worktreeId: Fact<string>;
  state: Fact<string>;
  dispatchStatus: Fact<string>;
  liveness: Fact<string>;
  model: ReadingFact;
  effort: ReadingFact;
}

export interface StateDocument {
  schema: typeof STATE_SCHEMA;
  generatedAt: string;
  stale: boolean;
  connection: Connection;
  orca: {
    appVersion: string | null;
    cliVersion: string | null;
    features: { readState: boolean; readTabs: boolean };
  } | null;
  sources: Record<SourceName, SourceStatus>;
  repos: RepoState[];
  worktrees: WorktreeState[];
  agents: AgentState[];
  runs: RunState[];
  tasks: TaskState[];
  workers: WorkerState[];
}
