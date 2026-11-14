import assert from 'node:assert/strict';
import test from 'node:test';
import { agentMark } from '../../src/inbox/classify.ts';
import { buildWorktreeSummary } from '../../src/summary/build.ts';
import { agent, fact, input, repo, STARTED, worktree } from '../inbox/fixture.ts';

test('agentMark は既知の状態、スリープ、不明を受け箱と共通に分類する', () => {
  for (const state of ['working', 'blocked', 'waiting', 'done']) {
    assert.equal(agentMark(agent('a', { state: fact(state) })), state);
  }
  assert.equal(agentMark(agent('a', { state: fact(null), terminal: fact('awaiting-restore') })), 'sleeping');
  assert.equal(agentMark(agent('a', { state: fact(null) })), 'unknown');
  assert.equal(agentMark(agent('a', { state: fact('future'), terminal: fact('awaiting-restore') })), 'unknown');
});

test('エージェントのいる worktree の小さな要約を順に返す', () => {
  const state = input({
    stale: true,
    connection: { state: 'unreachable', checkedAt: STARTED, reason: 'private reason' },
    worktrees: [
      worktree({ id: 'empty' }),
      worktree({ id: 'z', path: fact('/demo/z'), branch: fact(null), repoId: 'unnamed' }),
      worktree({ path: fact('/demo/a') }),
    ],
    repos: [repo(), { ...repo('unnamed'), displayName: fact(null) }],
    agents: [
      agent('z', { state: fact('done') }),
      agent('a /?', { state: fact('blocked') }),
      agent('sleep', { worktreeId: 'z', state: fact(null), terminal: fact('awaiting-restore') }),
      agent('lost', {
        worktreeId: 'missing',
        state: fact('new-state'),
        agentType: fact(null),
        stateStartedAt: fact(null),
      }),
      agent('waiting', { state: fact('waiting') }),
      agent('working'),
    ],
  }).state;
  const before = structuredClone(state);
  assert.deepEqual(buildWorktreeSummary(state), {
    schema: 'orca-web.worktree-summary/v1',
    generatedAt: STARTED,
    stale: true,
    connection: { state: 'unreachable', checkedAt: STARTED },
    worktrees: [
      {
        id: 'wt-a',
        path: '/demo/a',
        branch: 'iss-17',
        project: { id: 'repo-a', name: '仮のプロジェクト' },
        issue: 'iss-00017',
        counts: { working: 1, blocked: 1, waiting: 1, done: 1, sleeping: 0, unknown: 0, total: 4 },
        agents: [
          {
            id: 'a /?',
            mark: 'blocked',
            agentType: 'codex',
            since: STARTED,
            elapsedFrom: STARTED,
            elapsedBasis: 'state',
            detail: '/embed/agent?id=a%20%2F%3F',
          },
          {
            id: 'waiting',
            mark: 'waiting',
            agentType: 'codex',
            since: STARTED,
            elapsedFrom: STARTED,
            elapsedBasis: 'state',
            detail: '/embed/agent?id=waiting',
          },
          {
            id: 'working',
            mark: 'working',
            agentType: 'codex',
            since: STARTED,
            elapsedFrom: STARTED,
            elapsedBasis: 'state',
            detail: '/embed/agent?id=working',
          },
          {
            id: 'z',
            mark: 'done',
            agentType: 'codex',
            since: STARTED,
            elapsedFrom: STARTED,
            elapsedBasis: 'state',
            detail: '/embed/agent?id=z',
          },
        ],
      },
      {
        id: 'z',
        path: '/demo/z',
        branch: null,
        project: null,
        issue: null,
        counts: { working: 0, blocked: 0, waiting: 0, done: 0, sleeping: 1, unknown: 0, total: 1 },
        agents: [
          {
            id: 'sleep',
            mark: 'sleeping',
            agentType: 'codex',
            since: STARTED,
            elapsedFrom: STARTED,
            elapsedBasis: 'state',
            detail: '/embed/agent?id=sleep',
          },
        ],
      },
      {
        id: 'missing',
        path: null,
        branch: null,
        project: null,
        issue: null,
        counts: { working: 0, blocked: 0, waiting: 0, done: 0, sleeping: 0, unknown: 1, total: 1 },
        agents: [
          {
            id: 'lost',
            mark: 'unknown',
            agentType: null,
            since: null,
            elapsedFrom: null,
            elapsedBasis: null,
            detail: '/embed/agent?id=lost',
          },
        ],
      },
    ],
  });
  assert.deepEqual(state, before);
});

test('同じ path と null は id 順、Issue は branch、表示名の順で task は使わない', () => {
  const state = input({
    worktrees: [
      worktree({ id: 'b', path: fact('/demo'), branch: fact('iss-42'), displayName: fact('iss-55') }),
      worktree({ id: 'a', path: fact('/demo'), branch: fact(null), displayName: fact('iss-55') }),
      worktree({ id: 'none', branch: fact(null), displayName: fact(null) }),
    ],
    agents: ['b', 'a', 'missing-z', 'missing-a', 'none'].map((id) => agent(id, { worktreeId: id })),
  }).state;
  const result = buildWorktreeSummary(state);
  assert.deepEqual(
    result.worktrees.map(({ id, issue }) => [id, issue]),
    [
      ['a', 'iss-00055'],
      ['b', 'iss-00042'],
      ['missing-a', null],
      ['missing-z', null],
      ['none', null],
    ],
  );
  assert.deepEqual(buildWorktreeSummary(input().state).worktrees, []);
});

test('状態の開始時刻を経過の起点にし、既存の since を保つ', () => {
  const state = input({
    worktrees: [worktree({ lastActivityAt: fact('2026-01-01T00:00:00.000Z') })],
    agents: [agent(), agent('sleep', { state: fact(null), terminal: fact('awaiting-restore') })],
  }).state;
  const summary = buildWorktreeSummary(state).worktrees[0];
  assert.ok(summary);
  assert.equal(summary.agents.length, 2);
  for (const entry of summary.agents) {
    assert.equal(entry.since, STARTED);
    assert.equal(entry.elapsedFrom, STARTED);
    assert.equal(entry.elapsedBasis, 'state');
  }
});

test('開始時刻のないスリープと不明だけ worktree の活動時刻を使う', () => {
  const activity = '2026-01-01T00:00:00.000Z';
  const state = input({
    worktrees: [worktree({ lastActivityAt: fact(activity) }), worktree({ id: 'no-time' })],
    agents: [
      agent('sleep', { state: fact(null), terminal: fact('awaiting-restore'), stateStartedAt: fact(null) }),
      agent('unknown', { state: fact(null), stateStartedAt: fact(null) }),
      ...['working', 'blocked', 'waiting', 'done'].map((mark) =>
        agent(mark, { state: fact(mark), stateStartedAt: fact(null) }),
      ),
      agent('no-time', { worktreeId: 'no-time', state: fact(null), stateStartedAt: fact(null) }),
      agent('missing', { worktreeId: 'missing', state: fact(null), stateStartedAt: fact(null) }),
    ],
  }).state;
  const before = structuredClone(state);
  const entries = buildWorktreeSummary(state).worktrees.flatMap((entry) => entry.agents);
  for (const id of ['sleep', 'unknown']) {
    const entry = entries.find((entry) => entry.id === id);
    assert.ok(entry);
    assert.equal(entry.since, null);
    assert.equal(entry.elapsedFrom, activity);
    assert.equal(entry.elapsedBasis, 'worktree-activity');
  }
  for (const id of ['working', 'blocked', 'waiting', 'done', 'no-time', 'missing']) {
    const entry = entries.find((entry) => entry.id === id);
    assert.ok(entry);
    assert.equal(entry.since, null);
    assert.equal(entry.elapsedFrom, null);
    assert.equal(entry.elapsedBasis, null);
  }
  assert.deepEqual(state, before);
});
