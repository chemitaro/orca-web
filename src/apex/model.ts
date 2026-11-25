import type { AgentMark } from '../inbox/classify.ts';
import type { AgentKind, Connection, StateDocument } from '../state/model.ts';
import type { OrchestrationExtras } from './extras.ts';
import type { ApexVerdictMemo } from './memo.ts';
import type { BundleOwners } from './owners.ts';

export const APEXES_SCHEMA = 'orca-web.apexes/v1';

export type ApexStatus = 'needs_action' | 'working' | 'done';
export type ApexGroup = 'needs_action' | 'working' | 'done_recent' | 'done_older' | 'sleeping';
/** 並びは判定の順（R-02）。文書の reasons もこの順。 */
export type ApexReason =
  | 'apex_blocked'
  | 'apex_waiting'
  | 'member_blocked'
  | 'member_waiting'
  | 'question'
  | 'decision'
  | 'stalled'
  | 'apex_closed'
  | 'failed'
  | 'working'
  | 'monitoring'
  | 'members_working'
  | 'live_work'
  | 'member_grace'
  | 'grace'
  | 'done'
  | 'sleeping';
export type ApexTag = 'unverified';
export type ApexBadgeKind = 'merge_pending' | 'ci_failed' | 'failed_members' | 'remaining_tasks';

/** 完了の頂点の残りの札（R-05）。count は worktree・Dispatch・task の数。毎回データから出す。 */
export interface ApexBadge {
  kind: ApexBadgeKind;
  count: number;
}
export type UnlinkedReason = 'parent_missing' | 'worker_without_parent' | 'cycle';

export interface ApexProject {
  id: string;
  name: string;
}

export interface ApexMember {
  id: string;
  parentId: string;
  /** 頂点からの段数（1 から）。 */
  depth: number;
  mark: AgentMark;
  agentType: string | null;
  title: string | null;
  worktreeId: string;
  stateStartedAt: string | null;
}

export type ApexTeamStatus = 'working' | 'waiting' | 'done' | 'failed' | 'live' | 'unknown';

/** チームの節（R-01）。エージェントと Dispatch が同じなら1節（agent）。並びは深さ優先、兄弟は createdAt の古い順。 */
export interface ApexTeamNode {
  /** `agent:<エージェントの id>` か `dispatch:<Dispatch の id>`。 */
  key: string;
  kind: 'agent' | 'dispatch';
  agentId: string | null;
  dispatchId: string | null;
  /** 親の節の鍵。頂点の直下は null。 */
  parentKey: string | null;
  /** 頂点からの段数（1 から）。 */
  depth: number;
  /** task の題名か、エージェントの題名（200 字まで）。 */
  title: string | null;
  status: ApexTeamStatus;
  createdAt: string | null;
  /** task の completedAt。エージェントだけの節は null。 */
  completedAt: string | null;
  /** エージェントの節だけ。 */
  stateStartedAt: string | null;
}

/** 許可待ち・入力待ちのメンバー（iss-00080 D-00）。理由 member_blocked・member_waiting と同じ条件で当たったもの。 */
export interface ApexWaitingMember {
  id: string;
  title: string | null;
  mark: AgentMark;
}

/** 束の Dispatch の未回答の ask（attention input）と未解決の gate（approval）。本文は持たない（iss-00080 D-00）。 */
export interface ApexQuestion {
  dispatchId: string;
  /** task の題名（200 字まで）。 */
  taskTitle: string | null;
  kind: 'ask' | 'gate';
}

export interface ApexItem {
  id: string;
  kind: AgentKind;
  agentType: string | null;
  /** エージェントの題名、なければ worktree の名前。 */
  title: string | null;
  worktreeId: string;
  worktreeName: string | null;
  project: ApexProject | null;
  issue: string | null;
  mark: AgentMark;
  status: ApexStatus;
  group: ApexGroup;
  reasons: ApexReason[];
  tags: ApexTag[];
  /** 完了の頂点だけに付ける。並びは merge_pending、ci_failed、failed_members、remaining_tasks。 */
  badges: ApexBadge[];
  /** 頂点とメンバーの stateStartedAt の最大、なければ worktree の lastActivityAt。 */
  lastActivityAt: string | null;
  stateStartedAt: string | null;
  members: ApexMember[];
  /** 生きた辺のメンバーと束の Dispatch を、Dispatch の id で重ねずに数える。 */
  counts: { total: number; working: number; waiting: number; done: number };
  /** 生きた辺のメンバーと束の Dispatch の木（R-01）。 */
  team: ApexTeamNode[];
  /** 対応のカードの材料（iss-00080）。並びはメンバーの並び。 */
  waitingMembers: ApexWaitingMember[];
  /** 対応のカードの材料（iss-00080）。A3 の猶予や頂点の状態に関わらず、問いがあれば出す。並びは Dispatch の並び、ask が先。 */
  questions: ApexQuestion[];
}

export interface UnlinkedAgentItem {
  id: string;
  kind: AgentKind;
  agentType: string | null;
  title: string | null;
  worktreeId: string;
  project: ApexProject | null;
  issue: string | null;
  mark: AgentMark;
  reason: UnlinkedReason;
}

/** どの頂点にも結べない束のうち、生きた Dispatch か問いがあるもの。 */
export interface UnlinkedBundleItem {
  /** 束の鍵（`<Run の id>#<世代>`）。 */
  id: string;
  kind: 'bundle';
  runId: string;
  /** Run の目的の1行（200 字まで）。 */
  objective: string | null;
  generation: number | null;
  /** 生きた Dispatch の数。 */
  live: number;
  /** 未回答の ask か未解決の gate のある Dispatch の数。 */
  questions: number;
}

export type UnlinkedItem = UnlinkedAgentItem | UnlinkedBundleItem;

export interface ApexListDocument {
  schema: typeof APEXES_SCHEMA;
  generatedAt: string;
  stale: boolean;
  connection: Connection;
  project: string | null;
  counts: Record<ApexStatus, number>;
  items: ApexItem[];
  unlinked: UnlinkedItem[];
}

export interface BuildApexListInput {
  state: StateDocument;
  now: number;
  project: string | null;
  /** 頂点の一覧だけが使う内部の値。なければ生きた辺だけで結ぶ。 */
  extras?: OrchestrationExtras;
  /** 束 → 頂点の対応表。app の生存の間に1つ。 */
  owners?: BundleOwners | null;
  /** 鮮度が偽の間に使う最後の A3〜A6 の判定。app の生存の間に1つ。 */
  memo?: ApexVerdictMemo | null;
}
