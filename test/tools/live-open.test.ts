import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffTabs, pickSameRepoTarget, tabKeys } from '../../src/tools/live-open.ts';

const list = (rows: Record<string, unknown>[]) => ({
  ok: true as const,
  result: { worktrees: rows, truncated: false },
  durationMs: 1,
});
const row = (id: string, path: string, repoId: string, extra: Record<string, unknown> = {}) => ({
  id,
  path,
  repoId,
  isMainWorktree: false,
  displayName: 'text-1',
  ...extra,
});

test('tabKeys は全 worktree のタブを worktree と id の組の集合にし、形が違えば null', () => {
  const keys = tabKeys({
    snapshots: [
      { worktree: 'w1', tabs: [{ id: 'a', title: 'text-1' }, { id: 'b' }] },
      { worktree: 'w2', tabs: [{ id: 'a' }] },
    ],
  });
  assert.equal(keys?.size, 3);
  assert.equal(tabKeys({ snapshots: [{ worktree: 'w1', tabs: [{ title: 'x' }] }] }), null);
  assert.equal(tabKeys({}), null);
});

test('diffTabs は数だけを返す', () => {
  assert.deepEqual(diffTabs(new Set(['a', 'b']), new Set(['b', 'c', 'd'])), {
    before: 2,
    after: 3,
    added: 2,
    removed: 1,
  });
  assert.deepEqual(diffTabs(new Set(['a']), new Set(['a'])), { before: 1, after: 1, added: 0, removed: 0 });
});

test('pickSameRepoTarget は、作業の場所と同じ repo の worktree だけを許す', () => {
  const rows = list([
    row('r1::/w/main', '/w/main', 'r1', { isMainWorktree: true }),
    row('r1::/w/iss', '/w/iss', 'r1'),
    row('r2::/other', '/other', 'r2'),
  ]);
  assert.deepEqual(pickSameRepoTarget(rows, '/w/iss', '/w/main'), {
    ok: true,
    worktreeId: 'r1::/w/main',
    isMain: true,
  });
  assert.deepEqual(pickSameRepoTarget(rows, '/w/iss', 'r1::/w/iss'), {
    ok: true,
    worktreeId: 'r1::/w/iss',
    isMain: false,
  });
  assert.equal(pickSameRepoTarget(rows, '/w/iss', '/other').ok, false);
  assert.equal(pickSameRepoTarget(rows, '/w/iss', '/nope').ok, false);
  assert.equal(pickSameRepoTarget(rows, '/not-orca', '/w/main').ok, false);
  assert.equal(pickSameRepoTarget({ ok: false, kind: 'timeout', message: 't' }, '/w/iss', '/w/main').ok, false);
});
