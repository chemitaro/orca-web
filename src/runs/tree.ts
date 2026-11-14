import { agentWorkingMode, findIssue } from '../inbox/classify.ts';
import type { AgentState, StateDocument, WorkerState } from '../state/model.ts';
import {
  RUN_LIST_SCHEMA,
  RUN_SOURCES,
  RUN_TREE_SCHEMA,
  type RunListDocument,
  type RunListItem,
  type RunNode,
  type RunProject,
  type RunSources,
  type RunTreeDocument,
} from './model.ts';

function freshness(state: StateDocument) {
  const sources = Object.fromEntries(
    RUN_SOURCES.map((name) => {
      const { lastSuccessAt, stale, error } = state.sources[name];
      return [name, { lastSuccessAt, stale, error }];
    }),
  ) as RunSources;
  return { generatedAt: state.generatedAt, stale: state.stale, connection: state.connection, sources };
}

function makeNode(
  state: StateDocument,
  id: string,
  title: string | null,
  worktreeId: string | null,
  agent: AgentState | undefined,
  worker?: WorkerState,
): RunNode {
  const worktree = state.worktrees.find((w) => w.id === worktreeId);
  const repo = state.repos.find((r) => r.id === worktree?.repoId);
  return {
    id,
    role: worker ? 'worker' : 'coordinator',
    dispatchId: worker?.dispatchId ?? null,
    taskId: worker?.taskId ?? null,
    title,
    issue: findIssue(
      worker
        ? [worktree?.branch.value, worktree?.displayName.value, title]
        : [title, worktree?.branch.value, worktree?.displayName.value],
    ),
    agentId: agent?.id ?? null,
    agentType: agent?.agentType.value ?? null,
    model: worker ? worker.model.value : (agent?.model.value ?? null),
    effort: worker?.effort.value ?? agent?.effort.value ?? null,
    state:
      agent?.state.value ?? (agent?.terminal.value === 'awaiting-restore' ? 'sleeping' : (worker?.state.value ?? null)),
    workingMode: agent ? agentWorkingMode(agent) : null,
    since: agent?.stateStartedAt.value ?? null,
    project: repo ? { id: repo.id, name: repo.displayName.value ?? repo.id } : null,
    worktreeId,
    otherProject: false,
    orphan: false,
    links: { detail: agent ? `/embed/agent?id=${encodeURIComponent(agent.id)}` : null },
    children: [],
  };
}

export function buildRunTree(state: StateDocument, runId: string): RunTreeDocument | null {
  const run = state.runs.find((r) => r.id === runId);
  if (!run) return null;
  const coordinator =
    run.activeCoordinatorHandle === null
      ? undefined
      : state.agents.find((a) => a.terminalHandle === run.activeCoordinatorHandle);
  const root = makeNode(
    state,
    `coordinator:${runId}`,
    run.title.value,
    run.coordinatorWorktreeId.value ?? coordinator?.worktreeId ?? null,
    coordinator,
  );
  const tasks = new Map(state.tasks.map((t) => [t.id, t]));
  const workers = state.workers.filter((w) => w.runId === runId);
  const nodes = new Map(
    workers.map((w) => {
      const agent =
        state.agents.find((a) => a.worker?.dispatchId === w.dispatchId) ??
        (w.terminalHandle === null ? undefined : state.agents.find((a) => a.terminalHandle === w.terminalHandle));
      const title = w.taskId === null ? null : (tasks.get(w.taskId)?.title.value ?? null);
      const node = makeNode(state, w.dispatchId, title, w.worktreeId.value ?? agent?.worktreeId ?? null, agent, w);
      node.otherProject = root.project !== null && node.project !== null && root.project.id !== node.project.id;
      return [w.dispatchId, node];
    }),
  );
  const parents = new Map<string, string>();
  for (const node of nodes.values()) {
    const task = node.taskId === null ? undefined : tasks.get(node.taskId);
    const candidates = task?.parentId.value == null ? [] : workers.filter((p) => p.taskId === task.parentId.value);
    const parent =
      (task?.createdByTerminalHandle == null
        ? undefined
        : candidates.find((p) => p.terminalHandle === task.createdByTerminalHandle)) ?? candidates[0];
    node.orphan = !task || (task.parentId.value !== null && !parent);
    if (parent) parents.set(node.id, parent.dispatchId);
  }
  // 親の選択を固定してから輪を調べる。先に1本を切ると残りの循環節を見落とす。
  for (const node of nodes.values()) {
    const visited = new Set([node.id]);
    let cursor = parents.get(node.id);
    while (cursor !== undefined && !visited.has(cursor)) {
      visited.add(cursor);
      cursor = parents.get(cursor);
    }
    if (cursor === node.id) node.orphan = true;
  }
  for (const node of nodes.values()) {
    const parentId = parents.get(node.id);
    const parent = node.orphan || parentId === undefined ? root : (nodes.get(parentId) ?? root);
    parent.children.push(node);
  }
  const createdAt = (node: RunNode) =>
    node.taskId === null ? null : (tasks.get(node.taskId)?.createdAt.value ?? null);
  for (const node of [root, ...nodes.values()]) {
    node.children.sort((a, b) => {
      const at = createdAt(a);
      const bt = createdAt(b);
      return (at === bt ? 0 : at === null ? 1 : bt === null ? -1 : at.localeCompare(bt)) || a.id.localeCompare(b.id);
    });
  }
  return {
    schema: RUN_TREE_SCHEMA,
    ...freshness(state),
    run: {
      id: run.id,
      title: run.title.value,
      coordinatorProject: root.project,
      coordinatorResolvedBy: run.coordinatorResolvedBy,
    },
    root,
    counts: {
      nodes: nodes.size + 1,
      workers: nodes.size,
      otherProject: [...nodes.values()].filter((n) => n.otherProject).length,
      orphan: [...nodes.values()].filter((n) => n.orphan).length,
    },
  };
}

export function buildRunList(state: StateDocument, project: string | null): RunListDocument {
  const projects = new Map<string, RunProject & { count: number }>();
  const runs: RunListItem[] = [];
  for (const run of state.runs) {
    const tree = buildRunTree(state, run.id);
    if (!tree) continue;
    const runProjects = new Map<string, RunProject>();
    const pending = [tree.root];
    let active = 0;
    while (pending.length) {
      const node = pending.pop();
      if (!node) break;
      if (node.project) runProjects.set(node.project.id, node.project);
      if (node.state === 'working' || node.state === 'blocked' || node.state === 'waiting') active++;
      pending.push(...node.children);
    }
    for (const p of runProjects.values()) {
      projects.set(p.id, { ...p, count: (projects.get(p.id)?.count ?? 0) + 1 });
    }
    if (project !== null && !runProjects.has(project)) continue;
    let latestTaskAt: string | null = null;
    for (const task of state.tasks) {
      const at = task.createdAt.value;
      if (task.runId === run.id && at !== null && (latestTaskAt === null || at > latestTaskAt)) latestTaskAt = at;
    }
    const coordinatorProject = tree.run.coordinatorProject;
    runs.push({
      id: tree.run.id,
      title: tree.run.title,
      coordinatorProject,
      projects: [...runProjects.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
      workers: tree.counts.workers,
      otherProject: tree.counts.otherProject,
      active,
      latestTaskAt,
      fromOtherProject:
        project !== null && coordinatorProject !== null && coordinatorProject.id !== project
          ? coordinatorProject
          : null,
    });
  }
  runs.sort(
    (a, b) =>
      b.active - a.active ||
      (a.latestTaskAt === b.latestTaskAt
        ? 0
        : a.latestTaskAt === null
          ? 1
          : b.latestTaskAt === null
            ? -1
            : b.latestTaskAt.localeCompare(a.latestTaskAt)) ||
      a.id.localeCompare(b.id),
  );
  return {
    schema: RUN_LIST_SCHEMA,
    ...freshness(state),
    project:
      project === null
        ? null
        : { id: project, name: state.repos.find((r) => r.id === project)?.displayName.value ?? null },
    projects: [...projects.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    runs,
  };
}
