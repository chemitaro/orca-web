// 指揮の画面（/apexes）。/api/apexes を 10 秒ごとに読み（輪は apexes-dom.js の startApexPolling）、
// 頂点を段に分けて textContent だけで描く。画面が隠れている間は読まず、見えたらすぐ読み直す。
// ?project= があればその repo に絞る。読めなければ前の内容を残して「更新できない」と示す。
// 頂点の行を押すと、右のペインに見出しと /embed/agent の枠を出し、?apex= で覚える（履歴は増やさない。iss-00077）。
// 選びの移り変わりは apexes-view.js の reduceSelection、枠の作り直しと切り替えの確かめは apexes-dom.js。
// 幅 900px 以上は2ペイン、狭い幅は1列で、選ぶと会話だけを出し「← 一覧」で戻る（CSS の apexes--selected）。
// 新着の点：選んだ頂点を 10 秒続けて出したら、見た時刻を localStorage に覚える（id と時刻だけ。使えなければ点を出さない）。
import {
  clearAgentFrame,
  createSeenStore,
  createSeenTracker,
  mayLeaveFrame,
  mountAgentFrame,
  renderHeadline,
  renderPaneHead,
  renderSection,
  startApexPolling,
} from './apexes-dom.js';
import {
  apexesApiPath,
  apexesTitle,
  apexFromSearch,
  buildApexesView,
  buildPane,
  initialSelection,
  pruneSeen,
  reduceSelection,
  SEEN_DWELL_MS,
  selectionUrl,
  WIDE_MIN_PX,
} from './apexes-view.js';
import { createOpenControl, runOpen } from './embed/open-control.js';
import { renderFreshness } from './inbox-dom.js';
import { projectFromSearch } from './inbox-view.js';
import { createWriter } from './write.js';

const POLL_MS = 10_000;

const els = {
  counts: /** @type {HTMLElement} */ (document.querySelector('#counts')),
  freshness: /** @type {HTMLElement} */ (document.querySelector('#freshness')),
  sections: /** @type {HTMLElement} */ (document.querySelector('#sections')),
  paneHead: /** @type {HTMLElement} */ (document.querySelector('#pane-head')),
  paneFrame: /** @type {HTMLElement} */ (document.querySelector('#pane-frame')),
};

const project = projectFromSearch(location.search);
let lastDoc = null;
let lastError = null;
let selection = initialSelection(location.search, {
  wide: window.matchMedia(`(min-width: ${WIDE_MIN_PX}px)`).matches,
});
/** 前に見えた選んだ頂点（一覧から消えても見出しに題名を出す）。 */
let remembered = null;
/** 今の見出しの開く先（押したときに読む）。 */
let openTarget = null;

// 見た時刻。読めなければ null で、点を出さない（一覧と会話はそのまま動く）。
const seenStore = createSeenStore(() => window.localStorage);
let seenMap = seenStore.load();
const seenTracker = createSeenTracker({
  dwellMs: SEEN_DWELL_MS,
  now: () => Date.now(),
  isVisible: () => document.visibilityState === 'visible',
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (timer) => clearTimeout(timer),
  onSeen: (id, at) => {
    const latest = seenStore.load();
    if (latest === null) return;
    seenMap = { ...latest, [id]: at };
    seenStore.save(seenMap);
    render();
  },
});
document.addEventListener('visibilitychange', () => seenTracker.visibility());

/** 文書を受けるたびに、古い記録と一覧にない id を捨てる（決めた条件のときだけ）。 */
function pruneStoredSeen(doc) {
  const latest = seenStore.load();
  seenMap = latest;
  if (latest === null) return;
  const pruned = pruneSeen(latest, doc, Date.now());
  if (Object.keys(pruned).length !== Object.keys(latest).length) {
    seenMap = pruned;
    seenStore.save(pruned);
  }
}

// 「Orca で開く」の共有の部品。描き直しても同じ要素を見出しへ移す（要求の途中の表示を保つ）。
const writer = createWriter();
const openControl = createOpenControl(document, { size: 'md' });
openControl.button.addEventListener('click', () => {
  const target = openTarget;
  if (!target) return;
  void runOpen(openControl, () => writer.send('/api/open', 'POST', target)).then(syncOpen);
});
function syncOpen() {
  if (openControl.state === 'busy') return;
  if (!openTarget) openControl.setState('missing', '開く先が分かりません');
  else if (openControl.state === 'missing') openControl.setState('idle');
}

function renderPane() {
  const pane = buildPane(lastDoc, selection, { now: Date.now(), remembered });
  remembered = pane.remember;
  seenTracker.show(selection.id);
  document.body.classList.toggle('apexes--selected', pane.selected);
  if (!pane.selected) {
    openTarget = null;
    els.paneHead.replaceChildren();
    clearAgentFrame(els.paneFrame, pane.guide);
    return;
  }
  openTarget = pane.header.open;
  syncOpen();
  els.paneHead.replaceChildren(renderPaneHead(document, pane.header, { openRoot: openControl.root }));
  mountAgentFrame(els.paneFrame, pane.header.id);
}

function render() {
  renderPane();
  if (!lastDoc) {
    const text = lastError ? `orca-web に接続できない（${lastError}）` : '読み込み中…';
    els.freshness.replaceChildren(renderFreshness(document, [{ text, kind: lastError ? 'bad' : 'info' }]));
    document.title = apexesTitle(0);
    return;
  }
  const view = buildApexesView(lastDoc, { now: Date.now(), error: lastError, selectedId: selection.id, seen: seenMap });
  document.title = view.title;
  els.counts.replaceChildren(renderHeadline(document, view.headline));
  els.freshness.replaceChildren(renderFreshness(document, view.freshness));
  // 畳んだ段を利用者が開いていたら、描き直しても開いたままにする。
  const opened = new Set(
    [...els.sections.querySelectorAll('section[data-stage] details[open]')].map(
      (details) => details.closest('section')?.dataset.stage,
    ),
  );
  els.sections.replaceChildren(
    ...view.sections.map((section) => renderSection(document, section, { expanded: opened.has(section.key) })),
  );
}

/** 選びを移し、URL の ?apex= を合わせて（履歴は増やさない）描き直す。 */
function applySelection(next) {
  if (next === selection) return;
  selection = next;
  if (apexFromSearch(location.search) !== selection.id) {
    const search = selectionUrl(location.search, selection.id);
    history.replaceState(history.state, '', `${location.pathname}${search}${location.hash}`);
  }
  render();
}

/** 頂点を替えるか、一覧へ戻る。枠の中に処理中か結果不明の表示があれば、先に確かめる。 */
function changeSelection(event) {
  if (event.type === 'select' && event.id === selection.id) return;
  if (!mayLeaveFrame(els.paneFrame, (text) => window.confirm(text))) return;
  applySelection(reduceSelection(selection, event));
}

els.sections.addEventListener('click', (event) => {
  const button = /** @type {HTMLElement | null} */ (event.target)?.closest?.('button[data-apex]');
  if (!button) return;
  changeSelection({ type: 'select', id: button.dataset.apex ?? '' });
});
els.paneHead.addEventListener('click', (event) => {
  const button = /** @type {HTMLElement | null} */ (event.target)?.closest?.('button[data-action="back"]');
  if (!button) return;
  changeSelection({ type: 'clear' });
});

/** 1回の読み。輪が新しい読みを始めていたら（isCurrent が偽）、古い結果で描かない。 */
async function load(isCurrent) {
  try {
    const res = await fetch(apexesApiPath(project), { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const doc = await res.json();
    if (!isCurrent()) return;
    lastDoc = doc;
    lastError = null;
    pruneStoredSeen(doc);
  } catch (error) {
    if (!isCurrent()) return;
    lastError = error.message;
  }
  const next = lastDoc ? reduceSelection(selection, { type: 'document', doc: lastDoc }) : selection;
  if (next !== selection) applySelection(next);
  else render();
}

render();
startApexPolling({ doc: document, load, delayMs: POLL_MS });
