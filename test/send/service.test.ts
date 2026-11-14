import assert from 'node:assert/strict';
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { CapabilityReport } from '../../src/orca/capabilities.ts';
import type { RpcOutcome } from '../../src/orca/rpc.ts';
import { createSendAdapter } from '../../src/orca/send.ts';
import { SendRpc } from '../../src/orca/send-gates.ts';
import { SendJournal } from '../../src/send/journal.ts';
import { SendService } from '../../src/send/service.ts';
import { targetFingerprint } from '../../src/send/target.ts';
import { digestText, TicketStore } from '../../src/send/ticket.ts';
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
    ['agentSession.history', ok({ ok: true, page: { sessionId: 'session-chat-test', fence: 4 } })],
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
    setEnabled: (value: boolean) => {
      enabled = value;
    },
    advance: () => {
      now += 60000;
    },
    sends: () => calls.filter((c) => ['terminal.send', 'agentSession.send'].includes(c.method)),
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
  });
  f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: '/bin/zsh' } }));
  assert.deepEqual(await f.service.status(TERMINAL_AGENT), {
    enabled: true,
    available: false,
    route: null,
    reason: 'shell_foreground',
    target: null,
    agentType: null,
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
