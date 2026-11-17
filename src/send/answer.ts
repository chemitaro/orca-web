// 質問の答えの検査と、決めた形と digest。純な関数。
// 条件は Orca v1.4.261 の isValidAgentSessionQuestionAnswers（agent-session-question-answer.ts）と同じにし、
// other の制御文字と大きさの上限を足す（F-04）。
import { createHash } from 'node:crypto';
import { canonicalize } from '../orca/send.ts';
import type { QuestionView } from '../transcript/normalize.ts';

/** Orca の AGENT_SESSION_QUESTION_ANSWER_MAX_BYTES と同じ。 */
export const MAX_OTHER_BYTES = 64 * 1024;

/** 送る答えの決めた形。other は答えに数えたときだけ付け、文は変えない。 */
export interface QuestionAnswer {
  questionId: string;
  optionIds: string[];
  other?: string;
}

export type AnswerReason =
  | 'invalid_shape'
  | 'answer_count'
  | 'duplicate_question'
  | 'unknown_question'
  | 'unknown_option'
  | 'duplicate_option'
  | 'other_not_allowed'
  | 'control_character'
  | 'too_large'
  | 'no_choice'
  | 'too_many_choices';

export type AnswerCheck =
  | { ok: true; answers: QuestionAnswer[] }
  | { ok: false; error: 'invalid_answer'; reason: AnswerReason };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 形だけを確かめた答え。 */
function shapeOf(value: unknown): QuestionAnswer | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((k) => k !== 'questionId' && k !== 'optionIds' && k !== 'other')) return null;
  if (typeof value.questionId !== 'string' || !Array.isArray(value.optionIds)) return null;
  if (!value.optionIds.every((id) => typeof id === 'string')) return null;
  if (Object.hasOwn(value, 'other') && typeof value.other !== 'string') return null;
  return {
    questionId: value.questionId,
    optionIds: [...(value.optionIds as string[])],
    ...(typeof value.other === 'string' ? { other: value.other } : {}),
  };
}

/** Orca と同じく、other は鍵があり、空を許す問いか空白でない文のときだけ答えに数える。 */
const countsOther = (question: QuestionView | undefined, other: string | undefined): other is string =>
  other !== undefined && (question?.otherAllowsEmpty === true || other.trim().length > 0);

function hasControl(text: string): boolean {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10) || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

function formOf(question: QuestionView | undefined, answer: QuestionAnswer): QuestionAnswer {
  return {
    questionId: answer.questionId,
    optionIds: [...answer.optionIds],
    ...(countsOther(question, answer.other) ? { other: answer.other } : {}),
  };
}

/** 問いの順に並べる。問いにない答えは後ろに、来た順のまま。 */
function ordered(questions: readonly QuestionView[], answers: QuestionAnswer[]): QuestionAnswer[] {
  const index = new Map(questions.map((q, i) => [q.id, i]));
  return answers
    .map((answer, i) => ({ answer, key: index.get(answer.questionId) ?? questions.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.answer);
}

/** 答えを確かめ、決めた形（問いの順、数えない other を落とす）にする。 */
export function checkAnswers(questions: readonly QuestionView[], answers: unknown): AnswerCheck {
  const fail = (reason: AnswerReason): AnswerCheck => ({ ok: false, error: 'invalid_answer', reason });
  if (!Array.isArray(answers) || answers.length === 0) return fail('invalid_shape');
  const shaped: QuestionAnswer[] = [];
  for (const value of answers) {
    const answer = shapeOf(value);
    if (answer === null) return fail('invalid_shape');
    shaped.push(answer);
  }
  if (shaped.length !== questions.length) return fail('answer_count');
  const byId = new Map(shaped.map((a) => [a.questionId, a]));
  if (byId.size !== shaped.length) return fail('duplicate_question');
  const out: QuestionAnswer[] = [];
  for (const question of questions) {
    const answer = byId.get(question.id);
    if (!answer) return fail('unknown_question');
    const offered = new Set(question.options.map((o) => o.id));
    if (answer.optionIds.some((id) => !offered.has(id))) return fail('unknown_option');
    if (new Set(answer.optionIds).size !== answer.optionIds.length) return fail('duplicate_option');
    if (answer.other !== undefined) {
      if (hasControl(answer.other)) return fail('control_character');
      if (Buffer.byteLength(answer.other, 'utf8') > MAX_OTHER_BYTES) return fail('too_large');
    }
    const hasOther = countsOther(question, answer.other);
    if (hasOther && !question.allowOther) return fail('other_not_allowed');
    const count = answer.optionIds.length + (hasOther ? 1 : 0);
    if (count === 0) return fail('no_choice');
    if (!question.multiSelect && count !== 1) return fail('too_many_choices');
    out.push(formOf(question, answer));
  }
  return { ok: true, answers: out };
}

/** Orca が journal に書いた答えを、確かめずに決めた形にする（照会で digest を比べるため）。 */
export function answerForm(
  questions: readonly QuestionView[],
  answers: readonly { questionId: string; optionIds: readonly string[]; other?: string }[],
): QuestionAnswer[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return ordered(
    questions,
    answers.map((a) =>
      formOf(byId.get(a.questionId), {
        questionId: a.questionId,
        optionIds: [...a.optionIds],
        ...(a.other === undefined ? {} : { other: a.other }),
      }),
    ),
  );
}

/** 決めた形の答えの digest：`sha256(canonicalize(answers))`。 */
export function digestAnswers(answers: readonly QuestionAnswer[]): string {
  return createHash('sha256').update(canonicalize(answers)).digest('hex');
}
