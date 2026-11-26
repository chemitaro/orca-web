// 指揮の画面（/apexes）。/api/apexes を 10 秒ごとに読み（輪は apexes-dom.js の startApexPolling）、
// 頂点を段に分けて textContent だけで描く。画面が隠れている間は読まず（通知を許可していれば 30 秒ごと）、見えたらすぐ読み直す。
// ?project= があればその repo に絞る。読めなければ前の内容を残して「更新できない」と示す。
// 頂点の行を押すと、右のペインに見出しと /embed/agent の枠を出し、?apex= で覚える（履歴は増やさない。iss-00077）。
// 選びの移り変わりは apexes-view.js の reduceSelection、枠の作り直しと切り替えの確かめは apexes-dom.js。
// 幅 900px 以上は2ペイン、狭い幅は1列で、選ぶと会話だけを出し「← 一覧」で戻る（CSS の apexes--selected）。
// 詳細の切り替え（iss-00104）：チームの帯と対応のカードは見出しの「詳細」で出し入れする。狭い窓・低い窓では畳んで始める。
// 枠は head=compact で作り、枠の中の題名と Open の行を隠す（見出しと重なるため）。
// 行の「Orca で開く」（iss-00102）：開く先のある頂点の行ごとに共有の部品を置き、見出しと同じ1つの送る口で /api/open を呼ぶ。
// 新着の点：選んだ頂点を 10 秒続けて出したら、見た時刻を localStorage に覚える（id と時刻だけ。使えなければ点を出さない）。
// 対応が必要の知らせ（iss-00081）：favicon を印付きに替え、通知を許可したタブでは、隠れている間も 30 秒ごとに読み、
// 対応が必要に入った頂点を1回だけデスクトップに通知する（判断は apexes-notify.js、出す口は apexes-dom.js）。
// チームの帯（iss-00079）：見出しの下、会話の上に、選んだ頂点の team の畳める帯を出す（組み立ては apexes-team-view.js、
// 描くのは apexes-team-dom.js）。描き直しても、同じ頂点の間は開いた帯とまとめを開いたままにする。
// 対応のカード（iss-00080）：帯の下、会話の上に、頂点のチームで人の手が要るもののカードを出す（組み立ては apexes-cards-view.js）。
// ［見て答える］はメンバーの答えるだけの枠（compose=off）に作り直し、［頂点に戻る］で頂点の枠に戻す（メンバーは URL に出さない）。
// ［頂点に伝える］は頂点の枠（メンバーの枠なら作り直して）の入力欄に決めた型の下書きを入れるだけで、送らない
// （口は embed/draft-receiver.js。枠を作るたびに送り手に知らせ、今の枠の準備の知らせを待つ）。どの切り替えも mayLeaveFrame を通す。
import { buildApexCards, buildDraftText, draftNotice, paneFrameTarget } from './apexes-cards-view.js';
import {
  clearAgentFrame,
  createApexNotifier,
  createSeenStore,
  createSeenTracker,
  mayLeaveFrame,
  mountAgentFrame,
  renderApexCards,
  renderDraftNotice,
  renderHeadline,
  renderMemberBand,
  renderPaneExtras,
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
  COMPACT_PANE_QUERY,
  initialExtrasOpen,
  initialSelection,
  paneExtrasToggle,
  pruneSeen,
  reduceSelection,
  SEEN_DWELL_MS,
  selectionUrl,
  WIDE_MIN_PX,
} from './apexes-view.js';
import { createDraftSender } from './embed/draft-receiver.js';
import { createOpenBoard, createOpenControl, runOpen } from './embed/open-control.js';
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
/** 右のペインに出しているメンバーの答えるだけの枠（{ id, title }）。null なら頂点の枠。頂点を替えると外す。 */
let memberView = null;
/** 下書きの結果の帯（draftNotice）。頂点を替えると外す。 */
let draftResult = null;
/** 今のカード（key ごと）。押したときに読む。 */
let cardsByKey = new Map();
/** 詳細（チームの帯と対応のカード）を開いているか。null は未決め（窓の条件で決める）。切り替えたらページの間は保つ。 */
let extrasOpen = null;
/** 今の詳細の開閉。未決めなら窓の条件（COMPACT_PANE_QUERY）で決め、読めなければ開く（iss-00104 F-01）。 */
function currentExtrasOpen() {
  if (extrasOpen === null) {
    try {
      extrasOpen = initialExtrasOpen(window.matchMedia(COMPACT_PANE_QUERY).matches);
    } catch {
      extrasOpen = true;
    }
  }
  return extrasOpen;
}
/** 今の枠（作り直したら送り手に知らせる）。 */
let mountedFrame = null;

// 頂点の入力欄への下書きの送り手。今の枠の準備の知らせだけを覚える（同じオリジン・今の枠から）。
const draftSender = createDraftSender({
  selfOrigin: location.origin,
  onResult: (result) => {
    draftResult = draftNotice(result);
    renderPane();
  },
});
window.addEventListener('message', (event) => draftSender.handleMessage(event));
/** 枠を作り直したら送り手に知らせる（前の枠あての下書きと準備の印は捨てる）。 */
function noteFrame(frame) {
  if (frame === mountedFrame) return;
  mountedFrame = frame;
  draftSender.frameCreated(frame);
}

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
/** 開く口に送る1か所（見出しと行の両方が使う）。target は {worktree, agent}。 */
const sendOpen = (target) => writer.send('/api/open', 'POST', target);
const openControl = createOpenControl(document, { size: 'md' });
openControl.button.addEventListener('click', () => {
  const target = openTarget;
  if (!target) return;
  void runOpen(openControl, () => sendOpen(target)).then(syncOpen);
});
// 行ごとの「Orca で開く」（iss-00102）。描き直しで部品を作り直すので、頂点の id ごとの最後の状態を板に持ち、新しい部品へ戻す。
const rowOpenBoard = createOpenBoard();
const rowOpenOptions = {
  onOpenMount: (target, control) => rowOpenBoard.mount(target.agent, control),
  onOpen: (target, control) => void rowOpenBoard.open(target.agent, control, () => sendOpen(target)),
};
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
    noteFrame(null);
    return;
  }
  openTarget = pane.header.open;
  syncOpen();
  const previous = els.paneHead.querySelector('details[data-team-band]');
  const teamState = teamApexId === pane.header.id ? readTeamState(previous) : {};
  teamApexId = pane.header.id;
  const team = renderTeamBand(document, buildTeamBand(pane.remember, Date.now()), teamState);
  const cards = buildApexCards(pane.remember);
  cardsByKey = new Map(cards.map((card) => [card.key, card]));
  const target = paneFrameTarget(pane.header.id, memberView);
  // 詳細（チームの帯と対応のカード）は切り替えで出し入れする。メンバーの帯と下書きの帯はいつも出す（iss-00104 D-03）。
  const open = currentExtrasOpen();
  const extras = renderPaneExtras(document, [team, renderApexCards(document, cards)], open);
  const parts = [renderMemberBand(document, target.band), extras, renderDraftNotice(document, draftResult)].filter(
    (part) => part !== null,
  );
  // 切り替えにフォーカスがあれば、描き直した後の新しいボタンへ戻す。
  const refocus = els.paneHead.contains(document.activeElement) && document.activeElement?.dataset?.action === 'extras';
  const toggle = extras ? paneExtrasToggle({ open, cards }) : null;
  els.paneHead.replaceChildren(
    renderPaneHead(document, pane.header, { openRoot: openControl.root, extras: toggle }),
    ...parts,
  );
  if (refocus) /** @type {HTMLElement | null} */ (els.paneHead.querySelector('button[data-action="extras"]'))?.focus();
  noteFrame(mountAgentFrame(els.paneFrame, target.id, { compose: target.compose }));
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
    ...view.sections.map((section) =>
      renderSection(document, section, { expanded: opened.has(section.key), ...rowOpenOptions }),
    ),
  );
}

/** 選びを移し、URL の ?apex= を合わせて（履歴は増やさない）描き直す。 */
function applySelection(next) {
  if (next === selection) return;
  if (next.id !== selection.id) {
    memberView = null;
    draftResult = null;
  }
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

// 詳細の切り替え。開閉を反転して描き直す（頂点を替えても保つ）。
els.paneHead.addEventListener('click', (event) => {
  const button = /** @type {HTMLElement | null} */ (event.target)?.closest?.('button[data-action="extras"]');
  if (!button) return;
  extrasOpen = !currentExtrasOpen();
  renderPane();
});

/** 右のペインの枠を頂点かメンバーに替える。枠の中に処理中か結果不明の表示があれば、先に確かめる。替えたら真。 */
function changeFrame(next) {
  if ((next?.id ?? null) === (memberView?.id ?? null)) return true;
  if (!mayLeaveFrame(els.paneFrame, (text) => window.confirm(text))) return false;
  memberView = next;
  draftResult = null;
  renderPane();
  return true;
}
els.paneHead.addEventListener('click', (event) => {
  const button = /** @type {HTMLElement | null} */ (event.target)?.closest?.('button[data-action="to-apex"]');
  if (button) changeFrame(null);
});
// 対応のカードの操作。答えは枠の中の既存のカードと送る欄だけを通る（ここからは送らない）。
els.paneHead.addEventListener('click', (event) => {
  const button = /** @type {HTMLElement | null} */ (event.target)?.closest?.('button[data-card-action]');
  const card = cardsByKey.get(button?.dataset.cardKey ?? '');
  if (!button || !card) return;
  if (button.dataset.cardAction === 'answer' && card.kind === 'member') {
    changeFrame({ id: card.memberId, title: card.memberTitle });
  } else if (button.dataset.cardAction === 'tell' && card.kind === 'question') {
    // メンバーの枠なら頂点の枠に作り直してから（送り手は新しい枠の準備の知らせを待つ）。
    if (!changeFrame(null)) return;
    draftResult = null;
    draftSender.send(buildDraftText(card));
    renderPane();
  }
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
