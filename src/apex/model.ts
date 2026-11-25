import type { AgentMark } from '../inbox/classify.ts';
import type { AgentKind, Connection, StateDocument } from '../state/model.ts';
import type { OrchestrationExtras } from './extras.ts';
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
  | 'working'
  | 'monitoring'
  | 'members_working'
  | 'member_grace'
  | 'done'
  | 'sleeping';
export type ApexTag = 'unverified';
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
  /** 頂点とメンバーの stateStartedAt の最大、なければ worktree の lastActivityAt。 */
  lastActivityAt: string | null;
  stateStartedAt: string | null;
  members: ApexMember[];
  /** 生きた辺のメンバーと束の Dispatch を、Dispatch の id で重ねずに数える。 */
  counts: { total: number; working: number; waiting: number; done: number };
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
}
