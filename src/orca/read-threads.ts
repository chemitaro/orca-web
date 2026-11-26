// 頂点の一覧のための、Run のやり取り（質問と返事）の読み取り（iss-00098 D-01）。
// `orchestration inbox --run <id> --limit 1000 --full --json` だけを読む（Orca で access が reads の RPC。既読にしない）。
// 各メッセージから id・type・送り手・宛先・thread_id・created_at と、本文が Orca の自動の知らせかの真偽だけを作り、
// 本文・件名・payload は持たない。その場で Dispatch ごとに最新の質問が返事済みかを決める。
import { isoFromText } from '../state/normalize.ts';
import type { ReadOnlyOrcaCli } from './orca-cli.ts';
import type { SourceRead } from './read-state.ts';

/** 読む窓の件数。inbox は新しい順に返るので、窓の中の質問ならその後の返事も窓の中にある。 */
export const THREAD_WINDOW = 1000;

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DECIDE = 'Decide it yourself and say what you chose when you report.';

/**
 * Orca が質問に答えがないまま、本物の答えと同じ送り手・件名・種類・thread_id で入れる自動の知らせの文の型。
 * 出典：Orca v1.4.272 の同梱のコード（orcad-server.js）。gps の3文（Run の id の差し込みは `[^ ]+`）は全文一致、
 * peer の「Your question … there will not be answered.」は前に空白を含む理由の文が付くので末尾の一致（前に1文字以上）。
 * Orca の版が上がって文が変われば、ここを直す。
 */
export const ORCA_AUTO_NOTICES: readonly RegExp[] = [
  new RegExp(`^${literal(`Your question was removed before your coordinator read it. ${DECIDE}`)}$`),
  new RegExp(
    `^${literal('No one coordinates Run ')}[^ ]+${literal(` now, so no one will read your question. ${DECIDE}`)}$`,
  ),
  new RegExp(
    `^${literal(
      `Your coordinator stopped without answering your question and has no worker running for it. ${DECIDE} If an answer comes later, it still reaches you.`,
    )}$`,
  ),
  new RegExp(
    `^.+${literal(' Your question ')}[^ ]+${literal(' there will not be answered. Decide without it, or ask again.')}$`,
    's',
  ),
];

/** 本文が Orca の自動の知らせか。文字列でない本文は真（返事に数えない）。 */
export function isAutoNotice(body: unknown): boolean {
  if (typeof body !== 'string') return true;
  const text = body.trim();
  return ORCA_AUTO_NOTICES.some((pattern) => pattern.test(text));
}

export interface ThreadMessage {
  id: string;
  type: string;
  fromHandle: string | null;
  toHandle: string | null;
  threadId: string | null;
  createdAt: string | null;
  /** 本文が Orca の自動の知らせ（または文字列でない）。本文そのものは持たない。 */
  auto: boolean;
}

/** Dispatch の最新の質問と、それが返事済みか（R-01 の最新の質問の条件と古い質問の条件の両方）。 */
export interface ThreadQuestion {
  latestId: string;
  latestAt: string | null;
  answered: boolean;
}

export interface RunThreads {
  messages: ThreadMessage[];
  /** Dispatch の id → 最新の質問。窓の中に質問のない Dispatch は持たない（確かめられない）。 */
  questions: Map<string, ThreadQuestion>;
}

export interface ThreadReader {
  readThreads(runId: string): Promise<SourceRead<RunThreads>>;
}

const DISPATCH_PREFIX = 'dispatch:';

/** やり取りから、Dispatch ごとの最新の質問と返事済みかを決める。純粋な関数。 */
export function questionsByDispatch(messages: readonly ThreadMessage[]): Map<string, ThreadQuestion> {
  const asked = new Map<string, { message: ThreadMessage; index: number }[]>();
  messages.forEach((message, index) => {
    if (message.type !== 'question' || !message.fromHandle?.startsWith(DISPATCH_PREFIX)) return;
    const dispatchId = message.fromHandle.slice(DISPATCH_PREFIX.length);
    if (dispatchId === '') return;
    asked.set(dispatchId, [...(asked.get(dispatchId) ?? []), { message, index }]);
  });
  const result = new Map<string, ThreadQuestion>();
  for (const [dispatchId, list] of asked) {
    const to = `${DISPATCH_PREFIX}${dispatchId}`;
    // 最新は created_at の最も新しいもの。同じ時刻や読めない時刻は窓の並び（新しい順）で前のもの。
    const ordered = [...list].sort((a, b) => {
      const ta = ms(a.message.createdAt) ?? Number.NEGATIVE_INFINITY;
      const tb = ms(b.message.createdAt) ?? Number.NEGATIVE_INFINITY;
      return tb - ta || a.index - b.index;
    });
    const latest = (ordered[0] as { message: ThreadMessage }).message;
    const replies = (question: ThreadMessage) => {
      const asked = ms(question.createdAt);
      return messages.filter((r) => {
        const at = ms(r.createdAt);
        return (
          r.threadId === question.id &&
          r.id !== question.id &&
          asked !== null &&
          at !== null &&
          at > asked &&
          r.toHandle === to
        );
      });
    };
    const latestAnswered = replies(latest).some((r) => !r.auto);
    const olderSettled = ordered.slice(1).every(({ message }) => replies(message).length > 0);
    result.set(dispatchId, {
      latestId: latest.id,
      latestAt: latest.createdAt,
      answered: latestAnswered && olderSettled,
    });
  }
  return result;
}

export function createThreadReader(cli: ReadOnlyOrcaCli): ThreadReader {
  return {
    async readThreads(runId) {
      const o = await cli.json<unknown>([
        'orchestration',
        'inbox',
        '--run',
        runId,
        '--limit',
        String(THREAD_WINDOW),
        '--full',
      ]);
      if (!o.ok) return { ok: false, error: { kind: o.kind, message: 'thread read failed' } };
      const result = record(o.result);
      if (!result || !Array.isArray(result.messages)) return invalid();
      const messages: ThreadMessage[] = [];
      for (const value of result.messages) {
        const r = record(value);
        if (!r || !str(r.id) || !str(r.type)) return invalid();
        messages.push({
          id: r.id as string,
          type: r.type as string,
          fromHandle: str(r.from_handle),
          toHandle: str(r.to_handle),
          threadId: str(r.thread_id),
          createdAt: isoFromText(str(r.created_at) ?? '') ?? null,
          auto: isAutoNotice(r.body),
        });
      }
      return {
        ok: true,
        data: { messages, questions: questionsByDispatch(messages) },
        truncated: messages.length >= THREAD_WINDOW,
      };
    },
  };
}

type Rec = Record<string, unknown>;
const record = (v: unknown): Rec | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const ms = (iso: string | null): number | null => {
  if (iso === null) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};
const invalid = (): { ok: false; error: { kind: string; message: string } } => ({
  ok: false,
  error: { kind: 'invalid-shape', message: 'threads: unexpected response shape' },
});
