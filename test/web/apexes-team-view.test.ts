import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApexTeamNode } from '../../src/apex/model.ts';
import { buildTeamBand, FAILED_RECENT_MS } from '../../web/apexes-team-view.js';

const NOW = Date.parse('2026-01-02T12:00:00.000Z');
const HOUR = 3_600_000;
/** 1画面に収まる行の数の目安（plan T-02 の例）。 */
const TEAM_VISIBLE_MAX = 30;
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
    createdAt: iso(NOW - 10 * HOUR),
    completedAt: null,
    stateStartedAt: kind === 'agent' ? iso(NOW - HOUR) : null,
    ...patch,
  };
}

type Row = {
  type: string;
  key: string;
  depth: number;
  count?: number;
  label?: string;
  rows?: Row[];
  elapsed?: string | null;
  href?: string | null;
  marks?: unknown;
};
type Band = { summary: string; rows: Row[]; history: { target: string; status: string }[] };

function bandOf(team: ApexTeamNode[]): Band {
  const band = buildTeamBand({ team }, NOW);
  assert.ok(band);
  return band as Band;
}

const keys = (rows: Row[]) => rows.map((row) => (row.type === 'group' ? `${row.key}(${row.count})` : row.key));

test('T-02: チームのない頂点は帯を作らない', () => {
  assert.equal(buildTeamBand({ team: [] }, NOW), null);
  assert.equal(buildTeamBand(null, NOW), null);
  assert.equal(buildTeamBand({}, NOW), null);
});

test('T-02: 要約は作業中＝working＋live、待ち、完了、失敗。不明は1以上のときだけ', () => {
  const team = [
    node('agent:a', { status: 'working' }),
    node('dispatch:b', { status: 'live' }),
    node('agent:c', { status: 'waiting' }),
    node('dispatch:d', { status: 'done' }),
    node('dispatch:e', { status: 'failed', completedAt: iso(NOW - HOUR) }),
  ];
  assert.equal(bandOf(team).summary, 'チーム 5（作業中 2・待ち 1・完了 1・失敗 1）');
  const withUnknown = [...team, node('agent:f', { status: 'unknown' })];
  assert.equal(bandOf(withUnknown).summary, 'チーム 6（作業中 2・待ち 1・完了 1・失敗 1・不明 1）');
});

test('T-02: 動いている・待ち・不明・24 時間以内の失敗とその祖先は出し、ほかは親ごとに「完了 n」', () => {
  const team = [
    node('dispatch:owner', { status: 'done' }),
    node('dispatch:impl-ok', { parentKey: 'dispatch:owner', depth: 2 }),
    node('dispatch:impl-bad', {
      parentKey: 'dispatch:owner',
      depth: 2,
      status: 'failed',
      completedAt: iso(NOW - FAILED_RECENT_MS + HOUR),
    }),
    node('dispatch:old-bad', { status: 'failed', completedAt: iso(NOW - FAILED_RECENT_MS - HOUR) }),
    node('agent:runner', { status: 'working' }),
    node('agent:asker', { status: 'waiting' }),
    node('agent:odd', { status: 'unknown' }),
    node('dispatch:live', { status: 'live' }),
    node('dispatch:done', { status: 'done' }),
  ];
  const band = bandOf(team);
  assert.deepEqual(keys(band.rows), [
    'dispatch:owner',
    'dispatch:impl-bad',
    'done:dispatch:owner(1)',
    'agent:runner',
    'agent:asker',
    'agent:odd',
    'dispatch:live',
    'done:apex(2)',
  ]);
  const group = band.rows.find((row) => row.key === 'done:apex');
  assert.ok(group);
  assert.equal(group.label, '完了 2');
  assert.equal(group.depth, 1);
  assert.deepEqual(keys(group.rows ?? []), ['dispatch:old-bad', 'dispatch:done']);
  const inner = band.rows.find((row) => row.key === 'done:dispatch:owner');
  assert.equal(inner?.depth, 2);
});

test('T-02: まとめた節の子孫もまとめの中に字下げのまま入る', () => {
  const team = [
    node('dispatch:p'),
    node('dispatch:c1', { parentKey: 'dispatch:p', depth: 2 }),
    node('dispatch:c2', { parentKey: 'dispatch:c1', depth: 3 }),
  ];
  const band = bandOf(team);
  assert.deepEqual(keys(band.rows), ['done:apex(3)']);
  assert.deepEqual(
    (band.rows[0]?.rows ?? []).map((row) => [row.key, row.depth]),
    [
      ['dispatch:p', 1],
      ['dispatch:c1', 2],
      ['dispatch:c2', 3],
    ],
  );
});

test('T-02: 経過はエージェントは stateStartedAt、Dispatch は completedAt（なければ createdAt）。エージェントはリンク', () => {
  const team = [
    node('agent:a', { status: 'working', stateStartedAt: iso(NOW - 5 * 60_000) }),
    node('dispatch:b', { status: 'live', createdAt: iso(NOW - 3 * HOUR), completedAt: null }),
    node('dispatch:c', {
      status: 'failed',
      createdAt: iso(NOW - 3 * HOUR),
      completedAt: iso(NOW - 2 * HOUR),
    }),
  ];
  const band = bandOf(team);
  const byKey = new Map(band.rows.map((row) => [row.key, row]));
  assert.equal(byKey.get('agent:a')?.elapsed, '5m');
  assert.equal(byKey.get('agent:a')?.href, '/embed/agent?id=a');
  assert.equal(byKey.get('dispatch:b')?.elapsed, '3h');
  assert.equal(byKey.get('dispatch:b')?.href, null);
  assert.equal(byKey.get('dispatch:c')?.elapsed, '2h');
});

test('T-02: 履歴の帯は Dispatch（Dispatch を持つエージェントの節を含む）を createdAt の順にすべて並べる', () => {
  const team = [
    node('agent:a', { dispatchId: 'da', createdAt: iso(NOW - 2 * HOUR), status: 'working' }),
    node('agent:solo', { createdAt: iso(NOW - 9 * HOUR) }),
    node('dispatch:b', { createdAt: iso(NOW - 5 * HOUR), status: 'failed' }),
    node('dispatch:c', { createdAt: null }),
    node('dispatch:d', { createdAt: iso(NOW - 3 * HOUR), status: 'live' }),
  ];
  const band = bandOf(team);
  assert.deepEqual(
    band.history.map((cell) => [cell.target, cell.status]),
    [
      ['dispatch:b', 'failed'],
      ['dispatch:d', 'live'],
      ['agent:a', 'working'],
      ['dispatch:c', 'done'],
    ],
  );
});

test('T-02: 120 節の束でも、出す行（まとめを含む）は上限を超えず、履歴の帯は 120 の Dispatch を表す', () => {
  const team: ApexTeamNode[] = [];
  for (let owner = 0; owner < 10; owner++) {
    const ownerKey = `dispatch:o${owner}`;
    team.push(node(ownerKey, { status: owner < 2 ? 'live' : 'done', createdAt: iso(NOW - (200 - owner) * HOUR) }));
    for (let impl = 0; impl < 11; impl++) {
      const status = owner === 0 && impl === 0 ? 'live' : owner === 1 && impl === 0 ? 'failed' : 'done';
      team.push(
        node(`dispatch:o${owner}-i${impl}`, {
          parentKey: ownerKey,
          depth: 2,
          status,
          createdAt: iso(NOW - (100 - impl) * HOUR),
          completedAt: status === 'failed' ? iso(NOW - HOUR) : null,
        }),
      );
    }
  }
  assert.equal(team.length, 120);
  const band = bandOf(team);
  assert.ok(band.rows.length <= TEAM_VISIBLE_MAX, `rows ${band.rows.length}`);
  assert.equal(band.history.length, 120);
  assert.equal(band.summary, 'チーム 120（作業中 3・待ち 0・完了 116・失敗 1）');
});

test('iss-00097 T-03：未回答の ask の done の節と許可待ちの節はいつも出す節に入り、祖先も出て、「完了 n」にまとめられない', () => {
  const team = [
    node('dispatch:p', { status: 'done' }),
    node('dispatch:q', { status: 'done', parentKey: 'dispatch:p', depth: 2 }),
    node('dispatch:r', { status: 'done', parentKey: 'dispatch:p', depth: 2 }),
    node('agent:m', { status: 'done' }),
    node('dispatch:s', { status: 'done' }),
  ];
  const band = buildTeamBand(
    {
      team,
      questions: [
        { dispatchId: 'q', taskTitle: null, kind: 'ask', working: false, answered: null },
        { dispatchId: 's', taskTitle: null, kind: 'gate', working: true },
      ],
      waitingMembers: [{ id: 'm', title: null, mark: 'waiting' }],
    },
    NOW,
  ) as Band;
  assert.ok(band);
  assert.deepEqual(keys(band.rows), ['dispatch:p', 'dispatch:q', 'done:dispatch:p(1)', 'agent:m', 'done:apex(1)']);
  const q = band.rows.find((row) => row.key === 'dispatch:q');
  assert.deepEqual(q?.marks, [{ kind: 'question', label: '対応が必要：質問', urgent: true }]);
  assert.deepEqual(band.rows.find((row) => row.key === 'agent:m')?.marks, [
    { kind: 'waiting', label: '対応が必要：入力待ち', urgent: true },
  ]);
  // 控えめの印だけの節はまとめの中に入り、印は持つ。
  const group = band.rows.find((row) => row.key === 'done:apex') as Row & { rows: Row[] };
  assert.deepEqual(group.rows[0]?.marks, [
    { kind: 'question_working', label: '質問あり（作業は継続中）', urgent: false },
  ]);
});
