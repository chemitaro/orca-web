// 会話の中で、端末の質問（answerVia keys）と後の発言の質問（answerVia message）がまだ答えられていないかを決める。純な関数。
// 答え済みの判定は Orca v1.4.261 の native-chat-ask-answer.ts の quotedByQueuedAnswer、端末が質問を出しているかは
// agent-pending-prompt.ts（hookRowAgentPhase の needs-you、parseAskFromStatus）に合わせる。
import {
  isAskUserQuestionTool,
  parseTerminalQuestions,
  type QuestionPart,
  type QuestionView,
  type TranscriptMessage,
} from '../transcript/normalize.ts';
import { quoteOf } from './keys.ts';
import type { TerminalPrompt } from './target.ts';

export type CallQuestionState = 'pending' | 'answered' | 'failed';

export interface CallQuestion {
  part: QuestionPart;
  state: CallQuestionState;
}

/** 後の発言の引用：先頭か、空行の後に、どれかの問いの引用がある。 */
export function quotesQuestion(text: string, questions: readonly Pick<QuestionView, 'question'>[]): boolean {
  return questions.some((q) => {
    const quote = quoteOf(q);
    return text.startsWith(quote) || text.includes(`\n\n${quote}`);
  });
}

/** callId の質問の部分（answerVia keys か message）を探し、今の状態を決める。同じ callId が2つあれば後の物。見つからなければ null。 */
export function findCallQuestion(messages: readonly TranscriptMessage[], callId: string): CallQuestion | null {
  let found: { part: QuestionPart; message: number; index: number } | null = null;
  messages.forEach((m, mi) => {
    m.parts.forEach((p, pi) => {
      if (p.type === 'question' && p.callId === callId && (p.answerVia === 'keys' || p.answerVia === 'message')) {
        found = { part: p, message: mi, index: pi };
      }
    });
  });
  if (found === null) return null;
  const { part, message, index } = found as { part: QuestionPart; message: number; index: number };
  for (let mi = message; mi < messages.length; mi += 1) {
    const m = messages[mi] as TranscriptMessage;
    const parts = mi === message ? m.parts.slice(index + 1) : m.parts;
    for (const p of parts) {
      if (part.answerVia === 'keys' && p.type === 'tool-result' && p.callId === callId) {
        return { part, state: p.isError ? 'failed' : 'answered' };
      }
      if (
        part.answerVia === 'message' &&
        m.role === 'user' &&
        p.type === 'text' &&
        quotesQuestion(p.text, part.questions)
      ) {
        return { part, state: 'answered' };
      }
    }
  }
  return { part, state: 'pending' };
}

const NEEDS_YOU: ReadonlySet<string> = new Set(['waiting', 'blocked']);

/**
 * 端末がその質問を出しているか。state が waiting・blocked で、toolName が質問のツールで、interactivePrompt を端末の規則で読んだ問いが、
 * 問いの数、各問いの文、複数選択か、選択肢のラベルの列で同じなら match。確かめられなければ unverified、読めて違えば mismatch。
 */
export function promptMatches(
  status: TerminalPrompt | null,
  questions: readonly QuestionView[],
): 'match' | 'mismatch' | 'unverified' {
  if (status === null || status.state === null || !NEEDS_YOU.has(status.state)) return 'unverified';
  if (status.toolName === null || status.interactivePrompt === null) return 'unverified';
  if (!isAskUserQuestionTool(status.toolName)) return 'mismatch';
  const parsed = parseTerminalQuestions(status.interactivePrompt);
  if (parsed === null) return 'unverified';
  const shown = parsed.questions;
  const same =
    shown.length === questions.length &&
    shown.every((s, i) => {
      const q = questions[i] as QuestionView;
      return (
        s.question === q.question &&
        s.multiSelect === q.multiSelect &&
        s.options.length === q.options.length &&
        s.options.every((o, oi) => o.label === q.options[oi]?.label)
      );
    });
  return same ? 'match' : 'mismatch';
}
