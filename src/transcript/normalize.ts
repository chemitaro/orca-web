// 会話の正規化（`orca-web.transcript/v1`）。Orca の件（端末のエージェントの NativeChatMessage、構造化 Chat の AgentJournalRenderItem）を、
// 画面が描く小さな件に減らす。思考（reasoning）は印も付けずに落とす。未対応の部分だけを `unsupported` の印にする。
// 形は stablyai/orca v1.4.256 の src/shared/native-chat/native-chat-types.ts と src/shared/agent-session/journal/agent-session-journal-types.ts に合わせる。

import type { PagePosition, RawPage, TranscriptSource, TranscriptTarget } from '../orca/read-transcript.ts';

export const TRANSCRIPT_SCHEMA = 'orca-web.transcript/v1';

export const MAX_TEXT_CHARS = 100_000;
export const MAX_TOOL_INPUT_CHARS = 4_000;
export const MAX_TOOL_OUTPUT_CHARS = 8_000;

export type TranscriptRole = 'user' | 'assistant' | 'tool' | 'system';

export type TranscriptPart =
  | { type: 'text'; text: string; truncated?: true }
  | { type: 'tool-call'; name: string; input: string; callId: string | null; truncated?: true }
  | { type: 'tool-result'; output: string; isError: boolean; callId: string | null; truncated?: true }
  | { type: 'unsupported'; what: UnsupportedWhat };

/** 「表示できない」の部分の名前。Orca の文字はそのまま入れない。 */
export type UnsupportedWhat =
  | 'image'
  | 'subagent'
  | 'background-task'
  | 'diff'
  | 'approval'
  | 'question'
  | 'status'
  | 'unknown';

const JOURNAL_UNSUPPORTED: ReadonlySet<string> = new Set(['diff', 'approval', 'question', 'status']);

export interface TranscriptMessage {
  id: string;
  role: TranscriptRole;
  /** ISO の時刻。Orca が持たなければ null。 */
  at: string | null;
  parts: TranscriptPart[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function clipText(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

function toIso(ms: unknown): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function inputText(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input === undefined || input === null) return '';
  try {
    return JSON.stringify(input, null, 2) ?? '';
  } catch {
    return '';
  }
}

function withTruncated<T extends TranscriptPart>(part: T, truncated: boolean): T {
  return truncated ? { ...part, truncated: true } : part;
}

/** NativeChatBlock を部品にする。知らない形は unsupported。 */
function blockPart(block: unknown, shortened: boolean): TranscriptPart {
  if (!isRecord(block)) return { type: 'unsupported', what: 'unknown' };
  switch (block.type) {
    case 'text': {
      const text = str(block.text);
      if (text === null) return { type: 'unsupported', what: 'unknown' };
      const c = clipText(text, MAX_TEXT_CHARS);
      return withTruncated({ type: 'text', text: c.text }, c.truncated || shortened);
    }
    case 'tool-call': {
      const name = str(block.name) ?? '';
      const c = clipText(inputText(block.input), MAX_TOOL_INPUT_CHARS);
      return withTruncated(
        { type: 'tool-call', name, input: c.text, callId: str(block.callId) },
        c.truncated || shortened,
      );
    }
    case 'tool-result': {
      const c = clipText(str(block.output) ?? '', MAX_TOOL_OUTPUT_CHARS);
      return withTruncated(
        { type: 'tool-result', output: c.text, isError: block.isError === true, callId: str(block.callId) },
        c.truncated || shortened,
      );
    }
    case 'image-ref':
      return { type: 'unsupported', what: 'image' };
    case 'subagent-group':
    case 'subagent':
      return { type: 'unsupported', what: 'subagent' };
    case 'background-task':
      return { type: 'unsupported', what: 'background-task' };
    default:
      return { type: 'unsupported', what: 'unknown' };
  }
}

const ROLES = new Set(['user', 'assistant', 'tool', 'system']);
const UNKNOWN: TranscriptPart = { type: 'unsupported', what: 'unknown' };

/**
 * 1つの件の役割と部品。知らない role は assistant にし、部品はすべて印にする（出所の分からない本文を発言として出さない）。
 * system の件（Orca の知らせ）は本文だけを残し、ほかの部分は印にする。
 */
function messageOf(
  roleValue: unknown,
  blocks: readonly unknown[],
  shortened: boolean,
): { role: TranscriptRole; parts: TranscriptPart[] } {
  const role = typeof roleValue === 'string' && ROLES.has(roleValue) ? (roleValue as TranscriptRole) : null;
  if (role === null) return { role: 'assistant', parts: blocks.map(() => UNKNOWN) };
  const parts = blocks.map((b) => blockPart(b, shortened));
  return { role, parts: role === 'system' ? parts.map((p) => (p.type === 'text' ? p : UNKNOWN)) : parts };
}

/** 端末のエージェントの件（nativeChat.readSession の messages）。並べ替えない。思考を落とす。 */
export function normalizeNativeMessages(messages: readonly unknown[]): TranscriptMessage[] | null {
  const out: TranscriptMessage[] = [];
  for (const m of messages) {
    if (!isRecord(m) || typeof m.id !== 'string' || !Array.isArray(m.blocks)) return null;
    if (m.role === 'reasoning') continue;
    const { role, parts } = messageOf(m.role, m.blocks, m.shortened === true);
    if (parts.length === 0) continue;
    out.push({ id: m.id, role, at: toIso(m.timestamp), parts });
  }
  return out;
}

/** 出さない journal の kind（会話の本文ではない）。 */
const HIDDEN_KINDS = new Set(['turn', 'agent-start', 'agent-handoff']);

const position = (item: Record<string, unknown>): [number, number] => [
  typeof item.sequence === 'number' ? item.sequence : 0,
  typeof item.sequenceIndex === 'number' ? item.sequenceIndex : 0,
];

/** 構造化 Chat の件（agentSession.history の page.items）。journal の位置の順に並べる。 */
export function normalizeJournalItems(items: readonly unknown[]): TranscriptMessage[] | null {
  const records: Record<string, unknown>[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.itemId !== 'string' || !isRecord(item.body)) return null;
    records.push(item);
  }
  records.sort((a, b) => {
    const [as, ai] = position(a);
    const [bs, bi] = position(b);
    return as - bs || ai - bi;
  });
  const out: TranscriptMessage[] = [];
  for (const item of records) {
    const body = item.body as Record<string, unknown>;
    const kind = body.kind;
    if (typeof kind === 'string' && HIDDEN_KINDS.has(kind)) continue;
    const id = item.itemId as string;
    const at = toIso(item.observedAt);
    const shortened = item.shortened === true;
    if (kind === 'message') {
      if (body.role === 'reasoning') continue;
      const { role, parts } = messageOf(body.role, Array.isArray(body.blocks) ? body.blocks : [], shortened);
      if (parts.length) out.push({ id, role, at, parts });
      continue;
    }
    if (kind === 'tool-call') {
      const call = blockPart({ type: 'tool-call', name: body.name, input: body.input, callId: body.callId }, shortened);
      const parts: TranscriptPart[] = [call];
      if (isRecord(body.output)) {
        const c = clipText(str(body.output.head) ?? '', MAX_TOOL_OUTPUT_CHARS);
        parts.push(
          withTruncated(
            { type: 'tool-result', output: c.text, isError: body.state === 'failed', callId: str(body.callId) },
            c.truncated || shortened || body.output.truncated === true,
          ),
        );
      }
      out.push({ id, role: 'tool', at, parts });
      continue;
    }
    const what = typeof kind === 'string' && JOURNAL_UNSUPPORTED.has(kind) ? (kind as UnsupportedWhat) : 'unknown';
    out.push({ id, role: 'assistant', at, parts: [{ type: 'unsupported', what }] });
  }
  return out;
}

export interface TranscriptDocument {
  schema: typeof TRANSCRIPT_SCHEMA;
  ok: true;
  agent: { id: string; agentType: string };
  session: { key: string; short: string; source: TranscriptSource };
  messages: TranscriptMessage[];
  hasMore: boolean;
  /** より古いページを読む不透明な位置（セッションの鍵を含む）。なければ null。 */
  before: string | null;
  readAt: string;
}

export function normalizePage(page: RawPage): TranscriptMessage[] | null {
  return page.source === 'nativeChat' ? normalizeNativeMessages(page.rows) : normalizeJournalItems(page.rows);
}

export function encodeBefore(key: string, position: PagePosition): string {
  return Buffer.from(JSON.stringify({ k: key, p: position }), 'utf8').toString('base64url');
}

const MAX_BEFORE_CHARS = 1024;

/** 位置を解く。形が違えば null。 */
export function decodeBefore(token: string): { key: string; position: PagePosition } | null {
  if (token.length === 0 || token.length > MAX_BEFORE_CHARS || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.k !== 'string' || !/^[0-9a-f]{16}$/.test(value.k) || !isRecord(value.p))
    return null;
  const p = value.p;
  if (Number.isInteger(p.offset) && (p.offset as number) >= 0 && Object.keys(p).length === 1) {
    return { key: value.k, position: { offset: p.offset as number } };
  }
  const c = p.cursor;
  if (
    Object.keys(p).length === 1 &&
    isRecord(c) &&
    typeof c.epoch === 'string' &&
    c.epoch.length > 0 &&
    c.epoch.length <= 256 &&
    Number.isInteger(c.sequence) &&
    (c.sequence as number) >= 0
  ) {
    return { key: value.k, position: { cursor: { epoch: c.epoch, sequence: c.sequence as number } } };
  }
  return null;
}

export function buildDocument(
  target: TranscriptTarget,
  page: RawPage,
  messages: TranscriptMessage[],
  readAt: Date,
): TranscriptDocument {
  return {
    schema: TRANSCRIPT_SCHEMA,
    ok: true,
    agent: { id: target.agentId, agentType: target.agentType },
    session: { key: target.key, short: target.sessionId.slice(0, 8), source: target.source },
    messages,
    hasMore: page.hasMore,
    before: page.before ? encodeBefore(target.key, page.before) : null,
    readAt: readAt.toISOString(),
  };
}
