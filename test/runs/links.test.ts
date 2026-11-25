// Run の木の作業者と統括のエージェントの探し方（iss-00044）。構造化 Chat の作業者は agent.worker で、
// 統括は activeCoordinatorHandle がないとき根の task の作業者の parentPaneKey で結ぶ。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coordinatorAgent, workerAgent } from '../../src/runs/links.ts';
import { buildRunTree } from '../../src/runs/tree.ts';
import type { AgentState } from '../../src/state/model.ts';
import { agent, EARLY, fact, LATE, reading, repo, run, state, task, worker, worktree } from './fixture.ts';

function chatAgent(id: string, patch: Partial<AgentState> = {}): AgentState {
  return agent(`chat:${id}`, {
    kind: 'chat-tab',
    paneKey: `pane-${id}`,
    tabId: id,
    terminalHandle: null,
    agentType: fact('claude'),
    terminal: fact(null, 'no-source'),
    ...patch,
  });
}

const link = (dispatchId: string, taskId: string) => ({ dispatchId, taskId, runId: 'run-a' });

/** 構造化 Chat の統括（paneKey pane-coord-*）と、根の task の作業者の chat-tab。 */
function structured(patch: Parameters<typeof state>[0] = {}) {
  return state({
    runs: [run({ coordinatorHandle: null, coordinatorWorktreeId: fact(null) })],
    repos: [repo('repo-a', '仮の作業プロジェクト'), repo('repo-b', '仮の統括プロジェクト')],
    worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b' })],
    agents: [
      chatAgent('coord-a', { worktreeId: 'wt-b', state: fact('waiting'), model: reading('coord-model') }),
      chatAgent('w-1', {
        parentPaneKey: fact('pane-coord-a'),
        worker: link('dispatch-a', 'task-a'),
        state: fact('working'),
        stateStartedAt: fact(EARLY),
      }),
    ],
    tasks: [task({ createdAt: fact(EARLY) })],
    workers: [worker({ terminalHandle: null, model: reading('worker-model') })],
    ...patch,
  });
}

test('T-03: 構造化 Chat の作業者の節は、結んだ chat-tab のエージェントの値になり、model は worker の値', () => {
  const doc = buildRunTree(structured(), 'run-a');
  assert.ok(doc);
  const node = doc.root.children[0];
  assert.equal(node?.agentId, 'chat:w-1');
  assert.equal(node?.agentType, 'claude');
  assert.equal(node?.state, 'working');
  assert.equal(node?.since, EARLY);
  assert.equal(node?.model, 'worker-model');
  assert.equal(node?.links.detail, `/embed/agent?id=${encodeURIComponent('chat:w-1')}`);
});

test('T-03: 統括の節は、根の task の作業者の parentPaneKey と paneKey が一致する chat-tab に結び、worktree と project を決める', () => {
  const doc = buildRunTree(structured(), 'run-a');
  assert.ok(doc);
  assert.equal(doc.root.agentId, 'chat:coord-a');
  assert.equal(doc.root.agentType, 'claude');
  assert.equal(doc.root.state, 'waiting');
  assert.equal(doc.root.model, 'coord-model');
  assert.equal(doc.root.worktreeId, 'wt-b');
  assert.deepEqual(doc.root.project, { id: 'repo-b', name: '仮の統括プロジェクト' });
  assert.deepEqual(doc.run.coordinatorProject, { id: 'repo-b', name: '仮の統括プロジェクト' });
  assert.equal(doc.run.coordinatorResolvedBy, null);
  assert.equal(doc.root.links.detail, `/embed/agent?id=${encodeURIComponent('chat:coord-a')}`);
  assert.equal(doc.root.children[0]?.otherProject, true);
});

test('T-03: Run の worktree があれば根の worktree はそれを使う', () => {
  const doc = buildRunTree(
    structured({ runs: [run({ coordinatorHandle: null, coordinatorWorktreeId: fact('wt-a') })] }),
    'run-a',
  );
  assert.equal(doc?.root.agentId, 'chat:coord-a');
  assert.equal(doc?.root.worktreeId, 'wt-a');
});

test('T-03: 根の task が2つなら、新しい task の作業者の統括を先に使う', () => {
  const source = structured({
    agents: [
      chatAgent('coord-a'),
      chatAgent('coord-b'),
      chatAgent('w-old', { parentPaneKey: fact('pane-coord-a'), worker: link('dispatch-old', 'task-old') }),
      chatAgent('w-new', { parentPaneKey: fact('pane-coord-b'), worker: link('dispatch-new', 'task-new') }),
    ],
    // 状態の文書の tasks は作成の時刻の順。
    tasks: [task({ id: 'task-old', createdAt: fact(EARLY) }), task({ id: 'task-new', createdAt: fact(LATE) })],
    workers: [
      worker({ dispatchId: 'dispatch-new', taskId: 'task-new', terminalHandle: null }),
      worker({ dispatchId: 'dispatch-old', taskId: 'task-old', terminalHandle: null }),
    ],
  });
  assert.equal(buildRunTree(source, 'run-a')?.root.agentId, 'chat:coord-b');
  const runState = source.runs[0];
  assert.ok(runState);
  assert.equal(coordinatorAgent(source, runState)?.id, 'chat:coord-b');
});

test('T-03: 新しい根の task の作業者が結べないときは、古い根の task を見る', () => {
  const source = structured({
    agents: [
      chatAgent('coord-a'),
      chatAgent('w-old', { parentPaneKey: fact('pane-coord-a'), worker: link('dispatch-old', 'task-old') }),
      chatAgent('w-new', { parentPaneKey: fact('pane-nowhere'), worker: link('dispatch-new', 'task-new') }),
    ],
    tasks: [task({ id: 'task-old', createdAt: fact(EARLY) }), task({ id: 'task-new', createdAt: fact(LATE) })],
    workers: [
      worker({ dispatchId: 'dispatch-old', taskId: 'task-old', terminalHandle: null }),
      worker({ dispatchId: 'dispatch-new', taskId: 'task-new', terminalHandle: null }),
    ],
  });
  assert.equal(buildRunTree(source, 'run-a')?.root.agentId, 'chat:coord-a');
});

test('T-03: 一致なし・作業者にエージェントなし・子の task だけ一致・parentPaneKey なし・別の Run では根は null', () => {
  const cases: [string, ReturnType<typeof structured>][] = [
    [
      '一致する paneKey がない',
      structured({
        agents: [
          chatAgent('coord-a'),
          chatAgent('w-1', { parentPaneKey: fact('pane-x'), worker: link('dispatch-a', 'task-a') }),
        ],
      }),
    ],
    ['作業者にエージェントがない', structured({ agents: [chatAgent('coord-a')] })],
    [
      '作業者の parentPaneKey がない（ps の失敗）',
      structured({
        agents: [
          chatAgent('coord-a'),
          chatAgent('w-1', { parentPaneKey: fact(null, 'no-source'), worker: link('dispatch-a', 'task-a') }),
        ],
      }),
    ],
    [
      '子の task の作業者だけが一致する',
      structured({
        agents: [
          chatAgent('coord-a'),
          chatAgent('w-root', { parentPaneKey: fact('pane-x'), worker: link('dispatch-a', 'task-a') }),
          chatAgent('w-child', { parentPaneKey: fact('pane-coord-a'), worker: link('dispatch-c', 'task-c') }),
        ],
        tasks: [
          task({ createdAt: fact(EARLY) }),
          task({ id: 'task-c', parentId: fact('task-a'), createdAt: fact(LATE) }),
        ],
        workers: [
          worker({ terminalHandle: null }),
          worker({ dispatchId: 'dispatch-c', taskId: 'task-c', terminalHandle: null }),
        ],
      }),
    ],
    [
      '別の Run の根の task の作業者だけが一致する',
      structured({
        tasks: [task({ runId: 'run-other', createdAt: fact(EARLY) })],
        workers: [worker({ runId: 'run-other', terminalHandle: null })],
      }),
    ],
  ];
  for (const [name, source] of cases) {
    const doc = buildRunTree(source, 'run-a');
    assert.ok(doc, name);
    assert.equal(doc.root.agentId, null, name);
    assert.equal(doc.root.links.detail, null, name);
  }
});

test('F-01: 結べない節があっても、木の親子と数は変わらない', () => {
  const linked = buildRunTree(structured(), 'run-a');
  const unlinked = buildRunTree(structured({ agents: [] }), 'run-a');
  // otherProject は根の project（結んだ統括の worktree）で決まるので、親子と数だけを比べる。
  const shape = (c: typeof linked) =>
    c && { nodes: c.counts.nodes, workers: c.counts.workers, orphan: c.counts.orphan };
  assert.deepEqual(shape(linked), shape(unlinked));
  assert.deepEqual(
    linked?.root.children.map((n) => n.id),
    unlinked?.root.children.map((n) => n.id),
  );
  assert.equal(unlinked?.root.children[0]?.agentId, null);
});

test('T-04: activeCoordinatorHandle の端末があれば handle のエージェントを使い、なければ parentPaneKey の候補に進む（iss-00082 D-03）', () => {
  const withHandle = structured({
    runs: [run({ coordinatorHandle: 'term-root' })],
    agents: [
      agent('root', { terminalHandle: 'term-root' }),
      chatAgent('coord-a'),
      chatAgent('w-1', { parentPaneKey: fact('pane-coord-a'), worker: link('dispatch-a', 'task-a') }),
    ],
  });
  assert.equal(buildRunTree(withHandle, 'run-a')?.root.agentId, 'root');

  const missingHandle = structured({
    runs: [run({ coordinatorHandle: 'term-gone' })],
    agents: [
      chatAgent('coord-a'),
      chatAgent('w-1', { parentPaneKey: fact('pane-coord-a'), worker: link('dispatch-a', 'task-a') }),
    ],
  });
  const doc = buildRunTree(missingHandle, 'run-a');
  assert.equal(doc?.root.agentId, 'chat:coord-a');
  assert.equal(doc?.root.children[0]?.agentId, 'chat:w-1');
});

test('T-04: 端末の作業者は今どおり dispatchId を先に、なければ terminalHandle で探す', () => {
  const source = state({
    agents: [
      agent('by-handle', { terminalHandle: 'term-a' }),
      agent('by-dispatch', { terminalHandle: 'term-other', worker: link('dispatch-a', 'task-a') }),
    ],
  });
  const w = source.workers[0];
  assert.ok(w);
  assert.equal(workerAgent(source, w)?.id, 'by-dispatch');
  assert.equal(
    workerAgent({ ...source, agents: [agent('by-handle', { terminalHandle: 'term-a' })] }, w)?.id,
    'by-handle',
  );
  assert.equal(
    workerAgent({ ...source, agents: [agent('none', { terminalHandle: null })] }, { ...w, terminalHandle: null }),
    undefined,
  );
});
