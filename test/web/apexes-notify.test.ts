import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNotifyTracker, notifyKey } from '../../web/apexes-notify.js';

type Item = { id: string; group: string; reasons?: string[]; title?: string | null };
const docOf = (items: Item[], stale = false) => ({ stale, items });
const needs = (id: string, reasons = ['apex_waiting'], title: string | null = `頂点 ${id}`): Item => ({
  id,
  group: 'needs_action',
  reasons,
  title,
});
const working = (id: string): Item => ({ id, group: 'working', reasons: [], title: `頂点 ${id}` });

// biome-ignore lint/suspicious/noExplicitAny: the tracker returns untyped JS objects
const ids = (list: any[]) => list.map((c) => c.id);

/** 開いて最初の2回の読み（何もない）を済ませた tracker。 */
function warmed() {
  const tracker = createNotifyTracker();
  assert.deepEqual(tracker.observe(docOf([])), []);
  assert.deepEqual(tracker.observe(docOf([])), []);
  return tracker;
}

test('T-02: 開いて最初の2回の読みに出た対応が必要は、その時も後も返さない', () => {
  const tracker = createNotifyTracker();
  assert.deepEqual(tracker.observe(docOf([needs('a')])), []);
  assert.deepEqual(tracker.observe(docOf([needs('a'), needs('b')])), []);
  assert.deepEqual(tracker.observe(docOf([needs('a'), needs('b')])), []);
  assert.deepEqual(tracker.observe(docOf([needs('a'), needs('b')])), []);
});

test('T-02: 後から入った同一性は2回続けて読めると1回返し、markShown の後は返さない。1回だけでは返さない', () => {
  const tracker = warmed();
  assert.deepEqual(tracker.observe(docOf([needs('a')])), [], '1回だけでは返さない');
  const shown = tracker.observe(docOf([needs('a', ['apex_waiting', 'question'], '題名 A'), working('w')]));
  assert.deepEqual(shown, []);
  // 理由が変わったので、上の読みは新しい同一性の1回目。
  const again = tracker.observe(docOf([needs('a', ['question', 'apex_waiting'], '題名 A'), working('w')]));
  assert.equal(again.length, 1);
  assert.deepEqual(again[0], {
    id: 'a',
    key: notifyKey('a', ['apex_waiting', 'question']),
    title: '題名 A',
    reasons: ['未回答の質問', '入力待ち'],
  });
  tracker.markShown(again[0].key);
  assert.deepEqual(tracker.observe(docOf([needs('a', ['apex_waiting', 'question'])])), []);
  assert.deepEqual(tracker.observe(docOf([needs('a', ['apex_waiting', 'question'])])), []);
});

test('T-02: markShown しなければ、続けて読める間は返し続ける（隠れたときに出せる）', () => {
  const tracker = warmed();
  tracker.observe(docOf([needs('a')]));
  assert.deepEqual(ids(tracker.observe(docOf([needs('a')]))), ['a']);
  assert.deepEqual(ids(tracker.observe(docOf([needs('a')]))), ['a']);
});

test('T-02: 2回続けて出なくなった後にまた2回続けば返す。1回だけ消えたのでは返さない', () => {
  const tracker = warmed();
  tracker.observe(docOf([needs('a')]));
  const first = tracker.observe(docOf([needs('a')]));
  tracker.markShown(String(first[0]?.key));
  // 1回だけ消えて戻る：K に残る。
  tracker.observe(docOf([]));
  tracker.observe(docOf([needs('a')]));
  assert.deepEqual(tracker.observe(docOf([needs('a')])), []);
  // 2回続けて消える：K から外れる。
  tracker.observe(docOf([]));
  tracker.observe(docOf([]));
  assert.deepEqual(tracker.observe(docOf([needs('a')])), []);
  assert.deepEqual(ids(tracker.observe(docOf([needs('a')]))), ['a']);
});

test('T-02: 開いた時に既にあった同一性も、2回続けて消えた後にまた入れば返す', () => {
  const tracker = createNotifyTracker();
  tracker.observe(docOf([needs('a')]));
  tracker.observe(docOf([needs('a')]));
  tracker.observe(docOf([]));
  tracker.observe(docOf([]));
  tracker.observe(docOf([needs('a')]));
  assert.deepEqual(ids(tracker.observe(docOf([needs('a')]))), ['a']);
});

test('T-02: 題名がなければ「頂点」、知らない理由は符号のまま', () => {
  const tracker = warmed();
  tracker.observe(docOf([needs('a', ['unknown_reason'], null)]));
  const [c] = tracker.observe(docOf([needs('a', ['unknown_reason'], null)]));
  assert.ok(c);
  assert.equal(c.title, '頂点');
  assert.deepEqual(c.reasons, ['unknown_reason']);
});

test('T-03: stale の文書を挟むと、前後で続けて読めたことにならない。stale の後に2回続けて読めると返す', () => {
  const tracker = warmed();
  tracker.observe(docOf([needs('a')]));
  assert.deepEqual(tracker.observe(docOf([needs('a')], true)), [], 'stale では返さない');
  assert.deepEqual(tracker.observe(docOf([needs('a')])), [], 'stale の直後は返さない');
  assert.deepEqual(ids(tracker.observe(docOf([needs('a')]))), ['a']);
});

test('T-03: stale の間に入った同一性は、戻って2回続けて読めると返す', () => {
  const tracker = warmed();
  tracker.observe(docOf([], true));
  tracker.observe(docOf([needs('b')], true));
  assert.deepEqual(tracker.observe(docOf([needs('b')])), []);
  assert.deepEqual(ids(tracker.observe(docOf([needs('b')]))), ['b']);
});

test('T-03: observeFailure を挟んだ前後の文書は続けて読めたと数えない。形の誤りも失敗と同じ', () => {
  const tracker = warmed();
  tracker.observe(docOf([needs('a')]));
  tracker.observeFailure();
  assert.deepEqual(tracker.observe(docOf([needs('a')])), []);
  assert.deepEqual(tracker.observe({ stale: false, items: 'broken' }), []);
  assert.deepEqual(tracker.observe(null), []);
  assert.deepEqual(tracker.observe(docOf([needs('a')])), []);
  assert.deepEqual(ids(tracker.observe(docOf([needs('a')]))), ['a']);
});

test('T-03: 最初の2回の読みは stale でない読みだけで数える', () => {
  const tracker = createNotifyTracker();
  tracker.observe(docOf([needs('a')], true));
  tracker.observeFailure();
  tracker.observe(docOf([needs('a')]));
  tracker.observe(docOf([needs('a')]));
  assert.deepEqual(tracker.observe(docOf([needs('a')])), [], '開いた時点で既にあった');
});
