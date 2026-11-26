import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MailReader } from '../../src/orca/read-mail.ts';
import type { OrcaRun, OrcaWorker, SourceRead } from '../../src/orca/read-state.ts';
import type { RunThreads, ThreadReader } from '../../src/orca/read-threads.ts';
import { StatePoller } from '../../src/state/poller.ts';
import { report, staticReader } from './helpers.ts';

const NOW = Date.parse('2026-11-26T00:00:00Z');
const ok = <T>(data: T): SourceRead<T> => ({ ok: true, data, truncated: false });

const run = (id: string): OrcaRun => ({
  id,
  coordinatorHandle: null,
  objective: null,
  consumerGeneration: null,
  updatedAt: null,
});
const worker = (dispatchId: string, runId: string, attentionCategories: string[]): OrcaWorker => ({
  dispatchId,
  taskId: `t-${dispatchId}`,
  runId,
  workerState: 'blocked',
  dispatchStatus: null,
  liveness: null,
  terminalHandle: null,
  terminalState: null,
  worktreeId: null,
  structuredSessionId: null,
  attentionCategories,
  activity: null,
});

async function harness(failThreads = false) {
  let now = NOW;
  const reader = await staticReader();
  reader.runs = async () => ok(['r1', 'r2', 'r3'].map(run));
  reader.workers = async () =>
    ok([
      worker('d1', 'r1', ['input']),
      worker('d2', 'r2', ['approval']),
      worker('d3', 'r3', []),
      worker('d4', 'r1', ['input', 'approval']),
    ]);
  const threadCalls: string[] = [];
  const gateCalls: string[] = [];
  const threadReader: ThreadReader = {
    async readThreads(id) {
      threadCalls.push(id);
      if (failThreads) return { ok: false, error: { kind: 'timeout', message: 'fake' } };
      const data: RunThreads = {
        messages: [],
        questions: new Map([['d1', { latestId: 'q1', latestAt: null, answered: true }]]),
      };
      return ok(data);
    },
  };
  const mailReader: MailReader = {
    async readRunMail() {
      return ok([]);
    },
    async readGates(id) {
      gateCalls.push(id);
      return ok([{ id: 'g1', taskId: 't-d2', status: 'pending' as const, createdAt: null, question: '仮の問い' }]);
    },
  };
  const p = new StatePoller({
    reader,
    mailReader,
    threadReader,
    capabilities: async () => report({ connected: true }),
    now: () => now,
  });
  return {
    p,
    threadCalls,
    gateCalls,
    advance(ms: number) {
      now += ms;
    },
  };
}

test('iss-00098 T-05: 読むのは attention input・approval のある worker の Run だけ。input はやり取り、approval は門', async () => {
  const h = await harness();
  const { extras, state } = await h.p.snapshotWithExtras();
  assert.deepEqual(h.threadCalls, ['r1']);
  assert.deepEqual(h.gateCalls.sort(), ['r1', 'r2']);
  assert.deepEqual([...extras.threads.keys()], ['r1']);
  assert.equal(extras.threads.get('r1')?.ok, true);
  assert.equal(extras.threads.get('r1')?.questions.get('d1')?.answered, true);
  assert.deepEqual([...(extras.gates.get('r2')?.pendingTasks ?? [])], ['t-d2']);
  assert.equal(extras.gates.get('r2')?.ok, true);
  const text = JSON.stringify(state);
  for (const word of ['threads', 'pendingTasks', 'answered', '仮の問い', 'latestId'])
    assert.ok(!text.includes(word), word);
});

test('iss-00098 T-05: 同じ世代では読み直さず、次の orchestration の読みで1回ずつ読む', async () => {
  const h = await harness();
  await h.p.snapshotWithExtras();
  await h.p.snapshotWithExtras();
  await h.p.tick();
  assert.deepEqual(h.threadCalls, ['r1']);
  h.advance(10 * 60_000);
  await h.p.tick();
  await h.p.snapshotWithExtras();
  assert.deepEqual(h.threadCalls, ['r1', 'r1']);
});

test('iss-00098 T-05: 読めなければ ok 偽で持つ（判定は Orca の印のとおり）', async () => {
  const h = await harness(true);
  const { extras } = await h.p.snapshotWithExtras();
  assert.equal(extras.threads.get('r1')?.ok, false);
  assert.equal(extras.threads.get('r1')?.questions.size, 0);
});
