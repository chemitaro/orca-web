// エージェントの詳細とチャットの画面（読むだけ）。詳細は /api/state を5秒ごとに読み、会話は /api/transcript/events（SSE）で受ける。
// 文字はすべて textContent で入れる（会話の本文、ツールの出力、題名は信頼しないデータ）。送信の欄は置かない（iss-00013）。

import { createWriter } from '../write.js';
import { renderChatRow, renderDetail } from './agent-dom.js';
import { buildChat, buildDetail, errorLabel, initialChat, prependOlder, reduceChat } from './agent-view.js';

const STATE_POLL_MS = 5_000;
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
    const body = await res.json();
    if (res.ok && body.ok === true) {
      const top = els.scroller.scrollHeight - els.scroller.scrollTop;
      chat = prependOlder(chat, body, generation);
      renderChat({ stickToEnd: false });
      els.scroller.scrollTop = els.scroller.scrollHeight - top;
    } else if (body.error === 'session_changed') {
      els.chatStatus.textContent = 'セッションが変わりました。描き直しを待っています';
    } else {
      els.chatStatus.textContent = `前のページを読めない：${errorLabel(body.error)}`;
    }
  } catch {
    els.chatStatus.textContent = '前のページを読めない：orca-web につながりません';
  } finally {
    els.older.disabled = false;
  }
});

function renderDetailArea(state) {
  detail = buildDetail(state, agentId);
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
  els.open.hidden = narrow.matches;
  els.openStatus.hidden = narrow.matches;
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

if (!agentId) {
  els.title.textContent = 'エージェントの指定がありません';
  els.open.hidden = true;
} else {
  els.open.disabled = false;
  void pollState();
  connect();
}
