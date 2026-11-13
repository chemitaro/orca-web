import type { Connection, RunState, SourceStatus } from '../state/model.ts';

export const RUN_TREE_SCHEMA = 'orca-web.run-tree/v1';
export const RUN_LIST_SCHEMA = 'orca-web.runs/v1';

export interface RunProject {
  id: string;
  name: string;
}

export interface RunNode {
  id: string;
  role: 'coordinator' | 'worker';
  dispatchId: string | null;
  taskId: string | null;
  title: string | null;
  issue: string | null;
  agentId: string | null;
  agentType: string | null;
  model: string | null;
  effort: string | null;
  state: string | null;
  since: string | null;
  project: RunProject | null;
  worktreeId: string | null;
  otherProject: boolean;
  orphan: boolean;
  links: { detail: string | null };
  children: RunNode[];
}

export const RUN_SOURCES = ['runs', 'tasks', 'workers', 'workerLaunch', 'tabs', 'terminals'] as const;
export type RunSources = Record<(typeof RUN_SOURCES)[number], Pick<SourceStatus, 'lastSuccessAt' | 'stale' | 'error'>>;

interface RunFreshness {
  generatedAt: string;
  stale: boolean;
  connection: Connection;
  sources: RunSources;
}

export interface RunTreeDocument extends RunFreshness {
  schema: typeof RUN_TREE_SCHEMA;
  run: {
    id: string;
    title: string | null;
    coordinatorProject: RunProject | null;
    coordinatorResolvedBy: RunState['coordinatorResolvedBy'];
  };
  root: RunNode;
  counts: { nodes: number; workers: number; otherProject: number; orphan: number };
}

export interface RunListItem {
  id: string;
  title: string | null;
  coordinatorProject: RunProject | null;
  projects: RunProject[];
  workers: number;
  otherProject: number;
  active: number;
  latestTaskAt: string | null;
  fromOtherProject: RunProject | null;
}

export interface RunListDocument extends RunFreshness {
  schema: typeof RUN_LIST_SCHEMA;
  project: { id: string; name: string | null } | null;
  projects: (RunProject & { count: number })[];
  runs: RunListItem[];
}
