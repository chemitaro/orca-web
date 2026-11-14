// エージェントの印の部品。SpecDock が import する入口。
// 要約（GET /api/worktrees/summary）を1つの輪で読み（watchWorktreeSummary）、worktree ごとの置き場に印を描く（renderAgentMarks）。
// 文字は textContent、SVG は createElementNS だけで作り、HTML として解かない（innerHTML を使わない）。
import { AGENT_ICONS, APP_ICONS, STATE_ICONS } from './agent-marks-icons.js';
import { buildMarks } from './agent-marks-view.js';

export { AGENT_ICONS, APP_ICONS, iconKey, STATE_ICONS } from './agent-marks-icons.js';
export { buildMarks, findWorktree, formatElapsed, MARK_LABELS, MARKS } from './agent-marks-view.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZES = ['sm', 'md'];
// 表の項目 → SVG の属性。決めた項目だけを写す。
const PATH_ATTRS = [
  ['d', 'd'],
  ['fill', 'fill'],
  ['fillRule', 'fill-rule'],
  ['stroke', 'stroke'],
  ['strokeWidth', 'stroke-width'],
  ['strokeDasharray', 'stroke-dasharray'],
  ['strokeLinecap', 'stroke-linecap'],
  ['strokeLinejoin', 'stroke-linejoin'],
];
// スリープの月（自前の形）。
const MOON = {
  viewBox: '0 0 16 16',
  paths: [{ d: 'M10.5 2a6 6 0 1 0 3.5 10.9A5 5 0 0 1 10.5 2z', fill: 'currentColor' }],
};

function svg(doc, shape, className) {
  const root = doc.createElementNS(SVG_NS, 'svg');
  root.setAttribute('viewBox', shape.viewBox);
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('focusable', 'false');
  if (className) root.setAttribute('class', className);
  for (const p of shape.paths) {
    const path = doc.createElementNS(SVG_NS, 'path');
    for (const [key, attr] of PATH_ATTRS) {
      if (typeof p[key] === 'string') path.setAttribute(attr, p[key]);
    }
    root.append(path);
  }
  return root;
}

/**
 * 状態の印（STATE_ICONS の鍵）の SVG。aria-hidden で、意味は添える文字や読み上げの名前が持つ。受け箱と Run の木も使う。
 * @param {any} doc document
 * @param {'monitoring'} key
 * @param {string} [className]
 */
export function stateIcon(doc, key, className = 'orca-mark-state') {
  return svg(doc, STATE_ICONS[key], className);
}

/**
 * アプリのロゴ（APP_ICONS の鍵）の SVG。aria-hidden で、意味はボタンの読み上げの名前が持つ。開くボタンの部品が使う。
 * shapes に同じ形の表を渡せば、その表から描く（開くボタンの回る印とチェック）。
 * @param {any} doc document
 * @param {string} key
 * @param {string} [className]
 * @param {Record<string, { viewBox: string, paths: Array<Record<string, string>> }>} [shapes]
 */
export function appIcon(doc, key, className, shapes = APP_ICONS) {
  return svg(doc, shapes[key], className);
}

function span(doc, className, text) {
  const node = doc.createElement('span');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function markElement(doc, view, onSelect) {
  const node = doc.createElement(onSelect ? 'button' : 'span');
  if (onSelect) {
    node.type = 'button';
    node.addEventListener('click', () => onSelect({ id: view.id, detail: view.detail }));
  } else {
    node.setAttribute('role', 'img');
  }
  const monitoring = view.workingMode === 'monitoring';
  node.className = `orca-mark orca-mark--${view.mark}${monitoring ? ' orca-mark--monitoring' : ''}`;
  node.setAttribute('aria-label', view.label);
  node.setAttribute('title', view.label);
  // Orca の行の並び：状態の印を種類のロゴの左に置き、重ねない。
  if (monitoring) node.append(stateIcon(doc, 'monitoring'));
  const icon = span(doc, 'orca-mark-icon');
  icon.append(svg(doc, AGENT_ICONS[view.icon] ?? AGENT_ICONS.other));
  node.append(icon);
  if (view.mark === 'sleeping') node.append(svg(doc, MOON, 'orca-mark-moon'));
  if (view.elapsed !== null) node.append(span(doc, 'orca-mark-time', view.elapsed));
  return node;
}

/**
 * container の中を、worktree のエージェントの印で作り直す。onSelect を渡せば印はボタンになる。
 * @param {any} container 置き場の要素（ownerDocument で要素を作る）
 * @param {any} worktree 要約の worktrees の1つ（findWorktree の結果）
 * @param {{ now?: number, size?: string, max?: number, onSelect?: (picked: { id: string | null, detail: string | null }) => void }} [options]
 */
export function renderAgentMarks(container, worktree, { now = Date.now(), size = 'sm', max = 4, onSelect } = {}) {
  const doc = container.ownerDocument;
  const select = typeof onSelect === 'function' ? onSelect : null;
  const { marks, overflow } = buildMarks(worktree, { now, max });
  const root = span(doc, `orca-marks orca-marks--${SIZES.includes(size) ? size : 'sm'}`);
  for (const view of marks) root.append(markElement(doc, view, select));
  if (overflow) {
    const more = span(doc, 'orca-mark orca-mark--more', `+${overflow.count}`);
    more.setAttribute('role', 'img');
    more.setAttribute('aria-label', overflow.label);
    more.setAttribute('title', overflow.label);
    root.append(more);
  }
  container.replaceChildren(root);
  return root;
}

/**
 * `${base}/api/worktrees/summary` を間隔ごとに読み、文書を onDocument に渡す輪。
 * すぐに1回読み、終わってから次を予約する（重ならない）。画面が見えない間は読まず、見えたらすぐ読む。
 * @param {string} base orca-web の基（'' なら同じオリジン）
 * @param {{ onDocument?: (doc: any) => void, onError?: (err: any) => void, intervalMs?: number,
 *   fetchImpl?: (url: string, init: any) => Promise<any>, doc?: any,
 *   setTimer?: (fn: () => void, ms: number) => any, clearTimer?: (id: any) => void }} [options]
 * @returns {{ stop: () => void }}
 */
export function watchWorktreeSummary(
  base,
  {
    onDocument,
    onError,
    intervalMs = 10_000,
    fetchImpl = globalThis.fetch,
    doc = globalThis.document,
    setTimer = globalThis.setTimeout,
    clearTimer = globalThis.clearTimeout,
  } = {},
) {
  const url = `${String(base ?? '').replace(/\/+$/, '')}/api/worktrees/summary`;
  let stopped = false;
  let reading = false;
  let timer = null;

  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const schedule = () => {
    cancel();
    if (!stopped) timer = setTimer(tick, intervalMs);
  };

  async function read() {
    reading = true;
    try {
      const res = await fetchImpl(url, { cache: 'no-store' });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      const json = await res.json();
      if (!stopped) onDocument?.(json);
    } catch (err) {
      if (!stopped) onError?.(err);
    } finally {
      reading = false;
    }
    schedule();
  }

  function tick() {
    timer = null;
    if (stopped) return;
    if (doc?.hidden) {
      schedule();
      return;
    }
    read();
  }

  function onVisibility() {
    if (stopped || reading || doc.hidden) return;
    cancel();
    read();
  }

  doc?.addEventListener?.('visibilitychange', onVisibility);
  tick();

  return {
    stop() {
      stopped = true;
      cancel();
      doc?.removeEventListener?.('visibilitychange', onVisibility);
    },
  };
}
