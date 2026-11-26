import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApexMember, ApexTeamNode } from '../../src/apex/model.ts';
import { memberAttention } from '../../web/apexes-attention-view.js';
import { buildLiveTeam, LIVE_TEAM_LIMIT } from '../../web/apexes-live-view.js';

const NOW = Date.parse('2026-01-02T12:00:00.000Z');
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

function node(key: string, patch: Partial<ApexTeamNode> = {}): ApexTeamNode {
  const kind = key.startsWith('agent:') ? 'agent' : 'dispatch';
  return {
    key,
    kind,
    agentId: kind === 'agent' ? key.slice(6) : null,
    dispatchId: kind === 'dispatch' ? key.slice(9) : null,
    parentKey: null,
    depth: 1,
    title: `題名 ${key}`,
    status: 'done',
    createdAt: iso(NOW - 60 * MIN),
    completedAt: null,
    stateStartedAt: kind === 'agent' ? iso(NOW - 5 * MIN) : null,
    ...patch,
  };
}

function member(id: string, agentType: string | null): ApexMember {
  return {
    id,
    parentId: 'apex',
    depth: 1,
    mark: 'working',
    agentType,
    title: null,
    worktreeId: 'w',
    stateStartedAt: null,
  };
}

type LiveRow = {
  key: string;
  depth: number;
  kind: string;
  icon: string | null;
  status: string;
  statusLabel: string;
  title: string;
  elapsed: string | null;
  dim: boolean;
  marks?: unknown;
};
type Live = { rows: LiveRow[]; more: number; moreLabel: string | null };

function liveOf(team: ApexTeamNode[], members: ApexMember[] = []): Live {
  const live = buildLiveTeam(team, { now: NOW, members });
  assert.ok(live);
  return live as Live;
}

test('T-01: 統括 → タスク担当（done）→ 実装担当（working）で、タスク担当（薄く）と実装担当が depth 1・2 で出る', () => {
  const team = [
    node('dispatch:owner', { status: 'done', title: 'タスク担当' }),
    node('agent:impl', { parentKey: 'dispatch:owner', depth: 2, status: 'working', title: '実装担当' }),
  ];
  const live = liveOf(team, [member('impl', 'claude')]);
  assert.deepEqual(
    live.rows.map((row) => [row.key, row.depth, row.dim, row.statusLabel]),
    [
      ['dispatch:owner', 1, true, '完了'],
      ['agent:impl', 2, false, '作業中'],
    ],
  );
  assert.equal(live.rows[1]?.icon, 'claude');
  assert.equal(live.rows[1]?.kind, 'agent');
  assert.equal(live.rows[0]?.kind, 'dispatch');
  assert.equal(live.rows[0]?.icon, null);
  assert.equal(live.rows[1]?.elapsed, '5m');
  assert.equal(live.rows[0]?.elapsed, '1h');
  assert.equal(live.more, 0);
  assert.equal(live.moreLabel, null);
});

test('T-01: done・failed だけの枝は出ず、稼働中の状態の言葉は作業中・待ち・動作中（タブなし）・不明', () => {
  const team = [
    node('dispatch:old', { status: 'done' }),
    node('dispatch:oldchild', { parentKey: 'dispatch:old', depth: 2, status: 'failed' }),
    node('agent:w', { status: 'working' }),
    node('agent:q', { status: 'waiting' }),
    node('dispatch:l', { status: 'live' }),
    node('agent:u', { status: 'unknown' }),
  ];
  const live = liveOf(team);
  assert.deepEqual(
    live.rows.map((row) => [row.key, row.statusLabel, row.dim]),
    [
      ['agent:w', '作業中', false],
      ['agent:q', '待ち', false],
      ['dispatch:l', '動作中（タブなし）', false],
      ['agent:u', '不明', false],
    ],
  );
});

test('T-01: 稼働中の節がなければ null（木を出さない）', () => {
  assert.equal(buildLiveTeam([], { now: NOW }), null);
  assert.equal(buildLiveTeam(null, { now: NOW }), null);
  assert.equal(
    buildLiveTeam([node('agent:a', { status: 'done' }), node('dispatch:b', { status: 'failed' })], { now: NOW }),
    null,
  );
});

test('T-01: 題名は 40 字まで、なければ「題名なし」', () => {
  const long = 'あ'.repeat(50);
  const live = liveOf([
    node('agent:a', { status: 'working', title: long }),
    node('agent:b', { status: 'working', title: null }),
  ]);
  assert.equal(Array.from(live.rows[0]?.title ?? '').length, 40);
  assert.ok(live.rows[0]?.title.endsWith('…'));
  assert.equal(live.rows[1]?.title, '題名なし');
});

test('T-02: 稼働中 12 で 8 節と「ほか 4」。浅い順・同じ深さは新しい順に選び、並びは木の順', () => {
  // depth 1 の稼働中 6（新しさは i）と、depth 1 の done の親の下に depth 2 の稼働中 6。
  const team: ApexTeamNode[] = [];
  for (let i = 0; i < 6; i += 1) {
    team.push(node(`agent:a${i}`, { status: 'working', stateStartedAt: iso(NOW - (10 - i) * MIN) }));
  }
  team.push(node('dispatch:p', { status: 'done' }));
  for (let i = 0; i < 6; i += 1) {
    team.push(
      node(`dispatch:c${i}`, {
        parentKey: 'dispatch:p',
        depth: 2,
        status: 'live',
        createdAt: iso(NOW - (20 - i) * MIN),
      }),
    );
  }
  const live = liveOf(team);
  assert.equal(LIVE_TEAM_LIMIT, 8);
  assert.equal(live.more, 4);
  assert.equal(live.moreLabel, 'ほか 4');
  const counted = live.rows.filter((row) => !row.dim);
  assert.equal(counted.length, 8);
  // depth 1 の 6 はみな、depth 2 は新しい c5・c4 の 2 つ。祖先 p は数えずに足す。出す並びは木の順。
  assert.deepEqual(
    live.rows.map((row) => row.key),
    [
      'agent:a0',
      'agent:a1',
      'agent:a2',
      'agent:a3',
      'agent:a4',
      'agent:a5',
      'dispatch:p',
      'dispatch:c4',
      'dispatch:c5',
    ],
  );
});

test('T-02: 同じ深さで 8 を超えるときは新しい順に選ぶ', () => {
  const team: ApexTeamNode[] = [];
  for (let i = 0; i < 10; i += 1) {
    team.push(node(`agent:a${i}`, { status: 'working', stateStartedAt: iso(NOW - (100 - i) * MIN) }));
  }
  const live = liveOf(team);
  assert.deepEqual(
    live.rows.map((row) => row.key),
    ['agent:a2', 'agent:a3', 'agent:a4', 'agent:a5', 'agent:a6', 'agent:a7', 'agent:a8', 'agent:a9'],
  );
  assert.equal(live.moreLabel, 'ほか 2');
});

test('iss-00097 T-02：status done で未回答の ask の節は、稼働中 12 でも最初に選ばれ、祖先も出て、印を持ち薄くしない', () => {
  const team: ApexTeamNode[] = [];
  for (let i = 0; i < 12; i += 1) {
    team.push(node(`agent:a${i}`, { status: 'working', stateStartedAt: iso(NOW - i * MIN) }));
  }
  team.push(node('dispatch:p', { status: 'done' }));
  team.push(node('dispatch:q', { status: 'done', parentKey: 'dispatch:p', depth: 2, createdAt: iso(NOW - 600 * MIN) }));
  const attention = memberAttention({
    questions: [{ dispatchId: 'q', taskTitle: null, kind: 'ask', working: false }],
    waitingMembers: [],
  });
  const live = buildLiveTeam(team, { now: NOW, attention }) as Live;
  assert.ok(live);
  const keys = live.rows.map((row) => row.key);
  assert.ok(keys.includes('dispatch:q'));
  assert.ok(keys.includes('dispatch:p'));
  // 印のある節 1 と稼働中の新しい 7 を選ぶ。祖先 p は数えない。
  assert.equal(keys.filter((key) => key.startsWith('agent:')).length, 7);
  assert.equal(live.moreLabel, 'ほか 5');
  const q = live.rows.find((row) => row.key === 'dispatch:q');
  assert.equal(q?.dim, false);
  assert.deepEqual(q?.marks, [{ kind: 'question', label: '対応が必要：質問', urgent: true }]);
  assert.equal(live.rows.find((row) => row.key === 'dispatch:p')?.dim, true);
  assert.deepEqual(live.rows.find((row) => row.key === 'agent:a0')?.marks, []);
});

test('iss-00097 T-02：稼働中がなくても印のある節があれば木を出す。控えめの印だけの done の節は出さない', () => {
  const team = [node('agent:x', { status: 'done' }), node('dispatch:w', { status: 'done' })];
  const quiet = memberAttention({
    questions: [{ dispatchId: 'w', taskTitle: null, kind: 'ask', working: true }],
    waitingMembers: [],
  });
  assert.equal(buildLiveTeam(team, { now: NOW, attention: quiet }), null);
  const waiting = memberAttention({ questions: [], waitingMembers: [{ id: 'x', title: null, mark: 'blocked' }] });
  const live = buildLiveTeam(team, { now: NOW, attention: waiting }) as Live;
  assert.deepEqual(
    live.rows.map((row) => row.marks),
    [[{ kind: 'waiting', label: '対応が必要：許可待ち', urgent: true }]],
  );
});
