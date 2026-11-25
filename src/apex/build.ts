import { type AgentMark, agentMark, agentWorkingMode, findIssue } from '../inbox/classify.ts';
import type { AgentState, StateDocument, WorkerState } from '../state/model.ts';
import { isLiveDispatch, type LinkedMember, linkApexes, type Placement } from './bundles.ts';
import { emptyExtras } from './extras.ts';
import type {
  ApexGroup,
  ApexItem,
  ApexListDocument,
  ApexMember,
  ApexProject,
  ApexReason,
  ApexStatus,
  BuildApexListInput,
  UnlinkedItem,
} from './model.ts';
import { APEXES_SCHEMA } from './model.ts';

/** メンバーの許可待ち・入力待ちを対応が必要にするまでの猶予。自動の承認で一瞬だけ出る表示を拾わない。 */
export const MEMBER_GRACE_MS = 20_000;
const RECENT_MS = 24 * 3_600_000;
const SLEEP_MS = 7 * 24 * 3_600_000;

const OBJECTIVE_MAX = 200;

/** 未回答の ask（input）か未解決の gate（approval）。 */
function asksOrGates(worker: { attention: readonly string[] } | undefined): boolean {
  return worker !== undefined && (worker.attention.includes('input') || worker.attention.includes('approval'));
}

const GROUPS: readonly ApexGroup[] = ['needs_action', 'working', 'done_recent', 'done_older', 'sleeping'];
const REASONS: readonly ApexReason[] = [
  'apex_blocked',
  'apex_waiting',
  'member_blocked',
  'member_waiting',
  'working',
  'monitoring',
  'members_working',
  'member_grace',
  'done',
  'sleeping',
];

/** 親は「parentPaneKey に一致する、自分でない今あるエージェントがちょうど1つ」のときだけ。 */
function parents(agents: readonly AgentState[]): Map<string, AgentState | null> {
  const byPane = new Map<string, AgentState[]>();
  for (const agent of agents) {
    if (agent.paneKey === null) continue;
    byPane.set(agent.paneKey, [...(byPane.get(agent.paneKey) ?? []), agent]);
  }
  const result = new Map<string, AgentState | null>();
  for (const agent of agents) {
    const key = agent.parentPaneKey.value;
    if (key === null) continue;
    const found = byPane.get(key) ?? [];
    const parent = found.length === 1 && found[0]?.id !== agent.id ? (found[0] ?? null) : null;
    result.set(agent.id, parent);
  }
  return result;
}

function place(agents: readonly AgentState[]): Map<string, Placement> {
  const parentOf = parents(agents);
  const placements = new Map<string, Placement>();
  for (const agent of agents) {
    // 自分から根へ。途中で同じエージェントに戻れば輪。
    const path: AgentState[] = [agent];
    const seen = new Set([agent.id]);
    let root: Placement | null = null;
    for (;;) {
      const current = path[path.length - 1] as AgentState;
      if (!parentOf.has(current.id)) {
        root = current.worker === null ? { kind: 'apex' } : { kind: 'unlinked', reason: 'worker_without_parent' };
        break;
      }
      const parent = parentOf.get(current.id) ?? null;
      if (parent === null) {
        root = { kind: 'unlinked', reason: 'parent_missing' };
        break;
      }
      if (seen.has(parent.id)) {
        root = { kind: 'unlinked', reason: 'cycle' };
        break;
      }
      seen.add(parent.id);
      path.push(parent);
    }
    if (root.kind === 'unlinked') {
      placements.set(agent.id, root);
    } else if (path.length === 1) {
      placements.set(agent.id, root);
    } else {
      const apex = path[path.length - 1] as AgentState;
      const parent = path[1] as AgentState;
      placements.set(agent.id, { kind: 'member', apexId: apex.id, parentId: parent.id, depth: path.length - 1 });
    }
  }
  return placements;
}

function location(state: StateDocument, worktreeId: string) {
  const worktree = state.worktrees.find((entry) => entry.id === worktreeId);
  const repo = state.repos.find((entry) => entry.id === worktree?.repoId);
  const project: ApexProject | null =
    repo?.displayName.value != null ? { id: repo.id, name: repo.displayName.value } : null;
  return {
    worktree,
    repoId: worktree?.repoId ?? null,
    project,
    issue: findIssue([worktree?.branch.value, worktree?.displayName.value]),
  };
}

function time(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** 端末のタブのメンバーは attached のものだけが待ちを示す。構造化 Chat とタブのない行は terminal を問わない。 */
function memberWaits(agent: AgentState): boolean {
  const mark = agentMark(agent);
  if (mark !== 'blocked' && mark !== 'waiting') return false;
  return agent.kind !== 'terminal-tab' || agent.terminal.value === 'attached';
}

function inGrace(agent: AgentState, now: number): boolean {
  const started = time(agent.stateStartedAt.value);
  return started !== null && now - started < MEMBER_GRACE_MS;
}

function judge(apex: AgentState, members: readonly AgentState[], now: number) {
  const mark = agentMark(apex);
  const found = new Set<ApexReason>();
  if (mark === 'blocked') found.add('apex_blocked');
  if (mark === 'waiting') found.add('apex_waiting');
  for (const member of members) {
    if (!memberWaits(member)) continue;
    if (inGrace(member, now)) found.add('member_grace');
    else found.add(agentMark(member) === 'blocked' ? 'member_blocked' : 'member_waiting');
  }
  if (mark === 'working') found.add(agentWorkingMode(apex) === 'monitoring' ? 'monitoring' : 'working');
  else if (members.some((member) => agentMark(member) === 'working')) found.add('members_working');
  let status: ApexStatus;
  if (['apex_blocked', 'apex_waiting', 'member_blocked', 'member_waiting'].some((r) => found.has(r as ApexReason))) {
    status = 'needs_action';
  } else if (['working', 'monitoring', 'members_working', 'member_grace'].some((r) => found.has(r as ApexReason))) {
    status = 'working';
  } else if (mark === 'unknown') {
    status = 'working';
  } else {
    status = 'done';
    found.add(mark === 'sleeping' ? 'sleeping' : 'done');
  }
  return {
    mark,
    status,
    reasons: REASONS.filter((reason) => found.has(reason)),
    tags: mark === 'unknown' ? (['unverified'] as const) : ([] as const),
  };
}

function lastActivity(apex: AgentState, members: readonly AgentState[], state: StateDocument): string | null {
  let best: string | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const agent of [apex, ...members]) {
    const parsed = time(agent.stateStartedAt.value);
    if (parsed !== null && parsed > bestTime) {
      best = agent.stateStartedAt.value;
      bestTime = parsed;
    }
  }
  if (best !== null) return best;
  return state.worktrees.find((entry) => entry.id === apex.worktreeId)?.lastActivityAt.value ?? null;
}

function groupOf(
  apex: AgentState,
  judged: { status: ApexStatus; reasons: readonly ApexReason[] },
  last: string | null,
  now: number,
): ApexGroup {
  if (judged.status === 'needs_action') return 'needs_action';
  const quiet = judged.status === 'done' || judged.reasons.length === 0;
  const at = time(last);
  if (quiet) {
    if (apex.terminal.value === 'awaiting-restore') return 'sleeping';
    if (at !== null && judged.status === 'done' && at < now - SLEEP_MS) return 'sleeping';
    if (at !== null && judged.status === 'working' && at < now - RECENT_MS) return 'sleeping';
  }
  if (judged.status === 'working') return 'working';
  return at !== null && at < now - RECENT_MS ? 'done_older' : 'done_recent';
}

function memberEntry({ agent, parentId, depth }: LinkedMember): ApexMember {
  return {
    id: agent.id,
    parentId,
    depth,
    mark: agentMark(agent),
    agentType: agent.agentType.value,
    title: agent.title.value,
    worktreeId: agent.worktreeId,
    stateStartedAt: agent.stateStartedAt.value,
  };
}

/** 頂点から深さ優先で、兄弟は id の順。 */
function orderMembers(apexId: string, members: readonly ApexMember[]): ApexMember[] {
  const children = new Map<string, ApexMember[]>();
  for (const member of members) children.set(member.parentId, [...(children.get(member.parentId) ?? []), member]);
  const result: ApexMember[] = [];
  const visit = (id: string) => {
    for (const member of [...(children.get(id) ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      result.push(member);
      visit(member.id);
    }
  };
  visit(apexId);
  return result;
}

function compareItems(a: ApexItem, b: ApexItem): number {
  const group = GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group);
  if (group !== 0) return group;
  const at = time(a.lastActivityAt);
  const bt = time(b.lastActivityAt);
  if (at === null && bt !== null) return 1;
  if (at !== null && bt === null) return -1;
  if (at !== null && bt !== null && at !== bt) return bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** メンバーの印と、メンバーと重ならない束の Dispatch（生きていれば working、終わっていれば done）を数える。 */
function countTeam(team: readonly LinkedMember[], dispatches: readonly WorkerState[]): ApexItem['counts'] {
  const covered = new Set(team.map(({ agent }) => agent.worker?.dispatchId).filter((id) => id !== undefined));
  const marks: AgentMark[] = team.map(({ agent }) => agentMark(agent));
  const seen = new Set<string>();
  for (const worker of dispatches) {
    if (covered.has(worker.dispatchId) || seen.has(worker.dispatchId)) continue;
    seen.add(worker.dispatchId);
    marks.push(isLiveDispatch(worker) ? 'working' : 'done');
  }
  return countMarks(marks);
}

function countMarks(marks: readonly AgentMark[]): ApexItem['counts'] {
  return {
    total: marks.length,
    working: marks.filter((mark) => mark === 'working').length,
    waiting: marks.filter((mark) => mark === 'blocked' || mark === 'waiting').length,
    done: marks.filter((mark) => mark === 'done' || mark === 'sleeping').length,
  };
}

export function buildApexList(input: BuildApexListInput): ApexListDocument {
  const { state, now } = input;
  const stale = state.stale || state.connection.state !== 'connected';
  const agents = state.connection.state === 'starting' ? [] : state.agents;
  const placements = place(agents);
  const links = linkApexes({
    state,
    agents,
    placements,
    extras: input.extras ?? emptyExtras(),
    owners: input.owners ?? null,
    now,
  });
  const inProject = (repoId: string | null) => input.project === null || repoId === input.project;
  const items: ApexItem[] = [];
  const unlinked: UnlinkedItem[] = [];
  for (const agent of agents) {
    const placement = placements.get(agent.id);
    const where = location(state, agent.worktreeId);
    if (!inProject(where.repoId)) continue;
    if (placement?.kind === 'unlinked' && !links.promoted.has(agent.id)) {
      unlinked.push({
        id: agent.id,
        kind: agent.kind,
        agentType: agent.agentType.value,
        title: agent.title.value ?? where.worktree?.displayName.value ?? null,
        worktreeId: agent.worktreeId,
        project: where.project,
        issue: where.issue,
        mark: agentMark(agent),
        reason: placement.reason,
      });
      continue;
    }
    if (placement?.kind !== 'apex') continue;
    const team = links.members.get(agent.id) ?? [];
    const memberAgents = team.map((member) => member.agent);
    const judged = judge(agent, memberAgents, now);
    const last = lastActivity(agent, memberAgents, state);
    items.push({
      id: agent.id,
      kind: agent.kind,
      agentType: agent.agentType.value,
      title: agent.title.value ?? where.worktree?.displayName.value ?? null,
      worktreeId: agent.worktreeId,
      worktreeName: where.worktree?.displayName.value ?? null,
      project: where.project,
      issue: where.issue,
      mark: judged.mark,
      status: judged.status,
      group: groupOf(agent, judged, last, now),
      reasons: judged.reasons,
      tags: [...judged.tags],
      lastActivityAt: last,
      stateStartedAt: agent.stateStartedAt.value,
      members: orderMembers(agent.id, team.map(memberEntry)),
      counts: countTeam(team, links.dispatches.get(agent.id) ?? []),
    });
  }
  items.sort(compareItems);
  const extras = input.extras ?? emptyExtras();
  for (const bundle of links.unlinkedBundles) {
    const live = bundle.dispatches.filter(isLiveDispatch).length;
    const questions = bundle.dispatches.filter((worker) => asksOrGates(extras.workers.get(worker.dispatchId))).length;
    if (live === 0 && questions === 0) continue;
    if (input.project !== null) {
      const repos = bundle.dispatches.map((worker) => location(state, worker.worktreeId.value ?? '').repoId);
      if (!repos.includes(input.project)) continue;
    }
    const objective = state.runs.find((run) => run.id === bundle.runId)?.title.value ?? null;
    unlinked.push({
      id: bundle.key,
      kind: 'bundle',
      runId: bundle.runId,
      objective: objective === null ? null : objective.slice(0, OBJECTIVE_MAX),
      generation: bundle.generation,
      live,
      questions,
    });
  }
  return {
    schema: APEXES_SCHEMA,
    generatedAt: new Date(now).toISOString(),
    stale,
    connection: { ...state.connection },
    project: input.project,
    counts: {
      needs_action: items.filter((item) => item.status === 'needs_action').length,
      working: items.filter((item) => item.status === 'working').length,
      done: items.filter((item) => item.status === 'done').length,
    },
    items,
    unlinked,
  };
}
