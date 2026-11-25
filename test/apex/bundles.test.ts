import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApexList } from '../../src/apex/build.ts';
import type { ApexItem, ApexListDocument } from '../../src/apex/model.ts';
import { BundleOwners } from '../../src/apex/owners.ts';
import type { AgentState, StateDocument } from '../../src/state/model.ts';
import { agent, fact, input, NOW } from '../inbox/fixture.ts';
import { type Orchestration, orchestration, tabbedWorker } from './fixture.ts';

const HOUR = 3_600_000;

function doc(agents: AgentState[], o: Orchestration, patch: Partial<StateDocument> = {}): StateDocument {
  return input({ agents, tasks: o.tasks, workers: o.workers, ...patch }).state;
}

function build(
  agents: AgentState[],
  o: Orchestration,
  owners: BundleOwners | null = new BundleOwners(),
  patch: Partial<StateDocument> = {},
): ApexListDocument {
  return buildApexList({ state: doc(agents, o, patch), now: NOW, project: null, extras: o.extras, owners });
}

function item(result: ApexListDocument, id: string): ApexItem {
  const found = result.items.find((entry) => entry.id === id);
  assert.ok(found, `${id} is an apex`);
  return found;
}

const coordinator = () => agent('coord', { paneKey: 'pane-c', state: fact('done') });
const chat = () => agent('chat', { kind: 'chat-tab', paneKey: 'pane-chat', terminal: fact(null), state: fact('done') });
const kidOf = (parent: string, id: string, dispatch: string, taskId: string) =>
  tabbedWorker(id, dispatch, taskId, { parentPaneKey: fact(parent) });

test('T-03: 根の task の createdByPaneKey が頂点の paneKey と一致する束の Dispatch（タブのないものを含む）が counts.total に入る', () => {
  const o = orchestration({
    runs: { 'run-a': 1 },
    tasks: [
      { id: 't-root', paneKey: 'pane-c', generation: 1 },
      { id: 't-1', parent: 't-root', generation: 1 },
      { id: 't-2', parent: 't-root', generation: 1 },
    ],
    dispatches: [
      { id: 'd1', task: 't-1', state: 'succeeded' },
      { id: 'd2', task: 't-2', state: 'working' },
    ],
  });
  const result = build([coordinator()], o);
  assert.deepEqual(item(result, 'coord').counts, { total: 2, working: 1, waiting: 0, done: 1 });
  assert.deepEqual(result.unlinked, []);
});

test('T-03: 作成者の paneKey が一致しない束は頂点に入らない', () => {
  const o = orchestration({
    tasks: [{ id: 't-root', paneKey: 'pane-other' }],
    dispatches: [{ id: 'd1', task: 't-root', state: 'succeeded' }],
  });
  assert.equal(item(build([coordinator()], o), 'coord').counts.total, 0);
});

test('T-04: 構造化 Chat はメンバーのタブで一度結べば、タブが消えた後も同じ BundleOwners で束が頂点に結ばれる', () => {
  const o = orchestration({
    tasks: [
      { id: 't-root', paneKey: null },
      { id: 't-1', parent: 't-root' },
      { id: 't-2', parent: 't-root' },
    ],
    dispatches: [
      { id: 'd1', task: 't-1', state: 'working' },
      { id: 'd2', task: 't-2', state: 'working' },
    ],
  });
  const owners = new BundleOwners();
  const first = build([chat(), kidOf('pane-chat', 'kid', 'd1', 't-1')], o, owners);
  assert.deepEqual(item(first, 'chat').counts.total, 2, 'kid と d2（d1 は kid と同じ）');
  const later = build([chat()], o, owners);
  assert.deepEqual(item(later, 'chat').counts, { total: 2, working: 2, waiting: 0, done: 0 });
  assert.equal(later.unlinked.length, 0);
  const fresh = build([chat()], o, new BundleOwners());
  assert.equal(item(fresh, 'chat').counts.total, 0);
});

test('T-05: 頂点が2回続けて消えると対応表から捨てる（1回では残る）。同じ世代の sweep は1回分', () => {
  const o = orchestration({ tasks: [{ id: 't-root' }], dispatches: [] });
  const owners = new BundleOwners();
  owners.observe('run-a#?', 'chat', NOW);
  const gone = doc([], o);
  owners.sweep(gone, o.extras, 1, NOW);
  owners.sweep(gone, o.extras, 1, NOW);
  owners.sweep(gone, o.extras, 1, NOW);
  assert.equal(owners.resolve('run-a#?'), 'chat', '同じ世代は1回分');
  owners.sweep(gone, o.extras, 2, NOW);
  assert.equal(owners.resolve('run-a#?'), null);
});

test('T-05: 頂点が文書にあれば消えた回数を戻す', () => {
  const o = orchestration({ tasks: [{ id: 't-root' }] });
  const owners = new BundleOwners();
  owners.observe('run-a#?', 'chat', NOW);
  owners.sweep(doc([], o), o.extras, 1, NOW);
  owners.sweep(doc([chat()], o), o.extras, 2, NOW);
  owners.sweep(doc([], o), o.extras, 3, NOW);
  assert.equal(owners.resolve('run-a#?'), 'chat');
});

test('T-13: tabs が stale か接続が connected でない文書では消えたと数えない', () => {
  const o = orchestration({ tasks: [{ id: 't-root' }] });
  const owners = new BundleOwners();
  owners.observe('run-a#?', 'chat', NOW);
  const base = doc([], o);
  const staleTabs = { ...base, sources: { ...base.sources, tabs: { ...base.sources.tabs, stale: true } } };
  const unreachable = { ...base, connection: { state: 'unreachable' as const, reason: 'x', checkedAt: null } };
  owners.sweep(staleTabs, o.extras, 1, NOW);
  owners.sweep(unreachable, o.extras, 2, NOW);
  owners.sweep(staleTabs, o.extras, 3, NOW);
  assert.equal(owners.resolve('run-a#?'), 'chat');
});

test('T-05: 束の task がすべて終わり最後の completedAt から 24 時間で捨てる', () => {
  const done = (at: number) =>
    orchestration({
      tasks: [
        { id: 't-root', status: 'completed', completedAt: new Date(at - 2 * HOUR).toISOString() },
        { id: 't-1', parent: 't-root', status: 'failed', completedAt: new Date(at).toISOString() },
      ],
    });
  const owners = new BundleOwners();
  owners.observe('run-a#?', 'chat', NOW);
  const recent = done(NOW - 23 * HOUR);
  owners.sweep(doc([chat()], recent), recent.extras, 1, NOW);
  assert.equal(owners.resolve('run-a#?'), 'chat');
  const old = done(NOW - 25 * HOUR);
  owners.sweep(doc([chat()], old), old.extras, 2, NOW);
  assert.equal(owners.resolve('run-a#?'), null);
});

test('T-05: 終わっていない task が残る束は 24 時間たっても捨てない', () => {
  const o = orchestration({
    tasks: [
      { id: 't-root', status: 'completed', completedAt: new Date(NOW - 48 * HOUR).toISOString() },
      { id: 't-1', parent: 't-root', status: 'blocked' },
    ],
  });
  const owners = new BundleOwners();
  owners.observe('run-a#?', 'chat', NOW);
  owners.sweep(doc([chat()], o), o.extras, 1, NOW);
  assert.equal(owners.resolve('run-a#?'), 'chat');
});

test('T-05: 1,001 件目で最も古いものを捨てる', () => {
  const owners = new BundleOwners();
  for (let i = 0; i < 1_001; i++) owners.observe(`run-${i}#1`, 'chat', NOW + i);
  const o = orchestration({});
  owners.sweep(doc([chat()], o), o.extras, 1, NOW);
  assert.equal(owners.size, 1_000);
  assert.equal(owners.resolve('run-0#1'), null);
  assert.equal(owners.resolve('run-1#1'), 'chat');
  assert.equal(owners.resolve('run-1000#1'), 'chat');
});

test('T-05: consumerGeneration が 2 の Run で、世代 1 の束のタブのない生きた Dispatch は世代 2 の束の頂点に数えられる', () => {
  const old = agent('old', { paneKey: 'pane-old', state: fact('done') });
  const current = agent('current', { paneKey: 'pane-new', state: fact('done') });
  const o = orchestration({
    runs: { 'run-a': 2 },
    tasks: [
      { id: 't-root-1', paneKey: 'pane-old', generation: 1 },
      { id: 't-1', parent: 't-root-1', generation: 1 },
      { id: 't-root-2', paneKey: 'pane-new', generation: 2 },
    ],
    dispatches: [
      { id: 'd-live', task: 't-1', state: 'working' },
      { id: 'd-done', task: 't-1', state: 'succeeded' },
    ],
  });
  const result = build([old, current], o);
  assert.deepEqual(item(result, 'old').counts, { total: 1, working: 0, waiting: 0, done: 1 });
  assert.deepEqual(item(result, 'current').counts, { total: 1, working: 1, waiting: 0, done: 0 });
});

test('T-05: 今の世代の束の頂点が分からなければ、古い世代の生きた Dispatch は結べない束に出る', () => {
  const old = agent('old', { paneKey: 'pane-old', state: fact('done') });
  const o = orchestration({
    runs: { 'run-a': 2 },
    tasks: [
      { id: 't-root-1', paneKey: 'pane-old', generation: 1 },
      { id: 't-root-2', paneKey: null, generation: 2 },
    ],
    dispatches: [{ id: 'd-live', task: 't-root-1', state: 'working' }],
  });
  const result = build([old], o);
  assert.equal(item(result, 'old').counts.total, 0);
  assert.deepEqual(
    result.unlinked.filter((entry) => entry.kind === 'bundle').map((entry) => entry.id),
    ['run-a#2'],
  );
});

test('T-13: タブのある作業者は counts.total に1回。古い世代の束の、生きた辺のメンバーの Dispatch は付け替えない', () => {
  const old = agent('old', { paneKey: 'pane-old', state: fact('done') });
  const current = agent('current', { paneKey: 'pane-new', state: fact('done') });
  const o = orchestration({
    runs: { 'run-a': 2 },
    tasks: [
      { id: 't-root-1', paneKey: 'pane-old', generation: 1 },
      { id: 't-1', parent: 't-root-1', generation: 1 },
      { id: 't-root-2', paneKey: 'pane-new', generation: 2 },
    ],
    dispatches: [
      { id: 'd-tab', task: 't-1', state: 'working' },
      { id: 'd-bare', task: 't-1', state: 'working' },
    ],
  });
  const kid = kidOf('pane-old', 'kid', 'd-tab', 't-1');
  const result = build([old, current, kid], o);
  assert.deepEqual(item(result, 'old').counts, { total: 1, working: 1, waiting: 0, done: 0 }, 'kid だけ');
  assert.deepEqual(item(result, 'current').counts, { total: 1, working: 1, waiting: 0, done: 0 }, 'd-bare');
});

test('T-14: 親のタブが消えた worker 持ちのエージェントは、束の頂点が分かればその頂点のメンバーになる（付け替えない）', () => {
  const o = orchestration({
    tasks: [
      { id: 't-root', paneKey: 'pane-c' },
      { id: 't-1', parent: 't-root' },
    ],
    dispatches: [
      { id: 'd1', task: 't-root', state: 'working' },
      { id: 'd2', task: 't-1', state: 'working' },
    ],
  });
  // depth は task の親の段数＋1。parentId は親の task の最後の Dispatch のエージェント（メンバーなら）、なければ頂点。
  const orphan = tabbedWorker('orphan', 'd1', 't-root', { parentPaneKey: fact('gone') });
  const grand = tabbedWorker('grand', 'd2', 't-1', { parentPaneKey: fact('gone-too') });
  const result = build([coordinator(), orphan, grand], o);
  const coord = item(result, 'coord');
  assert.deepEqual(
    coord.members.map(({ id, parentId, depth }) => ({ id, parentId, depth })),
    [
      { id: 'orphan', parentId: 'coord', depth: 1 },
      { id: 'grand', parentId: 'orphan', depth: 2 },
    ],
  );
  assert.equal(coord.counts.total, 2);
  assert.deepEqual(result.unlinked, []);
});

test('T-14: worker を持たない親のない子と輪は、結べないもののまま', () => {
  const o = orchestration({ tasks: [{ id: 't-root', paneKey: 'pane-c' }] });
  const result = build([coordinator(), agent('orphan', { parentPaneKey: fact('gone') })], o);
  assert.deepEqual(
    result.unlinked.map((entry) => entry.id),
    ['orphan'],
  );
});

test('extras と owners を渡さなければ、iss-00076 のとおり生きた辺だけで結ぶ', () => {
  const result = buildApexList({
    state: doc([coordinator(), kidOf('pane-c', 'kid', 'd1', 't-1')], orchestration({})),
    now: NOW,
    project: null,
  });
  assert.equal(item(result, 'coord').counts.total, 1);
});
