import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReadResult, Resolved, TranscriptReader, TranscriptTarget } from '../../src/orca/read-transcript.ts';
import { type TranscriptEvent, TranscriptHub } from '../../src/transcript/hub.ts';

const row = (id: string, text = id) => ({ id, role: 'assistant', blocks: [{ type: 'text', text }], timestamp: null });

const targetFor = (agentId: string, session: string): TranscriptTarget => ({
  agentId,
  source: 'nativeChat',
  agentType: 'claude',
  sessionId: session,
  transcriptPath: null,
  key: session.padEnd(16, '0').slice(0, 16),
});

/** 差し替えられる偽の読み手。エージェントごとにセッションと記録の行を持つ。 */
class FakeReader implements TranscriptReader {
  session = new Map<string, string>();
  rows = new Map<string, unknown[]>();
  resolveError: Resolved | null = null;
  readError: ReadResult | null = null;
  resolves = 0;
  reads = 0;
  hasMore = false;

  async resolve(agentId: string): Promise<Resolved> {
    this.resolves++;
    if (this.resolveError) return this.resolveError;
    const s = this.session.get(agentId);
    return s ? { ok: true, target: targetFor(agentId, s) } : { ok: false, error: 'agent_not_found' };
  }

  async read(target: TranscriptTarget): Promise<ReadResult> {
    this.reads++;
    if (this.readError) return this.readError;
    const rows = this.rows.get(`${target.agentId}/${target.sessionId}`) ?? [];
    return {
      ok: true,
      page: { source: 'nativeChat', rows, hasMore: this.hasMore, before: this.hasMore ? { offset: 1 } : null },
    };
  }
}

function setup(options: { maxWatches?: number; maxSubscribers?: number } = {}) {
  const reader = new FakeReader();
  let now = 0;
  const hub = new TranscriptHub({ reader, now: () => now, tailIntervalMs: 0, ...options });
  const advance = (ms: number) => {
    now += ms;
  };
  return { reader, hub, advance };
}

function collect(hub: TranscriptHub, agentId: string) {
  const events: TranscriptEvent[] = [];
  const sub = hub.subscribe(agentId, (e) => events.push(e));
  return { events, sub };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('窓の前進は今の hasMore が真のときだけ認め、40件でも偽なら replacement', async () => {
  for (const full of [false, true]) {
    const { reader, hub } = setup();
    reader.session.set('a', 's1');
    reader.hasMore = true;
    reader.rows.set(
      'a/s1',
      Array.from({ length: 40 }, (_, i) => row(`m${i + 1}`)),
    );
    const { events } = collect(hub, 'a');
    await hub.tick();
    reader.hasMore = full;
    reader.rows.set(
      'a/s1',
      Array.from({ length: 40 }, (_, i) => row(`m${i + 2}`)),
    );
    await hub.tick();
    const event = events[1];
    if (full) {
      assert.equal(event?.type, 'appended');
      assert.deepEqual(event.type === 'appended' && event.items.map((m) => m.id), ['m41']);
    } else {
      assert.equal(event?.type, 'replacement');
      assert.equal(event.type === 'replacement' && event.reason, 'rewritten');
    }
    hub.close();
  }
});

test('最初に snapshot、足されると appended だけ、書き換わると replacement が届く', async () => {
  const { reader, hub } = setup();
  reader.session.set('a', 's1');
  reader.rows.set('a/s1', [row('m1')]);
  const { events } = collect(hub, 'a');
  await settle();
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'snapshot');

  reader.rows.set('a/s1', [row('m1'), row('m2')]);
  await hub.tick();
  assert.equal(events[1]?.type, 'appended');
  assert.deepEqual(events[1]?.type === 'appended' && events[1].items.map((m) => m.id), ['m2']);

  await hub.tick();
  assert.equal(events.length, 2, '変化がなければ何も送らない');

  reader.rows.set('a/s1', [row('m1'), row('x')]);
  await hub.tick();
  assert.equal(events[2]?.type, 'replacement');
  assert.deepEqual(events[2]?.type === 'replacement' && events[2].document.messages.map((m) => m.id), ['m1', 'x']);
});

test('同じエージェントの2つの購読は読みを共有し、最後の購読が閉じると読みが止まる', async () => {
  const { reader, hub } = setup();
  reader.session.set('a', 's1');
  reader.rows.set('a/s1', [row('m1')]);
  const one = collect(hub, 'a');
  await settle();
  const two = collect(hub, 'a');
  assert.equal(two.events[0]?.type, 'snapshot', '後から来た購読者には持っている窓をすぐ送る');
  const before = reader.reads;
  await hub.tick();
  assert.equal(reader.reads, before + 1, '1回の間隔で1回だけ読む');
  assert.equal(hub.watchCount, 1);
  assert.ok(one.sub.ok && two.sub.ok);
  one.sub.unsubscribe();
  assert.equal(hub.watchCount, 1);
  two.sub.unsubscribe();
  assert.equal(hub.watchCount, 0);
  assert.equal(hub.subscriberCount, 0);
  const reads = reader.reads;
  await hub.tick();
  assert.equal(reader.reads, reads, '見る人がいなければ読まない');
});

test('同じ枠でセッションが変わったら、追記ではなく replacement（session-changed）を送る', async () => {
  const { reader, hub, advance } = setup();
  reader.session.set('a', 's1');
  reader.rows.set('a/s1', [row('m1')]);
  reader.rows.set('a/s2', [row('m1'), row('m2')]);
  const { events } = collect(hub, 'a');
  await settle();
  reader.session.set('a', 's2');
  advance(5_000);
  await hub.tick();
  assert.equal(events[1]?.type, 'replacement');
  assert.equal(events[1]?.type === 'replacement' && events[1].reason, 'session-changed');
});

test('読めないと unavailable を code が変わったときだけ送り、読めるようになると replacement（recovered）', async () => {
  const { reader, hub, advance } = setup();
  reader.session.set('a', 's1');
  reader.rows.set('a/s1', [row('m1')]);
  const { events } = collect(hub, 'a');
  await settle();
  reader.readError = { ok: false, error: 'transcript_not_found' };
  await hub.tick();
  await hub.tick();
  assert.deepEqual(
    events.map((e) => e.type),
    ['snapshot', 'unavailable'],
  );
  assert.deepEqual(events[1], { type: 'unavailable', error: 'transcript_not_found' });
  reader.readError = null;
  reader.resolveError = { ok: false, error: 'unreachable' };
  advance(5_000);
  await hub.tick();
  assert.deepEqual(events[2], { type: 'unavailable', error: 'unreachable' });
  reader.resolveError = null;
  await hub.tick();
  assert.equal(events[3]?.type, 'replacement');
  assert.equal(events[3]?.type === 'replacement' && events[3].reason, 'recovered');
});

test('最初から読めないときは、空の会話ではなく unavailable を送る', async () => {
  const { hub } = setup();
  const { events } = collect(hub, 'missing');
  await settle();
  assert.deepEqual(events, [{ type: 'unavailable', error: 'agent_not_found' }]);
  const late = collect(hub, 'missing');
  assert.deepEqual(late.events, [{ type: 'unavailable', error: 'agent_not_found' }]);
});

test('見張りと購読者の数に上限があり、超えると busy で断る', () => {
  const { hub } = setup({ maxWatches: 2, maxSubscribers: 3 });
  assert.ok(hub.subscribe('a', () => {}).ok);
  assert.ok(hub.subscribe('b', () => {}).ok);
  assert.deepEqual(
    hub.subscribe('c', () => {}),
    { ok: false, error: 'busy' },
  );
  assert.ok(hub.subscribe('a', () => {}).ok);
  assert.deepEqual(
    hub.subscribe('a', () => {}),
    { ok: false, error: 'busy' },
  );
  hub.close();
  assert.equal(hub.watchCount, 0);
  assert.deepEqual(
    hub.subscribe('a', () => {}),
    { ok: false, error: 'busy' },
  );
});

test('close の後に接続側が購読を解除しても、購読者数は0のままで読み直さない', async () => {
  const { reader, hub } = setup();
  reader.session.set('a', 's1');
  const { sub } = collect(hub, 'a');
  assert.ok(sub.ok);
  await hub.tick();
  hub.close();
  sub.unsubscribe();
  sub.unsubscribe();
  assert.equal(hub.subscriberCount, 0);
  const reads = reader.reads;
  await hub.tick();
  assert.equal(reader.reads, reads);
});

test('セッションの解決中に最後の購読が閉じたら、その後に記録を読まない', async () => {
  let finish!: (result: Resolved) => void;
  let reads = 0;
  const reader: TranscriptReader = {
    resolve: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    read: async () => {
      reads++;
      return { ok: true, page: { source: 'nativeChat', rows: [], hasMore: false, before: null } };
    },
  };
  const hub = new TranscriptHub({ reader, tailIntervalMs: 0 });
  const { events, sub } = collect(hub, 'a');
  assert.ok(sub.ok);
  sub.unsubscribe();
  finish({ ok: true, target: targetFor('a', 's1') });
  await settle();
  assert.equal(reads, 0);
  assert.deepEqual(events, []);
});

test('セッションは5秒ごとに解き直し、その間は末尾だけを読む', async () => {
  const { reader, hub, advance } = setup();
  reader.session.set('a', 's1');
  collect(hub, 'a');
  await settle();
  assert.equal(reader.resolves, 1);
  advance(1_500);
  await hub.tick();
  assert.equal(reader.resolves, 1);
  advance(3_500);
  await hub.tick();
  assert.equal(reader.resolves, 2);
});

test('初回の読みが途中なら、複数の購読と tick が同じ結果を待ち、読みを重ねない', async () => {
  let finish!: (result: ReadResult) => void;
  let reads = 0;
  const reader: TranscriptReader = {
    resolve: async (id) => ({ ok: true, target: targetFor(id, 's1') }),
    read: () => {
      reads++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  };
  const hub = new TranscriptHub({ reader, tailIntervalMs: 0 });
  const one = collect(hub, 'a');
  const two = collect(hub, 'a');
  await settle();
  const tick1 = hub.tick();
  const tick2 = hub.tick();
  assert.equal(reads, 1);
  finish({ ok: true, page: { source: 'nativeChat', rows: [row('m1')], hasMore: false, before: null } });
  await Promise.all([tick1, tick2]);
  assert.deepEqual(one.events, two.events);
  assert.equal(one.events.length, 1);
  assert.equal(one.events[0]?.type, 'snapshot');
  hub.close();
});
