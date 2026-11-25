import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApexList } from '../../src/apex/build.ts';
import { ApexVerdictMemo } from '../../src/apex/memo.ts';
import type { ApexItem, ApexListDocument } from '../../src/apex/model.ts';
import { BundleOwners } from '../../src/apex/owners.ts';
import type { AgentState, StateDocument } from '../../src/state/model.ts';
import { agent, ci, fact, input, NOW, pr, repo, worktree } from '../inbox/fixture.ts';
import { type DispatchSpec, type Orchestration, orchestration, type TaskSpec, tabbedWorker } from './fixture.ts';

const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

interface Case {
  agents?: AgentState[];
  tasks?: TaskSpec[];
  dispatches?: DispatchSpec[];
  runs?: Record<string, number | null>;
  patch?: Partial<StateDocument>;
  stale?: ('tasks' | 'workers')[];
  memo?: ApexVerdictMemo | null;
  project?: string | null;
}

const coordinator = (patch: Partial<AgentState> = {}) =>
  agent('coord', { paneKey: 'pane-c', state: fact('done'), stateStartedAt: fact(ago(3600)), ...patch });

function run(c: Case, o: Orchestration = orchestration(c)): ApexListDocument {
  const base = input({ agents: c.agents ?? [coordinator()], tasks: o.tasks, workers: o.workers, ...c.patch }).state;
  const sources = { ...base.sources };
  for (const name of c.stale ?? []) sources[name] = { ...sources[name], stale: true };
  return buildApexList({
    state: { ...base, sources },
    now: NOW,
    project: c.project ?? null,
    extras: o.extras,
    owners: new BundleOwners(),
    memo: c.memo ?? null,
  });
}

function apex(result: ApexListDocument, id = 'coord'): ApexItem {
  const found = result.items.find((entry) => entry.id === id);
  assert.ok(found, `${id} is an apex`);
  return found;
}

const askCase = (createdSecondsAgo: number, attention = ['input']): Case => ({
  tasks: [{ id: 't-root', paneKey: 'pane-c', createdAt: ago(createdSecondsAgo) }],
  dispatches: [{ id: 'd1', task: 't-root', state: 'blocked', attention }],
});

test('T-06: 未回答の ask の Dispatch と done の頂点で、89 秒は作業中（grace）、90 秒で needs_action（question）', () => {
  const early = apex(run(askCase(89)));
  assert.equal(early.status, 'working');
  assert.ok(early.reasons.includes('grace'));
  const late = apex(run(askCase(90)));
  assert.equal(late.status, 'needs_action');
  assert.ok(late.reasons.includes('question'));
});

test('T-06: gate（approval）は頂点が monitoring でも 90 秒で decision。ask は monitoring の間は作業中', () => {
  const monitoring = { agents: [coordinator({ state: fact('working'), workingMode: fact('monitoring') })] };
  const gate = apex(run({ ...askCase(90, ['approval']), ...monitoring }));
  assert.equal(gate.status, 'needs_action');
  assert.ok(gate.reasons.includes('decision'));
  const ask = apex(run({ ...askCase(90, ['input']), ...monitoring }));
  assert.equal(ask.status, 'working');
  assert.ok(!ask.reasons.includes('question'));
  const working = apex(run({ ...askCase(90, ['approval']), agents: [coordinator({ state: fact('working') })] }));
  assert.ok(!working.reasons.includes('decision'), 'monitoring でない working は gate を鳴らさない');
});

test('T-06: A3 の起点は頂点の stateStartedAt と task の createdAt の読めるものの最大。どちらも読めなければ猶予なし', () => {
  const recentApex = apex(run({ ...askCase(600), agents: [coordinator({ stateStartedAt: fact(ago(30)) })] }));
  assert.ok(recentApex.reasons.includes('grace'));
  const none = apex(
    run({
      tasks: [{ id: 't-root', paneKey: 'pane-c' }],
      dispatches: [{ id: 'd1', task: 't-root', attention: ['input'] }],
      agents: [coordinator({ stateStartedAt: fact(null) })],
    }),
  );
  assert.ok(none.reasons.includes('question'));
});

const liveCase = (patch: Partial<AgentState> = {}): Case => ({
  agents: [coordinator(patch)],
  tasks: [{ id: 't-root', paneKey: 'pane-c' }],
  dispatches: [{ id: 'd1', task: 't-root', state: 'working' }],
});

test('T-07: 生きた Dispatch があり誰も動いていない状態が 90 秒続くと stalled、89 秒は grace', () => {
  const late = apex(run(liveCase({ stateStartedAt: fact(ago(90)) })));
  assert.equal(late.status, 'needs_action');
  assert.ok(late.reasons.includes('stalled'));
  const early = apex(run(liveCase({ stateStartedAt: fact(ago(89)) })));
  assert.equal(early.status, 'working');
  assert.deepEqual(early.reasons, ['live_work', 'grace']);
  const unreadable = apex(run(liveCase({ stateStartedAt: fact(null) })));
  assert.ok(!unreadable.reasons.includes('stalled'), '起点が読めなければ当てない');
  const busy = apex(run(liveCase({ state: fact('working') })));
  assert.deepEqual(busy.reasons, ['working', 'live_work']);
});

test('T-07: 頂点の terminal が awaiting-restore で生きた仕事があれば apex_closed。生きた仕事がなければ眠っている', () => {
  const closed = apex(run(liveCase({ terminal: fact('awaiting-restore'), state: fact('working') })));
  assert.equal(closed.status, 'needs_action');
  assert.ok(closed.reasons.includes('apex_closed'));
  const idle = apex(
    run({
      agents: [coordinator({ terminal: fact('awaiting-restore') })],
      tasks: [{ id: 't-root', paneKey: 'pane-c' }],
      dispatches: [{ id: 'd1', task: 't-root', state: 'succeeded' }],
    }),
  );
  assert.equal(idle.status, 'done');
  assert.equal(idle.group, 'sleeping');
});

test('T-14: A5 は構造化 Chat の頂点に当たらない', () => {
  const chat = agent('chat', {
    kind: 'chat-tab',
    paneKey: 'pane-chat',
    terminal: fact('awaiting-restore'),
    state: fact('working'),
  });
  const owners = new BundleOwners();
  owners.observe('run-a#?', 'chat', NOW);
  const o = orchestration({ tasks: [{ id: 't-root' }], dispatches: [{ id: 'd1', task: 't-root' }] });
  const result = buildApexList({
    state: input({ agents: [chat], tasks: o.tasks, workers: o.workers }).state,
    now: NOW,
    project: null,
    extras: o.extras,
    owners,
  });
  assert.ok(!apex(result, 'chat').reasons.includes('apex_closed'));
  assert.equal(apex(result, 'chat').status, 'working');
});

const failCase = (completedSecondsAgo: number | null, state = 'failed', apexStart: string | null = ago(600)): Case => ({
  agents: [coordinator({ stateStartedAt: fact(apexStart) })],
  tasks: [
    { id: 't-root', paneKey: 'pane-c', status: 'completed' },
    {
      id: 't-1',
      parent: 't-root',
      status: 'failed',
      completedAt: completedSecondsAgo === null ? null : ago(completedSecondsAgo),
    },
  ],
  dispatches: [{ id: 'd1', task: 't-1', state }],
});

test('T-08: 頂点の stateStartedAt より後の failed は 90 秒で failed、前の failed は当たらない', () => {
  const late = apex(run(failCase(90)));
  assert.equal(late.status, 'needs_action');
  assert.ok(late.reasons.includes('failed'));
  const early = apex(run(failCase(89)));
  assert.equal(early.status, 'working');
  assert.ok(early.reasons.includes('grace'));
  const before = apex(run(failCase(700)));
  assert.equal(before.status, 'done');
});

test('T-08: dispatchStatus が failed でも workerState が stopped なら当たらない', () => {
  const o = orchestration(failCase(90, 'stopped'));
  const workers = o.workers.map((w) => ({ ...w, dispatchStatus: fact('failed') }));
  const result = run(failCase(90, 'stopped'), { ...o, workers });
  assert.equal(apex(result).status, 'done');
});

test('T-14: A6 は completedAt か頂点の stateStartedAt が null なら当たらず、task に2つの Dispatch があれば最後のものだけを見る', () => {
  assert.equal(apex(run(failCase(null))).status, 'done');
  assert.equal(apex(run(failCase(90, 'failed', null))).status, 'done');
  const retried = failCase(90);
  retried.dispatches = [
    { id: 'd1', task: 't-1', state: 'failed' },
    { id: 'd2', task: 't-1', state: 'succeeded' },
  ];
  assert.ok(!apex(run(retried)).reasons.includes('failed'));
  retried.dispatches = [
    { id: 'd2', task: 't-1', state: 'succeeded' },
    { id: 'd1', task: 't-1', state: 'failed' },
  ];
  assert.ok(apex(run(retried)).reasons.includes('failed'));
});

test('T-09: tasks か workers が stale なら A3〜A6 を新しく判定しない（A1・A2 は当たる）。memo がない頂点には当たらない', () => {
  for (const stale of [['tasks'], ['workers']] as const) {
    const quiet = apex(run({ ...askCase(600), stale: [...stale] }));
    assert.ok(!quiet.reasons.includes('question'), stale[0]);
    const blocked = apex(
      run({ ...askCase(600), stale: [...stale], agents: [coordinator({ state: fact('blocked') })] }),
    );
    assert.equal(blocked.status, 'needs_action');
    assert.ok(blocked.reasons.includes('apex_blocked'));
  }
});

test('T-14: 鮮度が偽になった直後、A6・A3 で needs_action だった頂点は memo で needs_action のまま。F が真に戻ると新しく判定する', () => {
  const memo = new ApexVerdictMemo();
  const failed = failCase(600 - 1);
  failed.agents = [coordinator({ stateStartedAt: fact(ago(600)) })];
  assert.ok(apex(run({ ...failed, memo })).reasons.includes('failed'));
  const stale = apex(run({ ...askCase(10), stale: ['workers'], memo }));
  assert.equal(stale.status, 'needs_action');
  assert.ok(stale.reasons.includes('failed'));
  const ask = apex(run({ ...askCase(600), memo }));
  assert.ok(ask.reasons.includes('question'));
  assert.ok(!ask.reasons.includes('failed'), 'F が真なら新しく判定する');
  const staleAgain = apex(run({ tasks: [{ id: 't-root', paneKey: 'pane-c' }], stale: ['tasks'], memo }));
  assert.equal(staleAgain.status, 'needs_action');
  assert.deepEqual(staleAgain.reasons, ['question']);
});

test('T-14: ?project=A の判定の後に F が偽になっても、B の頂点の memo が残り needs_action のまま', () => {
  const memo = new ApexVerdictMemo();
  const two: Case = {
    agents: [coordinator({ worktreeId: 'wt-b' }), agent('other', { paneKey: 'pane-o', state: fact('done') })],
    tasks: [{ id: 't-root', paneKey: 'pane-c', createdAt: ago(600) }],
    dispatches: [{ id: 'd1', task: 't-root', state: 'blocked', attention: ['input'] }],
    patch: {
      repos: [repo('repo-a'), repo('repo-b', '仮の別')],
      worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b' })],
    },
    memo,
  };
  const onlyA = run({ ...two, project: 'repo-a' });
  assert.deepEqual(
    onlyA.items.map((item) => item.id),
    ['other'],
  );
  const staleB = run({ ...two, project: 'repo-b', stale: ['tasks'] });
  assert.equal(apex(staleB).status, 'needs_action');
  assert.ok(apex(staleB).reasons.includes('question'));
});

test('T-10: ready・blocked の task だけの束の done の頂点は完了で remaining_tasks が付く', () => {
  const item = apex(
    run({
      tasks: [
        { id: 't-root', paneKey: 'pane-c', status: 'completed', completedAt: ago(7200) },
        { id: 't-1', parent: 't-root', status: 'ready' },
        { id: 't-2', parent: 't-root', status: 'blocked' },
      ],
    }),
  );
  assert.equal(item.status, 'done');
  assert.deepEqual(item.badges, [{ kind: 'remaining_tasks', count: 2 }]);
});

test('T-10: PR open・CI failure で ci_failed、CI success か未設定で merge_pending、failed の Dispatch で failed_members', () => {
  const withPr = (status: string | null): Case => ({
    patch: {
      worktrees: [worktree({ pr: pr('open'), ci: status === null ? fact(null) : ci(status) })],
    },
  });
  assert.deepEqual(apex(run(withPr('failure'))).badges, [{ kind: 'ci_failed', count: 1 }]);
  assert.deepEqual(apex(run(withPr('success'))).badges, [{ kind: 'merge_pending', count: 1 }]);
  assert.deepEqual(apex(run(withPr(null))).badges, [{ kind: 'merge_pending', count: 1 }]);
  assert.deepEqual(apex(run(withPr('pending'))).badges, []);
  const failed = apex(run(failCase(700)));
  assert.deepEqual(failed.badges, [{ kind: 'failed_members', count: 1 }]);
  const working = apex(run({ ...withPr('failure'), agents: [coordinator({ state: fact('working') })] }));
  assert.deepEqual(working.badges, [], '完了でない頂点には付けない');
});

test('T-10: メンバーの worktree の PR も見て、同じ worktree は1回', () => {
  const kid = tabbedWorker('kid', 'd1', 't-1', {
    parentPaneKey: fact('pane-c'),
    state: fact('done'),
    worktreeId: 'wt-k',
  });
  const kid2 = tabbedWorker('kid2', 'd2', 't-1', {
    parentPaneKey: fact('pane-c'),
    state: fact('done'),
    worktreeId: 'wt-k',
  });
  const item = apex(
    run({
      agents: [coordinator(), kid, kid2],
      patch: { worktrees: [worktree(), worktree({ id: 'wt-k', pr: pr('open'), ci: ci('failure') })] },
    }),
  );
  assert.deepEqual(item.badges, [{ kind: 'ci_failed', count: 1 }]);
});

test('T-10: 終わった Dispatch だけの結べない束は unlinked に出ず、生きた Dispatch か問いのある結べない束は出る', () => {
  const result = run({
    tasks: [
      { id: 'a-root', run: 'run-a' },
      { id: 'b-root', run: 'run-b' },
      { id: 'c-root', run: 'run-c' },
    ],
    dispatches: [
      { id: 'da', task: 'a-root', run: 'run-a', state: 'succeeded' },
      { id: 'db', task: 'b-root', run: 'run-b', state: 'working' },
      { id: 'dc', task: 'c-root', run: 'run-c', state: 'succeeded', attention: ['approval'] },
    ],
    patch: {
      runs: [
        {
          id: 'run-b',
          coordinatorHandle: null,
          activeCoordinatorHandle: null,
          coordinatorResolvedBy: null,
          coordinatorWorktreeId: fact(null),
          title: fact('仮の目的'.repeat(60)),
        },
      ],
    },
  });
  assert.deepEqual(result.unlinked, [
    {
      id: 'run-b#?',
      kind: 'bundle',
      runId: 'run-b',
      objective: '仮の目的'.repeat(60).slice(0, 200),
      generation: null,
      live: 1,
      questions: 0,
    },
    { id: 'run-c#?', kind: 'bundle', runId: 'run-c', objective: null, generation: null, live: 0, questions: 1 },
  ]);
});

test('T-14: ?project= で結べない束は Dispatch の worktree の repo で絞られる', () => {
  const c: Case = {
    tasks: [{ id: 'b-root', run: 'run-b' }],
    dispatches: [{ id: 'db', task: 'b-root', run: 'run-b', worktree: 'wt-b' }],
    patch: {
      repos: [repo('repo-a'), repo('repo-b', '仮の別')],
      worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b' })],
    },
  };
  assert.deepEqual(
    run({ ...c, project: 'repo-b' }).unlinked.map((item) => item.id),
    ['run-b#?'],
  );
  assert.deepEqual(run({ ...c, project: 'repo-a' }).unlinked, []);
});

test('T-14: 親のタブが消えた worker 持ちのエージェントが束の頂点のメンバーになり、working なら A4 が当たらない', () => {
  const orphan = tabbedWorker('orphan', 'd1', 't-root', {
    parentPaneKey: fact('gone'),
    state: fact('working'),
    stateStartedAt: fact(ago(600)),
  });
  const item = apex(
    run({
      agents: [coordinator(), orphan],
      tasks: [{ id: 't-root', paneKey: 'pane-c' }],
      dispatches: [{ id: 'd1', task: 't-root', state: 'working' }],
    }),
  );
  assert.deepEqual(
    item.members.map((member) => member.id),
    ['orphan'],
  );
  assert.ok(!item.reasons.includes('stalled'));
  assert.equal(item.status, 'working');
});

test('A4 は問いを待つ Dispatch を止まった仕事に数えない（A3 が扱う）。問いのない生きた Dispatch があれば当たる', () => {
  const c = askCase(10);
  assert.ok(!apex(run(c)).reasons.includes('stalled'));
  c.dispatches = [...(c.dispatches ?? []), { id: 'd2', task: 't-root', state: 'working' }];
  assert.ok(apex(run(c)).reasons.includes('stalled'));
});

test('cp1：A6 は、Run の今の世代でなく生きた Dispatch のない古い世代の束の失敗では鳴らない（札には使う）', () => {
  const x = coordinator();
  const y = agent('y', { paneKey: 'pane-y', state: fact('working') });
  const c: Case = {
    agents: [x, y],
    runs: { 'run-a': 2 },
    tasks: [
      { id: 't-root-1', paneKey: 'pane-c', generation: 1, status: 'completed' },
      { id: 't-1', parent: 't-root-1', generation: 1, status: 'failed', completedAt: ago(600) },
      { id: 't-root-2', paneKey: 'pane-y', generation: 2 },
    ],
    dispatches: [{ id: 'd1', task: 't-1', state: 'failed' }],
    patch: {},
  };
  const old = apex(run({ ...c, agents: [coordinator({ stateStartedAt: fact(ago(3600)) }), y] }));
  assert.equal(old.status, 'done');
  assert.ok(!old.reasons.includes('failed'));
  assert.deepEqual(old.badges, [{ kind: 'failed_members', count: 1 }]);
  // 今の世代の束なら鳴る。
  const current = apex(run({ ...c, runs: { 'run-a': 1 } }));
  assert.ok(current.reasons.includes('failed'));
  // 古い世代でも、束に生きた Dispatch があれば見る（タブのある作業者の Dispatch は付け替えない）。
  const kid = tabbedWorker('kid', 'd-live', 't-root-1', { parentPaneKey: fact('pane-c'), state: fact('working') });
  const live = apex(
    run({
      ...c,
      agents: [coordinator(), y, kid],
      dispatches: [
        { id: 'd-live', task: 't-root-1', state: 'working' },
        { id: 'd1', task: 't-1', state: 'failed' },
      ],
    }),
  );
  assert.ok(live.reasons.includes('failed'));
});

test('cp1：failed_members は task ごとの最後の Dispatch が failed のものだけを数え、再実行で直った task の古い失敗を除く', () => {
  const c = failCase(700);
  c.dispatches = [
    { id: 'd1', task: 't-1', state: 'failed' },
    { id: 'd2', task: 't-1', state: 'succeeded' },
  ];
  assert.deepEqual(apex(run(c)).badges, []);
  c.dispatches = [
    { id: 'd2', task: 't-1', state: 'succeeded' },
    { id: 'd1', task: 't-1', state: 'failed' },
  ];
  assert.deepEqual(apex(run(c)).badges, [{ kind: 'failed_members', count: 1 }]);
});

// iss-00091：作業を続けている作業者（activity working）の問いは対応が必要にしない。
const workingAsk = (attention: string[], activity: string | null, state = 'working'): Case => ({
  tasks: [{ id: 't-root', paneKey: 'pane-c', createdAt: ago(600) }],
  dispatches: [{ id: 'd1', task: 't-root', state, attention, activity }],
});

test('iss-00091 T-02: input で activity working の Dispatch だけなら、90 秒を過ぎても作業中で question_working。止まった仕事にもしない', () => {
  for (const attention of [['input'], ['approval'], ['input', 'approval']]) {
    const item = apex(run(workingAsk(attention, 'working')));
    assert.equal(item.status, 'working', attention.join());
    assert.deepEqual(item.reasons, ['question_working', 'live_work'], attention.join());
  }
});

test('iss-00091 T-02: activity done・読めない・知らない値の Dispatch は、今のとおり 90 秒で question・decision', () => {
  for (const activity of ['done', 'idle', null, 'novel']) {
    const ask = apex(run(workingAsk(['input'], activity, 'blocked')));
    assert.equal(ask.status, 'needs_action', String(activity));
    assert.ok(ask.reasons.includes('question'), String(activity));
    assert.ok(!ask.reasons.includes('question_working'), String(activity));
    const gate = apex(run(workingAsk(['approval'], activity, 'blocked')));
    assert.equal(gate.status, 'needs_action', String(activity));
    assert.ok(gate.reasons.includes('decision'), String(activity));
  }
});

test('iss-00091 T-02: working と done の Dispatch が並ぶと、done の問いで question、working の問いで question_working', () => {
  const item = apex(
    run({
      tasks: [
        { id: 't-root', paneKey: 'pane-c', createdAt: ago(600) },
        { id: 't-2', paneKey: 'pane-c', createdAt: ago(600) },
      ],
      dispatches: [
        { id: 'd1', task: 't-root', state: 'working', attention: ['input'], activity: 'working' },
        { id: 'd2', task: 't-2', state: 'blocked', attention: ['input'], activity: 'done' },
      ],
    }),
  );
  assert.equal(item.status, 'needs_action');
  assert.deepEqual(item.reasons, ['question', 'question_working', 'live_work']);
});

test('iss-00091 T-02: A5 は activity working の問いも元のとおり数える（閉じたタブの頂点は apex_closed）', () => {
  const item = apex(
    run({
      ...workingAsk(['input'], 'working', 'succeeded'),
      agents: [coordinator({ terminal: fact('awaiting-restore') })],
    }),
  );
  assert.equal(item.status, 'needs_action');
  assert.ok(item.reasons.includes('apex_closed'));
  assert.ok(item.reasons.includes('question_working'));
});

test('iss-00091 T-03: 鮮度が古い間も question_working は memo から残り、対応が必要にならない', () => {
  const memo = new ApexVerdictMemo();
  assert.ok(apex(run({ ...workingAsk(['input'], 'working'), memo })).reasons.includes('question_working'));
  for (const stale of [['tasks'], ['workers']] as const) {
    const item = apex(run({ ...workingAsk(['input'], 'working'), stale: [...stale], memo }));
    assert.equal(item.status, 'working', stale[0]);
    assert.ok(item.reasons.includes('question_working'), stale[0]);
    assert.ok(!item.reasons.includes('question'), stale[0]);
  }
});

test('iss-00091 T-04: questions の各項目の working は activity から決まる', () => {
  const item = apex(
    run({
      tasks: [
        { id: 't-root', paneKey: 'pane-c', createdAt: ago(600), title: '仮の題' },
        { id: 't-2', paneKey: 'pane-c', createdAt: ago(600), title: '仮の題2' },
      ],
      dispatches: [
        { id: 'd1', task: 't-root', state: 'working', attention: ['input', 'approval'], activity: 'working' },
        { id: 'd2', task: 't-2', state: 'blocked', attention: ['input'], activity: null },
      ],
    }),
  );
  assert.deepEqual(item.questions, [
    { dispatchId: 'd1', taskTitle: '仮の題', kind: 'ask', working: true },
    { dispatchId: 'd2', taskTitle: '仮の題2', kind: 'ask', working: false },
    { dispatchId: 'd1', taskTitle: '仮の題', kind: 'gate', working: true },
  ]);
});
