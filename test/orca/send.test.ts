import assert from 'node:assert/strict';
import test from 'node:test';
import type { RpcOutcome } from '../../src/orca/rpc.ts';
import * as send from '../../src/orca/send.ts';
import { terminalTarget } from '../send/fixture.ts';

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
  assert.deepEqual(send.classifyTerminal(ok({ send: { accepted: false }, replayed: true }), terminalTarget()), {
    outcome: 'refused',
    detail: { replayed: true },
  });
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

test('前面のシェルを Orca と同じ規則で判定し空の観測は拒む', async () => {
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
    assert.deepEqual(await adapter.readForeground('term_test', 'inc-test'), { ok: true, isShell: true });
  }
  foreground = 'codex';
  assert.deepEqual(await adapter.readForeground('term_test', 'inc-test'), { ok: true, isShell: false });
  for (foreground of [null, '', '  ', 3])
    assert.deepEqual(await adapter.readForeground('term_test', 'inc-test'), { ok: false, error: 'foreground_unknown' });
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
