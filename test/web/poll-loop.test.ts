import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPollLoop } from '../../web/poll-loop.js';

type Pending = { isCurrent: () => boolean; resolve: () => void; reject: (error: Error) => void };

/** 差し替えた load・schedule・cancel で、予約の数と読みの数を見る。 */
function harness() {
  const loads: Pending[] = [];
  const timers = new Map<number, () => void>();
  let nextId = 1;
  const loop = createPollLoop({
    delayMs: 10_000,
    load: (isCurrent: () => boolean) =>
      new Promise<void>((resolve, reject) => {
        loads.push({ isCurrent, resolve, reject });
      }),
    schedule: (fn: () => void, ms: number) => {
      assert.equal(ms, 10_000);
      const id = nextId++;
      timers.set(id, fn);
      return id;
    },
    cancel: (id: number | null) => {
      if (id !== null) timers.delete(id);
    },
  });
  /** 予約を1つ発火させる（ほかに予約が残らないことも確かめる）。 */
  const fire = () => {
    assert.equal(timers.size, 1);
    const [id, fn] = [...timers][0] ?? assert.fail('予約がない');
    timers.delete(id);
    fn();
  };
  /** i 番目の読み（なければ失敗）。 */
  const load = (i: number): Pending => loads[i] ?? assert.fail(`読み ${i} がない`);
  return { loop, loads, timers, fire, load };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('読みの途中に選び直すと、両方の読みが終わった後の予約は1つだけ（古い読みが先に終わる）', async () => {
  const h = harness();
  h.loop.restart();
  h.loop.restart();
  assert.equal(h.loads.length, 2);
  h.load(0).resolve();
  await settle();
  assert.equal(h.timers.size, 0, '古い世代の読みは予約しない');
  h.load(1).resolve();
  await settle();
  assert.equal(h.timers.size, 1);
});

test('読みの途中に選び直すと、両方の読みが終わった後の予約は1つだけ（新しい読みが先に終わる）', async () => {
  const h = harness();
  h.loop.restart();
  h.loop.restart();
  h.load(1).resolve();
  await settle();
  h.load(0).resolve();
  await settle();
  assert.equal(h.timers.size, 1);
});

test('古い世代の読みには isCurrent が偽を返し、最新の世代の読みには真を返す', async () => {
  const h = harness();
  h.loop.restart();
  assert.equal(h.load(0).isCurrent(), true);
  h.loop.restart();
  assert.equal(h.load(0).isCurrent(), false);
  assert.equal(h.load(1).isCurrent(), true);
});

test('予約のあとに選び直すと、その予約を取り消して新しい読みを始める', async () => {
  const h = harness();
  h.loop.restart();
  h.load(0).resolve();
  await settle();
  assert.equal(h.timers.size, 1);
  h.loop.restart();
  assert.equal(h.timers.size, 0, '前の予約は取り消す');
  assert.equal(h.loads.length, 2);
  h.load(1).resolve();
  await settle();
  assert.equal(h.timers.size, 1);
});

test('予約が発火すると次の読みをし、終わるとまた1つだけ予約する', async () => {
  const h = harness();
  h.loop.restart();
  h.load(0).resolve();
  await settle();
  h.fire();
  assert.equal(h.loads.length, 2);
  assert.equal(h.load(1).isCurrent(), true);
  h.load(1).resolve();
  await settle();
  assert.equal(h.timers.size, 1);
});

test('読みが失敗しても、最新の世代なら次の読みを予約する', async () => {
  const h = harness();
  h.loop.restart();
  h.load(0).reject(new Error('boom'));
  await settle();
  assert.equal(h.timers.size, 1);
});
