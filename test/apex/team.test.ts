import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApexList } from '../../src/apex/build.ts';
import type { ApexItem, ApexTeamNode } from '../../src/apex/model.ts';
import { BundleOwners } from '../../src/apex/owners.ts';
import type { AgentState } from '../../src/state/model.ts';
import { agent, fact, input, NOW } from '../inbox/fixture.ts';
import { type Orchestration, orchestration, tabbedWorker } from './fixture.ts';

function team(agents: AgentState[], o: Orchestration, apexId = 'coord'): ApexTeamNode[] {
  const state = input({ agents, tasks: o.tasks, workers: o.workers }).state;
  const result = buildApexList({ state, now: NOW, project: null, extras: o.extras, owners: new BundleOwners() });
  const found: ApexItem | undefined = result.items.find((entry) => entry.id === apexId);
  assert.ok(found, `${apexId} is an apex`);
  return found.team;
}

const coordinator = () => agent('coord', { paneKey: 'pane-c', state: fact('done') });
const shape = (nodes: ApexTeamNode[]) =>
  nodes.map(({ key, kind, parentKey, depth, status }) => ({ key, kind, parentKey, depth, status }));

test('T-01: タブのある作業者とその Dispatch は1節（agent）で、Dispatch の id と task の時刻を持つ', () => {
  const o = orchestration({
    tasks: [
      { id: 't-root', paneKey: 'pane-c', title: '根の仕事', createdAt: '2026-01-02T10:00:00.000Z' },
      {
        id: 't-1',
        parent: 't-root',
        title: '子の仕事',
        createdAt: '2026-01-02T10:10:00.000Z',
        completedAt: '2026-01-02T10:20:00.000Z',
      },
    ],
    dispatches: [{ id: 'd1', task: 't-1', state: 'working' }],
  });
  const kid = tabbedWorker('kid', 'd1', 't-1', { parentPaneKey: fact('pane-c'), state: fact('blocked') });
  const nodes = team([coordinator(), kid], o);
  assert.deepEqual(nodes, [
    {
      key: 'agent:kid',
      kind: 'agent',
      agentId: 'kid',
      dispatchId: 'd1',
      parentKey: null,
      depth: 1,
      title: '子の仕事',
      status: 'waiting',
      createdAt: '2026-01-02T10:10:00.000Z',
      completedAt: '2026-01-02T10:20:00.000Z',
      stateStartedAt: kid.stateStartedAt.value,
    },
  ]);
});

test('T-01: 閉じた子の Dispatch は、親の task の最後の Dispatch の節の下に出る（再試行は最後）', () => {
  const o = orchestration({
    tasks: [
      { id: 't-root', paneKey: 'pane-c', createdAt: '2026-01-02T09:00:00.000Z' },
      { id: 't-owner', parent: 't-root', createdAt: '2026-01-02T09:10:00.000Z' },
      {
        id: 't-impl',
        parent: 't-owner',
        createdAt: '2026-01-02T09:20:00.000Z',
        completedAt: '2026-01-02T09:40:00.000Z',
      },
    ],
    dispatches: [
      { id: 'd-owner-1', task: 't-owner', state: 'failed' },
      { id: 'd-owner-2', task: 't-owner', state: 'succeeded' },
      { id: 'd-impl', task: 't-impl', state: 'succeeded' },
    ],
  });
  const nodes = team([coordinator()], o);
  assert.deepEqual(shape(nodes), [
    { key: 'dispatch:d-owner-1', kind: 'dispatch', parentKey: null, depth: 1, status: 'failed' },
    { key: 'dispatch:d-owner-2', kind: 'dispatch', parentKey: null, depth: 1, status: 'done' },
    { key: 'dispatch:d-impl', kind: 'dispatch', parentKey: 'dispatch:d-owner-2', depth: 2, status: 'done' },
  ]);
  const impl = nodes.find((node) => node.key === 'dispatch:d-impl');
  assert.equal(impl?.completedAt, '2026-01-02T09:40:00.000Z');
  assert.equal(impl?.stateStartedAt, null);
  assert.equal(impl?.agentId, null);
});

test('T-01: 親の task の最後の Dispatch がタブのある作業者なら、その agent の節の下に出る', () => {
  const o = orchestration({
    tasks: [
      { id: 't-root', paneKey: 'pane-c' },
      { id: 't-owner', parent: 't-root', createdAt: '2026-01-02T09:00:00.000Z' },
      { id: 't-impl', parent: 't-owner', createdAt: '2026-01-02T09:10:00.000Z' },
    ],
    dispatches: [
      { id: 'd-owner', task: 't-owner', state: 'working' },
      { id: 'd-impl', task: 't-impl', state: 'working' },
    ],
  });
  const owner = tabbedWorker('owner', 'd-owner', 't-owner', { parentPaneKey: fact('pane-c') });
  assert.deepEqual(shape(team([coordinator(), owner], o)), [
    { key: 'agent:owner', kind: 'agent', parentKey: null, depth: 1, status: 'working' },
    { key: 'dispatch:d-impl', kind: 'dispatch', parentKey: 'agent:owner', depth: 2, status: 'live' },
  ]);
});

test('T-01: 親の見えない節は頂点の直下。並びは createdAt の古い順、同じなら worker-list の並び', () => {
  const o = orchestration({
    tasks: [
      { id: 't-root', paneKey: 'pane-c' },
      { id: 't-a', parent: 't-root', createdAt: '2026-01-02T10:00:00.000Z' },
      { id: 't-b', parent: 't-root', createdAt: '2026-01-02T09:00:00.000Z' },
      { id: 't-c', parent: 't-gone', createdAt: '2026-01-02T10:00:00.000Z' },
    ],
    dispatches: [
      { id: 'd-a', task: 't-a', state: 'succeeded' },
      { id: 'd-c', task: 't-c', state: 'succeeded' },
      { id: 'd-b', task: 't-b', state: 'stopped' },
    ],
  });
  assert.deepEqual(
    team([coordinator()], o).map(({ key, parentKey }) => ({ key, parentKey })),
    [
      { key: 'dispatch:d-b', parentKey: null },
      { key: 'dispatch:d-a', parentKey: null },
      { key: 'dispatch:d-c', parentKey: null },
    ],
  );
});

test('T-01: status の写し方：sleeping→done、unknown→unknown、生きた Dispatch→live。エージェントだけの節は completedAt が null', () => {
  const o = orchestration({
    tasks: [{ id: 't-root', paneKey: 'pane-c' }],
    dispatches: [{ id: 'd-live', task: 't-root', state: 'working' }],
  });
  const sleeper = agent('sleeper', {
    parentPaneKey: fact('pane-c'),
    state: fact(null),
    terminal: fact('awaiting-restore'),
    sessionStartedAt: fact('2026-01-02T08:00:00.000Z'),
  });
  const odd = agent('odd', { parentPaneKey: fact('pane-c'), state: fact('strange'), stateStartedAt: fact(null) });
  const nodes = team([coordinator(), sleeper, odd], o);
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  assert.equal(byKey.get('agent:sleeper')?.status, 'done');
  assert.equal(byKey.get('agent:sleeper')?.createdAt, '2026-01-02T08:00:00.000Z', 'sessionStartedAt');
  assert.equal(byKey.get('agent:sleeper')?.completedAt, null);
  assert.equal(byKey.get('agent:odd')?.status, 'unknown');
  assert.equal(byKey.get('agent:odd')?.createdAt, null);
  assert.equal(byKey.get('dispatch:d-live')?.status, 'live');
});

test('T-01: 題名は task の題名、なければエージェントの題名で、200 字まで', () => {
  const long = 'あ'.repeat(250);
  const o = orchestration({
    tasks: [
      { id: 't-root', paneKey: 'pane-c' },
      { id: 't-1', parent: 't-root', title: long },
    ],
    dispatches: [{ id: 'd1', task: 't-1', state: 'succeeded' }],
  });
  const plain = agent('plain', { parentPaneKey: fact('pane-c'), title: fact('エージェントの題名') });
  const nodes = team([coordinator(), plain], o);
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  assert.equal(byKey.get('dispatch:d1')?.title, 'あ'.repeat(200));
  assert.equal(byKey.get('agent:plain')?.title, 'エージェントの題名');
});

test('T-01: エージェントの節の下に孫のエージェントが深さ 2 で出る', () => {
  const lead = agent('lead', { paneKey: 'pane-lead', parentPaneKey: fact('pane-c') });
  const impl = agent('impl', { parentPaneKey: fact('pane-lead') });
  assert.deepEqual(shape(team([coordinator(), lead, impl], orchestration({}))), [
    { key: 'agent:lead', kind: 'agent', parentKey: null, depth: 1, status: 'working' },
    { key: 'agent:impl', kind: 'agent', parentKey: 'agent:lead', depth: 2, status: 'working' },
  ]);
});
