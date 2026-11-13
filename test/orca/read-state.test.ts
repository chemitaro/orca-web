import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrcaCli, ReadOnlyOrcaCli } from '../../src/orca/orca-cli.ts';
import { createStateReader } from '../../src/orca/read-state.ts';
import type { CliEntry, CliRecording } from '../../src/orca/replay/recording.ts';
import { ReplayCliRunner, ReplayRpcTransport } from '../../src/orca/replay/replay.ts';
import { assertRecordingSafe } from '../../src/orca/replay/sanitize.ts';
import { ReadOnlyRpc } from '../../src/orca/rpc.ts';
import {
  cliRecording,
  ms,
  PRIVATE_PATHS,
  PRIVATE_TEXTS,
  worktreePs as psFixture,
  rpcRecording,
  WT1,
} from '../state/fixture.ts';

function reader(cli: CliRecording = cliRecording()) {
  const runner = new ReplayCliRunner(cli);
  const rpc = new ReplayRpcTransport(rpcRecording());
  return {
    runner,
    rpc,
    reader: createStateReader(new ReadOnlyOrcaCli(new OrcaCli(runner)), new ReadOnlyRpc(rpc)),
  };
}

const okEntry = (argv: string[], result: unknown): CliEntry => ({
  argv: [...argv, '--json'],
  exitCode: 0,
  stdout: JSON.stringify({ ok: true, result }),
  stderr: '',
  delayMs: 0,
});

test('テストの録画は録画の検査を通る（手で書いた仮名の値だけ）', () => {
  assertRecordingSafe(cliRecording(), { homeDir: '/home-not-used' });
  assertRecordingSafe(rpcRecording(), { homeDir: '/home-not-used' });
});

test('read-state は取得元ごとの記録を返し、本文や transcript のパスを拾わない', async () => {
  const { reader: r } = reader();
  const results = await Promise.all([
    r.repos(),
    r.worktrees(),
    r.worktreePs(),
    r.terminals(),
    r.tabs(),
    r.runs(),
    r.tasks('run_hex-3'),
    r.workers(),
    r.workerLaunch('ctx_hex-1'),
  ]);
  for (const result of results) assert.equal(result.ok, true, JSON.stringify(result));
  const text = JSON.stringify(results);
  for (const secret of [...PRIVATE_TEXTS, ...PRIVATE_PATHS, 'text-907', 'text-908', 'text-909', 'text-910']) {
    assert.ok(!text.includes(secret), `${secret} must not be picked`);
  }

  const [repos, , ps, terminals, tabs, , tasks, , launch] = results;
  assert.deepEqual(repos.ok && repos.data, [
    { id: 'uuid-1', displayName: 'text-20', path: '/p-1', kind: 'git', remoteKey: 'github.com/owner-a/repo-a' },
  ]);
  assert.ok(ps.ok);
  assert.deepEqual(ps.data[0]?.agents[0], {
    paneKey: 'uuid-10:uuid-11',
    parentPaneKey: null,
    agentType: 'claude',
    state: 'working',
    stateStartedAt: ms(20),
    taskTitle: 'text-3',
  });
  assert.deepEqual(ps.data[0]?.linkedPR, {
    number: 12,
    state: 'open',
    title: 'text-1',
    url: 'text-2',
    checksStatus: 'success',
    checks: { total: 3, passed: 3, failed: 0, pending: 0, cancelled: 0, neutral: 0 },
  });
  assert.ok(terminals.ok);
  assert.deepEqual(terminals.data[0], {
    handle: 'term_uuid-12',
    worktreeId: WT1,
    connected: true,
    lastOutputAt: ms(33),
  });
  assert.ok(tabs.ok);
  const claudeTab = tabs.data[0]?.tabs[0];
  assert.deepEqual(claudeTab?.agentStatus, {
    lastAssistantMessage: null,
    agentType: 'claude',
    state: 'working',
    stateStartedAt: ms(21),
    model: null,
    effort: 'high',
    paneKey: 'uuid-10:uuid-11',
    orchestration: null,
  });
  assert.ok(tasks.ok);
  assert.deepEqual(tasks.data[1], {
    id: 'task_hex-5',
    runId: 'run_hex-3',
    parentId: 'task_hex-2',
    title: null,
    displayName: 'text-18',
    status: 'completed',
    deps: '["task_hex-2"]',
    createdAt: '2026-11-06 09:05:00',
    completedAt: '2026-11-06 09:10:00',
  });
  assert.deepEqual(launch.ok && launch.data, {
    requested: { agent: 'claude', model: 'claude-opus-5-5', effort: 'high' },
    effective: { agent: 'claude', model: 'claude-opus-5-5', effort: 'high' },
  });
});

test('run-list と worker-list はカーソルを最後まで読む', async () => {
  const { reader: r } = reader();
  const runs = await r.runs();
  assert.deepEqual(runs.ok && runs.data.map((x) => x.id), ['run_hex-3', 'run_hex-4']);
  assert.equal(runs.ok && runs.truncated, false);
  const workers = await r.workers();
  assert.deepEqual(workers.ok && workers.data.map((w) => w.dispatchId), ['ctx_hex-1', 'ctx_hex-6']);
  assert.ok(workers.ok);
  assert.deepEqual(workers.data[0], {
    dispatchId: 'ctx_hex-1',
    taskId: 'task_hex-2',
    runId: 'run_hex-3',
    workerState: 'ready',
    dispatchStatus: 'dispatched',
    liveness: 'live',
    terminalHandle: 'term_uuid-52',
    terminalState: 'retained',
    worktreeId: WT1,
  });
});

test('同じカーソルが2度出たら止めて truncated にする', async () => {
  const rec: CliRecording = {
    version: 1,
    kind: 'cli',
    entries: [
      okEntry(['orchestration', 'run-list', '--limit', '100'], { runs: [{ id: 'run_hex-1' }], nextCursor: 'c-1' }),
      okEntry(['orchestration', 'run-list', '--limit', '100', '--cursor', 'c-1'], {
        runs: [{ id: 'run_hex-2' }],
        nextCursor: 'c-1',
      }),
    ],
  };
  const runs = await reader(rec).reader.runs();
  assert.ok(runs.ok);
  assert.deepEqual(
    runs.data.map((x) => x.id),
    ['run_hex-1', 'run_hex-2'],
  );
  assert.equal(runs.truncated, true);
});

test('カーソルのない一覧は truncated なら totalCount まで上げて読み直し、それでも切れたら truncated を返す', async () => {
  const many = { ...psFixture, totalCount: 12000, truncated: true };
  const rec: CliRecording = {
    version: 1,
    kind: 'cli',
    entries: [
      okEntry(['worktree', 'ps', '--limit', '10000'], many),
      okEntry(['worktree', 'ps', '--limit', '12000'], { ...psFixture, totalCount: 12000, truncated: false }),
      okEntry(['terminal', 'list', '--limit', '10000'], { terminals: [], totalCount: 200000, truncated: true }),
      okEntry(['terminal', 'list', '--limit', '100000'], { terminals: [], totalCount: 200000, truncated: true }),
    ],
  };
  const { reader: r, runner } = reader(rec);
  const ps = await r.worktreePs();
  assert.equal(ps.ok && ps.truncated, false);
  assert.equal(ps.ok && ps.data.length, 2);
  const terms = await r.terminals();
  assert.equal(terms.ok && terms.truncated, true);
  assert.equal(runner.calls.length, 4);
});

test('CLI の誤りと形の違いは、種類と短い文の誤りになる', async () => {
  const rec: CliRecording = {
    version: 1,
    kind: 'cli',
    entries: [
      {
        argv: ['repo', 'list', '--json'],
        exitCode: null,
        stdout: '',
        stderr: '',
        delayMs: 0,
        timedOut: true,
      },
      okEntry(['worktree', 'list', '--limit', '10000'], { nope: true }),
      {
        argv: ['orchestration', 'worker-show', '--dispatch', 'ctx_hex-9', '--full', '--json'],
        exitCode: 1,
        stdout: JSON.stringify({ ok: false, error: { code: 'not_found', message: 'no such dispatch' } }),
        stderr: '',
        delayMs: 0,
      },
    ],
  };
  const { reader: r } = reader(rec);
  const repos = await r.repos();
  assert.equal(!repos.ok && repos.error.kind, 'timeout');
  const wts = await r.worktrees();
  assert.equal(!wts.ok && wts.error.kind, 'invalid-shape');
  const show = await r.workerLaunch('ctx_hex-9');
  assert.deepEqual(!show.ok && show.error, { kind: 'orca-error', message: 'not_found: no such dispatch' });
});

test('JSON でない stdout は、取得元の誤りの文に出ない（FQG-001）', async () => {
  const leak = 'PRIVATE raw orca output';
  const rec: CliRecording = {
    version: 1,
    kind: 'cli',
    entries: [
      { argv: ['repo', 'list', '--json'], exitCode: 0, stdout: leak, stderr: '', delayMs: 0 },
      { argv: ['worktree', 'list', '--limit', '10000', '--json'], exitCode: 1, stdout: leak, stderr: '', delayMs: 0 },
    ],
  };
  const { reader: r } = reader(rec);
  const repos = await r.repos();
  const wts = await r.worktrees();
  assert.deepEqual(!repos.ok && repos.error, { kind: 'invalid-json', message: 'stdout is not JSON (23 bytes)' });
  assert.deepEqual(!wts.ok && wts.error, { kind: 'exit-nonzero', message: 'exited with code 1' });
});

test('受け箱専用に lastAssistantMessage は500文字、Run は updated_at を拾う', async () => {
  const cli: CliRecording = {
    version: 1,
    kind: 'cli',
    entries: [
      okEntry(['orchestration', 'run-list', '--limit', '100'], {
        runs: [{ id: 'r1', updated_at: '2026-11-13' }, { id: 'r2' }],
      }),
    ],
  };
  const rpc = rpcRecording();
  const entry = rpc.exchanges.find((e) => e.method === 'session.tabs.listAll');
  assert.ok(entry);
  const result = {
    snapshots: [
      {
        worktree: WT1,
        tabs: [{ type: 'terminal', id: 'tab1', agentStatus: { lastAssistantMessage: '仮'.repeat(600) } }],
      },
    ],
  };
  entry.chunks = [`${JSON.stringify({ id: '$ID', ok: true, result })}\n`];
  const r = createStateReader(
    new ReadOnlyOrcaCli(new OrcaCli(new ReplayCliRunner(cli))),
    new ReadOnlyRpc(new ReplayRpcTransport(rpc)),
  );
  const tabs = await r.tabs();
  assert.equal(tabs.ok && tabs.data[0]?.tabs[0]?.agentStatus?.lastAssistantMessage, '仮'.repeat(500));
  const runs = await r.runs();
  assert.deepEqual(runs.ok && runs.data.map((run) => run.updatedAt), ['2026-11-13', null]);
});
