import assert from 'node:assert/strict';
import test from 'node:test';
import { selectMailRuns } from '../../src/inbox/select-runs.ts';
import type { OrcaRun, OrcaWorker } from '../../src/orca/read-state.ts';
import { fact, input, NOW, task } from './fixture.ts';

const OLD = new Date(NOW - 8 * 86_400_000).toISOString();
const RECENT = new Date(NOW - 1000).toISOString();
const run = (id: string, updatedAt: string | null = OLD): OrcaRun => ({
  id,
  updatedAt,
  coordinatorHandle: null,
  objective: null,
});
const worker = (runId: string, patch: Partial<OrcaWorker> = {}): OrcaWorker => ({
  runId,
  dispatchId: `d:${runId}`,
  taskId: null,
  workerState: 'working',
  terminalState: 'attached',
  terminalHandle: null,
  dispatchStatus: null,
  liveness: null,
  worktreeId: null,
  ...patch,
});

test('古い Run も生きた worker、解けた統括、最近の task があれば選ぶ', () => {
  const state = input({
    runs: [
      {
        id: 'coordinator',
        coordinatorHandle: 'term-a',
        activeCoordinatorHandle: 'term-a',
        coordinatorResolvedBy: 'run',
        coordinatorWorktreeId: fact(null),
        title: fact(null),
      },
    ],
    tasks: [
      task({ id: 't-created', runId: 'created', createdAt: fact(RECENT) }),
      task({ id: 't-completed', runId: 'completed', completedAt: fact(RECENT) }),
      task({ id: 't-old', runId: 'old-task', createdAt: fact(OLD) }),
    ],
  }).state;
  const runs = ['worker', 'coordinator', 'created', 'completed', 'old-task', 'old', 'settled', 'retained'].map((id) =>
    run(id),
  );
  runs.push(run('null', null), run('invalid', 'bad'), run('recent', RECENT));
  const workers = [
    worker('worker'),
    worker('settled', { workerState: 'succeeded', terminalState: 'released' }),
    worker('retained', { workerState: 'succeeded', terminalState: 'attached' }),
  ];
  const before = structuredClone({ runs, workers, state });
  assert.deepEqual(
    selectMailRuns({ runs, workers, state, now: NOW }).map((r) => r.id),
    ['coordinator', 'retained', 'worker', 'recent', 'completed', 'created', 'null'],
  );
  assert.deepEqual({ runs, workers, state }, before);
});

test('上限内で動いている Run を優先し、その中でも更新時刻降順と null 最後を守る', () => {
  const runs = [
    run('active-null', null),
    run('recent', RECENT),
    run('active-z'),
    run('active-a'),
    run('active-recent', RECENT),
    ...Array.from({ length: 60 }, (_, n) => run(`r${n}`, RECENT)),
  ];
  const workers = ['active-null', 'active-z', 'active-a', 'active-recent'].map((id) => worker(id));
  const state = input().state;
  const result = selectMailRuns({ runs, workers, state, now: NOW });
  assert.equal(result.length, 50);
  assert.deepEqual(
    result.slice(0, 4).map((r) => r.id),
    ['active-recent', 'active-a', 'active-z', 'active-null'],
  );
  assert.deepEqual(
    selectMailRuns({ runs, workers, state, now: NOW, limit: 2 }).map((r) => r.id),
    ['active-recent', 'active-a'],
  );
});

test('7日境界の SQLite UTC と ISO の task は含め、境界直前と不正値は除く', () => {
  const boundary = new Date(NOW - 7 * 86_400_000).toISOString();
  const state = input({
    tasks: [
      task({ runId: 'task-boundary', createdAt: fact(boundary) }),
      task({ runId: 'task-old', completedAt: fact(new Date(NOW - 7 * 86_400_000 - 1).toISOString()) }),
      task({ runId: 'task-invalid', createdAt: fact('bad') }),
    ],
  }).state;
  assert.deepEqual(
    selectMailRuns({
      runs: [
        run('iso', boundary),
        run('sqlite', '2025-12-26 12:00:00'),
        run('task-boundary'),
        run('task-old'),
        run('task-invalid'),
      ],
      workers: [],
      state,
      now: NOW,
    }).map((r) => r.id),
    ['iso', 'sqlite', 'task-boundary'],
  );
});
