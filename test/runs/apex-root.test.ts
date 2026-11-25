// Run の木の根を、頂点の結び（Run の今の世代の束の頂点）でも決める（iss-00082 R-03、D-03）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BundleOwners } from '../../src/apex/owners.ts';
import { buildRunList, buildRunTree, type RunBundleInput } from '../../src/runs/tree.ts';
import type { AgentState, StateDocument } from '../../src/state/model.ts';
import { type DispatchSpec, orchestration, type TaskSpec, tabbedWorker } from '../apex/fixture.ts';
import { agent, fact, repo, run, state, worktree } from './fixture.ts';

const NOW = Date.parse('2026-01-03T00:00:00.000Z');

/** 統括の候補（頂点。worker も parentPaneKey もない）。統括は repo-b、作業は repo-a。 */
function apex(id: string, pane: string, patch: Partial<AgentState> = {}): AgentState {
  return agent(id, { paneKey: pane, terminalHandle: `term-${id}`, worktreeId: 'wt-b', ...patch });
}

function scene(o: {
  handle?: string | null;
  agents: AgentState[];
  runs?: Record<string, number | null>;
  tasks: TaskSpec[];
  dispatches: DispatchSpec[];
}): { state: StateDocument; bundles: RunBundleInput } {
  const orch = orchestration({ runs: o.runs ?? { 'run-a': 1 }, tasks: o.tasks, dispatches: o.dispatches });
  const handle = o.handle ?? null;
  return {
    state: state({
      runs: [run({ coordinatorHandle: handle, activeCoordinatorHandle: handle, coordinatorWorktreeId: fact(null) })],
      repos: [repo('repo-a', '仮の作業プロジェクト'), repo('repo-b', '仮の統括プロジェクト')],
      worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b' })],
      agents: o.agents,
      tasks: orch.tasks,
      workers: orch.workers,
    }),
    bundles: { extras: orch.extras, owners: new BundleOwners(), now: NOW },
  };
}

/** 子のタブが閉じた統括の Run：根の task の作成者だけが統括を示す。 */
function closedChildren(handle: string | null = null) {
  return scene({
    handle,
    agents: [apex('coord', 'pane-coord')],
    tasks: [
      { id: 't-root', paneKey: 'pane-coord', generation: 1 },
      { id: 't-1', parent: 't-root', generation: 1 },
    ],
    dispatches: [{ id: 'd1', task: 't-1', state: 'succeeded' }],
  });
}

test('T-04: handle も生きた作業者もない Run で、根の task の作成者の paneKey が頂点と一致すれば、根はその頂点', () => {
  const { state: doc, bundles } = closedChildren();
  assert.equal(buildRunTree(doc, 'run-a')?.root.agentId, null, '束の入力がなければ今のまま結べない');
  const tree = buildRunTree(doc, 'run-a', bundles);
  assert.equal(tree?.root.agentId, 'coord');
  assert.equal(tree?.root.worktreeId, 'wt-b');
  assert.deepEqual(tree?.run.coordinatorProject, { id: 'repo-b', name: '仮の統括プロジェクト' });
  assert.equal(tree?.root.children[0]?.otherProject, true);
});

test('T-07: activeCoordinatorHandle の端末がなければ、生きた作業者の parentPaneKey で結ぶ', () => {
  const { state: doc } = scene({
    handle: 'term-gone',
    agents: [
      apex('coord', 'pane-coord'),
      tabbedWorker('kid', 'd1', 't-root', { parentPaneKey: fact('pane-coord'), terminalHandle: null }),
    ],
    tasks: [{ id: 't-root', generation: 1 }],
    dispatches: [{ id: 'd1', task: 't-root' }],
  });
  assert.equal(buildRunTree(doc, 'run-a')?.root.agentId, 'coord');
});

test('T-07: activeCoordinatorHandle の端末がなく、生きた作業者もなければ、束の頂点で結ぶ', () => {
  const { state: doc, bundles } = closedChildren('term-gone');
  assert.equal(buildRunTree(doc, 'run-a')?.root.agentId, null);
  assert.equal(buildRunTree(doc, 'run-a', bundles)?.root.agentId, 'coord');
});

function generations(runs: Record<string, number | null>, tasks?: TaskSpec[]) {
  return scene({
    runs,
    agents: [apex('old', 'pane-old'), apex('new', 'pane-new')],
    tasks: tasks ?? [
      { id: 't-g1', paneKey: 'pane-old', generation: 1 },
      { id: 't-g2', paneKey: 'pane-new', generation: 2 },
    ],
    dispatches: [{ id: 'd1', task: 't-g1', state: 'succeeded' }],
  });
}

test('T-07: consumerGeneration が 2 の Run では世代 2 の束の頂点を選ぶ', () => {
  const { state: doc, bundles } = generations({ 'run-a': 2 });
  assert.equal(buildRunTree(doc, 'run-a', bundles)?.root.agentId, 'new');
  const first = generations({ 'run-a': 1 });
  assert.equal(buildRunTree(first.state, 'run-a', first.bundles)?.root.agentId, 'old');
});

test('T-07: 今の世代の束に持ち主の頂点がなければ、古い世代の頂点には結ばない', () => {
  const { state: doc, bundles } = generations({ 'run-a': 3 });
  assert.equal(buildRunTree(doc, 'run-a', bundles)?.root.agentId, null);
});

test('T-07: consumerGeneration が読めなければ、最も新しい世代の束の頂点', () => {
  const { state: doc, bundles } = generations({ 'run-a': null });
  assert.equal(buildRunTree(doc, 'run-a', bundles)?.root.agentId, 'new');
  const none = generations({});
  assert.equal(buildRunTree(none.state, 'run-a', none.bundles)?.root.agentId, 'new');
});

test('T-07: buildRunList の coordinatorProject・fromOtherProject・?project= の絞り込みが、新しい根の結びで決まる', () => {
  const { state: doc, bundles } = closedChildren();
  const before = buildRunList(doc, 'repo-b');
  assert.deepEqual(
    before.runs.map((r) => r.id),
    [],
    '束の入力がなければ統括のプロジェクトで絞れない',
  );
  const all = buildRunList(doc, null, bundles);
  assert.deepEqual(all.runs[0]?.coordinatorProject, { id: 'repo-b', name: '仮の統括プロジェクト' });
  assert.deepEqual(
    all.projects.map((p) => [p.id, p.count]),
    [
      ['repo-a', 1],
      ['repo-b', 1],
    ],
  );
  const coordinatorSide = buildRunList(doc, 'repo-b', bundles);
  assert.deepEqual(
    coordinatorSide.runs.map((r) => [r.id, r.fromOtherProject]),
    [['run-a', null]],
  );
  const workerSide = buildRunList(doc, 'repo-a', bundles);
  assert.deepEqual(
    workerSide.runs.map((r) => [r.id, r.fromOtherProject]),
    [['run-a', { id: 'repo-b', name: '仮の統括プロジェクト' }]],
  );
});

test('T-05: 今の結び方で結べる Run は、束の頂点が別でも結果が変わらない', () => {
  // handle の端末がある：束の頂点（other）ではなく handle の端末。
  const handled = scene({
    handle: 'term-coord',
    agents: [apex('coord', 'pane-coord'), apex('other', 'pane-other')],
    tasks: [{ id: 't-root', paneKey: 'pane-other', generation: 1 }],
    dispatches: [{ id: 'd1', task: 't-root', state: 'succeeded' }],
  });
  assert.deepEqual(buildRunTree(handled.state, 'run-a', handled.bundles), buildRunTree(handled.state, 'run-a'));
  assert.equal(buildRunTree(handled.state, 'run-a', handled.bundles)?.root.agentId, 'coord');
  // 生きた作業者の parentPaneKey：束の作成者（other）ではなく作業者の親。
  const live = scene({
    agents: [
      apex('coord', 'pane-coord'),
      apex('other', 'pane-other'),
      tabbedWorker('kid', 'd1', 't-root', { parentPaneKey: fact('pane-coord'), terminalHandle: null }),
    ],
    tasks: [{ id: 't-root', paneKey: 'pane-other', generation: 1 }],
    dispatches: [{ id: 'd1', task: 't-root' }],
  });
  assert.deepEqual(buildRunTree(live.state, 'run-a', live.bundles), buildRunTree(live.state, 'run-a'));
  assert.equal(buildRunTree(live.state, 'run-a', live.bundles)?.root.agentId, 'coord');
  assert.deepEqual(buildRunList(live.state, null, live.bundles), buildRunList(live.state, null));
});
