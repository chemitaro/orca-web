// 指揮の画面の右のペインの「チームの帯」（iss-00079 D-02）の組み立て（純粋な関数）。頂点の `team`（orca-web.apexes/v1）から、
// 数の要約、字下げの木の行（動いている・待ち・不明・24 時間以内の失敗・対応が必要の印のある節とその祖先だけを出し、ほかは親ごとの「完了 n」のまとめ）、
// 履歴の帯の四角の並びを作る。DOM、時計、fetch に触らない。描くのは apexes-team-dom.js。
// 対応が必要の印（iss-00097、apexes-attention-view.js）のある節もいつも出し、節の行に印を添える。
import { attentionFor, memberAttention } from './apexes-attention-view.js';
import { detailHref } from './apexes-view.js';
import { formatElapsed } from './embed/elapsed.js';

/** 失敗をいつも出す新しさ。completedAt（なければ createdAt）から測る。 */
export const FAILED_RECENT_MS = 24 * 3_600_000;

export const TEAM_STATUS_LABELS = {
  working: '作業中',
  live: '作業中',
  waiting: '待ち',
  done: '完了',
  failed: '失敗',
  unknown: '不明',
};

const ALWAYS = new Set(['working', 'live', 'waiting', 'unknown']);
const APEX_GROUP = 'apex';

function statusOf(value) {
  return Object.hasOwn(TEAM_STATUS_LABELS, value) ? value : 'unknown';
}

function time(value) {
  if (typeof value !== 'string') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

function recentFailure(node, now) {
  if (statusOf(node.status) !== 'failed') return false;
  const at = time(node.completedAt) ?? time(node.createdAt);
  return at !== null && now - at <= FAILED_RECENT_MS;
}

function summaryOf(team) {
  const count = (statuses) => team.filter((node) => statuses.includes(statusOf(node.status))).length;
  const parts = [
    `作業中 ${count(['working', 'live'])}`,
    `待ち ${count(['waiting'])}`,
    `完了 ${count(['done'])}`,
    `失敗 ${count(['failed'])}`,
  ];
  const unknown = count(['unknown']);
  if (unknown > 0) parts.push(`不明 ${unknown}`);
  return `チーム ${team.length}（${parts.join('・')}）`;
}

function nodeRow(node, now, attention) {
  const status = statusOf(node.status);
  const agent = node.kind === 'agent' && typeof node.agentId === 'string';
  const from = agent ? node.stateStartedAt : (node.completedAt ?? node.createdAt);
  return {
    type: 'node',
    key: String(node.key),
    depth: Number(node.depth) || 1,
    status,
    statusLabel: TEAM_STATUS_LABELS[status],
    title: typeof node.title === 'string' && node.title !== '' ? node.title : '題名なし',
    elapsed: formatElapsed(from, now, { clampFuture: true }),
    href: agent ? detailHref(node.agentId) : null,
    marks: attentionFor(node, attention),
  };
}

/**
 * 頂点の項目（ApexItem）から帯を作る。team がない・空なら null（帯を出さない）。
 * rows の並びは文書の並び（深さ優先、兄弟は createdAt の古い順）のまま、まとめは親の子の後ろに置く。
 * @param {any} item
 * @param {number} now
 */
export function buildTeamBand(item, now) {
  const team = Array.isArray(item?.team) ? item.team : [];
  if (team.length === 0) return null;
  const keys = new Set(team.map((node) => node.key));
  const parentOf = (node) => (node.parentKey !== null && keys.has(node.parentKey) ? node.parentKey : null);
  const byKey = new Map(team.map((node) => [node.key, node]));
  const attention = memberAttention(item);
  const urgent = (node) => attentionFor(node, attention).some((mark) => mark.urgent);
  // いつも出す節とその祖先。
  const visible = new Set();
  for (const node of team) {
    if (!ALWAYS.has(statusOf(node.status)) && !recentFailure(node, now) && !urgent(node)) continue;
    let current = node;
    while (current && !visible.has(current.key)) {
      visible.add(current.key);
      const parent = parentOf(current);
      current = parent === null ? undefined : byKey.get(parent);
    }
  }
  const children = new Map();
  for (const node of team) {
    const parent = parentOf(node);
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  /** 節とその子孫を、文書の並びの深さ優先で並べる（まとめの中身）。 */
  const subtree = (node) => [nodeRow(node, now, attention), ...(children.get(node.key) ?? []).flatMap(subtree)];
  const walk = (parent, depth) => {
    const rows = [];
    const hidden = [];
    for (const node of children.get(parent) ?? []) {
      if (visible.has(node.key)) rows.push(nodeRow(node, now, attention), ...walk(node.key, depth + 1));
      else hidden.push(...subtree(node));
    }
    if (hidden.length > 0) {
      rows.push({
        type: 'group',
        key: `done:${parent ?? APEX_GROUP}`,
        depth,
        count: hidden.length,
        label: `完了 ${hidden.length}`,
        rows: hidden,
      });
    }
    return rows;
  };
  const history = team
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => typeof node.dispatchId === 'string')
    .sort((a, b) => {
      const at = time(a.node.createdAt);
      const bt = time(b.node.createdAt);
      if (at !== null && bt !== null && at !== bt) return at - bt;
      if (at === null && bt !== null) return 1;
      if (at !== null && bt === null) return -1;
      return a.index - b.index;
    })
    .map(({ node }) => {
      const status = statusOf(node.status);
      const title = typeof node.title === 'string' && node.title !== '' ? node.title : '題名なし';
      return { target: String(node.key), status, label: `${title}（${TEAM_STATUS_LABELS[status]}）` };
    });
  return { summary: summaryOf(team), rows: walk(null, 1), history };
}
