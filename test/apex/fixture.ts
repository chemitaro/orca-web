// 束のテストの仮の値。状態の文書の tasks・workers と、内部の値（extras）を一緒に作る。
import type { OrchestrationExtras } from '../../src/apex/extras.ts';
import type { AgentState, TaskState, WorkerState } from '../../src/state/model.ts';
import { agent, fact, task, worker } from '../inbox/fixture.ts';

export interface TaskSpec {
  id: string;
  run?: string;
  parent?: string | null;
  paneKey?: string | null;
  generation?: number | null;
  status?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
}

export interface DispatchSpec {
  id: string;
  task: string;
  run?: string;
  state?: string;
  attention?: string[];
  worktree?: string;
}

export interface Orchestration {
  tasks: TaskState[];
  workers: WorkerState[];
  extras: OrchestrationExtras;
}

export function orchestration(o: {
  runs?: Record<string, number | null>;
  tasks?: TaskSpec[];
  dispatches?: DispatchSpec[];
}): Orchestration {
  const extras: OrchestrationExtras = { runs: new Map(), tasks: new Map(), workers: new Map() };
  for (const [id, generation] of Object.entries(o.runs ?? {})) extras.runs.set(id, { generation });
  const tasks = (o.tasks ?? []).map((spec) => {
    extras.tasks.set(spec.id, { paneKey: spec.paneKey ?? null, generation: spec.generation ?? null });
    return task({
      id: spec.id,
      runId: spec.run ?? 'run-a',
      parentId: fact(spec.parent ?? null),
      status: fact(spec.status ?? null),
      createdAt: fact(spec.createdAt ?? null),
      completedAt: fact(spec.completedAt ?? null),
    });
  });
  const workers = (o.dispatches ?? []).map((spec) => {
    const state = spec.state ?? 'working';
    extras.workers.set(spec.id, { workerState: state, attention: spec.attention ?? [] });
    return worker({
      dispatchId: spec.id,
      taskId: spec.task,
      runId: spec.run ?? 'run-a',
      terminalHandle: null,
      worktreeId: fact(spec.worktree ?? 'wt-a'),
      state: fact(state),
    });
  });
  return { tasks, workers, extras };
}

/** タブのある作業者（worker を持つエージェント）。 */
export function tabbedWorker(
  id: string,
  dispatchId: string,
  taskId: string,
  patch: Partial<AgentState> = {},
): AgentState {
  return agent(id, { worker: { dispatchId, taskId, runId: 'run-a' }, ...patch });
}
