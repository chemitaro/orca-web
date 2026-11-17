// エージェントの詳細とチャットの画面の組み立て（純粋な関数）。DOM に触らない。値は文字にして返し、HTML として解かない（描く側は textContent を使う）。
import { formatValue, MISSING_LABELS } from '../view.js';

export { MISSING_LABELS };

/** 「表示できない」の部分の名前。知らない名前は unknown にする。 */
export const UNSUPPORTED_LABELS = {
  image: '画像',
  subagent: 'サブエージェント',
  'background-task': '裏の作業',
  diff: '差分',
  approval: '許可の確認',
  question: '質問',
  status: '状態の行',
  text: '本文',
  unknown: '未対応の部分',
};

/** 読めない理由。 */
export const ERROR_LABELS = {
  agent_not_found: 'Orca にこのエージェントのタブがありません',
  no_session: 'Orca がこのエージェントにセッションを結んでいません（スリープ中か、まだ指示を受けていない）',
  transcript_not_found: '会話の記録がまだありません',
  unreachable: 'Orca につながりません',
  unsupported: 'この Orca の版では会話を読めません',
  read_failed: 'Orca が会話を読めませんでした',
  unknown_shape: 'Orca の応答の形を読めません',
  busy: '同時に開ける会話の数を超えています',
  session_changed: 'セッションが変わりました',
  disconnected: 'orca-web との接続が切れました（つなぎ直しています）',
};

export const errorLabel = (code) => ERROR_LABELS[code] ?? `会話を読めません（${code}）`;

/** PR の URL は https: のときだけリンクにする。 */
export function safeHref(url) {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

const SUMMARY_SCHEMA = 'orca-web.worktree-summary/v1';

/**
 * 稼働の印の要約から、このエージェントのいる worktree を、このエージェントだけを持つ写しにする（D-08）。
 * 写しのエージェントは経過の起点（elapsedFrom、elapsedBasis）を null にする（印に経過を出さない。R-11）。見つからなければ null。
 * @param {any} summary GET /api/worktrees/summary の文書
 * @param {string} agentId
 */
export function detailMarkWorktree(summary, agentId) {
  if (!summary || typeof summary !== 'object' || summary.schema !== SUMMARY_SCHEMA) return null;
  if (!Array.isArray(summary.worktrees) || !agentId) return null;
  for (const worktree of summary.worktrees) {
    if (!worktree || typeof worktree !== 'object' || !Array.isArray(worktree.agents)) continue;
    const agent = worktree.agents.find((a) => a && typeof a === 'object' && a.id === agentId);
    if (agent) return { ...worktree, agents: [{ ...agent, elapsedFrom: null, elapsedBasis: null }] };
  }
  return null;
}

export const agentHref = (id) => `/embed/agent?id=${encodeURIComponent(id)}`;

function agentLabel(agent, worktreeNames) {
  const type = agent.agentType?.value ?? '—';
  const title = agent.title?.value;
  return title ? `${type}：${title}` : `${type}（${worktreeNames.get(agent.worktreeId) ?? agent.worktreeId}）`;
}

function cellOf(fact, label, options) {
  const { text, note } = formatValue(fact, options);
  return { label, text, note, href: null };
}

/**
 * 状態の文書から、エージェントの詳細を作る。見つからなければ null。
 * 返す形：{ title, rows: [{ label, text, note, href, links? }], open: { worktree, agent? } | null }
 */
export function buildDetail(state, agentId, options = {}) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  const worktree = state.worktrees.find((w) => w.id === agent.worktreeId) ?? null;
  const worktreeNames = new Map(
    state.worktrees.map((w) => [w.id, w.branch.value ?? w.displayName.value ?? w.path.value ?? w.id]),
  );
  const parentKey = agent.parentPaneKey?.value ?? null;
  const parent = parentKey ? state.agents.find((a) => a.paneKey === parentKey) : undefined;
  const children = agent.paneKey ? state.agents.filter((a) => a.parentPaneKey?.value === agent.paneKey) : [];

  const state_ = formatValue(agent.state, options);
  const started = formatValue(agent.stateStartedAt, options);
  const rows = [
    cellOf(agent.title, '題名', options),
    { label: 'worktree', text: worktreeNames.get(agent.worktreeId) ?? agent.worktreeId, note: null, href: null },
    cellOf(agent.agentType, '種類', options),
    {
      label: '状態',
      text: state_.text === '—' || started.text === '—' ? state_.text : `${state_.text}（${started.text} から）`,
      note: state_.note,
      href: null,
    },
    cellOf(agent.model, 'モデル', options),
    cellOf(agent.effort, '推論', options),
  ];
  if (parent) {
    rows.push({ label: '親', text: agentLabel(parent, worktreeNames), note: null, href: agentHref(parent.id) });
  } else {
    rows.push({
      label: '親',
      text: parentKey ? parentKey : '—',
      note: parentKey ? 'not-linked' : 'no-data',
      href: null,
    });
  }
  rows.push({
    label: '子',
    text: children.length ? `${children.length}` : '（なし）',
    note: null,
    href: null,
    links: children.map((c) => ({ text: agentLabel(c, worktreeNames), href: agentHref(c.id) })),
  });
  if (worktree) {
    const pr = formatValue(worktree.pr, options);
    rows.push({ label: 'PR', text: pr.text, note: pr.note, href: safeHref(worktree.pr.value?.url) });
    rows.push(cellOf(worktree.ci, 'CI', options));
  } else {
    rows.push({ label: 'PR', text: '—', note: 'not-linked', href: null });
    rows.push({ label: 'CI', text: '—', note: 'not-linked', href: null });
  }
  const open = worktree
    ? agent.kind === 'terminal-tab' && agent.paneKey
      ? { worktree: agent.worktreeId, agent: agent.paneKey }
      : { worktree: agent.worktreeId }
    : null;
  return { title: agentLabel(agent, worktreeNames), rows, open };
}

/** ツールの結果で答え済みになる質問か。keys と、answerVia のない古い端末の質問。 */
const answersByResult = (part) =>
  part.answerVia === 'keys' || (part.answerVia === undefined && part.source === 'terminal');

/** Orca の askAnswerQuote と同じ引用（改行の続きを空白1つにした問いの文と空行）。 */
const quoteOf = (question) => `> ${String(question?.question ?? '').replace(/[\r\n]+/g, ' ')}\n\n`;

/** 文が、どれかの問いの引用で始まるか、空行の後に含む。 */
function quotesQuestion(text, questions) {
  return (Array.isArray(questions) ? questions : []).some((q) => {
    const quote = quoteOf(q);
    return text.startsWith(quote) || text.includes(`\n\n${quote}`);
  });
}

const unsupportedText = (what) => `表示できない（${UNSUPPORTED_LABELS[what] ?? UNSUPPORTED_LABELS.unknown}）`;

/**
 * 正規化した件から、描く行を作る。
 * 行：{ kind: 'bubble', key, role, at, text, truncated } | { kind: 'tool', key, at, name, input, output, isError, truncated }
 *    | { kind: 'unsupported', key, role, at, text } | { kind: 'notice', key, at, text }
 *    | { kind: 'question', key, at, part, answerText } | { kind: 'approval', key, at, part }
 * ツールの結果は、同じ callId の呼び出しの行に入れる（なければ単独の行）。
 * キーの組で答える質問（answerVia keys。answerVia のない古い物は source terminal）は、同じ callId のツールの結果を答えとして結びつけ、
 * part の state を answered（結果が isError なら答えずに閉じた declined）に、answerText を結果の文にする
 * （結果が先でも後でも。結びつけた結果は単独の行にしない）。
 * 後の発言で答える質問（answerVia message）は、受付のツールの結果では答え済みにせず、後の利用者の発言の文が
 * どれかの問いの引用（先頭か空行の後）を含めば answered にし、answerText をその文にする。
 */
export function buildChat(messages) {
  const rows = [];
  const toolsByCall = new Map();
  /** 端末の質問の行（callId ごと）。 */
  const questionsByCall = new Map();
  /** まだ持ち主のない結果の行（callId ごと）。後に来た端末の質問が引き取る。 */
  const orphanResults = new Map();
  /** 後の発言を待つ質問の行。 */
  const awaitingMessage = [];
  const answerQuestion = (row, output, isError = false) => {
    row.part = { ...row.part, state: isError ? 'declined' : 'answered' };
    row.answerText = output;
  };
  const answerByMessage = (text) => {
    for (let i = awaitingMessage.length - 1; i >= 0; i--) {
      const row = awaitingMessage[i];
      if (!quotesQuestion(text, row.part.questions)) continue;
      answerQuestion(row, text);
      awaitingMessage.splice(i, 1);
    }
  };
  for (const m of messages) {
    // 思考は出さない（正規化で落とすが、画面でも描かない）。
    if (m.role === 'reasoning') continue;
    let texts = [];
    let truncated = false;
    /** 続いた本文の最初の部品の位置。行の key にする（後のツールの行と重ならない）。 */
    let first = 0;
    const flush = () => {
      if (!texts.length) return;
      const index = first;
      const text = texts.join('\n\n');
      rows.push(
        m.role === 'system'
          ? { kind: 'notice', key: `${m.id}:${index}`, at: m.at, text }
          : {
              kind: 'bubble',
              key: `${m.id}:${index}`,
              role: m.role === 'user' ? 'user' : 'assistant',
              at: m.at,
              text,
              truncated,
            },
      );
      texts = [];
      truncated = false;
    };
    m.parts.forEach((part, index) => {
      if (part.type === 'text') {
        // 届いていない（undelivered の）発言と、ほかのエージェントからの（fromAgent の）発言の引用では答え済みにしない。
        if (
          m.role === 'user' &&
          m.undelivered !== true &&
          m.fromAgent !== true &&
          awaitingMessage.length &&
          typeof part.text === 'string'
        )
          answerByMessage(part.text);
        if (!texts.length) first = index;
        texts.push(part.text);
        truncated ||= part.truncated === true;
        return;
      }
      flush();
      const key = `${m.id}:${index}`;
      if (part.type === 'tool-call') {
        const row = {
          kind: 'tool',
          key,
          at: m.at,
          name: part.name,
          input: part.input,
          output: null,
          isError: false,
          truncated: part.truncated === true,
        };
        rows.push(row);
        if (part.callId) toolsByCall.set(part.callId, row);
      } else if (part.type === 'question') {
        const row = { kind: 'question', key, at: m.at, part, answerText: null };
        if (part.answerVia === 'message' && part.state === 'pending') awaitingMessage.push(row);
        const callId = answersByResult(part) ? part.callId : null;
        if (callId) {
          const orphan = orphanResults.get(callId);
          if (orphan) {
            rows.splice(rows.indexOf(orphan), 1);
            orphanResults.delete(callId);
            answerQuestion(row, orphan.output, orphan.isError);
          } else {
            questionsByCall.set(callId, row);
          }
        }
        rows.push(row);
      } else if (part.type === 'approval') {
        // 承認はツールの結果と結びつけない（iss-00050 D-06）。
        rows.push({ kind: 'approval', key, at: m.at, part });
      } else if (part.type === 'tool-result') {
        const question = part.callId ? questionsByCall.get(part.callId) : undefined;
        if (question && question.answerText === null) {
          answerQuestion(question, part.output, part.isError === true);
          return;
        }
        const owner = part.callId ? toolsByCall.get(part.callId) : undefined;
        if (owner && owner.output === null) {
          owner.output = part.output;
          owner.isError = part.isError;
          owner.truncated ||= part.truncated === true;
        } else {
          const orphan = {
            kind: 'tool',
            key,
            at: m.at,
            name: null,
            input: null,
            output: part.output,
            isError: part.isError,
            truncated: part.truncated === true,
          };
          rows.push(orphan);
          if (part.callId && !owner && !orphanResults.has(part.callId)) orphanResults.set(part.callId, orphan);
        }
      } else {
        rows.push({ kind: 'unsupported', key, role: m.role, at: m.at, text: unsupportedText(part.what) });
      }
    });
    flush();
  }
  return rows;
}

/** 会話の画面の状態の初め。 */
export const initialChat = () => ({
  status: 'connecting',
  error: null,
  key: null,
  short: null,
  messages: [],
  before: null,
  hasMore: false,
  /** snapshot と replacement のたびに増える。前のページの要求は、送ったときの値と同じときだけ足す。 */
  generation: 0,
});

/**
 * 出来事を受けて、会話の画面の状態を進める（純粋な関数）。
 * snapshot と replacement は、前のページを含めてすべて捨てて描き直す。appended は、鍵が同じときだけ、同じ id を差し替えて末尾に足す。
 */
export function reduceChat(state, event) {
  switch (event.type) {
    case 'snapshot':
    case 'replacement': {
      const d = event.document;
      return {
        status: 'ok',
        error: null,
        key: d.session.key,
        short: d.session.short,
        messages: [...d.messages],
        before: d.before,
        hasMore: d.hasMore,
        generation: state.generation + 1,
      };
    }
    case 'appended': {
      if (state.status !== 'ok' || event.session?.key !== state.key) return state;
      const updated = new Map(event.updated.map((m) => [m.id, m]));
      const messages = state.messages.map((m) => updated.get(m.id) ?? m);
      const known = new Set(messages.map((m) => m.id));
      for (const m of event.items) if (!known.has(m.id)) messages.push(m);
      return { ...state, messages };
    }
    case 'unavailable':
      return { ...initialChat(), status: 'unavailable', error: event.error, generation: state.generation + 1 };
    case 'disconnected':
      // 読めた会話は残し（次の snapshot で置き換える）、すでに持つ読めない理由（busy など）は上書きしない。
      if (state.status === 'ok' || (state.status === 'unavailable' && state.error)) return state;
      return { ...state, status: 'unavailable', error: 'disconnected' };
    default:
      return state;
  }
}

/** 前のページを上に足す。要求の後に描き直していれば（generation が違う）、または鍵が違えば足さない（別の会話を混ぜない）。 */
export function prependOlder(state, document, requestedGeneration) {
  if (state.status !== 'ok' || requestedGeneration !== state.generation || document.session?.key !== state.key)
    return state;
  const known = new Set(state.messages.map((m) => m.id));
  const older = document.messages.filter((m) => !known.has(m.id));
  return { ...state, messages: [...older, ...state.messages], before: document.before, hasMore: document.hasMore };
}

/**
 * 「前を読む」の応答（{ status, body }）を受けて、会話の画面の状態と、知らせの文を返す（純粋な関数）。
 * 足すのは prependOlder の条件を満たすときだけ。409（session_changed）は置き換えを待つ。
 */
export function olderResult(state, response, requestedGeneration) {
  const { status, body } = response;
  if (status === 200 && body?.ok === true)
    return { chat: prependOlder(state, body, requestedGeneration), notice: null };
  if (status === 409 || body?.error === 'session_changed') {
    return { chat: state, notice: 'セッションが変わりました。描き直しを待っています' };
  }
  return { chat: state, notice: `前のページを読めない：${errorLabel(body?.error ?? String(status))}` };
}
