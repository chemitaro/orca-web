// 木・Run の一覧・プロジェクトの画面の組み立て（純粋な関数）。/api/runs/<id>/tree（orca-web.run-tree/v1）と
// /api/runs（orca-web.runs/v1）の文書から、木の行、一覧の行、鮮度の文、道と API の URL を作る。DOM、時計、fetch に触らない。
import { STATE_ICONS } from './embed/agent-marks-icons.js';
import { formatElapsed } from './embed/elapsed.js';
import { defaultTime, inboxApiPath, latest, projectOptions } from './inbox-view.js';

/** 取れない値の印。 */
export const DASH = '—';

export const ROLE_LABELS = { coordinator: '統括', worker: '作業者' };

/** 節の状態の文。知らない値はそのまま出す。 */
export const STATE_LABELS = {
  working: '動いている',
  blocked: '許可待ち',
  waiting: '入力待ち',
  done: '終わった',
  sleeping: 'スリープ',
  idle: '待機',
  succeeded: '成功',
  failed: '失敗',
  cancelled: '取り消し',
};

const DETAIL_PREFIX = '/embed/agent?id=';

const text = (value) => (typeof value === 'string' && value !== '' ? value : DASH);

/** 木の画面の道。 */
export function runHref(id) {
  return `/runs/${encodeURIComponent(id)}`;
}

/** プロジェクトの画面の道。 */
export function projectHref(id) {
  return `/projects/${encodeURIComponent(id)}`;
}

/** Run の一覧の API の道。 */
export function runsApiPath(project) {
  return project ? `/api/runs?project=${encodeURIComponent(project)}` : '/api/runs';
}

/** 木の API の道。 */
export function runTreeApiPath(id) {
  return `/api/runs/${encodeURIComponent(id)}/tree`;
}

function idFromPath(pathname, prefix) {
  const match = new RegExp(`^/${prefix}/([^/]+)$`).exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** /runs/<id> の id（形が違えば null）。 */
export function runIdFromPath(pathname) {
  return idFromPath(pathname, 'runs');
}

/** /projects/<id> の repo の id（形が違えば null）。 */
export function projectIdFromPath(pathname) {
  return idFromPath(pathname, 'projects');
}

/** プロジェクトの画面が読む受け箱と Run の一覧の API。 */
export function projectPageApis(project) {
  return { inbox: inboxApiPath(project), runs: runsApiPath(project) };
}

/** 受け箱の見出しのリンク。プロジェクトを選んでいれば、そのプロジェクトの画面へのリンクを足す。 */
export function inboxLinks(project) {
  const links = [{ text: 'Run の一覧', href: '/runs' }];
  if (project) links.push({ text: 'プロジェクトの画面', href: projectHref(project) });
  return links;
}

/** 平らな sources（取得元ごとの { lastSuccessAt, stale, error }）から鮮度の文を作る。連絡の取得元は持たない。 */
export function sourceFreshness(doc, formatTime, error) {
  const lines = [];
  const connection = doc.connection ?? {};
  if (connection.state === 'connected') lines.push({ text: 'Orca に接続', kind: 'ok' });
  else if (connection.state === 'starting') lines.push({ text: '確かめ中', kind: 'info' });
  else
    lines.push({
      text: `Orca に接続できない${connection.reason ? `（${connection.reason}）` : ''}`,
      kind: 'bad',
    });

  const sources = doc.sources ?? {};
  const last = latest(Object.values(sources).map((s) => s?.lastSuccessAt));
  lines.push(
    last ? { text: `最後に読めた時刻 ${formatTime(last)}`, kind: 'info' } : { text: 'まだ読めていない', kind: 'warn' },
  );
  if (doc.stale) lines.push({ text: '古い値を含む', kind: 'warn' });

  const broken = Object.entries(sources)
    .filter(([, s]) => s?.error)
    .map(([name, s]) => `${name}（${s.error.kind}）`);
  if (broken.length > 0) lines.push({ text: `読めない取得元：${broken.join('、')}`, kind: 'warn' });

  if (error) lines.push({ text: `更新できない（${error}）。前の内容を示しています`, kind: 'bad' });
  return lines;
}

function detailHref(value) {
  return typeof value === 'string' && value.startsWith(DETAIL_PREFIX) ? value : null;
}

function stateText(state, monitoring) {
  if (monitoring) return STATE_ICONS.monitoring.label;
  return typeof state === 'string' ? (STATE_LABELS[state] ?? state) : DASH;
}

function nodeRow(node, depth, now, coordinatorResolvedBy) {
  const projectName = node.project?.name ?? null;
  // Orca の working の中の monitoring。state が working で値がちょうど monitoring のときだけ。
  const monitoring = node.state === 'working' && node.workingMode === 'monitoring';
  return {
    key: String(node.id),
    depth,
    role: node.role,
    roleLabel: ROLE_LABELS[node.role] ?? text(node.role),
    coordinatorNote: depth === 0 && coordinatorResolvedBy === 'latest-task' ? '最近の依頼から決めた統括' : null,
    issue: text(node.issue),
    title: text(node.title),
    agentType: text(node.agentType),
    model: text(node.model),
    effort: text(node.effort),
    state: stateText(node.state, monitoring),
    monitoring,
    elapsed: formatElapsed(node.since, now, { clampFuture: true }) ?? DASH,
    project: text(projectName),
    badge: node.otherProject === true && projectName ? projectName : null,
    orphan: node.orphan === true ? '親が分からない' : null,
    detailHref: detailHref(node.links?.detail),
  };
}

/** 木を深さ優先にたどり、字下げの深さを持つ行の列にする。 */
function flatten(root, now, coordinatorResolvedBy) {
  const rows = [];
  const stack = [[root, 0]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop();
    rows.push(nodeRow(node, depth, now, coordinatorResolvedBy));
    const children = Array.isArray(node.children) ? node.children : [];
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push([children[i], depth + 1]);
  }
  return rows;
}

/**
 * 木の文書から画面の内容を作る。
 * @param {any} doc /api/runs/<id>/tree の文書
 * @param {{ now: number, formatTime?: (iso: string) => string, error?: string | null }} options
 */
export function buildTreeView(doc, options) {
  const formatTime = options.formatTime ?? defaultTime;
  const counts = doc.counts ?? {};
  return {
    runId: String(doc.run?.id ?? ''),
    title: doc.run?.title ?? null,
    coordinatorProject: text(doc.run?.coordinatorProject?.name),
    summary: `節 ${counts.nodes ?? 0}・作業者 ${counts.workers ?? 0}・別のプロジェクト ${counts.otherProject ?? 0}・親が分からない ${counts.orphan ?? 0}`,
    freshness: sourceFreshness(doc, formatTime, options.error ?? null),
    rows: doc.root ? flatten(doc.root, options.now, doc.run?.coordinatorResolvedBy) : [],
  };
}

function runRow(run) {
  return {
    key: String(run.id),
    href: runHref(String(run.id)),
    title: text(run.title),
    coordinator: `統括のプロジェクト：${text(run.coordinatorProject?.name)}`,
    projects: (run.projects ?? []).map((p) => text(p?.name)),
    workers: `作業者 ${run.workers ?? 0}`,
    active: `動いている ${run.active ?? 0}`,
    from: run.fromOtherProject?.name ? `${run.fromOtherProject.name} の統括から` : null,
  };
}

/**
 * Run の一覧の文書から画面の内容を作る。
 * @param {any} doc /api/runs の文書
 * @param {{ formatTime?: (iso: string) => string, project?: string | null, error?: string | null }} options
 */
export function buildRunListView(doc, options) {
  const formatTime = options.formatTime ?? defaultTime;
  return {
    freshness: sourceFreshness(doc, formatTime, options.error ?? null),
    projectName: doc.project?.name ?? null,
    projects: projectOptions(doc, options.project ?? null),
    rows: (doc.runs ?? []).map(runRow),
  };
}
