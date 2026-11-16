import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorktreeSummary } from '../../src/summary/build.ts';
import { FirstSeenStartTimes } from '../../src/summary/started.ts';
import { agent, fact, input } from '../inbox/fixture.ts';

const at = (minute: number) => `2026-01-02T10:${String(minute).padStart(2, '0')}:00.000Z`;

test('初めて見た stateStartedAt を覚え、状態が変わっても動かさない', () => {
  const times = new FirstSeenStartTimes();
  const first = input({ agents: [agent('chat:a', { kind: 'chat-tab', stateStartedAt: fact(at(1)) })] }).state;
  assert.deepEqual([...times.observe(first)], [['chat:a', at(1)]]);
  const later = input({
    agents: [agent('chat:a', { kind: 'chat-tab', state: fact('done'), stateStartedAt: fact(at(9)) })],
  }).state;
  assert.deepEqual([...times.observe(later)], [['chat:a', at(1)]]);
  assert.equal(
    buildWorktreeSummary(later, { firstSeen: times.observe(later) }).worktrees[0]?.agents[0]?.startedAt,
    at(1),
  );
});

test('消えた id を忘れ、また現れたら現れた時の値を覚え直す', () => {
  const times = new FirstSeenStartTimes();
  times.observe(input({ agents: [agent('a', { stateStartedAt: fact(at(1)) }), agent('b')] }).state);
  assert.deepEqual([...times.observe(input({ agents: [agent('b')] }).state).keys()], ['b']);
  const back = times.observe(input({ agents: [agent('a', { stateStartedAt: fact(at(5)) }), agent('b')] }).state);
  assert.equal(back.get('a'), at(5));
});

test('初めて見た時に stateStartedAt がなければ覚えず、値が出た最初の時に固定する', () => {
  const times = new FirstSeenStartTimes();
  assert.equal(times.observe(input({ agents: [agent('a', { stateStartedAt: fact(null) })] }).state).size, 0);
  assert.equal(times.observe(input({ agents: [agent('a', { stateStartedAt: fact(at(3)) })] }).state).get('a'), at(3));
  assert.equal(times.observe(input({ agents: [agent('a', { stateStartedAt: fact(at(7)) })] }).state).get('a'), at(3));
});
