import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRunList, buildRunTree } from '../../src/runs/tree.ts';
import { agent, fact, reading, repo, run, state, task, worker, worktree } from './fixture.ts';

test('木の根は今の統括のエージェントに結び、決め方と別プロジェクトの札を返す', () => {
  const source = state({
    runs: [
      run({
        coordinatorHandle: 'term-past',
        activeCoordinatorHandle: 'term-current',
        coordinatorResolvedBy: 'latest-task',
      }),
    ],
    repos: [repo('repo-a', '仮の統括プロジェクト'), repo('repo-b', '仮の作業プロジェクト')],
    worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b' })],
    agents: [
      agent('past', { terminalHandle: 'term-past', model: reading('past-model') }),
      agent('current', { terminalHandle: 'term-current', model: reading('current-model'), effort: reading('high') }),
    ],
    workers: [worker({ worktreeId: fact('wt-b') })],
  });
  const doc = buildRunTree(source, 'run-a');
  assert.ok(doc);
  assert.equal(doc.root.agentId, 'current');
  assert.equal(doc.root.model, 'current-model');
  assert.equal(doc.root.effort, 'high');
  assert.equal(doc.root.links.detail, '/embed/agent?id=current');
  assert.equal(doc.run.coordinatorResolvedBy, 'latest-task');
  assert.deepEqual(doc.run.coordinatorProject, { id: 'repo-a', name: '仮の統括プロジェクト' });
  assert.equal(doc.root.children[0]?.otherProject, true);
  assert.equal(doc.counts.otherProject, 1);
  assert.equal(doc.counts.nodes, 2);
  const list = buildRunList(source, 'repo-b');
  assert.deepEqual(list.runs[0]?.fromOtherProject, { id: 'repo-a', name: '仮の統括プロジェクト' });
});

test('統括を根にしてその Run の worker だけを task の親子に結ぶ', () => {
  const doc = buildRunTree(
    state({
      tasks: [task(), task({ id: 'child', parentId: fact('task-a') })],
      workers: [
        worker(),
        worker({ dispatchId: 'nested', taskId: 'child' }),
        worker({ dispatchId: 'other', runId: 'run-b' }),
      ],
    }),
    'run-a',
  );
  assert.ok(doc);
  assert.equal(doc.schema, 'orca-web.run-tree/v1');
  assert.equal(doc.root.id, 'coordinator:run-a');
  assert.equal(doc.root.role, 'coordinator');
  assert.equal(doc.root.children.length, 1);
  assert.equal(doc.root.children[0]?.id, 'dispatch-a');
  assert.equal(doc.root.children[0]?.children[0]?.id, 'nested');
  assert.deepEqual(doc.counts, { nodes: 3, workers: 2, otherProject: 0, orphan: 0 });
  assert.equal(buildRunTree(state(), 'unknown'), null);
});

test('親候補は作成端末の一致を優先し、なければ workers の元の順を使い、兄弟は時刻と dispatchId で並ぶ', () => {
  const doc = buildRunTree(
    state({
      tasks: [
        task(),
        task({
          id: 'child',
          parentId: fact('task-a'),
          createdByTerminalHandle: 'term-second',
          createdAt: fact('2026-01-02T10:00:00.000Z'),
        }),
        task({ id: 'fallback', parentId: fact('task-a'), createdByTerminalHandle: 'unknown' }),
        task({ id: 'early', createdAt: fact('2026-01-01T00:00:00.000Z') }),
      ],
      workers: [
        worker({ dispatchId: 'z-parent', terminalHandle: 'term-first' }),
        worker({ dispatchId: 'a-parent', terminalHandle: 'term-second' }),
        worker({ dispatchId: 'child', taskId: 'child' }),
        worker({ dispatchId: 'fallback', taskId: 'fallback' }),
        worker({ dispatchId: 'early', taskId: 'early' }),
      ],
    }),
    'run-a',
  );
  assert.ok(doc);
  assert.deepEqual(
    doc.root.children.map((n) => n.id),
    ['early', 'a-parent', 'z-parent'],
  );
  assert.deepEqual(
    doc.root.children[1]?.children.map((n) => n.id),
    ['child'],
  );
  assert.deepEqual(
    doc.root.children[2]?.children.map((n) => n.id),
    ['fallback'],
  );
});

test('親なし・task欠落・別Runの親・自己循環・複数節の循環を根で区別し、循環への子は親の下に残す', () => {
  const doc = buildRunTree(
    state({
      tasks: [
        task(),
        task({ id: 'missing-parent', parentId: fact('absent') }),
        task({ id: 'self', parentId: fact('self') }),
        task({ id: 'cycle-a', parentId: fact('cycle-b') }),
        task({ id: 'cycle-b', parentId: fact('cycle-a') }),
        task({ id: 'tail', parentId: fact('cycle-a') }),
      ],
      workers: [
        worker(),
        worker({ dispatchId: 'no-task', taskId: 'unknown' }),
        worker({ dispatchId: 'null-task', taskId: null }),
        worker({ dispatchId: 'missing-parent', taskId: 'missing-parent' }),
        worker({ dispatchId: 'other', taskId: 'absent', runId: 'run-b' }),
        ...['self', 'cycle-a', 'cycle-b', 'tail'].map((id) => worker({ dispatchId: id, taskId: id })),
      ],
    }),
    'run-a',
  );
  assert.ok(doc);
  assert.deepEqual(
    doc.root.children.map((n) => [n.id, n.orphan]),
    [
      ['cycle-a', true],
      ['cycle-b', true],
      ['dispatch-a', false],
      ['missing-parent', true],
      ['no-task', true],
      ['null-task', true],
      ['self', true],
    ],
  );
  assert.deepEqual(
    doc.root.children[0]?.children.map((n) => [n.id, n.orphan]),
    [['tail', false]],
  );
  assert.deepEqual(doc.counts, { nodes: 9, workers: 8, otherProject: 0, orphan: 6 });
  assert.doesNotThrow(() => JSON.stringify(doc));
});

test('節は統括の現在値と作業者の起動値を区別し、Issue の優先順と詳細リンクを保つ', () => {
  const source = state({
    worktrees: [worktree({ branch: fact('iss-7'), displayName: fact('iss-8') })],
    agents: [
      agent('root', { terminalHandle: 'term-root', model: reading('root-model'), effort: reading('medium') }),
      agent('wrong-handle', { terminalHandle: 'term-a', model: reading('wrong') }),
      agent('worker/?# あ', {
        terminalHandle: 'different',
        worker: { dispatchId: 'dispatch-a', taskId: 'task-a', runId: 'run-a' },
        model: reading('current-model'),
        effort: reading('low'),
        state: fact('blocked'),
      }),
      agent('unrelated', { terminalHandle: 'unrelated' }),
    ],
    workers: [worker({ model: reading('launch-model'), effort: reading('high') })],
  });
  const before = structuredClone(source);
  const doc = buildRunTree(source, 'run-a');
  assert.ok(doc);
  assert.deepEqual(doc.root, {
    id: 'coordinator:run-a',
    role: 'coordinator',
    dispatchId: null,
    taskId: null,
    title: '仮の iss-18 統括',
    issue: 'iss-00018',
    agentId: 'root',
    agentType: 'codex',
    model: 'root-model',
    effort: 'medium',
    state: 'working',
    since: '2026-01-02T11:00:00.000Z',
    project: { id: 'repo-a', name: '仮のプロジェクト' },
    worktreeId: 'wt-a',
    otherProject: false,
    orphan: false,
    links: { detail: '/embed/agent?id=root' },
    children: [
      {
        id: 'dispatch-a',
        role: 'worker',
        dispatchId: 'dispatch-a',
        taskId: 'task-a',
        title: '仮の iss-42',
        issue: 'iss-00007',
        agentId: 'worker/?# あ',
        agentType: 'codex',
        model: 'launch-model',
        effort: 'high',
        state: 'blocked',
        since: '2026-01-02T11:00:00.000Z',
        project: { id: 'repo-a', name: '仮のプロジェクト' },
        worktreeId: 'wt-a',
        otherProject: false,
        orphan: false,
        links: { detail: '/embed/agent?id=worker%2F%3F%23%20%E3%81%82' },
        children: [],
      },
    ],
  });
  assert.deepEqual(source, before);
});

test('欠けたモデルは現在値で埋めず、推論・worktree・状態だけを指定された順で補う', () => {
  const doc = buildRunTree(
    state({
      runs: [run({ coordinatorWorktreeId: fact(null) })],
      agents: [
        agent('root', { terminalHandle: 'term-root' }),
        agent('fallback', {
          terminalHandle: 'term-a',
          model: reading('current-model'),
          effort: reading('low'),
          state: fact(null),
          terminal: fact('awaiting-restore'),
          stateStartedAt: fact(null),
        }),
        agent('ended', { terminalHandle: 'term-ended', state: fact(null), terminal: fact('exited') }),
      ],
      workers: [
        worker({ worktreeId: fact(null) }),
        worker({ dispatchId: 'ended', terminalHandle: 'term-ended', state: fact('succeeded') }),
        worker({ dispatchId: 'absent', terminalHandle: null, worktreeId: fact(null), state: fact('failed') }),
      ],
    }),
    'run-a',
  );
  assert.ok(doc);
  assert.equal(doc.root.worktreeId, 'wt-a');
  const nodes = Object.fromEntries(doc.root.children.map((n) => [n.id, n]));
  assert.equal(nodes['dispatch-a']?.agentId, 'fallback');
  assert.equal(nodes['dispatch-a']?.model, null);
  assert.equal(nodes['dispatch-a']?.effort, 'low');
  assert.equal(nodes['dispatch-a']?.worktreeId, 'wt-a');
  assert.equal(nodes['dispatch-a']?.state, 'sleeping');
  assert.equal(nodes['dispatch-a']?.since, null);
  assert.equal(nodes.ended?.state, 'succeeded');
  assert.equal(nodes.absent?.state, 'failed');
  assert.equal(nodes.absent?.agentId, null);
  assert.equal(nodes.absent?.agentType, null);
  assert.equal(nodes.absent?.links.detail, null);
  assert.equal(nodes.absent?.project, null);
  assert.equal(nodes.absent?.effort, null);
});

test('プロジェクトが両方分かる異なる節だけに札を付け、名前がなければ repo id を使う', () => {
  const source = state({
    repos: [repo('repo-a', 'Alpha'), { ...repo('repo-b'), displayName: fact(null) }],
    worktrees: [
      worktree(),
      worktree({ id: 'wt-b', repoId: 'repo-b' }),
      worktree({ id: 'wt-unknown', repoId: 'unknown' }),
    ],
    workers: [
      worker(),
      worker({ dispatchId: 'b', worktreeId: fact('wt-b') }),
      worker({ dispatchId: 'unknown', worktreeId: fact('wt-unknown') }),
    ],
  });
  const doc = buildRunTree(source, 'run-a');
  assert.ok(doc);
  assert.deepEqual(
    doc.root.children.map((n) => [n.id, n.project, n.otherProject]),
    [
      ['b', { id: 'repo-b', name: 'repo-b' }, true],
      ['dispatch-a', { id: 'repo-a', name: 'Alpha' }, false],
      ['unknown', null, false],
    ],
  );
  assert.equal(doc.root.otherProject, false);
  assert.equal(doc.counts.otherProject, 1);
  source.runs = [run({ coordinatorHandle: null, coordinatorWorktreeId: fact(null) })];
  const unknownRoot = buildRunTree(source, 'run-a');
  assert.ok(unknownRoot);
  assert.equal(unknownRoot.root.project, null);
  assert.equal(unknownRoot.root.agentId, null);
  assert.equal(unknownRoot.counts.otherProject, 0);
});

test('統括を結べなくても根を返し、null の端末を持つ別エージェントに結ばない', () => {
  const doc = buildRunTree(
    state({
      runs: [run({ coordinatorHandle: null, coordinatorWorktreeId: fact(null), title: fact(null) })],
      workers: [worker({ terminalHandle: null, worktreeId: fact(null), state: fact(null) })],
      agents: [agent('unrelated', { terminalHandle: null })],
      worktrees: [],
      tasks: [],
    }),
    'run-a',
  );
  assert.ok(doc);
  const { children, ...root } = doc.root;
  assert.deepEqual(root, {
    id: 'coordinator:run-a',
    role: 'coordinator',
    dispatchId: null,
    taskId: null,
    title: null,
    issue: null,
    agentId: null,
    agentType: null,
    model: null,
    effort: null,
    state: null,
    since: null,
    project: null,
    worktreeId: null,
    otherProject: false,
    orphan: false,
    links: { detail: null },
  });
  assert.equal(children[0]?.agentId, null);
  assert.equal(children[0]?.state, null);
  assert.equal(children[0]?.orphan, true);
});

test('Issue は枝・表示名・題名の順で、統括だけは Run 題名を最初に読む', () => {
  const source = state({
    worktrees: [worktree({ branch: fact(null), displayName: fact('iss-8') })],
    runs: [run({ title: fact('仮の統括') })],
  });
  assert.equal(buildRunTree(source, 'run-a')?.root.issue, 'iss-00008');
  assert.equal(buildRunTree(source, 'run-a')?.root.children[0]?.issue, 'iss-00008');
  source.worktrees = [];
  assert.equal(buildRunTree(source, 'run-a')?.root.issue, null);
  assert.equal(buildRunTree(source, 'run-a')?.root.children[0]?.issue, 'iss-00042');
});

test('一覧は統括か作業者のプロジェクトで絞り、全RunのプロジェクトをRun単位で数える', () => {
  const source = state({
    repos: [repo('repo-a', 'Zulu'), repo('repo-b', 'Alpha'), repo('unused', 'Unused')],
    worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b' })],
    runs: [
      run(),
      run({ id: 'only-a' }),
      run({ id: 'only-b', coordinatorWorktreeId: fact('wt-b') }),
      run({ id: 'unknown', coordinatorHandle: null, coordinatorWorktreeId: fact(null) }),
    ],
    workers: [
      worker({ worktreeId: fact('wt-b') }),
      worker({ dispatchId: 'second', worktreeId: fact('wt-b') }),
      worker({ dispatchId: 'unknown-worker', runId: 'unknown', worktreeId: fact('wt-b') }),
    ],
  });
  const doc = buildRunList(source, 'repo-b');
  assert.equal(doc.schema, 'orca-web.runs/v1');
  assert.deepEqual(doc.project, { id: 'repo-b', name: 'Alpha' });
  assert.deepEqual(doc.projects, [
    { id: 'repo-b', name: 'Alpha', count: 3 },
    { id: 'repo-a', name: 'Zulu', count: 2 },
  ]);
  assert.deepEqual(doc.runs.map((r) => r.id).sort(), ['only-b', 'run-a', 'unknown']);
  const cross = doc.runs.find((r) => r.id === 'run-a');
  assert.ok(cross);
  assert.deepEqual(cross, {
    id: 'run-a',
    title: '仮の iss-18 統括',
    coordinatorProject: { id: 'repo-a', name: 'Zulu' },
    projects: [
      { id: 'repo-b', name: 'Alpha' },
      { id: 'repo-a', name: 'Zulu' },
    ],
    workers: 2,
    otherProject: 2,
    active: 3,
    latestTaskAt: '2026-01-02T10:00:00.000Z',
    fromOtherProject: { id: 'repo-a', name: 'Zulu' },
  });
  assert.equal(doc.runs.find((r) => r.id === 'only-b')?.fromOtherProject, null);
  assert.equal(doc.runs.find((r) => r.id === 'unknown')?.fromOtherProject, null);
  assert.equal(buildRunList(source, null).runs.length, 4);
  assert.ok(buildRunList(source, null).runs.every((r) => r.fromOtherProject === null));
  const missing = buildRunList(source, 'missing');
  assert.deepEqual(missing.project, { id: 'missing', name: null });
  assert.deepEqual(missing.runs, []);
  assert.deepEqual(missing.projects, doc.projects);
});

test('一覧は active の多い順、全taskの最新時刻の新しい順、null は最後、同じなら id の順', () => {
  const source = state({
    runs: ['null-z', 'old', 'new', 'null-a', 'active'].map((id) =>
      run({ id, coordinatorHandle: null, coordinatorWorktreeId: fact(null) }),
    ),
    agents: [
      agent('active', { terminalHandle: 'active', state: fact('waiting') }),
      agent('sleep', { terminalHandle: 'sleep', state: fact(null), terminal: fact('awaiting-restore') }),
    ],
    workers: [
      worker({ runId: 'active', terminalHandle: 'active' }),
      worker({ dispatchId: 'blocked', runId: 'active', terminalHandle: null, state: fact('blocked') }),
      worker({ dispatchId: 'sleep', runId: 'null-z', terminalHandle: 'sleep' }),
      worker({ dispatchId: 'done', runId: 'null-z', terminalHandle: null, state: fact('succeeded') }),
    ],
    tasks: [
      task({ id: 'old', runId: 'old', createdAt: fact('2026-01-01T00:00:00.000Z') }),
      task({ id: 'new', runId: 'new', createdAt: fact('2026-01-02T00:00:00.000Z') }),
      task({ id: 'newer-unassigned', runId: 'new', createdAt: fact('2026-01-03T00:00:00.000Z') }),
      task({ id: 'null', runId: 'new', createdAt: fact(null) }),
    ],
  });
  const doc = buildRunList(source, null);
  assert.deepEqual(
    doc.runs.map((r) => r.id),
    ['active', 'new', 'old', 'null-a', 'null-z'],
  );
  assert.equal(doc.runs[0]?.active, 2);
  assert.equal(doc.runs[1]?.latestTaskAt, '2026-01-03T00:00:00.000Z');
  assert.equal(doc.runs[4]?.active, 0);
  assert.equal(doc.runs[4]?.latestTaskAt, null);
});

test('木と一覧は取得元6種類の鮮度だけを写し、状態の時刻を保って入力を変えない', () => {
  const source = state({ stale: true, connection: { state: 'unreachable', reason: '仮の失敗', checkedAt: null } });
  source.sources.tasks = {
    fetchedAt: '仮の試行時刻',
    lastSuccessAt: '2026-01-01T00:00:00.000Z',
    stale: true,
    truncated: true,
    error: { kind: 'timeout', message: '仮の待機切れ' },
  };
  const before = structuredClone(source);
  const tree = buildRunTree(source, 'run-a');
  assert.ok(tree);
  const list = buildRunList(source, null);
  const success = { lastSuccessAt: '2026-01-02T11:00:00.000Z', stale: false, error: null };
  const sources = {
    runs: success,
    tasks: {
      lastSuccessAt: '2026-01-01T00:00:00.000Z',
      stale: true,
      error: { kind: 'timeout', message: '仮の待機切れ' },
    },
    workers: success,
    workerLaunch: success,
    tabs: success,
    terminals: success,
  };
  for (const doc of [tree, list]) {
    assert.equal(doc.generatedAt, '2026-01-02T11:00:00.000Z');
    assert.equal(doc.stale, true);
    assert.deepEqual(doc.connection, { state: 'unreachable', reason: '仮の失敗', checkedAt: null });
    assert.deepEqual(doc.sources, sources);
  }
  assert.deepEqual(source, before);
  assert.deepEqual(buildRunList(source, null), list);
  assert.deepEqual(buildRunList(state({ runs: [] }), null).runs, []);
});
