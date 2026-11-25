// 指揮の画面（/apexes）の組み立て（純粋な関数）。/api/apexes の文書（orca-web.apexes/v1）から、
// 段ごとの行、見出しの数、タブの題名、鮮度の帯を作る。DOM、時計、fetch に触らない。言葉の表はここの1か所。
// 選んだ頂点（?apex=）の扱い（iss-00077 D-02）：選びの状態 { id, autoPick, checked } を reduceSelection で移し、
// 右のペインの見出しと案内を buildPane で作る。枠の src は frameSrc の1か所。

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
  working: '作業中',
  monitoring: STATE_ICONS.monitoring.label,
  members_working: '配下が作業中',
  member_grace: '配下が待ち（様子見）',
  done: '完了',
  sleeping: 'スリープ',
};

export const TAG_LABELS = { unverified: '確かめられない' };

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

const DETAIL_PREFIX = '/embed/agent?id=';
const BASE_TITLE = '指揮 — orca-web';

const str = (value) => (typeof value === 'string' && value !== '' ? value : null);
const num = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
const list = (value) => (Array.isArray(value) ? value : []);

/** タブの題名。対応が必要が1つ以上なら先頭に (n) を付ける。 */
export function apexesTitle(needsAction) {
  const n = num(needsAction);
  return n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
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

function apexRow(item, now, selectedId = null) {
  const reasons = list(item.reasons);
  const counts = item.counts ?? {};
  const total = num(counts.total);
  return {
    ...baseRow(item),
    selectable: true,
    selected: selectedId !== null && String(item.id) === selectedId,
    monitoring: reasons.includes('monitoring'),
    reasons: reasons.map((r) => REASON_LABELS[r] ?? String(r)),
    tags: list(item.tags).map((t) => TAG_LABELS[t] ?? String(t)),
    // 配下がなければ出さない。
    members: total > 0 ? `${num(counts.working)}/${total}` : null,
    membersLabel: total > 0 ? `配下 ${total} のうち ${num(counts.working)} が作業中` : null,
    elapsed: formatElapsed(item.lastActivityAt, now, { clampFuture: true }),
  };
}

function unlinkedRow(item) {
  return {
    ...baseRow(item),
    selectable: false,
    selected: false,
    monitoring: false,
    reasons: [UNLINKED_LABELS[item.reason] ?? String(item.reason)],
    tags: [],
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
 * @param {{ now: number, error?: string | null, selectedId?: string | null }} options
 */
export function buildApexesView(doc, options) {
  const items = list(doc.items);
  const sections = SECTION_ORDER.map((key) => {
    const rows =
      key === 'unlinked'
        ? list(doc.unlinked).map(unlinkedRow)
        : items
            .filter((item) => item.group === key)
            .map((item) => apexRow(item, options.now, options.selectedId ?? null));
    return { key, title: SECTION_LABELS[key], count: rows.length, collapsed: COLLAPSED.has(key), rows };
  });
  const counts = doc.counts ?? {};
  const needsAction = num(counts.needs_action);
  return {
    title: apexesTitle(needsAction),
    headline: [
      { key: 'needs_action', text: `対応が必要 ${needsAction}` },
      { key: 'working', text: `作業中 ${num(counts.working)}` },
      { key: 'done', text: `完了 ${num(counts.done)}` },
    ],
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
export function frameSrc(id) {
  return detailHref(id);
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
