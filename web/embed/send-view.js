// 送る欄と確認の画面の組み立て（D-10）。reduceSend と build* は純粋な関数で、DOM に触らない。
// createSendFlow は、注入した口（書き込みの送り手、読み、時計）だけで要求を送る流れ。押しの重なりは reduceSend が捨て、
// 要求は状態が checking か sending に変わったときだけ1回送る。自動で送り直さず、照会も押したときだけする。
// 値は文字にして返し、HTML として解かない（描く側は textContent を使う）。

/** 5つの outcome の言葉。 */
export const OUTCOME_LABELS = {
  accepted: '受け付けた',
  input_accepted: '入力を受けた',
  submitted: '送信を確かめた',
  unknown: '結果不明',
  refused: '拒んだ',
};

const OUTCOME_DESCRIPTIONS = {
  accepted: 'Orca が受け付けました。エージェントに届くのはこれからです。',
  input_accepted: 'エージェントの入力欄が本文を受けました。',
  submitted: 'エージェントが本文を受けて動き始めたことを確かめました。',
  unknown: '届いたか分かりません。自動では送り直しません。「確かめる」で記録と Orca に問い合わせてください。',
  refused: '送っていません。',
};

/** warning の言葉。 */
export const WARNING_LABELS = {
  agent_not_verified: '要確認：Orca がエージェントを確かめずに書いたかもしれません。Orca の画面で確かめてください。',
  composer_may_hold_text: '本文が入力欄に残っているかもしれません。Orca の画面で確かめてください。',
  permission_after_submit: '送った後に権限の確認が出ました。Orca の画面で答えてください。',
  agent_mismatch: '確かめたのと別のエージェントに書いたかもしれません。Orca の画面で確かめてください。',
  after_record_failed: '結果を送信の記録に書けませんでした。',
};

const ROUTE_LABELS = { terminal: '端末', chat: '構造化 Chat' };
const OUTCOMES = new Set(Object.keys(OUTCOME_LABELS));
const DELIVERED = new Set(['accepted', 'input_accepted', 'submitted']);

/** 理由（status の reason、誤りの reason、照会の結果など）の言葉。 */
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
  state_out_of_date: '状態が古く、宛先を確かめられません',
  text_changed: '本文が確かめたときから変わりました',
  worktree_changed: 'worktree が変わりました',
  tab_changed: 'タブが変わりました',
  terminal_changed: '端末が変わりました',
  agent_changed: 'エージェントが変わりました',
  session_changed: 'セッションが変わりました',
  tab_gone: 'タブが閉じられました',
  expired: '確かめてから 60 秒が過ぎました',
  unknown: '確認の票が無効です（使い済みか、orca-web が再起動した）',
  empty: '本文が空です',
  too_large: '本文が 16 KiB を超えています',
  control_character: '本文にタブと改行のほかの制御文字があります',
  not_string: '本文を読めません',
  busy: 'ほかの送信を処理しています',
  record_failed: '送信の記録を書けないので送りませんでした',
  network: 'orca-web につながりません',
  not_sent: '送っていません',
  method_not_found: 'この Orca の版にない操作です',
  invalid_argument: 'Orca が引数を拒みました',
  response_lost: '確定の応答を受け取れませんでした',
  no_after_record: '送った後の記録がありません（送っている間に orca-web が止まった）',
};

/** 誤りの code ごとの頭の言葉。 */
const ERROR_HEADS = {
  target_changed: '宛先が変わったので送りませんでした',
  not_sendable: '送れない状態です',
  ticket_invalid: '確認が無効になったので送りませんでした',
  invalid_text: '本文を送れません',
};

/** 送信の口が送る前に拒んだ誤り（確定で、これらは何も送っていない）。 */
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

/** 誤りの code と reason の言葉。知らない code でも code を示す。 */
export function describeError(code, reason) {
  if (GUARD_ERRORS.has(code)) return `orca-web が要求を拒みました（${code}）。もう一度試してください`;
  const head = ERROR_HEADS[code] ?? REASON_LABELS[code] ?? `送れません（${code}）`;
  const tail = reason ? `：${reasonText(reason)}` : '';
  const again = ERROR_HEADS[code] && code !== 'invalid_text' ? '。もう一度確かめてください' : '';
  return `${head}${tail}${again}`;
}

const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.length > 0;

/**
 * 送る欄の状態（D-10）。
 * @typedef {{
 *   phase: 'disabled' | 'compose' | 'checking' | 'confirm' | 'sending' | 'result',
 *   purpose?: 'intent' | 'query',
 *   reason: string | null,
 *   text: string,
 *   notice: { kind: 'error' | 'info', text: string } | null,
 *   ticket?: string,
 *   operationId?: string,
 *   expiresAt?: number,
 *   preview?: Record<string, any>,
 *   result?: SendResultView,
 * }} SendState
 * @typedef {{ operationId: string, outcome: string, detail: Record<string, any>, recordWarning?: string, notSent?: boolean }} SendResultView
 */

/**
 * 初めの状態。status を読むまで止めておく。
 * @returns {SendState}
 */
export function initialSend() {
  return { phase: 'disabled', reason: 'loading', text: '', notice: null };
}

const toCompose = (state, notice = null) => ({ phase: 'compose', reason: null, text: state.text, notice });
const toDisabled = (state, reason) => ({ phase: 'disabled', reason, text: state.text, notice: null });
const errorNotice = (code, reason) => ({ kind: 'error', text: describeError(code, reason) });

function statusEvent(state, event) {
  if (event.type === 'status-failed') return toDisabled(state, 'status_unavailable');
  const body = isRecord(event.body) ? event.body : {};
  if (event.status !== 200 || typeof body.enabled !== 'boolean' || typeof body.available !== 'boolean')
    return toDisabled(state, 'status_unavailable');
  if (!body.enabled)
    return state.phase === 'disabled' && state.reason === 'send_disabled' ? state : toDisabled(state, 'send_disabled');
  if (!body.available) {
    const reason = isText(body.reason) ? body.reason : 'unknown_shape';
    return state.phase === 'disabled' && state.reason === reason ? state : toDisabled(state, reason);
  }
  return state.phase === 'compose' ? state : toCompose(state);
}

/** 確定と意図の誤りの応答を、送る前の拒み（何も送っていない）として読めれば、その code と reason を返す。 */
function refusalOf(event) {
  const body = isRecord(event.body) ? event.body : null;
  if (body?.ok !== false || typeof body.error !== 'string') return null;
  if (SEND_ERROR_STATUS.has(event.status) && SEND_ERRORS.has(body.error))
    return { error: body.error, reason: typeof body.reason === 'string' ? body.reason : undefined };
  if (GUARD_ERROR_STATUS.has(event.status) && GUARD_ERRORS.has(body.error)) return { error: body.error };
  return null;
}

function backFromRefusal(state, refusal) {
  if (refusal.error === 'send_disabled') return toDisabled(state, 'send_disabled');
  return toCompose(state, errorNotice(refusal.error, refusal.reason));
}

function intentEvent(state, event) {
  if (event.type === 'intent-failed') return toCompose(state, errorNotice('network'));
  const body = isRecord(event.body) ? event.body : {};
  if (
    event.status === 200 &&
    isText(body.ticket) &&
    isText(body.operationId) &&
    typeof body.expiresAt === 'number' &&
    isRecord(body.preview) &&
    body.text === state.text
  ) {
    return {
      phase: 'confirm',
      reason: null,
      text: state.text,
      notice: null,
      ticket: body.ticket,
      operationId: body.operationId,
      expiresAt: body.expiresAt,
      preview: body.preview,
    };
  }
  const refusal = refusalOf(event);
  return refusal ? backFromRefusal(state, refusal) : toCompose(state, errorNotice('unknown_shape'));
}

/** 確定の応答を受けられなかったときの結果（意図の操作の ID で結果不明）。 */
const lostResult = (state) => ({
  phase: 'result',
  reason: null,
  text: state.text,
  notice: null,
  operationId: state.operationId,
  preview: state.preview,
  result: { operationId: state.operationId, outcome: 'unknown', detail: { code: 'response_lost' } },
});

function confirmedEvent(state, event) {
  if (event.type === 'confirm-failed') return lostResult(state);
  const body = isRecord(event.body) ? event.body : {};
  if (event.status === 200 && OUTCOMES.has(body.outcome)) {
    const result = {
      operationId: isText(body.operationId) ? body.operationId : state.operationId,
      outcome: body.outcome,
      detail: isRecord(body.detail) ? body.detail : {},
      ...(body.recordWarning === 'after_record_failed' ? { recordWarning: 'after_record_failed' } : {}),
    };
    return { phase: 'result', reason: null, text: state.text, notice: null, operationId: result.operationId, result };
  }
  const refusal = refusalOf(event);
  return refusal ? backFromRefusal(state, refusal) : lostResult(state);
}

function queriedEvent(state, event) {
  const keep = { ...state, phase: 'result' };
  if (event.type === 'query-failed') return { ...keep, notice: errorNotice('network') };
  const body = isRecord(event.body) ? event.body : {};
  if (event.status !== 200) {
    const refusal = refusalOf(event);
    return { ...keep, notice: errorNotice(refusal?.error ?? 'unknown_shape', refusal?.reason) };
  }
  if (body.state === 'not_sent') {
    return {
      ...keep,
      notice: null,
      result: { operationId: state.operationId, outcome: 'refused', detail: { code: 'not_sent' }, notSent: true },
    };
  }
  if (body.state === 'in_progress') {
    return { ...keep, notice: { kind: 'info', text: '送っている途中です。少し待ってもう一度確かめてください。' } };
  }
  const record = isRecord(body.record) ? body.record : null;
  if (body.state === 'recorded' && record && OUTCOMES.has(record.outcome)) {
    const result = {
      operationId: state.operationId,
      outcome: record.outcome,
      detail: isRecord(record.detail) ? record.detail : {},
    };
    const notice =
      body.checkError === 'unreachable'
        ? { kind: 'error', text: 'Orca につながりません。少し待ってもう一度確かめてください。' }
        : result.outcome === 'unknown'
          ? { kind: 'info', text: 'まだ分かりません。Orca の画面で確かめてから、必要なら改めて送ってください。' }
          : null;
    return { ...keep, notice, result };
  }
  return { ...keep, notice: errorNotice('unknown_shape') };
}

/**
 * 送る欄の次の状態。受けない出来事には同じ状態（同じ物）を返す（2回目の押しを捨てる）。
 * @param {SendState} state
 * @param {{ type: string, [key: string]: any }} event
 * @returns {SendState}
 */
export function reduceSend(state, event) {
  const { phase } = state;
  switch (event.type) {
    case 'status':
    case 'status-failed':
      return phase === 'disabled' || phase === 'compose' ? statusEvent(state, event) : state;
    case 'input':
      if (phase !== 'disabled' && phase !== 'compose') return state;
      return typeof event.text === 'string' && event.text !== state.text ? { ...state, text: event.text } : state;
    case 'submit':
      if (phase !== 'compose' || !state.text.trim()) return state;
      return { phase: 'checking', purpose: 'intent', reason: null, text: state.text, notice: null };
    case 'intent':
    case 'intent-failed':
      return phase === 'checking' && state.purpose === 'intent' ? intentEvent(state, event) : state;
    case 'cancel':
      return phase === 'confirm' ? toCompose(state) : state;
    case 'expire':
      return phase === 'confirm' ? toCompose(state, errorNotice('ticket_invalid', 'expired')) : state;
    case 'confirm':
      if (phase !== 'confirm') return state;
      if (!(typeof event.now === 'number' && event.now < state.expiresAt))
        return toCompose(state, errorNotice('ticket_invalid', 'expired'));
      return { ...state, phase: 'sending' };
    case 'confirmed':
    case 'confirm-failed':
      return phase === 'sending' ? confirmedEvent(state, event) : state;
    case 'query':
      if (phase !== 'result' || state.result.outcome !== 'unknown' || state.result.notSent) return state;
      return { ...state, phase: 'checking', purpose: 'query', notice: null };
    case 'queried':
    case 'query-failed':
      return phase === 'checking' && state.purpose === 'query' ? queriedEvent(state, event) : state;
    case 'back':
      if (phase !== 'result') return state;
      return {
        phase: 'compose',
        reason: null,
        text: DELIVERED.has(state.result.outcome) ? '' : state.text,
        notice: null,
      };
    default:
      return state;
  }
}

const orDash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

/**
 * 確認の画面の項目（R-01）。
 * @param {any} preview
 * @param {string} text
 * @param {{ expiresAt?: number, formatTime?: (ms: number) => string }} [options]
 */
export function buildConfirm(preview, text, options = {}) {
  const p = isRecord(preview) ? preview : {};
  const rows = [
    { label: 'リポジトリ', text: orDash(p.repoName) },
    { label: 'worktree', text: orDash(p.worktreePath) },
    { label: 'ブランチ', text: orDash(p.branch) },
    { label: 'エージェント', text: orDash(p.agentType) },
    { label: '題名', text: orDash(p.title) },
    { label: '状態', text: orDash(p.state) },
    { label: '経路', text: ROUTE_LABELS[p.route] ?? orDash(p.route) },
    { label: 'セッション', text: orDash(p.sessionShortId) },
  ];
  const format = options.formatTime ?? defaultTime;
  const expires = typeof options.expiresAt === 'number' ? `期限：${format(options.expiresAt)} まで（60 秒）` : '';
  return { rows, text, expires };
}

const DETAIL_KEYS = [
  'code',
  'method',
  'refusedReason',
  'stages',
  'provider',
  'observation',
  'dispatchState',
  'queuedState',
  'replayed',
];

/**
 * 結果の言葉（5つの outcome、warning、照会できるか）。
 * @param {{ operationId: string, outcome: string, detail?: Record<string, any>, recordWarning?: string, notSent?: boolean }} result
 */
export function buildResult(result) {
  const detail = isRecord(result.detail) ? result.detail : {};
  const warnings = [];
  if (typeof detail.warning === 'string') warnings.push(WARNING_LABELS[detail.warning] ?? `注意：${detail.warning}`);
  if (result.recordWarning) warnings.push(WARNING_LABELS[result.recordWarning] ?? `注意：${result.recordWarning}`);
  const detailText = DETAIL_KEYS.filter((k) => detail[k] !== undefined)
    .map((k) => `${k}=${Array.isArray(detail[k]) ? detail[k].join(',') : String(detail[k])}`)
    .join(' ');
  if (result.notSent) {
    return {
      outcome: 'refused',
      label: '送っていません（後から届いても送りません）',
      description: '本文を残して書く欄に戻れます。',
      warnings,
      detail: detailText,
      operationId: result.operationId,
      canQuery: false,
    };
  }
  let description = OUTCOME_DESCRIPTIONS[result.outcome] ?? '';
  if (result.outcome === 'refused') {
    const why = detail.refusedReason ?? (detail.code && detail.code !== 'not_sent' ? detail.code : null);
    if (why) description += `理由：${reasonText(why)}。`;
  }
  if (result.outcome === 'unknown' && detail.code === 'response_lost')
    description = `${reasonText('response_lost')}。${description}`;
  return {
    outcome: result.outcome,
    label: OUTCOME_LABELS[result.outcome] ?? String(result.outcome),
    description,
    warnings,
    detail: detailText,
    operationId: result.operationId,
    canQuery: result.outcome === 'unknown',
  };
}

function defaultTime(ms) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ja-JP', { hour12: false });
}

const action = (name, label, disabled = false) => ({ action: name, label, disabled });

/**
 * 描くための形。editor は書く欄（textarea）、message は理由や知らせ、confirm と result は確認と結果の画面、actions はボタン。
 * @param {any} state
 * @param {{ formatTime?: (ms: number) => string }} [options]
 */
export function buildSendView(state, options = {}) {
  const { phase } = state;
  const querying = phase === 'checking' && state.purpose === 'query';
  const editorVisible = phase === 'disabled' || phase === 'compose' || (phase === 'checking' && !querying);
  let message = state.notice ?? null;
  if (phase === 'disabled')
    message = { kind: state.reason === 'loading' ? 'info' : 'error', text: reasonText(state.reason) };
  if (phase === 'checking' && !querying) message = { kind: 'info', text: '宛先を確かめています…' };
  if (phase === 'sending') message = { kind: 'info', text: '送っています…' };
  if (querying) message = { kind: 'info', text: '記録と Orca に問い合わせています…' };

  const confirm =
    phase === 'confirm' || phase === 'sending'
      ? buildConfirm(state.preview, state.text, { expiresAt: state.expiresAt, formatTime: options.formatTime })
      : null;
  const result = phase === 'result' || querying ? buildResult(state.result) : null;

  let actions;
  if (phase === 'disabled') actions = [action('submit', '確かめる', true)];
  else if (phase === 'compose') actions = [action('submit', '確かめる', !state.text.trim())];
  else if (phase === 'checking' && !querying) actions = [action('submit', '確かめています…', true)];
  else if (phase === 'confirm') actions = [action('confirm', '送る'), action('cancel', 'やめる')];
  else if (phase === 'sending') actions = [action('confirm', '送っています…', true), action('cancel', 'やめる', true)];
  else if (querying) actions = [action('query', '確かめています…', true), action('back', '書く欄に戻る', true)];
  else
    actions = [
      ...(result?.canQuery ? [action('query', '確かめる')] : []),
      action('back', result && DELIVERED.has(result.outcome) && !state.result.notSent ? '新しく書く' : '書く欄に戻る'),
    ];

  return {
    phase,
    chatHead: phase === 'disabled' ? '会話（読むだけ）' : '会話',
    editor: { visible: editorVisible, disabled: phase !== 'compose' },
    message,
    confirm,
    result,
    actions,
  };
}

/**
 * 送る流れ。要求は、reduceSend が checking か sending に進めたときだけ1回送る。
 * @param {{
 *   agentId: string,
 *   writer: { send: (path: string, method: 'POST', body: unknown) => Promise<{ status: number, body: any }> },
 *   read?: (url: string) => Promise<{ status: number, body: any }>,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => unknown,
 *   clearTimer?: (id: any) => void,
 *   onChange?: (state: any) => void,
 *   intentTimeoutMs?: number,
 *   confirmTimeoutMs?: number,
 * }} deps
 */
export function createSendFlow(deps) {
  const now = deps.now ?? Date.now;
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
  let expiryTimer = null;

  function dispatch(event) {
    const prev = state;
    state = reduceSend(state, event);
    if (state === prev) return false;
    if (state.phase === 'confirm' && prev.phase !== 'confirm') {
      expiryTimer = setTimer(
        () => {
          expiryTimer = null;
          dispatch({ type: 'expire' });
        },
        Math.max(0, state.expiresAt - now()),
      );
    } else if (state.phase !== 'confirm' && expiryTimer !== null) {
      clearTimer(expiryTimer);
      expiryTimer = null;
    }
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

  return {
    getState: () => state,
    input: (text) => dispatch({ type: 'input', text }),
    cancel: () => dispatch({ type: 'cancel' }),
    back: () => dispatch({ type: 'back' }),
    async refreshStatus() {
      if (state.phase !== 'disabled' && state.phase !== 'compose') return;
      try {
        const res = await read(`/api/send/status?agent=${encodeURIComponent(deps.agentId)}`);
        dispatch({ type: 'status', status: res.status, body: res.body });
      } catch {
        dispatch({ type: 'status-failed' });
      }
    },
    async submit() {
      if (!dispatch({ type: 'submit' })) return;
      const body = { agent: deps.agentId, text: state.text };
      try {
        const res = await withTimeout(deps.writer.send('/api/send/intent', 'POST', body), intentTimeoutMs);
        dispatch({ type: 'intent', status: res.status, body: res.body });
      } catch {
        dispatch({ type: 'intent-failed' });
      }
    },
    async confirm() {
      if (!dispatch({ type: 'confirm', now: now() }) || state.phase !== 'sending') return;
      const body = { ticket: state.ticket, text: state.text };
      try {
        const res = await withTimeout(deps.writer.send('/api/send/confirm', 'POST', body), confirmTimeoutMs);
        dispatch({ type: 'confirmed', status: res.status, body: res.body });
      } catch {
        dispatch({ type: 'confirm-failed' });
      }
    },
    async query() {
      if (!dispatch({ type: 'query' })) return;
      try {
        const res = await withTimeout(
          read(`/api/send/${encodeURIComponent(state.operationId)}?check=1`),
          confirmTimeoutMs,
        );
        dispatch({ type: 'queried', status: res.status, body: res.body });
      } catch {
        dispatch({ type: 'query-failed' });
      }
    },
  };
}
