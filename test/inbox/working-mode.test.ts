import assert from 'node:assert/strict';
import test from 'node:test';
import * as classify from '../../src/inbox/classify.ts';
import { agent, ci, fact, gate, input, mail, message, pr, STARTED, worker, worktree } from './fixture.ts';

test('agentWorkingMode は working と monitoring の組だけを認め、mark は working のまま', () => {
  assert.equal(typeof classify.agentWorkingMode, 'function');
  for (const state of ['working', 'done', 'waiting', 'blocked', 'future-state', null]) {
    for (const mode of ['monitoring', 'future-mode', '', null]) {
      const value = agent('a', { state: fact(state), workingMode: fact(mode) });
      assert.equal(
        classify.agentWorkingMode(value),
        state === 'working' && mode === 'monitoring' ? 'monitoring' : null,
      );
      if (state === 'working') assert.equal(classify.agentMark(value), 'working');
    }
  }
});

test('monitoring は長い無出力でも running だが、端末終了は stalled にする', () => {
  const monitoring = agent('monitoring', { workingMode: fact('monitoring'), lastOutputAt: fact(STARTED) });
  const ended = agent('ended', { ...monitoring, id: 'ended', terminal: fact('exited') });
  const ordinary = agent('ordinary', { lastOutputAt: fact(STARTED) });
  const data = input({ agents: [monitoring, ended, ordinary] });
  const inbox = classify.buildInbox(data);
  const running = inbox.stages.find((stage) => stage.stage === 'running')?.items;
  const stalled = inbox.stages.find((stage) => stage.stage === 'stalled')?.items;
  assert.deepEqual(
    running?.map((item) => [item.id, item.reasons, item.workingMode]),
    [['agent:monitoring', ['working'], 'monitoring']],
  );
  assert.deepEqual(
    stalled?.map((item) => [item.id, item.reasons, item.workingMode]),
    [
      ['agent:ended', ['terminal_ended'], 'monitoring'],
      ['agent:ordinary', ['no_output'], null],
    ],
  );
});

test('monitoring でも質問の要対応は保ち、エージェント以外の mode は null', () => {
  const data = input({
    agents: [agent('a', { workingMode: fact('monitoring') })],
    workers: [worker()],
    worktrees: [worktree({ pr: pr(), ci: ci() })],
  });
  data.mail = mail({
    messages: [message(), message({ id: 'unlinked', dispatchId: 'missing' })],
    gates: [gate({ taskId: 'missing' })],
  });
  const items = classify.buildInbox(data).stages.flatMap((stage) => stage.items);
  const linked = items.find((item) => item.id === 'agent:a');
  assert.equal(linked?.stage, 'needs_action');
  assert.deepEqual(linked?.reasons, ['question']);
  assert.equal(linked?.workingMode, 'monitoring');
  const others = items.filter((item) => item.kind !== 'agent');
  assert.deepEqual(others.map((item) => item.kind).sort(), ['gate', 'pr', 'question']);
  assert.ok(others.every((item) => item.workingMode === null));
});
