import assert from 'node:assert/strict';
import test from 'node:test';
import type { RpcOutcome } from '../../src/orca/rpc.ts';
import * as send from '../../src/orca/send.ts';
import { parseTerminalQuestions } from '../../src/transcript/normalize.ts';
import { inventory, terminalTab, terminalTarget } from '../send/fixture.ts';

const ok = (result: unknown): RpcOutcome => ({ ok: true, result, runtimeId: 'runtime-test' });
test('つながる前の失敗だけは送っていないと分かる', () => {
  assert.deepEqual(send.classifyTerminal({ ok: false, kind: 'unavailable', message: 'private' }, terminalTarget()), {
    outcome: 'refused',
    detail: { code: 'not_sent' },
  });
});

test('端末の応答の失敗は書く前の拒否と結果不明を分け、誤りの文を出さない', () => {
  for (const code of [
    'method_not_found',
    'invalid_argument',
    'agent_prompt_blocked',
    'terminal_handle_stale',
    'operation_unknown',
  ]) {
    const safe = ['method_not_found', 'invalid_argument'].includes(code);
    assert.deepEqual(
      send.classifyTerminal({ ok: false, kind: 'orca-error', code, message: 'private' }, terminalTarget()),
      {
        outcome: safe ? 'refused' : 'unknown',
        detail: safe
          ? { code, method: 'terminal.send' }
          : code === 'agent_prompt_blocked'
            ? { code, warning: 'composer_may_hold_text' }
            : { code },
      },
    );
  }
  for (const kind of ['timeout', 'disconnected', 'invalid-frame', 'mismatched-id', 'oversized'] as const) {
    assert.deepEqual(send.classifyTerminal({ ok: false, kind, message: 'private' }, terminalTarget()), {
      outcome: 'unknown',
      detail: { code: kind },
    });
  }
});

test('端末の receipt は宛先と provider と観測した段階から判定する', () => {
  const cases: [unknown, send.SendResult][] = [
    [{ accepted: false }, { outcome: 'refused', detail: {} }],
    ...['no-agent', 'permission'].map(
      (reason) =>
        [
          { accepted: false, refusedReason: reason, secret: 'private' },
          { outcome: 'refused', detail: { refusedReason: reason } },
        ] as [unknown, send.SendResult],
    ),
    [{ accepted: true }, { outcome: 'unknown', detail: { warning: 'agent_not_verified' } }],
    ...['unsupported', 'old-host'].map(
      (provider) =>
        [
          { accepted: true, prompt: { provider } },
          { outcome: 'unknown', detail: { warning: 'agent_not_verified' } },
        ] as [unknown, send.SendResult],
    ),
    [
      { accepted: true, prompt: { provider: 'codex', stages: ['turn_started'], observation: 'incarnation_replaced' } },
      { outcome: 'unknown', detail: { observation: 'incarnation_replaced' } },
    ],
    [
      { accepted: true, prompt: { provider: 'claude', stages: ['turn_started'] } },
      { outcome: 'unknown', detail: { provider: 'claude', warning: 'agent_mismatch' } },
    ],
    [
      {
        accepted: true,
        prompt: { provider: 'codex', stages: ['input_accepted', 'turn_started'], observation: 'working' },
      },
      {
        outcome: 'submitted',
        detail: { provider: 'codex', stages: ['input_accepted', 'turn_started'], observation: 'working' },
      },
    ],
    [
      { accepted: true, prompt: { provider: 'codex', stages: ['input_accepted'], observation: 'permission' } },
      {
        outcome: 'input_accepted',
        detail: {
          provider: 'codex',
          stages: ['input_accepted'],
          observation: 'permission',
          warning: 'permission_after_submit',
        },
      },
    ],
    [
      { accepted: true, prompt: { provider: 'codex', stages: [] } },
      { outcome: 'unknown', detail: { provider: 'codex', stages: [] } },
    ],
    [null, { outcome: 'unknown', detail: { code: 'unknown_shape' } }],
  ];
  for (const [receipt, expected] of cases)
    assert.deepEqual(send.classifyTerminal(ok({ send: receipt }), terminalTarget()), expected);
  assert.deepEqual(
    send.classifyTerminal(
      ok({ send: { accepted: false }, mutation: { requestId: 'op', replayed: true } }),
      terminalTarget(),
    ),
    {
      outcome: 'refused',
      detail: { replayed: true },
    },
  );
});

test('Chat は未配送のカードを拒否にせず D-04 の各状態を区別する', () => {
  for (const [state, outcome] of [
    ['waiting', 'accepted'],
    ['returned', 'accepted'],
    ['withdrawn', 'refused'],
    ['dispatched', 'unknown'],
  ] as const) {
    assert.deepEqual(send.classifyChat(ok({ ok: true, value: { queued: { state } } })), {
      outcome,
      detail: { queuedState: state },
    });
  }
  for (const [dispatchState, outcome] of [
    ['pending', 'accepted'],
    ['accepted', 'submitted'],
    ['rejected', 'refused'],
    ['unknown', 'unknown'],
  ] as const) {
    assert.deepEqual(send.classifyChat(ok({ ok: true, value: { submission: { dispatchState } } })), {
      outcome,
      detail: { dispatchState },
    });
  }
  assert.deepEqual(
    send.classifyChat(
      ok({ ok: true, replayed: true, value: { submission: { dispatchState: 'rejected', queuedMessageId: 'card' } } }),
    ),
    { outcome: 'accepted', detail: { dispatchState: 'rejected', queuedState: 'card', replayed: true } },
  );
  assert.deepEqual(
    send.classifyChat(ok({ ok: false, refusal: { code: 'agent_session_conflict', message: 'private' } })),
    { outcome: 'refused', detail: { code: 'agent_session_conflict' } },
  );
  assert.deepEqual(send.classifyChat(ok({ ok: true, value: {} })), {
    outcome: 'unknown',
    detail: { code: 'unknown_shape' },
  });
  for (const code of ['method_not_found', 'invalid_argument'])
    assert.deepEqual(send.classifyChat({ ok: false, kind: 'orca-error', code, message: 'private' }), {
      outcome: 'refused',
      detail: { code, method: 'agentSession.send' },
    });
  assert.deepEqual(send.classifyChat({ ok: false, kind: 'unavailable', message: 'private' }), {
    outcome: 'refused',
    detail: { code: 'not_sent' },
  });
  for (const kind of ['timeout', 'disconnected', 'invalid-frame', 'mismatched-id', 'oversized'] as const)
    assert.deepEqual(send.classifyChat({ ok: false, kind, message: 'private' }), {
      outcome: 'unknown',
      detail: { code: kind },
    });
});

test('Chat の指紋は Orca の鍵順の固定 JSON の sha256 と一致する', () => {
  // 手で鍵を並べた JSON: {"fields":{"body":{"blocks":[{"text":"hello","type":"text"}],"kind":"message","role":"user"}},"method":"agentSession.send","sessionId":"session-chat-test"}
  const body = { role: 'user', blocks: [{ type: 'text', text: 'hello' }], kind: 'message', omitted: undefined };
  assert.equal(
    send.chatFingerprint('session-chat-test', body),
    '56ea951b22aa4819bfb1e50833dc60af35d0e8166771be7bb6ad994a1f91564c',
  );
});

test('端末の状態を読み、読めない理由に method 名を残す', async () => {
  const { SendRpc } = await import('../../src/orca/send-gates.ts');
  let response: RpcOutcome = ok({ agentStatus: { isRunningAgent: true, status: 'idle' } });
  const rpc = new SendRpc({
    async call<T>(method: string, params: unknown) {
      assert.equal(method, 'terminal.agentStatus');
      assert.deepEqual(params, { terminal: 'term_test' });
      return response as RpcOutcome<T>;
    },
  });
  const adapter = send.createSendAdapter({ rpc });
  assert.deepEqual(await adapter.readTerminalStatus('term_test'), { ok: true, isRunningAgent: true, status: 'idle' });
  for (const [code, error] of [
    ['method_not_found', 'unsupported'],
    ['terminal_handle_stale', 'terminal_gone'],
    ['terminal_not_found', 'terminal_gone'],
    ['terminal_gone', 'terminal_gone'],
    ['terminal_exited', 'terminal_gone'],
  ] as const) {
    response = { ok: false, kind: 'orca-error', code, message: 'private' };
    assert.deepEqual(await adapter.readTerminalStatus('term_test'), {
      ok: false,
      error,
      ...(error === 'unsupported' ? { method: 'terminal.agentStatus' } : {}),
    });
  }
  response = { ok: false, kind: 'timeout', message: 'private' };
  assert.deepEqual(await adapter.readTerminalStatus('term_test'), { ok: false, error: 'unreachable' });
  response = ok({ agentStatus: { status: 'idle' } });
  assert.deepEqual(await adapter.readTerminalStatus('term_test'), { ok: false, error: 'unknown_shape' });
});

test('前面を Orca と同じ規則でシェルと宛先のエージェントに分け空の観測は拒む', async () => {
  const { SendRpc } = await import('../../src/orca/send-gates.ts');
  let foreground: unknown;
  const rpc = new SendRpc({
    async call<T>(method: string, params: unknown) {
      assert.equal(method, 'terminal.inspectProcess');
      assert.deepEqual(params, { terminal: 'term_test', expectedIncarnationId: 'inc-test' });
      return ok({ process: { foregroundProcess: foreground } }) as RpcOutcome<T>;
    },
  });
  const adapter = send.createSendAdapter({ rpc });
  for (foreground of [
    'bash',
    'zsh',
    'sh',
    'fish',
    'cmd',
    'powershell',
    'pwsh',
    'nu',
    'ksh',
    'mksh',
    'dash',
    'ash',
    'tcsh',
    'csh',
    'elvish',
    'xonsh',
    '"/BIN/BASH"',
    "'C:\\Windows\\PowerShell.EXE'",
    '/bin/bash.cmd',
    'zsh.bat',
    'pwsh.ps1',
  ]) {
    assert.deepEqual(await adapter.readForeground('term_test', 'inc-test', 'codex'), {
      ok: true,
      isShell: true,
      matchesAgent: false,
    });
  }
  for (const [process, agentType, matchesAgent] of [
    ['claude', 'claude', true],
    ['codex', 'codex', true],
    ['codex-aarch64-apple-darwin', 'codex', true],
    ['  "/usr/local/bin/CLAUDE"  ', 'claude', true],
    ["'C:\\Tools\\Codex.EXE'", 'codex', true],
    ['/bin/claude.cmd', 'claude', true],
    ['codex.bat', 'codex', true],
    ['CLAUDE.ps1', 'claude', true],
    ['python3', 'claude', false],
    ['node', 'codex', false],
    ['2.1.0', 'claude', false],
    ['claude.2.1.0', 'claude', false],
    ['claude.js', 'claude', false],
    ['codex.js', 'codex', false],
    ['codexish', 'codex', false],
    ['codex', 'claude', false],
    ['claude', 'codex', false],
    ['antigravity', 'antigravity', false],
    ['codex', 'other', false],
  ] as const) {
    foreground = process;
    assert.deepEqual(
      await adapter.readForeground('term_test', 'inc-test', agentType),
      { ok: true, isShell: false, matchesAgent },
      `${agentType}: ${process}`,
    );
  }
  for (foreground of [null, '', '  ', 3])
    assert.deepEqual(await adapter.readForeground('term_test', 'inc-test', 'codex'), {
      ok: false,
      error: 'foreground_unknown',
    });
});

test('Chat の fence は同じ sessionId の正の整数だけを受ける', async () => {
  const { SendRpc } = await import('../../src/orca/send-gates.ts');
  let page: unknown = { sessionId: 'chat', fence: 2 };
  const adapter = send.createSendAdapter({
    rpc: new SendRpc({
      async call<T>(method: string, params: unknown) {
        assert.equal(method, 'agentSession.history');
        assert.deepEqual(params, { sessionId: 'chat', direction: 'tail', limit: 1 });
        return ok({ ok: true, page }) as RpcOutcome<T>;
      },
    }),
  });
  assert.deepEqual(await adapter.readChatFence('chat'), { ok: true, fence: 2 });
  for (page of [
    { sessionId: 'other', fence: 1 },
    { sessionId: 'chat', fence: 0 },
    { sessionId: 'chat', fence: 1.5 },
    {},
  ])
    assert.deepEqual(await adapter.readChatFence('chat'), { ok: false, error: 'unknown_shape' });
});

test('送る関数は正しい封筒と期限で一度だけ送り時間切れでも再試行しない', async () => {
  const { SendRpc } = await import('../../src/orca/send-gates.ts');
  const { chatTarget } = await import('../send/fixture.ts');
  const calls: unknown[] = [];
  const adapter = send.createSendAdapter({
    rpc: new SendRpc({
      async call<T>(method: string, params: unknown, options?: import('../../src/orca/rpc.ts').RpcCallOptions) {
        calls.push({ method, params, options });
        return { ok: false, kind: 'timeout', message: 'private' } as RpcOutcome<T>;
      },
    }),
  });
  const id = '1234567890123-0123456789abcdef0123456789abcdef';
  assert.deepEqual(await adapter.sendTerminal(terminalTarget(), 'hello', id), {
    outcome: 'unknown',
    detail: { code: 'timeout' },
  });
  assert.deepEqual(await adapter.sendChat(chatTarget(), 'hello', id, 2), {
    outcome: 'unknown',
    detail: { code: 'timeout' },
  });
  assert.deepEqual(calls, [
    {
      method: 'terminal.send',
      params: {
        terminal: 'term_test',
        text: 'hello',
        enter: true,
        agentPrompt: true,
        client: { id: 'orca-web', type: 'desktop' },
        waitSubmitMs: 10000,
      },
      options: { timeoutMs: 25000, envelope: { orchestrationRequestId: id } },
    },
    {
      method: 'agentSession.send',
      params: {
        body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'hello' }] },
        envelope: {
          sessionId: 'session-chat-test',
          clientOperationId: id,
          expectedRuntimeFence: 2,
          payloadFingerprint: '56ea951b22aa4819bfb1e50833dc60af35d0e8166771be7bb6ad994a1f91564c',
        },
      },
      options: { timeoutMs: 15000 },
    },
  ]);
});

test('端末の照会は requestShow だけを読み receipt と pending と absent を区別する', async () => {
  const { SendRpc } = await import('../../src/orca/send-gates.ts');
  let response: RpcOutcome = ok({
    state: 'completed',
    receipt: { send: { accepted: true, prompt: { provider: 'claude', stages: ['turn_started'] } } },
  });
  const adapter = send.createSendAdapter({
    rpc: new SendRpc({
      async call<T>(method: string, params: unknown) {
        assert.equal(method, 'orchestration.requestShow');
        assert.deepEqual(params, { request: 'op' });
        return response as RpcOutcome<T>;
      },
    }),
  });
  assert.deepEqual(await adapter.checkTerminal(terminalTarget(), 'op'), {
    ok: true,
    outcome: 'unknown',
    detail: { provider: 'claude', warning: 'agent_mismatch' },
  });
  for (const state of ['pending', 'absent']) {
    response = ok({ state });
    assert.deepEqual(await adapter.checkTerminal(terminalTarget(), 'op'), {
      ok: true,
      outcome: 'unknown',
      detail: { code: `orca_${state}` },
    });
  }
  response = { ok: false, kind: 'unavailable', message: 'private' };
  assert.deepEqual(await adapter.checkTerminal(terminalTarget(), 'op'), { ok: false, error: 'unreachable' });
  response = { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' };
  assert.deepEqual(await adapter.checkTerminal(terminalTarget(), 'op'), {
    ok: false,
    error: 'unsupported',
    method: 'orchestration.requestShow',
  });
});

test('Chat の照会は記録の有無と同じ会話のカード・最新の submission を読むだけ', async () => {
  const { SendRpc } = await import('../../src/orca/send-gates.ts');
  const { chatTarget } = await import('../send/fixture.ts');
  let recorded = false;
  let page: Record<string, unknown> = { sessionId: 'session-chat-test', queuedMessages: [], submissions: [] };
  const methods: string[] = [];
  const adapter = send.createSendAdapter({
    rpc: new SendRpc({
      async call<T>(method: string, params: unknown) {
        methods.push(method);
        if (method === 'agentSession.sendRecorded') {
          assert.deepEqual(params, { sessionId: 'session-chat-test', clientMessageId: 'op' });
          return ok({ recorded }) as RpcOutcome<T>;
        }
        assert.equal(method, 'agentSession.history');
        assert.deepEqual(params, { sessionId: 'session-chat-test', direction: 'tail', limit: 200 });
        return ok({ ok: true, page }) as RpcOutcome<T>;
      },
    }),
  });
  const check = () => adapter.checkChat(chatTarget(), 'op');
  assert.deepEqual(await check(), { ok: true, outcome: 'unknown', detail: { code: 'orca_not_recorded' } });
  assert.deepEqual(methods, ['agentSession.sendRecorded']);
  recorded = true;
  assert.deepEqual(await check(), { ok: true, outcome: 'unknown', detail: { code: 'orca_recorded' } });
  page.submissions = [{ clientMessageId: 'op', dispatchState: 'accepted' }];
  assert.deepEqual(await check(), { ok: true, outcome: 'submitted', detail: { dispatchState: 'accepted' } });
  page.queuedMessages = [{ messageId: 'op', state: 'returned' }];
  assert.deepEqual(await check(), { ok: true, outcome: 'accepted', detail: { queuedState: 'returned' } });
  page.queuedMessages = [];
  page.submissions = [
    { queuedMessageId: 'op', dispatchState: 'accepted', submittedSequence: 10 },
    { queuedMessageId: 'op', dispatchState: 'rejected', submittedSequence: 2 },
  ];
  assert.deepEqual(await check(), { ok: true, outcome: 'submitted', detail: { dispatchState: 'accepted' } });
  page = { ...page, sessionId: 'other' };
  assert.deepEqual(await check(), { ok: true, outcome: 'unknown', detail: { code: 'orca_recorded' } });
});

test('カードが消え queuedMessageId だけで当たった rejected の照会は card_gone にする', async () => {
  const { SendRpc } = await import('../../src/orca/send-gates.ts');
  const { chatTarget } = await import('../send/fixture.ts');
  const page: Record<string, unknown> = {
    sessionId: 'session-chat-test',
    queuedMessages: [],
    submissions: [
      { queuedMessageId: 'op', dispatchState: 'accepted', submittedSequence: 1 },
      { queuedMessageId: 'op', dispatchState: 'rejected', submittedSequence: 2 },
    ],
  };
  const adapter = send.createSendAdapter({
    rpc: new SendRpc({
      async call<T>(method: string) {
        assert.ok(['agentSession.sendRecorded', 'agentSession.history'].includes(method));
        return ok(
          method === 'agentSession.sendRecorded'
            ? { recorded: true }
            : {
                ok: true,
                page,
              },
        ) as RpcOutcome<T>;
      },
    }),
  });
  assert.deepEqual(await adapter.checkChat(chatTarget(), 'op'), {
    ok: true,
    outcome: 'unknown',
    detail: { code: 'card_gone', dispatchState: 'rejected' },
  });
  page.queuedMessages = [{ messageId: 'op', state: 'returned' }];
  assert.deepEqual(await adapter.checkChat(chatTarget(), 'op'), {
    ok: true,
    outcome: 'accepted',
    detail: { queuedState: 'returned' },
  });
  page.queuedMessages = [];
  page.submissions = [{ clientMessageId: 'op', queuedMessageId: 'other', dispatchState: 'rejected' }];
  assert.deepEqual(await adapter.checkChat(chatTarget(), 'op'), {
    ok: true,
    outcome: 'accepted',
    detail: { dispatchState: 'rejected', queuedState: 'card' },
  });
});

// ---- 質問への答え（D-02、T-05） ----

const opId = '1234567890123-0123456789abcdef0123456789abcdef';
const option = (id: string) => ({ id, label: `仮の${id}` });
const questionBody = (resolution: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  kind: 'question',
  question: '外',
  options: [],
  questions: [
    { id: 'q1', question: '一', multiSelect: false, options: [option('a'), option('b')] },
    { id: 'q2', question: '二', multiSelect: false, options: [], freeTextQuestionId: 'q2' },
  ],
  resolution,
  ...extra,
});
const pendingResolution = { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null };
const resolvedWith = (extra: Record<string, unknown>) => ({
  state: 'resolved',
  selectedOptionId: null,
  resolvedBy: 'other',
  resolvedAt: 5,
  ...extra,
});
const historyPage = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  ok: true,
  page: { sessionId: 'session-chat-test', fence: 7, items, ...extra },
});
const item = (body: unknown, revision = 3, itemId = 'item-test') => ({ itemId, revision, sequence: 1, body });

async function answerAdapter(reply: () => RpcOutcome) {
  const { SendRpc } = await import('../../src/orca/send-gates.ts');
  const calls: { method: string; params: unknown; options: unknown }[] = [];
  const adapter = send.createSendAdapter({
    rpc: new SendRpc({
      async call<T>(method: string, params: unknown, options?: import('../../src/orca/rpc.ts').RpcCallOptions) {
        calls.push({ method, params, options });
        return reply() as RpcOutcome<T>;
      },
    }),
  });
  return { adapter, calls };
}

test('T-05 answerChat は D-02 の params と指紋を、期限 15 秒で一度だけ送る', async () => {
  const { chatTarget } = await import('../send/fixture.ts');
  const { adapter, calls } = await answerAdapter(() =>
    ok({ ok: true, value: { itemId: 'item-test', revision: 4, resolution: { state: 'resolved' } } }),
  );
  const answers = [{ questionId: 'q1', optionIds: ['a'] }];
  assert.deepEqual(await adapter.answerChat(chatTarget(), { itemId: 'item-test', revision: 3 }, answers, opId, 2), {
    outcome: 'submitted',
    detail: { code: 'resolved' },
  });
  assert.deepEqual(calls, [
    {
      method: 'agentSession.respondToQuestion',
      params: {
        envelope: {
          sessionId: 'session-chat-test',
          clientOperationId: opId,
          expectedRuntimeFence: 2,
          // 手で鍵を並べた JSON: {"fields":{"answers":[{"optionIds":["a"],"questionId":"q1"}],"expectedRevision":3,"itemId":"item-test"},"method":"agentSession.respondTo:question","sessionId":"session-chat-test"}
          payloadFingerprint: 'f51caf7a44b63906a15c51ae63ec2d4bb5a90c30ed98d14a1c531329e3d88fe7',
        },
        itemId: 'item-test',
        expectedRevision: 3,
        answers,
      },
      options: { timeoutMs: 15000 },
    },
  ]);
  assert.equal(
    send.answerFingerprint('session-chat-test', { itemId: 'item-test', expectedRevision: 3, answers }),
    'f51caf7a44b63906a15c51ae63ec2d4bb5a90c30ed98d14a1c531329e3d88fe7',
  );
});

test('T-05 classifyAnswer は resolved・cancelled・refusal・pending・知らない形・RPC の失敗を分け、replayed を写す', () => {
  const value = (state: unknown) => ok({ ok: true, value: { itemId: 'i', revision: 2, resolution: { state } } });
  const cases: [RpcOutcome, send.SendResult][] = [
    [value('resolved'), { outcome: 'submitted', detail: { code: 'resolved' } }],
    [value('cancelled'), { outcome: 'refused', detail: { code: 'cancelled' } }],
    [value('pending'), { outcome: 'unknown', detail: { code: 'prompt_pending' } }],
    [value('expired'), { outcome: 'unknown', detail: { code: 'unknown_shape' } }],
    [ok({ ok: true, value: {} }), { outcome: 'unknown', detail: { code: 'unknown_shape' } }],
    [ok(null), { outcome: 'unknown', detail: { code: 'unknown_shape' } }],
    [
      ok({ ok: false, refusal: { code: 'agent_session_already_resolved', message: 'private' } }),
      { outcome: 'refused', detail: { code: 'agent_session_already_resolved' } },
    ],
    [ok({ ok: false, refusal: {} }), { outcome: 'unknown', detail: { code: 'unknown_shape' } }],
    [
      { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' },
      { outcome: 'refused', detail: { code: 'method_not_found', method: 'agentSession.respondToQuestion' } },
    ],
    [
      { ok: false, kind: 'orca-error', code: 'invalid_argument', message: 'private' },
      { outcome: 'refused', detail: { code: 'invalid_argument', method: 'agentSession.respondToQuestion' } },
    ],
    [
      { ok: false, kind: 'unavailable', message: 'private' },
      { outcome: 'refused', detail: { code: 'not_sent' } },
    ],
    [
      { ok: false, kind: 'timeout', message: 'private' },
      { outcome: 'unknown', detail: { code: 'timeout' } },
    ],
    [
      ok({ ok: true, replayed: true, value: { resolution: { state: 'resolved' } } }),
      { outcome: 'submitted', detail: { code: 'resolved', replayed: true } },
    ],
  ];
  for (const [outcome, expected] of cases)
    assert.deepEqual(send.classifyAnswer(outcome), expected, JSON.stringify(outcome));
});

test('T-05 readQuestion は history を1回読み、fence と項目の状態を返し、見つからない・知らない形を分ける', async () => {
  let reply: RpcOutcome = ok(historyPage([item(questionBody(pendingResolution))]));
  const { adapter, calls } = await answerAdapter(() => reply);
  const read = await adapter.readQuestion('session-chat-test', 'item-test');
  assert.ok(read.ok);
  assert.equal(read.fence, 7);
  assert.equal(read.revision, 3);
  assert.equal(read.state, 'pending');
  assert.deepEqual(
    read.questions.map((q) => q.id),
    ['q1', 'q2'],
  );
  assert.deepEqual(calls, [
    {
      method: 'agentSession.history',
      params: { sessionId: 'session-chat-test', direction: 'tail', limit: 200 },
      options: undefined,
    },
  ]);
  reply = ok(historyPage([item(questionBody(pendingResolution), 3, 'other-item')]));
  assert.deepEqual(await adapter.readQuestion('session-chat-test', 'item-test'), {
    ok: false,
    error: 'question_not_found',
  });
  for (const bad of [
    historyPage([item(questionBody({ ...pendingResolution, state: 'expired' }))]),
    historyPage([item({ kind: 'approval', title: 'x', options: [], resolution: pendingResolution })]),
    historyPage([item(questionBody(pendingResolution))], { sessionId: 'other' }),
    historyPage([item(questionBody(pendingResolution))], { fence: 0 }),
    historyPage([item(questionBody(pendingResolution))], { items: 'x' }),
    { ok: false, refusal: { code: 'x' } },
  ]) {
    reply = ok(bad);
    assert.deepEqual(await adapter.readQuestion('session-chat-test', 'item-test'), {
      ok: false,
      error: 'unknown_shape',
    });
  }
  reply = { ok: false, kind: 'timeout', message: 'private' };
  assert.deepEqual(await adapter.readQuestion('session-chat-test', 'item-test'), { ok: false, error: 'unreachable' });
  assert.ok(calls.every((c) => c.method === 'agentSession.history'));
});

test('T-05 checkAnswer は今の状態を読むだけで結果を返し、送らない', async () => {
  const { chatTarget } = await import('../send/fixture.ts');
  const { answerForm, digestAnswers } = await import('../../src/send/answer.ts');
  const { parseJournalQuestion } = await import('../../src/transcript/normalize.ts');
  const long = 'x'.repeat(5000);
  // 送った答え：4,000 字を超えるその他の文と、数えない other を含む
  const sentRaw = [
    { questionId: 'q1', optionIds: ['a'], other: '  ' },
    { questionId: 'q2', optionIds: [], other: long },
  ];
  const parsed = parseJournalQuestion(item(questionBody(pendingResolution)));
  assert.ok(parsed);
  const digest = digestAnswers(answerForm(parsed.questions, sentRaw));
  const prompt = { itemId: 'item-test', revision: 3 };
  let reply: RpcOutcome = ok(historyPage([]));
  const { adapter, calls } = await answerAdapter(() => reply);
  const check = () => adapter.checkAnswer(chatTarget(), prompt, digest, opId);
  const cases: [unknown, send.SendRead<send.SendResult>][] = [
    // Orca が書いた答え（数えない other は送っていないので無い）
    [
      historyPage([
        item(
          questionBody(
            resolvedWith({
              answers: [
                { questionId: 'q1', optionIds: ['a'] },
                { questionId: 'q2', optionIds: [], other: long },
              ],
            }),
          ),
          4,
        ),
      ]),
      { ok: true, outcome: 'submitted', detail: { code: 'resolved' } },
    ],
    [
      historyPage([
        item(
          questionBody(
            resolvedWith({
              answers: [
                { questionId: 'q1', optionIds: ['b'] },
                { questionId: 'q2', optionIds: [], other: '別' },
              ],
            }),
          ),
          4,
        ),
      ]),
      { ok: true, outcome: 'refused', detail: { code: 'resolved_by_other' } },
    ],
    [
      historyPage([item(questionBody(resolvedWith({ selectedOptionId: 'unparseable' })), 4)]),
      { ok: true, outcome: 'unknown', detail: { code: 'resolved_unverified' } },
    ],
    [
      historyPage([
        item(questionBody({ state: 'cancelled', selectedOptionId: null, resolvedBy: null, resolvedAt: 1 }), 4),
      ]),
      { ok: true, outcome: 'refused', detail: { code: 'cancelled' } },
    ],
    [
      historyPage([item(questionBody(pendingResolution), 3)]),
      { ok: true, outcome: 'unknown', detail: { code: 'prompt_pending' } },
    ],
    [historyPage([]), { ok: true, outcome: 'unknown', detail: { code: 'question_not_found' } }],
  ];
  for (const [page, expected] of cases) {
    reply = ok(page);
    assert.deepEqual(await check(), expected);
  }
  reply = { ok: false, kind: 'timeout', message: 'private' };
  assert.deepEqual(await check(), { ok: false, error: 'unreachable' });
  assert.ok(calls.every((c) => c.method === 'agentSession.history'));
});

// ---- キーの組の送信（iss-00049 D-04、T-07） ----

const KEY_PROMPT = JSON.stringify({ questions: [{ question: '仮の問い', options: ['甲', '乙'] }] });
const KEY_QUESTIONS = parseTerminalQuestions(KEY_PROMPT)?.questions ?? [];
const promptTabs = (status: Record<string, unknown> = {}) =>
  ok(
    inventory([
      {
        ...terminalTab(),
        agentStatus: {
          agentType: 'codex',
          providerSession: { id: 'session-terminal-test' },
          state: 'waiting',
          toolName: 'AskUserQuestion',
          interactivePrompt: KEY_PROMPT,
          ...status,
        },
      },
    ]),
  );
/**
 * outcomes は terminal.send の結果の順。前面の読み（terminal.inspectProcess）は foregrounds の順、なければ宛先と同じ codex。
 * タブの読み（session.tabs.listAll）は listAlls の順、なければ宛先のペインが KEY_QUESTIONS を出している一覧。
 */
function keyRpc(outcomes: RpcOutcome[], foregrounds: RpcOutcome[] = [], listAlls: RpcOutcome[] = []) {
  const calls: { method: string; params: unknown; options: unknown }[] = [];
  const inspects: unknown[] = [];
  const order: string[] = [];
  const rpc = {
    async call(method: string, params: unknown, options?: unknown) {
      order.push(method);
      if (method === 'terminal.inspectProcess') {
        inspects.push(params);
        return foregrounds.shift() ?? ok({ process: { foregroundProcess: 'codex' } });
      }
      if (method === 'session.tabs.listAll') return listAlls.shift() ?? promptTabs();
      calls.push({ method, params, options });
      const next = outcomes.shift();
      assert.ok(next, 'no more outcomes');
      return next;
    },
  } as unknown as import('../../src/orca/send-gates.ts').SendRpc;
  return { adapter: send.createSendAdapter({ rpc }), calls, inspects, order };
}
const settled = (outcome: 'accepted' | 'refused', accepted = outcome === 'accepted') =>
  ok({ send: { accepted, writeSettlement: { outcome } } });

test('T-07 sendKeyGroup：writeSettlement と accepted と RPC の誤りを accepted・refused・unknown に分ける', async () => {
  const cases: [RpcOutcome, string][] = [
    [settled('accepted'), 'accepted'],
    [settled('refused', false), 'refused'],
    [settled('refused', true), 'refused'],
    [ok({ send: { accepted: false, writeSettlement: { outcome: 'accepted' } } }), 'unknown'],
    [ok({ send: { accepted: true, writeSettlement: { outcome: 'pending' } } }), 'unknown'],
    [ok({ send: { accepted: true, writeSettlement: null } }), 'unknown'],
    // writeSettlement がなければ書き込みの完了を確かめられない（requireWriteSettlement を知らない古い Orca）
    [ok({ send: { accepted: true } }), 'unknown'],
    [ok({ send: { accepted: false } }), 'refused'],
    [ok({ send: {} }), 'unknown'],
    [ok({}), 'unknown'],
    [ok(null), 'unknown'],
    [{ ok: false, kind: 'unavailable', message: 'private' }, 'refused'],
    [{ ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' }, 'refused'],
    [{ ok: false, kind: 'orca-error', code: 'invalid_argument', message: 'private' }, 'refused'],
    [{ ok: false, kind: 'orca-error', code: 'terminal_handle_stale', message: 'private' }, 'unknown'],
    [{ ok: false, kind: 'timeout', message: 'private' }, 'unknown'],
    [{ ok: false, kind: 'disconnected', message: 'private' }, 'unknown'],
  ];
  for (const [outcome, expected] of cases) {
    const { adapter, calls } = keyRpc([outcome]);
    assert.equal(await adapter.sendKeyGroup(terminalTarget(), '1'), expected, JSON.stringify(outcome));
    assert.deepEqual(calls, [
      {
        method: 'terminal.send',
        params: {
          terminal: 'term_test',
          text: '1',
          enter: false,
          requireWriteSettlement: true,
          client: { id: 'orca-web', type: 'desktop' },
        },
        options: { timeoutMs: 10000 },
      },
    ]);
  }
});

function sleeper(log: string[]) {
  return async (ms: number) => {
    log.push(`sleep:${ms}`);
  };
}

test('T-07 answerKeys：組の間に 1000ms を待ち、前の結果の後に次を送り、全部で input_accepted（keys_sent）', async () => {
  const log: string[] = [];
  const outcomes = [settled('accepted'), settled('accepted'), settled('accepted')];
  const { adapter, calls } = keyRpc(outcomes);
  const rpc = (adapter as unknown as { sendKeyGroup: unknown }).sendKeyGroup;
  assert.ok(rpc);
  const result = await adapter.answerKeys(terminalTarget(), ['1', '仮', '\r'], KEY_QUESTIONS, async (ms) => {
    log.push(`sleep:${ms}:${calls.length}`);
  });
  assert.deepEqual(result, { outcome: 'input_accepted', detail: { code: 'keys_sent', sentGroups: 3, totalGroups: 3 } });
  assert.deepEqual(
    calls.map((c) => (c.params as { text: string }).text),
    ['1', '仮', '\r'],
  );
  // 1組目はすぐ、2組目と3組目の前に 1000ms（前の組の結果の後）
  assert.deepEqual(log, ['sleep:1000:1', 'sleep:1000:2']);
});

test('T-07 answerKeys：1組目 refused は refused（not_sent）、1組目 unknown は unknown（unconfirmed）で、次を送らない', async () => {
  for (const [first, expected] of [
    [settled('refused', false), { outcome: 'refused', detail: { code: 'not_sent', sentGroups: 0, totalGroups: 3 } }],
    [
      { ok: false, kind: 'unavailable', message: 'private' },
      { outcome: 'refused', detail: { code: 'not_sent', sentGroups: 0, totalGroups: 3 } },
    ],
    [
      { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' },
      {
        outcome: 'refused',
        detail: { code: 'method_not_found', method: 'terminal.send', sentGroups: 0, totalGroups: 3 },
      },
    ],
    [ok({ send: {} }), { outcome: 'unknown', detail: { code: 'unconfirmed', sentGroups: 0, totalGroups: 3 } }],
    [
      { ok: false, kind: 'timeout', message: 'private' },
      { outcome: 'unknown', detail: { code: 'unconfirmed', sentGroups: 0, totalGroups: 3 } },
    ],
  ] as [RpcOutcome, send.SendResult][]) {
    const log: string[] = [];
    const { adapter, calls } = keyRpc([first]);
    assert.deepEqual(
      await adapter.answerKeys(terminalTarget(), ['1', '2', '\r'], KEY_QUESTIONS, sleeper(log)),
      expected,
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(log, []);
  }
});

test('T-07 answerKeys：2組目以降で止まれば unknown（partial_sent）と送った組の数を返し、残りを送らない', async () => {
  for (const second of [
    settled('refused', false),
    ok({ send: { accepted: true, writeSettlement: { outcome: 'pending' } } }),
    { ok: false, kind: 'timeout', message: 'private' } as RpcOutcome,
    { ok: false, kind: 'unavailable', message: 'private' } as RpcOutcome,
  ]) {
    const { adapter, calls } = keyRpc([settled('accepted'), second]);
    assert.deepEqual(await adapter.answerKeys(terminalTarget(), ['1', '2', '3', '\r'], KEY_QUESTIONS, sleeper([])), {
      outcome: 'unknown',
      detail: { code: 'partial_sent', sentGroups: 1, totalGroups: 4 },
    });
    assert.equal(calls.length, 2);
  }
  const { adapter, calls } = keyRpc([settled('accepted'), settled('accepted'), settled('refused', false)]);
  assert.deepEqual(await adapter.answerKeys(terminalTarget(), ['1', '2', '3', '\r'], KEY_QUESTIONS, sleeper([])), {
    outcome: 'unknown',
    detail: { code: 'partial_sent', sentGroups: 2, totalGroups: 4 },
  });
  assert.equal(calls.length, 3);
});

// ---- 承認の答え（iss-00050 D-03、T-05） ----

const approvalOptions = [
  { id: 'allow', label: 'Allow', intent: 'allow_once' },
  { id: 'allowForSession', label: 'Allow for this session', intent: 'allow_always' },
  { id: 'deny', label: 'Deny', intent: 'reject_once' },
];
const approvalBody = (resolution: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  kind: 'approval',
  title: '仮の承認',
  detail: null,
  options: approvalOptions,
  resolution,
  ...extra,
});

test('T-05 answerApproval は D-03 の params と指紋を、期限 15 秒で一度だけ送る', async () => {
  const { chatTarget } = await import('../send/fixture.ts');
  const { adapter, calls } = await answerAdapter(() =>
    ok({ ok: true, value: { itemId: 'item-test', revision: 4, resolution: { state: 'resolved' } } }),
  );
  assert.deepEqual(await adapter.answerApproval(chatTarget(), { itemId: 'item-test', revision: 3 }, 'allow', opId, 2), {
    outcome: 'submitted',
    detail: { code: 'resolved' },
  });
  assert.deepEqual(calls, [
    {
      method: 'agentSession.respondToApproval',
      params: {
        envelope: {
          sessionId: 'session-chat-test',
          clientOperationId: opId,
          expectedRuntimeFence: 2,
          // 手で鍵を並べた JSON: {"fields":{"expectedRevision":3,"itemId":"item-test","optionId":"allow"},"method":"agentSession.respondTo:approval","sessionId":"session-chat-test"}
          payloadFingerprint: 'cb42264547f0b0750929fb866d75bd2185f804951e2b27b97659ba36b39f229a',
        },
        itemId: 'item-test',
        expectedRevision: 3,
        optionId: 'allow',
      },
      options: { timeoutMs: 15000 },
    },
  ]);
  assert.equal(
    send.approvalFingerprint('session-chat-test', { itemId: 'item-test', expectedRevision: 3, optionId: 'allow' }),
    'cb42264547f0b0750929fb866d75bd2185f804951e2b27b97659ba36b39f229a',
  );
});

test('T-05 answerApproval の結果は resolved・cancelled・refusal・pending・知らない形・RPC の失敗を分け、replayed を写す', async () => {
  const { chatTarget } = await import('../send/fixture.ts');
  const value = (state: unknown) => ok({ ok: true, value: { itemId: 'i', revision: 2, resolution: { state } } });
  const method = 'agentSession.respondToApproval';
  const cases: [RpcOutcome, send.SendResult][] = [
    [value('resolved'), { outcome: 'submitted', detail: { code: 'resolved' } }],
    [value('cancelled'), { outcome: 'refused', detail: { code: 'cancelled' } }],
    [value('pending'), { outcome: 'unknown', detail: { code: 'prompt_pending' } }],
    [value('expired'), { outcome: 'unknown', detail: { code: 'unknown_shape' } }],
    [ok(null), { outcome: 'unknown', detail: { code: 'unknown_shape' } }],
    [
      ok({ ok: false, refusal: { code: 'agent_session_revision_mismatch', message: 'private' } }),
      { outcome: 'refused', detail: { code: 'agent_session_revision_mismatch' } },
    ],
    [
      { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' },
      { outcome: 'refused', detail: { code: 'method_not_found', method } },
    ],
    [
      { ok: false, kind: 'orca-error', code: 'invalid_argument', message: 'private' },
      { outcome: 'refused', detail: { code: 'invalid_argument', method } },
    ],
    [
      { ok: false, kind: 'unavailable', message: 'private' },
      { outcome: 'refused', detail: { code: 'not_sent' } },
    ],
    [
      { ok: false, kind: 'timeout', message: 'private' },
      { outcome: 'unknown', detail: { code: 'timeout' } },
    ],
    [
      ok({ ok: true, replayed: true, value: { resolution: { state: 'resolved' } } }),
      { outcome: 'submitted', detail: { code: 'resolved', replayed: true } },
    ],
  ];
  for (const [outcome, expected] of cases) {
    const { adapter, calls } = await answerAdapter(() => outcome);
    assert.deepEqual(
      await adapter.answerApproval(chatTarget(), { itemId: 'item-test', revision: 3 }, 'allow', opId, 2),
      expected,
      JSON.stringify(outcome),
    );
    assert.equal(calls.length, 1, '時間切れでも送り直さない');
  }
});

test('T-05 readApproval は history を1回読み、fence と承認の状態を返し、見つからない・知らない形を分ける', async () => {
  let reply: RpcOutcome = ok(historyPage([item(approvalBody(pendingResolution))]));
  const { adapter, calls } = await answerAdapter(() => reply);
  const read = await adapter.readApproval('session-chat-test', 'item-test');
  assert.ok(read.ok);
  assert.equal(read.fence, 7);
  assert.equal(read.revision, 3);
  assert.equal(read.state, 'pending');
  assert.equal(read.answerable, true);
  assert.equal(read.selectedOptionId, null);
  assert.deepEqual(
    read.options.map((o) => [o.id, o.intent]),
    [
      ['allow', 'allow_once'],
      ['allowForSession', 'allow_always'],
      ['deny', 'reject_once'],
    ],
  );
  assert.deepEqual(calls, [
    {
      method: 'agentSession.history',
      params: { sessionId: 'session-chat-test', direction: 'tail', limit: 200 },
      options: undefined,
    },
  ]);
  reply = ok(historyPage([item(approvalBody(pendingResolution), 3, 'other-item')]));
  assert.deepEqual(await adapter.readApproval('session-chat-test', 'item-test'), {
    ok: false,
    error: 'question_not_found',
  });
  for (const bad of [
    historyPage([item(approvalBody({ ...pendingResolution, state: 'expired' }))]),
    historyPage([item(questionBody(pendingResolution))]),
    historyPage([item(approvalBody(pendingResolution))], { sessionId: 'other' }),
    historyPage([item(approvalBody(pendingResolution))], { fence: 0 }),
    historyPage([item(approvalBody(pendingResolution))], { items: 'x' }),
    { ok: false, refusal: { code: 'x' } },
  ]) {
    reply = ok(bad);
    assert.deepEqual(await adapter.readApproval('session-chat-test', 'item-test'), {
      ok: false,
      error: 'unknown_shape',
    });
  }
  reply = { ok: false, kind: 'timeout', message: 'private' };
  assert.deepEqual(await adapter.readApproval('session-chat-test', 'item-test'), { ok: false, error: 'unreachable' });
  assert.ok(calls.every((c) => c.method === 'agentSession.history'));
});

test('T-05 checkApproval は今の状態を読むだけで結果を返し、送らない', async () => {
  const { chatTarget } = await import('../send/fixture.ts');
  const { digestOption } = await import('../../src/send/approval.ts');
  const prompt = { itemId: 'item-test', revision: 3 };
  let reply: RpcOutcome = ok(historyPage([]));
  const { adapter, calls } = await answerAdapter(() => reply);
  const check = () => adapter.checkApproval(chatTarget(), prompt, digestOption('allow'), opId);
  const cases: [unknown, send.SendRead<send.SendResult>][] = [
    [
      historyPage([item(approvalBody(resolvedWith({ selectedOptionId: 'allow' })), 4)]),
      { ok: true, outcome: 'submitted', detail: { code: 'resolved' } },
    ],
    [
      historyPage([item(approvalBody(resolvedWith({ selectedOptionId: 'deny' })), 4)]),
      { ok: true, outcome: 'refused', detail: { code: 'resolved_by_other' } },
    ],
    [
      historyPage([item(approvalBody(resolvedWith({ selectedOptionId: null })), 4)]),
      { ok: true, outcome: 'unknown', detail: { code: 'resolved_unverified' } },
    ],
    [
      historyPage([
        item(approvalBody({ state: 'cancelled', selectedOptionId: null, resolvedBy: null, resolvedAt: 1 }), 4),
      ]),
      { ok: true, outcome: 'refused', detail: { code: 'cancelled' } },
    ],
    [
      historyPage([item(approvalBody(pendingResolution), 3)]),
      { ok: true, outcome: 'unknown', detail: { code: 'prompt_pending' } },
    ],
    [historyPage([]), { ok: true, outcome: 'unknown', detail: { code: 'question_not_found' } }],
  ];
  for (const [page, expected] of cases) {
    reply = ok(page);
    assert.deepEqual(await check(), expected, JSON.stringify(page).slice(0, 120));
  }
  reply = { ok: false, kind: 'timeout', message: 'private' };
  assert.deepEqual(await check(), { ok: false, error: 'unreachable' });
  assert.ok(calls.every((c) => c.method === 'agentSession.history'));
});

test('D-04 answerKeys：writeSettlement のない受け取りは1組目で unconfirmed として止め、次を送らない', async () => {
  const { adapter, calls } = keyRpc([ok({ send: { accepted: true } }), settled('accepted')]);
  assert.deepEqual(await adapter.answerKeys(terminalTarget(), ['1', '\r'], KEY_QUESTIONS, sleeper([])), {
    outcome: 'unknown',
    detail: { code: 'unconfirmed', sentGroups: 0, totalGroups: 2 },
  });
  assert.equal(calls.length, 1);
});

test('FQG3 answerKeys：2組目からは待ちの後、送る直前に前面を読み直し、同じなら全部送る', async () => {
  const log: string[] = [];
  const { adapter, calls, inspects, order } = keyRpc([settled('accepted'), settled('accepted'), settled('accepted')]);
  const result = await adapter.answerKeys(terminalTarget(), ['1', '2', '\r'], KEY_QUESTIONS, async (ms) => {
    log.push(`sleep:${ms}`);
    order.push('sleep');
  });
  assert.deepEqual(result, { outcome: 'input_accepted', detail: { code: 'keys_sent', sentGroups: 3, totalGroups: 3 } });
  assert.equal(calls.length, 3);
  assert.deepEqual(inspects, [
    { terminal: 'term_test', expectedIncarnationId: 'inc-test' },
    { terminal: 'term_test', expectedIncarnationId: 'inc-test' },
  ]);
  assert.deepEqual(order, [
    'session.tabs.listAll',
    'terminal.send',
    'sleep',
    'terminal.inspectProcess',
    'session.tabs.listAll',
    'terminal.send',
    'sleep',
    'terminal.inspectProcess',
    'session.tabs.listAll',
    'terminal.send',
  ]);
});

test('FQG3 answerKeys：2組目の前に前面がシェル・別のプロセス・読めない・端末が消えたなら、その組から先を送らず partial_sent', async () => {
  for (const foreground of [
    ok({ process: { foregroundProcess: '/bin/zsh' } }),
    ok({ process: { foregroundProcess: 'python3' } }),
    ok({ process: { foregroundProcess: 'claude' } }),
    ok({ process: { foregroundProcess: null } }),
    ok({}),
    { ok: false, kind: 'orca-error', code: 'terminal_gone', message: 'private' } as RpcOutcome,
    { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' } as RpcOutcome,
    { ok: false, kind: 'timeout', message: 'private' } as RpcOutcome,
  ]) {
    const { adapter, calls } = keyRpc([settled('accepted'), settled('accepted'), settled('accepted')], [foreground]);
    assert.deepEqual(
      await adapter.answerKeys(terminalTarget(), ['1', '2', '\r'], KEY_QUESTIONS, sleeper([])),
      { outcome: 'unknown', detail: { code: 'partial_sent', sentGroups: 1, totalGroups: 3 } },
      JSON.stringify(foreground),
    );
    assert.equal(calls.length, 1, '2組目以降の terminal.send は0回');
  }
  // 3組目の前に変われば、受けた2組で止める
  const { adapter, calls } = keyRpc(
    [settled('accepted'), settled('accepted'), settled('accepted')],
    [ok({ process: { foregroundProcess: 'codex' } }), ok({ process: { foregroundProcess: 'zsh' } })],
  );
  assert.deepEqual(await adapter.answerKeys(terminalTarget(), ['1', '2', '\r'], KEY_QUESTIONS, sleeper([])), {
    outcome: 'unknown',
    detail: { code: 'partial_sent', sentGroups: 2, totalGroups: 3 },
  });
  assert.equal(calls.length, 2);
});

test('FQG3-2 answerKeys：各組の前に宛先のペインの問いを読み直し、2組目の前に外れたら、その組から先を送らず partial_sent', async () => {
  for (const changed of [
    promptTabs({ interactivePrompt: undefined }),
    promptTabs({ interactivePrompt: JSON.stringify({ questions: [{ question: '別の問い', options: ['a'] }] }) }),
    promptTabs({ state: 'working' }),
    { ok: false, kind: 'timeout', message: 'private' } as RpcOutcome,
    ok({ nope: 1 }),
  ]) {
    const { adapter, calls } = keyRpc([settled('accepted'), settled('accepted')], [], [promptTabs(), changed]);
    assert.deepEqual(
      await adapter.answerKeys(terminalTarget(), ['1', '\r'], KEY_QUESTIONS, sleeper([])),
      { outcome: 'unknown', detail: { code: 'partial_sent', sentGroups: 1, totalGroups: 2 } },
      JSON.stringify(changed).slice(0, 80),
    );
    assert.equal(calls.length, 1, '2組目以降の terminal.send は0回');
  }
});

test('FQG3-2 answerKeys：1組目の前に問いが外れたら1組も送らず refused（not_sent）', async () => {
  for (const changed of [promptTabs({ interactivePrompt: undefined }), promptTabs({ state: 'done' })]) {
    const { adapter, calls } = keyRpc([settled('accepted')], [], [changed]);
    assert.deepEqual(await adapter.answerKeys(terminalTarget(), ['1'], KEY_QUESTIONS, sleeper([])), {
      outcome: 'refused',
      detail: { code: 'not_sent', sentGroups: 0, totalGroups: 1 },
    });
    assert.equal(calls.length, 0);
  }
});
