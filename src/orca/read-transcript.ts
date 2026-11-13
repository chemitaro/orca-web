// 会話の記録の取得元のアダプター。状態の API のエージェントの id から、Orca がそのタブに結んでいるセッションを解き、記録を読む。
// 端末のエージェントは nativeChat.readSession、構造化 Chat は agentSession.history（どちらも読む RPC）。
// セッションの識別子と記録のパスは Orca がタブに持つ値（Orca の画面の resolveNativeChatSession と同じ）を使い、ファイルの名前から作らない。
// 記録のパスは TranscriptTarget の中だけに持つ。Orca の誤りの文は捨て、code だけを返す。
import { createHash } from 'node:crypto';
import type { CapabilityReport } from './capabilities.ts';
import type { RpcTransport } from './rpc.ts';

export type TranscriptSource = 'nativeChat' | 'agentSession';

export type TranscriptErrorCode =
  | 'agent_not_found'
  | 'no_session'
  | 'transcript_not_found'
  | 'unreachable'
  | 'unsupported'
  | 'read_failed'
  | 'unknown_shape';

export interface TranscriptTarget {
  agentId: string;
  source: TranscriptSource;
  agentType: string;
  sessionId: string;
  /** 記録のパス（端末のエージェントだけ）。応答に出さない。 */
  transcriptPath: string | null;
  /** セッションの鍵（エージェントの id、取得元、種類、セッションの識別子の sha256 の先頭16桁）。 */
  key: string;
}

/** より古いページの位置。nativeChat は beforeOffset、agentSession は journal の cursor。 */
export type PagePosition = { offset: number } | { cursor: { epoch: string; sequence: number } };

export interface RawPage {
  source: TranscriptSource;
  /** Orca の件（nativeChat の messages か、agentSession の items）。 */
  rows: unknown[];
  hasMore: boolean;
  before: PagePosition | null;
}

export type Resolved = { ok: true; target: TranscriptTarget } | { ok: false; error: TranscriptErrorCode };
export type ReadResult = { ok: true; page: RawPage } | { ok: false; error: TranscriptErrorCode };

export interface TranscriptReader {
  resolve(agentId: string): Promise<Resolved>;
  read(target: TranscriptTarget, options: { limit: number; before?: PagePosition }): Promise<ReadResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

export function sessionKey(agentId: string, source: TranscriptSource, agentType: string, sessionId: string): string {
  return createHash('sha256').update([agentId, source, agentType, sessionId].join('\0')).digest('hex').slice(0, 16);
}

/** タブの集合の中から、状態の API の id（paneKey、タブの id、`chat:<タブの id>`）に当たるタブを探して解く。 */
export function resolveFromTabs(listAll: unknown, agentId: string): Resolved {
  if (!isRecord(listAll) || !Array.isArray(listAll.snapshots)) return { ok: false, error: 'unknown_shape' };
  for (const snap of listAll.snapshots) {
    if (!isRecord(snap) || !Array.isArray(snap.tabs)) return { ok: false, error: 'unknown_shape' };
    for (const tab of snap.tabs) {
      if (!isRecord(tab)) continue;
      if (tab.type === 'agent-session') {
        if (!text(tab.id) || `chat:${tab.id}` !== agentId) continue;
        const agentType = text(tab.agent);
        const sessionId = text(tab.sessionId);
        if (!agentType || !sessionId) return { ok: false, error: 'no_session' };
        return {
          ok: true,
          target: {
            agentId,
            source: 'agentSession',
            agentType,
            sessionId,
            transcriptPath: null,
            key: sessionKey(agentId, 'agentSession', agentType, sessionId),
          },
        };
      }
      if (tab.type !== 'terminal') continue;
      const paneKey = text(tab.parentTabId) && text(tab.leafId) ? `${tab.parentTabId}:${tab.leafId}` : null;
      if ((paneKey ?? text(tab.id)) !== agentId) continue;
      const status = isRecord(tab.agentStatus) ? tab.agentStatus : null;
      const ps = status && isRecord(status.providerSession) ? status.providerSession : null;
      const agentType = text(status?.agentType) ?? text(tab.launchAgent);
      const sessionId = text(ps?.id);
      if (!agentType || !sessionId) return { ok: false, error: 'no_session' };
      return {
        ok: true,
        target: {
          agentId,
          source: 'nativeChat',
          agentType,
          sessionId,
          transcriptPath: text(ps?.transcriptPath),
          key: sessionKey(agentId, 'nativeChat', agentType, sessionId),
        },
      };
    }
  }
  return { ok: false, error: 'agent_not_found' };
}

const RPC_TIMEOUT_MS = 15_000;
const INVENTORY_TTL_MS = 1_000;

function rpcError(outcome: { kind: string; code?: string }): TranscriptErrorCode {
  if (outcome.kind === 'unavailable' || outcome.kind === 'timeout' || outcome.kind === 'disconnected')
    return 'unreachable';
  if (outcome.kind === 'orca-error') return outcome.code === 'method_not_found' ? 'unsupported' : 'read_failed';
  return 'unknown_shape';
}

const isCursor = (v: unknown): v is { epoch: string; sequence: number } =>
  isRecord(v) &&
  typeof v.epoch === 'string' &&
  v.epoch.length > 0 &&
  Number.isInteger(v.sequence) &&
  (v.sequence as number) >= 0;

/** nativeChat.readSession の結果を解く。 */
export function parseNativePage(result: unknown): ReadResult {
  if (!isRecord(result)) return { ok: false, error: 'unknown_shape' };
  if (typeof result.error === 'string') {
    return { ok: false, error: result.notFound === true ? 'transcript_not_found' : 'read_failed' };
  }
  if (!Array.isArray(result.messages) || typeof result.hasMore !== 'boolean')
    return { ok: false, error: 'unknown_shape' };
  const offset = result.beforeOffset;
  const before =
    result.hasMore && Number.isInteger(offset) && (offset as number) >= 0 ? { offset: offset as number } : null;
  return { ok: true, page: { source: 'nativeChat', rows: result.messages, hasMore: before !== null, before } };
}

/** agentSession.history の結果を解く。reset に添えられた末尾の page は使わない。 */
export function parseJournalPage(result: unknown): ReadResult {
  if (!isRecord(result) || typeof result.ok !== 'boolean') return { ok: false, error: 'unknown_shape' };
  // reset（ok: false）は末尾のページを添えるが、古いページの代わりに返さない。
  if (result.ok !== true) return { ok: false, error: 'read_failed' };
  if (!isRecord(result.page)) return { ok: false, error: 'unknown_shape' };
  const page = result.page;
  if (!Array.isArray(page.items) || typeof page.hasOlder !== 'boolean' || !isRecord(page.window)) {
    return { ok: false, error: 'unknown_shape' };
  }
  const oldest = page.window.oldest;
  const before =
    page.hasOlder && isCursor(oldest) ? { cursor: { epoch: oldest.epoch, sequence: oldest.sequence } } : null;
  return { ok: true, page: { source: 'agentSession', rows: page.items, hasMore: before !== null, before } };
}

export function createTranscriptReader(deps: {
  rpc: RpcTransport;
  capabilities: () => Promise<CapabilityReport>;
  /** 共有の状態の最新の文書に、タブのないエージェントとして載るか。 */
  isUntabbedAgent?: (agentId: string) => boolean;
  now?: () => number;
}): TranscriptReader {
  const now = deps.now ?? Date.now;
  type Inventory = { ok: true; result: unknown } | { ok: false; error: TranscriptErrorCode };
  let inventory: { at: number; promise: Promise<Inventory> } | null = null;

  /** session.tabs.listAll。1秒の間は同じ読みを共有する（見張りが同時に解き直すとき）。 */
  const listAll = (): Promise<Inventory> => {
    if (inventory && now() - inventory.at < INVENTORY_TTL_MS) return inventory.promise;
    const promise = deps.rpc
      .call<unknown>('session.tabs.listAll', null, { timeoutMs: RPC_TIMEOUT_MS })
      .then((o): Inventory => (o.ok ? { ok: true, result: o.result } : { ok: false, error: rpcError(o) }));
    inventory = { at: now(), promise };
    return promise;
  };

  return {
    async resolve(agentId) {
      const caps = await deps.capabilities();
      if (caps.connection.state !== 'connected') return { ok: false, error: 'unreachable' };
      if (!caps.features.readTranscript.available) return { ok: false, error: 'unsupported' };
      const tabs = await listAll();
      if (!tabs.ok) return tabs;
      const resolved = resolveFromTabs(tabs.result, agentId);
      if (!resolved.ok && resolved.error === 'agent_not_found' && deps.isUntabbedAgent?.(agentId)) {
        return { ok: false, error: 'no_session' };
      }
      return resolved;
    },
    async read(target, options) {
      if (target.source === 'nativeChat') {
        const params: Record<string, unknown> = {
          agent: target.agentType,
          sessionId: target.sessionId,
          limit: options.limit,
          capabilities: { transcriptSourceOrder: 1 },
        };
        if (target.transcriptPath) params.transcriptPath = target.transcriptPath;
        if (options.before) {
          if (!('offset' in options.before)) return { ok: false, error: 'read_failed' };
          params.beforeOffset = options.before.offset;
        }
        const o = await deps.rpc.call<unknown>('nativeChat.readSession', params, { timeoutMs: RPC_TIMEOUT_MS });
        return o.ok ? parseNativePage(o.result) : { ok: false, error: rpcError(o) };
      }
      const params: Record<string, unknown> = {
        sessionId: target.sessionId,
        direction: 'tail',
        limit: Math.min(options.limit, 200),
      };
      if (options.before) {
        if (!('cursor' in options.before)) return { ok: false, error: 'read_failed' };
        params.direction = 'before';
        params.cursor = options.before.cursor;
      }
      const o = await deps.rpc.call<unknown>('agentSession.history', params, { timeoutMs: RPC_TIMEOUT_MS });
      return o.ok ? parseJournalPage(o.result) : { ok: false, error: rpcError(o) };
    },
  };
}
