import type { AgentMark } from '../inbox/classify.ts';
import type { Connection } from '../state/model.ts';

export interface WorktreeSummary {
  id: string;
  path: string | null;
  branch: string | null;
  project: { id: string; name: string } | null;
  issue: string | null;
  counts: Record<AgentMark, number> & { total: number };
  agents: { id: string; mark: AgentMark; agentType: string | null; since: string | null; detail: string }[];
}

export interface WorktreeSummaryDocument {
  schema: 'orca-web.worktree-summary/v1';
  generatedAt: string;
  stale: boolean;
  connection: Pick<Connection, 'state' | 'checkedAt'>;
  worktrees: WorktreeSummary[];
}
