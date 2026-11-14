// 印の組み立て（純粋な関数）。GET /api/worktrees/summary（orca-web.worktree-summary/v1）の worktree の1つから、
// エージェントごとの小さな印の形を作る。DOM、時計、fetch に触らない。
// 要約の項目は信頼しないデータ。決めた項目だけを拾い、題名や本文は返さない。
import { AGENT_ICONS, iconKey } from './agent-marks-icons.js';

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
// 並びの順：要対応（blocked、waiting）、working、unknown、done、sleeping。
const ORDER = { blocked: 0, waiting: 0, working: 1, unknown: 2, done: 3, sleeping: 4 };

const str = (value) => (typeof value === 'string' && value !== '' ? value : null);

/**
 * from（ISO 8601）から now（ミリ秒）までの経過を短い文字にする。'今' | 'N分' | 'N時間' | 'N日' | null。
 * @param {unknown} from
 * @param {unknown} now
 * @returns {string | null}
 */
export function formatElapsed(from, now) {
  if (typeof from !== 'string' || typeof now !== 'number' || !Number.isFinite(now)) return null;
  const at = Date.parse(from);
  if (Number.isNaN(at)) return null;
  const diff = now - at;
  if (diff < 0) return null;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '今';
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間`;
  return `${Math.floor(hours / 24)}日`;
}

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

function elapsedText(basis, elapsed) {
  if (elapsed === null) return null;
  if (basis === 'state') return elapsed === '今' ? 'この状態になったばかり' : `この状態になって ${elapsed}`;
  if (basis === 'worktree-activity') return elapsed === '今' ? '最後の活動は今' : `最後の活動から ${elapsed}`;
  return `経過 ${elapsed}`;
}

function markView(agent, now) {
  const mark = MARKS.includes(agent?.mark) ? agent.mark : 'unknown';
  const icon = iconKey(agent?.agentType);
  const typeLabel = typeLabelFor(agent?.agentType, icon);
  const elapsed = formatElapsed(agent?.elapsedFrom, now);
  const detail = str(agent?.detail);
  const parts = [typeLabel, MARK_LABELS[mark], elapsedText(agent?.elapsedBasis, elapsed)].filter((p) => p !== null);
  return {
    id: str(agent?.id),
    mark,
    icon,
    typeLabel,
    elapsed,
    label: parts.join('、'),
    detail: detail?.startsWith(DETAIL_PREFIX) ? detail : null,
  };
}

/**
 * @typedef {{ id: string | null, mark: string, icon: 'claude' | 'codex' | 'other' | 'none', typeLabel: string,
 *   elapsed: string | null, label: string, detail: string | null }} MarkView
 */

/**
 * worktree のエージェントを印の並びにする。max を超えたら先頭の max−1 個と、残りの数の overflow。
 * @param {any} worktree 要約の worktrees の1つ
 * @param {{ now?: number, max?: number }} [options]
 * @returns {{ marks: MarkView[], overflow: { count: number, label: string } | null }}
 */
export function buildMarks(worktree, { now, max = 4 } = {}) {
  const agents = Array.isArray(worktree?.agents) ? worktree.agents : [];
  const limit = Number.isInteger(max) && max >= 1 ? max : 4;
  const all = agents
    .map((agent, index) => ({ view: markView(agent, now), index }))
    .sort((a, b) => ORDER[a.view.mark] - ORDER[b.view.mark] || a.index - b.index)
    .map((entry) => entry.view);
  if (all.length <= limit) return { marks: all, overflow: null };
  const shown = all.slice(0, limit - 1);
  const count = all.length - shown.length;
  return { marks: shown, overflow: { count, label: `ほか ${count} 件` } };
}
