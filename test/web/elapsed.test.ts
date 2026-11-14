import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeElapsed, elapsedMs, formatElapsed } from '../../web/embed/elapsed.js';

const NOW = Date.parse('2026-01-02T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const BOUNDARIES: [number, string, string][] = [
  [0, 'now', '1分未満'],
  [59 * SEC, 'now', '1分未満'],
  [60 * SEC, '1m', '1分'],
  [59 * MIN + 59 * SEC, '59m', '59分'],
  [60 * MIN, '1h', '1時間'],
  [23 * HOUR + 59 * MIN, '23h', '23時間'],
  [24 * HOUR, '1d', '1日'],
  [73 * HOUR, '3d', '3日'],
  [30 * DAY, '30d', '30日'],
  [400 * DAY, '400d', '400日'],
];

test('formatElapsed：境目で now・m・h・d に切り捨て、日より上に上げない', () => {
  for (const [ms, short] of BOUNDARIES) assert.equal(formatElapsed(ago(ms), NOW), short, String(ms));
});

test('describeElapsed：同じ境目で 1分未満・N分・N時間・N日', () => {
  for (const [ms, , long] of BOUNDARIES) assert.equal(describeElapsed(ago(ms), NOW), long, String(ms));
});

test('elapsedMs：ISO の文字とミリ秒の数を受け、経過のミリ秒を返す', () => {
  assert.equal(elapsedMs(ago(5 * MIN), NOW), 5 * MIN);
  assert.equal(elapsedMs(NOW - 5 * MIN, NOW), 5 * MIN);
  assert.equal(elapsedMs(NOW, NOW), 0);
  assert.equal(formatElapsed(NOW - 2 * HOUR, NOW), '2h');
  assert.equal(describeElapsed(NOW - 2 * HOUR, NOW), '2時間');
});

const NULL_CASES: [string, unknown, unknown][] = [
  ['未来', ago(-1 * SEC), NOW],
  ['未来の数', NOW + MIN, NOW],
  ['解けない文字', 'not a time', NOW],
  ['空の文字', '', NOW],
  ['null', null, NOW],
  ['undefined', undefined, NOW],
  ['真偽', true, NOW],
  ['物', {}, NOW],
  ['NaN の数', Number.NaN, NOW],
  ['無限の数', Number.POSITIVE_INFINITY, NOW],
  ['now が文字', ago(MIN), String(NOW)],
  ['now が NaN', ago(MIN), Number.NaN],
  ['now が undefined', ago(MIN), undefined],
];

test('未来、解けない値、文字でも数でもない値、数でない now は3つとも null', () => {
  for (const [name, from, now] of NULL_CASES) {
    assert.equal(elapsedMs(from, now), null, name);
    assert.equal(formatElapsed(from, now), null, name);
    assert.equal(describeElapsed(from, now), null, name);
  }
});

test('clampFuture: true は未来を now・1分未満にし、解けない値と数でない now は null のまま', () => {
  const opts = { clampFuture: true };
  assert.equal(formatElapsed(ago(-5 * MIN), NOW, opts), 'now');
  assert.equal(describeElapsed(ago(-5 * MIN), NOW, opts), '1分未満');
  assert.equal(formatElapsed(NOW + DAY, NOW, opts), 'now');
  assert.equal(formatElapsed(ago(12 * MIN), NOW, opts), '12m');
  for (const [name, from, now] of NULL_CASES.filter(([n]) => !n.startsWith('未来'))) {
    assert.equal(formatElapsed(from, now, opts), null, name);
    assert.equal(describeElapsed(from, now, opts), null, name);
  }
  assert.equal(formatElapsed(ago(-MIN), NOW, { clampFuture: false }), null);
});
