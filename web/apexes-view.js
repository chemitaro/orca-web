// 指揮の画面（/apexes）の組み立て（純粋な関数）。/api/apexes の文書（orca-web.apexes/v1）から、
// 段ごとの行、見出しの数、タブの題名、鮮度の帯を作る。DOM、時計、fetch に触らない。言葉の表はここの1か所。

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

function apexRow(item, now) {
  const reasons = list(item.reasons);
  const counts = item.counts ?? {};
  const total = num(counts.total);
  return {
    ...baseRow(item),
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
 * @param {{ now: number, error?: string | null }} options
 */
export function buildApexesView(doc, options) {
  const items = list(doc.items);
  const sections = SECTION_ORDER.map((key) => {
    const rows =
      key === 'unlinked'
        ? list(doc.unlinked).map(unlinkedRow)
        : items.filter((item) => item.group === key).map((item) => apexRow(item, options.now));
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
