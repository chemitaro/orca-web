import type { AgentMark } from '../inbox/classify.ts';
import type { AgentKind, Connection, StateDocument } from '../state/model.ts';

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
  counts: { total: number; working: number; waiting: number; done: number };
}

export interface UnlinkedItem {
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
}
