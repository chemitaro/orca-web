import type { AgentMark } from '../inbox/classify.ts';
import type { Connection } from '../state/model.ts';

export interface AgentParent {
  id: string | null;
  worktreeId: string | null;
}

export interface WorktreeSummary {
  id: string;
  path: string | null;
  branch: string | null;
  project: { id: string; name: string } | null;
  issue: string | null;
  /** 状態の文書の worktree の `isMainWorktree`。値がないか worktree が見つからなければ null。 */
  main: boolean | null;
  counts: Record<AgentMark, number> & { total: number };
  agents: {
    id: string;
    mark: AgentMark;
    workingMode: 'monitoring' | null;
    agentType: string | null;
    since: string | null;
    detail: string;
    elapsedFrom: string | null;
    elapsedBasis: 'state' | 'worktree-activity' | null;
    /** 指揮の親。null は親がない。id・worktreeId が null は、親がいるはずだが見えない。 */
    parent: AgentParent | null;
    /** 状態が変わっても動かない開始の時刻（ISO 8601）。 */
    startedAt: string | null;
  }[];
}

export interface WorktreeSummaryDocument {
  schema: 'orca-web.worktree-summary/v1';
  generatedAt: string;
  stale: boolean;
  connection: Pick<Connection, 'state' | 'checkedAt'>;
  worktrees: WorktreeSummary[];
}
