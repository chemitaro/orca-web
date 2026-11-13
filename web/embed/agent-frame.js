// エージェントの詳細とチャットの画面。詳細は /api/state を5秒ごとに読み、会話は /api/transcript/events（SSE）で受ける。
// 会話の下に送る欄（D-10）を置く。流れと状態は send-view.js、描くのは send-dom.js。送れないときは欄を止めて理由を示す。
// 文字はすべて textContent で入れる（会話の本文、ツールの出力、題名、送る本文は信頼しないデータ）。

import { createWriter } from '../write.js';
import { renderChatRow, renderDetail } from './agent-dom.js';
import { buildChat, buildDetail, errorLabel, initialChat, olderResult, reduceChat } from './agent-view.js';
import { renderSendPanel } from './send-dom.js';
import { buildSendView, createSendFlow } from './send-view.js';

const STATE_POLL_MS = 5_000;
/** 送れるかを読み直す間隔。読むのは書く欄か止まった間で、画面が見えているときだけ。 */
const SEND_STATUS_POLL_MS = 15_000;
const OPEN_ERRORS = {
  busy: 'ほかの開く処理が動いています',
  worktree_not_found: 'Orca にこの worktree がありません',
  target_gone: 'タブが閉じられていました',
  unavailable: 'Orca につながりません',
  runtime_changed: 'Orca が再起動しました。もう一度押してください',
  unsupported: 'この Orca の版では開けません',
  unknown_shape: 'Orca の応答を読めません',
  orca_error: 'Orca が誤りを返しました',
  unconfirmed: '開いたか確かめられません',
};

const params = new URLSearchParams(location.search);
const agentId = params.get('id') ?? '';
const theme = params.get('theme');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

const els = {
  title: document.getElementById('title'),
  detail: document.getElementById('detail'),
  open: /** @type {HTMLButtonElement} */ (document.getElementById('open')),
  openStatus: document.getElementById('open-status'),
  chatStatus: document.getElementById('chat-status'),
  session: document.getElementById('session'),
  older: /** @type {HTMLButtonElement} */ (document.getElementById('older')),
  log: document.getElementById('log'),
  scroller: document.getElementById('chat'),
  chatHead: document.getElementById('chat-head'),
  sendText: /** @type {HTMLTextAreaElement} */ (document.getElementById('send-text')),
  sendPanel: document.getElementById('send-panel'),
  send: document.getElementById('send'),
};

const writer = createWriter();
let detail = null;
let chat = initialChat();
/** 開いている折り畳みの key。描き直しても開いたままにする。 */
const openTools = new Set();

function renderChat({ stickToEnd }) {
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
  for (const row of buildChat(chat.messages)) els.log.append(renderChatRow(document, row, { open: openTools }));
  if (stickToEnd || nearEnd) els.scroller.scrollTop = els.scroller.scrollHeight;
}

els.log.addEventListener(
  'toggle',
  (event) => {
    const details = event.target;
    const key = details?.closest?.('li')?.dataset?.key;
    if (!key) return;
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

function renderDetailArea(state) {
  detail = buildDetail(state, agentId);
  // 開く先（worktree）が分からなければ押せなくする。
  els.open.disabled = !detail?.open;
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
    if (!detail) els.title.textContent = 'orca-web から状態を読めません';
  } finally {
    setTimeout(pollState, STATE_POLL_MS);
  }
}

// 「Orca で開く」は幅 390px 以下では出さない（iPhone の幅）。
const narrow = window.matchMedia('(max-width: 390px)');
const applyNarrow = () => {
  els.open.hidden = narrow.matches || !agentId;
  els.openStatus.hidden = narrow.matches || !agentId;
};
applyNarrow();
narrow.addEventListener('change', applyNarrow);
// 狭い幅では、会話を広く見せるため、詳細を畳んで始める（押すと広げられる）。
const detailBox = /** @type {HTMLDetailsElement} */ (document.getElementById('detail-box'));
if (narrow.matches) detailBox.open = false;

els.open.addEventListener('click', async () => {
  if (!detail?.open) return;
  els.open.disabled = true;
  els.openStatus.textContent = '開いています…';
  try {
    const { status, body } = await writer.send('/api/open', 'POST', detail.open);
    els.openStatus.textContent =
      body.ok === true ? '開きました' : (OPEN_ERRORS[body.error] ?? `開けません（${status}）`);
  } catch {
    els.openStatus.textContent = 'orca-web につながりません';
  } finally {
    els.open.disabled = false;
  }
});

const sendFlow = createSendFlow({ agentId, writer, onChange: () => renderSend() });

function renderSend() {
  const state = sendFlow.getState();
  const view = buildSendView(state);
  els.chatHead.textContent = view.chatHead;
  els.sendText.hidden = !view.editor.visible;
  els.sendText.disabled = view.editor.disabled;
  if (els.sendText.value !== state.text) els.sendText.value = state.text;
  els.sendPanel.replaceChildren(renderSendPanel(document, view));
}

els.sendText.addEventListener('input', () => sendFlow.input(els.sendText.value));
// ボタンは描き直すたびに作り直すので、まとめて受ける。押しの重なりは send-view.js の reduceSend が捨てる。
els.sendPanel.addEventListener('click', (event) => {
  const button = /** @type {HTMLElement | null} */ (event.target)?.closest?.('button[data-action]');
  if (!button || /** @type {HTMLButtonElement} */ (button).disabled) return;
  const name = button.dataset.action;
  if (name === 'submit') void sendFlow.submit();
  else if (name === 'confirm') void sendFlow.confirm();
  else if (name === 'cancel') sendFlow.cancel();
  else if (name === 'query') void sendFlow.query();
  else if (name === 'back' && sendFlow.back()) void sendFlow.refreshStatus();
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
  els.open.hidden = true;
  els.send.hidden = true;
} else {
  void pollState();
  connect();
  void pollSend();
}
