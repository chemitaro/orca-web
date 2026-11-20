// 印の組み立て（純粋な関数）。GET /api/worktrees/summary（orca-web.worktree-summary/v1）の worktree の1つから、
// エージェントごとの小さな印の形を作る。DOM、時計、fetch に触らない。
// 要約の項目は信頼しないデータ。決めた項目だけを拾い、題名や本文は返さない。
import { AGENT_ICONS, iconKey, STATE_ICONS } from './agent-marks-icons.js';
import { describeElapsed, formatElapsed } from './elapsed.js';

// 経過の規則は elapsed.js の1か所。既存の import の口を保つため、ここからも export する。
export { formatElapsed };

export const MARKS = ['working', 'blocked', 'waiting', 'done', 'sleeping', 'unknown'];

export const MARK_LABELS = {
  working: '作業中',
  blocked: '許可待ち',
  waiting: '入力待ち',
  done: '完了',
  sleeping: 'スリープ',
  unknown: '不明',
};

const SCHEMA = 'orca-web.worktree-summary/v1';
const DETAIL_PREFIX = '/embed/agent?id=';
const TYPE_LABEL_MAX = 40;

const str = (value) => (typeof value === 'string' && value !== '' ? value : null);

const trimSlash = (path) => path.replace(/\/+$/, '');

/**
 * 要約の文書から worktree をパス（先）か id で探す。パスの末尾の / の違いは同じとみなす。
 * @param {any} summary GET /api/worktrees/summary の文書
 * @param {{ path?: string | null, id?: string | null }} [where]
 * @returns {any | null}
 */
export function findWorktree(summary, { path, id } = {}) {
  if (summary === null || typeof summary !== 'object') return null;
  if (summary.schema !== SCHEMA || !Array.isArray(summary.worktrees)) return null;
  const worktrees = summary.worktrees.filter((w) => w !== null && typeof w === 'object');
  if (typeof path === 'string' && path !== '') {
    const want = trimSlash(path);
    const hit = worktrees.find((w) => typeof w.path === 'string' && trimSlash(w.path) === want);
    if (hit) return hit;
  }
  if (typeof id === 'string' && id !== '') {
    const hit = worktrees.find((w) => w.id === id);
    if (hit) return hit;
  }
  return null;
}

function typeLabelFor(agentType, icon) {
  if (icon === 'other') {
    return typeof agentType === 'string' ? agentType.slice(0, TYPE_LABEL_MAX) : AGENT_ICONS.other.label;
  }
  return AGENT_ICONS[icon].label;
}

// 読み上げの経過の文。読める形（describeElapsed）だけを使い、短い形を入れない。
function elapsedText(basis, spoken) {
  if (spoken === null) return null;
  const fresh = spoken === '1分未満';
  if (basis === 'state') return fresh ? 'この状態になったばかり' : `この状態になって ${spoken}`;
  if (basis === 'worktree-activity') return fresh ? '最後の活動は1分未満前' : `最後の活動から ${spoken}`;
  return `経過 ${spoken}`;
}

function markView(agent, now) {
  const mark = MARKS.includes(agent?.mark) ? agent.mark : 'unknown';
  // Orca の working の中の monitoring。mark が working で値がちょうど monitoring のときだけ。ほかの値と知らない値は null。
  const workingMode = mark === 'working' && agent?.workingMode === 'monitoring' ? 'monitoring' : null;
  const stateLabel = workingMode === 'monitoring' ? STATE_ICONS.monitoring.label : MARK_LABELS[mark];
  const icon = iconKey(agent?.agentType);
  const typeLabel = typeLabelFor(agent?.agentType, icon);
  const elapsed = formatElapsed(agent?.elapsedFrom, now);
  const spoken = describeElapsed(agent?.elapsedFrom, now);
  const detail = str(agent?.detail);
  const parts = [typeLabel, stateLabel, elapsedText(agent?.elapsedBasis, spoken)].filter((p) => p !== null);
  return {
    id: str(agent?.id),
    mark,
    workingMode,
    icon,
    typeLabel,
    elapsed,
    label: parts.join('、'),
    detail: detail?.startsWith(DETAIL_PREFIX) ? detail : null,
  };
}

// startedAt は文字列で、Date.parse が有限のときだけ時刻とする。
function startedTime(value) {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

// 新しい順。時刻が両方あれば大きい方、片方だけなら時刻のある方、ほかは要約の順。
function newer(a, b) {
  if (a.time !== null && b.time !== null && a.time !== b.time) return b.time - a.time;
  if (a.time !== null && b.time === null) return -1;
  if (a.time === null && b.time !== null) return 1;
  return a.index - b.index;
}

/**
 * 同じ worktree のエージェントを指揮の関係の順に並べ直した写しを返す。
 * 関係なし（startedAt の新しい順）→ 関係あり（根から親 → 子 → 孫の深さ優先、根どうしと兄弟は新しい順）→ 輪で根から届かないもの。
 * 関係ありは、parent.id がこの worktree の別のエージェントを指すか、別のエージェントの parent.id に指されるもの。
 * id が null か重複（2つ目から）のエージェントは表に入れず、関係なしとして扱う。
 * @param {any} agents 要約の worktree の agents（配列でなければ空）
 * @returns {any[]}
 */
export function orderAgents(agents) {
  const entries = (Array.isArray(agents) ? agents : []).map((agent, index) => ({
    agent,
    index,
    id: str(agent?.id),
    time: startedTime(agent?.startedAt),
    parentId: null,
  }));
  const byId = new Map();
  for (const entry of entries) if (entry.id !== null && !byId.has(entry.id)) byId.set(entry.id, entry);
  const listed = (entry) => entry.id !== null && byId.get(entry.id) === entry;
  const children = new Map();
  for (const entry of entries) {
    if (!listed(entry)) continue;
    const parent = entry.agent?.parent;
    const parentId = parent !== null && typeof parent === 'object' ? str(parent.id) : null;
    if (parentId === null || parentId === entry.id || !byId.has(parentId)) continue;
    entry.parentId = parentId;
    const siblings = children.get(parentId);
    if (siblings) siblings.push(entry);
    else children.set(parentId, [entry]);
  }
  const related = (entry) => listed(entry) && (entry.parentId !== null || children.has(entry.id));
  const result = entries.filter((entry) => !related(entry)).sort(newer);
  const seen = new Set();
  const visit = (entry) => {
    if (seen.has(entry)) return;
    seen.add(entry);
    result.push(entry);
    for (const child of [...(children.get(entry.id) ?? [])].sort(newer)) visit(child);
  };
  const linked = entries.filter(related);
  for (const root of linked.filter((entry) => entry.parentId === null).sort(newer)) visit(root);
  result.push(...linked.filter((entry) => !seen.has(entry)).sort(newer));
  return result.map((entry) => entry.agent);
}

/**
 * @typedef {{ id: string | null, mark: string, workingMode: 'monitoring' | null, icon: 'claude' | 'codex' | 'antigravity' | 'gemini' | 'other' | 'none', typeLabel: string,
 *   elapsed: string | null, label: string, detail: string | null }} MarkView
 */

/**
 * worktree のエージェントを印の並び（orderAgents の順）にする。max を超えたら先頭の max−1 個と、残りの数の overflow。
 * @param {any} worktree 要約の worktrees の1つ
 * @param {{ now?: number, max?: number }} [options]
 * @returns {{ marks: MarkView[], overflow: { count: number, label: string } | null }}
 */
export function buildMarks(worktree, { now, max = 4 } = {}) {
  const agents = Array.isArray(worktree?.agents) ? worktree.agents : [];
  const limit = Number.isInteger(max) && max >= 1 ? max : 4;
  const all = orderAgents(agents).map((agent) => markView(agent, now));
  if (all.length <= limit) return { marks: all, overflow: null };
  const shown = all.slice(0, limit - 1);
  const count = all.length - shown.length;
  return { marks: shown, overflow: { count, label: `ほか ${count} 件` } };
}
