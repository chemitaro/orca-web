// 「Orca で開く」の iframe の中の処理。同じオリジンから短期のトークンを得て、開く口を呼ぶ。
// トークンはこのメモリーにだけ持ち、URL、記録、親の画面に出さない。結果は textContent で示す。

const params = new URLSearchParams(location.search);
const worktree = params.get('worktree') ?? '';
const agent = params.get('agent') ?? '';
const theme = params.get('theme');
const size = params.get('size');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
if (size === 'sm' || size === 'md') document.documentElement.dataset.size = size;

const button = /** @type {HTMLButtonElement} */ (document.getElementById('open'));
const status = /** @type {HTMLElement} */ (document.getElementById('status'));

/** 期限まで、この時間より短ければ取り直す。 */
const REFRESH_MARGIN_MS = 30_000;

/** @type {{ value: string, expiresAt: number } | null} */
let token = null;

const MESSAGES = {
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

/**
 * @param {string} text
 * @param {'info' | 'error'} [kind]
 */
function show(text, kind = 'info') {
  status.textContent = text;
  status.dataset.kind = kind;
  status.title = text;
}

async function fetchToken() {
  const res = await fetch('/api/token', {
    method: 'POST',
    mode: 'same-origin',
    credentials: 'omit',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const body = await res.json();
  token = { value: String(body.token), expiresAt: Date.parse(String(body.expiresAt)) };
}

async function ensureToken() {
  if (!token || token.expiresAt - Date.now() < REFRESH_MARGIN_MS) await fetchToken();
  return /** @type {{ value: string }} */ (token).value;
}

async function postOpen() {
  const value = await ensureToken();
  return fetch('/api/open', {
    method: 'POST',
    mode: 'same-origin',
    credentials: 'omit',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', 'x-orca-web-token': value },
    body: JSON.stringify(agent ? { worktree, agent } : { worktree }),
  });
}

async function open() {
  button.disabled = true;
  show('開いています…');
  try {
    let res = await postOpen();
    if (res.status === 401) {
      // 拒まれた要求は Orca に届いていないので、トークンを取り直して1回だけ送り直す。
      token = null;
      res = await postOpen();
    }
    const body = await res.json().catch(() => ({}));
    if (body.ok === true) {
      show(body.mayCreateInitialTerminal ? '開きました（Orca が端末を作ることがあります）' : '開きました');
    } else {
      const message = MESSAGES[/** @type {keyof typeof MESSAGES} */ (body.error)] ?? `開けません（${res.status}）`;
      show(message, 'error');
    }
  } catch {
    show('orca-web につながりません', 'error');
  } finally {
    button.disabled = false;
  }
}

if (!worktree) {
  show('worktree の指定がありません', 'error');
} else {
  button.addEventListener('click', () => {
    void open();
  });
  button.disabled = false;
  fetchToken().catch(() => {
    // 押したときに取り直す。
    token = null;
  });
}
