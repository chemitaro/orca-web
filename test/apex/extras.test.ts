import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOrchestrationExtras } from '../../src/apex/extras.ts';
import type { OrcaRun, OrcaTask, OrcaWorker } from '../../src/orca/read-state.ts';

const run = (o: Partial<OrcaRun> & { id: string }): OrcaRun => ({
  coordinatorHandle: null,
  updatedAt: null,
  objective: null,
  consumerGeneration: null,
  ...o,
});
const task = (o: Partial<OrcaTask> & { id: string }): OrcaTask => ({
  createdByTerminalHandle: null,
  createdByPaneKey: null,
  createdByRunGeneration: null,
  runId: null,
  parentId: null,
  title: null,
  displayName: null,
  status: null,
  deps: null,
  createdAt: null,
  completedAt: null,
  ...o,
});
const worker = (o: Partial<OrcaWorker> & { dispatchId: string }): OrcaWorker => ({
  taskId: null,
  runId: null,
  workerState: null,
  dispatchStatus: null,
  liveness: null,
  terminalHandle: null,
  terminalState: null,
  worktreeId: null,
  structuredSessionId: null,
  attentionCategories: [],
  activity: null,
  ...o,
});

test('生の読みから、Run の世代、task の作成者の paneKey と世代、Dispatch の workerState と attention の表を作る', () => {
  const extras = buildOrchestrationExtras({
    runs: [run({ id: 'r1', consumerGeneration: 2 }), run({ id: 'r2' })],
    tasks: [task({ id: 't1', createdByPaneKey: 'p:1', createdByRunGeneration: 2 }), task({ id: 't2' })],
    workers: [
      worker({ dispatchId: 'd1', workerState: 'running', attentionCategories: ['input'], activity: 'working' }),
      worker({ dispatchId: 'd2' }),
    ],
  });
  assert.deepEqual(extras.runs.get('r1'), { generation: 2 });
  assert.deepEqual(extras.runs.get('r2'), { generation: null });
  assert.deepEqual(extras.tasks.get('t1'), { paneKey: 'p:1', generation: 2 });
  assert.deepEqual(extras.tasks.get('t2'), { paneKey: null, generation: null });
  assert.deepEqual(extras.workers.get('d1'), { workerState: 'running', attention: ['input'], activity: 'working' });
  assert.deepEqual(extras.workers.get('d2'), { workerState: null, attention: [], activity: null });
});

test('読めていない取得元は空の表にする', () => {
  const extras = buildOrchestrationExtras({ runs: null, tasks: null, workers: null });
  assert.equal(extras.runs.size, 0);
  assert.equal(extras.tasks.size, 0);
  assert.equal(extras.workers.size, 0);
});
