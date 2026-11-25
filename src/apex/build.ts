import { type AgentMark, agentMark, agentWorkingMode, findIssue } from '../inbox/classify.ts';
import type { AgentState, StateDocument, WorkerState } from '../state/model.ts';
import { type Bundle, isLiveDispatch, type LinkedMember, linkApexes, type Placement } from './bundles.ts';
import { emptyExtras, type OrchestrationExtras } from './extras.ts';
import type {
  ApexBadge,
  ApexGroup,
  ApexItem,
  ApexListDocument,
  ApexMember,
  ApexProject,
  ApexQuestion,
  ApexReason,
  ApexStatus,
  ApexWaitingMember,
  BuildApexListInput,
  UnlinkedItem,
} from './model.ts';
import { APEXES_SCHEMA } from './model.ts';
import { type BundleOwners, SETTLED_TASK_STATES } from './owners.ts';
import { buildTeam } from './team.ts';

/** メンバーの許可待ち・入力待ちを対応が必要にするまでの猶予。自動の承認で一瞬だけ出る表示を拾わない。 */
export const MEMBER_GRACE_MS = 20_000;
const RECENT_MS = 24 * 3_600_000;
const SLEEP_MS = 7 * 24 * 3_600_000;
/** 問い・止まった仕事・新しい失敗を対応が必要にするまでの猶予 G（R-03）。時刻はデータの値から測る。 */
export const APEX_GRACE_MS = 90_000;

const OBJECTIVE_MAX = 200;

/** 未回答の ask（input）か未解決の gate（approval）。 */
function asksOrGates(worker: { attention: readonly string[] } | undefined): boolean {
  return worker !== undefined && (worker.attention.includes('input') || worker.attention.includes('approval'));
}

const GROUPS: readonly ApexGroup[] = ['needs_action', 'working', 'done_recent', 'done_older', 'sleeping', 'unknown'];
const REASONS: readonly ApexReason[] = [
  'apex_blocked',
  'apex_waiting',
  'member_blocked',
  'member_waiting',
  'question',
  'decision',
  'question_working',
  'stalled',
  'apex_closed',
  'failed',
  'working',
  'monitoring',
  'members_working',
  'live_work',
  'member_grace',
  'grace',
  'done',
  'sleeping',
];
const NEEDS_ACTION: ReadonlySet<ApexReason> = new Set([
  'apex_blocked',
  'apex_waiting',
  'member_blocked',
  'member_waiting',
  'question',
  'decision',
  'stalled',
  'apex_closed',
  'failed',
]);
const WORKING: ReadonlySet<ApexReason> = new Set([
  'working',
  'monitoring',
  'members_working',
  'live_work',
  'member_grace',
  'grace',
]);
/** 鮮度が偽の間は memo から引き継ぐ理由（A3〜A6）。 */
const FRESH_ONLY: ReadonlySet<ApexReason> = new Set([
  'question',
  'decision',
  'question_working',
  'stalled',
  'apex_closed',
  'failed',
]);

/** 作業者が作業を続けている（`projection.stage.activity` が working）。読めない・知らない値は続けていないとみなす（iss-00091 F-01）。 */
function keepsWorking(worker: { activity: string | null } | undefined): boolean {
  return worker?.activity === 'working';
}

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

/** 頂点に結んだ Dispatch と束。判定 A3〜A6 の材料。 */
interface Work {
  dispatches: readonly WorkerState[];
  bundles: readonly Bundle[];
  extras: OrchestrationExtras;
  /** 鮮度 F：tasks と workers の取得元がどちらも stale でない。 */
  fresh: boolean;
  /** 鮮度が偽の間に使う、最後の鮮度が真の判定の A3〜A6 の理由。 */
  remembered: readonly ApexReason[];
  tasks: ReadonlyMap<string, StateDocument['tasks'][number]>;
}

const moving = (agent: AgentState) => agentMark(agent) === 'working';
const maxTime = (values: readonly (string | null)[]): number | null => {
  const times = values.map(time).filter((value): value is number => value !== null);
  return times.length === 0 ? null : Math.max(...times);
};

/** A3〜A6（R-03）。found に理由を足す。 */
function judgeWork(apex: AgentState, members: readonly AgentState[], work: Work, now: number, found: Set<ApexReason>) {
  const live = work.dispatches.filter(isLiveDispatch);
  if (live.length > 0) found.add('live_work');
  const asks = work.dispatches.filter((worker) =>
    work.extras.workers.get(worker.dispatchId)?.attention.includes('input'),
  );
  const gates = work.dispatches.filter((worker) =>
    work.extras.workers.get(worker.dispatchId)?.attention.includes('approval'),
  );
  if (!work.fresh) {
    for (const reason of work.remembered) found.add(reason);
    return;
  }
  const apexStart = apex.stateStartedAt.value;
  const apexMoving = moving(apex);
  const hit = (origin: number | null, reason: ApexReason) => {
    if (origin !== null && now - origin < APEX_GRACE_MS) found.add('grace');
    else found.add(reason);
  };
  // A3 問い：ask は頂点が動いていない、gate は頂点が monitoring を除く working でない。
  // 作業を続けている作業者の問いは材料にせず、question_working で示す（iss-00091。A4・A5 は元の asks・gates のまま）。
  const continuing = (worker: WorkerState) => keepsWorking(work.extras.workers.get(worker.dispatchId));
  if ([...asks, ...gates].some(continuing)) found.add('question_working');
  const busy = apexMoving && agentWorkingMode(apex) !== 'monitoring';
  for (const [list, reason, blocked] of [
    [asks.filter((worker) => !continuing(worker)), 'question', apexMoving],
    [gates.filter((worker) => !continuing(worker)), 'decision', busy],
  ] as const) {
    if (blocked) continue;
    for (const worker of list) {
      const created = worker.taskId === null ? null : (work.tasks.get(worker.taskId)?.createdAt.value ?? null);
      hit(maxTime([apexStart, created]), reason);
    }
  }
  // A4 止まった仕事：誰も動いていない。起点が読めなければ当てない。問いを待つ Dispatch は A3 が扱うので数えない。
  const waitsOnUs = new Set([...asks, ...gates].map((worker) => worker.dispatchId));
  const unattended = live.filter((worker) => !waitsOnUs.has(worker.dispatchId));
  if (unattended.length > 0 && !apexMoving && !members.some(moving)) {
    const origin = maxTime([apexStart, ...members.map((member) => member.stateStartedAt.value)]);
    if (origin !== null) hit(origin, 'stalled');
  }
  // A5 統括のタブ：端末のタブで、attached でない（復元待ちを含む）。
  const terminal = apex.terminal.value;
  if (apex.kind === 'terminal-tab' && terminal !== null && terminal !== 'attached') {
    if (live.length > 0 || asks.length > 0 || gates.length > 0) found.add('apex_closed');
  }
  // A6 新しい失敗：task ごとに最後の Dispatch が failed で、頂点の状態が始まった後に終わった。
  // Run の今の世代でなく生きた Dispatch もない古い世代の束は、終わった履歴なので見ない（R-04。札には使う）。
  const started = time(apexStart);
  if (started !== null && !apexMoving) {
    for (const bundle of work.bundles) {
      const current = work.extras.runs.get(bundle.runId)?.generation ?? null;
      if (current !== null && bundle.generation !== current && !bundle.dispatches.some(isLiveDispatch)) continue;
      for (const { task } of lastFailed(bundle)) {
        const completed = time(task.completedAt.value);
        if (completed === null || completed <= started) continue;
        hit(completed, 'failed');
      }
    }
  }
}

/** task ごとに最後の Dispatch（worker-list の並び）が failed のもの。再実行で直った task の古い失敗は含まない。 */
function lastFailed(bundle: Bundle): { task: Bundle['tasks'][number]; worker: WorkerState }[] {
  const result: { task: Bundle['tasks'][number]; worker: WorkerState }[] = [];
  for (const task of bundle.tasks) {
    const last = bundle.dispatches.filter((worker) => worker.taskId === task.id).at(-1);
    if (last?.state.value?.toLowerCase() === 'failed') result.push({ task, worker: last });
  }
  return result;
}

/** 猶予の外で待ちを示すメンバー。理由 member_blocked・member_waiting と同じ判定（judge と共有）。 */
function waitingMember(member: AgentState, now: number): boolean {
  return memberWaits(member) && !inGrace(member, now);
}

function waitingMembersOf(members: readonly ApexMember[], agents: ReadonlyMap<string, AgentState>, now: number) {
  const result: ApexWaitingMember[] = [];
  for (const member of members) {
    const agent = agents.get(member.id);
    if (agent && waitingMember(agent, now)) result.push({ id: member.id, title: member.title, mark: member.mark });
  }
  return result;
}

/** 束の Dispatch の問い。同じ Dispatch と種類は1回。 */
function questionsOf(
  dispatches: readonly WorkerState[],
  extras: OrchestrationExtras,
  tasks: ReadonlyMap<string, StateDocument['tasks'][number]>,
): ApexQuestion[] {
  const result: ApexQuestion[] = [];
  const seen = new Set<string>();
  for (const [category, kind] of [
    ['input', 'ask'],
    ['approval', 'gate'],
  ] as const) {
    for (const worker of dispatches) {
      const key = `${kind}:${worker.dispatchId}`;
      const extra = extras.workers.get(worker.dispatchId);
      if (seen.has(key) || !extra?.attention.includes(category)) continue;
      seen.add(key);
      const title = worker.taskId === null ? null : (tasks.get(worker.taskId)?.title.value ?? null);
      result.push({
        dispatchId: worker.dispatchId,
        taskTitle: title === null ? null : title.slice(0, OBJECTIVE_MAX),
        kind,
        working: keepsWorking(extra),
      });
    }
  }
  return result;
}

/**
 * 頂点のプロセスがないと新しい取得元で分かる（iss-00095 D-01）。構造化 Chat は ps の行と対応しない（paneKey が null）、
 * 端末のタブは terminal が null でも attached でもない。取得元が古い・読めていない・untabbed は偽（判定できない）。
 */
export function processAbsent(apex: AgentState, sources: StateDocument['sources']): boolean {
  if (apex.kind === 'chat-tab') {
    const ps = sources.worktreePs;
    return apex.paneKey === null && ps.lastSuccessAt !== null && !ps.stale;
  }
  if (apex.kind === 'terminal-tab') {
    const terminal = apex.terminal.value;
    return terminal !== null && terminal !== 'attached' && !sources.tabs.stale;
  }
  return false;
}

function judge(
  apex: AgentState,
  members: readonly AgentState[],
  work: Work,
  now: number,
  sources: StateDocument['sources'],
) {
  const mark = agentMark(apex);
  const found = new Set<ApexReason>();
  if (mark === 'blocked') found.add('apex_blocked');
  if (mark === 'waiting') found.add('apex_waiting');
  for (const member of members) {
    if (!memberWaits(member)) continue;
    if (!waitingMember(member, now)) found.add('member_grace');
    else found.add(agentMark(member) === 'blocked' ? 'member_blocked' : 'member_waiting');
  }
  if (mark === 'working') found.add(agentWorkingMode(apex) === 'monitoring' ? 'monitoring' : 'working');
  else if (members.some((member) => agentMark(member) === 'working')) found.add('members_working');
  judgeWork(apex, members, work, now, found);
  let status: ApexStatus;
  let asleep = false;
  if ([...found].some((reason) => NEEDS_ACTION.has(reason))) {
    status = 'needs_action';
  } else if ([...found].some((reason) => WORKING.has(reason))) {
    status = 'working';
  } else if (mark === 'unknown' && processAbsent(apex, sources)) {
    status = 'done';
    asleep = true;
    found.add('sleeping');
  } else if (mark === 'unknown') {
    status = 'working';
  } else {
    status = 'done';
    found.add(mark === 'sleeping' ? 'sleeping' : 'done');
  }
  const reasons = REASONS.filter((reason) => found.has(reason));
  return {
    mark,
    status,
    reasons,
    fresh: reasons.filter((reason) => FRESH_ONLY.has(reason)),
    /** 生きた仕事か問いがある。眠っているにしない。 */
    active: found.has('live_work') || found.has('question') || found.has('decision') || found.has('grace'),
    /** プロセスのない unknown の頂点。段は眠っている。 */
    asleep,
    tags: mark === 'unknown' && !asleep ? (['unverified'] as const) : ([] as const),
  };
}

/** 完了の頂点の札（R-05）。PR と CI は頂点とメンバーの worktree から（同じ worktree は1回）。 */
function badgesOf(
  apex: AgentState,
  members: readonly AgentState[],
  bundles: readonly Bundle[],
  state: StateDocument,
): ApexBadge[] {
  let merge = 0;
  let ciFailed = 0;
  for (const worktreeId of new Set([apex, ...members].map((agent) => agent.worktreeId))) {
    const worktree = state.worktrees.find((entry) => entry.id === worktreeId);
    if (worktree?.pr.value?.state?.toLowerCase() !== 'open') continue;
    const ci = worktree.ci.value?.status?.toLowerCase() ?? null;
    if (ci === 'failure') ciFailed++;
    else if (ci === null || ci === 'success') merge++;
  }
  const failed = bundles.flatMap(lastFailed).map(({ worker }) => worker);
  const remaining = bundles
    .flatMap((bundle) => bundle.tasks)
    .filter((task) => task.status.value === null || !SETTLED_TASK_STATES.has(task.status.value));
  const badges: ApexBadge[] = [
    { kind: 'merge_pending', count: merge },
    { kind: 'ci_failed', count: ciFailed },
    { kind: 'failed_members', count: new Set(failed.map((w) => w.dispatchId)).size },
    { kind: 'remaining_tasks', count: remaining.length },
  ];
  return badges.filter((badge) => badge.count > 0);
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
  judged: {
    status: ApexStatus;
    reasons: readonly ApexReason[];
    active: boolean;
    asleep: boolean;
    tags: readonly string[];
  },
  last: string | null,
  now: number,
): ApexGroup {
  if (judged.status === 'needs_action') return 'needs_action';
  if (judged.asleep) return 'sleeping';
  const quiet = !judged.active && (judged.status === 'done' || judged.reasons.length === 0);
  const at = time(last);
  if (quiet) {
    if (apex.terminal.value === 'awaiting-restore') return 'sleeping';
    if (at !== null && judged.status === 'done' && at < now - SLEEP_MS) return 'sleeping';
  }
  // 静かな unknown（理由がなく札 unverified）は不明の段。時間で眠っているに移さない（iss-00095 D-02）。
  if (judged.status === 'working' && judged.reasons.length === 0 && judged.tags.includes('unverified'))
    return 'unknown';
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

/** 束の頂点を探す入力。頂点の一覧と同じ内部の値と対応表。 */
export interface BundleApexInput {
  state: StateDocument;
  extras: OrchestrationExtras;
  owners: BundleOwners | null;
  now: number;
}

/**
 * Run の id → その Run の今の世代（`consumerGeneration`）の束の持ち主の頂点（iss-00082 D-03）。
 * 結び方は頂点の一覧と同じ（`place` と `linkApexes`）。今の世代が読めないときだけ、最も新しい世代の束の頂点を使う。
 * 今の世代の束に持ち主がなければ、古い世代の頂点には結ばない。
 */
export function bundleApexes(input: BundleApexInput): Map<string, AgentState> {
  const { state, extras, now } = input;
  const agents = state.connection.state === 'starting' ? [] : state.agents;
  const links = linkApexes({ state, agents, placements: place(agents), extras, owners: input.owners, now });
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const owned = new Map<string, { generation: number | null; apex: AgentState }[]>();
  for (const [apexId, bundles] of links.bundles) {
    const apex = byId.get(apexId);
    if (!apex) continue;
    for (const bundle of bundles) {
      owned.set(bundle.runId, [...(owned.get(bundle.runId) ?? []), { generation: bundle.generation, apex }]);
    }
  }
  const result = new Map<string, AgentState>();
  for (const [runId, entries] of owned) {
    const current = extras.runs.get(runId)?.generation ?? null;
    const found =
      current !== null
        ? entries.find((entry) => entry.generation === current)
        : entries.reduce<(typeof entries)[number] | undefined>(
            (best, entry) =>
              best === undefined ||
              (entry.generation ?? Number.NEGATIVE_INFINITY) > (best.generation ?? Number.NEGATIVE_INFINITY)
                ? entry
                : best,
            undefined,
          );
    if (found) result.set(runId, found.apex);
  }
  return result;
}

export function buildApexList(input: BuildApexListInput): ApexListDocument {
  const { state, now } = input;
  const stale = state.stale || state.connection.state !== 'connected';
  const agents = state.connection.state === 'starting' ? [] : state.agents;
  const placements = place(agents);
  const extras = input.extras ?? emptyExtras();
  const links = linkApexes({ state, agents, placements, extras, owners: input.owners ?? null, now });
  const fresh = !state.sources.tasks.stale && !state.sources.workers.stale;
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));
  // 判定はいつも全部の頂点について行う。project は出す文書を絞るだけ（memo の上書きにも使わない）。
  const verdicts = new Map<string, ReturnType<typeof judge>>();
  for (const agent of agents) {
    if (placements.get(agent.id)?.kind !== 'apex') continue;
    const members = (links.members.get(agent.id) ?? []).map((member) => member.agent);
    const work: Work = {
      dispatches: links.dispatches.get(agent.id) ?? [],
      bundles: links.bundles.get(agent.id) ?? [],
      extras,
      fresh,
      remembered: input.memo?.recall(agent.id) ?? [],
      tasks,
    };
    verdicts.set(agent.id, judge(agent, members, work, now, state.sources));
  }
  if (fresh && input.memo) input.memo.replace(new Map([...verdicts].map(([id, verdict]) => [id, verdict.fresh])));
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
    const judged = verdicts.get(agent.id) as ReturnType<typeof judge>;
    const last = lastActivity(agent, memberAgents, state);
    const members = orderMembers(agent.id, team.map(memberEntry));
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
      badges: judged.status === 'done' ? badgesOf(agent, memberAgents, links.bundles.get(agent.id) ?? [], state) : [],
      lastActivityAt: last,
      stateStartedAt: agent.stateStartedAt.value,
      members,
      counts: countTeam(team, links.dispatches.get(agent.id) ?? []),
      team: buildTeam({
        apexId: agent.id,
        members: team,
        promoted: links.promoted,
        dispatches: links.dispatches.get(agent.id) ?? [],
        workers: state.workers,
        tasks,
      }),
      waitingMembers: waitingMembersOf(members, new Map(memberAgents.map((member) => [member.id, member])), now),
      questions: questionsOf(links.dispatches.get(agent.id) ?? [], extras, tasks),
    });
  }
  items.sort(compareItems);
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
