import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseTarget, parseTabsSnapshot } from '../../src/orca/open-target.ts';

const WT = 'repo-1::/p-1';

/** 端末のタブ（leaf）。id は Orca と同じ `<parentTabId>::<leafId>` の形。 */
function term(parent: string, leaf: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'terminal',
    id: `${parent}::${leaf}`,
    parentTabId: parent,
    leafId: leaf,
    title: 'text-1',
    isActive: false,
    status: 'ready',
    terminal: `term_${parent}_${leaf}`,
    ...extra,
  };
}
const agent = (updatedAt: number, extra: Record<string, unknown> = {}) => ({
  agentStatus: { state: 'done', updatedAt, agentType: 'claude', paneKey: 'x', prompt: 'text-2', ...extra },
});
const sleeping = { status: 'pending-handle', terminal: null, launchAgent: 'claude' };

function snap(tabs: unknown[], activeTabId: string | null = null) {
  const s = parseTabsSnapshot({ worktree: WT, activeTabId, tabs }, WT);
  assert.ok(s);
  return s;
}

test('指定の paneKey の動いている端末は terminal switch（handle）で開く', () => {
  const s = snap([term('a', '1', agent(5)), term('b', '1', agent(9))]);
  assert.deepEqual(chooseTarget(s, 'a:1'), {
    target: { route: 'terminal-switch', handle: 'term_a_1', tabId: 'a::1', paneKey: 'a:1', reason: 'requested-agent' },
    requestedAgentFound: true,
  });
});

test('指定の paneKey のスリープ中の端末は session.tabs.activate（タブの id と leafId）で開く', () => {
  const s = snap([term('a', '1', sleeping), term('b', '1', agent(9))]);
  assert.deepEqual(chooseTarget(s, 'a:1'), {
    target: { route: 'tab-activate', tabId: 'a::1', leafId: '1', reason: 'requested-agent' },
    requestedAgentFound: true,
  });
});

test('指定の paneKey が一覧になければ、最後に動いたエージェントを選び、見つからなかったことを返す', () => {
  const s = snap([term('a', '1', agent(5)), term('b', '1', agent(9))]);
  assert.deepEqual(chooseTarget(s, 'gone:1'), {
    target: { route: 'terminal-switch', handle: 'term_b_1', tabId: 'b::1', paneKey: 'b:1', reason: 'last-agent' },
    requestedAgentFound: false,
  });
});

test('最後に動いたエージェントは updatedAt が最大のもの、同じなら isActive、それでも同じなら先のもの', () => {
  const s1 = snap([term('a', '1', agent(5)), term('b', '1', agent(5, {})), term('c', '1', agent(3))]);
  assert.equal((chooseTarget(s1).target as { tabId: string }).tabId, 'a::1');
  const s2 = snap([term('a', '1', agent(5)), term('b', '1', { ...agent(5), isActive: true })]);
  assert.equal(chooseTarget(s2).target.reason, 'last-agent');
  assert.equal((chooseTarget(s2).target as { tabId: string }).tabId, 'b::1');
  const s3 = snap([term('a', '1', { agentStatus: { state: 'working' } }), term('b', '1', agent(1))]);
  assert.equal((chooseTarget(s3).target as { tabId: string }).tabId, 'b::1');
});

test('エージェントと確かめられないタブ（agentStatus のない端末、スリープ中）は last-agent にしない', () => {
  const s = snap([term('a', '1', sleeping), term('b', '1'), { type: 'markdown', id: 'm', isActive: true }]);
  assert.deepEqual(chooseTarget(s), { target: { route: 'tab-activate', tabId: 'm', reason: 'last-tab' } });
});

test('最後に見ていた端末のタブは、同じ親の leaf のうち activeLeafId に当たるもの', () => {
  const layout = { parentLayout: { activeLeafId: '2', buffersByLeafId: { 1: 'text-3' } } };
  const s = snap([
    term('a', '1', { isActive: true, ...layout }),
    term('a', '2', { isActive: true, ...layout }),
    term('b', '1'),
  ]);
  assert.deepEqual(chooseTarget(s).target, {
    route: 'terminal-switch',
    handle: 'term_a_2',
    tabId: 'a::2',
    paneKey: 'a:2',
    reason: 'last-tab',
  });
  const noLayout = snap([term('a', '1', { isActive: true }), term('a', '2', { isActive: true })]);
  assert.equal((chooseTarget(noLayout).target as { tabId: string }).tabId, 'a::1');
});

test('isActive がなければ activeTabId（タブの id か親のタブの ID）で最後に見ていたタブを選ぶ', () => {
  assert.deepEqual(chooseTarget(snap([term('a', '1'), { type: 'browser', id: 'w' }], 'w')).target, {
    route: 'tab-activate',
    tabId: 'w',
    reason: 'last-tab',
  });
  assert.equal(
    (chooseTarget(snap([term('a', '1'), term('b', '1', sleeping)], 'b')).target as { tabId: string }).tabId,
    'b::1',
  );
});

test('タブがなければ worktree だけ（Orca が最初の端末を作りうる）、タブがあって決められなければ worktree だけ（作らない）', () => {
  assert.deepEqual(chooseTarget(snap([])), {
    target: { route: 'worktree-activate', reason: 'worktree-only', mayCreateInitialTerminal: true },
  });
  assert.deepEqual(chooseTarget(snap([term('a', '1')], null)), {
    target: { route: 'worktree-activate', reason: 'worktree-only', mayCreateInitialTerminal: false },
  });
  assert.deepEqual(chooseTarget(snap([]), 'a:1'), {
    target: { route: 'worktree-activate', reason: 'worktree-only', mayCreateInitialTerminal: true },
    requestedAgentFound: false,
  });
});

test('parseTabsSnapshot は worktree の食い違い、識別子の欠け、未知の形で null を返す', () => {
  assert.equal(parseTabsSnapshot({ worktree: 'other', tabs: [] }, WT), null);
  assert.equal(parseTabsSnapshot({ worktree: WT }, WT), null);
  assert.equal(parseTabsSnapshot(null, WT), null);
  assert.equal(parseTabsSnapshot({ worktree: WT, tabs: [{ type: 'terminal', id: 'a::1', leafId: '1' }] }, WT), null);
  assert.equal(parseTabsSnapshot({ worktree: WT, tabs: [{ type: 'file' }] }, WT), null);
  assert.equal(parseTabsSnapshot({ worktree: WT, tabs: ['x'] }, WT), null);
});
