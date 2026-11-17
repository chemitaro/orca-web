// 端末の許可の確認への答え（iss-00054 D-04、T-06・T-07）。手書きの仮のタブと偽の RPC だけを使い、Orca を起動しない。
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { CapabilityReport } from '../../src/orca/capabilities.ts';
import type { RpcOutcome } from '../../src/orca/rpc.ts';
import { createSendAdapter } from '../../src/orca/send.ts';
import { SendRpc } from '../../src/orca/send-gates.ts';
import { digestOption } from '../../src/send/approval.ts';
import { SendJournal } from '../../src/send/journal.ts';
import { type SendDeps, SendService } from '../../src/send/service.ts';
import { targetFingerprint } from '../../src/send/target.ts';
import { TicketStore } from '../../src/send/ticket.ts';
import { terminalApprovalId } from '../../src/transcript/terminal-approval.ts';
import { agent, fact, repo, state, worktree } from '../runs/fixture.ts';
import { CHAT_AGENT, chatTab, inventory, RUNTIME, TERMINAL_AGENT, terminalTab, terminalTarget } from './fixture.ts';

const ok = (result: unknown): RpcOutcome => ({ ok: true, result, runtimeId: RUNTIME });
const ESC = '\u001b';
const TOOL = '道具の秘密';
const SUMMARY = '要約の秘密';
const PROMPT = JSON.stringify({ approval: { tool: TOOL, summary: SUMMARY } });
const STARTED = 1_700_000_000_000;
const PROMPT_ID = terminalApprovalId(PROMPT, STARTED);
const accepted = ok({ send: { accepted: true, writeSettlement: { outcome: 'accepted' } } });

async function fixture(t: import('node:test').TestContext, agentType = 'claude') {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-terminal-approval-'));
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
  const status = (extra: Record<string, unknown> = {}) => ({
    agentType,
    providerSession: { id: 'session-terminal-test' },
    state: 'blocked',
    toolName: TOOL,
    interactivePrompt: PROMPT,
    stateStartedAt: STARTED,
    ...extra,
  });
  const tabsWith = (agentStatus: unknown) => ok(inventory([{ ...terminalTab(), agentStatus }, chatTab()]));
  /** 宛先のペインの agentStatus。listAlls に積めば、読むたびに先頭から1つずつ使い、空なら base を使う。 */
  let base = tabsWith(status());
  const listAlls: RpcOutcome[] = [];
  const responses = new Map<string, RpcOutcome>([
    ['terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'permission' } })],
    ['terminal.inspectProcess', ok({ process: { foregroundProcess: agentType } })],
    ['agentSession.history', ok({ ok: true, page: { sessionId: 'session-chat-test', fence: 4, items: [] } })],
  ]);
  const sendQueue: RpcOutcome[] = [];
  const calls: { method: string; params: unknown }[] = [];
  let beforeAtSend: boolean | null = null;
  let onSend: (() => Promise<void>) | null = null;
  const sendsDir = path.join(dir, 'sends');
  const rpc = new SendRpc({
    async call<T>(method: string, params: unknown) {
      calls.push({ method, params });
      if (method === 'session.tabs.listAll') return (listAlls.shift() ?? base) as RpcOutcome<T>;
      if (method === 'terminal.send') {
        try {
          beforeAtSend = (await readFile(path.join(sendsDir, 'sends.jsonl'), 'utf8')).includes('"before"');
        } catch {
          beforeAtSend = false;
        }
        if (onSend) await onSend();
        return (sendQueue.shift() ?? accepted) as RpcOutcome<T>;
      }
      const result = responses.get(method);
      assert.ok(result, method);
      return result as RpcOutcome<T>;
    },
  });
  let enabled = true;
  let count = 0;
  const now = 1234567890123;
  const journal = new SendJournal(sendsDir);
  const deps: SendDeps = {
    snapshotSync: () => snapshot,
    capabilities: async () => cap,
    rpc,
    adapter: createSendAdapter({ rpc }),
    journal,
    tickets: new TicketStore({ now: () => now }),
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
    sendsDir,
    sendQueue,
    status,
    tabsWith,
    setBase: (value: RpcOutcome) => {
      base = value;
    },
    queueListAll: (...values: RpcOutcome[]) => listAlls.push(...values),
    setEnabled: (value: boolean) => {
      enabled = value;
    },
    setOnSend: (fn: (() => Promise<void>) | null) => {
      onSend = fn;
    },
    beforeAtSend: () => beforeAtSend,
    writes: () => calls.filter((c) => c.method === 'terminal.send' || c.method.startsWith('agentSession.respond')),
    fresh: () => new SendService({ ...deps, journal: new SendJournal(sendsDir), tickets: new TicketStore() }),
  };
}
const intentOf = (optionId: unknown = 'allow_once', extra: Record<string, unknown> = {}) => ({
  agent: TERMINAL_AGENT,
  promptId: PROMPT_ID,
  optionId,
  ...extra,
});

test('T-06 approvalIntent（promptId）：確かめが通れば票と digest と intent を返し、status が permission でも通り、書き込みも記録もしない', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.approvalIntent(intentOf('allow_once'));
  assert.ok(intent.ok, JSON.stringify(intent));
  assert.equal(intent.preview.route, 'terminal');
  assert.equal(intent.digest, digestOption('allow_once'));
  assert.equal(intent.intent, 'allow_once');
  assert.equal(f.writes().length, 0);
  assert.equal(await f.journal.read(intent.operationId), null);
  const reject = await f.service.approvalIntent(intentOf('reject_once'));
  assert.ok(reject.ok);
  assert.equal(reject.intent, 'reject_once');
  // 見せた宛先の指紋は今と同じ確かめ（同じなら通り、違えば changed_since_shown）
  const same = await f.service.approvalIntent(
    intentOf('allow_once', { target: targetFingerprint({ ...terminalTarget(), agentType: 'claude' }) }),
  );
  assert.ok(same.ok, JSON.stringify(same));
  const changed = await f.service.approvalIntent(intentOf('allow_once', { target: 'f'.repeat(32) }));
  assert.deepEqual(changed, { ok: false, error: 'target_changed', reason: 'changed_since_shown' });
  assert.equal(f.writes().length, 0);
});

test('T-06 approvalIntent（promptId）：決めた error と reason を返し、書き込みの RPC を0回にする', async (t) => {
  const cases: [string, (f: Awaited<ReturnType<typeof fixture>>) => void, unknown, unknown?][] = [
    ['sendEnabled 偽', (f) => f.setEnabled(false), { ok: false, error: 'send_disabled' }],
    [
      '能力なし',
      (f) => {
        f.cap.features.answerKeys = { available: false, missing: ['rpc:terminal.send'], satisfied: [], deferred: [] };
      },
      { ok: false, error: 'unsupported', missing: ['rpc:terminal.send'] },
    ],
    [
      '前面がシェル',
      (f) => f.responses.set('terminal.inspectProcess', ok({ process: { foregroundProcess: 'zsh' } })),
      { ok: false, error: 'not_sendable', reason: 'shell_foreground' },
    ],
    [
      'タブに agentStatus がない',
      (f) => f.setBase(f.tabsWith(undefined)),
      { ok: false, error: 'not_sendable', reason: 'no_session' },
    ],
    [
      'agentStatus が物でない',
      (f) => f.setBase(f.tabsWith('blocked')),
      { ok: false, error: 'not_sendable', reason: 'no_session' },
    ],
    [
      '待っているのに interactivePrompt がない',
      (f) => f.setBase(f.tabsWith(f.status({ interactivePrompt: undefined }))),
      { ok: false, error: 'not_sendable', reason: 'prompt_unverified' },
    ],
    [
      'interactivePrompt が空',
      (f) => f.setBase(f.tabsWith(f.status({ interactivePrompt: '' }))),
      { ok: false, error: 'not_sendable', reason: 'prompt_unverified' },
    ],
    [
      'state が working',
      (f) => f.setBase(f.tabsWith(f.status({ state: 'working' }))),
      { ok: false, error: 'target_changed', reason: 'question_gone' },
    ],
    [
      'promptId が違う（stateStartedAt が違う）',
      (f) => f.setBase(f.tabsWith(f.status({ stateStartedAt: STARTED + 1 }))),
      { ok: false, error: 'target_changed', reason: 'prompt_mismatch' },
    ],
    [
      'JSON でない',
      (f) => f.setBase(f.tabsWith(f.status({ interactivePrompt: '{not json' }))),
      { ok: false, error: 'target_changed', reason: 'prompt_mismatch' },
    ],
    [
      '質問の封筒',
      (f) => f.setBase(f.tabsWith(f.status({ interactivePrompt: JSON.stringify({ questions: [{ question: 'x' }] }) }))),
      { ok: false, error: 'target_changed', reason: 'prompt_mismatch' },
    ],
    [
      'allow_always',
      () => {},
      { ok: false, error: 'invalid_answer', reason: 'unknown_option' },
      intentOf('allow_always', { confirmPersistent: true }),
    ],
    ['2', () => {}, { ok: false, error: 'invalid_answer', reason: 'unknown_option' }, intentOf('2')],
    ['1', () => {}, { ok: false, error: 'invalid_answer', reason: 'unknown_option' }, intentOf('1')],
    ['空の optionId', () => {}, { ok: false, error: 'invalid_answer', reason: 'invalid_option' }, intentOf('')],
    ['数の optionId', () => {}, { ok: false, error: 'invalid_answer', reason: 'invalid_option' }, intentOf(1)],
  ];
  for (const [name, setup, expected, input] of cases) {
    const f = await fixture(t);
    setup(f);
    assert.deepEqual(await f.service.approvalIntent((input ?? intentOf()) as never), expected, name);
    assert.equal(f.writes().length, 0, name);
  }
});

test('T-06 approvalIntent（promptId）：切られた封筒は prompt_unsupported、構造化 Chat は chat_route、知らない種類は agent_keys_unknown', async (t) => {
  const f = await fixture(t);
  const long = JSON.stringify({ approval: { tool: 'T'.repeat(501) } });
  f.setBase(f.tabsWith(f.status({ interactivePrompt: long })));
  assert.deepEqual(
    await f.service.approvalIntent(intentOf('allow_once', { promptId: terminalApprovalId(long, STARTED) })),
    {
      ok: false,
      error: 'not_sendable',
      reason: 'prompt_unsupported',
    },
  );
  assert.deepEqual(await f.service.approvalIntent({ ...intentOf(), agent: CHAT_AGENT }), {
    ok: false,
    error: 'not_sendable',
    reason: 'chat_route',
  });
  const other = await fixture(t, 'opencode');
  assert.deepEqual(await other.service.approvalIntent(intentOf()), {
    ok: false,
    error: 'not_sendable',
    reason: 'agent_keys_unknown',
  });
  assert.equal(f.writes().length + other.writes().length, 0);
});

test('T-06 approvalIntent（promptId）：前に送った記録があれば新しい SendService でも already_sent、記録が読めなければ record_unreadable', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.approvalIntent(intentOf());
  assert.ok(intent.ok);
  const sent = await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'allow_once' });
  assert.ok(sent.ok);
  assert.equal(f.writes().length, 1);
  for (const service of [f.service, f.fresh()]) {
    assert.deepEqual(await service.approvalIntent(intentOf('reject_once')), {
      ok: false,
      error: 'not_sendable',
      reason: 'already_sent',
    });
  }
  const g = await fixture(t);
  (g.deps as SendDeps).journal = {
    ...g.journal,
    appendBefore: (i) => g.journal.appendBefore(i),
    appendAfter: (i) => g.journal.appendAfter(i),
    appendCheck: (i) => g.journal.appendCheck(i),
    appendRefused: (i) => g.journal.appendRefused(i),
    read: (id) => g.journal.read(id),
    hasAnswer: (a, c) => g.journal.hasAnswer(a, c),
    hasApproval: async () => {
      throw new Error('unreadable');
    },
  };
  assert.deepEqual(await g.service.approvalIntent(intentOf()), { ok: false, error: 'record_unreadable' });
  assert.equal(f.writes().length, 1);
  assert.equal(g.writes().length, 0);
});

test('T-07 approvalConfirm（promptId）：before の記録の後にキーを1回だけ送り（claude の allow_once が 1）、同じ票の2回目と後の同じ promptId を送らない', async (t) => {
  const f = await fixture(t);
  const intent = await f.service.approvalIntent(intentOf('allow_once'));
  assert.ok(intent.ok);
  const result = await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'allow_once' });
  assert.deepEqual(result, {
    ok: true,
    operationId: intent.operationId,
    outcome: 'input_accepted',
    detail: { code: 'keys_sent', sentGroups: 1, totalGroups: 1 },
  });
  assert.equal(f.beforeAtSend(), true);
  assert.deepEqual(
    f.writes().map((c) => c.params),
    [
      {
        terminal: 'term_test',
        text: '1',
        enter: false,
        requireWriteSettlement: true,
        client: { id: 'orca-web', type: 'desktop' },
      },
    ],
  );
  assert.deepEqual(await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'allow_once' }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'unknown',
  });
  assert.equal(f.writes().length, 1);
});

test('T-07 approvalConfirm（promptId）：codex の reject_once は ESC を1回だけ送る', async (t) => {
  const f = await fixture(t, 'codex');
  const intent = await f.service.approvalIntent(intentOf('reject_once'));
  assert.ok(intent.ok);
  const result = await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'reject_once' });
  assert.ok(result.ok);
  assert.equal(result.outcome, 'input_accepted');
  assert.deepEqual(
    f.writes().map((c) => (c.params as { text: string }).text),
    [ESC],
  );
});

test('T-07 approvalConfirm（promptId）：送っている間の2回目は busy で送らず、照会は in_progress', async (t) => {
  const f = await fixture(t);
  const first = await f.service.approvalIntent(intentOf());
  const second = await f.service.approvalIntent(intentOf('reject_once'));
  assert.ok(first.ok && second.ok);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.setOnSend(() => gate);
  const running = f.service.approvalConfirm({ ticket: first.ticket, optionId: 'allow_once' });
  while (f.writes().length === 0) await new Promise((r) => setImmediate(r));
  assert.deepEqual(await f.service.approvalConfirm({ ticket: second.ticket, optionId: 'reject_once' }), {
    ok: false,
    error: 'busy',
  });
  assert.deepEqual(await f.service.check(first.operationId, { query: false }), {
    ok: true,
    operationId: first.operationId,
    state: 'in_progress',
  });
  release();
  assert.ok((await running).ok);
  assert.equal(f.writes().length, 1);
});

test('T-07 approvalConfirm（promptId）：確定の前に許可の確認が消えた・変わった・optionId が違う・記録を書けないときは送らない', async (t) => {
  const cases: [string, (f: Awaited<ReturnType<typeof fixture>>) => void, unknown, string?][] = [
    [
      '消えた',
      (f) => f.setBase(f.tabsWith(f.status({ state: 'working' }))),
      { ok: false, error: 'target_changed', reason: 'question_gone' },
    ],
    [
      '変わった',
      (f) => f.setBase(f.tabsWith(f.status({ stateStartedAt: 1 }))),
      { ok: false, error: 'target_changed', reason: 'prompt_mismatch' },
    ],
    [
      'interactivePrompt がない',
      (f) => f.setBase(f.tabsWith(f.status({ interactivePrompt: undefined }))),
      { ok: false, error: 'not_sendable', reason: 'prompt_unverified' },
    ],
    [
      'agentStatus がない',
      (f) => f.setBase(f.tabsWith(undefined)),
      { ok: false, error: 'target_changed', reason: 'no_session' },
    ],
    ['optionId が違う', () => {}, { ok: false, error: 'target_changed', reason: 'answer_changed' }, 'reject_once'],
    [
      'before の記録を書けない',
      (f) => {
        (f.deps as SendDeps).journal = {
          ...f.journal,
          appendBefore: async () => {
            throw new Error('disk');
          },
          appendAfter: (i) => f.journal.appendAfter(i),
          appendCheck: (i) => f.journal.appendCheck(i),
          appendRefused: (i) => f.journal.appendRefused(i),
          read: (id) => f.journal.read(id),
          hasAnswer: (a, c) => f.journal.hasAnswer(a, c),
          hasApproval: (a, p) => f.journal.hasApproval(a, p),
        };
      },
      { ok: false, error: 'record_failed' },
    ],
    ['sendEnabled 偽', (f) => f.setEnabled(false), { ok: false, error: 'send_disabled' }],
  ];
  for (const [name, change, expected, optionId] of cases) {
    const f = await fixture(t);
    const intent = await f.service.approvalIntent(intentOf('allow_once'));
    assert.ok(intent.ok, name);
    change(f);
    assert.deepEqual(
      await f.service.approvalConfirm({ ticket: intent.ticket, optionId: optionId ?? 'allow_once' }),
      expected,
      name,
    );
    assert.equal(f.writes().length, 0, name);
  }
});

test('T-07 approvalConfirm（promptId）：送る直前の読みで許可の確認が消えたか変わったら、terminal.send を呼ばず refused（not_sent）', async (t) => {
  for (const changed of ['working', 'other'] as const) {
    const f = await fixture(t);
    const intent = await f.service.approvalIntent(intentOf());
    assert.ok(intent.ok);
    // 確定の preflight（1回目）は今の確認、送る直前（2回目）は変わった確認。
    f.queueListAll(
      f.tabsWith(f.status()),
      f.tabsWith(changed === 'working' ? f.status({ state: 'working' }) : f.status({ stateStartedAt: 2 })),
    );
    const result = await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'allow_once' });
    assert.deepEqual(result, {
      ok: true,
      operationId: intent.operationId,
      outcome: 'refused',
      detail: { code: 'not_sent', sentGroups: 0, totalGroups: 1 },
    });
    assert.equal(f.writes().length, 0, changed);
    // 送り始めた（記録を書いた）ので、同じ promptId には二度と送らない
    assert.deepEqual(await f.service.approvalIntent(intentOf()), {
      ok: false,
      error: 'not_sendable',
      reason: 'already_sent',
    });
  }
});

test('T-07 approvalConfirm（promptId）：terminal.send が refused・unknown・method_not_found なら送り直さず、後の同じ promptId を already_sent で拒む', async (t) => {
  const cases: [RpcOutcome, unknown][] = [
    [
      ok({ send: { accepted: false, writeSettlement: { outcome: 'refused' } } }),
      { outcome: 'refused', detail: { code: 'not_sent', sentGroups: 0, totalGroups: 1 } },
    ],
    [
      ok({ send: { accepted: true } }),
      { outcome: 'unknown', detail: { code: 'unconfirmed', sentGroups: 0, totalGroups: 1 } },
    ],
    [
      { ok: false, kind: 'timeout', message: 'private' },
      { outcome: 'unknown', detail: { code: 'unconfirmed', sentGroups: 0, totalGroups: 1 } },
    ],
    [
      { ok: false, kind: 'orca-error', code: 'method_not_found', message: 'private' },
      {
        outcome: 'refused',
        detail: { code: 'method_not_found', method: 'terminal.send', sentGroups: 0, totalGroups: 1 },
      },
    ],
  ];
  for (const [outcome, expected] of cases) {
    const f = await fixture(t);
    f.sendQueue.push(outcome);
    const intent = await f.service.approvalIntent(intentOf());
    assert.ok(intent.ok);
    const result = await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'allow_once' });
    assert.deepEqual(result, { ok: true, operationId: intent.operationId, ...(expected as object) });
    assert.equal(f.writes().length, 1);
    // method_not_found はこの runtime の経路を止める（unsupported）。新しい SendService でも記録から already_sent。
    const again = await f.service.approvalIntent(intentOf('reject_once'));
    assert.deepEqual(
      again,
      (expected as { detail: { code: string } }).detail.code === 'method_not_found'
        ? { ok: false, error: 'unsupported', missing: ['rpc:terminal.send'] }
        : { ok: false, error: 'not_sendable', reason: 'already_sent' },
    );
    assert.deepEqual(await f.fresh().approvalIntent(intentOf('reject_once')), {
      ok: false,
      error: 'not_sendable',
      reason: 'already_sent',
    });
    assert.equal(f.writes().length, 1);
  }
});

test('T-07 票の種類を取り違えない：端末の承認の票は送信・質問・構造化 Chat の承認の確定で受けず、端末の流れは他の票を受けない', async (t) => {
  const f = await fixture(t);
  const terminal = async () => {
    const r = await f.service.approvalIntent(intentOf());
    assert.ok(r.ok);
    return r.ticket;
  };
  assert.deepEqual(await f.service.confirm({ ticket: await terminal(), text: 'x' }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'wrong_kind',
  });
  assert.deepEqual(await f.service.answerConfirm({ ticket: await terminal(), answers: [] }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'wrong_kind',
  });
  // 送信の票（terminal）は端末の承認の確定で受けない
  f.responses.set('terminal.agentStatus', ok({ agentStatus: { isRunningAgent: true, status: 'idle' } }));
  const send = await f.service.intent({ agent: TERMINAL_AGENT, text: '仮の文' });
  assert.ok(send.ok, JSON.stringify(send));
  assert.deepEqual(await f.service.approvalConfirm({ ticket: send.ticket, optionId: 'allow_once' }), {
    ok: false,
    error: 'ticket_invalid',
    reason: 'wrong_kind',
  });
  assert.equal(f.writes().length, 0);
});

test('T-07 照会：mode keys の承認の記録は checkTerminalApproval を使い、送り直さない。after のない記録は no_after_record', async (t) => {
  const f = await fixture(t);
  f.sendQueue.push(ok({ send: { accepted: true } }));
  const intent = await f.service.approvalIntent(intentOf());
  assert.ok(intent.ok);
  const result = await f.service.approvalConfirm({ ticket: intent.ticket, optionId: 'allow_once' });
  assert.ok(result.ok && result.outcome === 'unknown');
  const checked = await f.service.check(intent.operationId, { query: true });
  assert.ok(checked.ok && checked.state === 'recorded');
  assert.deepEqual(checked.record.checks.at(-1)?.detail, { code: 'prompt_pending' });
  f.setBase(f.tabsWith(f.status({ state: 'working' })));
  const later = await f.service.check(intent.operationId, { query: true });
  assert.ok(later.ok && later.state === 'recorded');
  assert.deepEqual(later.record.checks.at(-1)?.detail, { code: 'resolved_unverified' });
  assert.equal(f.writes().length, 1);
  // after の行のない記録（送る途中で止まった）は no_after_record
  const g = await fixture(t);
  const intent2 = await g.service.approvalIntent(intentOf());
  assert.ok(intent2.ok);
  (g.deps as SendDeps).journal = {
    ...g.journal,
    appendBefore: (i) => g.journal.appendBefore(i),
    appendAfter: async () => false,
    appendCheck: (i) => g.journal.appendCheck(i),
    appendRefused: (i) => g.journal.appendRefused(i),
    read: (id) => g.journal.read(id),
    hasAnswer: (a, c) => g.journal.hasAnswer(a, c),
    hasApproval: (a, p) => g.journal.hasApproval(a, p),
  };
  const sent = await g.service.approvalConfirm({ ticket: intent2.ticket, optionId: 'allow_once' });
  assert.ok(sent.ok && sent.recordWarning === 'after_record_failed');
  const fresh = new SendJournal(g.sendsDir);
  const record = await fresh.read(intent2.operationId);
  assert.equal(record?.outcome, 'unknown');
  assert.deepEqual(record?.detail, { code: 'no_after_record' });
});

test('T-07 記録の行が optionId・ラベル・キー・道具の名前・要約を持たず、action approval・mode keys・route terminal・promptId・intent・digest・totalGroups 1 を持つ', async (t) => {
  for (const [agentType, optionId] of [
    ['claude', 'allow_once'],
    ['codex', 'reject_once'],
  ] as const) {
    const f = await fixture(t, agentType);
    const intent = await f.service.approvalIntent(intentOf(optionId));
    assert.ok(intent.ok);
    assert.ok((await f.service.approvalConfirm({ ticket: intent.ticket, optionId })).ok);
    // 拒みの行も確かめる
    const refused = await f.service.approvalIntent(intentOf(optionId));
    assert.ok(!refused.ok);
    const raw = await readFile(path.join(f.sendsDir, 'sends.jsonl'), 'utf8');
    for (const forbidden of [
      ESC,
      '\\u001b',
      TOOL,
      SUMMARY,
      'Allow once',
      'Reject',
      '"optionId"',
      '"label"',
      '"text"',
      '"bytes"',
      '"key"',
      '"tool"',
      '"summary"',
    ]) {
      assert.ok(!raw.includes(forbidden), `${agentType} ${forbidden}`);
    }
    const before = raw
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((row) => row.kind === 'before');
    assert.equal(before.action, 'approval');
    assert.equal(before.mode, 'keys');
    assert.equal(before.route, 'terminal');
    assert.equal(before.promptId, PROMPT_ID);
    assert.equal(before.intent, optionId);
    assert.equal(before.digest, digestOption(optionId));
    assert.equal(before.totalGroups, 1);
    assert.equal('prompt' in before, false);
    assert.equal(await f.journal.hasApproval(TERMINAL_AGENT, PROMPT_ID), true);
    assert.equal(await f.journal.hasApproval(TERMINAL_AGENT, terminalApprovalId(PROMPT, 1)), false);
    assert.equal(await f.journal.hasApproval('other-agent', PROMPT_ID), false);
    // 端末の承認の記録は、callId の答えとしては数えない
    assert.equal(await f.journal.hasAnswer(TERMINAL_AGENT, PROMPT_ID), false);
  }
});
