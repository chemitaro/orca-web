// 送る欄の組み立て（D-03、D-04）。reduceSend、buildSendView、composerKeyAction は純粋な関数で、DOM に触らない。
// createSendFlow は、注入した口（書き込みの送り手、読み、時計）だけで要求を送る流れ。1回の送る操作で意図と確定を続けて1回ずつ送る。
// 押しの重なりは reduceSend が捨てる（同じ物を返す）。自動で送り直さず、照会も「確かめる」を押したときだけする。
// 値は文字にして返し、HTML として解かない（描く側は textContent を使う）。
import { AGENT_ICONS, iconKey } from './agent-marks-icons.js';

/** 5つの outcome の言葉。 */
export const OUTCOME_LABELS = {
  accepted: '受け付けた',
  input_accepted: '入力を受けた',
  submitted: '送信を確かめた',
  unknown: '結果不明',
  refused: '拒んだ',
};

/** warning の言葉（送った後の要確認と、記録の書き込みの失敗）。 */
export const WARNING_LABELS = {
  agent_not_verified: '要確認：Orca がエージェントを確かめずに書いたかもしれません。Orca の画面で確かめてください。',
  composer_may_hold_text: '本文が入力欄に残っているかもしれません。Orca の画面で確かめてください。',
  permission_after_submit: '送った後に権限の確認が出ました。Orca の画面で答えてください。',
  agent_mismatch: '確かめたのと別のエージェントに書いたかもしれません。Orca の画面で確かめてください。',
  after_record_failed: '結果を送信の記録に書けませんでした。',
  check_record_failed: '照会の結果を送信の記録に書けませんでした。',
};

const DELIVERED = new Set(['accepted', 'input_accepted', 'submitted']);
const OUTCOMES = new Set(Object.keys(OUTCOME_LABELS));

/** 理由（status の reason、誤りの reason、照会の結果など）の言葉。識別子ではなく言葉で示す。 */
const REASON_LABELS = {
  loading: '送れるか確かめています…',
  status_unavailable: '送れるか確かめられません（orca-web につながりません）',
  send_disabled: '設定で送信が止まっています（settings.json の sendEnabled）',
  agent_not_found: 'Orca にこのエージェントのタブがありません',
  unsupported: 'この Orca の版では、この経路で送れません',
  unreachable: 'Orca につながりません',
  runtime_changed: 'Orca が再起動しました',
  unknown_shape: 'Orca の応答の形を読めません',
  asleep: '端末がスリープ中です',
  no_session: 'セッションが結ばれていません',
  untabbed: 'Orca にこのエージェントのタブがありません',
  identity_unavailable: '端末の識別子が取れません',
  no_agent: '端末でエージェントが動いていません',
  'no-agent': '端末でエージェントが動いていません',
  permission: 'エージェントが権限の確認を待っています',
  foreground_unknown: '端末の前面のプロセスを読めません',
  shell_foreground: '端末の前面がシェルです（エージェントが動いていません）',
  foreground_mismatch: '端末の前面が、このエージェントではありません',
  state_out_of_date: '状態が古く、宛先を確かめられません',
  changed_since_shown: '宛先が変わりました。会話を確かめてから、もう一度送ってください',
  text_changed: '本文が変わりました',
  worktree_changed: 'worktree が変わりました',
  tab_changed: 'タブが変わりました',
  terminal_changed: '端末が変わりました',
  agent_changed: 'エージェントが変わりました',
  session_changed: 'セッションが変わりました',
  tab_gone: 'タブが閉じられました',
  expired: '受け付けの期限が過ぎました',
  unknown: '送信の票が無効です（使い済みか、orca-web が再起動した）',
  empty: '本文が空です',
  too_large: '本文が 16 KiB を超えています',
  control_character: '本文にタブと改行のほかの制御文字があります',
  not_string: '本文を読めません',
  busy: 'ほかの送信を処理しています',
  record_failed: '送信の記録を書けないので送りませんでした',
  record_unreadable: '送信の記録を読めません。記録の置き場を直してから、もう一度確かめてください',
  network: 'orca-web につながりません',
  not_sent: '送っていません',
  method_not_found: 'この Orca の版にない操作です',
  invalid_argument: 'Orca が引数を拒みました',
  response_lost: '送った結果の応答を受け取れませんでした',
  no_after_record: '送った後の記録がありません（送っている間に orca-web が止まった）',
  card_gone: 'Orca の画面から送ったカードが消えました',
  check_record_failed: '照会の結果を送信の記録に書けませんでした',
};

/** 誤りの code ごとの頭の言葉。 */
const ERROR_HEADS = {
  target_changed: '宛先が変わったので送りませんでした',
  not_sendable: '送れない状態です',
  ticket_invalid: '送れませんでした',
  invalid_text: '本文を送れません',
};
/** 頭の後に足す、次にすることの言葉。なくした操作（確認の画面、送る前の「確かめる」）は促さない。 */
const ERROR_TAILS = {
  target_changed: '。会話を確かめてから、もう一度送ってください',
  ticket_invalid: '。もう一度送ってください',
};

/** 送信の口が送る前に拒んだ誤り（これらは何も送っていない）。 */
const SEND_ERRORS = new Set([
  'invalid_request',
  'invalid_text',
  'send_disabled',
  'agent_not_found',
  'not_sendable',
  'target_changed',
  'ticket_invalid',
  'busy',
  'unsupported',
  'unknown_shape',
  'unreachable',
  'record_failed',
]);
/** 書き込みの守りが拒んだ誤り（要求は処理されていない）。 */
const GUARD_ERRORS = new Set([
  'token_invalid',
  'token_missing',
  'token_expired',
  'origin_rejected',
  'unsupported_media_type',
  'method_not_allowed',
  'payload_too_large',
]);
const SEND_ERROR_STATUS = new Set([400, 403, 404, 409, 501, 502, 503]);
const GUARD_ERROR_STATUS = new Set([401, 403, 405, 413, 415]);

const reasonText = (reason) => REASON_LABELS[reason] ?? String(reason);

/** 誤りの code と reason の言葉（1行）。知らない code でも code を示す。 */
export function describeError(code, reason) {
  if (GUARD_ERRORS.has(code)) return `orca-web が要求を拒みました（${code}）。もう一度送ってください`;
  const head = ERROR_HEADS[code] ?? REASON_LABELS[code] ?? `送れません（${code}）`;
  const middle = reason ? `：${reasonText(reason)}` : '';
  const tail = reason === 'changed_since_shown' ? '' : (ERROR_TAILS[code] ?? '');
  return `${head}${middle}${tail}`;
}

const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.length > 0;
const isFingerprint = (v) => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);

/**
 * 送る欄の状態（D-03）。target は画面が固定した「見ている宛先」の指紋、pendingTarget は固定と違う指紋を受けたときのその指紋。
 * operationId と ticket は sending で意図を受けた後（と unknown・checking）だけ持つ。warnings は warning の code の並び。
 * @typedef {{
 *   phase: 'disabled' | 'compose' | 'changed' | 'sending' | 'unknown' | 'checking',
 *   text: string,
 *   notice: { kind: 'error' | 'info', text: string } | null,
 *   reason: string | null,
 *   target: string | null,
 *   pendingTarget: string | null,
 *   agentType: string | null,
 *   pendingAgentType: string | null,
 *   operationId?: string,
 *   ticket?: string,
 *   warnings: string[],
 * }} SendState
 */

/**
 * 初めの状態。status を読むまで止めておく。
 * @returns {SendState}
 */
export function initialSend() {
  return {
    phase: 'disabled',
    text: '',
    notice: null,
    reason: 'loading',
    target: null,
    pendingTarget: null,
    agentType: null,
    pendingAgentType: null,
    warnings: [],
  };
}

/** phase を移す。送る操作の印（operationId、ticket）と、まだ固定していない指紋は持ち越さない。 */
function move(state, phase, patch = {}) {
  const { operationId: _op, ticket: _ticket, ...rest } = state;
  return { ...rest, phase, reason: null, pendingTarget: null, pendingAgentType: null, ...patch };
}
const errorNotice = (code, reason) => ({ kind: 'error', text: describeError(code, reason) });

function statusEvent(state, event) {
  const body = isRecord(event.body) ? event.body : {};
  const disabled = (reason) =>
    state.phase === 'disabled' && state.reason === reason ? state : move(state, 'disabled', { reason, notice: null });
  if (event.type === 'status-failed' || event.status !== 200) return disabled('status_unavailable');
  if (typeof body.enabled !== 'boolean' || typeof body.available !== 'boolean') return disabled('status_unavailable');
  if (!body.enabled) return disabled('send_disabled');
  if (!body.available) return disabled(isText(body.reason) ? body.reason : 'unknown_shape');
  if (!isFingerprint(body.target)) return disabled('unknown_shape');
  const agentType = isText(body.agentType) ? body.agentType : null;
  if (state.target === null || state.target === body.target) {
    if (state.phase === 'compose' && state.target === body.target && state.agentType === agentType) return state;
    const notice = state.phase === 'disabled' ? null : state.notice;
    return move(state, 'compose', { target: body.target, agentType, notice });
  }
  if (state.phase === 'changed' && state.pendingTarget === body.target) return state;
  return move(state, 'changed', { pendingTarget: body.target, pendingAgentType: agentType });
}

/** 意図と確定の誤りの応答を、送る前の拒み（何も送っていない）として読めれば、その code と reason を返す。 */
export function refusalOf(event) {
  const body = isRecord(event?.body) ? event.body : null;
  if (body?.ok !== false || typeof body.error !== 'string') return null;
  if (SEND_ERROR_STATUS.has(event.status) && SEND_ERRORS.has(body.error))
    return { error: body.error, reason: typeof body.reason === 'string' ? body.reason : undefined };
  if (GUARD_ERROR_STATUS.has(event.status) && GUARD_ERRORS.has(body.error)) return { error: body.error };
  return null;
}

function backFromRefusal(state, refusal) {
  if (refusal.error === 'send_disabled') return move(state, 'disabled', { reason: 'send_disabled', notice: null });
  if (refusal.error === 'target_changed' && refusal.reason === 'changed_since_shown')
    return move(state, 'changed', { notice: errorNotice(refusal.error, refusal.reason) });
  return move(state, 'compose', { notice: errorNotice(refusal.error, refusal.reason) });
}

function intentEvent(state, event) {
  if (event.type === 'intent-failed') return move(state, 'compose', { notice: errorNotice('network') });
  const body = isRecord(event.body) ? event.body : {};
  if (event.status === 200 && isText(body.ticket) && isText(body.operationId) && body.text === state.text)
    return { ...state, operationId: body.operationId, ticket: body.ticket };
  const refusal = refusalOf(event);
  return refusal ? backFromRefusal(state, refusal) : move(state, 'compose', { notice: errorNotice('unknown_shape') });
}

/** 送った後の warning の code を集める（detail.warning、recordWarning、checkWarning）。 */
const warningsOf = (...codes) => codes.filter((code) => isText(code));

/** 結果不明の帯へ。意図の操作の ID を持ったまま、本文を残す。 */
function toUnknown(state, notice = null, warnings = []) {
  const { ticket: _ticket, ...rest } = state;
  return { ...rest, phase: 'unknown', notice, warnings };
}

function confirmedEvent(state, event) {
  if (event.type === 'confirm-failed') return toUnknown(state, { kind: 'error', text: reasonText('response_lost') });
  const body = isRecord(event.body) ? event.body : {};
  if (event.status === 200 && OUTCOMES.has(body.outcome)) {
    const detail = isRecord(body.detail) ? body.detail : {};
    const warnings = warningsOf(detail.warning, body.recordWarning);
    if (DELIVERED.has(body.outcome))
      return move(state, 'compose', {
        text: '',
        notice: { kind: 'info', text: `送りました（${OUTCOME_LABELS[body.outcome]}）` },
        warnings,
      });
    if (body.outcome === 'refused') {
      const why = detail.refusedReason ?? detail.code;
      return move(state, 'compose', {
        notice: { kind: 'error', text: `送っていません${isText(why) ? `：${reasonText(why)}` : ''}` },
        warnings,
      });
    }
    return toUnknown(state, null, warnings);
  }
  const refusal = refusalOf(event);
  return refusal ? backFromRefusal(state, refusal) : toUnknown(state);
}

function queriedEvent(state, event) {
  const stay = (code, warnings = []) => ({
    ...state,
    phase: 'unknown',
    notice: { kind: 'error', text: reasonText(code) },
    warnings,
  });
  if (event.type === 'query-failed') return stay('network');
  const body = isRecord(event.body) ? event.body : {};
  if (event.status !== 200) return stay(isText(body.error) ? body.error : 'unknown_shape');
  const warnings = warningsOf(body.checkWarning);
  if (body.state === 'not_sent')
    return move(state, 'compose', { notice: { kind: 'info', text: '送っていません' }, warnings });
  if (body.state === 'in_progress')
    return {
      ...state,
      phase: 'unknown',
      notice: { kind: 'info', text: '送っている途中です。少し待ってもう一度確かめてください' },
      warnings,
    };
  const record = isRecord(body.record) ? body.record : null;
  if (body.state !== 'recorded' || !record || !OUTCOMES.has(record.outcome)) return stay('unknown_shape', warnings);
  if (body.checkError === 'unreachable') return stay('unreachable', warnings);
  const detail = isRecord(record.detail) ? record.detail : {};
  if (DELIVERED.has(record.outcome))
    return move(state, 'compose', {
      text: '',
      notice: { kind: 'info', text: `届いていました（${OUTCOME_LABELS[record.outcome]}）` },
      warnings: warningsOf(detail.warning, ...warnings),
    });
  if (record.outcome === 'refused')
    return move(state, 'compose', { notice: { kind: 'info', text: '送っていません' }, warnings });
  const why = isText(detail.code) ? `：${reasonText(detail.code)}` : '';
  return {
    ...state,
    phase: 'unknown',
    notice: { kind: 'error', text: `まだ分かりません${why}。Orca の画面で確かめてください` },
    warnings,
  };
}

/**
 * 送る欄の次の状態。受けない出来事には同じ状態（同じ物）を返す（重なった押しを捨てる）。
 * @param {SendState} state
 * @param {{ type: string, [key: string]: any }} event
 * @returns {SendState}
 */
export function reduceSend(state, event) {
  const { phase } = state;
  const editable = phase === 'disabled' || phase === 'compose' || phase === 'changed';
  switch (event.type) {
    case 'status':
    case 'status-failed':
      return editable ? statusEvent(state, event) : state;
    case 'adopt':
      if (phase !== 'changed' || !state.pendingTarget) return state;
      return move(state, 'compose', { target: state.pendingTarget, agentType: state.pendingAgentType, notice: null });
    case 'input':
      if (!editable) return state;
      return typeof event.text === 'string' && event.text !== state.text ? { ...state, text: event.text } : state;
    case 'submit':
      if (phase !== 'compose' || !state.text.trim() || !state.target) return state;
      return move(state, 'sending', { notice: null, warnings: [] });
    case 'intent':
    case 'intent-failed':
      return phase === 'sending' && !state.operationId ? intentEvent(state, event) : state;
    case 'confirmed':
    case 'confirm-failed':
      return phase === 'sending' && state.operationId ? confirmedEvent(state, event) : state;
    case 'query':
      return phase === 'unknown' && state.operationId ? { ...state, phase: 'checking', notice: null } : state;
    case 'queried':
    case 'query-failed':
      return phase === 'checking' ? queriedEvent(state, event) : state;
    case 'dismiss':
      return phase === 'unknown' ? move(state, 'compose', { notice: null }) : state;
    default:
      return state;
  }
}

/**
 * 入力欄の鍵の扱い（D-04）。'send' なら送る。null なら何もしない（既定の動き、つまり改行や変換の確定に任せる）。
 * 変換中（isComposing、keyCode 229）と押し続けの Enter では送らない。タッチが主の端末の Enter は改行。
 * @param {{ key?: string, shiftKey?: boolean, altKey?: boolean, ctrlKey?: boolean, metaKey?: boolean,
 *   isComposing?: boolean, keyCode?: number, repeat?: boolean }} event
 * @param {{ touchPrimary?: boolean }} [options]
 * @returns {'send' | null}
 */
export function composerKeyAction(event, { touchPrimary = false } = {}) {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.repeat) return null;
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) return 'send';
  if (touchPrimary || event.shiftKey || event.altKey) return null;
  return 'send';
}

const TYPE_LABEL_MAX = 40;

/** 種類の名前（Claude、Codex。ほかは agentType の文字。分からなければ null）。 */
function typeName(agentType) {
  if (!isText(agentType)) return null;
  const icon = iconKey(agentType);
  return icon === 'claude' || icon === 'codex' ? AGENT_ICONS[icon].label : agentType.slice(0, TYPE_LABEL_MAX);
}

/** 入力欄の placeholder（D-05）。理由は書かない（理由は知らせの欄に出す）。 */
export function placeholderFor(agentType, { touchPrimary = false } = {}) {
  const name = typeName(agentType);
  const head = name ? `${name} に送る` : 'エージェントに送る';
  return touchPrimary ? head : `${head}（Enter で送信、Shift+Enter で改行）`;
}

const CHANGED_TEXT = '宛先が変わりました（別のセッションか端末になりました）。会話を確かめてから続けてください';
const UNKNOWN_TEXT = '届いたか分かりません。自動では送り直しません。';

/**
 * 描くための形。editor は入力欄、button は送るボタン、message は1行の知らせ、warnings は warning の言葉の並び、
 * changed は宛先が変わった知らせ（adopt は「新しい宛先で続ける」を出すか）、unknown は結果不明の帯（busy は照会の間）。
 * 確認の画面、期限、送る前の「確かめる」は作らない。
 * @param {SendState} state
 * @param {{ touchPrimary?: boolean }} [options]
 */
export function buildSendView(state, { touchPrimary = false } = {}) {
  const { phase } = state;
  let message = state.notice ?? null;
  if (phase === 'disabled')
    message = { kind: state.reason === 'loading' ? 'info' : 'error', text: reasonText(state.reason) };
  if (phase === 'sending') message = { kind: 'info', text: '送っています…' };
  if (phase === 'checking') message = { kind: 'info', text: '記録と Orca に問い合わせています…' };
  if (phase === 'changed') message = null;
  const warnings = (state.warnings ?? []).map((code) => WARNING_LABELS[code] ?? `注意：${code}`);
  return {
    phase,
    chatHead: phase === 'disabled' ? '会話（読むだけ）' : '会話',
    editor: {
      disabled: !(phase === 'compose' || phase === 'changed'),
      placeholder: placeholderFor(state.agentType, { touchPrimary }),
    },
    button: { disabled: !(phase === 'compose' && state.text.trim() !== ''), busy: phase === 'sending' },
    message,
    warnings,
    changed: phase === 'changed' ? { text: CHANGED_TEXT, adopt: Boolean(state.pendingTarget) } : null,
    unknown: phase === 'unknown' || phase === 'checking' ? { text: UNKNOWN_TEXT, busy: phase === 'checking' } : null,
  };
}

/**
 * 送る流れ。要求は、reduceSend が状態を進めたときだけ1回送る。送る前の拒みの後は status を1回読み直す。
 * @param {{
 *   agentId: string,
 *   writer: { send: (path: string, method: 'POST', body: unknown) => Promise<{ status: number, body: any }> },
 *   read?: (url: string) => Promise<{ status: number, body: any }>,
 *   setTimer?: (fn: () => void, ms: number) => unknown,
 *   clearTimer?: (id: any) => void,
 *   onChange?: (state: SendState) => void,
 *   intentTimeoutMs?: number,
 *   confirmTimeoutMs?: number,
 * }} deps
 */
export function createSendFlow(deps) {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id));
  const onChange = deps.onChange ?? (() => {});
  const read =
    deps.read ??
    (async (url) => {
      const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    });
  const intentTimeoutMs = deps.intentTimeoutMs ?? 30_000;
  const confirmTimeoutMs = deps.confirmTimeoutMs ?? 60_000;
  let state = initialSend();

  function dispatch(event) {
    const prev = state;
    state = reduceSend(state, event);
    if (state === prev) return false;
    onChange(state);
    return true;
  }

  /** 時間切れつきで待つ。時間切れは投げる。 */
  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimer(() => reject(new Error('timeout')), ms);
      promise.then(
        (value) => {
          clearTimer(timer);
          resolve(value);
        },
        (error) => {
          clearTimer(timer);
          reject(error);
        },
      );
    });
  }

  async function refreshStatus() {
    if (state.phase !== 'disabled' && state.phase !== 'compose' && state.phase !== 'changed') return;
    try {
      const res = await read(`/api/send/status?agent=${encodeURIComponent(deps.agentId)}`);
      dispatch({ type: 'status', status: res.status, body: res.body });
    } catch {
      dispatch({ type: 'status-failed' });
    }
  }

  /** 1回の要求。応答を出来事にし、送る前の拒みなら status を1回読み直す。送り手が投げたか時間切れなら failed。 */
  async function request(path, body, ms, ok, failed) {
    let res;
    try {
      res = await withTimeout(deps.writer.send(path, 'POST', body), ms);
    } catch {
      dispatch({ type: failed });
      return;
    }
    dispatch({ type: ok, status: res.status, body: res.body });
    if (refusalOf(res)) await refreshStatus();
  }

  return {
    getState: () => state,
    input: (text) => dispatch({ type: 'input', text }),
    adopt: () => dispatch({ type: 'adopt' }),
    refreshStatus,
    async submit() {
      if (!dispatch({ type: 'submit' })) return;
      const { text, target } = state;
      await request(
        '/api/send/intent',
        { agent: deps.agentId, text, target },
        intentTimeoutMs,
        'intent',
        'intent-failed',
      );
      if (state.phase !== 'sending' || !state.operationId || !state.ticket) return;
      await request(
        '/api/send/confirm',
        { ticket: state.ticket, text },
        confirmTimeoutMs,
        'confirmed',
        'confirm-failed',
      );
    },
    async query() {
      if (!dispatch({ type: 'query' })) return;
      try {
        const url = `/api/send/${encodeURIComponent(state.operationId)}?check=1`;
        const res = await withTimeout(read(url), confirmTimeoutMs);
        dispatch({ type: 'queried', status: res.status, body: res.body });
      } catch {
        dispatch({ type: 'query-failed' });
      }
    },
    async dismiss() {
      if (dispatch({ type: 'dismiss' })) await refreshStatus();
    },
  };
}
