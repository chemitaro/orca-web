import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApexList } from '../../src/apex/build.ts';
import type { ApexItem } from '../../src/apex/model.ts';
import type { AgentState, StateDocument } from '../../src/state/model.ts';
import { agent, fact, input, NOW, repo, worktree } from '../inbox/fixture.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

function state(patch: Partial<StateDocument> = {}): StateDocument {
  return input(patch).state;
}

function build(agents: AgentState[], patch: Partial<StateDocument> = {}, project: string | null = null) {
  return buildApexList({ state: state({ agents, ...patch }), now: NOW, project });
}

function child(id: string, parent: string, patch: Partial<AgentState> = {}): AgentState {
  return agent(id, { parentPaneKey: fact(parent), ...patch });
}

function only(agents: AgentState[], patch: Partial<StateDocument> = {}): ApexItem {
  const result = build(agents, patch);
  assert.equal(result.items.length, 1);
  return result.items[0] as ApexItem;
}

test('T-01: 親・子・孫の木は頂点1件で、子と孫がメンバー。単独は配下0の頂点。数の合計が一致', () => {
  const result = build([agent('root'), child('kid', 'root'), child('grand', 'kid'), agent('solo')]);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ['root', 'solo'],
  );
  const root = result.items.find((item) => item.id === 'root');
  assert.deepEqual(
    root?.members.map(({ id, parentId, depth }) => ({ id, parentId, depth })),
    [
      { id: 'kid', parentId: 'root', depth: 1 },
      { id: 'grand', parentId: 'kid', depth: 2 },
    ],
  );
  assert.equal(result.items.find((item) => item.id === 'solo')?.members.length, 0);
  const members = result.items.reduce((sum, item) => sum + item.members.length, 0);
  assert.equal(result.items.length + members + result.unlinked.length, 4);
  assert.deepEqual(result.unlinked, []);
});

test('T-02: 親のない子、worker があり親のない子、輪は結べないものになり、頂点にならない', () => {
  const result = build([
    child('orphan', 'gone'),
    child('orphan-kid', 'orphan'),
    agent('worker', { worker: { dispatchId: 'd', taskId: null, runId: null } }),
    child('loop-a', 'loop-b'),
    child('loop-b', 'loop-a'),
    child('loop-kid', 'loop-a'),
  ]);
  assert.deepEqual(result.items, []);
  assert.deepEqual(
    Object.fromEntries(result.unlinked.map((item) => [item.id, 'reason' in item ? item.reason : null])),
    {
      orphan: 'parent_missing',
      'orphan-kid': 'parent_missing',
      worker: 'worker_without_parent',
      'loop-a': 'cycle',
      'loop-b': 'cycle',
      'loop-kid': 'cycle',
    },
  );
});

test('T-02: 同じ paneKey が2つあるとき、その paneKey を親にする子は結べないもの', () => {
  const result = build([agent('a', { paneKey: 'dup' }), agent('b', { paneKey: 'dup' }), child('kid', 'dup')]);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    result.unlinked.map((item) => ({ id: item.id, reason: 'reason' in item ? item.reason : null })),
    [{ id: 'kid', reason: 'parent_missing' }],
  );
});

test('T-02: worker があり親が見つかる子はメンバー', () => {
  const result = build([
    agent('root'),
    child('kid', 'root', { worker: { dispatchId: 'd', taskId: null, runId: null } }),
  ]);
  assert.deepEqual(
    result.items.map((item) => [item.id, item.members.map((member) => member.id)]),
    [['root', ['kid']]],
  );
});

test('T-03: 状態の規則と理由の並び', () => {
  const cases: [string, AgentState[], string, string[]][] = [
    ['members_working', [agent('r', { state: fact('done') }), child('k', 'r')], 'working', ['members_working']],
    [
      'apex_waiting',
      [agent('r', { state: fact('waiting') }), child('k', 'r')],
      'needs_action',
      ['apex_waiting', 'members_working'],
    ],
    ['apex_blocked', [agent('r', { state: fact('blocked') })], 'needs_action', ['apex_blocked']],
    ['monitoring', [agent('r', { workingMode: fact('monitoring') })], 'working', ['monitoring']],
    ['working', [agent('r'), child('k', 'r')], 'working', ['working']],
    ['done', [agent('r', { state: fact('done') }), child('k', 'r', { state: fact('done') })], 'done', ['done']],
  ];
  for (const [name, agents, status, reasons] of cases) {
    const item = only(agents);
    assert.equal(item.status, status, name);
    assert.deepEqual(item.reasons, reasons, name);
    assert.deepEqual(item.tags, [], name);
  }
});

test('T-03: メンバーが working で頂点の state が null なら working・unverified', () => {
  const item = only([agent('r', { state: fact(null) }), child('k', 'r')]);
  assert.equal(item.status, 'working');
  assert.deepEqual(item.reasons, ['members_working']);
  assert.deepEqual(item.tags, ['unverified']);
});

test('T-04: メンバーの猶予は 20 秒。stateStartedAt がなければすぐ', () => {
  const root = agent('r', { state: fact('done') });
  const at = (ms: number | null) =>
    only([root, child('k', 'r', { state: fact('blocked'), stateStartedAt: fact(ms === null ? null : ago(ms)) })]);
  assert.deepEqual([at(19_000).status, at(19_000).reasons], ['working', ['member_grace']]);
  // 配下の待ちは統括が扱う。頂点を対応が必要にせず作業中にする（iss-00112 R-01）。
  assert.deepEqual([at(20_000).status, at(20_000).reasons], ['working', ['member_blocked']]);
  assert.deepEqual([at(null).status, at(null).reasons], ['working', ['member_blocked']]);
  const waiting = only([root, child('k', 'r', { state: fact('waiting'), stateStartedAt: fact(ago(60_000)) })]);
  assert.deepEqual([waiting.status, waiting.reasons], ['working', ['member_waiting']]);
});

test('T-04: 復元待ちの端末のメンバーの blocked は数えず、構造化 Chat は terminal を問わない', () => {
  const root = agent('r', { state: fact('done') });
  const restoring = only([
    root,
    child('k', 'r', { state: fact('blocked'), stateStartedAt: fact(ago(60_000)), terminal: fact('awaiting-restore') }),
  ]);
  assert.equal(restoring.status, 'done');
  const chat = only([
    root,
    child('k', 'r', {
      kind: 'chat-tab',
      state: fact('blocked'),
      stateStartedAt: fact(ago(60_000)),
      terminal: fact(null, 'no-source'),
    }),
  ]);
  assert.deepEqual([chat.status, chat.reasons], ['working', ['member_blocked']]);
});

test('T-05: state null・配下なし・プロセスのある頂点は working・unverified・段 unknown で done に数えない', () => {
  const result = build([agent('r', { state: fact(null), stateStartedAt: fact(ago(HOUR)) })]);
  const item = result.items[0];
  assert.equal(item?.status, 'working');
  assert.deepEqual(item?.reasons, []);
  assert.deepEqual(item?.tags, ['unverified']);
  assert.equal(item?.mark, 'unknown');
  assert.equal(item?.group, 'unknown');
  assert.deepEqual(result.counts, { needs_action: 0, working: 1, done: 0 });
});

const unknownChat = (patch: Partial<AgentState> = {}) =>
  agent('r', {
    kind: 'chat-tab',
    paneKey: null,
    terminalHandle: null,
    state: fact(null),
    stateStartedAt: fact(ago(HOUR)),
    terminal: fact(null, 'no-source'),
    ...patch,
  });

function withSource(name: 'worktreePs' | 'tabs', patch: Partial<StateDocument['sources'][typeof name]>) {
  const base = state().sources;
  return { sources: { ...base, [name]: { ...base[name], ...patch } } };
}

test('T-01（iss-00095）: プロセスのない state null の chat-tab は眠っている（done・sleeping・札なし）', () => {
  const result = build([unknownChat()]);
  const item = result.items[0];
  assert.deepEqual(
    [item?.status, item?.reasons, item?.group, item?.tags, item?.mark],
    ['done', ['sleeping'], 'sleeping', [], 'unknown'],
  );
  assert.deepEqual(result.counts, { needs_action: 0, working: 0, done: 1 });
});

test('T-01（iss-00095）: terminal が null でも attached でもない state null の terminal-tab は眠っている', () => {
  const item = only([agent('r', { state: fact(null), stateStartedAt: fact(ago(HOUR)), terminal: fact('exited') })]);
  assert.deepEqual([item.status, item.reasons, item.group, item.tags], ['done', ['sleeping'], 'sleeping', []]);
  const unread = only([agent('r', { state: fact(null), terminal: fact(null, 'not-linked') })]);
  assert.deepEqual([unread.status, unread.group, unread.tags], ['working', 'unknown', ['unverified']]);
  const stale = only(
    [agent('r', { state: fact(null), terminal: fact('exited') })],
    withSource('tabs', { stale: true }),
  );
  assert.deepEqual([stale.status, stale.group, stale.tags], ['working', 'unknown', ['unverified']]);
});

test('T-01（iss-00095）: worktreePs が stale か一度も読めていなければ、プロセスのない chat-tab も不明の段', () => {
  for (const patch of [{ stale: true }, { lastSuccessAt: null }]) {
    const item = only([unknownChat()], withSource('worktreePs', patch));
    assert.deepEqual([item.status, item.reasons, item.group, item.tags], ['working', [], 'unknown', ['unverified']]);
  }
  const untabbed = only([unknownChat({ kind: 'untabbed', paneKey: null })]);
  assert.deepEqual([untabbed.status, untabbed.group, untabbed.tags], ['working', 'unknown', ['unverified']]);
});

test('T-02（iss-00095）: プロセスのある state null の chat-tab は不明の段で、30 時間たっても不明。メンバーが working なら作業中', () => {
  const recent = only([unknownChat({ paneKey: 'pane-r' })]);
  assert.deepEqual([recent.status, recent.group, recent.tags], ['working', 'unknown', ['unverified']]);
  const old = only([unknownChat({ paneKey: 'pane-r', stateStartedAt: fact(ago(30 * HOUR)) })]);
  assert.deepEqual([old.status, old.group, old.tags], ['working', 'unknown', ['unverified']]);
  const busy = only([unknownChat({ paneKey: 'pane-r' }), child('k', 'pane-r')]);
  assert.deepEqual([busy.status, busy.reasons, busy.group], ['working', ['members_working'], 'working']);
});

test('T-05: 状態の文書が stale か接続が unreachable なら一覧も stale', () => {
  assert.equal(build([agent('r')]).stale, false);
  assert.equal(build([agent('r')], { stale: true }).stale, true);
  const unreachable = build([agent('r')], { connection: { state: 'unreachable', reason: 'x', checkedAt: null } });
  assert.equal(unreachable.stale, true);
  assert.equal(unreachable.items.length, 1);
});

test('F-01: 接続が starting なら空の一覧と stale', () => {
  const result = build([agent('r')], { connection: { state: 'starting', reason: null, checkedAt: null } });
  assert.equal(result.stale, true);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.unlinked, []);
});

test('T-06: 段の決め方', () => {
  const group = (patch: Partial<AgentState>, members: AgentState[] = []) => only([agent('r', patch), ...members]).group;
  assert.equal(group({ state: fact('done'), stateStartedAt: fact(ago(23 * HOUR)) }), 'done_recent');
  assert.equal(group({ state: fact('done'), stateStartedAt: fact(ago(25 * HOUR)) }), 'done_older');
  assert.equal(group({ state: fact('done'), stateStartedAt: fact(ago(8 * DAY)) }), 'sleeping');
  assert.equal(group({ state: fact('done'), terminal: fact('awaiting-restore') }), 'sleeping');
  assert.equal(group({ state: fact('waiting'), stateStartedAt: fact(ago(8 * DAY)) }), 'needs_action');
  assert.equal(group({ state: fact(null), stateStartedAt: fact(ago(25 * HOUR)) }), 'unknown');
  assert.equal(group({ state: fact(null), stateStartedAt: fact(ago(23 * HOUR)) }), 'unknown');
  assert.equal(
    group({ state: fact('done'), terminal: fact('awaiting-restore') }, [
      child('k', 'r', { stateStartedAt: fact(ago(HOUR)) }),
    ]),
    'working',
  );
  assert.equal(group({ state: fact('working'), stateStartedAt: fact(ago(8 * DAY)) }), 'working');
});

test('T-06: state null で復元待ちの頂点は done（sleeping）で眠っているに入り、done に数える', () => {
  const result = build([agent('r', { state: fact(null), terminal: fact('awaiting-restore') })]);
  const item = result.items[0];
  assert.deepEqual([item?.status, item?.reasons, item?.group, item?.tags], ['done', ['sleeping'], 'sleeping', []]);
  assert.deepEqual(result.counts, { needs_action: 0, working: 0, done: 1 });
});

test('T-06: 最後の活動はメンバーを含む最大で、なければ worktree の lastActivityAt。段の中は新しい順', () => {
  const result = build(
    [
      agent('old', { state: fact('done'), stateStartedAt: fact(ago(5 * HOUR)) }),
      agent('team', { state: fact('done'), stateStartedAt: fact(ago(10 * HOUR)) }),
      child('team-kid', 'team', { state: fact('done'), stateStartedAt: fact(ago(HOUR)) }),
      agent('wt', { state: fact('done'), stateStartedAt: fact(null), worktreeId: 'wt-b' }),
      agent('none', { state: fact('done'), stateStartedAt: fact(null), worktreeId: 'wt-c' }),
    ],
    {
      worktrees: [worktree(), worktree({ id: 'wt-b', lastActivityAt: fact(ago(3 * HOUR)) }), worktree({ id: 'wt-c' })],
    },
  );
  assert.deepEqual(
    result.items.map((item) => [item.id, item.group, item.lastActivityAt]),
    [
      ['team', 'done_recent', ago(HOUR)],
      ['wt', 'done_recent', ago(3 * HOUR)],
      ['old', 'done_recent', ago(5 * HOUR)],
      ['none', 'done_recent', null],
    ],
  );
});

test('T-06: 行の項目と、文書に paneKey・terminalHandle・パスがない', () => {
  const value = state({
    agents: [
      agent('r', {
        paneKey: 'pane-secret',
        terminalHandle: 'handle-secret',
        title: fact(null),
        agentType: fact('claude'),
      }),
      child('k', 'pane-secret', { paneKey: 'pane-kid-secret', terminalHandle: 'handle-kid', state: fact('done') }),
    ],
    worktrees: [worktree({ path: fact('/secret/path/wt-a'), displayName: fact('仮の作業'), branch: fact('iss-17') })],
  });
  const result = buildApexList({ state: value, now: NOW, project: null });
  const item = result.items[0];
  assert.deepEqual(
    {
      title: item?.title,
      worktreeName: item?.worktreeName,
      project: item?.project,
      issue: item?.issue,
      agentType: item?.agentType,
      kind: item?.kind,
      counts: item?.counts,
    },
    {
      title: '仮の作業',
      worktreeName: '仮の作業',
      project: { id: 'repo-a', name: '仮のプロジェクト' },
      issue: 'iss-00017',
      agentType: 'claude',
      kind: 'terminal-tab',
      counts: { total: 1, working: 0, waiting: 0, done: 1 },
    },
  );
  const text = JSON.stringify(result);
  for (const secret of ['pane-secret', 'pane-kid-secret', 'handle-secret', 'handle-kid', '/secret/path']) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.equal(result.schema, 'orca-web.apexes/v1');
  assert.equal(result.generatedAt, new Date(NOW).toISOString());
});

test('R-06: project で頂点と結べないものを絞り、counts は絞った後で数える', () => {
  const result = build(
    [
      agent('a'),
      agent('b', { worktreeId: 'wt-b', state: fact('done') }),
      child('lost', 'gone', { worktreeId: 'wt-b' }),
      child('lost-a', 'gone'),
    ],
    { repos: [repo(), repo('repo-b', '別')], worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b' })] },
    'repo-b',
  );
  assert.equal(result.project, 'repo-b');
  assert.deepEqual(
    result.items.map((item) => item.id),
    ['b'],
  );
  assert.deepEqual(
    result.unlinked.map((item) => item.id),
    ['lost'],
  );
  assert.deepEqual(result.counts, { needs_action: 0, working: 0, done: 1 });
});

test('配下の数は印ごとに数え、理由はすべてを決めた順で並べる', () => {
  const item = only([
    agent('r'),
    child('w', 'r'),
    child('x', 'r', { state: fact('waiting'), stateStartedAt: fact(ago(HOUR)) }),
    child('y', 'r', { state: fact('done') }),
  ]);
  assert.deepEqual(item.counts, { total: 3, working: 1, waiting: 1, done: 1 });
  assert.deepEqual(item.reasons, ['member_waiting', 'working']);
});

test('iss-00112 T-01・T-02：対応が必要は頂点自身の待ちだけ。配下の待ちは作業中で、数にも段にも出ない', () => {
  for (const state of ['blocked', 'waiting'] as const) {
    const result = build([agent('r', { state: fact(state), stateStartedAt: fact(ago(HOUR)) })]);
    assert.equal(result.items[0]?.status, 'needs_action', state);
    assert.equal(result.items[0]?.group, 'needs_action', state);
  }
  const result = build([
    agent('r', { state: fact('done') }),
    child('k', 'r', { state: fact('blocked'), stateStartedAt: fact(ago(HOUR)) }),
    child('g', 'k', { state: fact('waiting'), stateStartedAt: fact(ago(HOUR)) }),
  ]);
  const item = result.items[0] as ApexItem;
  assert.deepEqual(
    [item.status, item.group, item.reasons],
    ['working', 'working', ['member_blocked', 'member_waiting']],
  );
  assert.equal(result.counts.needs_action, 0);
  assert.deepEqual(
    item.waitingMembers.map((member) => member.id),
    ['k', 'g'],
    '対応のカードの材料は今のまま',
  );
});
