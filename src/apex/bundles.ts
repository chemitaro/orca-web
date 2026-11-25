// 束（Run の id と世代の task の集まり）と、頂点への結び（R-02、D-02）。純粋な関数。対応表 BundleOwners だけを読み書きする。
import type { AgentState, StateDocument, TaskState, WorkerState } from '../state/model.ts';
import type { OrchestrationExtras } from './extras.ts';
import type { UnlinkedReason } from './model.ts';
import { type BundleOwners, bundleKey } from './owners.ts';

/** 生きた辺で決めた置き場（iss-00076）。 */
export type Placement =
  | { kind: 'apex' }
  | { kind: 'member'; apexId: string; parentId: string; depth: number }
  | { kind: 'unlinked'; reason: UnlinkedReason };

/** 終わった workerState。大文字小文字を区別しない。知らない値は生きているとみなす。 */
const FINISHED_WORKER_STATES: ReadonlySet<string> = new Set([
  'succeeded',
  'failed',
  'stopped',
  'abandoned',
  'cancelled',
]);

export function isLiveDispatch(worker: WorkerState): boolean {
  const state = worker.state.value;
  return state === null || !FINISHED_WORKER_STATES.has(state.toLowerCase());
}

export interface Bundle {
  key: string;
  runId: string;
  generation: number | null;
  /** 状態の文書の並び。 */
  tasks: TaskState[];
  /** この束の task の Dispatch（worker-list の並び）。付け替えの前。 */
  dispatches: WorkerState[];
}

export interface UnlinkedBundle {
  key: string;
  runId: string;
  generation: number | null;
  /** この束に結んだ Dispatch（付け替えの後）。 */
  dispatches: WorkerState[];
}

export interface LinkedMember {
  agent: AgentState;
  parentId: string;
  depth: number;
}

export interface ApexLinks {
  /** 生きた辺のメンバーと、束で頂点に入れたエージェント。頂点の id ごと。 */
  members: Map<string, LinkedMember[]>;
  /** 頂点に数える Dispatch。メンバーのエージェントの Dispatch を含む。 */
  dispatches: Map<string, WorkerState[]>;
  /** 頂点が持つ束（終わった履歴を含む）。 */
  bundles: Map<string, Bundle[]>;
  /** 束で頂点のメンバーにした、生きた辺では結べなかったエージェント。 */
  promoted: Set<string>;
  unlinkedBundles: UnlinkedBundle[];
}

export interface LinkInput {
  state: StateDocument;
  agents: readonly AgentState[];
  placements: ReadonlyMap<string, Placement>;
  extras: OrchestrationExtras;
  owners: BundleOwners | null;
  now: number;
}

function collectBundles(state: StateDocument, extras: OrchestrationExtras) {
  const bundles = new Map<string, Bundle>();
  const keyOfTask = new Map<string, string>();
  for (const task of state.tasks) {
    if (task.runId === null) continue;
    const generation = extras.tasks.get(task.id)?.generation ?? null;
    const key = bundleKey(task.runId, generation);
    let bundle = bundles.get(key);
    if (!bundle) {
      bundle = { key, runId: task.runId, generation, tasks: [], dispatches: [] };
      bundles.set(key, bundle);
    }
    bundle.tasks.push(task);
    keyOfTask.set(task.id, key);
  }
  for (const worker of state.workers) {
    const key = worker.taskId === null ? undefined : keyOfTask.get(worker.taskId);
    if (key !== undefined) bundles.get(key)?.dispatches.push(worker);
  }
  return { bundles, keyOfTask };
}

/** task の親の段数（根は 0）。輪は途中で止める。 */
function taskDepth(taskId: string, tasks: ReadonlyMap<string, TaskState>): number {
  let depth = 0;
  const seen = new Set([taskId]);
  let current = tasks.get(taskId)?.parentId.value ?? null;
  while (current !== null && tasks.has(current) && !seen.has(current)) {
    seen.add(current);
    depth++;
    current = tasks.get(current)?.parentId.value ?? null;
  }
  return depth;
}

export function linkApexes(input: LinkInput): ApexLinks {
  const { state, agents, placements, extras, owners, now } = input;
  const { bundles, keyOfTask } = collectBundles(state, extras);
  const apexes = agents.filter((agent) => placements.get(agent.id)?.kind === 'apex');
  const apexIds = new Set(apexes.map((agent) => agent.id));

  // 束の持ち主。今わかる結び（作成者、生きた辺のメンバー）を、覚えたものより先に使う。
  const ownerOf = new Map<string, string>();
  const apexByPane = new Map<string, string>();
  for (const apex of apexes) if (apex.paneKey !== null) apexByPane.set(apex.paneKey, apex.id);
  for (const bundle of bundles.values()) {
    for (const task of bundle.tasks) {
      if (task.parentId.value !== null) continue;
      const pane = extras.tasks.get(task.id)?.paneKey ?? null;
      const apexId = pane === null ? undefined : apexByPane.get(pane);
      if (apexId !== undefined) {
        ownerOf.set(bundle.key, apexId);
        break;
      }
    }
  }
  const sortedAgents = [...agents].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const agent of sortedAgents) {
    const placement = placements.get(agent.id);
    if (placement?.kind !== 'member' || agent.worker?.taskId == null) continue;
    const key = keyOfTask.get(agent.worker.taskId);
    if (key !== undefined && !ownerOf.has(key)) ownerOf.set(key, placement.apexId);
  }
  if (owners) for (const [key, apexId] of ownerOf) owners.observe(key, apexId, now);
  const owner = (key: string): string | null => {
    const found = ownerOf.get(key) ?? owners?.resolve(key) ?? null;
    return found !== null && apexIds.has(found) ? found : null;
  };

  const members = new Map<string, LinkedMember[]>();
  const promoted = new Set<string>();
  const memberApex = new Map<string, string>();
  const push = <T>(map: Map<string, T[]>, key: string, value: T) => map.set(key, [...(map.get(key) ?? []), value]);
  for (const agent of agents) {
    const placement = placements.get(agent.id);
    if (placement?.kind !== 'member') continue;
    push(members, placement.apexId, { agent, parentId: placement.parentId, depth: placement.depth });
    memberApex.set(agent.id, placement.apexId);
  }

  // 親の見つからない worker 持ちのエージェントは、その task の束の頂点のメンバーにする（輪は除く）。
  const tasksById = new Map(state.tasks.map((task) => [task.id, task]));
  const agentOfDispatch = new Map<string, AgentState>();
  for (const agent of agents) if (agent.worker) agentOfDispatch.set(agent.worker.dispatchId, agent);
  const candidates = agents.filter((agent) => {
    const placement = placements.get(agent.id);
    return placement?.kind === 'unlinked' && placement.reason !== 'cycle' && agent.worker?.taskId != null;
  });
  const promotedApex = new Map<string, string>();
  for (const agent of candidates) {
    const key = keyOfTask.get(agent.worker?.taskId as string);
    const apexId = key === undefined ? null : owner(key);
    if (apexId !== null) {
      promotedApex.set(agent.id, apexId);
      memberApex.set(agent.id, apexId);
    }
  }
  for (const agent of candidates) {
    const apexId = promotedApex.get(agent.id);
    if (apexId === undefined) continue;
    const taskId = agent.worker?.taskId as string;
    const parentTask = tasksById.get(taskId)?.parentId.value ?? null;
    let parentId = apexId;
    if (parentTask !== null) {
      const last = state.workers.filter((worker) => worker.taskId === parentTask).at(-1);
      const parentAgent = last ? agentOfDispatch.get(last.dispatchId) : undefined;
      if (parentAgent && parentAgent.id !== agent.id && memberApex.get(parentAgent.id) === apexId) {
        parentId = parentAgent.id;
      }
    }
    push(members, apexId, { agent, parentId, depth: taskDepth(taskId, tasksById) + 1 });
    promoted.add(agent.id);
  }

  // Dispatch の結び。タブのあるエージェントの Dispatch は付け替えない。
  const dispatches = new Map<string, WorkerState[]>();
  const owned = new Map<string, Bundle[]>();
  const unlinked = new Map<string, UnlinkedBundle>();
  for (const bundle of bundles.values()) {
    const apexId = owner(bundle.key);
    if (apexId !== null) push(owned, apexId, bundle);
  }
  const toUnlinked = (key: string, runId: string, generation: number | null, worker: WorkerState) => {
    let entry = unlinked.get(key);
    if (!entry) {
      entry = { key, runId, generation, dispatches: [] };
      unlinked.set(key, entry);
    }
    entry.dispatches.push(worker);
  };
  for (const worker of state.workers) {
    const key = worker.taskId === null ? undefined : keyOfTask.get(worker.taskId);
    if (key === undefined) continue;
    const bundle = bundles.get(key) as Bundle;
    const tabbed = agentOfDispatch.get(worker.dispatchId);
    if (tabbed) {
      const apexId = memberApex.get(tabbed.id) ?? owner(key);
      if (apexId !== null) push(dispatches, apexId, worker);
      else toUnlinked(key, bundle.runId, bundle.generation, worker);
      continue;
    }
    let target = { key, generation: bundle.generation };
    const current = extras.runs.get(bundle.runId)?.generation ?? null;
    if (isLiveDispatch(worker) && current !== null && bundle.generation !== current) {
      target = { key: bundleKey(bundle.runId, current), generation: current };
    }
    const apexId = owner(target.key);
    if (apexId !== null) push(dispatches, apexId, worker);
    else toUnlinked(target.key, bundle.runId, target.generation, worker);
  }

  return { members, dispatches, bundles: owned, promoted, unlinkedBundles: [...unlinked.values()] };
}
