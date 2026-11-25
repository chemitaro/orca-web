// 頂点ごとのチームの節（R-01、D-01）。生きた辺と束のメンバーのエージェントと、束の Dispatch を重ねずに木にする。純粋な関数。
import { agentMark } from '../inbox/classify.ts';
import type { AgentState, TaskState, WorkerState } from '../state/model.ts';
import { isLiveDispatch, type LinkedMember } from './bundles.ts';
import type { ApexTeamNode, ApexTeamStatus } from './model.ts';

const TITLE_MAX = 200;

export interface TeamInput {
  apexId: string;
  /** 頂点のメンバー（生きた辺と束で結んだエージェント）。 */
  members: readonly LinkedMember[];
  /** 束で頂点のメンバーにした（生きた辺で結べなかった）エージェントの id。親は task の親の Dispatch の節で決める。 */
  promoted: ReadonlySet<string>;
  /** 頂点に結んだ Dispatch（worker-list の並び）。 */
  dispatches: readonly WorkerState[];
  /** 状態の文書の worker-list（親の task の最後の Dispatch を探す）。 */
  workers: readonly WorkerState[];
  tasks: ReadonlyMap<string, TaskState>;
}

function agentStatus(agent: AgentState): ApexTeamStatus {
  switch (agentMark(agent)) {
    case 'working':
      return 'working';
    case 'blocked':
    case 'waiting':
      return 'waiting';
    case 'done':
    case 'sleeping':
      return 'done';
    default:
      return 'unknown';
  }
}

function dispatchStatus(worker: WorkerState): ApexTeamStatus {
  if (isLiveDispatch(worker)) return 'live';
  return worker.state.value?.toLowerCase() === 'failed' ? 'failed' : 'done';
}

const clip = (value: string | null | undefined): string | null => (value == null ? null : value.slice(0, TITLE_MAX));

function time(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

interface Draft {
  node: ApexTeamNode;
  /** 親の候補の鍵（エージェントの parentId か、親の task の最後の Dispatch の節）。決める前の値。 */
  parent: string | null;
  /** 同じ createdAt のときの並び（worker-list の並び、Dispatch のないエージェントは後ろ）。 */
  order: number;
}

export function buildTeam(input: TeamInput): ApexTeamNode[] {
  const { apexId, members, promoted, dispatches, workers, tasks } = input;
  const workerIndex = new Map(workers.map((worker, index) => [worker.dispatchId, index]));
  const agentKeyOfDispatch = new Map<string, string>();
  const drafts = new Map<string, Draft>();

  for (const [index, { agent, parentId }] of members.entries()) {
    const key = `agent:${agent.id}`;
    const dispatchId = agent.worker?.dispatchId ?? null;
    const task = agent.worker?.taskId == null ? undefined : tasks.get(agent.worker.taskId);
    if (dispatchId !== null) agentKeyOfDispatch.set(dispatchId, key);
    drafts.set(key, {
      node: {
        key,
        kind: 'agent',
        agentId: agent.id,
        dispatchId,
        parentKey: null,
        depth: 0,
        title: clip(task?.title.value ?? agent.title.value),
        status: agentStatus(agent),
        createdAt: task?.createdAt.value ?? agent.sessionStartedAt.value ?? agent.stateStartedAt.value,
        completedAt: dispatchId === null ? null : (task?.completedAt.value ?? null),
        stateStartedAt: agent.stateStartedAt.value,
      },
      parent: promoted.has(agent.id) ? null : parentId === apexId ? null : `agent:${parentId}`,
      order: dispatchId === null ? workers.length + index : (workerIndex.get(dispatchId) ?? workers.length + index),
    });
  }

  const keyOfDispatch = (dispatchId: string) => agentKeyOfDispatch.get(dispatchId) ?? `dispatch:${dispatchId}`;
  const parentOfTask = (taskId: string | null): string | null => {
    const parentTask = taskId === null ? null : (tasks.get(taskId)?.parentId.value ?? null);
    if (parentTask === null) return null;
    const last = workers.filter((worker) => worker.taskId === parentTask).at(-1);
    return last === undefined ? null : keyOfDispatch(last.dispatchId);
  };

  // 束で昇格したエージェントは Dispatch と同じ規則：task の parent_id の task の最後の Dispatch の節、なければ頂点の直下。
  for (const { agent } of members) {
    if (!promoted.has(agent.id)) continue;
    const draft = drafts.get(`agent:${agent.id}`);
    if (draft) draft.parent = parentOfTask(agent.worker?.taskId ?? null);
  }

  for (const worker of dispatches) {
    if (agentKeyOfDispatch.has(worker.dispatchId)) continue;
    const key = `dispatch:${worker.dispatchId}`;
    if (drafts.has(key)) continue;
    const task = worker.taskId === null ? undefined : tasks.get(worker.taskId);
    drafts.set(key, {
      node: {
        key,
        kind: 'dispatch',
        agentId: null,
        dispatchId: worker.dispatchId,
        parentKey: null,
        depth: 0,
        title: clip(task?.title.value),
        status: dispatchStatus(worker),
        createdAt: task?.createdAt.value ?? null,
        completedAt: task?.completedAt.value ?? null,
        stateStartedAt: null,
      },
      parent: parentOfTask(worker.taskId),
      order: workerIndex.get(worker.dispatchId) ?? workers.length,
    });
  }

  // 親がチームにない、自分自身、または輪になるものは頂点の直下。
  for (const draft of drafts.values()) {
    const parent = draft.parent;
    if (parent === null || parent === draft.node.key || !drafts.has(parent)) continue;
    const seen = new Set([draft.node.key]);
    let current: string | null = parent;
    let cycle = false;
    while (current !== null) {
      if (seen.has(current)) {
        cycle = true;
        break;
      }
      seen.add(current);
      const next: Draft | undefined = drafts.get(current);
      current = next === undefined || next.parent === null || !drafts.has(next.parent) ? null : next.parent;
    }
    if (!cycle) draft.node.parentKey = parent;
  }

  const children = new Map<string | null, Draft[]>();
  for (const draft of drafts.values()) {
    const list = children.get(draft.node.parentKey) ?? [];
    list.push(draft);
    children.set(draft.node.parentKey, list);
  }
  const compare = (a: Draft, b: Draft) => {
    const at = time(a.node.createdAt);
    const bt = time(b.node.createdAt);
    if (at !== null && bt !== null && at !== bt) return at - bt;
    if (at === null && bt !== null) return 1;
    if (at !== null && bt === null) return -1;
    return a.order - b.order;
  };
  const result: ApexTeamNode[] = [];
  const visit = (key: string | null, depth: number) => {
    for (const draft of [...(children.get(key) ?? [])].sort(compare)) {
      draft.node.depth = depth;
      result.push(draft.node);
      visit(draft.node.key, depth + 1);
    }
  };
  visit(null, 1);
  return result;
}
