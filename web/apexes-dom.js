// 指揮の画面（/apexes）の段と行を DOM の要素にする。文字はすべて textContent で入れ、HTML として解かない
// （innerHTML を使わない）。SVG は部品（agent-marks.js）の createElementNS だけ。document を受けるので、
// テストは小さな偽の document で確かめる。見えない間は読まないポーリングの輪 startApexPolling もここに置く。
// 右のペイン（iss-00077 D-03）：枠は頂点を替えるたびに iframe の要素を作り直し（mountAgentFrame）、既にある枠の src を書き換えない。
// 外す前に、枠の中の送信の処理中の印を読んで確かめる（mayLeaveFrame、印は embed/unsettled.js）。
// 新着の点（D-06）：見た時刻の保存（createSeenStore、localStorage の読み書きはみな try/catch）と、
// 選んだ頂点を続けて出した時間を数える口（createSeenTracker）。
import { frameSrc, SEEN_STORAGE_KEY, SEEN_VERSION, SWITCH_CONFIRM_TEXT, UNSEEN_LABEL } from './apexes-view.js';
import { AGENT_ICONS, appIcon, stateIcon } from './embed/agent-marks.js';
import { frameUnsettled } from './embed/unsettled.js';
import { createPollLoop } from './poll-loop.js';

function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** 見出しの数（対応が必要・作業中・完了・新着）。emphasis の数だけ強調の class を付ける。 */
export function renderHeadline(doc, headline) {
  const box = make(doc, 'p', null, 'apex-counts');
  for (const part of headline) {
    const span = make(doc, 'span', part.text, part.emphasis ? 'count count--alert' : 'count');
    span.dataset.key = part.key;
    box.append(span);
  }
  return box;
}

function newTabLink(doc, href, text, className) {
  const a = make(doc, 'a', text, className);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/**
 * 1つの行。頂点の行は、押すと右のペインに出す選ぶボタン（data-apex）と、小さな「新しいタブで開く」のリンク。
 * 結べない行は、行の全体が /embed/agent?id= を新しいタブで開くリンク。
 */
export function renderRow(doc, row) {
  const li = make(doc, 'li', null, row.selected ? 'item apex apex--selected' : 'item apex');
  li.dataset.key = row.key;
  if (row.selected) li.dataset.selected = 'true';
  let a;
  if (row.selectable) {
    a = make(doc, 'button', null, 'apex-link apex-select');
    a.type = 'button';
    a.dataset.apex = row.key;
  } else {
    a = newTabLink(doc, row.href, null, 'apex-link');
  }

  const head = make(doc, 'span', null, 'apex-head');
  const icon = make(doc, 'span', null, 'apex-icon');
  icon.append(appIcon(doc, row.icon, undefined, AGENT_ICONS));
  head.append(icon);
  const mark = make(doc, 'span', null, `apex-mark apex-mark--${row.mark}`);
  if (row.monitoring) mark.append(stateIcon(doc, 'monitoring', 'state-icon'));
  mark.append(make(doc, 'span', row.markLabel));
  if (row.unseen) {
    const dot = make(doc, 'span', null, 'apex-unseen');
    dot.setAttribute('aria-label', UNSEEN_LABEL);
    dot.title = UNSEEN_LABEL;
    head.append(dot);
  }
  head.append(mark, make(doc, 'span', row.title, 'apex-title'));
  a.append(head);

  const meta = make(doc, 'span', null, 'meta');
  meta.append(make(doc, 'span', row.project ?? 'プロジェクト不明', row.project ? 'project' : 'project missing'));
  if (row.issue) meta.append(make(doc, 'span', row.issue, 'issue'));
  if (row.agentType) meta.append(make(doc, 'span', row.agentType, 'agent'));
  if (row.members) {
    const members = make(doc, 'span', `配下 ${row.members}`, 'members');
    members.title = row.membersLabel ?? '';
    meta.append(members);
  }
  if (row.elapsed) meta.append(make(doc, 'span', row.elapsed, 'elapsed'));
  a.append(meta);

  if (row.reasons.length > 0 || row.tags.length > 0) {
    const chips = make(doc, 'span', null, 'reason');
    for (const text of row.reasons) chips.append(make(doc, 'span', text, 'chip'));
    for (const text of row.tags) chips.append(make(doc, 'span', text, 'chip tag'));
    a.append(chips);
  }
  li.append(a);
  if (row.selectable) li.append(newTabLink(doc, row.href, '新しいタブで開く', 'apex-newtab'));
  return li;
}

/** 1つの段。collapsed の段は details で畳み、expanded なら開いて描く。 */
export function renderSection(doc, section, { expanded = false } = {}) {
  const node = make(doc, 'section', null, 'stage');
  node.dataset.stage = section.key;
  const heading = `${section.title}（${section.count}）`;
  const body = [];
  if (section.rows.length === 0) body.push(make(doc, 'p', 'なし', 'empty'));
  else {
    const ul = make(doc, 'ul', null, 'items');
    for (const row of section.rows) ul.append(renderRow(doc, row));
    body.push(ul);
  }
  if (section.collapsed) {
    const details = make(doc, 'details');
    details.open = expanded === true;
    details.append(make(doc, 'summary', heading), ...body);
    node.append(details);
  } else {
    node.append(make(doc, 'h2', heading), ...body);
  }
  return node;
}

/**
 * 右のペインの見出し（「← 一覧」、状態の印、題名、「一覧にありません」の札、「Orca で開く」の部品の置き場）。
 * openRoot は呼び手が持つ共有の部品（web/embed/open-control.js）の root で、描き直しても同じ要素を移して使う。
 * @param {any} doc
 * @param {any} header buildPane の header
 * @param {{ openRoot?: any }} [options]
 */
export function renderPaneHead(doc, header, { openRoot = null } = {}) {
  const box = make(doc, 'div', null, 'apex-pane-bar');
  const back = make(doc, 'button', '← 一覧', 'apex-back');
  back.type = 'button';
  back.dataset.action = 'back';
  box.append(back);
  const mark = make(doc, 'span', null, `apex-mark apex-mark--${header.mark}`);
  if (header.monitoring) mark.append(stateIcon(doc, 'monitoring', 'state-icon'));
  mark.append(make(doc, 'span', header.markLabel));
  box.append(mark, make(doc, 'span', header.title, 'apex-title apex-pane-title'));
  if (header.missingLabel) box.append(make(doc, 'span', header.missingLabel, 'chip tag apex-missing'));
  if (openRoot) {
    const slot = make(doc, 'span', null, 'apex-pane-open');
    slot.append(openRoot);
    box.append(slot);
  }
  return box;
}

const FRAME_TITLE = '選んだ頂点の会話';

/** 置き場の今の枠（なければ null）。 */
function currentFrame(slot) {
  return [...slot.children].find((child) => child.tagName === 'IFRAME') ?? null;
}

/**
 * 置き場に、頂点 id の /embed/agent の枠を出す。前と同じ id なら今の枠をそのまま返し、違えば子をすべて外して、
 * 新しい iframe の要素に src などを決めてから入れる。既にある枠の src を書き換えない（iframe の中のページを移さない）。
 */
export function mountAgentFrame(slot, id) {
  const current = currentFrame(slot);
  if (current && current.dataset.agentId === id) return current;
  const frame = slot.ownerDocument.createElement('iframe');
  frame.dataset.agentId = id;
  frame.className = 'apex-frame';
  frame.title = FRAME_TITLE;
  frame.referrerPolicy = 'same-origin';
  frame.src = frameSrc(id);
  slot.replaceChildren();
  slot.append(frame);
  return frame;
}

/** 置き場の枠を外し、案内の文を出す。 */
export function clearAgentFrame(slot, guide) {
  slot.replaceChildren(make(slot.ownerDocument, 'p', guide, 'apex-guide'));
}

/**
 * 今の枠を外してよいか。枠の中に処理中か結果不明の表示があれば confirm で聞き、選んだときだけ真。
 * 枠がない、印がない、読めない（例外）なら聞かずに真。
 */
export function mayLeaveFrame(slot, confirm) {
  const frame = currentFrame(slot);
  if (!frame || !frameUnsettled(frame)) return true;
  return confirm(SWITCH_CONFIRM_TEXT) === true;
}

/**
 * 見た時刻の保存（localStorage の鍵 SEEN_STORAGE_KEY、形 { v: 1, seen: { [id]: ISO 時刻 } }）。
 * 読み書きは try/catch で包む。使えなければ load は null（点を出さない）、save は偽を返す。壊れた値は空として読む。
 * @param {() => { getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} getStorage
 */
export function createSeenStore(getStorage) {
  return {
    load() {
      let text;
      try {
        text = getStorage().getItem(SEEN_STORAGE_KEY);
      } catch {
        return null;
      }
      if (text === null || text === undefined) return {};
      try {
        const parsed = JSON.parse(text);
        if (parsed?.v !== SEEN_VERSION || !parsed.seen || typeof parsed.seen !== 'object') return {};
        const seen = {};
        for (const [id, at] of Object.entries(parsed.seen)) if (typeof at === 'string') seen[id] = at;
        return seen;
      } catch {
        return {};
      }
    },
    save(seen) {
      try {
        getStorage().setItem(SEEN_STORAGE_KEY, JSON.stringify({ v: SEEN_VERSION, seen }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * 選んだ頂点を、別の頂点を選ばず、タブが見えたまま dwellMs 続けて出したら、onSeen(id, ISO 時刻) を1回呼ぶ。
 * show は選びが変わるたびに（同じ id でも）、visibility は visibilitychange で呼ぶ。隠れたら数え直す。
 * @param {{ dwellMs: number, now: () => number, isVisible: () => boolean,
 *   schedule: (fn: () => void, ms: number) => any, cancel: (timer: any) => void,
 *   onSeen: (id: string, at: string) => void }} options
 */
export function createSeenTracker({ dwellMs, now, isVisible, schedule, cancel, onSeen }) {
  let current = null;
  let timer = null;
  let done = false;
  const clear = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const arm = () => {
    clear();
    if (current === null || done || !isVisible()) return;
    const id = current;
    timer = schedule(() => {
      timer = null;
      if (current !== id || done || !isVisible()) return;
      done = true;
      onSeen(id, new Date(now()).toISOString());
    }, dwellMs);
  };
  return {
    show(id) {
      if (id === current) return;
      current = id;
      done = false;
      arm();
    },
    visibility() {
      if (isVisible()) {
        if (timer === null) arm();
      } else clear();
    },
  };
}

/**
 * 間隔ごとに load を呼ぶ輪（poll-loop.js）。画面が隠れたら予約を取り消し、隠れている間は次を予約しない。
 * 見えたらすぐ読み直す。最初から隠れていれば、見えるまで読まない。
 * @param {{ doc: any, load: (isCurrent: () => boolean) => Promise<void>, delayMs: number,
 *   setTimer?: (fn: () => void, ms: number) => any, clearTimer?: (id: any) => void }} options
 * @returns {{ restart: () => void, stop: () => void }}
 */
export function startApexPolling({
  doc,
  load,
  delayMs,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}) {
  let timer = null;
  let stopped = false;
  const clear = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const loop = createPollLoop({
    load,
    schedule: (fn, ms) => {
      if (stopped || doc.hidden) return null;
      timer = setTimer(() => {
        timer = null;
        fn();
      }, ms);
      return timer;
    },
    cancel: clear,
    delayMs,
  });
  const onVisibility = () => {
    if (doc.hidden) clear();
    else if (!stopped) loop.restart();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  if (!doc.hidden) loop.restart();
  return {
    restart() {
      if (!stopped) loop.restart();
    },
    stop() {
      stopped = true;
      clear();
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
