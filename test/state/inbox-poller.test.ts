import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MailReader } from '../../src/orca/read-mail.ts';
import type { OrcaRun, SourceRead } from '../../src/orca/read-state.ts';
import { StatePoller } from '../../src/state/poller.ts';
import { message } from '../inbox/fixture.ts';
import { report, staticReader } from './helpers.ts';

const NOW = Date.parse('2026-11-13T00:00:00Z');
const ok = <T>(data: T): SourceRead<T> => ({ ok: true, data, truncated: false });
const fail = { ok: false, error: { kind: 'timeout', message: 'fake timeout' } } as const;

async function harness(runs: OrcaRun[] = [{ id: 'r1', coordinatorHandle: null, objective: null, updatedAt: null }]) {
  let now = NOW;
  let connected = true;
  const reader = await staticReader();
  reader.runs = async () => ok(runs);
  const calls: string[] = [];
  const mailReader: MailReader = {
    async readRunMail(id) {
      calls.push(id);
      return ok([message({ id: `m:${id}`, runId: id })]);
    },
    async readGates() {
      return ok([]);
    },
  };
  const p = new StatePoller({ reader, mailReader, capabilities: async () => report({ connected }), now: () => now });
  return {
    p,
    reader,
    mailReader,
    calls,
    disconnect() {
      connected = false;
    },
    advance(ms: number) {
      now += ms;
    },
  };
}

test('受け箱を見る人だけが連絡を有効にし、同じ間隔では共有する', async () => {
  const h = await harness();
  await h.p.snapshot();
  h.p.noteViewer();
  await h.p.tick();
  assert.deepEqual(h.calls, []);
  h.p.noteInboxViewer();
  const a = await h.p.inboxSnapshot();
  assert.equal(a.mail.stale, false);
  assert.equal(a.mail.runsRead, 1);
  assert.equal(a.mail.messages[0]?.id, 'm:r1');
  await h.p.inboxSnapshot();
  assert.deepEqual(h.calls, ['r1']);
});

test('Run は7日以内の新しい順、null はid順で後ろ、上限50、同時要求は4まで', async () => {
  const run = (id: string, updatedAt: string | null): OrcaRun => ({
    id,
    updatedAt,
    coordinatorHandle: null,
    objective: null,
  });
  const h = await harness([
    run('null-z', null),
    run('old', new Date(NOW - 7 * 86400000 - 1).toISOString()),
    run('null-a', null),
    run('invalid', 'bad time'),
    ...Array.from({ length: 49 }, (_, i) => run(`r${i}`, new Date(NOW - i * 1000).toISOString())).reverse(),
  ]);
  let active = 0;
  let max = 0;
  h.mailReader.readRunMail = async (id) => {
    h.calls.push(id);
    active++;
    max = Math.max(max, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--;
    return ok([]);
  };
  h.mailReader.readGates = async () => {
    active++;
    max = Math.max(max, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--;
    return ok([]);
  };
  h.p.noteInboxViewer();
  const s = await h.p.inboxSnapshot();
  assert.equal(s.mail.runsRead, 50);
  assert.deepEqual(h.calls.slice(0, 3), ['r0', 'r1', 'r2']);
  assert.equal(h.calls.at(-1), 'null-a');
  assert.equal(h.calls.length, 50);
  assert.ok(max <= 4 && max > 1, `max=${max}`);
});

test('失敗したRunの前の連絡と門を残し、部分成功はerrorなし、全失敗はerrorとstaleになる', async () => {
  const h = await harness(
    ['r1', 'r2'].map((id) => ({ id, coordinatorHandle: null, objective: null, updatedAt: null })),
  );
  h.mailReader.readGates = async (id) =>
    ok([{ id: `g:${id}`, taskId: null, status: 'pending', question: '仮の門', createdAt: null }]);
  h.p.noteInboxViewer();
  const first = await h.p.inboxSnapshot();
  h.mailReader.readRunMail = async (id) => (id === 'r1' ? fail : ok([message({ id: 'm:new', runId: id })]));
  h.advance(10000);
  await h.p.tick();
  const partial = await h.p.inboxSnapshot();
  assert.deepEqual(
    partial.mail.messages.map((m) => m.id),
    ['m:r1', 'm:new'],
  );
  assert.deepEqual(
    partial.mail.gates.map((g) => g.id),
    ['g:r1', 'g:r2'],
  );
  assert.equal(partial.mail.runsRead, 1);
  assert.equal(partial.mail.runsFailed, 1);
  assert.equal(partial.mail.error, null);
  assert.equal(partial.mail.stale, false);
  assert.notEqual(partial.mail.lastSuccessAt, first.mail.lastSuccessAt);
  h.mailReader.readRunMail = async () => fail;
  h.advance(10000);
  await h.p.tick();
  const all = await h.p.inboxSnapshot();
  assert.deepEqual(all.mail.messages, partial.mail.messages);
  assert.equal(all.mail.runsRead, 0);
  assert.equal(all.mail.runsFailed, 2);
  assert.equal(all.mail.error?.kind, 'timeout');
  assert.equal(all.mail.stale, true);
  assert.equal(all.mail.lastSuccessAt, partial.mail.lastSuccessAt);
});

test('runs が未成功なら runs-unavailable、成功した0件だけが連絡の成功になる', async () => {
  const h = await harness();
  h.reader.runs = async () => fail;
  h.p.noteInboxViewer();
  const unavailable = await h.p.inboxSnapshot();
  assert.equal(unavailable.mail.error?.kind, 'runs-unavailable');
  assert.equal(unavailable.mail.lastSuccessAt, null);
  assert.equal(unavailable.mail.stale, true);
  assert.deepEqual(h.calls, []);
  h.reader.runs = async () => ok([]);
  h.advance(10000);
  await h.p.tick();
  const empty = await h.p.inboxSnapshot();
  assert.equal(empty.mail.runsRead, 0);
  assert.equal(empty.mail.runsFailed, 0);
  assert.equal(empty.mail.error, null);
  assert.equal(empty.mail.stale, false);
  assert.equal(empty.mail.lastSuccessAt, new Date(NOW + 10000).toISOString());
});

test('端末の最後の一言は正規化と同じpaneKeyかtab idで返し、状態の文書には出ない', async () => {
  const h = await harness([]);
  const tabs = await h.reader.tabs();
  assert.ok(tabs.ok);
  const original = tabs.data.flatMap((s) => s.tabs).find((t) => t.agentStatus);
  assert.ok(original?.agentStatus);
  const as = { ...original.agentStatus, lastAssistantMessage: '仮の最後の一言' };
  h.reader.tabs = async () =>
    ok([
      {
        worktreeId: 'wt-a',
        tabs: [
          { ...original, id: 'leaf', parentTabId: 'parent', leafId: 'pane', agentStatus: as },
          { ...original, id: 'fallback', parentTabId: null, leafId: null, agentStatus: as },
          { ...original, type: 'chat', id: 'chat', agentStatus: as },
        ],
      },
    ]);
  const s = await h.p.inboxSnapshot();
  assert.deepEqual(
    [...s.lastWords],
    [
      ['parent:pane', '仮の最後の一言'],
      ['fallback', '仮の最後の一言'],
    ],
  );
  const ids = s.state.agents.map((a) => a.id);
  assert.ok(ids.includes('parent:pane') && ids.includes('fallback'));
  assert.ok(!JSON.stringify(s.state).includes('仮の最後の一言'));
});

test('未成功はstaleで、見る人が去っても現在間隔の3倍を超えるとstaleになる', async () => {
  const h = await harness();
  const unread = await h.p.inboxSnapshot();
  assert.equal(unread.mail.stale, true);
  assert.equal(unread.mail.lastSuccessAt, null);
  h.p.noteInboxViewer();
  await h.p.inboxSnapshot();
  h.advance(30000);
  assert.equal((await h.p.inboxSnapshot()).mail.stale, false);
  // 最初の30秒では再取得されるので、最後の成功はNOW+30000。
  h.advance(60001);
  const stopped = await h.p.inboxSnapshot();
  assert.equal(stopped.mail.stale, false, 'idle間隔30秒の3倍より前');
  h.advance(29999);
  assert.equal((await h.p.inboxSnapshot()).mail.stale, false, 'ちょうど3倍');
  h.advance(1);
  assert.equal((await h.p.inboxSnapshot()).mail.stale, true, '3倍を超過');
  await h.p.tick();
  assert.equal(h.calls.length, 2, '見る人がいなくなっても状態の閲覧だけでは連絡を読まない');
});

test('Orcaに届かなければ連絡を呼ばず最後の内容をstaleとunreachableで返す', async () => {
  const h = await harness();
  h.p.noteInboxViewer();
  const first = await h.p.inboxSnapshot();
  h.disconnect();
  h.advance(10000);
  await h.p.tick();
  const last = await h.p.inboxSnapshot();
  assert.deepEqual(last.mail.messages, first.mail.messages);
  assert.equal(last.mail.lastSuccessAt, first.mail.lastSuccessAt);
  assert.equal(last.mail.stale, true);
  assert.equal(last.mail.error?.kind, 'unreachable');
  assert.equal(last.state.connection.state, 'unreachable');
  assert.equal(h.calls.length, 1);
});

test('Run の7日境界は SQLite UTC と ISO を同じ時刻として含める', async () => {
  const h = await harness([
    { id: 'sql', coordinatorHandle: null, objective: null, updatedAt: '2026-11-06 00:00:00' },
    { id: 'iso', coordinatorHandle: null, objective: null, updatedAt: '2026-11-06T00:00:00Z' },
    { id: 'expired', coordinatorHandle: null, objective: null, updatedAt: '2026-11-05T23:59:59.999Z' },
  ]);
  h.p.noteInboxViewer();
  await h.p.inboxSnapshot();
  assert.deepEqual(h.calls, ['iso', 'sql']);
});

test('門だけの失敗もRun全体の失敗として両方の前回値を保ち、例外も捕捉する', async () => {
  const h = await harness();
  h.p.noteInboxViewer();
  h.mailReader.readGates = async () => fail;
  const first = await h.p.inboxSnapshot();
  assert.equal(first.mail.lastSuccessAt, null);
  assert.equal(first.mail.stale, true);
  assert.equal(first.mail.runsFailed, 1);
  assert.deepEqual(first.mail.messages, []);
  h.advance(10000);
  h.mailReader.readGates = async () =>
    ok([{ id: 'g1', taskId: null, status: 'pending', createdAt: null, question: '仮の門' }]);
  await h.p.tick();
  const success = await h.p.inboxSnapshot();
  h.mailReader.readRunMail = async () => ok([message({ id: 'new' })]);
  h.mailReader.readGates = async () => {
    throw new Error('fake exception');
  };
  h.advance(10000);
  await h.p.tick();
  const failed = await h.p.inboxSnapshot();
  assert.deepEqual(failed.mail.messages, success.mail.messages);
  assert.deepEqual(failed.mail.gates, success.mail.gates);
  assert.equal(failed.mail.error?.kind, 'exception');
  assert.equal(failed.mail.runsRead, 0);
});

test('初回の同時要求は進行中の連絡の読みを共有する', async () => {
  const h = await harness();
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.mailReader.readRunMail = async (id) => {
    h.calls.push(id);
    await pending;
    return ok([]);
  };
  h.p.noteInboxViewer();
  const first = h.p.inboxSnapshot();
  const second = h.p.inboxSnapshot();
  release();
  await Promise.all([first, second]);
  assert.deepEqual(h.calls, ['r1']);
});
