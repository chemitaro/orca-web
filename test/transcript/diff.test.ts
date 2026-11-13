import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffWindow } from '../../src/transcript/diff.ts';
import type { TranscriptMessage } from '../../src/transcript/normalize.ts';

const m = (id: string, text = id): TranscriptMessage => ({
  id,
  role: 'assistant',
  at: null,
  parts: [{ type: 'text', text }],
});
const ids = (list: TranscriptMessage[]) => list.map((x) => x.id);

test('空の窓からは全体が追記になり、同じ窓は none', () => {
  assert.deepEqual(diffWindow([], []), { type: 'none' });
  const d = diffWindow([], [m('a'), m('b')]);
  assert.equal(d.type, 'appended');
  assert.deepEqual(d.type === 'appended' && ids(d.items), ['a', 'b']);
  assert.deepEqual(diffWindow([m('a'), m('b')], [m('a'), m('b')]), { type: 'none' });
});

test('末尾に足された件だけが items になる', () => {
  const d = diffWindow([m('a'), m('b')], [m('a'), m('b'), m('c')]);
  assert.deepEqual(d, { type: 'appended', items: [m('c')], updated: [] });
});

test('窓が前に進んで先頭が外れても、足された件だけが items になる', () => {
  const d = diffWindow([m('a'), m('b'), m('c')], [m('b'), m('c'), m('d'), m('e')]);
  assert.deepEqual(d, { type: 'appended', items: [m('d'), m('e')], updated: [] });
});

test('同じ id のまま中身が変わった件は updated になる', () => {
  const d = diffWindow([m('a'), m('b', 'running')], [m('a'), m('b', 'done'), m('c')]);
  assert.deepEqual(d, { type: 'appended', items: [m('c')], updated: [m('b', 'done')] });
});

test('途中の件が消えた、並びが変わった、巻き戻した、窓より多く足されたときは replacement', () => {
  assert.deepEqual(diffWindow([m('a'), m('b'), m('c')], [m('a'), m('c')]), { type: 'replacement' });
  assert.deepEqual(diffWindow([m('a'), m('b')], [m('b'), m('a')]), { type: 'replacement' });
  assert.deepEqual(diffWindow([m('a'), m('b'), m('c')], [m('a'), m('b')]), { type: 'replacement' });
  assert.deepEqual(diffWindow([m('a'), m('b')], [m('x'), m('y')]), { type: 'replacement' });
  assert.deepEqual(diffWindow([m('a'), m('b')], []), { type: 'replacement' });
});
