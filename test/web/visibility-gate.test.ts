// 見えない間の停止の門（web/embed/visibility-gate.js）。時計と予約を注入して確かめる（iss-00077 T-02）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVisibilityGate, HIDDEN_PAUSE_MS } from '../../web/embed/visibility-gate.js';

/** 注入した時計。advance で時刻を進め、期限の来た予約を発火する。 */
function harness() {
  let now = 0;
  let hidden = false;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const calls: string[] = [];
  const gate = createVisibilityGate({
    hiddenMs: HIDDEN_PAUSE_MS,
    onPause: () => calls.push('pause'),
    onResume: () => calls.push('resume'),
    schedule: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    cancel: (id: number | null) => {
      if (id !== null) timers.delete(id);
    },
    isHidden: () => hidden,
  });
  const advance = (ms: number) => {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(id);
        timer.fn();
      }
    }
  };
  const setHidden = (value: boolean) => {
    hidden = value;
    gate.update();
  };
  return { gate, calls, timers, advance, setHidden };
}

test('T-02：止めるまでの時間は 30 秒', () => {
  assert.equal(HIDDEN_PAUSE_MS, 30_000);
});

test('T-02：hidden が 29 秒なら止めず、30 秒で1回だけ止める', () => {
  const h = harness();
  h.setHidden(true);
  h.advance(29_000);
  assert.deepEqual(h.calls, []);
  h.advance(1_000);
  assert.deepEqual(h.calls, ['pause']);
  h.advance(60_000);
  h.setHidden(true);
  h.advance(60_000);
  assert.deepEqual(h.calls, ['pause'], '止めた後の hidden の知らせでは重ねて止めない');
});

test('T-02：止める前に visible に戻ると予約を取り消し、onResume も呼ばない', () => {
  const h = harness();
  h.setHidden(true);
  h.advance(20_000);
  h.setHidden(false);
  assert.equal(h.timers.size, 0);
  h.advance(60_000);
  assert.deepEqual(h.calls, []);
});

test('T-02：止めた後に visible になると onResume を1回だけ呼ぶ', () => {
  const h = harness();
  h.setHidden(true);
  h.advance(30_000);
  h.setHidden(false);
  h.setHidden(false);
  assert.deepEqual(h.calls, ['pause', 'resume']);
});

test('T-02：hidden と visible を繰り返しても、onPause と onResume は対で重ならない', () => {
  const h = harness();
  for (let i = 0; i < 3; i += 1) {
    h.setHidden(true);
    h.setHidden(true);
    h.advance(10_000);
    h.setHidden(false);
    h.setHidden(true);
    h.advance(30_000);
    h.setHidden(false);
  }
  assert.deepEqual(h.calls, ['pause', 'resume', 'pause', 'resume', 'pause', 'resume']);
  assert.equal(h.timers.size, 0);
});

test('T-02：visible のままの update は何もしない', () => {
  const h = harness();
  h.setHidden(false);
  h.advance(60_000);
  assert.deepEqual(h.calls, []);
  assert.equal(h.timers.size, 0);
});
