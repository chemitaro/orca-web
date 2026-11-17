// 端末のエージェントの質問への答えのキーの列と、後の発言で答える質問の発言。純な関数。
// Orca v1.4.261 の次を写す（値も同じ）：
// - src/shared/native-chat/input/questions/native-chat-ask-answer.ts（buildAskAnswerKeys、buildCodexAskAnswerKeys、formatAskAnswer、askAnswerQuote）
// - src/shared/native-chat/input/native-chat-paste-bytes.ts（buildNativeChatPasteBytes）
// - src/shared/terminal/input/terminal-bracketed-paste-text.ts（sanitizeBracketedPasteText、wrapTerminalBracketedPasteText）
// - src/shared/native-chat/input/questions/native-chat-answer-stepping.ts（NATIVE_CHAT_QUESTION_STEP_MS）
// - src/shared/native-chat/input/approvals/native-chat-approval-envelope.ts（parseNativeChatApprovalEnvelope の allowSend・denySend）と
//   src/shared/native-chat/native-chat-agent-support.ts（nativeChatApprovalAcceptKey）
import type { QuestionView } from '../transcript/normalize.ts';
import type { QuestionAnswer } from './answer.ts';

/** 組の間（NATIVE_CHAT_SUBMIT_DELAY_MS 500 ＋ NATIVE_CHAT_ADVANCE_BUFFER_MS 500）。 */
export const ANSWER_STEP_MS = 1000;
/** 1つの答えの組の数の上限（F-05）。 */
export const MAX_KEY_GROUPS = 64;
/** UNFRAMED_AGENT_INPUT_MAX_BYTES。これを超える文は括弧付きの貼り付けで包む。 */
export const UNFRAMED_MAX_BYTES = 512;

/** raw はそのまま送るキー、text は pasteBytes で整えて送る文（AskAnswerKeyGroup）。 */
export type KeyGroup = { raw: string } | { text: string };

/** 選択肢の番号（表示の順、0から）と、trim したその他の文（AskAnswerSelection）。 */
export interface Selection {
  indices: number[];
  other?: string;
}

const ESC = '\u001b';
const ENTER = '\r';
const NEXT_TAB = `${ESC}[C`;
const PREVIOUS_ROW = `${ESC}[A`;
const NEXT_ROW = `${ESC}[B`;
const NOTES = '\t';
const PREVIEW_NOTES = 'n';
const DELETE = '\x7f';
export const PASTE_START = `${ESC}[200~`;
export const PASTE_END = `${ESC}[201~`;

/** 決めた形の答え（checkAnswers を通ったもの）を、問いの順の選択にする。選択肢の id は番号の文字。 */
export function selectionsOf(questions: readonly QuestionView[], answers: readonly QuestionAnswer[]): Selection[] {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  return questions.map((question) => {
    const answer = byId.get(question.id);
    const indices = (answer?.optionIds ?? []).map(Number).sort((a, b) => a - b);
    const other = answer?.other?.trim();
    return other === undefined ? { indices } : { indices, other };
  });
}

function answerLabels(question: QuestionView, sel: Selection | undefined): string[] {
  const labels = (sel?.indices ?? []).map((i) => question.options[i]?.label ?? '').filter((l) => l.length > 0);
  const other = (sel?.other ?? '').trim();
  return other ? [...labels, other] : labels;
}

/** buildAskAnswerKeys（Claude）。問いの preview を hasPreviews に使う。 */
export function buildClaudeKeys(questions: readonly QuestionView[], selections: readonly Selection[]): KeyGroup[] {
  const multiQuestion = questions.length > 1;
  const groups: KeyGroup[] = [];
  questions.forEach((q, qi) => {
    const sel = selections[qi];
    const other = (sel?.other ?? '').trim();
    const typeSomething = String(q.options.length + 1);
    const first = sel?.indices[0];
    if (q.preview && (other || (sel?.indices.length ?? 0) > 0)) {
      if (first === 0 && other && q.options.length > 1) {
        // 行1は最初から当たっているので、メモで確定させるには一度動かす（Orca の注）。
        groups.push({ raw: '2' }, { raw: '1' });
      } else if (first !== undefined) {
        groups.push({ raw: String(first + 1) });
      }
      if (other) groups.push({ raw: PREVIEW_NOTES }, { text: other });
      groups.push({ raw: ENTER });
    } else if (q.multiSelect) {
      for (const i of sel?.indices ?? []) groups.push({ raw: String(i + 1) });
      if (other) groups.push({ raw: typeSomething }, { text: other }, { raw: ENTER });
      groups.push({ raw: NEXT_TAB });
    } else if (other) {
      groups.push({ raw: typeSomething }, { text: answerLabels(q, sel).join(', ') }, { raw: ENTER });
    } else if (first !== undefined) {
      groups.push({ raw: String(first + 1) });
    } else if (multiQuestion) {
      groups.push({ raw: NEXT_TAB });
    }
  });
  const endsOnSubmitTab = multiQuestion || (questions.length === 1 && questions[0]?.multiSelect === true);
  if (endsOnSubmitTab && groups.length > 0) groups.push({ raw: ENTER });
  return groups;
}

/** buildCodexAskAnswerKeys（Codex）。 */
export function buildCodexKeys(questions: readonly QuestionView[], selections: readonly Selection[]): KeyGroup[] {
  const groups: KeyGroup[] = [];
  let hasUnanswered = false;
  questions.forEach((question, questionIndex) => {
    const selection = selections[questionIndex];
    const selectedIndex = selection?.indices[0];
    const note = (selection?.other ?? '').trim();
    if (note) {
      const targetIndex = selectedIndex ?? question.options.length;
      const rowCount = question.options.length + 1;
      const previousSteps = rowCount - targetIndex;
      const usePrevious = previousSteps < targetIndex;
      const steps = usePrevious ? previousSteps : targetIndex;
      for (let i = 0; i < steps; i += 1) groups.push({ raw: usePrevious ? PREVIOUS_ROW : NEXT_ROW });
      groups.push({ raw: NOTES }, { text: note }, { raw: ENTER });
      return;
    }
    if (selectedIndex !== undefined) {
      groups.push({ raw: String(selectedIndex + 1) });
      return;
    }
    hasUnanswered = true;
    groups.push({ raw: DELETE });
    groups.push({ raw: questionIndex < questions.length - 1 ? NEXT_TAB : ENTER });
  });
  if (hasUnanswered) groups.push({ raw: ENTER });
  return groups;
}

/** sanitizeBracketedPasteText：ESC を印字できる ␛ に替える。 */
const sanitize = (text: string): string => text.replaceAll(ESC, '␛');

/** buildNativeChatPasteBytes：改行を含むか UTF-8 で 512 バイトを超える文は、改行を CR にして括弧付きの貼り付けで包む。 */
export function pasteBytes(text: string): string {
  const sanitized = sanitize(text);
  if (/[\r\n]/.test(text) || Buffer.byteLength(sanitized, 'utf8') > UNFRAMED_MAX_BYTES) {
    return `${PASTE_START}${sanitize(text.replace(/\r?\n/g, '\r'))}${PASTE_END}`;
  }
  return sanitized;
}

export function groupBytes(group: KeyGroup): string {
  return 'raw' in group ? group.raw : pasteBytes(group.text);
}

/** C0（Tab・LF・CR を含む）、DEL、C1。keys のその他の文は1行の文だけを送る（F-04）。 */
export function hasKeyControl(text: string): boolean {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 32 || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

export type KeysPlan =
  | { ok: true; groups: string[] }
  | { ok: false; error: 'not_sendable'; reason: 'agent_keys_unknown' | 'prompt_unsupported' }
  | { ok: false; error: 'invalid_answer'; reason: 'control_character' | 'too_large' | 'no_choice' };

/** 答えを送る組のバイトの列にする。answers は checkAnswers を通った決めた形。 */
export function planKeys(
  agentType: string,
  questions: readonly QuestionView[],
  answers: readonly QuestionAnswer[],
): KeysPlan {
  if (agentType !== 'claude' && agentType !== 'codex') {
    return { ok: false, error: 'not_sendable', reason: 'agent_keys_unknown' };
  }
  const unsupported = questions.some((q) =>
    agentType === 'codex' ? q.multiSelect || q.preview || q.options.length > 9 : q.options.length + 1 > 9,
  );
  if (unsupported) return { ok: false, error: 'not_sendable', reason: 'prompt_unsupported' };
  if (answers.some((a) => a.other !== undefined && hasKeyControl(a.other))) {
    return { ok: false, error: 'invalid_answer', reason: 'control_character' };
  }
  const selections = selectionsOf(questions, answers);
  const groups =
    agentType === 'claude' ? buildClaudeKeys(questions, selections) : buildCodexKeys(questions, selections);
  if (groups.length === 0) return { ok: false, error: 'invalid_answer', reason: 'no_choice' };
  if (groups.length > MAX_KEY_GROUPS) return { ok: false, error: 'invalid_answer', reason: 'too_large' };
  return { ok: true, groups: groups.map(groupBytes) };
}

/** askAnswerQuote：後の発言が答えた問いを示す引用。 */
export function quoteOf(question: Pick<QuestionView, 'question'>): string {
  return `> ${question.question.replaceAll(/[\r\n]+/g, ' ')}\n\n`;
}

/** formatAskAnswer の replyAsMessage：答えた問いごとに引用と答え（ラベルとその他の文を「, 」で並べる）。問いの間は空行。 */
export function formatAsyncAnswer(questions: readonly QuestionView[], answers: readonly QuestionAnswer[]): string {
  const selections = selectionsOf(questions, answers);
  return questions
    .flatMap((q, i) => {
      const answer = answerLabels(q, selections[i]).join(', ');
      return answer ? [`${quoteOf(q)}${answer}`] : [];
    })
    .join('\n\n');
}

/**
 * 端末の承認の答えのキー。claude と codex だけ：allow_once は nativeChatApprovalAcceptKey の '1'（opencode の CR は扱わない）、
 * reject_once は denySend の ESC。ほかの種類とほかの optionId は null。
 */
export function approvalKey(agentType: string, optionId: string): string | null {
  if (agentType !== 'claude' && agentType !== 'codex') return null;
  if (optionId === 'allow_once') return '1';
  if (optionId === 'reject_once') return ESC;
  return null;
}
