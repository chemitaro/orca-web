import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SELECTED, FIELDS } from '../../src/state/fields.ts';
import { buildView, formatValue } from '../../web/view.js';
import { expectedState } from '../state/expected.ts';
import { WT1, WT2 } from '../state/fixture.ts';

const iso = (s: string): string => s;

test('buildView は選んだ列だけの見出しと行を作り、選んでいない対象の表を出さない', () => {
  const view = buildView(expectedState, FIELDS, ['worktree.branch', 'agent.model', 'agent.state'], { formatTime: iso });
  assert.deepEqual(
    view.tables.map((t: { entity: string }) => t.entity),
    ['worktree', 'agent'],
  );
  const [worktrees, agents] = view.tables;
  assert.ok(worktrees && agents);
  assert.deepEqual(
    worktrees.columns.map((c: { id: string }) => c.id),
    ['worktree.branch'],
  );
  assert.deepEqual(
    agents.columns.map((c: { id: string }) => c.id),
    ['agent.state', 'agent.model'],
  );
  // アーカイブした worktree を除き、エージェントのいる worktree を先にする。
  assert.deepEqual(
    worktrees.rows.map((r: { key: string }) => r.key),
    [WT1, WT2],
  );
  assert.deepEqual(worktrees.rows[0].cells, [{ text: 'feature-a', note: null }]);
  const worker = agents.rows.find((r: { key: string }) => r.key === 'uuid-50:uuid-51');
  assert.deepEqual(worker.cells, [
    { text: 'working', note: null },
    { text: 'claude-opus-5-5（起動時の解決）', note: 'workerLaunch: startOptions.launch.effective.model' },
  ]);
  const normal = agents.rows.find((r: { key: string }) => r.key === 'uuid-10:uuid-11');
  assert.deepEqual(normal.cells[1], { text: '—', note: 'not-provided' });
  assert.equal(normal.label, 'feature-a');
});

test('formatValue は欠けた値を「—」と理由、PR と CI と時刻と真偽を文字にする', () => {
  const opts = { formatTime: (s: string) => `T(${s})` };
  assert.deepEqual(formatValue(undefined, opts), { text: '—', note: 'no-data' });
  assert.deepEqual(formatValue({ value: null, source: null, field: null, missing: 'no-source' }, opts), {
    text: '—',
    note: 'no-source',
  });
  const wt = expectedState.worktrees[0];
  assert.equal(formatValue(wt?.pr, opts).text, '#12 open text-1');
  assert.equal(formatValue(wt?.ci, opts).text, 'success 3/3');
  assert.equal(formatValue(wt?.lastActivityAt, opts).text, `T(${wt?.lastActivityAt.value})`);
  assert.equal(formatValue(wt?.isArchived, opts).text, 'いいえ');
  assert.equal(formatValue(wt?.childWorktreeIds, opts).text, expectedState.worktrees[2]?.id);
  assert.equal(formatValue(expectedState.worktrees[1]?.childWorktreeIds, opts).text, '（なし）');
});

test('buildView は接続の状態と鮮度を返す', () => {
  const view = buildView(
    { ...expectedState, stale: true, connection: { state: 'unreachable', reason: 'down', checkedAt: 'x' } },
    FIELDS,
    DEFAULT_SELECTED,
    { formatTime: iso },
  );
  assert.deepEqual(view.status, {
    connection: 'unreachable',
    reason: 'down',
    stale: true,
    lastSuccessAt: expectedState.sources.tabs.lastSuccessAt,
  });
});
