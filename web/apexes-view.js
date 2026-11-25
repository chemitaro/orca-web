// 指揮の画面（/apexes）の組み立て（純粋な関数）。/api/apexes の文書（orca-web.apexes/v1）から、
// 段ごとの行、見出しの数、タブの題名、鮮度の帯を作る。DOM、時計、fetch に触らない。言葉の表はここの1か所。
// 選んだ頂点（?apex=）の扱い（iss-00077 D-02）：選びの状態 { id, autoPick, checked } を reduceSelection で移し、
// 右のペインの見出しと案内を buildPane で作る。枠の src は frameSrc の1か所。
// 新着の点（D-06）：見た時刻の写し seen（{ [頂点の id]: ISO 時刻 }、保存が使えなければ null）から isUnseen で決め、
// pruneSeen で古い記録を捨てる。見出しの数（D-09）は文書の counts ではなく、作った段の件数から出す。

import { iconKey, STATE_ICONS } from './embed/agent-marks-icons.js';
import { MARK_LABELS } from './embed/agent-marks-view.js';
import { formatElapsed } from './embed/elapsed.js';

/** 画面の段の順。先の3つは開き、後の3つは畳む。 */
export const SECTION_ORDER = ['needs_action', 'working', 'done_recent', 'done_older', 'sleeping', 'unlinked'];
const COLLAPSED = new Set(['done_older', 'sleeping', 'unlinked']);

export const SECTION_LABELS = {
  needs_action: '対応が必要',
  working: '作業中',
  done_recent: '完了',
  done_older: '以前の完了',
  sleeping: '眠っている',
  unlinked: '結べない仕事',
};

export const REASON_LABELS = {
  apex_blocked: '許可待ち',
  apex_waiting: '入力待ち',
  member_blocked: '配下が許可待ち',
  member_waiting: '配下が入力待ち',
  question: '未回答の質問',
  decision: '未解決の判断',
  question_working: '質問あり（作業は継続中）',
  stalled: '仕事が止まった',
  apex_closed: '統括のタブが閉じたのに仕事が残る',
  failed: '新しい失敗',
  working: '作業中',
  monitoring: STATE_ICONS.monitoring.label,
  members_working: '配下が作業中',
  live_work: '仕事が残っている',
  member_grace: '配下が待ち（様子見）',
  grace: '様子見',
  done: '完了',
  sleeping: 'スリープ',
};

export const TAG_LABELS = { unverified: '確かめられない' };

/** 完了の頂点の残りの札。count を付けるものは関数。 */
export const BADGE_LABELS = {
  merge_pending: () => 'マージ待ち',
  ci_failed: () => 'CI が失敗',
  failed_members: (count) => `失敗した作業者 ${count}`,
  remaining_tasks: (count) => `残りの task ${count}`,
};

export const UNLINKED_LABELS = {
  parent_missing: '親が見つからない',
  worker_without_parent: '作業者の親が見つからない',
  cycle: '親子が輪になっている',
};

/** 選んだ頂点を覚える URL の引数。 */
export const APEX_PARAM = 'apex';
/** これより広い幅で2ペインにし、?apex= なしに開いたときだけ対応が必要の先頭を選ぶ。 */
export const WIDE_MIN_PX = 900;
/** 枠の中に処理中か結果不明の表示があるときの、切り替えの前の確かめの文（D-04）。 */
export const SWITCH_CONFIRM_TEXT = '送信の処理中か結果不明の表示があります。切り替えると表示を失います';
export const PANE_GUIDE_TEXT = '一覧から頂点を選ぶと、ここに会話が出ます';
export const MISSING_LABEL = '一覧にありません';
/** 見た時刻を保存する localStorage の鍵と形の版。 */
export const SEEN_STORAGE_KEY = 'orca-web.apexes.seen';
export const SEEN_VERSION = 1;
/** 選んだ頂点をこれだけ続けて右のペインに出したら、見たとする。 */
export const SEEN_DWELL_MS = 10_000;
/** これより古い見た時刻は捨てる。 */
export const SEEN_KEEP_MS = 14 * 24 * 60 * 60 * 1000;
export const UNSEEN_LABEL = '新着';
const UNSEEN_GROUPS = new Set(['done_recent', 'done_older']);

const DETAIL_PREFIX = '/embed/agent?id=';
const RUN_PREFIX = '/runs/';
const BASE_TITLE = '指揮 — orca-web';
const FAVICON_PLAIN = '/favicon.svg';
const FAVICON_ALERT = '/favicon-alert.svg';

const str = (value) => (typeof value === 'string' && value !== '' ? value : null);
const num = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
const list = (value) => (Array.isArray(value) ? value : []);

/** タブの題名。対応が必要が1つ以上なら先頭に (n) を付ける。 */
export function apexesTitle(needsAction) {
  const n = num(needsAction);
  return n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
}

/** タブの favicon（iss-00081 D-01）。対応が必要が1つ以上なら印付きの SVG。 */
export function apexesFavicon(needsAction) {
  return num(needsAction) > 0 ? FAVICON_ALERT : FAVICON_PLAIN;
}

/** 詳細とチャットの画面への道。 */
export function detailHref(id) {
  return `${DETAIL_PREFIX}${encodeURIComponent(String(id))}`;
}

function markOf(value) {
  return Object.hasOwn(MARK_LABELS, value) ? value : 'unknown';
}

function baseRow(item) {
  const mark = markOf(item.mark);
  return {
    key: String(item.id),
    icon: iconKey(item.agentType),
    agentType: str(item.agentType),
    mark,
    markLabel: MARK_LABELS[mark],
    title: str(item.title) ?? str(item.worktreeName) ?? '題名なし',
    project: str(item.project?.name),
    issue: str(item.issue),
    href: detailHref(item.id),
  };
}

const time = (value) => (typeof value === 'string' ? Date.parse(value) : Number.NaN);

/**
 * 新着の点を出すか。段が完了か以前の完了で、最後の活動が見た時刻より新しい（見たことがなければ真）。
 * seen が null（保存が使えない）なら出さない。
 */
export function isUnseen(item, seen) {
  if (!seen || !UNSEEN_GROUPS.has(item?.group)) return false;
  const last = time(item.lastActivityAt);
  if (!Number.isFinite(last)) return false;
  const id = String(item.id);
  const at = Object.hasOwn(seen, id) ? time(seen[id]) : Number.NaN;
  return !Number.isFinite(at) || at < last;
}

/**
 * 見た時刻の記録を減らす。now から 14 日より古いもの（読めない時刻も）を落とす。
 * 文書が ?project= で絞られておらず、stale でなく、items が空でないときだけ、文書にない id も落とす。
 * @param {Record<string, string>} seen
 * @returns {Record<string, string>}
 */
export function pruneSeen(seen, doc, now) {
  const items = list(doc?.items);
  const known =
    doc && doc.project === null && doc.stale !== true && items.length > 0
      ? new Set(items.map((item) => String(item.id)))
      : null;
  const out = {};
  for (const [id, at] of Object.entries(seen ?? {})) {
    const value = time(at);
    if (!Number.isFinite(value) || value < now - SEEN_KEEP_MS) continue;
    if (known && !known.has(id)) continue;
    out[id] = at;
  }
  return out;
}

function badgeLabels(badges) {
  return list(badges)
    .filter((badge) => Object.hasOwn(BADGE_LABELS, badge?.kind))
    .map((badge) => BADGE_LABELS[badge.kind](num(badge.count)));
}

function apexRow(item, now, selectedId = null, seen = null) {
  const reasons = list(item.reasons);
  const counts = item.counts ?? {};
  const total = num(counts.total);
  return {
    ...baseRow(item),
    selectable: true,
    selected: selectedId !== null && String(item.id) === selectedId,
    unseen: isUnseen(item, seen),
    monitoring: reasons.includes('monitoring'),
    reasons: reasons.map((r) => REASON_LABELS[r] ?? String(r)),
    tags: list(item.tags).map((t) => TAG_LABELS[t] ?? String(t)),
    badges: badgeLabels(item.badges),
    // 配下（生きた辺のメンバーと束の Dispatch）の「動いている/全体」。配下がなければ出さない。
    members: total > 0 ? `${num(counts.working)}/${total}` : null,
    membersLabel: total > 0 ? `配下 ${total} のうち ${num(counts.working)} が作業中` : null,
    elapsed: formatElapsed(item.lastActivityAt, now, { clampFuture: true }),
  };
}

/** 結べない束の行。Run の目的、生きた数、問いの数。行の全体が /runs/<id> を新しいタブで開くリンク。 */
function bundleRow(item) {
  const live = num(item.live);
  const questions = num(item.questions);
  const mark = live > 0 ? 'working' : 'waiting';
  const runId = String(item.runId);
  return {
    key: String(item.id),
    icon: iconKey(null),
    agentType: null,
    mark,
    markLabel: MARK_LABELS[mark],
    title: str(item.objective) ?? `Run ${runId}`,
    project: null,
    issue: null,
    href: `${RUN_PREFIX}${encodeURIComponent(runId)}`,
    selectable: false,
    selected: false,
    unseen: false,
    monitoring: false,
    reasons: [...(live > 0 ? [`生きた仕事 ${live}`] : []), ...(questions > 0 ? [`問い ${questions}`] : [])],
    tags: [],
    badges: [],
    members: null,
    membersLabel: null,
    elapsed: null,
  };
}

function unlinkedRow(item) {
  if (item?.kind === 'bundle') return bundleRow(item);
  return {
    ...baseRow(item),
    selectable: false,
    selected: false,
    unseen: false,
    monitoring: false,
    reasons: [UNLINKED_LABELS[item.reason] ?? String(item.reason)],
    tags: [],
    badges: [],
    members: null,
    membersLabel: null,
    elapsed: null,
  };
}

function freshnessLines(doc, error) {
  const lines = [];
  if (doc.stale) lines.push({ text: 'Orca を読めていません。最後に読めた値を示しています', kind: 'warn' });
  if (error) lines.push({ text: `更新できない（${error}）。前の内容を示しています`, kind: 'bad' });
  return lines;
}

/**
 * 頂点の一覧の文書から画面の内容を作る。
 * @param {any} doc /api/apexes の文書
 * @param {{ now: number, error?: string | null, selectedId?: string | null,
 *   seen?: Record<string, string> | null }} options seen は見た時刻の写し（なければ点を出さない）
 */
export function buildApexesView(doc, options) {
  const items = list(doc.items);
  const sections = SECTION_ORDER.map((key) => {
    const rows =
      key === 'unlinked'
        ? list(doc.unlinked).map(unlinkedRow)
        : items
            .filter((item) => item.group === key)
            .map((item) => apexRow(item, options.now, options.selectedId ?? null, options.seen ?? null));
    return { key, title: SECTION_LABELS[key], count: rows.length, collapsed: COLLAPSED.has(key), rows };
  });
  const counts = doc.counts ?? {};
  // 見出しの数は開いた段の件数（D-09）。題名の件数は counts.needs_action のまま（段と同じ値）。
  const sectionCount = (key) => sections.find((section) => section.key === key)?.count ?? 0;
  const needsShown = sectionCount('needs_action');
  const unseen = sections
    .filter((section) => UNSEEN_GROUPS.has(section.key))
    .reduce((n, section) => n + section.rows.filter((row) => row.unseen).length, 0);
  const headline = [
    { key: 'needs_action', text: `${SECTION_LABELS.needs_action} ${needsShown}`, emphasis: needsShown > 0 },
    { key: 'working', text: `${SECTION_LABELS.working} ${sectionCount('working')}`, emphasis: false },
    { key: 'done', text: `${SECTION_LABELS.done_recent} ${sectionCount('done_recent')}`, emphasis: false },
  ];
  if (unseen > 0) headline.push({ key: 'unseen', text: `${UNSEEN_LABEL} ${unseen}`, emphasis: false });
  return {
    title: apexesTitle(num(counts.needs_action)),
    favicon: apexesFavicon(num(counts.needs_action)),
    headline,
    freshness: freshnessLines(doc, options.error ?? null),
    sections,
  };
}

/** 頂点の一覧の API の道。 */
export function apexesApiPath(project) {
  return project ? `/api/apexes?project=${encodeURIComponent(project)}` : '/api/apexes';
}

/** 文書の頂点を id で探す。 */
function findItem(doc, id) {
  if (id === null) return null;
  return list(doc?.items).find((item) => String(item.id) === id) ?? null;
}

/** stale が偽で items が空でない、要求の id を確かめられる文書か。 */
const usable = (doc) => Boolean(doc) && doc.stale !== true && list(doc.items).length > 0;

/** URL の search から選んだ頂点の id（なければ null）。 */
export function apexFromSearch(search) {
  return str(new URLSearchParams(search).get(APEX_PARAM));
}

/** search の apex を足す・替える・外した文字列（ほかの引数は保つ。空なら ''）。 */
export function selectionUrl(currentSearch, id) {
  const params = new URLSearchParams(currentSearch);
  if (id === null || id === undefined || id === '') params.delete(APEX_PARAM);
  else params.set(APEX_PARAM, String(id));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** 右のペインの枠の src。 */
export function frameSrc(id, { compose = true } = {}) {
  // compose=off は送る欄を出さない答えるだけの枠（iss-00080 D-02）。
  return compose ? detailHref(id) : `${detailHref(id)}&compose=off`;
}

/**
 * 選ぶ頂点。requestedId があればそれ（一覧になければ missing を真にしてそのまま返す）。
 * なく autoPick が真なら対応が必要の先頭、なければ null。
 * @returns {{ id: string, item: any, missing: boolean } | null}
 */
export function pickSelection(doc, requestedId, { autoPick = false } = {}) {
  if (requestedId !== null && requestedId !== undefined) {
    const item = findItem(doc, String(requestedId));
    return { id: String(requestedId), item, missing: item === null };
  }
  if (!autoPick) return null;
  const first = list(doc?.items).find((item) => item.group === 'needs_action');
  return first ? { id: String(first.id), item: first, missing: false } : null;
}

/**
 * 開いたときの選びの状態。autoPick は広い幅で ?apex= なしのときだけ真。checked は要求の id を確かめ終えたか。
 * @param {string} search
 * @param {{ wide: boolean }} options
 */
export function initialSelection(search, { wide }) {
  const id = apexFromSearch(search);
  return { id, autoPick: wide === true && id === null, checked: id === null };
}

/**
 * 選びの状態を移す。
 * - document：最初の使える文書で、?apex= の id が一覧になければ外す。autoPick は最初の文書で1回だけ使う。
 * - select：利用者が選んだ。clear：「← 一覧」。どちらも以後の自動の選びを止める。
 */
export function reduceSelection(state, event) {
  if (event.type === 'select') return { id: String(event.id), autoPick: false, checked: true };
  if (event.type === 'clear') return { id: null, autoPick: false, checked: true };
  if (event.type !== 'document' || !event.doc) return state;
  let { id, autoPick, checked } = state;
  if (!checked && usable(event.doc)) {
    checked = true;
    if (findItem(event.doc, id) === null) id = null;
  }
  if (autoPick) {
    autoPick = false;
    if (id === null) id = pickSelection(event.doc, null, { autoPick: true })?.id ?? null;
  }
  if (id === state.id && autoPick === state.autoPick && checked === state.checked) return state;
  return { id, autoPick, checked };
}

/**
 * 右のペインの内容。選んでいれば見出し（題名、状態の印、「一覧にありません」、開く先）、なければ案内の文。
 * remembered は前に見えた選んだ頂点（一覧から消えても題名を出すため）。返す remember を次に渡す。
 * @param {any} doc /api/apexes の文書（まだなければ null）
 * @param {{ id: string | null, checked: boolean }} selection
 * @param {{ now: number, remembered: any }} options
 */
export function buildPane(doc, selection, { now, remembered }) {
  if (selection.id === null) return { selected: false, header: null, guide: PANE_GUIDE_TEXT, remember: null };
  const found = findItem(doc, selection.id);
  const item = found ?? (remembered && String(remembered.id) === selection.id ? remembered : null);
  const missing = found === null && selection.checked === true && Boolean(doc);
  const row = item ? apexRow(item, now) : null;
  return {
    selected: true,
    header: {
      id: selection.id,
      title: row?.title ?? (missing ? '題名なし' : '読み込み中…'),
      mark: row?.mark ?? 'unknown',
      markLabel: row?.markLabel ?? MARK_LABELS.unknown,
      monitoring: row?.monitoring ?? false,
      missing,
      missingLabel: missing ? MISSING_LABEL : null,
      newTab: frameSrc(selection.id),
      open: item && str(item.worktreeId) ? { worktree: item.worktreeId, agent: String(item.id) } : null,
    },
    guide: null,
    remember: item,
  };
}
