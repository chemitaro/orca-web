import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CapabilityReport } from '../../src/orca/capabilities.ts';
import type { OrcaTask, StateReader } from '../../src/orca/read-state.ts';
import { StatePoller } from '../../src/state/poller.ts';
import { expectedState } from './expected.ts';
import { ms, PRIVATE_PATHS, PRIVATE_TEXTS, WT1 } from './fixture.ts';
import { CountingReader, replayReader, report, staticReader } from './helpers.ts';

class Clock {
  t = ms(40);
  now = (): number => this.t;
  advance(seconds: number): void {
    this.t += seconds * 1000;
  }
}

function poller(
  reader: StateReader,
  clock = new Clock(),
  capabilities: () => Promise<CapabilityReport> = async () => report(),
) {
  return new StatePoller({ reader, capabilities, now: clock.now });
}

test('揃った録画から、ポーリングを通した文書の全体が、期待する JSON と一致する', async () => {
  const { reader, runner, transport } = replayReader();
  const p = poller(reader);
  const doc = await p.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), expectedState);
  // 終わって端末を返した担当（ctx_hex-6）の worker-show は呼ばない。
  assert.ok(!runner.calls.some((argv) => argv.includes('ctx_hex-6')));
  assert.deepEqual(
    transport.calls.map((c) => c.method),
    ['session.tabs.listAll'],
  );
});

test('文書の文字列に、プロンプト、ツールの入力、最後の応答、Task の spec と result、transcript のパスが現れない', async () => {
  const { reader } = replayReader();
  const text = JSON.stringify(await poller(reader).snapshot());
  for (const secret of [...PRIVATE_TEXTS, ...PRIVATE_PATHS, 'text-907', 'text-908', 'text-909', 'text-910']) {
    assert.ok(!text.includes(secret), `${secret} must not appear`);
  }
  assert.ok(!text.includes('authToken'));
});

test('続けて snapshot を呼んでも、間隔の中では Orca を呼ばず、途中の読みを共有する', async () => {
  const counting = new CountingReader(await staticReader());
  const clock = new Clock();
  const p = poller(counting, clock);
  await Promise.all([p.snapshot(), p.snapshot(), p.snapshot()]);
  const first = counting.calls.length;
  assert.equal(counting.calls.filter((c) => c === 'tabs').length, 1);
  for (let i = 0; i < 5; i++) {
    p.noteViewer();
    await p.tick();
    await p.snapshot();
  }
  assert.equal(counting.calls.length, first);
  // 同じ Dispatch の worker-show は、時間がたっても1回だけ。
  clock.advance(10);
  await p.tick();
  assert.equal(counting.calls.filter((c) => c === 'workerLaunch:ctx_hex-1').length, 1);
  assert.equal(counting.calls.filter((c) => c === 'tabs').length, 2);
  assert.equal(counting.calls.filter((c) => c === 'runs').length, 2);
});

test('見る人がいないと間隔が遅くなり、要求が来ると元に戻る', async () => {
  const counting = new CountingReader(await staticReader());
  const clock = new Clock();
  const p = poller(counting, clock);
  p.noteViewer();
  await p.snapshot();
  const tabs = () => counting.calls.filter((c) => c === 'tabs').length;
  clock.advance(5);
  await p.tick();
  assert.equal(tabs(), 2, '見ているときは 5秒');
  clock.advance(60);
  await p.tick();
  assert.equal(tabs(), 3);
  // 最後の要求から 60秒を過ぎた。次は 30秒後。
  clock.advance(5);
  await p.tick();
  assert.equal(tabs(), 3, '見る人がいないときは 5秒では読まない');
  clock.advance(25);
  await p.tick();
  assert.equal(tabs(), 4, '見る人がいないときは 30秒');
  clock.advance(5);
  p.noteViewer();
  await p.tick();
  assert.equal(tabs(), 5, '要求が来たら、最後の取得から 5秒を過ぎていればすぐ読む');
  assert.equal(p.snapshotSync().sources.tabs.stale, false);
});

test('終わった Run の task-list は遅い間隔で読み、終わっていない Run は毎回読む', async () => {
  const counting = new CountingReader(await staticReader());
  const clock = new Clock();
  const p = poller(counting, clock);
  p.noteViewer();
  await p.snapshot();
  const count = (run: string) => counting.calls.filter((c) => c === `tasks:${run}`).length;
  clock.advance(10);
  p.noteViewer();
  await p.tick();
  assert.equal(count('run_hex-3'), 2, '担当が動いている Run は毎回');
  assert.equal(count('run_hex-4'), 1, 'Task がすべて終わり担当もいない Run は読まない');
  clock.advance(50);
  p.noteViewer();
  await p.tick();
  assert.equal(count('run_hex-4'), 2, '60秒たてば読む');
});

test('Orca が動いていないと unreachable と前に読めた値を返し、stale が真になり、例外にならない', async () => {
  const clock = new Clock();
  let connected = true;
  const p = poller(await staticReader(), clock, async () => report({ connected }));
  await p.snapshot();
  connected = false;
  clock.advance(120);
  await p.tick();
  const doc = await p.snapshot();
  assert.equal(doc.connection.state, 'unreachable');
  assert.equal(doc.connection.reason, 'orca status: spawn-failed');
  assert.equal(doc.stale, true);
  assert.equal(doc.sources.tabs.stale, true);
  assert.equal(doc.sources.tabs.lastSuccessAt, new Date(ms(40)).toISOString());
  assert.equal(doc.sources.tabs.error?.kind, 'unreachable');
  assert.equal(doc.agents.length, expectedState.agents.length, '前に読めたエージェントが残る');
});

test('一度も読めていなければ、空の一覧と source-failed の取得元を返す', async () => {
  const counting = new CountingReader(await staticReader());
  const p = poller(counting, new Clock(), async () => report({ connected: false }));
  const doc = await p.snapshot();
  assert.equal(doc.connection.state, 'unreachable');
  assert.deepEqual([doc.repos, doc.worktrees, doc.agents, doc.runs, doc.tasks, doc.workers], [[], [], [], [], [], []]);
  assert.equal(doc.sources.worktreePs.lastSuccessAt, null);
  assert.equal(doc.sources.worktreePs.stale, true);
  assert.deepEqual(counting.calls, [], 'つながらないときは Orca を読まない');
});

test('1つの取得元だけ失敗すると、その取得元だけが前の値と誤りで返り、ほかは新しい値になる', async () => {
  const counting = new CountingReader(await staticReader());
  const clock = new Clock();
  const p = poller(counting, clock);
  p.noteViewer();
  await p.snapshot();
  counting.overrides.terminals = async () => ({ ok: false, error: { kind: 'timeout', message: 'timed out' } });
  clock.advance(5);
  p.noteViewer();
  await p.tick();
  const doc = await p.snapshot();
  assert.equal(doc.connection.state, 'connected');
  assert.deepEqual(doc.sources.terminals.error, { kind: 'timeout', message: 'timed out' });
  assert.equal(doc.sources.terminals.stale, true);
  assert.equal(doc.sources.terminals.lastSuccessAt, new Date(ms(40)).toISOString());
  assert.equal(doc.sources.tabs.stale, false);
  assert.equal(doc.sources.tabs.fetchedAt, new Date(ms(40) + 5000).toISOString());
  const claude = doc.agents.find((a) => a.id === 'uuid-10:uuid-11');
  assert.equal(claude?.lastOutputAt.value, new Date(ms(33)).toISOString(), '前の値を使う');
});

test('readTabs が使えないと tabs を読まず、ps のエージェントで返り、タブの項目は source-unavailable になる', async () => {
  const counting = new CountingReader(await staticReader());
  const p = poller(counting, new Clock(), async () => report({ readTabs: false }));
  const doc = await p.snapshot();
  assert.ok(!counting.calls.includes('tabs'));
  assert.equal(doc.sources.tabs.error?.kind, 'unavailable');
  assert.deepEqual(
    doc.agents.map((a) => [a.id, a.kind]),
    [
      ['uuid-40:uuid-41', 'untabbed'],
      ['uuid-10:uuid-11', 'untabbed'],
    ],
  );
  const claude = doc.agents.find((a) => a.id === 'uuid-10:uuid-11');
  assert.equal(claude?.worktreeId, WT1);
  assert.equal(claude?.state.value, 'working');
  assert.equal(claude?.terminal.missing, 'source-unavailable');
  assert.equal(claude?.effort.missing, 'source-unavailable');
  assert.equal(claude?.model.missing, 'source-unavailable');
  assert.equal(doc.connection.state, 'connected');
});

test('形の違う応答の取得元は invalid-shape の誤りになり、ほかの取得元は読める', async () => {
  const counting = new CountingReader(await staticReader());
  counting.overrides.repos = async () => ({ ok: false, error: { kind: 'invalid-shape', message: 'repo list: x' } });
  const doc = await poller(counting).snapshot();
  assert.equal(doc.sources.repos.error?.kind, 'invalid-shape');
  assert.deepEqual(doc.repos, []);
  assert.equal(doc.worktrees.length, 3);
});

test('読み手が例外を投げても、取得元の誤りにして続ける', async () => {
  const counting = new CountingReader(await staticReader());
  counting.overrides.runs = async () => {
    throw new Error('boom');
  };
  const doc = await poller(counting).snapshot();
  assert.equal(doc.sources.runs.error?.kind, 'exception');
  assert.equal(doc.sources.tasks.error?.kind, 'exception');
  assert.equal(doc.workers.length, 2);
});

test('タイマーの最初の読みの途中に来た snapshot は、その読みの終わりを待つ', async () => {
  const p = poller(await staticReader());
  const ticking = p.tick();
  const doc = await p.snapshot();
  await ticking;
  assert.equal(doc.connection.state, 'connected');
  assert.equal(doc.agents.length, expectedState.agents.length);
});

test('受け箱用の lastAssistantMessage と updatedAt は状態の文書に公開しない', async () => {
  const reader = await staticReader();
  const tabs = await reader.tabs();
  assert.ok(tabs.ok);
  const tab = tabs.data[0]?.tabs.find((t) => t.agentStatus);
  assert.ok(tab?.agentStatus);
  tab.agentStatus.lastAssistantMessage = '仮の受け箱専用の一言';
  const runs = await reader.runs();
  assert.ok(runs.ok && runs.data[0]);
  runs.data[0].updatedAt = '2026-11-13T00:00:00Z';
  const text = JSON.stringify(await poller(reader).snapshot());
  assert.ok(!text.includes('lastAssistantMessage'));
  assert.ok(!text.includes('仮の受け箱専用'));
  assert.ok(!text.includes('updatedAt'));
});

test('統括の worktree は terminals を優先し、なければ agents に結び、欠けた理由を保つ', async () => {
  const make = async (handle: string | null, terminals: 'original' | 'empty' | 'failed' | 'different') => {
    const counting = new CountingReader(await staticReader());
    counting.overrides.runs = async () => ({
      ok: true,
      truncated: false,
      data: [{ id: 'r1', objective: null, updatedAt: null, coordinatorHandle: handle }],
    });
    if (terminals === 'different')
      counting.overrides.terminals = async () => ({
        ok: true,
        data: [{ handle: 'term_uuid-12', worktreeId: 'different-wt', connected: true, lastOutputAt: null }],
        truncated: false,
      });
    if (terminals === 'empty') counting.overrides.terminals = async () => ({ ok: true, data: [], truncated: false });
    if (terminals === 'failed')
      counting.overrides.terminals = async () => ({ ok: false, error: { kind: 'exception', message: '仮の失敗' } });
    return (await poller(counting).snapshot()).runs[0];
  };
  assert.deepEqual((await make('term_uuid-12', 'original'))?.coordinatorWorktreeId, {
    value: WT1,
    source: 'terminals',
    field: 'worktreeId',
    missing: null,
  });
  assert.equal((await make('term_uuid-12', 'different'))?.coordinatorWorktreeId.value, 'different-wt');
  assert.equal((await make('term_uuid-12', 'failed'))?.coordinatorWorktreeId.value, WT1);
  assert.equal((await make('term_uuid-12', 'empty'))?.coordinatorWorktreeId.value, WT1);
  assert.equal((await make('unknown', 'empty'))?.coordinatorWorktreeId.missing, 'not-linked');
  assert.equal((await make(null, 'original'))?.coordinatorWorktreeId.missing, 'not-provided');
  assert.equal((await make('unknown', 'failed'))?.coordinatorWorktreeId.missing, 'source-failed');
});

test('今ある Run の統括の端末を採用し、決めた根拠を run とする', async () => {
  const doc = await poller(await staticReader()).snapshot();
  const run = doc.runs.find((r) => r.coordinatorHandle === 'term_uuid-12');
  assert.ok(run);
  assert.equal(run.activeCoordinatorHandle, 'term_uuid-12');
  assert.equal(run.coordinatorResolvedBy, 'run');
});

function coordinatorTask(patch: Partial<OrcaTask> = {}): OrcaTask {
  return {
    id: 'task-current',
    runId: 'run-current',
    parentId: null,
    deps: null,
    title: '仮の依頼',
    displayName: null,
    status: null,
    createdAt: '2026-01-02T10:00:00Z',
    completedAt: null,
    createdByTerminalHandle: 'term-current',
    ...patch,
  };
}

async function coordinatorReader(handle: string | null, tasks: OrcaTask[]) {
  const reader = new CountingReader(await staticReader());
  reader.overrides.runs = async () => ({
    ok: true,
    truncated: false,
    data: [{ id: 'run-current', objective: '仮の統括', updatedAt: null, coordinatorHandle: handle }],
  });
  reader.overrides.tasks = async () => ({ ok: true, truncated: false, data: tasks });
  reader.overrides.terminals = async () => ({
    ok: true,
    truncated: false,
    data: [
      { handle: 'term-current', worktreeId: 'wt-current', connected: true, lastOutputAt: null },
      { handle: 'term-old', worktreeId: 'wt-old', connected: true, lastOutputAt: null },
    ],
  });
  return reader;
}

test('閉じた統括は、同じ Run の親なし task のうち今ある作り手の最新の端末に結ぶ', async () => {
  const reader = await coordinatorReader('term-closed', [
    coordinatorTask(),
    coordinatorTask({ id: 'old', createdAt: '2026-01-01T00:00:00Z', createdByTerminalHandle: 'term-old' }),
    coordinatorTask({
      id: 'child',
      parentId: 'task-current',
      createdAt: '2026-01-04T00:00:00Z',
      createdByTerminalHandle: 'term-old',
    }),
    coordinatorTask({
      id: 'other-run',
      runId: 'run-other',
      createdAt: '2026-01-05T00:00:00Z',
      createdByTerminalHandle: 'term-old',
    }),
    coordinatorTask({ id: 'closed', createdAt: '2026-01-06T00:00:00Z', createdByTerminalHandle: 'term-closed' }),
  ]);
  const run = (await poller(reader).snapshot()).runs[0];
  assert.ok(run);
  assert.equal(run.coordinatorHandle, 'term-closed');
  assert.equal(run.activeCoordinatorHandle, 'term-current');
  assert.equal(run.coordinatorResolvedBy, 'latest-task');
  assert.deepEqual(run.coordinatorWorktreeId, {
    value: 'wt-current',
    source: 'terminals',
    field: 'worktreeId',
    missing: null,
  });
});

test('Run の端末が今あれば、新しい task の作り手より優先する', async () => {
  const reader = await coordinatorReader('term-old', [coordinatorTask()]);
  const run = (await poller(reader).snapshot()).runs[0];
  assert.equal(run?.activeCoordinatorHandle, 'term-old');
  assert.equal(run?.coordinatorResolvedBy, 'run');
  assert.equal(run?.coordinatorWorktreeId.value, 'wt-old');
});

test('最新の依頼は時刻を正規化して比べ、同じ時刻なら id の順で最後に決める', async () => {
  const tasks = [
    coordinatorTask({ id: 'z-task', createdAt: '2026-01-02 10:00:00' }),
    coordinatorTask({ id: 'a-task', createdAt: '2026-01-02T19:00:00+09:00', createdByTerminalHandle: 'term-old' }),
    coordinatorTask({ id: 'zz-task', createdAt: '2026-01-02T18:59:59+09:00', createdByTerminalHandle: 'term-old' }),
  ];
  for (const ordered of [tasks, [...tasks].reverse()]) {
    const reader = await coordinatorReader(null, ordered);
    const run = (await poller(reader).snapshot()).runs[0];
    assert.equal(run?.activeCoordinatorHandle, 'term-current');
    assert.equal(run?.coordinatorResolvedBy, 'latest-task');
  }
});

test('今ある端末に結べる親なし task がなければ、登録時の統括と null を保つ', async () => {
  for (const handle of ['term-closed', null]) {
    const reader = await coordinatorReader(handle, [
      coordinatorTask({ createdByTerminalHandle: 'term-closed' }),
      coordinatorTask({ id: 'no-creator', createdByTerminalHandle: null }),
      coordinatorTask({ id: 'nested', parentId: 'task-current' }),
    ]);
    const run = (await poller(reader).snapshot()).runs[0];
    assert.equal(run?.activeCoordinatorHandle, handle);
    assert.equal(run?.coordinatorResolvedBy, null);
    assert.equal(run?.coordinatorWorktreeId.missing, handle === null ? 'not-provided' : 'not-linked');
  }
});

test('terminals が一度も読めなければ task の作り手を採用せず、登録時の統括と null を保つ', async () => {
  for (const handle of ['term-closed', null]) {
    const reader = await coordinatorReader(handle, [coordinatorTask()]);
    reader.overrides.terminals = async () => ({ ok: false, error: { kind: 'exception', message: '仮の失敗' } });
    const run = (await poller(reader).snapshot()).runs[0];
    assert.equal(run?.activeCoordinatorHandle, handle);
    assert.equal(run?.coordinatorResolvedBy, null);
    assert.equal(run?.coordinatorWorktreeId.missing, handle === null ? 'not-provided' : 'source-failed');
  }
});
