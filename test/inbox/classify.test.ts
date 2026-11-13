import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInbox } from '../../src/inbox/classify.ts';
import type { BuildInboxInput } from '../../src/inbox/model.ts';
import { agent, ci, fact, gate, input, message, pr, repo, STARTED, task, worker, worktree } from './fixture.ts';

function items(value: BuildInboxInput) {
  return buildInbox(value).stages.flatMap((stage) => stage.items);
}

test('T-01: blocked と waiting は理由つきの needs_action になる', () => {
  const result = items(
    input({ agents: [agent('a', { state: fact('blocked') }), agent('b', { state: fact('waiting') })] }),
  );
  assert.deepEqual(
    result.map(({ id, stage, reasons, missing }) => ({ id, stage, reasons, missing })),
    [
      { id: 'agent:a', stage: 'needs_action', reasons: ['blocked'], missing: [] },
      { id: 'agent:b', stage: 'needs_action', reasons: ['waiting'], missing: [] },
    ],
  );
  assert.equal(result[0]?.since, STARTED);
});

test('T-02: no_output は閾値以上だけで、欠けた lastOutputAt は running', () => {
  const value = input();
  value.state.agents = [
    agent('before', { lastOutputAt: fact(new Date(value.now - value.stallMs + 1).toISOString()) }),
    agent('equal', { lastOutputAt: fact(new Date(value.now - value.stallMs).toISOString()) }),
    agent('after', { lastOutputAt: fact(new Date(value.now - value.stallMs - 1).toISOString()) }),
    agent('missing'),
    agent('blocked', { state: fact('blocked'), lastOutputAt: fact(STARTED) }),
  ];
  const result = new Map(items(value).map((item) => [item.id, [item.stage, item.reasons]]));
  assert.deepEqual(result.get('agent:before'), ['running', ['working']]);
  assert.deepEqual(result.get('agent:equal'), ['stalled', ['no_output']]);
  assert.deepEqual(result.get('agent:after'), ['stalled', ['no_output']]);
  assert.deepEqual(result.get('agent:missing'), ['running', ['working']]);
  assert.deepEqual(result.get('agent:blocked'), ['needs_action', ['blocked']]);
});

test('T-02: terminal_ended は done と要対応を除き stalled、欠けた terminal は推測しない', () => {
  const value = input({
    agents: [
      agent('ended', { terminal: fact('exited') }),
      agent('unknown-ended', { state: fact('other'), terminal: fact('closed') }),
      agent('both', { terminal: fact('exited'), lastOutputAt: fact(STARTED) }),
      agent('blocked', { state: fact('blocked'), terminal: fact('exited') }),
      agent('done', { state: fact('done'), terminal: fact('exited') }),
      agent('missing', { terminal: fact(null) }),
      agent('restore', { terminal: fact('awaiting-restore') }),
    ],
  });
  const result = new Map(items(value).map((item) => [item.id, [item.stage, item.reasons]]));
  assert.deepEqual(result.get('agent:ended'), ['stalled', ['terminal_ended']]);
  assert.deepEqual(result.get('agent:unknown-ended'), ['stalled', ['terminal_ended']]);
  assert.deepEqual(result.get('agent:both'), ['stalled', ['no_output', 'terminal_ended']]);
  assert.deepEqual(result.get('agent:blocked'), ['needs_action', ['blocked']]);
  assert.notEqual(result.get('agent:done')?.[0], 'stalled');
  assert.deepEqual(result.get('agent:missing'), ['running', ['working']]);
  assert.deepEqual(result.get('agent:restore'), ['running', ['working']]);
});

test('T-03/T-04: done と sleeping は finished、欠けた状態と未知の状態は missing つき unknown', () => {
  const value = input({
    agents: [
      agent('done', { state: fact('done'), terminal: fact('exited') }),
      agent('sleep', { state: fact(null), terminal: fact('awaiting-restore') }),
      agent('missing', { state: fact(null) }),
      agent('unknown', { state: fact('future-state') }),
      agent('restore-unknown', { state: fact('future-state'), terminal: fact('awaiting-restore') }),
    ],
  });
  const doc = buildInbox(value);
  assert.deepEqual(
    doc.stages.map(({ stage, collapsed }) => [stage, collapsed]),
    [
      ['needs_action', false],
      ['stalled', false],
      ['running', false],
      ['unknown', false],
      ['finished', true],
    ],
  );
  const result = new Map(items(value).map((item) => [item.id, [item.stage, item.reasons, item.missing]]));
  assert.deepEqual(result.get('agent:done'), ['finished', ['done'], []]);
  assert.deepEqual(result.get('agent:sleep'), ['finished', ['sleeping'], []]);
  assert.deepEqual(result.get('agent:missing'), ['unknown', [], ['state_missing']]);
  assert.deepEqual(result.get('agent:unknown'), ['unknown', [], ['state_unknown']]);
  assert.deepEqual(result.get('agent:restore-unknown'), ['unknown', [], ['state_unknown']]);
});

test('T-03/T-05: エージェントの表示項目、Issue の優先とリンク、最後の一言を投影する', () => {
  const value = input({
    agents: [
      agent('a /?', { state: fact('done') }),
      agent('chat', { kind: 'chat-tab', worktreeId: 'wt-display' }),
      agent('untabbed', {
        kind: 'untabbed',
        worktreeId: 'wt-task',
        worker: { dispatchId: 'd', taskId: 'task-a', runId: null },
      }),
      agent('orphan', { worktreeId: 'absent' }),
    ],
    worktrees: [
      worktree({ displayName: fact('iss-99') }),
      worktree({ id: 'wt-display', branch: fact('feature'), displayName: fact('仮の iss-123') }),
      worktree({ id: 'wt-task', branch: fact(null), displayName: fact(null) }),
    ],
    tasks: [task()],
  });
  value.lastWords = new Map([['a /?', `  仮の完了\r\nしました\t${'あ'.repeat(220)}`]]);
  const result = new Map(items(value).map((item) => [item.id, item]));
  const done = result.get('agent:a /?');
  assert.equal(done?.issue, 'iss-00017');
  assert.deepEqual(done?.project, { id: 'repo-a', name: '仮のプロジェクト' });
  assert.equal(done?.agentType, 'codex');
  assert.deepEqual(done?.links, {
    detail: '/embed/agent?id=a%20%2F%3F',
    open: { worktreeId: 'wt-a', agentId: 'a /?' },
    pr: null,
  });
  assert.equal(done?.lastWords, `仮の完了 しました ${'あ'.repeat(190)}`);
  assert.equal(result.get('agent:chat')?.issue, 'iss-00123');
  assert.deepEqual(result.get('agent:chat')?.links.open, { worktreeId: 'wt-display', agentId: 'chat' });
  assert.equal(result.get('agent:untabbed')?.issue, 'iss-00042');
  assert.equal(result.get('agent:untabbed')?.links.open, null);
  assert.equal(result.get('agent:untabbed')?.links.detail, '/embed/agent?id=untabbed');
  assert.equal(result.get('agent:orphan')?.project, null);
  assert.equal(result.get('agent:orphan')?.issue, null);
  assert.equal(result.get('agent:orphan')?.lastWords, null);
});

test('T-01: 未読の質問・判断依頼・門は dispatch を優先し terminal の代替経路でも結ぶ', () => {
  const value = input({
    agents: [
      agent('direct', {
        state: fact('blocked'),
        terminalHandle: 'direct-term',
        worker: { dispatchId: 'dispatch-a', taskId: 'task-a', runId: 'run-a' },
      }),
      agent('fallback', { state: fact(null) }),
      agent('gate-only', { state: fact('done'), terminalHandle: 'gate-term' }),
    ],
    workers: [
      worker(),
      worker({ dispatchId: 'dispatch-b', taskId: 'task-b' }),
      worker({ dispatchId: 'dispatch-g', taskId: 'task-g', terminalHandle: 'gate-term' }),
    ],
  });
  value.mail.messages = [
    message({ id: 'q', subject: '仮'.repeat(250) }),
    message({ id: 'decision', type: 'decision_gate' }),
    message({ id: 'fallback-q', dispatchId: 'dispatch-b' }),
    message({ id: 'other', type: 'status' }),
  ];
  value.mail.gates = [gate(), gate({ id: 'gate-g', taskId: 'task-g' })];
  const result = new Map(items(value).map((item) => [item.id, item]));
  assert.equal(result.size, 3);
  assert.equal(result.get('agent:direct')?.stage, 'needs_action');
  assert.deepEqual(result.get('agent:direct')?.reasons, ['blocked', 'question', 'decision_gate', 'gate']);
  assert.deepEqual(result.get('agent:direct')?.mail, [
    { id: 'q', type: 'question', createdAt: STARTED, subject: '仮'.repeat(200) },
    { id: 'decision', type: 'decision_gate', createdAt: STARTED, subject: '仮の確認事項' },
  ]);
  assert.deepEqual(result.get('agent:fallback')?.reasons, ['question']);
  assert.deepEqual(result.get('agent:fallback')?.missing, []);
  assert.deepEqual(result.get('agent:gate-only')?.reasons, ['gate']);
  assert.equal(result.get('agent:gate-only')?.stage, 'needs_action');
});

test('T-05: 結び付かない質問と門は独立した項目、worker の場所と task の Issue を使う', () => {
  const value = input({ workers: [worker()], tasks: [task()], worktrees: [worktree({ branch: fact(null) })] });
  value.mail.messages = [
    message({ id: 'q', subject: `仮の質問\n${'あ'.repeat(220)}` }),
    message({ id: 'd', type: 'decision_gate', dispatchId: 'absent', taskId: null }),
  ];
  value.mail.gates = [gate(), gate({ id: 'orphan', taskId: null })];
  const result = new Map(items(value).map((item) => [item.id, item]));
  assert.equal(result.size, 4);
  const question = result.get('question:q');
  assert.equal(question?.kind, 'question');
  assert.equal(question?.stage, 'needs_action');
  assert.deepEqual(question?.reasons, ['question']);
  assert.equal(question?.lastWords, `仮の質問 ${'あ'.repeat(195)}`);
  assert.equal(question?.since, STARTED);
  assert.deepEqual(question?.project, { id: 'repo-a', name: '仮のプロジェクト' });
  assert.equal(question?.worktreeId, 'wt-a');
  assert.equal(question?.issue, 'iss-00042');
  assert.deepEqual(question?.links, { detail: null, open: null, pr: null });
  assert.deepEqual(question?.missing, []);
  assert.equal(question?.mail[0]?.subject?.length, 200);
  assert.equal(result.get('question:d')?.kind, 'question');
  assert.deepEqual(result.get('question:d')?.reasons, ['decision_gate']);
  assert.equal(result.get('question:d')?.project, null);
  assert.equal(result.get('question:d')?.worktreeId, null);
  assert.equal(result.get('gate:gate-a')?.kind, 'gate');
  assert.equal(result.get('gate:gate-a')?.stage, 'needs_action');
  assert.deepEqual(result.get('gate:gate-a')?.reasons, ['gate']);
  assert.equal(result.get('gate:gate-a')?.lastWords, '仮の判断の門');
  assert.equal(result.get('gate:gate-a')?.worktreeId, 'wt-a');
  assert.equal(result.get('gate:gate-a')?.issue, 'iss-00042');
  assert.equal(result.get('gate:orphan')?.worktreeId, null);
});

test('T-02: 開いた PR の CI 失敗はエージェントや成功 worker によらず PR だけを stalled にする', () => {
  for (const state of ['working', 'blocked', 'waiting', 'done', null]) {
    for (const workerState of ['succeeded', 'working', null]) {
      const value = input({
        agents: [agent('a', { state: fact(state) })],
        workers: workerState === null ? [] : [worker({ state: fact(workerState) })],
        worktrees: [worktree({ pr: pr(), ci: ci() })],
      });
      const result = items(value);
      const item = result.find((item) => item.kind === 'pr');
      assert.equal(item?.stage, 'stalled');
      assert.deepEqual(item?.reasons, workerState === 'succeeded' ? ['ci_failed', 'merge_pending'] : ['ci_failed']);
      assert.equal(item?.id, 'pr:wt-a');
      assert.equal(item?.lastWords, '仮の PR');
      assert.equal(item?.since, null);
      assert.equal(item?.links.pr, 'https://github.com/example/demo/pull/17');
      assert.equal(result.filter((item) => item.kind === 'pr').length, 1);
      assert.equal(result.find((item) => item.kind === 'agent')?.reasons.includes('ci_failed'), false);
    }
  }
});

test('T-05: 成功 worker の open PR は merge_pending、PR の Fact が読めなければ unknown', () => {
  for (const ciValue of [ci('success'), ci('pending'), fact(null)]) {
    const value = input({
      workers: [worker({ state: fact('succeeded') }), worker({ dispatchId: 'd2', state: fact('succeeded') })],
      worktrees: [worktree({ pr: pr(), ci: ciValue })],
    });
    const result = items(value);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.stage, 'needs_action');
    assert.deepEqual(result[0]?.reasons, ['merge_pending']);
    assert.deepEqual(result[0]?.missing, []);
  }
  for (const missing of [
    'source-failed',
    'source-unavailable',
    'not-linked',
    'not-fetched',
    'no-source',
    'invalid-value',
  ] as const) {
    const value = input({
      workers: [worker({ state: fact('succeeded') })],
      worktrees: [worktree({ pr: fact(null, missing) })],
    });
    const result = items(value);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.stage, 'unknown');
    assert.deepEqual(result[0]?.reasons, []);
    assert.deepEqual(result[0]?.missing, ['pr_state_missing']);
    assert.equal(result[0]?.lastWords, null);
    assert.equal(result[0]?.links.pr, null);
  }
});

test('T-05: PR なし・merged・closed、成功 worker のない非失敗 PR は項目を作らない', () => {
  for (const prValue of [fact(null), pr('merged'), pr('closed')]) {
    assert.deepEqual(
      items(
        input({
          worktrees: [worktree({ pr: prValue, ci: ci() })],
          workers: [worker({ state: fact('succeeded') })],
        }),
      ),
      [],
    );
  }
  for (const prValue of [pr(), fact(null, 'source-failed')]) {
    assert.deepEqual(items(input({ worktrees: [worktree({ pr: prValue })] })), []);
    assert.deepEqual(
      items(
        input({
          worktrees: [worktree({ pr: prValue })],
          workers: [worker({ state: fact('succeeded'), worktreeId: fact('other') })],
        }),
      ),
      [],
    );
  }
});

test('T-05: PR のリンクは https の URL だけを出す', () => {
  for (const url of ['http://example.test/pr', 'javascript:alert(1)', 'https://', 'https:// bad']) {
    const result = items(input({ worktrees: [worktree({ pr: pr('open', url), ci: ci() })] }));
    assert.equal(result[0]?.links.pr, null);
  }
});

test('T-04/T-05: worker_done は同じ URL の PR に重ね、どの PR とも合わない URL だけ unknown にする', () => {
  const value = input({
    worktrees: [
      worktree({ pr: pr(), ci: ci() }),
      worktree({ id: 'closed', pr: pr('closed', 'https://github.com/example/demo/pull/18') }),
    ],
    workers: [worker({ state: fact('succeeded') })],
  });
  value.mail.messages = [
    message({ id: 'matched', type: 'worker_done', prUrl: 'https://github.com/example/demo/pull/17' }),
    message({ id: 'matched-2', type: 'worker_done', prUrl: 'https://github.com/example/demo/pull/17' }),
    message({ id: 'closed', type: 'worker_done', prUrl: 'https://github.com/example/demo/pull/18' }),
    message({ id: 'unknown', type: 'worker_done', prUrl: 'https://github.com/example/demo/pull/99' }),
    message({
      id: 'orphan',
      type: 'worker_done',
      dispatchId: null,
      taskId: null,
      prUrl: 'https://github.com/example/demo/pull/100',
    }),
  ];
  const result = new Map(items(value).map((item) => [item.id, item]));
  assert.equal(result.size, 3);
  assert.deepEqual(
    result.get('pr:wt-a')?.mail.map((message) => message.id),
    ['matched', 'matched-2'],
  );
  const unknown = result.get('pr-mail:unknown');
  assert.equal(unknown?.kind, 'pr');
  assert.equal(unknown?.stage, 'unknown');
  assert.deepEqual(unknown?.missing, ['pr_state_missing']);
  assert.deepEqual(unknown?.reasons, []);
  assert.equal(unknown?.worktreeId, 'wt-a');
  assert.deepEqual(unknown?.project, { id: 'repo-a', name: '仮のプロジェクト' });
  assert.equal(unknown?.lastWords, null);
  assert.equal(unknown?.since, null);
  assert.equal(unknown?.links.pr, 'https://github.com/example/demo/pull/99');
  assert.equal(unknown?.mail[0]?.id, 'unknown');
  assert.equal(result.get('pr-mail:orphan')?.worktreeId, null);
  assert.equal(result.get('pr-mail:orphan')?.project, null);
});

test('T-05: プロジェクトを絞っても projects は全項目の件数を名前順で返す', () => {
  const value = input({
    repos: [repo('repo-a', 'Zeta'), repo('repo-b', 'Alpha')],
    worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b', pr: pr(), ci: ci() })],
    agents: [agent(), agent('b', { worktreeId: 'wt-b' }), agent('orphan', { worktreeId: 'absent' })],
    workers: [worker()],
  });
  value.mail.gates = [gate({ taskId: null })];
  const projects = [
    { id: 'repo-b', name: 'Alpha', count: 2 },
    { id: 'repo-a', name: 'Zeta', count: 1 },
  ];
  assert.deepEqual(buildInbox(value).projects, projects);
  assert.equal(items(value).length, 5);
  value.project = 'repo-b';
  assert.deepEqual(buildInbox(value).projects, projects);
  assert.deepEqual(
    items(value)
      .map((item) => item.id)
      .sort(),
    ['agent:b', 'pr:wt-b'],
  );
  value.project = 'absent';
  assert.deepEqual(items(value), []);
  assert.deepEqual(buildInbox(value).projects, projects);
});

test('T-05: 段ごとの時刻の向き、null は最後、同時刻は id の順に並ぶ', () => {
  for (const [state, stage, expected] of [
    ['blocked', 'needs_action', ['old', 'a', 'z', 'new', 'null-a', 'null-z']],
    ['working', 'running', ['new', 'a', 'z', 'old', 'null-a', 'null-z']],
    ['done', 'finished', ['new', 'a', 'z', 'old', 'null-a', 'null-z']],
    ['unrecognized', 'unknown', ['old', 'a', 'z', 'new', 'null-a', 'null-z']],
    ['ended', 'stalled', ['old', 'a', 'z', 'new', 'null-a', 'null-z']],
  ] as const) {
    const agents = [
      ['null-z', null],
      ['z', STARTED],
      ['new', '2026-01-02T11:30:00.000Z'],
      ['null-a', null],
      ['old', '2026-01-02T10:00:00.000Z'],
      ['a', STARTED],
    ].map(([id, since]) =>
      agent(id ?? '', {
        state: fact(state),
        stateStartedAt: fact(since ?? null),
        terminal: fact(state === 'ended' ? 'exited' : 'attached'),
      }),
    );
    const doc = buildInbox(input({ agents }));
    assert.deepEqual(
      doc.stages.find((entry) => entry.stage === stage)?.items.map((item) => item.id),
      expected.map((id) => `agent:${id}`),
    );
  }
});

test('T-05: 鮮度は取得元ごとの成功時刻と error を保ち、mail 未成功を空の成功にしない', () => {
  const value = input();
  value.state.sources.workers = {
    fetchedAt: STARTED,
    lastSuccessAt: '2026-01-01T00:00:00.000Z',
    stale: true,
    truncated: true,
    error: { kind: 'unavailable', message: '仮の取得失敗' },
  };
  value.state.stale = true;
  value.state.connection = { state: 'unreachable', reason: '仮の接続失敗', checkedAt: STARTED };
  value.mail = {
    messages: [],
    gates: [],
    fetchedAt: STARTED,
    lastSuccessAt: null,
    stale: true,
    error: { kind: 'runs-unavailable' },
    runsRead: 0,
    runsFailed: 0,
  };
  const doc = buildInbox(value);
  assert.equal(doc.schema, 'orca-web.inbox/v1');
  assert.equal(doc.generatedAt, '2026-01-02T12:00:00.000Z');
  assert.equal(doc.stallMinutes, 30);
  assert.equal(doc.stale, true);
  assert.deepEqual(doc.connection, { state: 'unreachable', reason: '仮の接続失敗', checkedAt: STARTED });
  assert.equal(doc.sources.state.stale, true);
  assert.deepEqual(doc.sources.state.sources.workers, {
    lastSuccessAt: '2026-01-01T00:00:00.000Z',
    stale: true,
    error: { kind: 'unavailable', message: '仮の取得失敗' },
  });
  assert.deepEqual(doc.sources.state.sources.repos, { lastSuccessAt: STARTED, stale: false, error: null });
  assert.deepEqual(Object.keys(doc.sources.state.sources).sort(), Object.keys(value.state.sources).sort());
  assert.deepEqual(doc.sources.mail, {
    fetchedAt: STARTED,
    lastSuccessAt: null,
    stale: true,
    error: { kind: 'runs-unavailable' },
    runsRead: 0,
    runsFailed: 0,
  });
  for (const stateStale of [false, true]) {
    for (const mailStale of [false, true]) {
      value.state.stale = stateStale;
      value.mail.stale = mailStale;
      assert.equal(buildInbox(value).stale, stateStale || mailStale);
    }
  }
});

test('T-04/T-05: PR URL のない worker_done は項目もエージェントの理由も増やさない', () => {
  const value = input({ agents: [agent('a')], workers: [worker({ state: fact('succeeded') })] });
  value.mail.messages = [message({ type: 'worker_done', outcome: 'succeeded', prUrl: null })];
  const result = items(value);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.kind, 'agent');
  assert.equal(result[0]?.stage, 'running');
  assert.deepEqual(result[0]?.reasons, ['working']);
  assert.deepEqual(result[0]?.mail, []);
});

test('T-05: エージェントの worker リンクがなくても端末で結んだ task の Issue を使う', () => {
  const value = input({
    agents: [agent('a'), agent('no-terminal', { terminalHandle: null })],
    worktrees: [worktree({ branch: fact('feature'), displayName: fact('仮の作業') })],
    workers: [worker(), worker({ dispatchId: 'null-terminal', terminalHandle: null })],
    tasks: [task()],
  });
  const result = new Map(items(value).map((item) => [item.id, item]));
  assert.equal(result.get('agent:a')?.issue, 'iss-00042');
  assert.equal(result.get('agent:no-terminal')?.issue, null);
});

test('T-01/T-05: null の結び付け鍵を共有していても無関係な質問や門を結ばない', () => {
  const value = input({
    agents: [agent('a', { terminalHandle: null })],
    workers: [worker({ terminalHandle: null, taskId: null })],
  });
  value.mail.messages = [message({ dispatchId: null, taskId: null }), message({ id: 'with-dispatch' })];
  value.mail.gates = [gate({ taskId: null })];
  const result = new Map(items(value).map((item) => [item.id, item]));
  assert.equal(result.size, 4);
  assert.equal(result.get('agent:a')?.stage, 'running');
  assert.deepEqual(result.get('agent:a')?.mail, []);
  assert.equal(result.get('question:mail-a')?.worktreeId, null);
  assert.equal(result.get('question:with-dispatch')?.worktreeId, 'wt-a');
  assert.equal(result.get('gate:gate-a')?.worktreeId, null);
});

test('T-05: 同じ入力は同じ結果となり、並び替えや文字の切り詰めは入力を変えない', () => {
  const value = input({
    agents: [agent('z', { state: fact('done') }), agent('a')],
    workers: [worker()],
    worktrees: [worktree({ pr: pr(), ci: ci() })],
  });
  value.mail.messages = [message({ subject: '仮'.repeat(250) })];
  value.mail.gates = [gate()];
  value.lastWords = new Map([['z', '仮の完了\n確認済み']]);
  const before = structuredClone(value);
  assert.deepEqual(buildInbox(value), buildInbox(value));
  assert.deepEqual(value, before);
});
