// 「Orca で開く」のボタンの部品。Orca のロゴと Open の1つの形で、埋め込みのボタン、詳細の見出し、受け箱が使う。
// 表示の値（aria-label、title、アイコン、押せるか）は open-control-view.js の openControlView だけで決める。
// 文字は textContent と属性、SVG は createElementNS（agent-marks.js の appIcon）だけで入れ、HTML として解かない。
// 送る中身は呼び手が決める（runOpen に渡す send）。部品はトークンも開く口の本体も持たない。
import { appIcon } from './agent-marks.js';
import { OPEN_DONE_MS, openControlView, openResult } from './open-control-view.js';

// 途中の回る印と、開けたのチェック（自前の小さな形）。ロゴは APP_ICONS.orca。
const OPEN_ICONS = {
  spinner: {
    viewBox: '0 0 16 16',
    paths: [
      {
        d: 'M8 2.5a5.5 5.5 0 1 1-5.5 5.5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '2',
        strokeLinecap: 'round',
      },
    ],
  },
  check: {
    viewBox: '0 0 16 16',
    paths: [
      {
        d: 'M3 8.5 6.5 12 13 4.5',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
    ],
  },
};

function span(doc, className) {
  const node = doc.createElement('span');
  node.className = className;
  return node;
}

function icon(doc, key) {
  const node = key === 'orca' ? appIcon(doc, 'orca') : appIcon(doc, key, undefined, OPEN_ICONS);
  node.setAttribute('data-icon', key);
  return node;
}

/**
 * @typedef {import('./open-control-view.js').OpenControlState} OpenControlState
 * @typedef {{ root: any, button: any, readonly state: OpenControlState,
 *   setState: (state: OpenControlState, message?: string) => void }} OpenControl
 */

/**
 * 開くボタンの部品を作る。root（span.orca-open）を呼び手が置く。
 * @param {any} doc document
 * @param {{ size?: 'sm' | 'md', label?: 'text' | 'none' }} [options]
 * @returns {OpenControl}
 */
export function createOpenControl(doc, { size = 'sm', label = 'text' } = {}) {
  const shape = label === 'none' ? 'none' : 'text';
  const root = span(doc, 'orca-open');
  root.dataset.size = size === 'md' ? 'md' : 'sm';
  root.dataset.label = shape;
  const button = doc.createElement('button');
  button.className = 'orca-open-button';
  button.type = 'button';
  const iconBox = span(doc, 'orca-open-icon');
  button.append(iconBox);
  if (shape === 'text') {
    const text = span(doc, 'orca-open-text');
    text.textContent = 'Open';
    button.append(text);
  }
  // 読み上げの領域。目に見えない形で、ボタンの外に置く（読み上げの名前に混ざらない）。
  const status = span(doc, 'orca-open-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.append(button, status);

  let current = /** @type {OpenControlState} */ ('idle');
  let shownIcon = '';
  const control = {
    root,
    button,
    get state() {
      return current;
    },
    /**
     * @param {OpenControlState} state
     * @param {string} [message]
     */
    setState(state, message = '') {
      current = state;
      const view = openControlView(state, { label: shape, message });
      button.setAttribute('aria-label', view.ariaLabel);
      button.title = view.title;
      button.disabled = view.disabled;
      button.setAttribute('aria-busy', view.busy ? 'true' : 'false');
      if (view.tone) root.dataset.tone = view.tone;
      else delete root.dataset.tone;
      if (shownIcon !== view.icon) {
        iconBox.replaceChildren(icon(doc, view.icon));
        shownIcon = view.icon;
      }
      status.textContent = view.status;
    },
  };
  control.setState('idle');
  return control;
}

/** done から idle に戻す時計（部品ごと）。 */
const timers = new WeakMap();

/**
 * 押したときの流れ。busy にして send を1回だけ呼び、結果を done か error にする。done は OPEN_DONE_MS の後に idle に戻す。
 * busy と missing の間は送らない（null を返す）。onState は状態が変わるたびに呼ぶ（受け箱が描き直した部品に写す）。
 * @param {OpenControl} control
 * @param {() => Promise<{ status: number, body: any }>} send 呼び手が `writer.send('/api/open', 'POST', 本体)` を呼ぶ関数
 * @param {{ onState?: (state: OpenControlState, message?: string) => void,
 *   setTimer?: (fn: () => void, ms: number) => any, clearTimer?: (id: any) => void }} [options]
 * @returns {Promise<{ state: 'done' | 'error', message: string } | null>}
 */
export async function runOpen(
  control,
  send,
  { onState, setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout } = {},
) {
  if (control.state === 'busy' || control.state === 'missing') return null;
  if (timers.has(control)) {
    clearTimer(timers.get(control));
    timers.delete(control);
  }
  const apply = (state, message) => {
    control.setState(state, message);
    onState?.(state, message);
  };
  apply('busy');
  let result;
  try {
    const { status, body } = await send();
    result = openResult({ kind: 'response', status, body: body && typeof body === 'object' ? body : {} });
  } catch {
    result = openResult({ kind: 'network' });
  }
  apply(result.state, result.message);
  if (result.state === 'done') {
    timers.set(
      control,
      setTimer(() => {
        timers.delete(control);
        if (control.state === 'done') apply('idle');
      }, OPEN_DONE_MS),
    );
  }
  return result;
}

/**
 * 描き直しで部品が作り直される画面（受け箱）のための、鍵（エージェントの id）ごとの最後の状態の板。
 * mount で新しい部品に最後の状態を戻し、open で押したときの流れを動かす。結果と done から idle への戻りは、
 * その鍵の最後の要求のものだけを、今の部品に写す（古い要求の時計が、新しい要求の途中の部品を idle に戻さない）。
 */
export function createOpenBoard() {
  /** @type {Map<string, { seq: number, state: OpenControlState, message: string }>} */
  const notes = new Map();
  /** @type {Map<string, OpenControl>} */
  const controls = new Map();
  let seq = 0;
  return {
    /** @param {string} key @param {OpenControl} control */
    mount(key, control) {
      controls.set(key, control);
      const note = notes.get(key);
      if (note && note.state !== 'idle') control.setState(note.state, note.message);
    },
    /**
     * @param {string} key
     * @param {OpenControl} control
     * @param {() => Promise<{ status: number, body: any }>} send
     * @param {{ setTimer?: (fn: () => void, ms: number) => any, clearTimer?: (id: any) => void }} [clock]
     */
    open(key, control, send, clock = {}) {
      if (control.state === 'busy' || control.state === 'missing') return Promise.resolve(null);
      const mine = ++seq;
      const onState = (/** @type {OpenControlState} */ state, message = '') => {
        if (notes.get(key)?.seq !== mine && state !== 'busy') return;
        notes.set(key, { seq: mine, state, message });
        const current = controls.get(key);
        if (current && current !== control) current.setState(state, message);
      };
      return runOpen(control, send, { ...clock, onState });
    },
  };
}
