// 指揮の画面（/apexes）。/api/apexes を 10 秒ごとに読み（輪は apexes-dom.js の startApexPolling）、
// 頂点を段に分けて textContent だけで描く。画面が隠れている間は読まず（通知を許可していれば 30 秒ごと）、見えたらすぐ読み直す。
// ?project= があればその repo に絞る。読めなければ前の内容を残して「更新できない」と示す。
// 頂点の行を押すと、右のペインに見出しと /embed/agent の枠を出し、?apex= で覚える（履歴は増やさない。iss-00077）。
// 選びの移り変わりは apexes-view.js の reduceSelection、枠の作り直しと切り替えの確かめは apexes-dom.js。
// 幅 900px 以上は2ペイン、狭い幅は1列で、選ぶと会話だけを出し「← 一覧」で戻る（CSS の apexes--selected）。
// 新着の点：選んだ頂点を 10 秒続けて出したら、見た時刻を localStorage に覚える（id と時刻だけ。使えなければ点を出さない）。
// 対応が必要の知らせ（iss-00081）：favicon を印付きに替え、通知を許可したタブでは、隠れている間も 30 秒ごとに読み、
// 対応が必要に入った頂点を1回だけデスクトップに通知する（判断は apexes-notify.js、出す口は apexes-dom.js）。
// チームの帯（iss-00079）：見出しの下、会話の上に、選んだ頂点の team の畳める帯を出す（組み立ては apexes-team-view.js、
// 描くのは apexes-team-dom.js）。描き直しても、同じ頂点の間は開いた帯とまとめを開いたままにする。
import {
  clearAgentFrame,
  createApexNotifier,
  createSeenStore,
  createSeenTracker,
  mayLeaveFrame,
  mountAgentFrame,
  renderHeadline,
  renderPaneHead,
  renderSection,
  startApexPolling,
} from './apexes-dom.js';
import { createNotifyTracker } from './apexes-notify.js';
import { readTeamState, renderTeamBand, revealTeamNode } from './apexes-team-dom.js';
import { buildTeamBand } from './apexes-team-view.js';
import {
  apexesApiPath,
  apexesFavicon,
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
const HIDDEN_POLL_MS = 30_000;

const els = {
  counts: /** @type {HTMLElement} */ (document.querySelector('#counts')),
  freshness: /** @type {HTMLElement} */ (document.querySelector('#freshness')),
  sections: /** @type {HTMLElement} */ (document.querySelector('#sections')),
  paneHead: /** @type {HTMLElement} */ (document.querySelector('#pane-head')),
  paneFrame: /** @type {HTMLElement} */ (document.querySelector('#pane-frame')),
  favicon: /** @type {HTMLLinkElement | null} */ (document.querySelector('#favicon')),
  notify: /** @type {HTMLElement | null} */ (document.querySelector('#notify')),
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
/** 今のチームの帯の頂点の id（替われば帯を閉じて描く）。 */
let teamApexId = null;

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
  seenTracker.show(selection.id, pane.remember?.lastActivityAt ?? null);
  document.body.classList.toggle('apexes--selected', pane.selected);
  if (!pane.selected) {
    openTarget = null;
    els.paneHead.replaceChildren();
    clearAgentFrame(els.paneFrame, pane.guide);
    return;
  }
  openTarget = pane.header.open;
  syncOpen();
  const previous = els.paneHead.querySelector('details[data-team-band]');
  const teamState = teamApexId === pane.header.id ? readTeamState(previous) : {};
  teamApexId = pane.header.id;
  const team = renderTeamBand(document, buildTeamBand(pane.remember, Date.now()), teamState);
  els.paneHead.replaceChildren(
    renderPaneHead(document, pane.header, { openRoot: openControl.root }),
    ...(team ? [team] : []),
  );
  mountAgentFrame(els.paneFrame, pane.header.id);
}

/** favicon の href を替える（同じ値なら触らない）。 */
function setFavicon(href) {
  if (els.favicon && els.favicon.getAttribute('href') !== href) els.favicon.setAttribute('href', href);
}

function render() {
  renderPane();
  if (!lastDoc) {
    const text = lastError ? `orca-web に接続できない（${lastError}）` : '読み込み中…';
    els.freshness.replaceChildren(renderFreshness(document, [{ text, kind: lastError ? 'bad' : 'info' }]));
    document.title = apexesTitle(0);
    setFavicon(apexesFavicon(0));
    return;
  }
  const view = buildApexesView(lastDoc, { now: Date.now(), error: lastError, selectedId: selection.id, seen: seenMap });
  document.title = view.title;
  setFavicon(view.favicon);
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
// 履歴の帯の四角を押すと、その節のまとめを開いて見せる。
els.paneHead.addEventListener('click', (event) => {
  const cell = /** @type {HTMLElement | null} */ (event.target)?.closest?.('button[data-team-target]');
  if (!cell) return;
  const band = els.paneHead.querySelector('details[data-team-band]');
  const found = revealTeamNode(band, cell.dataset.teamTarget ?? '');
  if (!found) return;
  for (const marked of els.paneHead.querySelectorAll('.team-node--target'))
    marked.classList.remove('team-node--target');
  found.classList.add('team-node--target');
  found.scrollIntoView({ block: 'nearest' });
});
els.paneHead.addEventListener('click', (event) => {
  const button = /** @type {HTMLElement | null} */ (event.target)?.closest?.('button[data-action="back"]');
  if (!button) return;
  changeSelection({ type: 'clear' });
});

// 通知の判断と出す口。押すと窓を前に出し、その頂点を選ぶ（切り替えの確かめは changeSelection が持つ）。
const notifyTracker = createNotifyTracker();
const notifier = createApexNotifier({
  doc: document,
  env: {
    Notification: globalThis.Notification,
    isSecureContext: window.isSecureContext,
    focus: () => window.focus(),
  },
  onOpen: (id) => changeSelection({ type: 'select', id }),
});
/** 見出しの「通知を許可」のボタン。許可が default のときだけ出し、答えが出たら描き直す。 */
function renderNotifyControl() {
  const control = notifier.renderControl(renderNotifyControl);
  els.notify?.replaceChildren(...(control ? [control] : []));
}
renderNotifyControl();

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
    notifier.deliver(notifyTracker.observe(doc), (key) => notifyTracker.markShown(key));
  } catch (error) {
    if (!isCurrent()) return;
    lastError = error.message;
    notifyTracker.observeFailure();
  }
  const next = lastDoc ? reduceSelection(selection, { type: 'document', doc: lastDoc }) : selection;
  if (next !== selection) applySelection(next);
  else render();
}

render();
startApexPolling({
  doc: document,
  load,
  delayMs: POLL_MS,
  keepAliveWhenHidden: () => notifier.keepAliveWhenHidden(),
  hiddenDelayMs: HIDDEN_POLL_MS,
});
