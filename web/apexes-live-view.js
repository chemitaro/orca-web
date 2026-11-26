// 指揮の画面の左の一覧の、頂点の行の下に出す「稼働中の内訳の木」（iss-00092 D-01）の組み立て（純粋な関数）。
// 頂点の `team`（orca-web.apexes/v1）から、稼働中の節（working・waiting・live・unknown）とその祖先だけを選ぶ。
// 祖先は止まっていても構成を示すために薄く出し、上限と「ほか n」には数えない。DOM、時計、fetch に触らない。描くのは apexes-dom.js。
// 対応が必要の印（iss-00097、apexes-attention-view.js）のある節は status に関わらず出し、選びの最初にする。
import { attentionFor } from './apexes-attention-view.js';
import { iconKey } from './embed/agent-marks-icons.js';
import { formatElapsed } from './embed/elapsed.js';

/** 出す稼働中の節の上限。超えた分は「ほか n」。 */
export const LIVE_TEAM_LIMIT = 8;
/** 題名の長さの上限（字）。 */
export const LIVE_TITLE_MAX = 40;

export const LIVE_STATUS_LABELS = {
  working: '作業中',
  waiting: '待ち',
  live: '動作中（タブなし）',
  unknown: '不明',
  done: '完了',
  failed: '失敗',
};

const LIVE = new Set(['working', 'waiting', 'live', 'unknown']);

function statusOf(value) {
  return Object.hasOwn(LIVE_STATUS_LABELS, value) ? value : 'unknown';
}

function time(value) {
  if (typeof value !== 'string') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

function titleOf(value) {
  if (typeof value !== 'string' || value === '') return '題名なし';
  const chars = Array.from(value);
  return chars.length > LIVE_TITLE_MAX ? `${chars.slice(0, LIVE_TITLE_MAX - 1).join('')}…` : value;
}

const isAgent = (node) => node.kind === 'agent' && typeof node.agentId === 'string';
/** 経過の起点。エージェントの節は stateStartedAt、Dispatch の節は createdAt。 */
const startOf = (node) => (isAgent(node) ? node.stateStartedAt : node.createdAt);

/**
 * 稼働中の内訳の木。稼働中の節も対応が必要の印のある節もなければ null（木を出さない）。
 * 選ぶ優先は、対応が必要の印のある節、深さの浅い順・同じ深さは起点の新しい順（同じなら文書の並び）。出す並びは文書の並び（木の順）。
 * @param {any} team 頂点の team
 * @param {{ now: number, limit?: number, members?: any[], attention?: any }} options members は頂点の members（agentType を引く）。
 *   attention は memberAttention の結果（なければ印を付けない）
 */
export function buildLiveTeam(team, { now, limit = LIVE_TEAM_LIMIT, members = [], attention = null }) {
  const nodes = Array.isArray(team) ? team : [];
  const marksOf = new Map(nodes.map((node) => [node, attentionFor(node, attention)]));
  const urgent = (node) => marksOf.get(node).some((mark) => mark.urgent);
  const live = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => LIVE.has(statusOf(node.status)) || urgent(node));
  if (live.length === 0) return null;
  const depthOf = (node) => Number(node.depth) || 1;
  live.sort((a, b) => {
    const first = Number(urgent(b.node)) - Number(urgent(a.node));
    if (first !== 0) return first;
    const depth = depthOf(a.node) - depthOf(b.node);
    if (depth !== 0) return depth;
    const at = time(startOf(a.node));
    const bt = time(startOf(b.node));
    if (at !== null && bt !== null && at !== bt) return bt - at;
    if (at === null && bt !== null) return 1;
    if (at !== null && bt === null) return -1;
    return a.index - b.index;
  });
  const chosen = live.slice(0, limit);
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const shown = new Set();
  for (const { node } of chosen) {
    let current = node;
    while (current && !shown.has(current.key)) {
      shown.add(current.key);
      current = current.parentKey === null ? undefined : byKey.get(current.parentKey);
    }
  }
  const types = new Map(
    (Array.isArray(members) ? members : []).map((member) => [String(member?.id), member?.agentType ?? null]),
  );
  const rows = nodes
    .filter((node) => shown.has(node.key))
    .map((node) => {
      const status = statusOf(node.status);
      const agent = isAgent(node);
      return {
        key: String(node.key),
        depth: depthOf(node),
        kind: agent ? 'agent' : 'dispatch',
        icon: agent ? iconKey(types.get(node.agentId) ?? null) : null,
        status,
        statusLabel: LIVE_STATUS_LABELS[status],
        title: titleOf(node.title),
        elapsed: formatElapsed(startOf(node), now, { clampFuture: true }),
        dim: !LIVE.has(status) && !urgent(node),
        marks: marksOf.get(node),
      };
    });
  const more = live.length - chosen.length;
  return { rows, more, moreLabel: more > 0 ? `ほか ${more}` : null };
}
