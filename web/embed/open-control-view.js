// 「Orca で開く」の結果と表示の組み立て。DOM と送信には触れない。

export const OPEN_MESSAGES = {
  busy: 'ほかの開く処理が動いています',
  worktree_not_found: 'Orca にこの worktree がありません',
  target_gone: 'タブが閉じられていました',
  unavailable: 'Orca につながりません',
  runtime_changed: 'Orca が再起動しました。もう一度押してください',
  unsupported: 'この Orca の版では開けません',
  unknown_shape: 'Orca の応答を読めません',
  orca_error: 'Orca が誤りを返しました',
  unconfirmed: '開いたか確かめられません',
  device_not_connected: 'この端末から Orca のホストへの接続が見つかりません',
  device_unknown: '押した端末を確かめられません',
};

/** worktree は表示できたが、2つめの送信（タブを選ぶ）で失敗したときに先に出す言葉。 */
export const WORKTREE_SHOWN_MESSAGE = 'worktree は表示しましたが、タブを選べませんでした';

/**
 * @param {{ kind: 'response', status: number, body: Record<string, unknown> } | { kind: 'network' }} outcome
 * @returns {{ state: 'done' | 'error', message: string }}
 */
export function openResult(outcome) {
  if (outcome.kind === 'network') return { state: 'error', message: 'orca-web につながりません' };
  if (outcome.kind === 'response' && outcome.body.ok !== true) {
    const reason =
      typeof outcome.body.error === 'string' && Object.hasOwn(OPEN_MESSAGES, outcome.body.error)
        ? OPEN_MESSAGES[/** @type {keyof typeof OPEN_MESSAGES} */ (outcome.body.error)]
        : `開けません（${outcome.status}）`;
    return {
      state: 'error',
      message: outcome.body.worktreeShown === true ? `${WORKTREE_SHOWN_MESSAGE}（${reason}）` : reason,
    };
  }
  const sent =
    outcome.body.device === 'client' ? 'この端末の Orca に切り替えを送りました' : 'Orca に切り替えを送りました';
  return {
    state: 'done',
    message: outcome.body.mayCreateInitialTerminal ? `${sent}（Orca が端末を作ることがあります）` : sent,
  };
}

export const OPEN_DONE_MS = 2000;

/**
 * @typedef {'idle' | 'busy' | 'done' | 'error' | 'missing'} OpenControlState
 */

/**
 * @param {OpenControlState} state
 * @param {{ label?: 'text' | 'none', message?: string }} [options]
 * @returns {{ text: string | null, ariaLabel: string, title: string,
 *   icon: 'orca' | 'spinner' | 'check', disabled: boolean, busy: boolean,
 *   tone: 'warn' | null, status: string }}
 */
export function openControlView(state, { label = 'text', message = '' } = {}) {
  const busy = state === 'busy';
  const missing = state === 'missing';
  const title = missing
    ? message || 'worktree の指定がありません'
    : busy
      ? '開いています…'
      : state === 'idle'
        ? 'Orca で開く'
        : message;
  return {
    text: label === 'text' ? 'Open' : null,
    ariaLabel: label === 'text' ? 'Open（Orca で開く）' : 'Orca で開く',
    title,
    icon: busy ? 'spinner' : state === 'done' ? 'check' : 'orca',
    disabled: busy || missing,
    busy,
    tone: state === 'error' || missing ? 'warn' : null,
    status: state === 'idle' ? '' : title,
  };
}
