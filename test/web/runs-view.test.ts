import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RunListDocument, RunTreeDocument } from '../../src/runs/model.ts';
import { buildRunList, buildRunTree } from '../../src/runs/tree.ts';
import {
  buildRunListView as buildList,
  buildTreeView as buildTree,
  inboxLinks,
  projectHref,
  projectIdFromPath,
  projectPageApis,
  runHref,
  runIdFromPath,
  runsApiPath,
  runTreeApiPath,
} from '../../web/runs-view.js';
import { agent, EARLY, fact, reading, repo, run, state, task, worker, worktree } from '../runs/fixture.ts';

const iso = (s: string): string => s;
const MIN = 60_000;
/** 画面の内容は JS の推論の型なので、テストでは添字を確かめずに読む。 */
// biome-ignore lint/suspicious/noExplicitAny: the view is an untyped JS object
const buildTreeView = (doc: RunTreeDocument, options: Parameters<typeof buildTree>[1]): any => buildTree(doc, options);
// biome-ignore lint/suspicious/noExplicitAny: the view is an untyped JS object
const buildRunListView = (doc: RunListDocument, options: Parameters<typeof buildList>[1]): any =>
  buildList(doc, options);

/** 統括（repo-a）の下に、別のプロジェクト（repo-b）の作業者と、その子と、親の分からない作業者がいる木。 */
function treeDocument(): RunTreeDocument {
  const doc = buildRunTree(
    state({
      repos: [repo('repo-a', 'プロジェクトA'), repo('repo-b', 'プロジェクトB')],
      worktrees: [
        worktree(),
        worktree({ id: 'wt-b', repoId: 'repo-b', branch: fact('iss-7'), displayName: fact('仮の作業') }),
      ],
      agents: [
        agent('root', { terminalHandle: 'term-root', agentType: fact('claude'), effort: reading('high') }),
        agent('agent/b', { terminalHandle: 'term-a', worktreeId: 'wt-b', stateStartedAt: fact(EARLY) }),
      ],
      tasks: [
        task({ createdAt: fact(EARLY) }),
        task({ id: 'child', parentId: fact('task-a'), title: fact('仮の子') }),
        task({ id: 'lost', parentId: fact('absent'), title: fact('仮の迷子') }),
      ],
      workers: [
        worker({ worktreeId: fact('wt-b'), model: reading('gpt-x'), effort: reading('medium') }),
        worker({
          dispatchId: 'child',
          taskId: 'child',
          terminalHandle: 'term-child',
          worktreeId: fact(null),
          state: fact('succeeded'),
        }),
        worker({ dispatchId: 'lost', taskId: 'lost', terminalHandle: 'term-lost', worktreeId: fact('wt-a') }),
      ],
    }),
    'run-a',
  );
  assert.ok(doc);
  return doc;
}

test('木の行は深さの順に並び、役割・Issue・題名・種類・モデル・推論・状態・経過・プロジェクト・札・印・詳細のリンクを持つ', () => {
  const now = Date.parse(EARLY) + 12 * MIN;
  const view = buildTreeView(treeDocument(), { now, formatTime: iso });
  assert.deepEqual(
    view.rows.map((r: { key: string; depth: number }) => [r.key, r.depth]),
    [
      ['coordinator:run-a', 0],
      ['dispatch-a', 1],
      ['child', 2],
      ['lost', 1],
    ],
  );
  const [root, worker1, child, lost] = view.rows;
  assert.equal(root.roleLabel, '統括');
  assert.equal(root.role, 'coordinator');
  assert.equal(root.issue, 'iss-00018');
  assert.equal(root.title, '仮の iss-18 統括');
  assert.equal(root.agentType, 'claude');
  assert.equal(root.model, '—');
  assert.equal(root.effort, 'high');
  assert.equal(root.project, 'プロジェクトA');
  assert.equal(root.badge, null);
  assert.equal(root.orphan, null);
  assert.equal(root.detailHref, '/embed/agent?id=root');

  assert.equal(worker1.roleLabel, '作業者');
  assert.equal(worker1.issue, 'iss-00007');
  assert.equal(worker1.model, 'gpt-x');
  assert.equal(worker1.effort, 'medium');
  assert.equal(worker1.state, '動いている');
  assert.equal(worker1.elapsed, '12分');
  assert.equal(worker1.project, 'プロジェクトB');
  assert.equal(worker1.badge, 'プロジェクトB');
  assert.equal(worker1.detailHref, '/embed/agent?id=agent%2Fb');

  // 取れない値は「—」。エージェントに結び付かない作業者は worker の状態を出し、詳細のリンクがない。
  assert.equal(child.agentType, '—');
  assert.equal(child.model, '—');
  assert.equal(child.effort, '—');
  assert.equal(child.state, '成功');
  assert.equal(child.elapsed, '—');
  assert.equal(child.project, '—');
  assert.equal(child.badge, null);
  assert.equal(child.detailHref, null);

  assert.equal(lost.orphan, '親が分からない');
  assert.equal(lost.project, 'プロジェクトA');
  assert.equal(lost.badge, null);

  assert.equal(view.runId, 'run-a');
  assert.equal(view.title, '仮の iss-18 統括');
  assert.equal(view.coordinatorProject, 'プロジェクトA');
  assert.equal(view.summary, '節 4・作業者 3・別のプロジェクト 1・親が分からない 1');
});

test('最近の依頼で決めた統括だけ、根の行に決め方を添える', () => {
  const doc = treeDocument();
  for (const resolvedBy of ['latest-task', 'run', null] as const) {
    doc.run.coordinatorResolvedBy = resolvedBy;
    const view = buildTreeView(doc, { now: 0, formatTime: iso });
    assert.equal(view.rows[0].coordinatorNote, resolvedBy === 'latest-task' ? '最近の依頼から決めた統括' : null);
    assert.ok(view.rows.slice(1).every((row: { coordinatorNote: string | null }) => row.coordinatorNote === null));
  }
});

test('統括の端末が分からない木は、根の項目を「—」にし、知らない状態の値はそのまま出し、決めた形でない詳細のリンクは捨てる', () => {
  const doc = buildRunTree(
    state({
      runs: [run({ title: fact(null), coordinatorHandle: null, coordinatorWorktreeId: fact(null) })],
      agents: [],
    }),
    'run-a',
  );
  assert.ok(doc);
  const first = doc.root.children[0];
  assert.ok(first);
  first.state = 'confused';
  first.links.detail = 'https://example.com/x';
  const view = buildTreeView(doc, { now: 0, formatTime: iso });
  const [root, row] = view.rows;
  for (const key of ['issue', 'title', 'agentType', 'model', 'effort', 'state', 'elapsed', 'project']) {
    assert.equal(root[key], '—', key);
  }
  assert.equal(root.detailHref, null);
  assert.equal(view.title, null);
  assert.equal(view.coordinatorProject, '—');
  assert.equal(row.state, 'confused');
  assert.equal(row.detailHref, null);
});

test('鮮度の文は平らな sources から、接続、最後に読めた時刻、古い値、読めない取得元、更新できないを作る', () => {
  const doc = treeDocument();
  let view = buildTreeView(doc, { now: 0, formatTime: iso });
  assert.deepEqual(
    view.freshness.map((l: { text: string }) => l.text),
    ['Orca に接続', `最後に読めた時刻 ${doc.sources.runs.lastSuccessAt}`],
  );

  doc.connection = {
    state: 'unreachable',
    reason: 'runtime_missing',
    checkedAt: EARLY,
  } as RunTreeDocument['connection'];
  doc.stale = true;
  doc.sources.tasks = { lastSuccessAt: '2026-01-03T00:00:00.000Z', stale: true, error: { kind: 'timeout' } } as never;
  doc.sources.tabs = { lastSuccessAt: null, stale: true, error: { kind: 'unavailable' } } as never;
  view = buildTreeView(doc, { now: 0, formatTime: iso, error: '503' });
  assert.deepEqual(
    view.freshness.map((l: { text: string; kind: string }) => [l.text, l.kind]),
    [
      ['Orca に接続できない（runtime_missing）', 'bad'],
      ['最後に読めた時刻 2026-01-03T00:00:00.000Z', 'info'],
      ['古い値を含む', 'warn'],
      ['読めない取得元：tasks（timeout）、tabs（unavailable）', 'warn'],
      ['更新できない（503）。前の内容を示しています', 'bad'],
    ],
  );
  assert.ok(!view.freshness.some((l: { text: string }) => l.text.includes('連絡')));

  for (const name of Object.keys(doc.sources) as (keyof typeof doc.sources)[]) {
    doc.sources[name] = { lastSuccessAt: null, stale: true, error: null };
  }
  doc.connection = { state: 'starting', reason: null, checkedAt: EARLY } as RunTreeDocument['connection'];
  view = buildTreeView(doc, { now: 0, formatTime: iso });
  assert.deepEqual(
    view.freshness.map((l: { text: string }) => l.text),
    ['確かめ中', 'まだ読めていない', '古い値を含む'],
  );
});

function listDocument(project: string | null): RunListDocument {
  return buildRunList(
    state({
      repos: [repo('repo-a', 'プロジェクトA'), repo('repo-b', 'プロジェクトB')],
      worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b' })],
      runs: [
        run(),
        run({ id: 'run-b', title: fact(null), coordinatorHandle: 'term-b', coordinatorWorktreeId: fact('wt-b') }),
        run({ id: 'run-c', coordinatorHandle: null, coordinatorWorktreeId: fact(null) }),
      ],
      tasks: [
        task({ createdAt: fact(EARLY) }),
        task({ id: 'task-b', runId: 'run-b' }),
        task({ id: 'task-c', runId: 'run-c' }),
      ],
      workers: [
        worker({ worktreeId: fact('wt-b') }),
        worker({ dispatchId: 'd-b', taskId: 'task-b', runId: 'run-b', worktreeId: fact('wt-a') }),
        worker({ dispatchId: 'd-c', taskId: 'task-c', runId: 'run-c', worktreeId: fact('wt-a') }),
      ],
    }),
    project,
  );
}

test('一覧の行は題名、統括のプロジェクト、プロジェクトの札、作業者と動いている数、木へのリンクを持つ', () => {
  const view = buildRunListView(listDocument(null), { formatTime: iso, project: null });
  const byId = Object.fromEntries(view.rows.map((r: { key: string }) => [r.key, r]));
  assert.equal(view.rows.length, 3);
  assert.equal(byId['run-a'].title, '仮の iss-18 統括');
  assert.equal(byId['run-a'].href, '/runs/run-a');
  assert.equal(byId['run-a'].coordinator, '統括のプロジェクト：プロジェクトA');
  assert.deepEqual(byId['run-a'].projects, ['プロジェクトA', 'プロジェクトB']);
  assert.equal(byId['run-a'].workers, '作業者 1');
  assert.equal(byId['run-a'].active, '動いている 2');
  assert.equal(byId['run-a'].from, null);
  assert.equal(byId['run-b'].title, '—');
  assert.equal(byId['run-c'].coordinator, '統括のプロジェクト：—');
  assert.equal(view.projectName, null);
  assert.deepEqual(
    view.projects.map((p: { value: string; label: string; selected: boolean }) => [p.value, p.label, p.selected]),
    [
      ['', 'すべてのプロジェクト', true],
      ['repo-a', 'プロジェクトA（3）', false],
      ['repo-b', 'プロジェクトB（2）', false],
    ],
  );
});

test('プロジェクトで絞った一覧は、統括が別のプロジェクトの Run に「<名前> の統括から」の札を付ける', () => {
  const view = buildRunListView(listDocument('repo-a'), { formatTime: iso, project: 'repo-a' });
  const byId = Object.fromEntries(view.rows.map((r: { key: string }) => [r.key, r]));
  assert.equal(byId['run-b'].from, 'プロジェクトB の統括から');
  assert.equal(byId['run-a'].from, null);
  assert.equal(byId['run-c'].from, null);
  assert.equal(byId['run-c'].coordinator, '統括のプロジェクト：—');
  assert.equal(view.projectName, 'プロジェクトA');
  assert.equal(view.projects.find((p: { selected: boolean }) => p.selected).value, 'repo-a');
  assert.ok(view.freshness.length >= 2);
});

test('道と API の URL は id を encodeURIComponent し、道から id を読み戻す', () => {
  assert.equal(runHref('run_a-1'), '/runs/run_a-1');
  assert.equal(projectHref('repo/a 仮'), '/projects/repo%2Fa%20%E4%BB%AE');
  assert.equal(runsApiPath(null), '/api/runs');
  assert.equal(runsApiPath('repo/a'), '/api/runs?project=repo%2Fa');
  assert.equal(runTreeApiPath('run-a'), '/api/runs/run-a/tree');
  assert.equal(runIdFromPath('/runs/run-a'), 'run-a');
  assert.equal(runIdFromPath('/runs/'), null);
  assert.equal(runIdFromPath('/runs/a/b'), null);
  assert.equal(projectIdFromPath('/projects/repo%2Fa%20%E4%BB%AE'), 'repo/a 仮');
  assert.equal(projectIdFromPath('/projects/%ZZ'), null);
  assert.equal(projectIdFromPath('/runs/x'), null);
});

test('プロジェクトの画面は受け箱と Run の一覧を ?project= で読み、受け箱の見出しは /runs と選んだプロジェクトの画面にリンクする', () => {
  assert.deepEqual(projectPageApis('repo/a'), {
    inbox: '/api/inbox?project=repo%2Fa',
    runs: '/api/runs?project=repo%2Fa',
  });
  assert.deepEqual(inboxLinks(null), [{ text: 'Run の一覧', href: '/runs' }]);
  assert.deepEqual(inboxLinks('repo/a'), [
    { text: 'Run の一覧', href: '/runs' },
    { text: 'プロジェクトの画面', href: '/projects/repo%2Fa' },
  ]);
});
