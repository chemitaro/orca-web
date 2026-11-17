// 承認のカードの組み立て（iss-00050 D-06）。選択、常に許可の確かめの段、カードの描く物、送る流れの状態は純粋な関数で、DOM に触らない。
// 流れ（idle → sending → done | refused | unknown）は question-view.js の initialFlow・reduceFlow を使う。
// 答える手段（approver）は `{ availability(part, status), submit(part, optionId, { confirmPersistent }), check?(operationId) }`。
// 構造化 Chat は createChatApprover（意図と確定を1回ずつ）、端末と答えられない承認は読むだけの readOnlyApprover。
// 自動で送り直さない。照会は「確かめる」を押したときだけ。値は文字にして返し、HTML として解かない（描く側は textContent を使う）。
import {
  checkOperation,
  initialFlow,
  QUESTION_REASONS,
  readSameOrigin,
  reasonTextFrom,
  reduceFlow,
  sendIntentConfirm,
} from './question-view.js';

/** 理由と結果の言葉（1か所）。質問の表を引き継ぎ、「質問」と書く言葉を承認の言葉で上書きする。 */
export const APPROVAL_REASONS = {
  ...QUESTION_REASONS,
  unsupported: 'この Orca の版では、ここから許可に答えられません',
  terminal_route: '端末のエージェントの許可は、Orca で答えてください',
  question_changed: '許可の確認が変わりました',
  question_gone: '許可の確認が見つかりません。Orca で確かめてください',
  question_not_found: '許可の確認が見つかりません',
  cancelled: '許可の確認は取り消されました',
  prompt_pending: '許可の確認はまだ答えを待っています',
  resolved_unverified: '許可の確認は答え済みですが、この答えか確かめられません',
  not_answerable: 'この許可は小窓では答えられません',
  persistent_unconfirmed: '確かめてから答えてください',
  unknown_option: '選択肢が変わりました',
  invalid_option: '選択肢が変わりました',
};

export const TERMINAL_APPROVAL_REASON = APPROVAL_REASONS.terminal_route;
export const READ_ONLY_APPROVAL_REASON = 'この許可は Orca で答えてください';
export const DEFAULT_APPROVAL_TITLE = '許可の確認';
const UNKNOWN_TEXT = '届いたか分かりません。自動では送り直しません';

const reasonText = reasonTextFrom(APPROVAL_REASONS);
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.length > 0;
const PERSISTENT = new Set(['allow_always', 'reject_always']);

const optionsOf = (part) => (isRecord(part) && Array.isArray(part.options) ? part.options : []);
const findOption = (part, optionId) => optionsOf(part).find((o) => o.id === optionId) ?? null;

/** 常に許可・常に拒否の選択肢か（確かめの段を出す）。 */
export const isPersistent = (option) => PERSISTENT.has(option?.intent);

/**
 * カードごとの状態の初め。pending は常に許可の確かめの段にいる選択肢、chosen は送っている選択肢。
 * @returns {{ flow: import('./question-view.js').QuestionFlow, pending: string | null, chosen: string | null }}
 */
export function initialApprovalState() {
  return { flow: initialFlow(), pending: null, chosen: null };
}

const editableFlow = (flow) => flow.phase === 'idle' || flow.phase === 'refused';

/**
 * 選択肢を押す。allow_always・reject_always は確かめの段（pending）にして送らない。ほかは送る印を返す。
 * 未回答でない、流れが受けない、知らない選択肢なら同じ状態で送らない。
 * @returns {{ state: ReturnType<typeof initialApprovalState>, submit: boolean, optionId: string | null }}
 */
export function choose(state, part, optionId) {
  const option = findOption(part, optionId);
  if (part?.state !== 'pending' || !option || !editableFlow(state.flow))
    return { state, submit: false, optionId: null };
  if (isPersistent(option)) return { state: { ...state, pending: option.id }, submit: false, optionId: null };
  return { state: state.pending === null ? state : { ...state, pending: null }, submit: true, optionId: option.id };
}

/** 確かめの段をやめる。何も送らない。 */
export function cancelPending(state) {
  return state.pending === null ? state : { ...state, pending: null };
}

/** 何が以後省かれるかの1行。選択肢の説明があればそれ。 */
export function persistentNote(part, option) {
  if (isText(option?.description)) return option.description;
  const what = part?.tool ?? part?.title ?? DEFAULT_APPROVAL_TITLE;
  return option?.intent === 'reject_always'
    ? `以後、同じ種類の確認が省かれ、自動で拒否されます（${what}）`
    : `以後、同じ種類の確認が省かれ、自動で許可されます（${what}）`;
}

/** Orca の approvalDetailPreview と同じ（先頭 512 字・4 行、続きがあれば「…」）。 */
export function detailPreview(detail) {
  const prefix = detail.slice(0, 512).split('\n', 4).join('\n');
  if (prefix.length === detail.length || prefix.trimEnd() === detail.trimEnd()) return detail;
  return `${prefix.replace(/[\uD800-\uDBFF]$/, '').trimEnd()}…`;
}

/** 答え済みの文。 */
function summaryOf(part) {
  if (part.state === 'cancelled') return '取り消されました';
  const option = isText(part.selectedOptionId) ? findOption(part, part.selectedOptionId) : null;
  if (!option) return '答え済み';
  const word = option.intent?.startsWith('allow_')
    ? '許可しました'
    : option.intent?.startsWith('reject_')
      ? '拒否しました'
      : '答えました';
  return `${word}：${option.label}`;
}

/** 流れの知らせ。 */
function noticeOf(flow) {
  switch (flow.phase) {
    case 'sending':
      return { kind: 'info', text: '送っています…' };
    case 'checking':
      return { kind: 'info', text: '記録と Orca に問い合わせています…' };
    case 'done':
      return { kind: 'info', text: '答えました' };
    case 'refused':
      return { kind: 'error', text: flow.result?.reason ?? APPROVAL_REASONS.not_sent };
    case 'unknown':
      return isText(flow.result?.note) ? { kind: 'error', text: flow.result.note } : null;
    default:
      return null;
  }
}

/**
 * カードの描く物。state が answered・cancelled なら閉じた形（summary に結果の文）。
 * availability は approver.availability の結果。open は「Orca で開く」を出すか（端末と答えられない承認の未回答）。
 * @param {any} part 会話の approval の部分
 * @param {{ key?: string, state?: ReturnType<typeof initialApprovalState>,
 *   availability?: { ok: true } | { ok: false, reason: string, open?: true } }} [options]
 */
export function buildApprovalCard(part, options = {}) {
  const card = options.state ?? initialApprovalState();
  const flow = card.flow ?? initialFlow();
  const availability = options.availability ?? { ok: false, reason: APPROVAL_REASONS.loading };
  const closed = part.state === 'answered' || part.state === 'cancelled';
  const pendingOption = !closed && card.pending !== null ? findOption(part, card.pending) : null;
  const editable =
    !closed && part.answerable === true && availability.ok === true && editableFlow(flow) && pendingOption === null;
  const plan = isRecord(part.plan) ? { text: part.plan.text, filePath: part.plan.filePath ?? null } : null;
  const detail =
    !plan && isText(part.detail)
      ? (() => {
          const preview = detailPreview(part.detail);
          return { preview, full: part.detail, hasMore: preview !== part.detail };
        })()
      : null;
  const terminalLike = availability.ok !== true && availability.open === true;
  return {
    key: options.key ?? '',
    closed,
    state: part.state,
    source: part.source,
    title: isText(part.title) ? part.title : DEFAULT_APPROVAL_TITLE,
    tool: part.tool ?? null,
    description: part.description ?? null,
    reason: part.reason ?? null,
    blockedPath: part.blockedPath ?? null,
    plan,
    detail,
    options: optionsOf(part).map((o, i) => ({
      id: o.id,
      label: o.label,
      description: o.description ?? null,
      primary: i === 0,
      selected: closed && o.id === part.selectedOptionId,
      disabled: !editable,
      busy: flow.phase === 'sending' && card.chosen === o.id,
    })),
    confirm:
      pendingOption && editableFlow(flow)
        ? { optionId: pendingOption.id, label: pendingOption.label, note: persistentNote(part, pendingOption) }
        : null,
    summary: closed ? summaryOf(part) : null,
    notice: closed ? null : noticeOf(flow),
    reasonText: closed || availability.ok === true ? null : availability.reason,
    unknown:
      !closed && (flow.phase === 'unknown' || flow.phase === 'checking')
        ? { text: UNKNOWN_TEXT, busy: flow.phase === 'checking' }
        : null,
    open: !closed && terminalLike,
    truncated: part.truncated === true,
  };
}

/** 読むだけの手段（端末と、小窓で答えられない承認）。答えず、理由と「Orca で開く」を示す。 */
/**
 * @type {{
 *   availability: (part: any, status: any) => { ok: false, reason: string, open: true },
 *   submit: (part: any, optionId: any, options: any) => Promise<import('./question-view.js').FlowResult>,
 * }}
 */
export const readOnlyApprover = {
  availability: (part, _status) => ({
    ok: false,
    reason: part?.source === 'terminal' ? TERMINAL_APPROVAL_REASON : READ_ONLY_APPROVAL_REASON,
    open: true,
  }),
  submit: async (part, _optionId, _options) => ({
    kind: 'refused',
    reason: part?.source === 'terminal' ? TERMINAL_APPROVAL_REASON : READ_ONLY_APPROVAL_REASON,
  }),
};

/** 部分の source と answerable で手段を選ぶ。表を差し替えれば別の手段を使える。 */
export function approverFor(part, approvers) {
  if (part?.source === 'terminal') return approvers.terminal ?? approvers.readOnly;
  if (part?.answerable !== true) return approvers.readOnly;
  return approvers.chat;
}

/**
 * 構造化 Chat の承認の手段。意図（/api/approval/intent）と確定（/api/approval/confirm）を続けて1回ずつ送る。
 * 確定の応答を失えば結果不明にし、送り直さない。照会は /api/send/{操作の ID}?check=1 を1回だけ読む。
 * @param {{
 *   agentId: string,
 *   writer: { send: (path: string, method: 'POST', body: unknown) => Promise<{ status: number, body: any }> },
 *   read?: (url: string) => Promise<{ status: number, body: any }>,
 * }} deps
 */
export function createChatApprover(deps) {
  const read = deps.read ?? readSameOrigin;
  return {
    /** status は GET /api/send/status の本体、読めなければ 'failed'、まだなら null。 */
    availability(part, status) {
      if (!isRecord(part?.prompt)) return { ok: false, reason: APPROVAL_REASONS.unknown_shape };
      if (status === null || status === undefined) return { ok: false, reason: APPROVAL_REASONS.loading };
      if (!isRecord(status)) return { ok: false, reason: APPROVAL_REASONS.status_unavailable };
      if (status.enabled !== true) return { ok: false, reason: APPROVAL_REASONS.send_disabled };
      const approval = isRecord(status.approval) ? status.approval : null;
      if (!approval || typeof approval.available !== 'boolean')
        return { ok: false, reason: APPROVAL_REASONS.unknown_shape };
      if (!approval.available) return { ok: false, reason: reasonText(approval.reason ?? 'unsupported') };
      return { ok: true };
    },
    async submit(part, optionId, { confirmPersistent = false } = {}) {
      const prompt = part?.prompt;
      if (!isRecord(prompt) || !isText(prompt.itemId) || !isText(optionId))
        return { kind: 'refused', reason: APPROVAL_REASONS.unknown_shape };
      return sendIntentConfirm({
        writer: deps.writer,
        reasons: APPROVAL_REASONS,
        intentPath: '/api/approval/intent',
        intentBody: {
          agent: deps.agentId,
          prompt: { itemId: prompt.itemId, revision: prompt.revision },
          optionId,
          confirmPersistent: confirmPersistent === true,
        },
        confirmPath: '/api/approval/confirm',
        confirmBody: (ticket) => ({ ticket, optionId }),
      });
    },
    check: (operationId) => checkOperation(read, operationId, APPROVAL_REASONS),
  };
}

/**
 * カードの key ごとの状態の板。描き直しや追記でも状態を保つ。送れるときだけ approver.submit を1回呼ぶ。
 * sending の間の押しは捨てる。自動で送り直さない。
 * @param {{ approvers: { chat: any, readOnly: any, terminal?: any }, onChange?: (key: string) => void }} deps
 */
export function createApprovalBoard(deps) {
  /** @type {Map<string, ReturnType<typeof initialApprovalState>>} */
  const cards = new Map();
  const onChange = deps.onChange ?? (() => {});
  const get = (key) => cards.get(key) ?? initialApprovalState();
  const set = (key, next) => {
    if (next === get(key) && cards.has(key)) return false;
    cards.set(key, next);
    onChange(key);
    return true;
  };
  const dispatch = (key, event) => {
    const card = get(key);
    const flow = reduceFlow(card.flow, event);
    if (flow === card.flow) return false;
    return set(key, { ...card, flow });
  };
  const sendable = (key, part, status) => {
    if (part?.state !== 'pending' || part.answerable !== true) return null;
    const approver = approverFor(part, deps.approvers);
    if (approver.availability(part, status)?.ok !== true) return null;
    if (!editableFlow(get(key).flow)) return null;
    return approver;
  };
  const submit = async (key, part, approver, optionId, confirmPersistent) => {
    if (!dispatch(key, { type: 'submit' })) return;
    set(key, { ...get(key), pending: null, chosen: optionId });
    let result;
    try {
      result = await approver.submit(part, optionId, { confirmPersistent });
    } catch {
      result = { kind: 'unknown', operationId: null };
    }
    const card = get(key);
    const flow = reduceFlow(card.flow, { type: 'result', result });
    set(key, { ...card, flow, chosen: null });
  };
  return {
    state: (key) => get(key),
    approver: (part) => approverFor(part, deps.approvers),
    /** 選択肢を押す。常に許可・常に拒否は確かめの段にし、ほかは送る。 */
    async choose(key, part, optionId, status) {
      const approver = sendable(key, part, status);
      if (!approver) return;
      const picked = choose(get(key), part, optionId);
      if (!picked.submit) {
        set(key, picked.state);
        return;
      }
      if (picked.state !== get(key)) cards.set(key, picked.state);
      await submit(key, part, approver, picked.optionId, false);
    },
    /** 確かめの段の選択肢を、confirmPersistent 真で送る。 */
    async confirm(key, part, status) {
      const pending = get(key).pending;
      const option = pending === null ? null : findOption(part, pending);
      const approver = sendable(key, part, status);
      if (!option || !approver) return;
      await submit(key, part, approver, option.id, true);
    },
    /** 確かめの段をやめる。何も送らない。 */
    cancel(key) {
      const card = get(key);
      const next = cancelPending(card);
      if (next !== card) set(key, next);
    },
    /** 結果不明の照会。approver が check を持つときだけ、1回読む。送らない。 */
    async query(key, part) {
      const approver = approverFor(part ?? { source: 'chat', answerable: true }, deps.approvers);
      const operationId = get(key).flow.result?.operationId;
      if (typeof approver.check !== 'function' || !dispatch(key, { type: 'query' })) return;
      let result;
      try {
        result = await approver.check(operationId);
      } catch {
        result = { kind: 'unknown', operationId, note: `まだ分かりません：${APPROVAL_REASONS.network}` };
      }
      dispatch(key, { type: 'result', result });
    },
    dismiss: (key) => dispatch(key, { type: 'dismiss' }),
    /** 今の会話にない key を忘れる。 */
    prune(keys) {
      for (const key of [...cards.keys()]) if (!keys.has(key)) cards.delete(key);
    },
  };
}
