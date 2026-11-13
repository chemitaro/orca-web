// 会話の読み取りの実機の確かめの中身。エージェントを集め、会話を2回読み、前のページを1回読み、件数と結論だけを数える。
// 本文、題名、パス、セッションの識別子は数えるだけで出さない。読む口は TranscriptReader（ReadOnlyRpc）だけ。
import type { TranscriptReader } from '../orca/read-transcript.ts';
import { diffWindow } from '../transcript/diff.ts';
import { normalizePage } from '../transcript/normalize.ts';

export interface AgentRef {
  id: string;
}

interface Bucket {
  agents: number;
  resolved: number;
  read: number;
  errors: Record<string, number>;
  messages: number;
  droppedReasoning: number;
  roles: Record<string, number>;
  parts: Record<string, number>;
  orderNonDecreasing: number;
  orderDecreasing: number;
  orderUnknown: number;
  secondRead: Record<string, number>;
  olderPages: number;
  olderOverlap: number;
}

const bump = (map: Record<string, number>, key: string, by = 1): void => {
  map[key] = (map[key] ?? 0) + by;
};

const newBucket = (): Bucket => ({
  agents: 0,
  resolved: 0,
  read: 0,
  errors: {},
  messages: 0,
  droppedReasoning: 0,
  roles: {},
  parts: {},
  orderNonDecreasing: 0,
  orderDecreasing: 0,
  orderUnknown: 0,
  secondRead: {},
  olderPages: 0,
  olderOverlap: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Orca が返した順で、並びの位置（nativeChat は transcriptOrder、agentSession は sequence）が減らないか。 */
function orderOf(rows: unknown[], source: string): 'up' | 'down' | 'unknown' {
  const field = source === 'nativeChat' ? 'transcriptOrder' : 'sequence';
  let last = Number.NEGATIVE_INFINITY;
  let seen = 0;
  for (const row of rows) {
    const v = isRecord(row) ? row[field] : undefined;
    if (typeof v !== 'number') continue;
    seen++;
    if (v < last) return 'down';
    last = v;
  }
  return seen === 0 ? 'unknown' : 'up';
}

export async function collectTranscripts(reader: TranscriptReader, agents: readonly AgentRef[], limit = 40) {
  const buckets = new Map<string, Bucket>();
  const bucket = (name: string): Bucket => {
    let b = buckets.get(name);
    if (!b) {
      b = newBucket();
      buckets.set(name, b);
    }
    return b;
  };
  for (const agent of agents) {
    const resolved = await reader.resolve(agent.id);
    if (!resolved.ok) {
      const b = bucket(`unresolved`);
      b.agents++;
      bump(b.errors, resolved.error);
      continue;
    }
    const t = resolved.target;
    const b = bucket(`${t.source}:${t.agentType}`);
    b.agents++;
    b.resolved++;
    const first = await reader.read(t, { limit });
    if (!first.ok) {
      bump(b.errors, first.error);
      continue;
    }
    const messages = normalizePage(first.page);
    if (!messages) {
      bump(b.errors, 'unknown_shape');
      continue;
    }
    b.read++;
    b.messages += messages.length;
    b.droppedReasoning += first.page.rows.filter((r) => {
      if (!isRecord(r)) return false;
      return r.role === 'reasoning' || (isRecord(r.body) && r.body.kind === 'message' && r.body.role === 'reasoning');
    }).length;
    for (const m of messages) {
      bump(b.roles, m.role);
      for (const p of m.parts) bump(b.parts, p.type === 'unsupported' ? `unsupported:${p.what}` : p.type);
    }
    const order = orderOf(first.page.rows, t.source);
    if (order === 'up') b.orderNonDecreasing++;
    else if (order === 'down') b.orderDecreasing++;
    else b.orderUnknown++;

    const second = await reader.read(t, { limit });
    const again = second.ok ? normalizePage(second.page) : null;
    bump(b.secondRead, again && second.ok ? diffWindow(messages, again, { full: second.page.hasMore }).type : 'error');
    if (!again) bump(b.errors, second.ok ? 'unknown_shape' : second.error);

    if (first.page.before) {
      const older = await reader.read(t, { limit, before: first.page.before });
      const olderMessages = older.ok ? normalizePage(older.page) : null;
      if (olderMessages) {
        b.olderPages++;
        const ids = new Set(messages.map((m) => m.id));
        if (olderMessages.some((m) => ids.has(m.id))) b.olderOverlap++;
      } else {
        bump(b.errors, older.ok ? 'unknown_shape' : older.error);
      }
    }
  }
  return Object.fromEntries([...buckets].sort(([a], [b]) => a.localeCompare(b)));
}
