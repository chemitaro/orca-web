import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { CapabilityReport } from '../../src/orca/capabilities.ts';
import type { RpcOutcome } from '../../src/orca/rpc.ts';
import { createSendAdapter } from '../../src/orca/send.ts';
import { SendRpc } from '../../src/orca/send-gates.ts';
import { digestAnswers } from '../../src/send/answer.ts';
import { SendJournal } from '../../src/send/journal.ts';
import { type SendDeps, SendService, transcriptTail } from '../../src/send/service.ts';
import { targetFingerprint } from '../../src/send/target.ts';
import { digestText, TicketStore } from '../../src/send/ticket.ts';
import {
  normalizeJournalItems,
  normalizeNativeMessages,
  type TranscriptMessage,
} from '../../src/transcript/normalize.ts';
import { agent, fact, repo, state, worktree } from '../runs/fixture.ts';
import {
  CHAT_AGENT,
  chatTab,
  chatTarget,
  inventory,
  RUNTIME,
  TERMINAL_AGENT,
  terminalTab,
  terminalTarget,
} from './fixture.ts';

const ok = (result: unknown, runtimeId: string | null = RUNTIME): RpcOutcome => ({ ok: true, result, runtimeId });
// 質問の仮の項目。答えの中身（選択肢の id、ラベル、その他の文）が記録に入らないことを確かめるため、目立つ文字にする。
const ITEM = 'item-question-test';
const pendingResolution = { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null };
function questionRow(resolution: Record<string, unknown>, revision = 3, itemId = ITEM) {
  return {
    itemId,
    revision,
    sequence: 9,
    body: {
      kind: 'question',
      question: '外',
      options: [],
      questions: [
        {
          id: 'q-pick',
          question: '仮の問い',
          multiSelect: false,
          options: [
            { id: 'opt-secret-a', label: 'ラベル秘密A' },
            { id: 'opt-secret-b', label: 'ラベル秘密B' },
          ],
        },
        { id: 'q-free', question: '自由に', multiSelect: false, options: [], freeTextQuestionId: 'q-free' },
      ],
      resolution,
    },
  };
}
const PROMPT = { itemId: ITEM, revision: 3 };
const ANSWERS = [
  { questionId: 'q-pick', optionIds: ['opt-secret-a'] },
  { questionId: 'q-free', optionIds: [], other: '秘密の文' },
];
async function fixture(t: import('node:test').TestContext, agentType: 'claude' | 'codex' = 'codex') {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-send-service-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const feature = () => ({ available: true, missing: [], satisfied: [], deferred: [] });
  const cap: CapabilityReport = {
    checkedAt: new Date().toISOString(),
    cliVersion: null,
    appVersion: null,
    runtimeId: RUNTIME,
    runtimeIdConsistent: true,
    connection: { state: 'connected' },
    features: {
      readState: feature(),
      readTabs: feature(),
      readTranscript: feature(),
      openExistingTab: feature(),
      sendTerminal: feature(),
      sendChat: feature(),
      answerChat: feature(),
      answerKeys: feature(),
      answerApproval: feature(),
    },
  };
  const snapshot = state({
    repos: [repo('repo-test')],
    worktrees: [worktree({ id: 'wt-test', repoId: 'repo-test' })],
    agents: [
      agent(TERMINAL_AGENT, { worktreeId: 'wt-test', terminalHandle: 'term_test', agentType: fact(agentType) }),
      agent(CHAT_AGENT, { kind: 'chat-tab', worktreeId: 'wt-test', agentType: fact('claude') }),
    ],
  });
  const responses = new Map<string, RpcOutcome>([
    [
      'session.tabs.listAll',
      ok(
        inventory([
          { ...terminalTab(), agentStatus: { agentType, providerSession: { id: 'session-terminal-test' } } },
          chatTab(),
        ]),
      ),
    ],
    ['terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } })],
    ['terminal.inspectProcess', ok({ process: { foregroundProcess: agentType } })],
    [
      'agentSession.history',
      ok({ ok: true, page: { sessionId: 'session-chat-test', fence: 4, items: [questionRow(pendingResolution)] } }),
    ],
    [
      'agentSession.respondToQuestion',
      ok({ ok: true, value: { itemId: ITEM, revision: 4, resolution: { state: 'resolved' } } }),
    ],
    [
      'terminal.send',
      ok({ send: { accepted: true, prompt: { provider: agentType, stages: ['input_accepted', 'turn_started'] } } }),
    ],
    ['agentSession.send', ok({ ok: true, value: { submission: { dispatchState: 'accepted' } } })],
    [
      'orchestration.requestShow',
      ok({
        state: 'completed',
        receipt: { send: { accepted: true, prompt: { provider: agentType, stages: ['turn_started'] } } },
      }),
    ],
  ]);
  const calls: { method: string; params: unknown }[] = [];
  const rpc = new SendRpc({
    async call<T>(method: string, params: unknown) {
      calls.push({ method, params });
      const result = responses.get(method);
      assert.ok(result, method);
      return result as RpcOutcome<T>;
    },
  });
  let enabled = true;
  let now = 1234567890123;
  let count = 0;
  const journal = new SendJournal(path.join(dir, 'sends'));
  const tickets = new TicketStore({ now: () => now });
  const deps = {
    snapshotSync: () => snapshot,
    capabilities: async () => cap,
    rpc,
    adapter: createSendAdapter({ rpc }),
    journal,
    tickets,
    readSendEnabled: async () => enabled,
    now: () => now,
    operationId: () => `${now}-${(++count).toString(16).padStart(32, '0')}`,
  };
  const service = new SendService(deps);
  return {
    service,
    deps,
    cap,
    snapshot,
    responses,
    calls,
    journal,
    tickets,
    sendsDir: path.join(dir, 'sends'),
    setEnabled: (value: boolean) => {
      enabled = value;
    },
    advance: () => {
      now += 60000;
    },
    sends: () =>
      calls.filter((c) => ['terminal.send', 'agentSession.send', 'agentSession.respondToQuestion'].includes(c.method)),
    setHistory: (items: unknown[], extra: Record<string, unknown> = {}) =>
      responses.set(
        'agentSession.history',
        ok({ ok: true, page: { sessionId: 'session-chat-test', fence: 4, items, ...extra } }),
      ),
  };
}

test('意図と確定は稼働中の状態が残っても宛先と違う前面には送らない', async (t) => {
  for (const agentType of ['claude', 'codex'] as const) {
    for (const foreground of [
      'python3',
      'node',
      '2.1.0',
      'claude.2.1.0',
      agentType === 'claude' ? 'codex' : 'claude',
      '/bin/zsh',
    ]) {
      await t.test(`${agentType}: ${foreground}`, async (t) => {
        const f = await fixture(t, agentType);
        const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
        assert.ok(intent.ok);
        f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: foreground } }));
        const reason = foreground === '/bin/zsh' ? 'shell_foreground' : 'foreground_mismatch';
        const expected = { ok: false, error: 'not_sendable', reason };
        assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), expected);
        assert.deepEqual(await f.service.confirm({ ticket: intent.ticket, text: 'hello' }), expected);
        assert.equal((await f.journal.read(intent.operationId))?.refused?.notSendableReason, reason);
        assert.equal((await f.service.status(TERMINAL_AGENT)).available, false);
        assert.equal(f.sends().length, 0);
      });
    }
  }
});

test('拒否の保存に失敗しても照会は refused を返し Orca に送信も照会もしない', async (t) => {
  const f = await fixture(t);
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-refused-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const journal = new SendJournal(dir, {
    open: async () => {
      throw new Error('disk failed');
    },
  });
  const service = new SendService({ ...f.deps, journal });
  const intent = await service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: 'python3' } }));
  assert.deepEqual(await service.confirm({ ticket: intent.ticket, text: 'hello' }), {
    ok: false,
    error: 'not_sendable',
    reason: 'foreground_mismatch',
  });
  const callsBeforeCheck = f.calls.length;
  const checked = await service.check(intent.operationId, { query: true });
  assert.ok(checked.ok && checked.state === 'recorded');
  assert.equal(checked.record.outcome, 'refused');
  assert.equal(checked.record.refused?.notSendableReason, 'foreground_mismatch');
  assert.equal(f.calls.length, callsBeforeCheck);
  assert.equal(f.sends().length, 0);
});

test('意図と確定は宛先そのものの前面を正規化して通し一度だけ送る', async (t) => {
  for (const [agentType, foreground] of [
    ['claude', 'claude'],
    ['codex', 'codex'],
    ['codex', 'codex-aarch64-apple-darwin'],
    ['claude', '  "/usr/local/bin/CLAUDE"  '],
    ['codex', "'C:\\Tools\\Codex.EXE'"],
    ['claude', '/bin/claude.cmd'],
    ['codex', 'codex.bat'],
    ['claude', 'CLAUDE.ps1'],
  ] as const) {
    await t.test(`${agentType}: ${foreground}`, async (t) => {
      const f = await fixture(t, agentType);
      f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: foreground } }));
      const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
      assert.ok(intent.ok);
      assert.equal(f.sends().length, 0);
      const confirmed = await f.service.confirm({ ticket: intent.ticket, text: 'hello' });
      assert.ok(confirmed.ok);
      assert.equal(confirmed.outcome, 'submitted');
      assert.equal(f.sends().length, 1);
    });
  }
});

test('intent は新しい宛先と本文を確認し操作の ID を票に結ぶ', async (t) => {
  const f = await fixture(t);
  const result = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.text, 'hello');
  assert.equal(result.digest, digestText('hello'));
  assert.equal(result.preview.route, 'terminal');
  assert.equal(result.expiresAt, 1234567950123);
  assert.match(result.operationId, /^\d{13}-[a-f0-9]{32}$/);
  const ticket = f.tickets.take(result.ticket);
  assert.equal(ticket.ok, true);
  if (ticket.ok) assert.equal(ticket.value.operationId, result.operationId);
  assert.equal(f.sends().length, 0);
});

test('intent は無効な設定と本文で票を出さず Orca を読まない', async (t) => {
  const f = await fixture(t);
  f.setEnabled(false);
  assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), {
    ok: false,
    error: 'send_disabled',
  });
  f.setEnabled(true);
  assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: '\r' }), {
    ok: false,
    error: 'invalid_text',
    reason: 'empty',
  });
  assert.equal(f.calls.length, 0);
});

test('preflight は能力と runtime の一致を必須にする', async (t) => {
  const f = await fixture(t);
  f.cap.connection = { state: 'unreachable', reason: 'offline' };
  assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), {
    ok: false,
    error: 'unreachable',
  });
  assert.equal(f.calls.length, 0);
  f.cap.connection = { state: 'connected' };
  f.responses.set('session.tabs.listAll', ok(inventory(), null));
  assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), {
    ok: false,
    error: 'unreachable',
  });
  f.responses.set('session.tabs.listAll', ok(inventory(), 'other'));
  assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), {
    ok: false,
    error: 'unreachable',
    reason: 'runtime_changed',
  });
  f.responses.set('session.tabs.listAll', ok(inventory()));
  f.cap.features.sendTerminal = {
    available: false,
    missing: ['capability:terminal.prompt-delivery.v1'],
    satisfied: [],
    deferred: [],
  };
  assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), {
    ok: false,
    error: 'unsupported',
    missing: ['capability:terminal.prompt-delivery.v1'],
  });
  assert.equal(f.sends().length, 0);
});

test('preflight は untabbed と前面のシェルと読めない状態を送らない', async (t) => {
  const f = await fixture(t);
  for (const [method, response, expected] of [
    ['terminal.agentStatus', ok({ agentStatus: { isRunningAgent: false, status: null } }), 'no_agent'],
    ['terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'permission' } }), 'permission'],
    ['terminal.inspectProcess', ok({ process: { foregroundProcess: '/bin/zsh' } }), 'shell_foreground'],
    ['terminal.inspectProcess', ok({ process: { foregroundProcess: null } }), 'foreground_unknown'],
  ] as const) {
    const previous = f.responses.get(method);
    assert.ok(previous);
    f.responses.set(method, response);
    assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), {
      ok: false,
      error: 'not_sendable',
      reason: expected,
    });
    f.responses.set(method, previous);
  }
  const a = f.snapshot.agents[0];
  assert.ok(a);
  a.kind = 'untabbed';
  f.responses.set('session.tabs.listAll', ok(inventory([])));
  assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), {
    ok: false,
    error: 'not_sendable',
    reason: 'untabbed',
  });
  a.kind = 'terminal-tab';
  f.responses.set('session.tabs.listAll', ok(inventory()));
  a.worktreeId = 'other';
  assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), {
    ok: false,
    error: 'not_sendable',
    reason: 'state_out_of_date',
  });
  assert.equal(f.sends().length, 0);
});

test('status は送信せず Chat の fence と利用可能性を確かめる', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.service.status(CHAT_AGENT), {
    enabled: true,
    available: true,
    route: 'chat',
    reason: null,
    target: targetFingerprint(chatTarget()),
    agentType: 'claude',
    answer: { available: true, reason: null },
    answerKeys: { available: false, reason: 'chat_route' },
    answerMessage: { available: true, reason: null },
    approval: { available: true, reason: null },
  });
  assert.ok(f.calls.some((c) => c.method === 'agentSession.history'));
  f.responses.set('agentSession.history', ok({ ok: true, page: { sessionId: 'other', fence: 4 } }));
  assert.deepEqual(await f.service.intent({ agent: CHAT_AGENT, text: 'hello' }), { ok: false, error: 'unknown_shape' });
  f.setEnabled(false);
  assert.deepEqual(await f.service.status(CHAT_AGENT), {
    enabled: false,
    available: false,
    route: null,
    reason: 'unknown_shape',
    target: null,
    agentType: null,
    answer: { available: false, reason: 'unknown_shape' },
    answerKeys: { available: false, reason: 'chat_route' },
    answerMessage: { available: false, reason: 'unknown_shape' },
    approval: { available: false, reason: 'unknown_shape' },
  });
  assert.equal(f.sends().length, 0);
});

test('confirm は票の操作 ID で before と after を残し一度だけ送る', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  const result = await f.service.confirm({ ticket: intent.ticket, text: 'hello' });
  assert.ok(result.ok);
  assert.equal(result.operationId, intent.operationId);
  assert.equal(result.outcome, 'submitted');
  const record = await f.journal.read(intent.operationId);
  assert.ok(record?.before);
  assert.ok(record.after);
  assert.equal(record.before.digest, intent.digest);
  assert.equal(record.before.target.agentId, TERMINAL_AGENT);
  assert.equal(record.outcome, result.outcome);
  assert.equal(f.sends().length, 1);
  assert.deepEqual(await f.service.confirm({ ticket: intent.ticket, text: 'hello' }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'unknown',
  });
  assert.equal(f.sends().length, 1);
});

test('同時の確定は busy で票を残し設定の読み待ち中でも二重送信しない', async (t) => {
  const f = await fixture(t);
  const a = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(a.ok);
  const b = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(b.ok);
  const read = Promise.withResolvers<boolean>();
  f.deps.readSendEnabled = () => read.promise;
  const first = f.service.confirm({ ticket: a.ticket, text: 'hello' });
  assert.deepEqual(await f.service.confirm({ ticket: b.ticket, text: 'hello' }), { ok: false, error: 'busy' });
  assert.equal(f.sends().length, 0);
  read.resolve(true);
  assert.equal((await first).ok, true);
  assert.equal(f.sends().length, 1);
  assert.equal((await f.service.confirm({ ticket: b.ticket, text: 'hello' })).ok, true);
  assert.equal(f.sends().length, 2);
});

test('confirm は本文の差と期限切れを拒否し本文なしの記録を残す', async (t) => {
  const f = await fixture(t);
  const a = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(a.ok);
  assert.deepEqual(await f.service.confirm({ ticket: a.ticket, text: 'changed' }), {
    ok: false,
    error: 'target_changed',
    reason: 'text_changed',
  });
  const record = await f.journal.read(a.operationId);
  assert.ok(record?.refused);
  assert.equal(record.before, null);
  assert.equal(record.refused.change, 'text_changed');
  assert.equal(Object.hasOwn(record.refused, 'text'), false);
  const b = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(b.ok);
  f.advance();
  assert.deepEqual(await f.service.confirm({ ticket: b.ticket, text: 'hello' }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'expired',
  });
  assert.equal(f.sends().length, 0);
});

test('confirm は再検査で宛先の消失と各識別子の変化を target_changed にする', async (t) => {
  const cases: [string, (f: Awaited<ReturnType<typeof fixture>>) => void][] = [
    ['tab_gone', (f) => f.responses.set('session.tabs.listAll', ok(inventory([])))],
    ['runtime_changed', (f) => f.responses.set('session.tabs.listAll', ok(inventory(), 'other'))],
    [
      'runtime_changed',
      (f) => {
        f.cap.runtimeId = 'other';
        f.responses.set('session.tabs.listAll', ok(inventory(), 'other'));
      },
    ],
    [
      'asleep',
      (f) => f.responses.set('session.tabs.listAll', ok(inventory([{ ...terminalTab(), status: 'pending' }]))),
    ],
    [
      'untabbed',
      (f) => {
        const a = f.snapshot.agents[0];
        assert.ok(a);
        a.kind = 'untabbed';
        f.responses.set('session.tabs.listAll', ok(inventory([])));
      },
    ],
    [
      'no_session',
      (f) => f.responses.set('session.tabs.listAll', ok(inventory([{ ...terminalTab(), agentStatus: {} }]))),
    ],
    [
      'identity_unavailable',
      (f) => f.responses.set('session.tabs.listAll', ok(inventory([{ ...terminalTab(), incarnationId: null }]))),
    ],
    [
      'state_out_of_date',
      (f) => {
        const a = f.snapshot.agents[0];
        assert.ok(a);
        a.worktreeId = 'other';
      },
    ],
    ['tab_changed', (f) => f.responses.set('session.tabs.listAll', ok(inventory([{ ...terminalTab(), id: 'other' }])))],
    [
      'terminal_changed',
      (f) => f.responses.set('session.tabs.listAll', ok(inventory([{ ...terminalTab(), ptyId: 'other' }]))),
    ],
    [
      'terminal_changed',
      (f) => f.responses.set('session.tabs.listAll', ok(inventory([{ ...terminalTab(), incarnationId: 'other' }]))),
    ],
    [
      'terminal_changed',
      (f) => {
        const a = f.snapshot.agents[0];
        assert.ok(a);
        a.terminalHandle = 'term_other';
        f.responses.set('session.tabs.listAll', ok(inventory([{ ...terminalTab(), terminal: 'term_other' }])));
      },
    ],
    [
      'agent_changed',
      (f) => {
        const a = f.snapshot.agents[0];
        assert.ok(a);
        a.agentType = fact('claude');
        f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: 'claude' } }));
        f.responses.set(
          'session.tabs.listAll',
          ok(
            inventory([
              {
                ...terminalTab(),
                agentStatus: { agentType: 'claude', providerSession: { id: 'session-terminal-test' } },
              },
            ]),
          ),
        );
      },
    ],
    [
      'session_changed',
      (f) =>
        f.responses.set(
          'session.tabs.listAll',
          ok(inventory([{ ...terminalTab(), agentStatus: { agentType: 'codex', providerSession: { id: 'other' } } }])),
        ),
    ],
    [
      'worktree_changed',
      (f) => {
        const a = f.snapshot.agents[0];
        const w = f.snapshot.worktrees[0];
        assert.ok(a && w);
        a.worktreeId = 'other';
        w.id = 'other';
        f.responses.set('session.tabs.listAll', ok({ snapshots: [{ worktree: 'other', tabs: [terminalTab()] }] }));
      },
    ],
  ];
  for (const [reason, change] of cases) {
    const f = await fixture(t);
    const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
    assert.ok(intent.ok);
    change(f);
    assert.deepEqual(
      await f.service.confirm({ ticket: intent.ticket, text: 'hello' }),
      { ok: false, error: 'target_changed', reason },
      reason,
    );
    const record = await f.journal.read(intent.operationId);
    assert.equal(record?.refused?.change, reason);
    assert.equal(record?.before, null);
    assert.equal(f.sends().length, 0);
  }
});

test('confirm は設定停止で票を残し送れない状態では記録して拒む', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  f.setEnabled(false);
  assert.deepEqual(await f.service.confirm({ ticket: intent.ticket, text: 'hello' }), {
    ok: false,
    error: 'send_disabled',
  });
  f.setEnabled(true);
  f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: 'zsh' } }));
  assert.deepEqual(await f.service.confirm({ ticket: intent.ticket, text: 'hello' }), {
    ok: false,
    error: 'not_sendable',
    reason: 'shell_foreground',
  });
  assert.equal((await f.journal.read(intent.operationId))?.refused?.notSendableReason, 'shell_foreground');
  assert.equal(f.sends().length, 0);
});

test('記録の before の失敗では送らず after の失敗では送信結果と警告を返す', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  const original = f.deps.journal.appendBefore.bind(f.deps.journal);
  f.deps.journal.appendBefore = async () => {
    throw new Error('disk failed');
  };
  assert.deepEqual(await f.service.confirm({ ticket: intent.ticket, text: 'hello' }), {
    ok: false,
    error: 'record_failed',
  });
  assert.equal(f.sends().length, 0);
  f.deps.journal.appendBefore = original;
  f.deps.journal.appendAfter = async () => false;
  const second = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(second.ok);
  const result = await f.service.confirm({ ticket: second.ticket, text: 'hello' });
  assert.ok(result.ok);
  assert.equal(result.outcome, 'submitted');
  assert.equal(result.recordWarning, 'after_record_failed');
  assert.equal(f.sends().length, 1);
});

test('照会は未確定の票を await 前に取り消し後着の確定を送らない', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  const read = Promise.withResolvers<null>();
  f.deps.journal.read = () => read.promise;
  const checking = f.service.check(intent.operationId, { query: true });
  assert.deepEqual(await f.service.confirm({ ticket: intent.ticket, text: 'hello' }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'unknown',
  });
  read.resolve(null);
  assert.deepEqual(await checking, { ok: true, operationId: intent.operationId, state: 'not_sent' });
  assert.equal(f.sends().length, 0);
});

test('take 後で before 前の照会は in_progress と決め遅い記録読みによる not_sent を防ぐ', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const originalBefore = f.deps.journal.appendBefore.bind(f.deps.journal);
  f.deps.journal.appendBefore = async (input) => {
    entered.resolve();
    await release.promise;
    await originalBefore(input);
  };
  const delayedRead = Promise.withResolvers<null>();
  let reads = 0;
  f.deps.journal.read = () => {
    reads++;
    return delayedRead.promise;
  };
  const confirming = f.service.confirm({ ticket: intent.ticket, text: 'hello' });
  await entered.promise;
  assert.equal(f.sends().length, 0);
  const checking = f.service.check(intent.operationId, { query: true });
  release.resolve();
  assert.equal((await confirming).ok, true);
  delayedRead.resolve(null);
  assert.deepEqual(await checking, { ok: true, operationId: intent.operationId, state: 'in_progress' });
  assert.equal(reads, 0);
  assert.equal(f.sends().length, 1);
});

test('check は unknown のときだけ照会して記録し到達不能なら記録を足さない', async (t) => {
  const f = await fixture(t);
  f.responses.set('terminal.send', { ok: false, kind: 'timeout', message: 'private' });
  const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  await f.service.confirm({ ticket: intent.ticket, text: 'hello' });
  const noQuery = await f.service.check(intent.operationId, { query: false });
  assert.ok(noQuery.ok && noQuery.state === 'recorded');
  assert.equal(noQuery.record.outcome, 'unknown');
  assert.equal(f.calls.filter((c) => c.method === 'orchestration.requestShow').length, 0);
  f.setEnabled(false);
  const queried = await f.service.check(intent.operationId, { query: true });
  assert.ok(queried.ok && queried.state === 'recorded');
  assert.equal(queried.record.outcome, 'submitted');
  assert.equal(queried.record.checks.length, 1);
  await f.service.check(intent.operationId, { query: true });
  assert.equal(f.calls.filter((c) => c.method === 'orchestration.requestShow').length, 1);
  assert.equal(f.sends().length, 1);
  f.setEnabled(true);
  const second = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(second.ok);
  await f.service.confirm({ ticket: second.ticket, text: 'hello' });
  f.responses.set('orchestration.requestShow', { ok: false, kind: 'unavailable', message: 'private' });
  const unreachable = await f.service.check(second.operationId, { query: true });
  assert.ok(unreachable.ok && unreachable.state === 'recorded');
  assert.equal(unreachable.checkError, 'unreachable');
  assert.equal(unreachable.record.checks.length, 0);
  assert.equal(f.sends().length, 2);
});

test('method_not_found は同じ runtime の経路を止め runtime 変更で戻す', async (t) => {
  const f = await fixture(t);
  const a = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(a.ok);
  const b = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(b.ok);
  f.responses.set('terminal.send', { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' });
  const result = await f.service.confirm({ ticket: a.ticket, text: 'hello' });
  assert.ok(result.ok);
  assert.equal(result.outcome, 'refused');
  const error = { ok: false, error: 'unsupported', missing: ['rpc:terminal.send'] };
  assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), error);
  assert.deepEqual(await f.service.confirm({ ticket: b.ticket, text: 'hello' }), error);
  const status = await f.service.status(TERMINAL_AGENT);
  assert.equal(status.available, false);
  assert.equal(status.reason, 'unsupported');
  assert.equal(f.sends().length, 1);
  assert.equal((await f.service.status(CHAT_AGENT)).available, true);
  f.cap.runtimeId = 'new-runtime';
  f.responses.set('session.tabs.listAll', ok(inventory(), 'new-runtime'));
  assert.equal((await f.service.status(TERMINAL_AGENT)).available, true);
});

test('after と refused の書き込みが終わるまで処理中の印を外さない', async (t) => {
  for (const kind of ['after', 'refused'] as const) {
    for (const saved of [true, false]) {
      const f = await fixture(t);
      const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
      assert.ok(intent.ok);
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      if (kind === 'after') {
        const original = f.deps.journal.appendAfter.bind(f.deps.journal);
        f.deps.journal.appendAfter = async (input) => {
          entered.resolve();
          await release.promise;
          if (saved) await original(input);
          return saved;
        };
      } else {
        const original = f.deps.journal.appendRefused.bind(f.deps.journal);
        f.deps.journal.appendRefused = async (input) => {
          entered.resolve();
          await release.promise;
          if (saved) await original(input);
          return saved;
        };
      }
      const confirming = f.service.confirm({ ticket: intent.ticket, text: kind === 'refused' ? 'changed' : 'hello' });
      await entered.promise;
      assert.deepEqual(await f.service.check(intent.operationId, { query: true }), {
        ok: true,
        operationId: intent.operationId,
        state: 'in_progress',
      });
      release.resolve();
      await confirming;
      const checked = await f.service.check(intent.operationId, { query: false });
      assert.ok(checked.ok);
      assert.notEqual(checked.state, 'in_progress');
      assert.equal(f.sends().length, kind === 'after' ? 1 : 0);
    }
  }
});

test('同じ票の同時確定も一度だけ送る', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  const results = await Promise.all([
    f.service.confirm({ ticket: intent.ticket, text: 'hello' }),
    f.service.confirm({ ticket: intent.ticket, text: 'hello' }),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(f.sends().length, 1);
});

test('Chat は確定で読み直した fence で送り同じ操作 ID を読むだけで照会する', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.intent({ agent: CHAT_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  f.responses.set('agentSession.history', ok({ ok: true, page: { sessionId: 'session-chat-test', fence: 9 } }));
  f.responses.set('agentSession.send', { ok: false, kind: 'timeout', message: 'private' });
  const result = await f.service.confirm({ ticket: intent.ticket, text: 'hello' });
  assert.ok(result.ok);
  assert.equal(result.outcome, 'unknown');
  const payload = f.sends()[0]?.params as { envelope: { expectedRuntimeFence: number; clientOperationId: string } };
  assert.equal(payload.envelope.expectedRuntimeFence, 9);
  assert.equal(payload.envelope.clientOperationId, intent.operationId);
  f.responses.set('agentSession.sendRecorded', ok({ recorded: true }));
  f.responses.set(
    'agentSession.history',
    ok({
      ok: true,
      page: {
        sessionId: 'session-chat-test',
        submissions: [{ clientMessageId: intent.operationId, dispatchState: 'accepted' }],
      },
    }),
  );
  const checked = await f.service.check(intent.operationId, { query: true });
  assert.ok(checked.ok && checked.state === 'recorded');
  assert.equal(checked.record.outcome, 'submitted');
  assert.equal(f.sends().length, 1);
});

test('Chat のセッション変更は確認済みの宛先へ送らず拒む', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.intent({ agent: CHAT_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  f.responses.set('session.tabs.listAll', ok(inventory([{ ...chatTab(), sessionId: 'new-session' }])));
  f.responses.set('agentSession.history', ok({ ok: true, page: { sessionId: 'new-session', fence: 2 } }));
  assert.deepEqual(await f.service.confirm({ ticket: intent.ticket, text: 'hello' }), {
    ok: false,
    error: 'target_changed',
    reason: 'session_changed',
  });
  assert.equal(f.sends().length, 0);
});

test('意図と確定は各読み取りの失敗を送り直さず正しい理由で止める', async (t) => {
  const cases: [string, RpcOutcome, { error: string; reason?: string; missing?: string[] }][] = [
    ['session.tabs.listAll', { ok: false, kind: 'unavailable', message: 'private' }, { error: 'unreachable' }],
    ['session.tabs.listAll', ok({}), { error: 'unknown_shape' }],
    ['terminal.agentStatus', { ok: false, kind: 'timeout', message: 'private' }, { error: 'unreachable' }],
    ['terminal.agentStatus', ok({}), { error: 'unknown_shape' }],
    [
      'terminal.agentStatus',
      ok({ agentStatus: { isRunningAgent: false, status: null } }),
      { error: 'not_sendable', reason: 'no_agent' },
    ],
    [
      'terminal.agentStatus',
      ok({ agentStatus: { isRunningAgent: true, status: 'permission' } }),
      { error: 'not_sendable', reason: 'permission' },
    ],
    [
      'terminal.inspectProcess',
      ok({ process: { foregroundProcess: null } }),
      { error: 'not_sendable', reason: 'foreground_unknown' },
    ],
    ['terminal.inspectProcess', { ok: false, kind: 'timeout', message: 'private' }, { error: 'unreachable' }],
    [
      'terminal.agentStatus',
      { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' },
      { error: 'unsupported', missing: ['rpc:terminal.agentStatus'] },
    ],
  ];
  for (const [method, response, expected] of cases) {
    const f = await fixture(t);
    const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
    assert.ok(intent.ok);
    f.responses.set(method, response);
    assert.deepEqual(await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' }), { ok: false, ...expected });
    assert.deepEqual(await f.service.confirm({ ticket: intent.ticket, text: 'hello' }), { ok: false, ...expected });
    assert.ok((await f.journal.read(intent.operationId))?.refused);
    assert.equal(f.sends().length, 0);
  }
});

test('読み取りと照会の method_not_found も経路を止める', async (t) => {
  for (const method of [
    'terminal.agentStatus',
    'terminal.inspectProcess',
    'orchestration.requestShow',
    'agentSession.history',
    'agentSession.sendRecorded',
  ]) {
    const f = await fixture(t);
    const chat = method.startsWith('agentSession');
    const id = chat ? CHAT_AGENT : TERMINAL_AGENT;
    if (method === 'orchestration.requestShow' || method === 'agentSession.sendRecorded') {
      f.responses.set(chat ? 'agentSession.send' : 'terminal.send', { ok: false, kind: 'timeout', message: 'private' });
      const intent = await f.service.intent({ agent: id, text: 'hello' });
      assert.ok(intent.ok);
      await f.service.confirm({ ticket: intent.ticket, text: 'hello' });
      f.responses.set(method, { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' });
      await f.service.check(intent.operationId, { query: true });
    } else {
      f.responses.set(method, { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' });
      await f.service.intent({ agent: id, text: 'hello' });
    }
    const before = f.calls.filter((c) => c.method === method).length;
    assert.deepEqual(await f.service.intent({ agent: id, text: 'hello' }), {
      ok: false,
      error: 'unsupported',
      missing: [`rpc:${method}`],
    });
    assert.equal((await f.service.status(id)).available, false);
    assert.equal(f.calls.filter((c) => c.method === method).length, before);
  }
});

test('無効な票の拒否を記録している間も次の確定を busy にする', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const original = f.deps.journal.appendRefused.bind(f.deps.journal);
  f.deps.journal.appendRefused = async (input) => {
    if (input.reason === 'ticket_invalid') {
      entered.resolve();
      await release.promise;
    }
    return original(input);
  };
  const invalid = f.service.confirm({ ticket: 'invalid', text: 'hello' });
  await entered.promise;
  const second = await f.service.confirm({ ticket: intent.ticket, text: 'hello' });
  release.resolve();
  await invalid;
  assert.deepEqual(second, { ok: false, error: 'busy' });
  assert.equal(f.sends().length, 0);
});

test('status は端末の指紋と種類を返し、preflight が通らなければ null にする', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.service.status(TERMINAL_AGENT), {
    enabled: true,
    available: true,
    route: 'terminal',
    reason: null,
    target: targetFingerprint(terminalTarget()),
    agentType: 'codex',
    answer: { available: false, reason: 'terminal_route' },
    answerKeys: { available: true, reason: null },
    answerMessage: { available: true, reason: null },
    approval: { available: false, reason: 'terminal_route' },
  });
  f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: '/bin/zsh' } }));
  assert.deepEqual(await f.service.status(TERMINAL_AGENT), {
    enabled: true,
    available: false,
    route: null,
    reason: 'shell_foreground',
    target: null,
    agentType: null,
    answer: { available: false, reason: 'terminal_route' },
    answerKeys: { available: false, reason: 'shell_foreground' },
    answerMessage: { available: false, reason: 'shell_foreground' },
    approval: { available: false, reason: 'terminal_route' },
  });
  assert.equal(f.sends().length, 0);
});

test('意図の違う指紋では票も送信も記録も作らず、同じ指紋と省略は票を返す', async (t) => {
  const f = await fixture(t);
  for (const agent of [TERMINAL_AGENT, CHAT_AGENT]) {
    const status = await f.service.status(agent);
    assert.ok(status.target);
    assert.deepEqual(await f.service.intent({ agent, text: 'hello', target: '0'.repeat(32) }), {
      ok: false,
      error: 'target_changed',
      reason: 'changed_since_shown',
    });
    const matched = await f.service.intent({ agent, text: 'hello', target: status.target });
    const legacy = await f.service.intent({ agent, text: 'hello' });
    assert.ok(matched.ok && matched.ticket);
    assert.ok(legacy.ok && legacy.ticket);
  }
  assert.equal(f.sends().length, 0);
  assert.equal(await f.journal.read('1234567890123-00000000000000000000000000000005'), null);
});

test('照会の結果が保存できなくても結果を返し checkWarning を添える', async (t) => {
  const f = await fixture(t);
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-check-record-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let broken = false;
  const journal = new SendJournal(dir, {
    open: async (...args) => {
      if (broken) throw new Error('disk failed');
      return open(...args);
    },
  });
  const service = new SendService({ ...f.deps, journal });
  f.responses.set('terminal.send', { ok: false, kind: 'timeout', message: 'private' });
  const intent = await service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  await service.confirm({ ticket: intent.ticket, text: 'hello' });
  broken = true;
  const result = await service.check(intent.operationId, { query: true });
  assert.ok(result.ok && result.state === 'recorded');
  assert.equal(result.record.outcome, 'submitted');
  assert.equal(result.checkWarning, 'check_record_failed');
  assert.equal((await new SendJournal(dir).read(intent.operationId))?.outcome, 'unknown');
  assert.equal(f.sends().length, 1);
});

test('記録を読めない照会は not_sent ではなく record_unreadable で送り直さない', async (t) => {
  const f = await fixture(t);
  f.journal.read = async () => {
    throw new Error('read failed');
  };
  for (const query of [false, true]) {
    assert.deepEqual(await f.service.check('1234567890123-00000000000000000000000000000001', { query }), {
      ok: false,
      error: 'record_unreadable',
    });
  }
  assert.equal(f.calls.length, 0);
});

test('再起動後 preflight 前の method_not_found は現在の runtime の経路だけを止める', async (t) => {
  for (const route of ['terminal', 'chat'] as const) {
    for (const runtime of ['same', 'different', 'unreachable'] as const) {
      await t.test(`${route}: ${runtime}`, async (t) => {
        const f = await fixture(t);
        const agent = route === 'terminal' ? TERMINAL_AGENT : CHAT_AGENT;
        f.responses.set(route === 'terminal' ? 'terminal.send' : 'agentSession.send', {
          ok: false,
          kind: 'timeout',
          message: 'private',
        });
        const intent = await f.service.intent({ agent, text: 'hello' });
        assert.ok(intent.ok);
        await f.service.confirm({ ticket: intent.ticket, text: 'hello' });
        if (runtime === 'different') {
          f.cap.runtimeId = 'new-runtime';
          f.responses.set('session.tabs.listAll', ok(inventory(), 'new-runtime'));
        } else if (runtime === 'unreachable') {
          f.cap.connection = { state: 'unreachable', reason: 'test' };
        }
        const method = route === 'terminal' ? 'orchestration.requestShow' : 'agentSession.sendRecorded';
        f.responses.set(method, { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' });
        // 新しいサービスで最初に読むのは、永続化した記録と照会だけ。
        const restarted = new SendService(f.deps);
        const result = await restarted.check(intent.operationId, { query: true });
        assert.ok(result.ok && result.state === 'recorded');
        assert.equal(result.record.outcome, 'unknown');
        if (runtime === 'unreachable') f.cap.connection = { state: 'connected' };
        const status = await restarted.status(agent);
        assert.equal(status.available, runtime !== 'same');
        const next = await restarted.intent({ agent, text: 'hello' });
        if (runtime === 'same') {
          assert.deepEqual(next, { ok: false, error: 'unsupported', missing: [`rpc:${method}`] });
          assert.equal((await restarted.status(route === 'terminal' ? CHAT_AGENT : TERMINAL_AGENT)).available, true);
          f.cap.runtimeId = 'next-runtime';
          f.responses.set('session.tabs.listAll', ok(inventory(), 'next-runtime'));
          assert.equal((await restarted.status(agent)).available, true);
        } else assert.ok(next.ok);
        assert.equal(f.sends().length, 1);
      });
    }
  }
});

test('再起動後 unknown の照会だけがメモリーにある読み取り失敗は record_unreadable にする', async (t) => {
  const f = await fixture(t);
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-unknown-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const service = new SendService({ ...f.deps, journal: new SendJournal(dir) });
  f.responses.set('terminal.send', { ok: false, kind: 'timeout', message: 'private' });
  const intent = await service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(intent.ok);
  await service.confirm({ ticket: intent.ticket, text: 'hello' });
  const journal = new SendJournal(dir);
  const restarted = new SendService({ ...f.deps, journal });
  f.responses.set('orchestration.requestShow', ok({ state: 'pending' }));
  const pending = await restarted.check(intent.operationId, { query: true });
  assert.ok(pending.ok && pending.state === 'recorded');
  assert.equal(pending.record.outcome, 'unknown');
  assert.equal(pending.record.checks.length, 1);
  await rm(path.join(dir, 'sends.jsonl'));
  await mkdir(path.join(dir, 'sends.jsonl'));
  for (const query of [false, true]) {
    assert.deepEqual(await restarted.check(intent.operationId, { query }), {
      ok: false,
      error: 'record_unreadable',
    });
  }
  await assert.rejects(journal.read(intent.operationId), { code: 'EISDIR' });
  assert.equal(f.calls.filter((call) => call.method === 'orchestration.requestShow').length, 1);
  assert.equal(f.sends().length, 1);
});

test('まとめた構造化 Chat の古い id（ps の paneKey）の意図は送らず agent_not_found を返す', async (t) => {
  const f = await fixture(t);
  const legacy = 'structured-agent-session-session-chat-test:00000000-0000-4000-a000-000000000000';
  const chat = f.snapshot.agents.find((a) => a.id === CHAT_AGENT);
  assert.ok(chat);
  chat.paneKey = legacy;
  assert.deepEqual(await f.service.intent({ agent: legacy, text: 'hello' }), {
    ok: false,
    error: 'agent_not_found',
  });
  assert.equal(f.sends().length, 0);
});

// ---- 質問への答え（D-03、T-07〜T-09） ----

const answers = () => structuredClone(ANSWERS);
const answerCalls = (f: { calls: { method: string }[] }) =>
  f.calls.filter((c) => c.method === 'agentSession.respondToQuestion');
const writes = (f: { calls: { method: string }[] }) =>
  f.calls.filter((c) => ['terminal.send', 'agentSession.send', 'agentSession.respondToQuestion'].includes(c.method));

test('T-07 answerIntent は送れないときの理由を返し、どれも書き込みの RPC を送らない', async (t) => {
  const f = await fixture(t);
  const intent = (extra: Record<string, unknown> = {}) =>
    f.service.answerIntent({ agent: CHAT_AGENT, prompt: PROMPT, answers: answers(), ...extra });
  f.setEnabled(false);
  assert.deepEqual(await intent(), { ok: false, error: 'send_disabled' });
  f.setEnabled(true);
  assert.deepEqual(await intent({ agent: TERMINAL_AGENT }), {
    ok: false,
    error: 'not_sendable',
    reason: 'terminal_route',
  });
  assert.deepEqual(await intent({ target: '0'.repeat(32) }), {
    ok: false,
    error: 'target_changed',
    reason: 'changed_since_shown',
  });
  f.setHistory([
    questionRow({ state: 'resolved', selectedOptionId: null, resolvedBy: 'x', resolvedAt: 1, answers: [] }, 4),
  ]);
  assert.deepEqual(await intent(), { ok: false, error: 'target_changed', reason: 'question_changed' });
  f.setHistory([questionRow(pendingResolution, 5)]);
  assert.deepEqual(await intent(), { ok: false, error: 'target_changed', reason: 'question_changed' });
  f.setHistory([questionRow(pendingResolution, 3, 'other-item')]);
  assert.deepEqual(await intent(), { ok: false, error: 'target_changed', reason: 'question_gone' });
  f.setHistory([questionRow({ ...pendingResolution, state: 'expired' })]);
  assert.deepEqual(await intent(), { ok: false, error: 'unknown_shape' });
  f.setHistory([questionRow(pendingResolution)]);
  assert.deepEqual(await intent({ answers: [{ questionId: 'q-pick', optionIds: ['opt-secret-a'] }] }), {
    ok: false,
    error: 'invalid_answer',
    reason: 'answer_count',
  });
  assert.deepEqual(await intent({ answers: [ANSWERS[0], { questionId: 'q-free', optionIds: [], other: 'a\u0000' }] }), {
    ok: false,
    error: 'invalid_answer',
    reason: 'control_character',
  });
  f.cap.features.answerChat = {
    available: false,
    missing: ['capability:agent-session.question-answers.v1'],
    satisfied: [],
    deferred: [],
  };
  assert.deepEqual(await intent(), {
    ok: false,
    error: 'unsupported',
    missing: ['capability:agent-session.question-answers.v1'],
  });
  assert.equal(writes(f).length, 0);
});

test('T-07 answerIntent は通れば票と digest を返し、送らず、記録も作らない', async (t) => {
  const f = await fixture(t);
  const status = await f.service.status(CHAT_AGENT);
  assert.ok(status.target);
  const intent = await f.service.answerIntent({
    agent: CHAT_AGENT,
    prompt: PROMPT,
    answers: answers(),
    target: status.target,
  });
  assert.ok(intent.ok);
  assert.match(intent.digest, /^[0-9a-f]{64}$/);
  assert.equal(intent.preview.route, 'chat');
  assert.ok(intent.ticket && intent.operationId);
  assert.equal('answers' in intent, false);
  assert.equal(writes(f).length, 0);
  assert.equal(await f.journal.read(intent.operationId), null);
});

test('T-08 answerConfirm は before の記録の後に respondToQuestion を1回だけ送り、同じ票の2回目は送らない', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.answerIntent({ agent: CHAT_AGENT, prompt: PROMPT, answers: answers() });
  assert.ok(intent.ok);
  const order: string[] = [];
  const appendBefore = f.deps.journal.appendBefore.bind(f.deps.journal);
  f.deps.journal.appendBefore = async (input) => {
    order.push('before');
    return appendBefore(input);
  };
  const call = f.deps.rpc.call.bind(f.deps.rpc);
  f.deps.rpc.call = (async (method: string, params: unknown, options?: unknown) => {
    if (method === 'agentSession.respondToQuestion') order.push('send');
    return call(method, params, options as never);
  }) as typeof f.deps.rpc.call;
  const confirmed = await f.service.answerConfirm({ ticket: intent.ticket, answers: answers() });
  assert.deepEqual(confirmed, {
    ok: true,
    operationId: intent.operationId,
    outcome: 'submitted',
    detail: { code: 'resolved' },
  });
  assert.deepEqual(order, ['before', 'send']);
  const sent = answerCalls(f);
  assert.equal(sent.length, 1);
  const params = (sent[0] as unknown as { params: Record<string, unknown> }).params;
  assert.equal(params.itemId, ITEM);
  assert.equal(params.expectedRevision, 3);
  assert.deepEqual(params.answers, ANSWERS);
  assert.equal((params.envelope as Record<string, unknown>).clientOperationId, intent.operationId);
  assert.equal((params.envelope as Record<string, unknown>).expectedRuntimeFence, 4);
  assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers: answers() }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'unknown',
  });
  assert.equal(answerCalls(f).length, 1);
});

test('T-08 送っている間の2回目は busy で送らない', async (t) => {
  const f = await fixture(t);
  const a = await f.service.answerIntent({ agent: CHAT_AGENT, prompt: PROMPT, answers: answers() });
  const b = await f.service.answerIntent({ agent: CHAT_AGENT, prompt: PROMPT, answers: answers() });
  assert.ok(a.ok && b.ok);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const call = f.deps.rpc.call.bind(f.deps.rpc);
  f.deps.rpc.call = (async (method: string, params: unknown, options?: unknown) => {
    if (method === 'agentSession.respondToQuestion') {
      entered.resolve();
      await release.promise;
    }
    return call(method, params, options as never);
  }) as typeof f.deps.rpc.call;
  const first = f.service.answerConfirm({ ticket: a.ticket, answers: answers() });
  await entered.promise;
  assert.deepEqual(await f.service.answerConfirm({ ticket: b.ticket, answers: answers() }), {
    ok: false,
    error: 'busy',
  });
  assert.deepEqual(await f.service.check(a.operationId, { query: true }), {
    ok: true,
    operationId: a.operationId,
    state: 'in_progress',
  });
  release.resolve();
  assert.ok((await first).ok);
  assert.equal(answerCalls(f).length, 1);
});

test('T-08 答えの digest 違い・確定の前に答え済み・revision 違い・before の記録の失敗では送らない', async (t) => {
  const f = await fixture(t);
  const issue = async () => {
    f.setHistory([questionRow(pendingResolution)]);
    const intent = await f.service.answerIntent({ agent: CHAT_AGENT, prompt: PROMPT, answers: answers() });
    assert.ok(intent.ok);
    return intent;
  };
  let intent = await issue();
  assert.deepEqual(
    await f.service.answerConfirm({
      ticket: intent.ticket,
      answers: [{ questionId: 'q-pick', optionIds: ['opt-secret-b'] }, ANSWERS[1]],
    }),
    { ok: false, error: 'target_changed', reason: 'answer_changed' },
  );
  intent = await issue();
  f.setHistory([questionRow({ state: 'resolved', selectedOptionId: null, resolvedBy: 'x', resolvedAt: 1 }, 4)]);
  assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers: answers() }), {
    ok: false,
    error: 'target_changed',
    reason: 'question_changed',
  });
  intent = await issue();
  f.setHistory([questionRow(pendingResolution, 4)]);
  assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers: answers() }), {
    ok: false,
    error: 'target_changed',
    reason: 'question_changed',
  });
  intent = await issue();
  f.setHistory([]);
  assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers: answers() }), {
    ok: false,
    error: 'target_changed',
    reason: 'question_gone',
  });
  intent = await issue();
  f.deps.journal.appendBefore = async () => {
    throw new Error('disk full');
  };
  assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers: answers() }), {
    ok: false,
    error: 'record_failed',
  });
  assert.equal(writes(f).length, 0);
  const refused = await f.journal.read(intent.operationId);
  assert.equal(refused?.refused?.reason, 'record_failed');
});

test('T-08 送信の票と答えの票を取り違えない', async (t) => {
  const f = await fixture(t);
  const sendIntent = await f.service.intent({ agent: CHAT_AGENT, text: 'hello' });
  const answerIntent = await f.service.answerIntent({ agent: CHAT_AGENT, prompt: PROMPT, answers: answers() });
  assert.ok(sendIntent.ok && answerIntent.ok);
  assert.deepEqual(await f.service.answerConfirm({ ticket: sendIntent.ticket, answers: answers() }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'wrong_kind',
  });
  assert.deepEqual(await f.service.confirm({ ticket: answerIntent.ticket, text: 'hello' }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'wrong_kind',
  });
  assert.equal(writes(f).length, 0);
});

test('T-09 答えの記録の行に、選択肢の id・ラベル・その他の文が入らず、digest・問いの数・itemId・revision が入る', async (t) => {
  const f = await fixture(t);
  const raw = () => readFile(path.join(f.sendsDir, 'sends.jsonl'), 'utf8');
  const ok1 = await f.service.answerIntent({ agent: CHAT_AGENT, prompt: PROMPT, answers: answers() });
  assert.ok(ok1.ok);
  assert.ok((await f.service.answerConfirm({ ticket: ok1.ticket, answers: answers() })).ok);
  const refusedIntent = await f.service.answerIntent({ agent: CHAT_AGENT, prompt: PROMPT, answers: answers() });
  assert.ok(refusedIntent.ok);
  const changed = [
    { questionId: 'q-pick', optionIds: ['opt-secret-b'] },
    { questionId: 'q-free', optionIds: [], other: '秘密の別の文' },
  ];
  assert.ok(!(await f.service.answerConfirm({ ticket: refusedIntent.ticket, answers: changed })).ok);
  const text = await raw();
  for (const secret of ['opt-secret', 'ラベル秘密', '秘密の文', '秘密の別の文', '仮の問い']) {
    assert.ok(!text.includes(secret), secret);
  }
  const rows = text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const before = rows.find((r) => r.kind === 'before');
  assert.equal(before.action, 'answer');
  assert.deepEqual(before.prompt, PROMPT);
  assert.equal(before.questionCount, 2);
  assert.equal(before.digest, ok1.digest);
  assert.equal('text' in before, false);
  assert.ok(rows.some((r) => r.kind === 'after' && r.outcome === 'submitted'));
  assert.ok(rows.some((r) => r.kind === 'refused'));
  const record = await f.journal.read(ok1.operationId);
  assert.equal(record?.before?.action, 'answer');
  // 今の送信の記録の行は変わらない（text を持ち、action を持たない）
  const send = await f.service.intent({ agent: CHAT_AGENT, text: 'hello' });
  assert.ok(send.ok);
  assert.ok((await f.service.confirm({ ticket: send.ticket, text: 'hello' })).ok);
  const sendBefore = (await raw())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .find((r) => r.kind === 'before' && r.operationId === send.operationId);
  assert.equal(sendBefore.text, 'hello');
  assert.equal('action' in sendBefore, false);
});

test('T-09 結果不明の答えは check で質問の今の状態を照会し、送り直さない', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.answerIntent({ agent: CHAT_AGENT, prompt: PROMPT, answers: answers() });
  assert.ok(intent.ok);
  f.responses.set('agentSession.respondToQuestion', { ok: false, kind: 'timeout', message: 'private' });
  const confirmed = await f.service.answerConfirm({ ticket: intent.ticket, answers: answers() });
  assert.deepEqual(confirmed, {
    ok: true,
    operationId: intent.operationId,
    outcome: 'unknown',
    detail: { code: 'timeout' },
  });
  // 照会しない読みは記録だけ
  const plain = await f.service.check(intent.operationId, { query: false });
  assert.ok(plain.ok && plain.state === 'recorded' && plain.record.outcome === 'unknown');
  // まだ pending なら unknown のまま
  let checked = await f.service.check(intent.operationId, { query: true });
  assert.ok(checked.ok && checked.state === 'recorded');
  assert.equal(checked.record.outcome, 'unknown');
  assert.equal(checked.record.checks.at(-1)?.detail.code, 'prompt_pending');
  // Orca が同じ答えで答え済みにしていれば submitted
  f.setHistory([
    questionRow(
      { state: 'resolved', selectedOptionId: null, resolvedBy: 'orca-web', resolvedAt: 2, answers: ANSWERS },
      4,
    ),
  ]);
  checked = await f.service.check(intent.operationId, { query: true });
  assert.ok(checked.ok && checked.state === 'recorded');
  assert.equal(checked.record.outcome, 'submitted');
  assert.equal(checked.record.detail.code, 'resolved');
  assert.equal(answerCalls(f).length, 1);
});

// ---- 端末の質問（keys）と後の発言の質問（message）への答え（iss-00049 D-05、T-08〜T-12） ----

const ASK_INPUT = {
  questions: [{ question: '仮の端末の問い', options: [{ label: 'ラベル秘密A' }, { label: 'ラベル秘密B' }] }],
};
const ASYNC_INPUT = { questions: [{ title: '仮の後の問い', options: ['ラベル秘密A', 'ラベル秘密B'] }] };
const CALL = 'call-ask-test';
const KEY_ANSWERS = [{ questionId: '0', optionIds: [], other: '秘密の文' }];
const PICK_ANSWERS = [{ questionId: '0', optionIds: ['1'] }];
const callMessage = (name: string, input: unknown, callId = CALL) => ({
  id: `m-${callId}`,
  role: 'assistant',
  blocks: [{ type: 'tool-call', name, input, callId }],
});
const toolResult = (callId = CALL, isError = false) => ({
  id: `r-${callId}`,
  role: 'tool',
  blocks: [{ type: 'tool-result', output: 'x', isError, callId }],
});
const userSays = (text: string) => ({ id: `u-${text.length}`, role: 'user', blocks: [{ type: 'text', text }] });
const accepted = ok({ send: { accepted: true, writeSettlement: { outcome: 'accepted' } } });

async function callFixture(
  t: import('node:test').TestContext,
  { agentType = 'claude', input = ASK_INPUT }: { agentType?: string; input?: unknown } = {},
) {
  const f = await fixture(t, agentType === 'codex' ? 'codex' : 'claude');
  const status = (extra: Record<string, unknown> = {}) => ({
    agentType,
    providerSession: { id: 'session-terminal-test' },
    state: 'waiting',
    toolName: 'AskUserQuestion',
    interactivePrompt: JSON.stringify(input),
    ...extra,
  });
  const setPrompt = (extra: Record<string, unknown> = {}) =>
    f.responses.set(
      'session.tabs.listAll',
      ok(inventory([{ ...terminalTab(), agentStatus: status(extra) }, chatTab()])),
    );
  setPrompt();
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'permission' } }));
  f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: agentType } }));
  const a = f.snapshot.agents[0];
  if (a) a.agentType = fact(agentType);
  let native: unknown[] = [callMessage('AskUserQuestion', input)];
  let transcript: { ok: true; messages: TranscriptMessage[] } | { ok: false; error: string } | null = null;
  const reads: string[] = [];
  let session: { source: 'nativeChat' | 'agentSession'; sessionId: string } | null = null;
  const sessionOf = (agentId: string) =>
    session ??
    (agentId === CHAT_AGENT
      ? { source: 'agentSession' as const, sessionId: 'session-chat-test' }
      : { source: 'nativeChat' as const, sessionId: 'session-terminal-test' });
  const readTranscript = async (agentId: string) => {
    reads.push(agentId);
    if (transcript && !transcript.ok) return transcript as { ok: false; error: 'unreachable' };
    const messages = transcript ? transcript.messages : normalizeNativeMessages(native);
    assert.ok(messages);
    return { ok: true as const, messages, session: sessionOf(agentId) };
  };
  const keyQueue: RpcOutcome[] = [];
  const baseGet = f.responses.get.bind(f.responses);
  let beforeSeenAtFirstKey: boolean | null = null;
  f.responses.get = (method: string) => {
    if (method === 'terminal.send' && keyQueue.length) {
      if (beforeSeenAtFirstKey === null) {
        try {
          beforeSeenAtFirstKey = readFileSync(path.join(f.sendsDir, 'sends.jsonl'), 'utf8').includes('"before"');
        } catch {
          beforeSeenAtFirstKey = false;
        }
      }
      return keyQueue.shift();
    }
    return baseGet(method);
  };
  const sleeps: number[] = [];
  const deps = { ...f.deps, readTranscript, sleep: async (ms: number) => void sleeps.push(ms) };
  const service = new SendService(deps);
  return {
    ...f,
    service,
    deps,
    sleeps,
    reads,
    keyQueue,
    beforeSeenAtFirstKey: () => beforeSeenAtFirstKey,
    setPrompt,
    setNative: (rows: unknown[]) => {
      native = rows;
    },
    setTranscript: (value: typeof transcript) => {
      transcript = value;
    },
    setSession: (value: typeof session) => {
      session = value;
    },
    writes: () =>
      f.calls.filter((c) =>
        ['terminal.send', 'agentSession.send', 'agentSession.respondToQuestion'].includes(c.method),
      ),
    queueKeys: (...outcomes: RpcOutcome[]) => keyQueue.push(...outcomes),
    fresh: () => new SendService({ ...deps, journal: new SendJournal(f.sendsDir), tickets: new TicketStore() }),
  };
}
const keyTexts = (f: { writes(): { params: unknown }[] }) => f.writes().map((c) => (c.params as { text: string }).text);

test('T-08 answerIntent（callId）：端末の質問に、確かめが通れば票を返し、status が permission でも通り、書き込みを送らない', async (t) => {
  const f = await callFixture(t);
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
  assert.ok(intent.ok, JSON.stringify(intent));
  assert.equal(intent.preview.route, 'terminal');
  assert.equal(intent.digest, digestAnswers(KEY_ANSWERS));
  assert.deepEqual(f.reads, [TERMINAL_AGENT]);
  assert.equal(f.writes().length, 0);
  assert.equal(await f.journal.read(intent.operationId), null);
});

test('T-08 answerIntent（callId）：決めた誤りと理由を返し、書き込みの RPC を送らない', async (t) => {
  const cases: [
    string,
    (f: Awaited<ReturnType<typeof callFixture>>) => unknown,
    Record<string, unknown>,
    Partial<{ agent: string; answers: unknown; agentType: string; input: unknown }>?,
  ][] = [
    ['sendEnabled 偽', (f) => f.setEnabled(false), { error: 'send_disabled' }],
    ['会話にない', (f) => f.setNative([]), { error: 'target_changed', reason: 'question_gone' }],
    [
      'ツールの結果がある',
      (f) => f.setNative([callMessage('AskUserQuestion', ASK_INPUT), toolResult()]),
      { error: 'target_changed', reason: 'question_answered' },
    ],
    [
      '失敗したツールの結果がある',
      (f) => f.setNative([callMessage('AskUserQuestion', ASK_INPUT), toolResult(CALL, true)]),
      { error: 'target_changed', reason: 'question_answered' },
    ],
    ['会話が読めない', (f) => f.setTranscript({ ok: false, error: 'unreachable' }), { error: 'unreachable' }],
    [
      'interactivePrompt がない',
      (f) => f.setPrompt({ interactivePrompt: undefined }),
      { error: 'not_sendable', reason: 'prompt_unverified' },
    ],
    [
      'state が working',
      (f) => f.setPrompt({ state: 'working' }),
      { error: 'not_sendable', reason: 'prompt_unverified' },
    ],
    [
      'interactivePrompt が違う',
      (f) =>
        f.setPrompt({ interactivePrompt: JSON.stringify({ questions: [{ question: '別の問い', options: ['a'] }] }) }),
      { error: 'target_changed', reason: 'prompt_mismatch' },
    ],
    [
      '前面がシェル',
      (f) => f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: '/bin/zsh' } })),
      { error: 'not_sendable', reason: 'shell_foreground' },
    ],
    [
      'エージェントが動いていない',
      (f) => f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: false, status: null } })),
      { error: 'not_sendable', reason: 'no_agent' },
    ],
    ['答えの誤り', () => {}, { error: 'invalid_answer', reason: 'invalid_shape' }, { answers: [] }],
    [
      'その他の文の改行',
      () => {},
      { error: 'invalid_answer', reason: 'control_character' },
      { answers: [{ questionId: '0', optionIds: [], other: 'a\nb' }] },
    ],
    [
      '知らない種類のエージェント',
      () => {},
      { error: 'not_sendable', reason: 'agent_keys_unknown' },
      { agentType: 'gemini' },
    ],
    [
      'codex の複数選択',
      () => {},
      { error: 'not_sendable', reason: 'prompt_unsupported' },
      {
        agentType: 'codex',
        input: { questions: [{ question: '仮', multiSelect: true, options: ['a', 'b'] }] },
        answers: [{ questionId: '0', optionIds: ['0'] }],
      },
    ],
    [
      '能力がない',
      (f) =>
        (f.cap.features.answerKeys = {
          available: false,
          missing: ['feature:readTranscript'],
          satisfied: [],
          deferred: [],
        }),
      { error: 'unsupported', missing: ['feature:readTranscript'] },
    ],
  ];
  for (const [name, setup, expected, options = {}] of cases) {
    await t.test(name, async (t) => {
      const f = await callFixture(t, {
        ...(options.agentType ? { agentType: options.agentType } : {}),
        ...(options.input ? { input: options.input } : {}),
      });
      await setup(f);
      const answers = options.answers ?? KEY_ANSWERS;
      assert.deepEqual(await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers }), {
        ok: false,
        ...expected,
      });
      assert.equal(f.writes().length, 0);
    });
  }
});

test('T-08 answerIntent（callId）：構造化 Chat の宛先に keys の質問は chat_route、truncated の async は prompt_unsupported', async (t) => {
  const f = await callFixture(t);
  assert.deepEqual(await f.service.answerIntent({ agent: CHAT_AGENT, callId: CALL, answers: KEY_ANSWERS }), {
    ok: false,
    error: 'not_sendable',
    reason: 'chat_route',
  });
  f.setNative([callMessage('request_user_input_async', { questions: [{ title: 'q'.repeat(5000), options: ['a'] }] })]);
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  assert.deepEqual(
    await f.service.answerIntent({
      agent: TERMINAL_AGENT,
      callId: CALL,
      answers: PICK_ANSWERS.map((a) => ({ ...a, optionIds: ['0'] })),
    }),
    {
      ok: false,
      error: 'not_sendable',
      reason: 'prompt_unsupported',
    },
  );
  assert.equal(f.writes().length, 0);
});

test('T-08 answerIntent（callId）：前に送った記録があれば、新しい SendService でも already_sent', async (t) => {
  const f = await callFixture(t);
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: PICK_ANSWERS });
  assert.ok(intent.ok);
  f.queueKeys(accepted);
  const confirmed = await f.service.answerConfirm({ ticket: intent.ticket, answers: PICK_ANSWERS });
  assert.ok(confirmed.ok);
  const expected = { ok: false, error: 'not_sendable', reason: 'already_sent' };
  assert.deepEqual(
    await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: PICK_ANSWERS }),
    expected,
  );
  assert.deepEqual(
    await f.fresh().answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: PICK_ANSWERS }),
    expected,
  );
  assert.equal(f.writes().length, 1);
});

test('T-09 answerConfirm（keys）：before の記録の後に組を1組ずつ送り、組の間に 1000ms、同じ票の2回目は送らない', async (t) => {
  const f = await callFixture(t);
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
  assert.ok(intent.ok);
  f.queueKeys(accepted, accepted, accepted);
  const confirmed = await f.service.answerConfirm({ ticket: intent.ticket, answers: KEY_ANSWERS });
  assert.deepEqual(confirmed, {
    ok: true,
    operationId: intent.operationId,
    outcome: 'input_accepted',
    detail: { code: 'keys_sent', sentGroups: 3, totalGroups: 3 },
  });
  assert.equal(f.beforeSeenAtFirstKey(), true);
  assert.deepEqual(keyTexts(f), ['3', '秘密の文', '\r']);
  assert.deepEqual(f.sleeps, [1000, 1000]);
  const record = await f.journal.read(intent.operationId);
  assert.equal(record?.outcome, 'input_accepted');
  assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers: KEY_ANSWERS }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'unknown',
  });
  assert.equal(f.writes().length, 3);
});

test('T-09 answerConfirm（keys）：途中で止まれば partial_sent で残りを送らず、その後の同じ callId を already_sent で拒む', async (t) => {
  const f = await callFixture(t);
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
  assert.ok(intent.ok);
  f.queueKeys(accepted, { ok: false, kind: 'timeout', message: 'private' }, accepted);
  assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers: KEY_ANSWERS }), {
    ok: true,
    operationId: intent.operationId,
    outcome: 'unknown',
    detail: { code: 'partial_sent', sentGroups: 1, totalGroups: 3 },
  });
  assert.equal(f.writes().length, 2);
  const again = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
  assert.deepEqual(again, { ok: false, error: 'not_sendable', reason: 'already_sent' });
});

test('T-09 answerConfirm（keys）：送っている間の2回目は busy で送らない', async (t) => {
  const f = await callFixture(t);
  const first = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: PICK_ANSWERS });
  const second = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: PICK_ANSWERS });
  assert.ok(first.ok && second.ok);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  f.deps.sleep = async () => {};
  const baseGet = f.responses.get;
  f.responses.get = (method: string) => {
    if (method === 'terminal.send') {
      entered.resolve();
      return release.promise.then(() => accepted) as unknown as RpcOutcome;
    }
    return baseGet(method);
  };
  const running = f.service.answerConfirm({ ticket: first.ticket, answers: PICK_ANSWERS });
  await entered.promise;
  assert.deepEqual(await f.service.answerConfirm({ ticket: second.ticket, answers: PICK_ANSWERS }), {
    ok: false,
    error: 'busy',
  });
  release.resolve();
  assert.ok((await running).ok);
  assert.equal(f.writes().length, 1);
});

test('T-09 answerConfirm（keys）：確定の前にツールの結果・interactivePrompt の変化・答えの違いがあれば送らない', async (t) => {
  for (const [name, change, answers, expected] of [
    [
      'ツールの結果',
      (f) => f.setNative([callMessage('AskUserQuestion', ASK_INPUT), toolResult()]),
      KEY_ANSWERS,
      { error: 'target_changed', reason: 'question_answered' },
    ],
    [
      'interactivePrompt',
      (f) => f.setPrompt({ interactivePrompt: JSON.stringify({ questions: [{ question: '別', options: ['a'] }] }) }),
      KEY_ANSWERS,
      { error: 'target_changed', reason: 'prompt_mismatch' },
    ],
    [
      'interactivePrompt が消えた',
      (f) => f.setPrompt({ interactivePrompt: undefined, state: 'working' }),
      KEY_ANSWERS,
      { error: 'not_sendable', reason: 'prompt_unverified' },
    ],
    ['答えの digest', () => {}, PICK_ANSWERS, { error: 'target_changed', reason: 'answer_changed' }],
  ] as [string, (f: Awaited<ReturnType<typeof callFixture>>) => void, unknown, Record<string, unknown>][]) {
    await t.test(name, async (t) => {
      const f = await callFixture(t);
      const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
      assert.ok(intent.ok);
      change(f);
      assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers }), { ok: false, ...expected });
      assert.equal(f.writes().length, 0);
      const record = await f.journal.read(intent.operationId);
      assert.equal(record?.before, null);
      // 送っていないので、同じ callId はもう一度答えられる
      assert.equal(await f.journal.hasAnswer(TERMINAL_AGENT, CALL), false);
    });
  }
});

test('T-09 answerConfirm：before の記録を書けないか、記録が読めなければ送らない', async (t) => {
  const f = await callFixture(t);
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
  assert.ok(intent.ok);
  const journal: SendDeps['journal'] = {
    appendBefore: async () => {
      throw new Error('disk');
    },
    appendRefused: (input) => f.journal.appendRefused(input),
    hasAnswer: (a, c) => f.journal.hasAnswer(a, c),
    read: (id) => f.journal.read(id),
    appendAfter: (input) => f.journal.appendAfter(input),
    appendCheck: (input) => f.journal.appendCheck(input),
  };
  (f.deps as SendDeps).journal = journal;
  assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers: KEY_ANSWERS }), {
    ok: false,
    error: 'record_failed',
  });
  (f.deps as SendDeps).journal = {
    ...journal,
    hasAnswer: async () => {
      throw new Error('unreadable');
    },
  };
  assert.deepEqual(await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS }), {
    ok: false,
    error: 'record_unreadable',
  });
  assert.equal(f.writes().length, 0);
});

test('T-09 票の種類を取り違えない：call の票は今の確定で、送信の票は答えの確定で受けない', async (t) => {
  const f = await callFixture(t);
  const call = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
  assert.ok(call.ok);
  assert.deepEqual(await f.service.confirm({ ticket: call.ticket, text: 'hello' }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'wrong_kind',
  });
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  const text = await f.service.intent({ agent: TERMINAL_AGENT, text: 'hello' });
  assert.ok(text.ok);
  assert.deepEqual(await f.service.answerConfirm({ ticket: text.ticket, answers: KEY_ANSWERS }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'wrong_kind',
  });
  assert.equal(f.writes().length, 0);
});

test('T-09 answerConfirm（message）：端末は Orca と同じ形の発言を agentPrompt で1回送り、構造化 Chat は agentSession.send で1回送る', async (t) => {
  const f = await callFixture(t);
  f.setNative([callMessage('request_user_input_async', ASYNC_INPUT), toolResult()]);
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  const answers = [{ questionId: '0', optionIds: ['1'] }];
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers });
  assert.ok(intent.ok, JSON.stringify(intent));
  const confirmed = await f.service.answerConfirm({ ticket: intent.ticket, answers });
  assert.ok(confirmed.ok);
  assert.equal(confirmed.outcome, 'submitted');
  assert.deepEqual(keyTexts(f), ['> 仮の後の問い\n\nラベル秘密B']);
  assert.equal((f.writes()[0]?.params as { agentPrompt?: boolean } | undefined)?.agentPrompt, true);
  // 引用のある発言の後は question_answered
  f.setNative([
    callMessage('request_user_input_async', ASYNC_INPUT),
    toolResult(),
    userSays('> 仮の後の問い\n\nラベル秘密B'),
  ]);
  assert.deepEqual(await f.fresh().answerIntent({ agent: TERMINAL_AGENT, callId: 'other', answers }), {
    ok: false,
    error: 'target_changed',
    reason: 'question_gone',
  });
  assert.deepEqual(await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers }), {
    ok: false,
    error: 'target_changed',
    reason: 'question_answered',
  });

  const c = await callFixture(t);
  const journalAsync = normalizeJournalItems([
    {
      itemId: 't',
      sequence: 1,
      body: { kind: 'tool-call', name: 'request_user_input_async', input: ASYNC_INPUT, callId: CALL },
    },
  ]);
  assert.ok(journalAsync);
  c.setTranscript({ ok: true, messages: journalAsync });
  const chatIntent = await c.service.answerIntent({ agent: CHAT_AGENT, callId: CALL, answers });
  assert.ok(chatIntent.ok, JSON.stringify(chatIntent));
  const chatConfirmed = await c.service.answerConfirm({ ticket: chatIntent.ticket, answers });
  assert.ok(chatConfirmed.ok);
  assert.deepEqual(
    c.writes().map((w) => [w.method, (w.params as { body: { blocks: { text: string }[] } }).body.blocks[0]?.text]),
    [['agentSession.send', '> 仮の後の問い\n\nラベル秘密B']],
  );
});

test('T-10 keys・message の答えの記録の行に、ラベル、番号、その他の文、キー、発言の文が入らず、mode・callId・questionCount・digest・totalGroups が入る', async (t) => {
  const f = await callFixture(t);
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
  assert.ok(intent.ok);
  f.queueKeys(accepted, settledRefused());
  await f.service.answerConfirm({ ticket: intent.ticket, answers: KEY_ANSWERS });
  f.setNative([callMessage('request_user_input_async', ASYNC_INPUT, 'call-async')]);
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  const async = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: 'call-async', answers: PICK_ANSWERS });
  assert.ok(async.ok);
  await f.service.answerConfirm({ ticket: async.ticket, answers: PICK_ANSWERS });
  await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: 'call-async', answers: PICK_ANSWERS });
  const raw = await readFile(path.join(f.sendsDir, 'sends.jsonl'), 'utf8');
  for (const secret of ['ラベル秘密', '秘密の文', '"3"', '仮の後の問い', '"optionIds"', '\\r', '"text"']) {
    assert.equal(raw.includes(secret), false, secret);
  }
  const befores = raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((r) => r.kind === 'before');
  assert.deepEqual(
    befores.map((r) => [r.action, r.mode, r.route, r.callId, r.questionCount, r.digest, r.totalGroups]),
    [
      ['answer', 'keys', 'terminal', CALL, 1, digestAnswers(KEY_ANSWERS), 3],
      ['answer', 'message', 'terminal', 'call-async', 1, digestAnswers(PICK_ANSWERS), undefined],
    ],
  );
  const after = raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .find((r) => r.kind === 'after' && r.operationId === intent.operationId);
  assert.deepEqual(after.detail, { code: 'partial_sent', sentGroups: 1, totalGroups: 3 });
});
const settledRefused = () => ok({ send: { accepted: false, writeSettlement: { outcome: 'refused' } } });

test('T-11 照会：keys の結果不明は会話の今の状態から決め、送り直さない。after のない記録は no_after_record', async (t) => {
  const f = await callFixture(t);
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
  assert.ok(intent.ok);
  f.queueKeys({ ok: false, kind: 'timeout', message: 'private' });
  const confirmed = await f.service.answerConfirm({ ticket: intent.ticket, answers: KEY_ANSWERS });
  assert.ok(confirmed.ok && confirmed.detail.code === 'unconfirmed');
  const lastCheck = async () => {
    const checked = await f.service.check(intent.operationId, { query: true });
    assert.ok(checked.ok && checked.state === 'recorded');
    return [checked.record.outcome, checked.record.checks.at(-1)?.detail.code];
  };
  assert.deepEqual(await lastCheck(), ['unknown', 'prompt_pending']);
  f.setNative([callMessage('AskUserQuestion', ASK_INPUT), toolResult()]);
  assert.deepEqual(await lastCheck(), ['unknown', 'resolved_unverified']);
  f.setNative([]);
  assert.deepEqual(await lastCheck(), ['unknown', 'question_not_found']);
  f.setNative([callMessage('AskUserQuestion', ASK_INPUT), toolResult(CALL, true)]);
  assert.deepEqual(await lastCheck(), ['refused', 'cancelled']);
  assert.equal(f.writes().length, 1);

  // 送る途中で止まった（after の行がない）記録
  const g = await callFixture(t);
  await g.journal.appendBefore({
    operationId: '1234567890123-00000000000000000000000000000099',
    action: 'answer',
    mode: 'keys',
    route: 'terminal',
    target: { ...terminalTarget(), agentType: 'claude', repoName: null, worktreePath: null, branch: null, title: null },
    callId: CALL,
    questionCount: 1,
    totalGroups: 3,
    digest: 'd'.repeat(64),
    generation: { runtimeId: RUNTIME, incarnationId: 'inc-test' },
  });
  const crashed = await g.service.check('1234567890123-00000000000000000000000000000099', { query: true });
  assert.ok(crashed.ok && crashed.state === 'recorded');
  assert.equal(crashed.record.outcome, 'unknown');
  assert.equal(crashed.record.detail.code, 'no_after_record');
  assert.deepEqual(await g.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS }), {
    ok: false,
    error: 'not_sendable',
    reason: 'already_sent',
  });
  assert.equal(g.writes().length, 0);
});

test('T-11 照会：message の結果不明は今の照会（操作の ID）を使う', async (t) => {
  const f = await callFixture(t);
  f.setNative([callMessage('request_user_input_async', ASYNC_INPUT)]);
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: PICK_ANSWERS });
  assert.ok(intent.ok);
  f.responses.set('terminal.send', { ok: false, kind: 'timeout', message: 'private' });
  const confirmed = await f.service.answerConfirm({ ticket: intent.ticket, answers: PICK_ANSWERS });
  assert.ok(confirmed.ok && confirmed.outcome === 'unknown');
  const checked = await f.service.check(intent.operationId, { query: true });
  assert.ok(checked.ok && checked.state === 'recorded');
  assert.equal(checked.record.outcome, 'submitted');
  assert.ok(f.calls.some((c) => c.method === 'orchestration.requestShow'));
  assert.equal(f.writes().length, 1);
});

test('T-12 status：answerKeys と answerMessage を返し、端末の Claude で answerKeys が available、permission でも宛先の種類を返す', async (t) => {
  const f = await callFixture(t);
  f.calls.length = 0;
  assert.deepEqual(await f.service.status(TERMINAL_AGENT), {
    enabled: true,
    available: false,
    route: 'terminal',
    reason: 'permission',
    target: null,
    agentType: 'claude',
    answer: { available: false, reason: 'terminal_route' },
    approval: { available: false, reason: 'terminal_route' },
    answerKeys: { available: true, reason: null },
    answerMessage: { available: false, reason: 'permission' },
  });
  // 今の status（listAll・agentStatus・2回目の listAll）より読みの RPC を増やさない
  assert.deepEqual(
    f.calls.map((c) => c.method),
    ['session.tabs.listAll', 'terminal.agentStatus', 'terminal.inspectProcess'],
  );
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  f.calls.length = 0;
  const idle = await f.service.status(TERMINAL_AGENT);
  assert.deepEqual(
    [idle.available, idle.answerKeys, idle.answerMessage, idle.agentType],
    [true, { available: true, reason: null }, { available: true, reason: null }, 'claude'],
  );
  assert.equal(f.calls.length, 3);
  f.calls.length = 0;
  const chat = await f.service.status(CHAT_AGENT);
  assert.deepEqual(
    [chat.available, chat.answer, chat.answerKeys, chat.answerMessage],
    [
      true,
      { available: true, reason: null },
      { available: false, reason: 'chat_route' },
      { available: true, reason: null },
    ],
  );
  assert.equal(f.calls.length, 2);
  f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: '/bin/zsh' } }));
  const shell = await f.service.status(TERMINAL_AGENT);
  assert.deepEqual(
    [shell.route, shell.agentType, shell.answerKeys],
    [null, null, { available: false, reason: 'shell_foreground' }],
  );
  assert.equal(f.writes().length, 0);
});

test('T-12 status：知らない種類は agent_keys_unknown、能力がなければ unsupported、会話の読みがなければ answerMessage が unsupported', async (t) => {
  const g = await callFixture(t, { agentType: 'gemini' });
  g.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  const gemini = await g.service.status(TERMINAL_AGENT);
  assert.deepEqual(gemini.answerKeys, { available: false, reason: 'agent_keys_unknown' });
  const f = await callFixture(t);
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  f.cap.features.answerKeys = { available: false, missing: ['feature:readTranscript'], satisfied: [], deferred: [] };
  f.cap.features.readTranscript = {
    available: false,
    missing: ['rpc:nativeChat.readSession'],
    satisfied: [],
    deferred: [],
  };
  const status = await f.service.status(TERMINAL_AGENT);
  assert.deepEqual(
    [status.available, status.answerKeys, status.answerMessage],
    [true, { available: false, reason: 'unsupported' }, { available: false, reason: 'unsupported' }],
  );
});

test('iss-00049 transcriptTail：会話の読みを解いて末尾の 200 件を読み、正規化した件を返し、誤りはそのまま返す', async () => {
  const target = {
    agentId: TERMINAL_AGENT,
    source: 'nativeChat' as const,
    agentType: 'claude',
    sessionId: 's',
    transcriptPath: null,
    key: '0'.repeat(16),
  };
  const reads: unknown[] = [];
  const reader = {
    resolve: async (id: string) =>
      id === TERMINAL_AGENT ? { ok: true as const, target } : { ok: false as const, error: 'agent_not_found' as const },
    read: async (_t: unknown, options: unknown) => {
      reads.push(options);
      return {
        ok: true as const,
        page: {
          source: 'nativeChat' as const,
          rows: [callMessage('AskUserQuestion', ASK_INPUT)],
          hasMore: false,
          before: null,
        },
      };
    },
  };
  const tail = transcriptTail(reader);
  const read = await tail(TERMINAL_AGENT);
  assert.ok(read.ok);
  assert.equal(read.messages[0]?.parts[0]?.type, 'question');
  assert.deepEqual(read.session, { source: 'nativeChat', sessionId: 's' });
  assert.deepEqual(reads, [{ limit: 200 }]);
  assert.deepEqual(await tail('other'), { ok: false, error: 'agent_not_found' });
  const broken = transcriptTail({
    ...reader,
    read: async () => ({
      ok: true as const,
      page: { source: 'nativeChat' as const, rows: [1], hasMore: false, before: null },
    }),
  });
  assert.deepEqual(await broken(TERMINAL_AGENT), { ok: false, error: 'unknown_shape' });
});

// ---- 承認への答え（iss-00050 D-04、T-07〜T-09） ----

const APPROVAL_ITEM = 'item-approval-test';
const APPROVAL_PROMPT = { itemId: APPROVAL_ITEM, revision: 2 };
// 選択肢の id とラベル、題、detail が記録に入らないことを確かめるため、目立つ文字にする。
function approvalRow(
  resolution: Record<string, unknown>,
  revision = 2,
  itemId = APPROVAL_ITEM,
  options: unknown[] = [
    { id: 'opt-secret-allow', label: 'ラベル秘密許可', intent: 'allow_once' },
    { id: 'opt-secret-always', label: 'ラベル秘密常に', intent: 'allow_always' },
    { id: 'opt-secret-deny', label: 'ラベル秘密拒否', intent: 'reject_once' },
  ],
  extra: Record<string, unknown> = {},
) {
  return {
    itemId,
    revision,
    sequence: 10,
    body: {
      kind: 'approval',
      title: '題の秘密',
      displayName: 'Bash',
      detail: 'detail の秘密',
      options,
      resolution,
      ...extra,
    },
  };
}
const approvalCalls = (f: { calls: { method: string }[] }) =>
  f.calls.filter((c) => c.method === 'agentSession.respondToApproval');
const allWrites = (f: { calls: { method: string }[] }) =>
  f.calls.filter((c) =>
    ['terminal.send', 'agentSession.send', 'agentSession.respondToQuestion', 'agentSession.respondToApproval'].includes(
      c.method,
    ),
  );
async function approvalFixture(t: import('node:test').TestContext) {
  const f = await fixture(t);
  f.setHistory([questionRow(pendingResolution), approvalRow(pendingResolution)]);
  f.responses.set(
    'agentSession.respondToApproval',
    ok({ ok: true, value: { itemId: APPROVAL_ITEM, revision: 3, resolution: { state: 'resolved' } } }),
  );
  return f;
}

test('T-07 approvalIntent は送れないときの理由を返し、どれも書き込みの RPC を送らない', async (t) => {
  const f = await approvalFixture(t);
  const intent = (extra: Record<string, unknown> = {}) =>
    f.service.approvalIntent({ agent: CHAT_AGENT, prompt: APPROVAL_PROMPT, optionId: 'opt-secret-allow', ...extra });
  f.setEnabled(false);
  assert.deepEqual(await intent(), { ok: false, error: 'send_disabled' });
  f.setEnabled(true);
  assert.deepEqual(await intent({ agent: TERMINAL_AGENT }), {
    ok: false,
    error: 'not_sendable',
    reason: 'terminal_route',
  });
  assert.deepEqual(await intent({ target: '0'.repeat(32) }), {
    ok: false,
    error: 'target_changed',
    reason: 'changed_since_shown',
  });
  f.setHistory([
    approvalRow({ state: 'resolved', selectedOptionId: 'opt-secret-deny', resolvedBy: 'x', resolvedAt: 1 }, 3),
  ]);
  assert.deepEqual(await intent(), { ok: false, error: 'target_changed', reason: 'question_changed' });
  f.setHistory([approvalRow(pendingResolution, 5)]);
  assert.deepEqual(await intent(), { ok: false, error: 'target_changed', reason: 'question_changed' });
  f.setHistory([approvalRow(pendingResolution, 2, 'other-item')]);
  assert.deepEqual(await intent(), { ok: false, error: 'target_changed', reason: 'question_gone' });
  f.setHistory([approvalRow({ ...pendingResolution, state: 'expired' })]);
  assert.deepEqual(await intent(), { ok: false, error: 'unknown_shape' });
  f.setHistory([questionRow(pendingResolution, 2, APPROVAL_ITEM)]);
  assert.deepEqual(await intent(), { ok: false, error: 'unknown_shape' }, '承認でない項目');
  f.setHistory([approvalRow(pendingResolution)]);
  assert.deepEqual(await intent({ optionId: 'gone' }), {
    ok: false,
    error: 'invalid_answer',
    reason: 'unknown_option',
  });
  assert.deepEqual(await intent({ optionId: 'opt-secret-always' }), {
    ok: false,
    error: 'invalid_answer',
    reason: 'persistent_unconfirmed',
  });
  assert.deepEqual(await intent({ optionId: 'opt-secret-always', confirmPersistent: false }), {
    ok: false,
    error: 'invalid_answer',
    reason: 'persistent_unconfirmed',
  });
  f.setHistory([approvalRow(pendingResolution, 2, APPROVAL_ITEM, undefined, { subject: { kind: 'url', url: 'x' } })]);
  assert.deepEqual(await intent(), { ok: false, error: 'invalid_answer', reason: 'not_answerable' });
  f.setHistory([approvalRow(pendingResolution)]);
  f.cap.features.answerApproval = {
    available: false,
    missing: ['capability:agent-session.structured.v1'],
    satisfied: [],
    deferred: [],
  };
  assert.deepEqual(await intent(), {
    ok: false,
    error: 'unsupported',
    missing: ['capability:agent-session.structured.v1'],
  });
  assert.equal(allWrites(f).length, 0);
});

test('T-07 approvalIntent は通れば票と digest と intent を返し、送らず、記録も作らない。質問の能力は要らない', async (t) => {
  const f = await approvalFixture(t);
  f.cap.features.answerChat = { available: false, missing: ['x'], satisfied: [], deferred: [] };
  const status = await f.service.status(CHAT_AGENT);
  assert.ok(status.target);
  const intent = await f.service.approvalIntent({
    agent: CHAT_AGENT,
    prompt: APPROVAL_PROMPT,
    optionId: 'opt-secret-allow',
    target: status.target,
  });
  assert.ok(intent.ok);
  assert.match(intent.digest, /^[0-9a-f]{64}$/);
  assert.equal(intent.intent, 'allow_once');
  assert.equal(intent.preview.route, 'chat');
  assert.ok(intent.ticket && intent.operationId);
  assert.equal('optionId' in intent, false);
  const always = await f.service.approvalIntent({
    agent: CHAT_AGENT,
    prompt: APPROVAL_PROMPT,
    optionId: 'opt-secret-always',
    confirmPersistent: true,
  });
  assert.ok(always.ok);
  assert.equal(always.intent, 'allow_always');
  assert.equal(allWrites(f).length, 0);
  assert.equal(await f.journal.read(intent.operationId), null);
});

test('T-08 approvalConfirm は before の記録の後に respondToApproval を1回だけ送り、同じ票の2回目は送らない', async (t) => {
  const f = await approvalFixture(t);
  const intent = await f.service.approvalIntent({
    agent: CHAT_AGENT,
    prompt: APPROVAL_PROMPT,
    optionId: 'opt-secret-always',
    confirmPersistent: true,
  });
  assert.ok(intent.ok);
  const order: string[] = [];
  const appendBefore = f.deps.journal.appendBefore.bind(f.deps.journal);
  f.deps.journal.appendBefore = async (input) => {
    order.push('before');
    return appendBefore(input);
  };
  const call = f.deps.rpc.call.bind(f.deps.rpc);
  f.deps.rpc.call = (async (method: string, params: unknown, options?: unknown) => {
    if (method === 'agentSession.respondToApproval') order.push('send');
    return call(method, params, options as never);
  }) as typeof f.deps.rpc.call;
  const confirmed = await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'opt-secret-always' });
  assert.deepEqual(confirmed, {
    ok: true,
    operationId: intent.operationId,
    outcome: 'submitted',
    detail: { code: 'resolved' },
  });
  assert.deepEqual(order, ['before', 'send']);
  const sent = approvalCalls(f);
  assert.equal(sent.length, 1);
  const params = (sent[0] as unknown as { params: Record<string, unknown> }).params;
  assert.equal(params.itemId, APPROVAL_ITEM);
  assert.equal(params.expectedRevision, 2);
  assert.equal(params.optionId, 'opt-secret-always');
  assert.equal((params.envelope as Record<string, unknown>).clientOperationId, intent.operationId);
  assert.equal((params.envelope as Record<string, unknown>).expectedRuntimeFence, 4);
  assert.deepEqual(await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'opt-secret-always' }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'unknown',
  });
  assert.equal(approvalCalls(f).length, 1);
});

test('T-08 承認を送っている間の2回目は busy で送らず、照会は in_progress', async (t) => {
  const f = await approvalFixture(t);
  const issue = () =>
    f.service.approvalIntent({ agent: CHAT_AGENT, prompt: APPROVAL_PROMPT, optionId: 'opt-secret-allow' });
  const a = await issue();
  const b = await issue();
  assert.ok(a.ok && b.ok);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const call = f.deps.rpc.call.bind(f.deps.rpc);
  f.deps.rpc.call = (async (method: string, params: unknown, options?: unknown) => {
    if (method === 'agentSession.respondToApproval') {
      entered.resolve();
      await release.promise;
    }
    return call(method, params, options as never);
  }) as typeof f.deps.rpc.call;
  const first = f.service.approvalConfirm({ ticket: a.ticket, optionId: 'opt-secret-allow' });
  await entered.promise;
  assert.deepEqual(await f.service.approvalConfirm({ ticket: b.ticket, optionId: 'opt-secret-allow' }), {
    ok: false,
    error: 'busy',
  });
  assert.deepEqual(await f.service.check(a.operationId, { query: true }), {
    ok: true,
    operationId: a.operationId,
    state: 'in_progress',
  });
  release.resolve();
  assert.ok((await first).ok);
  assert.equal(approvalCalls(f).length, 1);
});

test('T-08 optionId 違い・確定の前に答え済み・revision 違い・intent の変化・項目の消失・before の記録の失敗では送らない', async (t) => {
  const f = await approvalFixture(t);
  const issue = async (optionId = 'opt-secret-allow') => {
    f.setHistory([approvalRow(pendingResolution)]);
    const intent = await f.service.approvalIntent({ agent: CHAT_AGENT, prompt: APPROVAL_PROMPT, optionId });
    assert.ok(intent.ok);
    return intent;
  };
  const confirm = (ticket: string, optionId = 'opt-secret-allow') => f.service.approvalConfirm({ ticket, optionId });
  let intent = await issue();
  assert.deepEqual(await confirm(intent.ticket, 'opt-secret-deny'), {
    ok: false,
    error: 'target_changed',
    reason: 'answer_changed',
  });
  intent = await issue();
  f.setHistory([
    approvalRow({ state: 'resolved', selectedOptionId: 'opt-secret-deny', resolvedBy: 'x', resolvedAt: 1 }, 3),
  ]);
  assert.deepEqual(await confirm(intent.ticket), { ok: false, error: 'target_changed', reason: 'question_changed' });
  intent = await issue();
  f.setHistory([approvalRow(pendingResolution, 3)]);
  assert.deepEqual(await confirm(intent.ticket), { ok: false, error: 'target_changed', reason: 'question_changed' });
  intent = await issue();
  // 同じ id の選択肢の intent が常に許可に変わった
  f.setHistory([
    approvalRow(pendingResolution, 2, APPROVAL_ITEM, [
      { id: 'opt-secret-allow', label: 'ラベル秘密許可', intent: 'allow_always' },
    ]),
  ]);
  assert.deepEqual(await confirm(intent.ticket), { ok: false, error: 'target_changed', reason: 'question_changed' });
  intent = await issue();
  // 選んだ選択肢が今の選択肢にない
  f.setHistory([
    approvalRow(pendingResolution, 2, APPROVAL_ITEM, [{ id: 'opt-secret-deny', label: 'x', intent: 'reject_once' }]),
  ]);
  assert.deepEqual(await confirm(intent.ticket), { ok: false, error: 'invalid_answer', reason: 'unknown_option' });
  intent = await issue();
  f.setHistory([]);
  assert.deepEqual(await confirm(intent.ticket), { ok: false, error: 'target_changed', reason: 'question_gone' });
  intent = await issue();
  f.deps.journal.appendBefore = async () => {
    throw new Error('disk full');
  };
  assert.deepEqual(await confirm(intent.ticket), { ok: false, error: 'record_failed' });
  assert.equal(allWrites(f).length, 0);
  const refused = await f.journal.read(intent.operationId);
  assert.equal(refused?.refused?.reason, 'record_failed');
});

test('T-08 送信の票・質問の票・承認の票を取り違えない', async (t) => {
  const f = await approvalFixture(t);
  const issue = async () => {
    const send = await f.service.intent({ agent: CHAT_AGENT, text: 'hello' });
    const answer = await f.service.answerIntent({ agent: CHAT_AGENT, prompt: PROMPT, answers: answers() });
    const approval = await f.service.approvalIntent({
      agent: CHAT_AGENT,
      prompt: APPROVAL_PROMPT,
      optionId: 'opt-secret-allow',
    });
    assert.ok(send.ok && answer.ok && approval.ok);
    return { send, answer, approval };
  };
  const wrong = { ok: false, error: 'ticket_invalid', reason: 'wrong_kind' };
  let t1 = await issue();
  assert.deepEqual(await f.service.approvalConfirm({ ticket: t1.send.ticket, optionId: 'opt-secret-allow' }), wrong);
  assert.deepEqual(await f.service.approvalConfirm({ ticket: t1.answer.ticket, optionId: 'opt-secret-allow' }), wrong);
  assert.deepEqual(await f.service.confirm({ ticket: t1.approval.ticket, text: 'hello' }), wrong);
  t1 = await issue();
  assert.deepEqual(await f.service.answerConfirm({ ticket: t1.approval.ticket, answers: answers() }), wrong);
  assert.equal(allWrites(f).length, 0);
});

test('T-09 承認の記録の行に、選択肢の id・ラベル・題・detail が入らず、digest・intent・itemId・revision が入る', async (t) => {
  const f = await approvalFixture(t);
  const raw = () => readFile(path.join(f.sendsDir, 'sends.jsonl'), 'utf8');
  const ok1 = await f.service.approvalIntent({
    agent: CHAT_AGENT,
    prompt: APPROVAL_PROMPT,
    optionId: 'opt-secret-deny',
  });
  assert.ok(ok1.ok);
  assert.ok((await f.service.approvalConfirm({ ticket: ok1.ticket, optionId: 'opt-secret-deny' })).ok);
  const refusedIntent = await f.service.approvalIntent({
    agent: CHAT_AGENT,
    prompt: APPROVAL_PROMPT,
    optionId: 'opt-secret-allow',
  });
  assert.ok(refusedIntent.ok);
  assert.ok(!(await f.service.approvalConfirm({ ticket: refusedIntent.ticket, optionId: 'opt-secret-deny' })).ok);
  const text = await raw();
  for (const secret of ['opt-secret', 'ラベル秘密', '題の秘密', 'detail の秘密']) {
    assert.ok(!text.includes(secret), secret);
  }
  const rows = text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const before = rows.find((r) => r.kind === 'before');
  assert.equal(before.action, 'approval');
  assert.equal(before.route, 'chat');
  assert.deepEqual(before.prompt, APPROVAL_PROMPT);
  assert.equal(before.intent, 'reject_once');
  assert.equal(before.digest, ok1.digest);
  assert.equal('text' in before, false);
  assert.equal('optionId' in before, false);
  assert.ok(rows.some((r) => r.kind === 'after' && r.outcome === 'submitted'));
  assert.ok(rows.some((r) => r.kind === 'refused'));
  const record = await f.journal.read(ok1.operationId);
  assert.equal(record?.before?.action, 'approval');
});

test('T-09 結果不明の承認の答えは check で承認の今の状態を照会し、送り直さない', async (t) => {
  const f = await approvalFixture(t);
  const intent = await f.service.approvalIntent({
    agent: CHAT_AGENT,
    prompt: APPROVAL_PROMPT,
    optionId: 'opt-secret-allow',
  });
  assert.ok(intent.ok);
  f.responses.set('agentSession.respondToApproval', { ok: false, kind: 'timeout', message: 'private' });
  const confirmed = await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'opt-secret-allow' });
  assert.deepEqual(confirmed, {
    ok: true,
    operationId: intent.operationId,
    outcome: 'unknown',
    detail: { code: 'timeout' },
  });
  let checked = await f.service.check(intent.operationId, { query: true });
  assert.ok(checked.ok && checked.state === 'recorded');
  assert.equal(checked.record.outcome, 'unknown');
  assert.equal(checked.record.checks.at(-1)?.detail.code, 'prompt_pending');
  f.setHistory([
    approvalRow({ state: 'resolved', selectedOptionId: 'opt-secret-deny', resolvedBy: 'x', resolvedAt: 2 }, 3),
  ]);
  checked = await f.service.check(intent.operationId, { query: true });
  assert.ok(checked.ok && checked.state === 'recorded');
  assert.equal(checked.record.outcome, 'refused');
  assert.equal(checked.record.detail.code, 'resolved_by_other');
  assert.equal(approvalCalls(f).length, 1);
  assert.equal(
    f.calls.filter((c) => c.method === 'agentSession.respondToQuestion' || c.method === 'agentSession.sendRecorded')
      .length,
    0,
  );
});

test('T-09 結果不明の後に同じ選択肢で答え済みなら submitted', async (t) => {
  const f = await approvalFixture(t);
  const intent = await f.service.approvalIntent({
    agent: CHAT_AGENT,
    prompt: APPROVAL_PROMPT,
    optionId: 'opt-secret-allow',
  });
  assert.ok(intent.ok);
  f.responses.set('agentSession.respondToApproval', { ok: false, kind: 'timeout', message: 'private' });
  assert.ok((await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'opt-secret-allow' })).ok);
  f.setHistory([
    approvalRow({ state: 'resolved', selectedOptionId: 'opt-secret-allow', resolvedBy: 'x', resolvedAt: 2 }, 3),
  ]);
  const checked = await f.service.check(intent.operationId, { query: true });
  assert.ok(checked.ok && checked.state === 'recorded');
  assert.equal(checked.record.outcome, 'submitted');
  assert.equal(approvalCalls(f).length, 1);
});

test('status の approval は能力 answerApproval と止めた承認の RPC を見て、質問の能力に引きずられない', async (t) => {
  const f = await approvalFixture(t);
  f.cap.features.answerChat = { available: false, missing: ['x'], satisfied: [], deferred: [] };
  let status = await f.service.status(CHAT_AGENT);
  assert.deepEqual(status.answer, { available: false, reason: 'unsupported' });
  assert.deepEqual(status.approval, { available: true, reason: null });
  f.cap.features.answerApproval = { available: false, missing: ['x'], satisfied: [], deferred: [] };
  status = await f.service.status(CHAT_AGENT);
  assert.deepEqual(status.approval, { available: false, reason: 'unsupported' });
  f.cap.features.answerApproval = { available: true, missing: [], satisfied: [], deferred: [] };
  // method_not_found で承認の RPC を止めると、approval だけが使えなくなる
  f.cap.features.answerChat = { available: true, missing: [], satisfied: [], deferred: [] };
  f.responses.set('agentSession.respondToApproval', {
    ok: false,
    kind: 'orca-error',
    code: 'method_not_found',
    message: 'private',
  });
  const intent = await f.service.approvalIntent({
    agent: CHAT_AGENT,
    prompt: APPROVAL_PROMPT,
    optionId: 'opt-secret-allow',
  });
  assert.ok(intent.ok);
  const confirmed = await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'opt-secret-allow' });
  assert.ok(confirmed.ok);
  assert.equal(confirmed.outcome, 'refused');
  status = await f.service.status(CHAT_AGENT);
  assert.deepEqual(status.approval, { available: false, reason: 'unsupported' });
  assert.deepEqual(status.answer, { available: true, reason: null });
  assert.deepEqual(
    await f.service.approvalIntent({ agent: CHAT_AGENT, prompt: APPROVAL_PROMPT, optionId: 'opt-secret-allow' }),
    { ok: false, error: 'unsupported', missing: ['rpc:agentSession.respondToApproval'] },
  );
  // 端末は terminal_route
  status = await f.service.status(TERMINAL_AGENT);
  assert.deepEqual(status.approval, { available: false, reason: 'terminal_route' });
});

// ---- 最終品質ゲート attempt 1 の直し ----

test('FQG 会話の読みのセッションが宛先のセッションと違えば、意図も確定も session_changed で1組も送らない', async (t) => {
  const f = await callFixture(t);
  f.setSession({ source: 'nativeChat', sessionId: 'session-old' });
  const expected = { ok: false, error: 'target_changed', reason: 'session_changed' };
  assert.deepEqual(
    await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS }),
    expected,
  );
  f.setSession({ source: 'agentSession', sessionId: 'session-terminal-test' });
  assert.deepEqual(
    await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS }),
    expected,
  );
  f.setSession(null);
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
  assert.ok(intent.ok);
  f.setSession({ source: 'nativeChat', sessionId: 'session-new' });
  assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers: KEY_ANSWERS }), expected);
  assert.equal(f.writes().length, 0);
  assert.equal(await f.journal.hasAnswer(TERMINAL_AGENT, CALL), false);
  // 構造化 Chat は宛先の sessionId と比べる
  const c = await callFixture(t);
  const journalAsync = normalizeJournalItems([
    {
      itemId: 't',
      sequence: 1,
      body: { kind: 'tool-call', name: 'request_user_input_async', input: ASYNC_INPUT, callId: CALL },
    },
  ]);
  assert.ok(journalAsync);
  c.setTranscript({ ok: true, messages: journalAsync });
  c.setSession({ source: 'agentSession', sessionId: 'session-other' });
  assert.deepEqual(await c.service.answerIntent({ agent: CHAT_AGENT, callId: CALL, answers: PICK_ANSWERS }), expected);
  assert.equal(c.writes().length, 0);
});

test('FQG keys の照会は、会話のセッションが記録の宛先と違えば question_not_found で送らない', async (t) => {
  const f = await callFixture(t);
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: KEY_ANSWERS });
  assert.ok(intent.ok);
  f.queueKeys({ ok: false, kind: 'timeout', message: 'private' });
  assert.ok((await f.service.answerConfirm({ ticket: intent.ticket, answers: KEY_ANSWERS })).ok);
  f.setNative([callMessage('AskUserQuestion', ASK_INPUT), toolResult(CALL, true)]);
  f.setSession({ source: 'nativeChat', sessionId: 'session-new' });
  const checked = await f.service.check(intent.operationId, { query: true });
  assert.ok(checked.ok && checked.state === 'recorded');
  assert.equal(checked.record.outcome, 'unknown');
  assert.equal(checked.record.checks.at(-1)?.detail.code, 'question_not_found');
  assert.equal(f.writes().length, 1);
});

test('FQG 意図と確定の間に同じ callId の問いの文や選択肢が変われば question_changed で送らない', async (t) => {
  for (const input of [
    { questions: [{ question: '変わった問い', options: [{ label: 'ラベル秘密A' }, { label: 'ラベル秘密B' }] }] },
    { questions: [{ question: '仮の端末の問い', options: [{ label: 'ラベル秘密A' }, { label: '別のラベル' }] }] },
  ]) {
    const f = await callFixture(t);
    const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: PICK_ANSWERS });
    assert.ok(intent.ok);
    f.setNative([callMessage('AskUserQuestion', input)]);
    f.setPrompt({ interactivePrompt: JSON.stringify(input) });
    assert.deepEqual(await f.service.answerConfirm({ ticket: intent.ticket, answers: PICK_ANSWERS }), {
      ok: false,
      error: 'target_changed',
      reason: 'question_changed',
    });
    assert.equal(f.writes().length, 0);
  }
});

test('FQG 切った keys の質問は prompt_unsupported で送らない', async (t) => {
  const long = { questions: [{ question: 'q'.repeat(5000), options: [{ label: 'a' }, { label: 'b' }] }] };
  const f = await callFixture(t, { input: long });
  assert.deepEqual(await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: PICK_ANSWERS }), {
    ok: false,
    error: 'not_sendable',
    reason: 'prompt_unsupported',
  });
  assert.equal(f.writes().length, 0);
});

test('FQG2 送る前の確かめは、届いていない引用の発言があっても question_answered で拒む（二重を避ける）', async (t) => {
  const f = await callFixture(t);
  f.setNative([
    callMessage('request_user_input_async', ASYNC_INPUT),
    { ...userSays('> 仮の後の問い\n\nラベル秘密A'), queued: true },
  ]);
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  assert.deepEqual(await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: PICK_ANSWERS }), {
    ok: false,
    error: 'target_changed',
    reason: 'question_answered',
  });
  assert.equal(f.writes().length, 0);
});

test('FQG3 ほかのエージェントからの引用の発言は利用者の答えに数えず、送る（question_answered にしない）', async (t) => {
  const f = await callFixture(t);
  f.setNative([
    callMessage('request_user_input_async', ASYNC_INPUT),
    { ...userSays('> 仮の後の問い\n\nラベル秘密A'), from: { kind: 'agent', id: 'other-agent' } },
  ]);
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  const intent = await f.service.answerIntent({ agent: TERMINAL_AGENT, callId: CALL, answers: PICK_ANSWERS });
  assert.ok(intent.ok, JSON.stringify(intent));
  const confirmed = await f.service.answerConfirm({ ticket: intent.ticket, answers: PICK_ANSWERS });
  assert.ok(confirmed.ok);
  assert.equal(f.writes().length, 1);
});
