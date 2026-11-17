// エージェントの詳細とチャットの画面。詳細は /api/state を5秒ごとに読み、会話は /api/transcript/events（SSE）で受ける。
// 詳細はいつも畳んで始め、利用者の開け閉めをそのまま残す（描き直しでも details を作り直さない）。見出しには稼働の印を1つ出す（D-08）。
// 会話の下に送る欄（D-05）を置く。流れと状態は send-view.js、描くのは send-dom.js。送れないときは欄を止めて理由を示す。
// 会話の質問はカード（D-05、iss-00048）で描く。選択と流れは question-view.js の板がカードの key ごとに持ち、描き直しでも保つ。
// 答える手段は answerer の表で、部分の answerVia（rpc は構造化 Chat の意図と確定、keys は端末の質問へのキーの組、
// message は後の発言。どれも callId か prompt で指す）で選ぶ。送れるかは送る欄と同じ /api/send/status の読み
// （enabled、answer、answerKeys、answerMessage、agentType）を使う。
// 会話の承認もカード（D-06、iss-00050）で描く。状態は approval-view.js の板がカードの key ごとに持ち、手段は approver の表
// （構造化 Chat は意図と確定で、送れるかは /api/send/status の approval。端末の許可の確認は promptId で指す意図と確定で、
// 送れるかは answerKeys（iss-00054）。答えられない承認は読むだけで「Orca で開く」）で選ぶ。
// 文字はすべて textContent で入れる（会話の本文、ツールの出力、題名、送る本文、質問と選択肢は信頼しないデータ）。

import { createWriter } from '../write.js';
import { createMarkdownCache, refreshTimes, renderChatRow, renderDetail, renderDetailMark } from './agent-dom.js';
import { watchWorktreeSummary } from './agent-marks.js';
import { buildChat, buildDetail, errorLabel, initialChat, olderResult, reduceChat } from './agent-view.js';
import {
  buildApprovalCard,
  createApprovalBoard,
  createChatApprover,
  createTerminalApprover,
  readOnlyApprover,
} from './approval-view.js';
import { createOpenBoard, createOpenControl, runOpen } from './open-control.js';
import {
  buildQuestionCard,
  createCallAnswerer,
  createChatAnswerer,
  createQuestionBoard,
  terminalAnswerer,
} from './question-view.js';
import { renderSendPanel } from './send-dom.js';
import { buildSendView, composerKeyAction, createSendFlow } from './send-view.js';

const STATE_POLL_MS = 5_000;
/** 会話の時刻（now・5m など）を描き直す間隔。 */
const TIME_REFRESH_MS = 30_000;
/** 送れるかを読み直す間隔。読むのは書く欄か止まった間で、画面が見えているときだけ。 */
const SEND_STATUS_POLL_MS = 15_000;
const params = new URLSearchParams(location.search);
const agentId = params.get('id') ?? '';
const theme = params.get('theme');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

const els = {
  title: document.getElementById('title'),
  detail: document.getElementById('detail'),
  openSlot: document.getElementById('open-slot'),
  chatStatus: document.getElementById('chat-status'),
  session: document.getElementById('session'),
  older: /** @type {HTMLButtonElement} */ (document.getElementById('older')),
  log: document.getElementById('log'),
  scroller: document.getElementById('chat'),
  chatHead: document.getElementById('chat-head'),
  sendText: /** @type {HTMLTextAreaElement} */ (document.getElementById('send-text')),
  sendButton: /** @type {HTMLButtonElement} */ (document.getElementById('send-button')),
  sendPanel: document.getElementById('send-panel'),
  send: document.getElementById('send'),
  detailMark: document.getElementById('detail-mark'),
};

const writer = createWriter();
// 「Orca で開く」の部品（md、題名の行の右端）。
const openControl = createOpenControl(document, { size: 'md' });
els.openSlot.append(openControl.root);
// 状態を読むまでは開く先が分からないので押せなくする（読めたら renderDetailArea が戻す）。
openControl.setState('missing', 'エージェントの状態を読んでいます');
let detail = null;
let chat = initialChat();
/** 開いている折り畳みの key。描き直しても開いたままにする。 */
const openTools = new Set();

/** 送れるかの最後の読み（GET /api/send/status の本体）。読めなければ 'failed'、まだなら null。質問のカードが使う。 */
let sendStatus = null;
/** 送る欄と質問のカードが共有する読み。送れるかの読みの結果を覚えて、変われば質問のカードを描き直す。 */
async function read(url) {
  const isStatus = url.startsWith('/api/send/status');
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    const result = { status: res.status, body: await res.json().catch(() => ({})) };
    if (isStatus) noteStatus(result.status === 200 ? result.body : 'failed');
    return result;
  } catch (error) {
    if (isStatus) noteStatus('failed');
    throw error;
  }
}
const statusShape = (status) =>
  status && typeof status === 'object'
    ? JSON.stringify([
        status.enabled,
        status.answer,
        status.approval,
        status.answerKeys,
        status.answerMessage,
        status.agentType,
      ])
    : String(status);
function noteStatus(status) {
  const changed = statusShape(status) !== statusShape(sendStatus);
  sendStatus = status;
  if (changed) renderCardRows();
}

/** 今の会話の質問の行（key ごと）。 */
let questionRows = new Map();
const questionBoard = createQuestionBoard({
  answerers: {
    chat: createChatAnswerer({ agentId, writer, read }),
    terminal: terminalAnswerer,
    keys: createCallAnswerer({ agentId, writer, read, mode: 'keys' }),
    message: createCallAnswerer({ agentId, writer, read, mode: 'message' }),
  },
  onChange: (key) => renderQuestionRow(key),
});
/** 今の会話の承認の行（key ごと）。 */
let approvalRows = new Map();
const approvalBoard = createApprovalBoard({
  approvers: {
    chat: createChatApprover({ agentId, writer, read }),
    terminal: createTerminalApprover({ agentId, writer, read }),
    readOnly: readOnlyApprover,
  },
  onChange: (key) => renderQuestionRow(key),
});
/** 質問と承認のカードの行を、みな描き直す（送れるかや開く先が変わったとき）。 */
function renderCardRows() {
  for (const key of [...questionRows.keys(), ...approvalRows.keys()]) renderQuestionRow(key);
}
/** 端末の質問のカードの「Orca で開く」の状態（カードを描き直しても、最後の状態を戻す）。 */
const openBoard = createOpenBoard();

function questionView(row) {
  const answerer = questionBoard.answerer(row.part);
  return buildQuestionCard(row.part, {
    key: row.key,
    selection: questionBoard.selection(row.key, row.part),
    flow: questionBoard.flow(row.key),
    availability: answerer.availability(row.part, sendStatus),
    answerText: row.answerText,
  });
}

function mountOpen(row, control) {
  openBoard.mount(row.key, control);
  if (!detail?.open && control.state !== 'busy') control.setState('missing', 'エージェントの状態を読んでいます');
  control.button.addEventListener('click', () => {
    const body = detail?.open;
    if (!body) return;
    void openBoard.open(row.key, control, () => writer.send('/api/open', 'POST', body));
  });
}

function approvalView(row) {
  return buildApprovalCard(row.part, {
    key: row.key,
    state: approvalBoard.state(row.key),
    availability: approvalBoard.approver(row.part).availability(row.part, sendStatus),
  });
}

/** assistant の本文の写し（D-04）。key と本文が同じ行は、前に描いた要素を新しい li に移して使う。 */
const markdownCache = createMarkdownCache(document);

const rowOptions = (now) => ({
  open: openTools,
  markdown: (row) => markdownCache.body(row),
  now,
  question: questionView,
  approval: approvalView,
  onOpenControl: mountOpen,
});

/** 変換中（IME）は描き直さない。終わってから描き直す。 */
let composing = false;
let deferred = false;
els.log.addEventListener('compositionstart', () => {
  composing = true;
});
els.log.addEventListener('compositionend', () => {
  composing = false;
  if (deferred) {
    deferred = false;
    renderChat({ stickToEnd: false });
  }
});

/** 描き直しの前に、カードの中のフォーカスを覚える（その他の欄の入力の位置も）。 */
function focusNote() {
  const active = document.activeElement;
  const card = active?.closest?.('section.question-card');
  if (!card || !els.log.contains(card)) return null;
  return {
    key: card.dataset.key,
    action: active.dataset.action ?? null,
    question: active.dataset.question ?? null,
    option: active.dataset.option ?? null,
    start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
  };
}

function restoreFocus(note) {
  if (!note?.action) return;
  for (const node of els.log.querySelectorAll('[data-action]')) {
    const card = node.closest('section.question-card');
    if (card?.dataset.key !== note.key) continue;
    if (node.dataset.action !== note.action) continue;
    if ((node.dataset.question ?? null) !== note.question || (node.dataset.option ?? null) !== note.option) continue;
    node.focus();
    if (note.start !== null && typeof node.setSelectionRange === 'function')
      node.setSelectionRange(note.start, note.end ?? note.start);
    return;
  }
}

/** 質問か承認の行を1つだけ描き直す（選択や流れが変わったとき）。 */
function renderQuestionRow(key) {
  const row = questionRows.get(key) ?? approvalRows.get(key);
  if (!row) return;
  if (composing) {
    deferred = true;
    return;
  }
  const current = [...els.log.children].find((li) => li.dataset.key === key);
  if (!current) return;
  const note = focusNote();
  current.replaceWith(renderChatRow(document, row, rowOptions(Date.now())));
  restoreFocus(note);
}

function renderChat({ stickToEnd }) {
  if (composing) {
    deferred = true;
    return;
  }
  const note = focusNote();
  const nearEnd = els.scroller.scrollHeight - els.scroller.scrollTop - els.scroller.clientHeight < 48;
  els.log.replaceChildren();
  if (chat.status === 'connecting') {
    els.chatStatus.textContent = '読み込み中…';
  } else if (chat.status === 'unavailable') {
    els.chatStatus.textContent = `読めない：${errorLabel(chat.error)}。Orca の画面で確かめてください。`;
    els.chatStatus.dataset.kind = 'error';
  } else {
    els.chatStatus.textContent = chat.messages.length === 0 ? 'まだ会話がありません' : '';
    els.chatStatus.dataset.kind = '';
  }
  els.session.textContent = chat.short ? `セッション ${chat.short}` : '';
  els.older.hidden = !(chat.status === 'ok' && chat.hasMore && chat.before);
  const now = Date.now();
  const rows = buildChat(chat.messages);
  markdownCache.prune(new Set(rows.map((row) => row.key)));
  questionRows = new Map(rows.filter((row) => row.kind === 'question').map((row) => [row.key, row]));
  questionBoard.prune(new Set(questionRows.keys()));
  approvalRows = new Map(rows.filter((row) => row.kind === 'approval').map((row) => [row.key, row]));
  approvalBoard.prune(new Set(approvalRows.keys()));
  for (const row of rows) els.log.append(renderChatRow(document, row, rowOptions(now)));
  restoreFocus(note);
  if (stickToEnd || nearEnd) els.scroller.scrollTop = els.scroller.scrollHeight;
}

// 質問のカードの押しは、描き直すたびに作り直すので、まとめて受ける。重なった押しは question-view.js の板が捨てる。
els.log.addEventListener('click', (event) => {
  const button = /** @type {HTMLElement | null} */ (event.target)?.closest?.('button[data-action]');
  const card = button?.closest('section.question-card');
  if (!button || !card || /** @type {HTMLButtonElement} */ (button).disabled) return;
  const key = card.dataset.key ?? '';
  const name = button.dataset.action;
  if (card.classList.contains('approval-card')) {
    const approval = approvalRows.get(key);
    if (!approval) return;
    // 確かめの段が出たら「答える」へ、やめたら元の選択肢へフォーカスを移す（押したボタンは描き直しで消える）。
    const focusIn = (selector) =>
      [...els.log.querySelectorAll(selector)]
        .find((n) => n.closest('section.question-card')?.dataset.key === key)
        ?.focus();
    if (name === 'option') {
      void approvalBoard.choose(key, approval.part, button.dataset.option, sendStatus);
      if (approvalBoard.state(key).pending !== null) focusIn('button[data-action="persist-confirm"]');
    } else if (name === 'persist-confirm') void approvalBoard.confirm(key, approval.part, sendStatus);
    else if (name === 'persist-cancel') {
      const pending = approvalBoard.state(key).pending;
      approvalBoard.cancel(key);
      if (pending !== null) focusIn(`button[data-action="option"][data-option="${CSS.escape(pending)}"]`);
    } else if (name === 'query') void approvalBoard.query(key, approval.part);
    else if (name === 'dismiss') approvalBoard.dismiss(key);
    return;
  }
  const row = questionRows.get(key);
  if (!row) return;
  const index = Number(button.dataset.question);
  if (name === 'option') questionBoard.toggleOption(key, row.part, index, button.dataset.option);
  else if (name === 'other') {
    if (questionBoard.toggleOther(key, row.part, index)) {
      const field = [...els.log.querySelectorAll('textarea[data-action="other-text"]')].find(
        (node) => node.closest('section.question-card')?.dataset.key === key && node.dataset.question === String(index),
      );
      field?.focus();
    }
  } else if (name === 'submit') void questionBoard.submit(key, row.part, sendStatus);
  else if (name === 'query') void questionBoard.query(key, row.part);
  else if (name === 'dismiss') questionBoard.dismiss(key);
});

// その他の文。描き直さず（入力中の欄と変換を壊さない）、送るボタンの押せるかだけを写す。
// 送れない理由（keys の制御文字）が出るか消えるときだけ、その行を描き直す（フォーカスと入力の位置は戻す）。
els.log.addEventListener('input', (event) => {
  const field = /** @type {HTMLTextAreaElement | null} */ (event.target);
  if (field?.dataset?.action !== 'other-text') return;
  const card = field.closest('section.question-card');
  const key = card?.dataset.key ?? '';
  const row = questionRows.get(key);
  if (!card || !row) return;
  questionBoard.setOther(key, row.part, Number(field.dataset.question), field.value);
  const view = questionView(row);
  const shown = card.querySelector('.question-hint')?.textContent ?? null;
  if (shown !== view.hint) {
    renderQuestionRow(key);
    return;
  }
  const submit = /** @type {HTMLButtonElement | null} */ (card.querySelector('button[data-action="submit"]'));
  if (submit) submit.disabled = view.button.disabled;
});

els.log.addEventListener(
  'toggle',
  (event) => {
    const details = event.target;
    const rowKey = details?.closest?.('li')?.dataset?.key;
    if (!rowKey) return;
    // 承認の「詳しく」は、カードの開け閉めと別の key で持つ。
    const key = details.dataset?.part === 'detail' ? `${rowKey}:detail` : rowKey;
    if (details.open) openTools.add(key);
    else openTools.delete(key);
  },
  true,
);

function applyEvent(event) {
  const before = chat;
  chat = reduceChat(chat, event);
  if (chat !== before) renderChat({ stickToEnd: event.type !== 'appended' });
}

function connect() {
  const source = new EventSource(`/api/transcript/events?agent=${encodeURIComponent(agentId)}`);
  for (const type of ['snapshot', 'replacement', 'appended', 'unavailable']) {
    source.addEventListener(type, (message) => {
      try {
        applyEvent({ type, ...JSON.parse(message.data) });
      } catch {
        applyEvent({ type: 'unavailable', error: 'unknown_shape' });
      }
    });
  }
  source.addEventListener('error', () => applyEvent({ type: 'disconnected' }));
}

els.older.addEventListener('click', async () => {
  if (!chat.before) return;
  els.older.disabled = true;
  const generation = chat.generation;
  try {
    const res = await fetch(
      `/api/transcript?agent=${encodeURIComponent(agentId)}&before=${encodeURIComponent(chat.before)}`,
      { cache: 'no-store' },
    );
    const result = olderResult(chat, { status: res.status, body: await res.json() }, generation);
    if (result.chat !== chat) {
      const top = els.scroller.scrollHeight - els.scroller.scrollTop;
      chat = result.chat;
      renderChat({ stickToEnd: false });
      els.scroller.scrollTop = els.scroller.scrollHeight - top;
    }
    if (result.notice) els.chatStatus.textContent = result.notice;
  } catch {
    els.chatStatus.textContent = '前のページを読めない：orca-web につながりません';
  } finally {
    els.older.disabled = false;
  }
});

/** 開く先（worktree）が分からなければ押せなくし、理由を title に出す。分かるようになれば戻す。要求の途中は変えない。 */
function syncOpenTarget() {
  if (openControl.state === 'busy') return;
  if (!detail) openControl.setState('missing', 'エージェントが見つかりません');
  else if (!detail.open) openControl.setState('missing');
  else if (openControl.state === 'missing') openControl.setState('idle');
}

function renderDetailArea(state) {
  const hadOpen = Boolean(detail?.open);
  detail = buildDetail(state, agentId);
  syncOpenTarget();
  // 端末の質問のカードの「Orca で開く」は、開く先が分かるようになったら押せるように描き直す。
  if (hadOpen !== Boolean(detail?.open)) renderCardRows();
  els.detail.replaceChildren();
  if (!detail) {
    els.title.textContent = 'エージェントが見つかりません';
    return;
  }
  els.title.textContent = detail.title;
  document.title = detail.title;
  els.detail.append(renderDetail(document, detail));
}

async function pollState() {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    renderDetailArea(await res.json());
  } catch {
    if (!detail) {
      els.title.textContent = 'orca-web から状態を読めません';
      if (openControl.state !== 'busy') openControl.setState('missing', 'orca-web から状態を読めません');
    }
  } finally {
    setTimeout(pollState, STATE_POLL_MS);
  }
}

// 「Orca で開く」は幅 390px 以下では出さない（iPhone の幅）。
const narrow = window.matchMedia('(max-width: 390px)');
const applyNarrow = () => {
  els.openSlot.hidden = narrow.matches || !agentId;
};
applyNarrow();
narrow.addEventListener('change', applyNarrow);

openControl.button.addEventListener('click', () => {
  const body = detail?.open;
  if (!body) return;
  // 要求の途中に開く先が消えていれば、結果の後に押せない状態へ戻す。
  void runOpen(openControl, () => writer.send('/api/open', 'POST', body)).then(syncOpenTarget);
});

const sendFlow = createSendFlow({ agentId, writer, read, onChange: () => renderSend() });

// タッチが主の端末では Enter で改行し、送るボタンで送る（D-04）。変われば描き直す。
const touch = window.matchMedia('(hover: none) and (pointer: coarse)');
touch.addEventListener('change', () => renderSend());

/** 入力欄の高さを本文に合わせる。上限は CSS の max-height（広い幅は 8 行ほど、狭い幅は 5 行ほど）で、超えると欄の中でスクロールする。 */
function fitComposer() {
  els.sendText.style.height = 'auto';
  els.sendText.style.height = `${els.sendText.scrollHeight}px`;
}

function renderSend() {
  const state = sendFlow.getState();
  const view = buildSendView(state, { touchPrimary: touch.matches });
  els.chatHead.textContent = view.chatHead;
  els.sendText.disabled = view.editor.disabled;
  els.sendText.placeholder = view.editor.placeholder;
  if (els.sendText.value !== state.text) {
    els.sendText.value = state.text;
    fitComposer();
  }
  els.sendButton.disabled = view.button.disabled;
  els.sendButton.setAttribute('aria-busy', view.button.busy ? 'true' : 'false');
  els.sendPanel.replaceChildren(renderSendPanel(document, view));
}

els.sendText.addEventListener('input', () => {
  sendFlow.input(els.sendText.value);
  fitComposer();
});
// Enter で送る（Shift+Enter と変換中は送らない）。流れが送れない状態なら submit は何もしない。
els.sendText.addEventListener('keydown', (event) => {
  if (composerKeyAction(event, { touchPrimary: touch.matches }) !== 'send') return;
  event.preventDefault();
  void sendFlow.submit();
});
els.sendButton.addEventListener('click', () => void sendFlow.submit());
// 帯のボタンは描き直すたびに作り直すので、まとめて受ける。押しの重なりは send-view.js の reduceSend が捨てる。
els.sendPanel.addEventListener('click', (event) => {
  const button = /** @type {HTMLElement | null} */ (event.target)?.closest?.('button[data-action]');
  if (!button || /** @type {HTMLButtonElement} */ (button).disabled) return;
  const name = button.dataset.action;
  if (name === 'query') void sendFlow.query();
  else if (name === 'dismiss') void sendFlow.dismiss();
  else if (name === 'adopt') sendFlow.adopt();
});

async function pollSend() {
  try {
    if (document.visibilityState === 'visible') await sendFlow.refreshStatus();
  } finally {
    setTimeout(pollSend, SEND_STATUS_POLL_MS);
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void sendFlow.refreshStatus();
});

renderSend();
if (!agentId) {
  els.title.textContent = 'エージェントの指定がありません';
  els.openSlot.hidden = true;
  els.send.hidden = true;
} else {
  void pollState();
  connect();
  void pollSend();
  // 詳細の見出しの印。要約を同じオリジンで読む（10 秒ごと、見えない間は読まない）。読めなければ置き場を空にする。
  watchWorktreeSummary('', {
    onDocument: (summary) => renderDetailMark(els.detailMark, summary, agentId, { now: Date.now() }),
    onError: () => els.detailMark.replaceChildren(),
  });
  setInterval(() => refreshTimes(els.log, Date.now()), TIME_REFRESH_MS);
}
