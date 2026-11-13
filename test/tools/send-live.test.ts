import assert from 'node:assert/strict';
import test from 'node:test';
import type { RpcOutcome } from '../../src/orca/rpc.ts';
import { SendRpc } from '../../src/orca/send-gates.ts';
import { type SendDeps, SendService } from '../../src/send/service.ts';
import { parseSendArgs, probeSends, selectSendTargets } from '../../src/tools/send-live.ts';
import { agent, fact, state, worktree } from '../runs/fixture.ts';
import { inventory, terminalTab, terminalTarget } from '../send/fixture.ts';
import { report } from '../state/helpers.ts';

const snapshot = () =>
  state({
    worktrees: [worktree({ id: 'wt-test', path: fact('/fake/send-test'), isMainWorktree: fact(false) })],
    agents: [agent('test-agent', { worktreeId: 'wt-test', terminalHandle: 'term_test' })],
  });

test('handleを全件検査し、0件・3件・重複・不明・複数一致・別worktree・mainでは送信先を返さない', () => {
  assert.throws(() => selectSendTargets(snapshot(), '/fake/send-test', ['term_missing']));
  assert.deepEqual(selectSendTargets(snapshot(), '/fake/send-test', ['term_test']), ['test-agent']);
  for (const handles of [[], ['term_test', 'term_test'], ['term_a', 'term_b', 'term_c']])
    assert.throws(() => selectSendTargets(snapshot(), '/fake/send-test', handles));
  assert.throws(() => selectSendTargets(snapshot(), '/fake/other', ['term_test']));
  const duplicate = snapshot();
  duplicate.agents.push(agent('other', { worktreeId: 'wt-test', terminalHandle: 'term_test' }));
  assert.throws(() => selectSendTargets(duplicate, '/fake/send-test', ['term_test']));
  const main = snapshot();
  const mainWorktree = main.worktrees[0];
  assert.ok(mainWorktree);
  mainWorktree.isMainWorktree = fact(true);
  assert.throws(() => selectSendTargets(main, '/fake/send-test', ['term_test']));
});

function environment() {
  const calls: string[] = [];
  const state = snapshot();
  const target = state.agents[0];
  assert.ok(target);
  target.id = 'tab-test:leaf-test';
  target.agentType = fact('codex');
  target.title = fact('private-title-text');
  const capabilities = report();
  capabilities.runtimeId = 'runtime-test';
  capabilities.features.sendTerminal = { available: true, missing: [], satisfied: [], deferred: [] };
  const rpc = new SendRpc({
    async call<T>(method: string): Promise<RpcOutcome<T>> {
      calls.push(method);
      const results: Record<string, unknown> = {
        'session.tabs.listAll': inventory([terminalTab()]),
        'terminal.agentStatus': { agentStatus: { isRunningAgent: true, status: 'idle' } },
        'terminal.inspectProcess': { process: { foregroundProcess: 'codex' } },
        'terminal.send': { send: { accepted: true, prompt: { provider: 'codex', stages: ['turn_started'] } } },
        'orchestration.requestShow': {
          state: 'completed',
          receipt: { send: { accepted: true, prompt: { provider: 'codex', stages: ['turn_started'] } } },
        },
      };
      assert.ok(Object.hasOwn(results, method), method);
      return { ok: true, runtimeId: 'runtime-test', result: results[method] as T };
    },
  });
  return { calls, state, snapshotSync: () => state, capabilities: async () => capabilities, rpc };
}

test('通常の送信は1回ずつ送り、記録の照会を数え、出力に私的な値を含めない', async () => {
  const env = environment();
  const result = await probeSends(env, { worktree: '/fake/send-test', handles: ['term_test'] });
  assert.ok(result);
  assert.deepEqual(result.scenarios.sent, { count: 1, outcomes: { submitted: 1 }, sendCalls: 1 });
  assert.deepEqual(result.scenarios.recorded, { count: 1 });
  const serialized = JSON.stringify(result);
  for (const secret of [
    '/fake/send-test',
    'term_test',
    'session-terminal-test',
    'orca-web の送信の確かめ',
    'tab-test',
    'private-title-text',
  ])
    assert.equal(serialized.includes(secret), false, secret);
});

test('応答を捨てても送るRPCは1回だけ届き、query付き照会がrequestShowで結果を決める', async () => {
  const env = environment();
  const result = await probeSends(env, { worktree: '/fake/send-test', handles: ['term_test'] });
  assert.deepEqual(result.scenarios.responseLost, {
    count: 1,
    outcomes: { unknown: 1 },
    sendCalls: 1,
    requestShowCalls: 1,
    conclusion: 'submitted',
  });
  assert.equal(env.calls.filter((method) => method === 'terminal.send').length, 2);
  assert.equal(env.calls.filter((method) => method === 'orchestration.requestShow').length, 1);
});

test('票のセッションとptyを書き換えた確定は比較で止まり、送るRPCは0回', async () => {
  const env = environment();
  const result = await probeSends(env, { worktree: '/fake/send-test', handles: ['term_test'] });
  assert.deepEqual(result.scenarios.targetChanged, {
    count: 2,
    reasons: { session_changed: 1, terminal_changed: 1 },
    sendCalls: 0,
  });
  assert.equal(env.calls.filter((method) => method === 'terminal.send').length, 2);
});

test('使い済み・本文変更・停止・期限切れの確定は送るRPCを呼ばず、拒否だけを数える', async () => {
  const env = environment();
  const result = await probeSends(env, { worktree: '/fake/send-test', handles: ['term_test'] });
  assert.deepEqual(result.scenarios.notSent, {
    count: 4,
    reasons: { ticket_invalid: 2, target_changed: 1, send_disabled: 1 },
    sendCalls: 0,
  });
  assert.equal(result.sendCalls, 2);
});

test('2つの宛先はすべて検査してから送り、2つ目が不正なら最初にも送らない', async () => {
  const invalid = environment();
  await assert.rejects(
    probeSends(invalid, { worktree: '/fake/send-test', handles: ['term_test', 'term_missing'] }),
    /invalid_targets/,
  );
  assert.equal(invalid.calls.length, 0);
  const env = environment();
  env.state.agents.push(
    agent('tab-other:leaf-other', { worktreeId: 'wt-test', terminalHandle: 'term_other', agentType: fact('codex') }),
  );
  const rpc = new SendRpc({
    async call<T>(method: string, params: unknown, options?: import('../../src/orca/rpc.ts').RpcCallOptions) {
      if (method === 'session.tabs.listAll')
        return {
          ok: true as const,
          runtimeId: 'runtime-test',
          result: inventory([
            terminalTab(),
            {
              ...terminalTab(),
              id: 'terminal-other',
              parentTabId: 'tab-other',
              leafId: 'leaf-other',
              terminal: 'term_other',
            },
          ]) as T,
        };
      return env.rpc.call<T>(method, params, options);
    },
  });
  const result = await probeSends(
    { ...env, rpc },
    { worktree: '/fake/send-test', handles: ['term_test', 'term_other'] },
  );
  assert.equal(result.agents, 2);
  assert.deepEqual(result.scenarios.sent, { count: 2, outcomes: { submitted: 2 }, sendCalls: 2 });
  assert.equal(result.scenarios.recorded.count, 2);
  assert.equal(result.sendCalls, 3);
});

test('偽のSendServiceの失敗は固定の誤りだけにし、送信を再試行しない', async () => {
  const env = environment();
  let intents = 0;
  await assert.rejects(
    probeSends(env, { worktree: '/fake/send-test', handles: ['term_test'] }, () => ({
      async intent() {
        intents++;
        return { ok: false, error: 'not_sendable', reason: 'private-title-text' };
      },
      async confirm() {
        throw new Error('must not confirm');
      },
      async check() {
        throw new Error('must not check');
      },
    })),
    { message: 'intent_failed' },
  );
  assert.equal(intents, 1);
  assert.equal(env.calls.length, 0);
});

test('CLI引数はworktreeと1〜2個のhandleだけを受け、書く前に誤りを拒む', () => {
  assert.deepEqual(parseSendArgs(['--worktree', '/fake/send-test', '--handle', 'term_test']), {
    worktree: '/fake/send-test',
    handles: ['term_test'],
  });
  for (const args of [
    [],
    ['--worktree', '/fake/send-test'],
    ['--handle', 'term_test'],
    ['--worktree', '/fake/send-test', '--handle', 'a', '--handle', 'b', '--handle', 'c'],
    ['--worktree', '/fake/send-test', '--handle', 'a', '--unexpected'],
  ])
    assert.throws(() => parseSendArgs(args));
});

test('偽のサービスが本文を含む余分な値を返しても集計には出さず、終了後は一時のbefore記録も消える', async () => {
  const env = environment();
  const result = await probeSends(env, { worktree: '/fake/send-test', handles: ['term_test'] }, (deps) => {
    const real = new SendService(deps);
    return {
      intent: (value) => real.intent(value),
      async confirm(value) {
        return { ...(await real.confirm(value)), privateText: 'private-title-text' };
      },
      check: (id, query) => real.check(id, query),
    };
  });
  assert.equal(JSON.stringify(result).includes('private-title-text'), false);
  // 失敗した場合もfinallyで一時の記録を消す。
  let failedDeps: SendDeps | undefined;
  await assert.rejects(
    probeSends(env, { worktree: '/fake/send-test', handles: ['term_test'] }, (deps) => {
      failedDeps = deps;
      return {
        async intent() {
          await deps.journal.appendBefore({
            operationId: 'before-only',
            route: 'terminal',
            target: { ...terminalTarget(), repoName: null, worktreePath: null, branch: null, title: null },
            text: 'private text',
            digest: 'digest',
            generation: { runtimeId: 'runtime-test' },
          });
          return { ok: false, error: 'unreachable' };
        },
        async confirm() {
          throw new Error('must not confirm');
        },
        async check() {
          throw new Error('must not check');
        },
      };
    }),
    /intent_failed/,
  );
  assert.ok(failedDeps);
  assert.equal(await failedDeps.journal.read('before-only'), null);
});

test('偽の照会が送信を混ぜたら件数の不一致で検証を止める', async () => {
  const env = environment();
  await assert.rejects(
    probeSends(env, { worktree: '/fake/send-test', handles: ['term_test'] }, (deps) => {
      const real = new SendService(deps);
      return {
        intent: (value) => real.intent(value),
        confirm: (value) => real.confirm(value),
        async check(id, options) {
          await deps.adapter.sendTerminal(terminalTarget(), 'test', '1234567890123-0123456789abcdef0123456789abcdef');
          return real.check(id, options);
        },
      };
    }),
    /record_missing|query_failed/,
  );
});
