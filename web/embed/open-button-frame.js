// 「Orca で開く」の iframe の中の処理。同じオリジンから短期のトークンを得て、開く口を呼ぶ。
// トークンは write.js がメモリーにだけ持ち、URL、記録、親の画面に出さない。結果は textContent で示す。
import { createWriter } from '../write.js';

const params = new URLSearchParams(location.search);
const worktree = params.get('worktree') ?? '';
const agent = params.get('agent') ?? '';
const theme = params.get('theme');
const size = params.get('size');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
if (size === 'sm' || size === 'md') document.documentElement.dataset.size = size;

const button = /** @type {HTMLButtonElement} */ (document.getElementById('open'));
const status = /** @type {HTMLElement} */ (document.getElementById('status'));

const writer = createWriter();

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

async function open() {
  button.disabled = true;
  show('開いています…');
  try {
    const { status: code, body } = await writer.send('/api/open', 'POST', agent ? { worktree, agent } : { worktree });
    if (body.ok === true) {
      show(body.mayCreateInitialTerminal ? '開きました（Orca が端末を作ることがあります）' : '開きました');
    } else {
      const message = MESSAGES[/** @type {keyof typeof MESSAGES} */ (body.error)] ?? `開けません（${code}）`;
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
}
