// 質問のカードの組み立て（D-05）。選択、答えの形、カードの描く物、送る流れの状態は純粋な関数で、DOM に触らない。
// 答える手段（answerer）は差し替えられる形：`{ availability(part, status), submit(part, answers), check?(operationId) }`。
// この Issue は構造化 Chat の createChatAnswerer と、答えない端末の terminalAnswerer を持つ（iss-00049 が端末を差し替える）。
// 自動で送り直さない。照会は「確かめる」を押したときだけ。値は文字にして返し、HTML として解かない（描く側は textContent を使う）。

/** 理由と結果の言葉（1か所）。識別子ではなく言葉で示す。 */
export const QUESTION_REASONS = {
  loading: '答えられるか確かめています…',
  status_unavailable: '答えられるか確かめられません（orca-web につながりません）',
  send_disabled: '送信が無効です（設定の sendEnabled が偽）',
  unsupported: 'この Orca の版では、ここから質問に答えられません',
  terminal_route: '端末のエージェントの質問は、いまは Orca で答えてください',
  agent_not_found: 'Orca にこのエージェントのタブがありません',
  untabbed: 'Orca にこのエージェントのタブがありません',
  no_session: 'セッションが結ばれていません',
  asleep: 'エージェントがスリープ中です',
  unreachable: 'Orca につながりません',
  runtime_changed: 'Orca が再起動しました',
  unknown_shape: 'Orca の応答の形を読めません',
  state_out_of_date: '状態が古く、宛先を確かめられません',
  identity_unavailable: '宛先の識別子が取れません',
  question_changed: '質問が変わりました',
  question_gone: '質問が見つかりません（会話の記録の先頭より前か、消えました）',
  question_not_found: '質問が見つかりません',
  answer_changed: '答えが変わりました。もう一度押してください',
  agent_session_already_resolved: 'ほかの画面で答え済みです',
  already_resolved: 'ほかの画面で答え済みです',
  resolved_by_other: 'ほかの画面で答え済みです',
  cancelled: '質問は取り消されました',
  changed_since_shown: '宛先が変わりました。会話を確かめてください',
  invalid_answer: '答えの形を Orca に送れません',
  ticket_invalid: '受け付けが無効になりました。もう一度押してください',
  busy: 'ほかの送信を処理しています。少し待ってもう一度押してください',
  record_failed: '送信の記録を書けないので送りませんでした',
  record_unreadable: '送信の記録を読めません',
  not_sendable: 'いまは答えられない状態です',
  target_changed: '宛先が変わったので送りませんでした',
  network: 'orca-web につながりません（送っていません）',
  not_sent: '送っていません',
  method_not_found: 'この Orca の版にない操作です',
  invalid_argument: 'Orca が答えを拒みました',
  prompt_pending: '質問はまだ答えを待っています',
  resolved_unverified: '質問は答え済みですが、この答えか確かめられません',
  no_after_record: '送った後の記録がありません（送っている間に orca-web が止まった）',
  response_lost: '送った結果の応答を受け取れませんでした',
};

export const TERMINAL_REASON = QUESTION_REASONS.terminal_route;
const UNKNOWN_TEXT = '届いたか分かりません。自動では送り直しません';

const reasonText = (code) =>
  typeof code === 'string' && Object.hasOwn(QUESTION_REASONS, code)
    ? QUESTION_REASONS[code]
    : `答えられません（${String(code)}）`;

const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.length > 0;

/** Orca の AGENT_SESSION_QUESTION_ANSWER_MAX_BYTES と同じ。 */
const MAX_OTHER_BYTES = 64 * 1024;

const questionsOf = (part) => (isRecord(part) && Array.isArray(part.questions) ? part.questions : []);

/**
 * 選択の初め。各問いに `{optionIds: [], other: null}`（null はその他を選んでいない）。
 * @returns {{ optionIds: string[], other: string | null }[]}
 */
export function initialSelection(part) {
  return questionsOf(part).map(() => ({ optionIds: [], other: null }));
}

/** 選択の i 番目を変えた写し。問いがなければ同じ物を返す。 */
function patch(selection, part, index, fn) {
  const question = questionsOf(part)[index];
  if (!question || !Array.isArray(selection)) return selection;
  const current = selection[index] ?? { optionIds: [], other: null };
  const next = fn(current, question);
  if (next === current) return selection;
  const copy = questionsOf(part).map((_, i) => selection[i] ?? { optionIds: [], other: null });
  copy[index] = next;
  return copy;
}

/** 選択肢を押す。単一選択はその1つにしてその他を外し、複数選択は入れ外し。知らない選択肢は変えない。 */
export function toggleOption(selection, part, index, optionId) {
  return patch(selection, part, index, (current, question) => {
    if (!question.options.some((o) => o.id === optionId)) return current;
    if (!question.multiSelect) return { optionIds: [optionId], other: null };
    const has = current.optionIds.includes(optionId);
    return {
      optionIds: has ? current.optionIds.filter((id) => id !== optionId) : [...current.optionIds, optionId],
      other: current.other,
    };
  });
}

/** その他を選ぶ（文を '' に）か外す（null に）。単一選択で選ぶと選択肢を外す。allowOther のない問いは変えない。 */
export function toggleOther(selection, part, index) {
  return patch(selection, part, index, (current, question) => {
    if (!question.allowOther) return current;
    if (current.other !== null) return { optionIds: current.optionIds, other: null };
    return { optionIds: question.multiSelect ? current.optionIds : [], other: '' };
  });
}

/** その他の文を変える。書くとその他を選んだことにし、単一選択では選択肢を外す。 */
export function setOther(selection, part, index, text) {
  if (typeof text !== 'string') return selection;
  return patch(selection, part, index, (current, question) => {
    if (!question.allowOther) return current;
    return { optionIds: question.multiSelect ? current.optionIds : [], other: text };
  });
}

function hasControl(text) {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10) || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

const byteLength = (text) => new TextEncoder().encode(text).length;

/**
 * 選択から、Orca の answers の形を作る。サーバーの checkAnswers と同じ条件（全部の問いに1件、出された選択肢だけ、
 * その他は allowOther の問いで、選んでいて空を許すか空白でない文のときだけ数える、単一はちょうど1つ、複数は1つ以上）。
 * @returns {{ ok: true, answers: { questionId: string, optionIds: string[], other?: string }[] } | { ok: false }}
 */
export function buildAnswers(part, selection) {
  const questions = questionsOf(part);
  if (questions.length === 0 || !Array.isArray(selection) || selection.length !== questions.length)
    return { ok: false };
  const answers = [];
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const chosen = selection[i];
    if (!isRecord(chosen) || !Array.isArray(chosen.optionIds)) return { ok: false };
    const offered = new Set(question.options.map((o) => o.id));
    if (chosen.optionIds.some((id) => !offered.has(id))) return { ok: false };
    if (new Set(chosen.optionIds).size !== chosen.optionIds.length) return { ok: false };
    const other = typeof chosen.other === 'string' ? chosen.other : null;
    if (other !== null && (hasControl(other) || byteLength(other) > MAX_OTHER_BYTES)) return { ok: false };
    const counts = other !== null && (question.otherAllowsEmpty === true || other.trim().length > 0);
    if (counts && !question.allowOther) return { ok: false };
    const count = chosen.optionIds.length + (counts ? 1 : 0);
    if (count === 0 || (!question.multiSelect && count !== 1)) return { ok: false };
    answers.push({ questionId: question.id, optionIds: [...chosen.optionIds], ...(counts ? { other } : {}) });
  }
  return { ok: true, answers };
}

/**
 * 送る流れの初め。phase は idle → sending → done | refused | unknown（→ checking → …）。
 * @typedef {{ kind: 'done' } | { kind: 'refused', reason: string } | { kind: 'unknown', operationId: string | null, note?: string }} FlowResult
 * @typedef {{ phase: 'idle' | 'sending' | 'done' | 'refused' | 'unknown' | 'checking', result: FlowResult | null }} QuestionFlow
 * @returns {QuestionFlow}
 */
export function initialFlow() {
  return { phase: 'idle', result: null };
}

const RESULT_PHASES = { done: 'done', refused: 'refused', unknown: 'unknown' };

/** 流れの次の状態。受けない出来事には同じ物を返す（重なった押しを捨てる）。 */
export function reduceFlow(flow, event) {
  const phase = flow?.phase ?? 'idle';
  switch (event?.type) {
    case 'submit':
      return phase === 'idle' || phase === 'refused' ? { phase: 'sending', result: null } : flow;
    case 'result': {
      if (phase !== 'sending' && phase !== 'checking') return flow;
      const result = event.result;
      const next = RESULT_PHASES[result?.kind];
      if (!next)
        return { phase: 'unknown', result: { kind: 'unknown', operationId: flow.result?.operationId ?? null } };
      if (next === 'unknown' && !isText(result.operationId) && isText(flow.result?.operationId))
        return { phase: 'unknown', result: { ...result, operationId: flow.result.operationId } };
      // 照会で「送っていない」と分かったときは、利用者が押し直せる（refused と同じ）。
      return { phase: next, result };
    }
    case 'query':
      return phase === 'unknown' && isText(flow.result?.operationId)
        ? { phase: 'checking', result: flow.result }
        : flow;
    case 'dismiss':
      return phase === 'unknown' ? initialFlow() : flow;
    default:
      return flow;
  }
}

/** 答え済みの問いごとの文（選んだラベルとその他の文を「、」で）。 */
function summaryOf(part, answerText) {
  if (part.state === 'cancelled') return ['取り消されました'];
  if (part.source === 'terminal') return [isText(answerText) ? answerText : '（答えを読めません）'];
  if (!Array.isArray(part.answers)) return ['（答えを読めません）'];
  const byId = new Map(part.answers.filter(isRecord).map((a) => [a.questionId, a]));
  return questionsOf(part).map((question) => {
    const answer = byId.get(question.id);
    if (!answer) return '（答えなし）';
    const labels = (Array.isArray(answer.optionIds) ? answer.optionIds : []).map(
      (id) => question.options.find((o) => o.id === id)?.label ?? id,
    );
    if (isText(answer.other)) labels.push(answer.other);
    return labels.length ? labels.join('、') : '（答えなし）';
  });
}

/** 答え済みの選択（閉じた形の中で、選んだものを示す）。 */
function answeredSelection(part) {
  const byId = new Map(
    (Array.isArray(part.answers) ? part.answers : []).filter(isRecord).map((a) => [a.questionId, a]),
  );
  return questionsOf(part).map((question) => {
    const answer = byId.get(question.id);
    return {
      optionIds: Array.isArray(answer?.optionIds) ? answer.optionIds : [],
      other: typeof answer?.other === 'string' ? answer.other : null,
    };
  });
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
      return { kind: 'error', text: flow.result?.reason ?? '送っていません' };
    case 'unknown':
      return isText(flow.result?.note) ? { kind: 'error', text: flow.result.note } : null;
    default:
      return null;
  }
}

/**
 * カードの描く物。state が answered・cancelled なら閉じた形（answerSummary に答えの文）。
 * availability は answerer.availability の結果。open は「Orca で開く」を出すか（端末の未回答）。
 * @param {any} part 会話の question の部分
 * @param {{ key?: string, selection?: any, flow?: QuestionFlow, availability?: { ok: true } | { ok: false, reason: string, open?: true },
 *   answerText?: string | null }} [options]
 */
export function buildQuestionCard(part, options = {}) {
  const flow = options.flow ?? initialFlow();
  const availability = options.availability ?? { ok: false, reason: QUESTION_REASONS.loading };
  const closed = part.state === 'answered' || part.state === 'cancelled';
  const selection = closed ? answeredSelection(part) : (options.selection ?? initialSelection(part));
  const editable = !closed && availability.ok === true && (flow.phase === 'idle' || flow.phase === 'refused');
  const questions = questionsOf(part).map((question, i) => {
    const chosen = selection[i] ?? { optionIds: [], other: null };
    return {
      id: question.id,
      header: question.header ?? null,
      question: question.question,
      multiSelect: question.multiSelect === true,
      options: question.options.map((o) => ({
        id: o.id,
        label: o.label,
        description: o.description ?? null,
        selected: chosen.optionIds.includes(o.id),
        disabled: !editable,
      })),
      other: {
        shown: question.allowOther === true && (!closed || chosen.other !== null),
        selected: chosen.other !== null,
        value: chosen.other ?? '',
        disabled: !editable,
      },
    };
  });
  const answerable = buildAnswers(part, selection).ok;
  const terminalLike = availability.ok !== true && availability.open === true;
  const count = questions.length;
  return {
    key: options.key ?? '',
    closed,
    state: part.state,
    source: part.source,
    title: closed ? (part.state === 'cancelled' ? '取り消された質問' : '答え済みの質問') : '質問',
    count,
    questions,
    answerSummary: closed ? summaryOf(part, options.answerText) : [],
    notice: closed ? null : noticeOf(flow),
    reason: closed || availability.ok === true ? null : availability.reason,
    button: {
      shown: !closed && !terminalLike,
      disabled: !(editable && answerable),
      busy: flow.phase === 'sending',
      label: flow.phase === 'sending' ? '送っています…' : '答える',
    },
    unknown:
      !closed && (flow.phase === 'unknown' || flow.phase === 'checking')
        ? { text: UNKNOWN_TEXT, busy: flow.phase === 'checking' }
        : null,
    open: !closed && terminalLike,
    truncated: part.truncated === true,
  };
}

/** 端末の質問の手段。答えず、理由と「Orca で開く」を示す（iss-00049 が差し替える）。 */
/**
 * @type {{
 *   availability: (part: any, status: any) => { ok: false, reason: string, open: true },
 *   submit: (part: any, answers: any) => Promise<FlowResult>,
 * }}
 */
export const terminalAnswerer = {
  availability: (_part, _status) => ({ ok: false, reason: TERMINAL_REASON, open: true }),
  submit: async (_part, _answers) => ({ kind: 'refused', reason: TERMINAL_REASON }),
};

/** 部分の source で手段を選ぶ。表を差し替えれば別の手段を使える。 */
export function answererFor(part, answerers) {
  return part?.source === 'terminal' ? answerers.terminal : answerers.chat;
}

const DELIVERED = new Set(['submitted', 'accepted', 'input_accepted']);

/** 意図・確定の誤りの応答（ok: false）の理由の言葉。 */
function refusalReason(body) {
  if (!isRecord(body)) return reasonText('unknown_shape');
  if (isText(body.reason) && Object.hasOwn(QUESTION_REASONS, body.reason)) return QUESTION_REASONS[body.reason];
  if (isText(body.error)) return reasonText(body.error);
  return reasonText('unknown_shape');
}

/** 確定の 200 の応答（outcome）を結果にする。 */
function outcomeResult(body, operationId) {
  const detail = isRecord(body.detail) ? body.detail : {};
  if (DELIVERED.has(body.outcome)) return { kind: 'done' };
  if (body.outcome === 'refused') {
    const why = detail.code ?? detail.refusedReason;
    return { kind: 'refused', reason: isText(why) ? reasonText(why) : QUESTION_REASONS.not_sent };
  }
  return { kind: 'unknown', operationId };
}

/**
 * 構造化 Chat の質問の手段。意図（/api/answer/intent）と確定（/api/answer/confirm）を続けて1回ずつ送る。
 * 確定の応答を失えば結果不明にし、送り直さない。照会は /api/send/{操作の ID}?check=1 を1回だけ読む。
 * @param {{
 *   agentId: string,
 *   writer: { send: (path: string, method: 'POST', body: unknown) => Promise<{ status: number, body: any }> },
 *   read?: (url: string) => Promise<{ status: number, body: any }>,
 * }} deps
 */
export function createChatAnswerer(deps) {
  const read =
    deps.read ??
    (async (url) => {
      const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    });
  return {
    /** status は GET /api/send/status の本体、読めなければ 'failed'、まだなら null。 */
    availability(part, status) {
      if (!isRecord(part?.prompt)) return { ok: false, reason: QUESTION_REASONS.unknown_shape };
      if (status === null || status === undefined) return { ok: false, reason: QUESTION_REASONS.loading };
      if (!isRecord(status)) return { ok: false, reason: QUESTION_REASONS.status_unavailable };
      if (status.enabled !== true) return { ok: false, reason: QUESTION_REASONS.send_disabled };
      const answer = isRecord(status.answer) ? status.answer : null;
      if (!answer || typeof answer.available !== 'boolean')
        return { ok: false, reason: QUESTION_REASONS.unknown_shape };
      if (!answer.available) return { ok: false, reason: reasonText(answer.reason ?? 'unsupported') };
      return { ok: true };
    },
    async submit(part, answers) {
      const prompt = part?.prompt;
      if (!isRecord(prompt) || !isText(prompt.itemId))
        return { kind: 'refused', reason: QUESTION_REASONS.unknown_shape };
      let intent;
      try {
        intent = await deps.writer.send('/api/answer/intent', 'POST', {
          agent: deps.agentId,
          prompt: { itemId: prompt.itemId, revision: prompt.revision },
          answers,
        });
      } catch {
        return { kind: 'refused', reason: QUESTION_REASONS.network };
      }
      const body = isRecord(intent?.body) ? intent.body : {};
      if (intent?.status !== 200 || !isText(body.ticket) || !isText(body.operationId))
        return { kind: 'refused', reason: refusalReason(body) };
      const operationId = body.operationId;
      let confirm;
      try {
        confirm = await deps.writer.send('/api/answer/confirm', 'POST', { ticket: body.ticket, answers });
      } catch {
        return { kind: 'unknown', operationId };
      }
      const result = isRecord(confirm?.body) ? confirm.body : {};
      if (confirm?.status === 200 && typeof result.outcome === 'string') return outcomeResult(result, operationId);
      // 送る前の拒み（ok: false と error）は送っていない。ほかの形は届いたか分からない。
      if (result.ok === false && isText(result.error)) return { kind: 'refused', reason: refusalReason(result) };
      return { kind: 'unknown', operationId };
    },
    async check(operationId) {
      const still = (code) => ({ kind: 'unknown', operationId, note: `まだ分かりません：${reasonText(code)}` });
      let res;
      try {
        res = await read(`/api/send/${encodeURIComponent(operationId)}?check=1`);
      } catch {
        return still('network');
      }
      const body = isRecord(res?.body) ? res.body : {};
      if (res?.status !== 200) return still(isText(body.error) ? body.error : 'unknown_shape');
      if (body.state === 'not_sent') return { kind: 'refused', reason: QUESTION_REASONS.not_sent };
      if (body.state === 'in_progress')
        return { kind: 'unknown', operationId, note: '送っている途中です。少し待ってもう一度確かめてください' };
      const record = isRecord(body.record) ? body.record : null;
      if (body.state !== 'recorded' || !record) return still('unknown_shape');
      if (body.checkError === 'unreachable') return still('unreachable');
      const detail = isRecord(record.detail) ? record.detail : {};
      if (DELIVERED.has(record.outcome)) return { kind: 'done' };
      if (record.outcome === 'refused')
        return { kind: 'refused', reason: isText(detail.code) ? reasonText(detail.code) : QUESTION_REASONS.not_sent };
      return {
        kind: 'unknown',
        operationId,
        note: `まだ分かりません${isText(detail.code) ? `：${reasonText(detail.code)}` : ''}。Orca の画面で確かめてください`,
      };
    },
  };
}

/**
 * カードの key ごとの選択と流れの板。描き直しや追記でも状態を保つ。submit は送れるときだけ answerer.submit を1回呼ぶ。
 * @param {{ answerers: { chat: any, terminal: any }, onChange?: (key: string) => void }} deps
 */
export function createQuestionBoard(deps) {
  /** @type {Map<string, { selection: any, flow: QuestionFlow }>} */
  const cards = new Map();
  const onChange = deps.onChange ?? (() => {});
  const entry = (key, part) => {
    let card = cards.get(key);
    if (!card) {
      card = { selection: initialSelection(part), flow: initialFlow() };
      cards.set(key, card);
    }
    return card;
  };
  const change = (key, card, next) => {
    if (next.selection === card.selection && next.flow === card.flow) return false;
    cards.set(key, next);
    onChange(key);
    return true;
  };
  const select =
    (fn) =>
    (key, part, ...args) => {
      const card = entry(key, part);
      const editable = card.flow.phase === 'idle' || card.flow.phase === 'refused';
      if (!editable || part?.state !== 'pending') return false;
      return change(key, card, { ...card, selection: fn(card.selection, part, ...args) });
    };
  const dispatch = (key, event) => {
    const card = cards.get(key);
    if (!card) return false;
    return change(key, card, { ...card, flow: reduceFlow(card.flow, event) });
  };
  return {
    selection: (key, part) => entry(key, part).selection,
    flow: (key) => cards.get(key)?.flow ?? initialFlow(),
    answerer: (part) => answererFor(part, deps.answerers),
    toggleOption: select(toggleOption),
    toggleOther: select(toggleOther),
    /** その他の文を変える。描き直しを呼ばない（入力中の欄と変換を壊さない）。変わったかを返す。 */
    setOther(key, part, index, text) {
      const card = entry(key, part);
      if (!(card.flow.phase === 'idle' || card.flow.phase === 'refused') || part?.state !== 'pending') return false;
      const selection = setOther(card.selection, part, index, text);
      if (selection === card.selection) return false;
      cards.set(key, { ...card, selection });
      return true;
    },
    /** 送る。送れない（答え済み、手段が送れない、答えが揃わない、流れが受けない）ときは何もしない。 */
    async submit(key, part, status) {
      if (part?.state !== 'pending') return;
      const answerer = answererFor(part, deps.answerers);
      if (answerer.availability(part, status)?.ok !== true) return;
      const card = entry(key, part);
      const built = buildAnswers(part, card.selection);
      if (!built.ok) return;
      if (!dispatch(key, { type: 'submit' })) return;
      let result;
      try {
        result = await answerer.submit(part, built.answers);
      } catch {
        result = { kind: 'unknown', operationId: null };
      }
      dispatch(key, { type: 'result', result });
    },
    /** 結果不明の照会。answerer が check を持つときだけ、1回読む。送らない。 */
    async query(key, part) {
      const answerer = answererFor(part ?? { source: 'chat' }, deps.answerers);
      const card = cards.get(key);
      const operationId = card?.flow.result?.operationId;
      if (typeof answerer.check !== 'function' || !dispatch(key, { type: 'query' })) return;
      let result;
      try {
        result = await answerer.check(operationId);
      } catch {
        result = { kind: 'unknown', operationId, note: `まだ分かりません：${QUESTION_REASONS.network}` };
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
