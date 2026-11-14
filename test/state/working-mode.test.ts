import assert from 'node:assert/strict';
import test from 'node:test';
import { OrcaCli, ReadOnlyOrcaCli } from '../../src/orca/orca-cli.ts';
import { createStateReader } from '../../src/orca/read-state.ts';
import { ReplayCliRunner, ReplayRpcTransport } from '../../src/orca/replay/replay.ts';
import { ReadOnlyRpc } from '../../src/orca/rpc.ts';
import { FIELDS } from '../../src/state/fields.ts';
import { StatePoller } from '../../src/state/poller.ts';
import { ms } from './fixture.ts';
import { CountingReader, report, staticReader } from './helpers.ts';

function modeReader(mode: unknown) {
  const agent = { state: 'working', workingMode: mode, prompt: 'private-prompt', toolInput: 'private-input' };
  return createStateReader(
    new ReadOnlyOrcaCli(
      new OrcaCli(
        new ReplayCliRunner({
          version: 1,
          kind: 'cli',
          entries: [
            {
              argv: ['worktree', 'ps', '--limit', '10000', '--json'],
              exitCode: 0,
              stderr: '',
              delayMs: 0,
              stdout: JSON.stringify({ ok: true, result: { worktrees: [{ worktreeId: 'wt-a', agents: [agent] }] } }),
            },
          ],
        }),
      ),
    ),
    new ReadOnlyRpc(
      new ReplayRpcTransport({
        version: 1,
        kind: 'rpc',
        exchanges: [
          {
            method: 'session.tabs.listAll',
            end: 'close',
            chunks: [
              `${JSON.stringify({
                id: '$ID',
                ok: true,
                result: {
                  snapshots: [
                    {
                      worktree: 'wt-a',
                      tabs: [
                        { type: 'terminal', id: 'tab-a', agentStatus: agent },
                        { type: 'agent-session', id: 'chat-a', chatStatus: agent },
                      ],
                    },
                  ],
                },
              })}\n`,
            ],
          },
        ],
      }),
    ),
  );
}

test('読み取りは3つの取得元から workingMode だけを追加し、本文を拾わない', async () => {
  const reader = modeReader('monitoring');
  const tabs = await reader.tabs();
  const ps = await reader.worktreePs();
  assert.ok(tabs.ok && ps.ok);
  assert.equal(tabs.data[0]?.tabs[0]?.agentStatus?.workingMode, 'monitoring');
  assert.equal(tabs.data[0]?.tabs[1]?.chatWorkingMode, 'monitoring');
  assert.equal(ps.data[0]?.agents[0]?.workingMode, 'monitoring');
  assert.doesNotMatch(JSON.stringify([tabs, ps]), /private-prompt|private-input/);
});

test('正規化は state と同じ取得元の workingMode を使い、取得元を混ぜない', async () => {
  const reader = new CountingReader(await staticReader());
  const tabs = await reader.tabs();
  const ps = await reader.worktreePs();
  assert.ok(tabs.ok && ps.ok);
  const terminal = tabs.data[0]?.tabs[0];
  const chat = tabs.data[0]?.tabs.find((tab) => tab.type === 'agent-session');
  const psAgent = ps.data[0]?.agents[0];
  const untabbed = ps.data[0]?.agents[1];
  assert.ok(terminal?.agentStatus && chat && psAgent && untabbed);
  terminal.agentStatus.workingMode = 'monitoring';
  psAgent.workingMode = 'future-mode';
  chat.chatWorkingMode = 'monitoring';
  untabbed.workingMode = 'monitoring';
  reader.overrides.tabs = async () => tabs;
  reader.overrides.worktreePs = async () => ps;
  const snapshot = () => new StatePoller({ reader, capabilities: async () => report(), now: () => ms(40) }).snapshot();
  let state = await snapshot();
  assert.deepEqual(state.agents.find((a) => a.id === 'uuid-10:uuid-11')?.workingMode, {
    value: 'monitoring',
    source: 'tabs',
    field: 'agentStatus.workingMode',
    missing: null,
  });
  assert.deepEqual(state.agents.find((a) => a.kind === 'chat-tab')?.workingMode, {
    value: 'monitoring',
    source: 'tabs',
    field: 'chatStatus.workingMode',
    missing: null,
  });
  assert.deepEqual(state.agents.find((a) => a.kind === 'untabbed')?.workingMode, {
    value: 'monitoring',
    source: 'worktreePs',
    field: 'agents.workingMode',
    missing: null,
  });
  // tabs の state があれば、ps の mode では補わない。
  terminal.agentStatus.workingMode = null;
  state = await snapshot();
  assert.deepEqual(state.agents.find((a) => a.id === 'uuid-10:uuid-11')?.workingMode, {
    value: null,
    source: 'tabs',
    field: 'agentStatus.workingMode',
    missing: 'not-provided',
  });
  // tabs の state がなければ ps の state と mode をセットで使う。
  terminal.agentStatus.state = null;
  terminal.agentStatus.workingMode = 'monitoring';
  state = await snapshot();
  assert.equal(state.agents.find((a) => a.id === 'uuid-10:uuid-11')?.state.source, 'worktreePs');
  assert.deepEqual(state.agents.find((a) => a.id === 'uuid-10:uuid-11')?.workingMode, {
    value: 'future-mode',
    source: 'worktreePs',
    field: 'agents.workingMode',
    missing: null,
  });
  psAgent.workingMode = null;
  state = await snapshot();
  assert.deepEqual(state.agents.find((a) => a.id === 'uuid-10:uuid-11')?.workingMode, {
    value: null,
    source: 'worktreePs',
    field: 'agents.workingMode',
    missing: 'not-provided',
  });
});

test('動きの種類は選べる項目だが既定では選ばない', () => {
  const field = FIELDS.find((entry) => entry.id === 'agent.workingMode');
  assert.ok(field);
  assert.equal(field.label, '動きの種類');
  assert.equal(field.defaultSelected, false);
});

test('読み取りは知らない mode の文字列を保ち、欠落や文字列でない値は null にする', async () => {
  for (const mode of ['future-mode', undefined, null, '', 42, { state: 'monitoring' }]) {
    const reader = modeReader(mode);
    const tabs = await reader.tabs();
    const ps = await reader.worktreePs();
    assert.ok(tabs.ok && ps.ok);
    const expected = mode === 'future-mode' ? 'future-mode' : null;
    assert.equal(tabs.data[0]?.tabs[0]?.agentStatus?.workingMode, expected);
    assert.equal(tabs.data[0]?.tabs[1]?.chatWorkingMode, expected);
    assert.equal(ps.data[0]?.agents[0]?.workingMode, expected);
  }
});
