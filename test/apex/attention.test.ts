// 頂点の文書の対応の材料（iss-00080 D-00、T-07）：waitingMembers と questions。
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApexList } from '../../src/apex/build.ts';
import type { ApexItem } from '../../src/apex/model.ts';
import { BundleOwners } from '../../src/apex/owners.ts';
import type { AgentState } from '../../src/state/model.ts';
import { agent, fact, input, NOW } from '../inbox/fixture.ts';
import { type DispatchSpec, orchestration, type TaskSpec } from './fixture.ts';

const ago = (ms: number) => new Date(NOW - ms).toISOString();
const child = (id: string, parent: string, patch: Partial<AgentState> = {}) =>
  agent(id, { parentPaneKey: fact(parent), ...patch });

function apexOf(agents: AgentState[], o: { tasks?: TaskSpec[]; dispatches?: DispatchSpec[] } = {}, id = 'r'): ApexItem {
  const orch = orchestration(o);
  const doc = buildApexList({
    state: input({ agents, tasks: orch.tasks, workers: orch.workers }).state,
    now: NOW,
    project: null,
    extras: orch.extras,
    owners: new BundleOwners(),
  });
  const found = doc.items.find((item) => item.id === id);
  assert.ok(found);
  return found;
}

test('T-07：waitingMembers は member_blocked・member_waiting の判定と同じメンバーだけ（猶予の中と attached でない端末は含まない）', () => {
  const root = agent('r', { state: fact('done') });
  const item = apexOf([
    root,
    child('blocked', 'r', { title: fact('許可待ちの子'), state: fact('blocked'), stateStartedAt: fact(ago(60_000)) }),
    child('waiting', 'r', { state: fact('waiting'), stateStartedAt: fact(null) }),
    child('grace', 'r', { state: fact('blocked'), stateStartedAt: fact(ago(19_000)) }),
    child('restoring', 'r', {
      state: fact('blocked'),
      stateStartedAt: fact(ago(60_000)),
      terminal: fact('awaiting-restore'),
    }),
    child('busy', 'r', { state: fact('working') }),
  ]);
  assert.deepEqual(item.waitingMembers, [
    { id: 'blocked', title: '許可待ちの子', mark: 'blocked' },
    { id: 'waiting', title: '仮のエージェント', mark: 'waiting' },
  ]);
  assert.ok(item.reasons.includes('member_blocked'));
  assert.ok(item.reasons.includes('member_waiting'));
});

test('T-07：猶予の中だけのメンバーなら waitingMembers は空で、理由も member_grace だけ', () => {
  const item = apexOf([
    agent('r', { state: fact('done') }),
    child('k', 'r', { state: fact('blocked'), stateStartedAt: fact(ago(19_000)) }),
  ]);
  assert.deepEqual(item.waitingMembers, []);
  assert.deepEqual(item.reasons, ['member_grace']);
});

test('T-07：questions は束の Dispatch の attention の input→ask、approval→gate。猶予の中でも出し、題名は 200 字まで', () => {
  const coord = agent('r', { paneKey: 'pane-c', state: fact('done'), stateStartedAt: fact(ago(5_000)) });
  const item = apexOf([coord], {
    tasks: [
      { id: 't1', paneKey: 'pane-c', title: '質問の task', createdAt: ago(1_000) },
      { id: 't2', paneKey: 'pane-c', title: 'あ'.repeat(250), createdAt: ago(1_000) },
      { id: 't3', paneKey: 'pane-c', title: '問いのない task' },
    ],
    dispatches: [
      { id: 'd1', task: 't1', state: 'blocked', attention: ['input'] },
      { id: 'd2', task: 't2', state: 'blocked', attention: ['approval'] },
      { id: 'd3', task: 't3', state: 'working' },
    ],
  });
  assert.ok(item.reasons.includes('grace'), '猶予の中');
  assert.deepEqual(item.questions, [
    { dispatchId: 'd1', taskTitle: '質問の task', kind: 'ask' },
    { dispatchId: 'd2', taskTitle: 'あ'.repeat(200), kind: 'gate' },
  ]);
});

test('T-07：問いのない頂点では questions も waitingMembers も空', () => {
  const item = apexOf([agent('r', { state: fact('working') }), child('k', 'r')]);
  assert.deepEqual(item.questions, []);
  assert.deepEqual(item.waitingMembers, []);
});
