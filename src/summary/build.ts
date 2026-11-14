import { agentMark, findIssue } from '../inbox/classify.ts';
import type { StateDocument } from '../state/model.ts';
import type { WorktreeSummary, WorktreeSummaryDocument } from './model.ts';

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildWorktreeSummary(state: StateDocument): WorktreeSummaryDocument {
  const worktrees = new Map<string, WorktreeSummary>();
  for (const agent of state.agents) {
    let summary = worktrees.get(agent.worktreeId);
    if (!summary) {
      const worktree = state.worktrees.find((entry) => entry.id === agent.worktreeId);
      const repo = state.repos.find((entry) => entry.id === worktree?.repoId);
      summary = {
        id: agent.worktreeId,
        path: worktree?.path.value ?? null,
        branch: worktree?.branch.value ?? null,
        project: repo?.displayName.value != null ? { id: repo.id, name: repo.displayName.value } : null,
        issue: findIssue([worktree?.branch.value, worktree?.displayName.value]),
        counts: { working: 0, blocked: 0, waiting: 0, done: 0, sleeping: 0, unknown: 0, total: 0 },
        agents: [],
      };
      worktrees.set(agent.worktreeId, summary);
    }
    const mark = agentMark(agent);
    summary.counts[mark]++;
    summary.counts.total++;
    const since = agent.stateStartedAt.value;
    const activity =
      mark === 'sleeping' || mark === 'unknown'
        ? (state.worktrees.find((entry) => entry.id === agent.worktreeId)?.lastActivityAt.value ?? null)
        : null;
    summary.agents.push({
      id: agent.id,
      mark,
      agentType: agent.agentType.value,
      since: agent.stateStartedAt.value,
      detail: `/embed/agent?id=${encodeURIComponent(agent.id)}`,
      elapsedFrom: since ?? activity,
      elapsedBasis: since !== null ? 'state' : activity !== null ? 'worktree-activity' : null,
    });
  }
  for (const summary of worktrees.values()) summary.agents.sort((a, b) => compareText(a.id, b.id));
  return {
    schema: 'orca-web.worktree-summary/v1',
    generatedAt: state.generatedAt,
    stale: state.stale,
    connection: { state: state.connection.state, checkedAt: state.connection.checkedAt },
    worktrees: [...worktrees.values()].sort((a, b) => {
      if (a.path === null && b.path !== null) return 1;
      if (a.path !== null && b.path === null) return -1;
      return compareText(a.path ?? '', b.path ?? '') || compareText(a.id, b.id);
    }),
  };
}
