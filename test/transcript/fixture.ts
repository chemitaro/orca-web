// 会話のテストの仮の Orca。タブの集合（session.tabs.listAll）と、会話の記録（nativeChat.readSession、agentSession.history）を、
// 手で書いた仮の会話で返す。本物の会話は写さない。形は stablyai/orca v1.4.256 に合わせる。
import type { CapabilityReport, FeatureReport } from '../../src/orca/capabilities.ts';
import type { RpcCallOptions, RpcOutcome, RpcTransport } from '../../src/orca/rpc.ts';

export const PANE_CLAUDE = 'tab-1:leaf-1';
export const PANE_CODEX = 'tab-2:leaf-2';
export const PANE_SLEEPING = 'tab-3:leaf-3';
export const CHAT_TAB = 'chat:chat-1';
export const SESSION_CLAUDE = 'aaaaaaaa-1111-4111-8111-111111111111';
export const SESSION_CODEX = 'bbbbbbbb-2222-4222-8222-222222222222';
export const SESSION_CHAT = 'cccccccc-3333-4333-8333-333333333333';
export const TRANSCRIPT_PATH = '/Users/someone/.claude/projects/demo/aaaaaaaa.jsonl';

export function tabsInventory(overrides: { claudeSession?: string } = {}) {
  return {
    snapshots: [
      {
        worktree: 'wt-1',
        tabs: [
          {
            type: 'terminal',
            id: 'leaf-1',
            parentTabId: 'tab-1',
            leafId: 'leaf-1',
            launchAgent: 'claude',
            agentStatus: {
              agentType: 'claude',
              state: 'working',
              providerSession: {
                key: 'session_id',
                id: overrides.claudeSession ?? SESSION_CLAUDE,
                transcriptPath: TRANSCRIPT_PATH,
              },
            },
          },
          { type: 'terminal', id: 'leaf-3', parentTabId: 'tab-3', leafId: 'leaf-3', launchAgent: 'claude' },
          { type: 'browser', id: 'browser-1' },
        ],
      },
      {
        worktree: 'wt-2',
        tabs: [
          {
            type: 'terminal',
            id: 'leaf-2',
            parentTabId: 'tab-2',
            leafId: 'leaf-2',
            agentStatus: { agentType: 'codex', providerSession: { key: 'session_id', id: SESSION_CODEX } },
          },
          { type: 'agent-session', id: 'chat-1', agent: 'claude', sessionId: SESSION_CHAT, title: '仮の構造化 Chat' },
        ],
      },
    ],
  };
}

const at = (n: number) => Date.UTC(2026, 10, 13, 0, 0, n);

/** 仮の端末の会話。思考、ツール、画像、未知のブロック、system の知らせ、危ない文字を含む。 */
export function nativeMessages() {
  return [
    {
      id: 'm1',
      role: 'user',
      blocks: [{ type: 'text', text: '仮の指示です' }],
      timestamp: at(1),
      source: 'transcript',
      transcriptOrder: 10,
    },
    {
      id: 'm2:reasoning',
      role: 'reasoning',
      blocks: [{ type: 'text', text: '仮の思考' }],
      timestamp: at(2),
      source: 'transcript',
      transcriptOrder: 20,
    },
    {
      id: 'm2',
      role: 'assistant',
      blocks: [
        { type: 'text', text: '<script>alert(1)</script> と <img src=x onerror=alert(2)>' },
        { type: 'tool-call', name: 'Bash', input: { command: 'ls' }, callId: 'call-1' },
      ],
      timestamp: at(3),
      source: 'transcript',
      transcriptOrder: 30,
    },
    {
      id: 'm3',
      role: 'tool',
      blocks: [{ type: 'tool-result', output: 'a.txt', callId: 'call-1' }],
      timestamp: at(4),
      source: 'transcript',
      transcriptOrder: 40,
    },
    {
      id: 'm4',
      role: 'user',
      blocks: [
        { type: 'image-ref', url: 'https://example.invalid/x.png' },
        { type: 'mystery', payload: 1 },
      ],
      timestamp: null,
      source: 'transcript',
      transcriptOrder: 50,
    },
    {
      id: 'm5',
      role: 'system',
      blocks: [{ type: 'text', text: 'Conversation interrupted' }],
      timestamp: at(6),
      source: 'transcript',
      transcriptOrder: 60,
    },
  ];
}

/** 仮の構造化 Chat の件。並びは sequence の順ではなく混ぜて返す。 */
export function journalItems() {
  const item = (itemId: string, sequence: number, body: unknown, sequenceIndex?: number) => ({
    itemId,
    revision: 1,
    sequence,
    ...(sequenceIndex === undefined ? {} : { sequenceIndex }),
    observedAt: at(sequence),
    body,
  });
  return [
    item('j3', 3, {
      kind: 'tool-call',
      name: 'Read',
      input: { path: 'a' },
      callId: 'c1',
      state: 'completed',
      output: { head: 'ok', byteLength: 2, digest: 'x', truncated: true },
    }),
    item('j1', 1, { kind: 'message', role: 'user', blocks: [{ type: 'text', text: '仮の質問' }] }),
    item('j0', 0, { kind: 'agent-start' }),
    item('j2b', 2, { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: '仮の答え' }] }, 1),
    item('j2a', 2, { kind: 'message', role: 'reasoning', blocks: [{ type: 'text', text: '仮の思考' }] }, 0),
    item('j4', 4, { kind: 'diff', path: 'a', patch: { head: '', byteLength: 0, digest: 'y', truncated: false } }),
    item('j5', 5, { kind: 'turn', state: 'completed' }),
    item('j6', 6, { kind: 'brand-new-kind<b>' }),
  ];
}

export interface FakeCall {
  method: string;
  params: unknown;
}

type Handler = (params: unknown) => RpcOutcome | Promise<RpcOutcome>;

/** 名前ごとの応答を返す偽の RPC。呼ばれた要求を覚える。 */
export class FakeRpc implements RpcTransport {
  readonly calls: FakeCall[] = [];
  handlers: Record<string, Handler>;

  constructor(handlers: Record<string, Handler>) {
    this.handlers = handlers;
  }

  async call<T = unknown>(method: string, params: unknown, _options?: RpcCallOptions): Promise<RpcOutcome<T>> {
    this.calls.push({ method, params });
    const handler = this.handlers[method];
    if (!handler)
      return { ok: false, kind: 'orca-error', code: 'method_not_found', message: `Unknown method: ${method}` };
    return (await handler(params)) as RpcOutcome<T>;
  }
}

export const ok = (result: unknown): RpcOutcome => ({ ok: true, result, runtimeId: 'rt-1' });

/** 既定の偽の Orca。端末の2つの会話と、構造化 Chat の1つの会話を返す。 */
export function fakeOrca() {
  return new FakeRpc({
    'session.tabs.listAll': () => ok(tabsInventory()),
    'nativeChat.readSession': () => ok({ messages: nativeMessages(), hasMore: true, beforeOffset: 1200 }),
    'agentSession.history': () =>
      ok({
        ok: true,
        page: {
          sessionId: SESSION_CHAT,
          epoch: 'ep-1',
          direction: 'tail',
          items: journalItems(),
          removedItemIds: [],
          submissions: [],
          window: {
            oldest: { epoch: 'ep-1', sequence: 1 },
            newest: { epoch: 'ep-1', sequence: 6 },
            nextCursor: { epoch: 'ep-1', sequence: 6 },
          },
          hasOlder: true,
          hasNewer: false,
        },
      }),
  });
}

const feature = (available: boolean): FeatureReport => ({
  available,
  satisfied: [],
  missing: available ? [] : ['x'],
  deferred: [],
});

export function capabilities(options: { connected?: boolean; readTranscript?: boolean } = {}): CapabilityReport {
  const connected = options.connected ?? true;
  return {
    checkedAt: '2026-11-13T00:00:00.000Z',
    cliVersion: '1.4.256',
    appVersion: '1.4.256',
    runtimeId: 'rt-1',
    runtimeIdConsistent: true,
    connection: connected ? { state: 'connected' } : { state: 'unreachable', reason: 'orca status: spawn-failed' },
    features: {
      readState: feature(connected),
      readTabs: feature(connected),
      openExistingTab: feature(false),
      readTranscript: feature(connected && (options.readTranscript ?? true)),
      sendGuarded: feature(false),
    },
  };
}
