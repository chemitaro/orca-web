import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TerminalSendTarget } from '../../src/send/model.ts';
import { promptMatches } from '../../src/send/question-state.ts';
import {
  buildPreview,
  compareTargets,
  resolveTarget,
  targetFingerprint,
  terminalPromptOf,
} from '../../src/send/target.ts';
import { agent, fact, repo, state, worktree } from '../runs/fixture.ts';
import {
  CHAT_AGENT,
  chatTab,
  chatTarget,
  inventory,
  RUNTIME,
  TERMINAL_AGENT,
  terminalTab,
  terminalTarget,
} from './fixture.ts';

test('端末の paneKey と snapshot の worktree から完全な送信先を解く', () => {
  assert.deepEqual(resolveTarget(inventory(), TERMINAL_AGENT, RUNTIME), { ok: true, target: terminalTarget() });
});

test('構造化 Chat の id で解き、読めない sleptAt は宛先判定に使わない', () => {
  assert.deepEqual(resolveTarget(inventory(), CHAT_AGENT, RUNTIME), { ok: true, target: chatTarget() });
});

test('宛先がない場合と、スリープ、セッションなし、識別子なし、形の違いを分ける', () => {
  assert.deepEqual(resolveTarget(inventory(), 'unknown-agent', RUNTIME), { ok: false, error: 'agent_not_found' });
  for (const status of ['pending-handle', '', undefined]) {
    assert.deepEqual(resolveTarget(inventory([{ ...terminalTab(), status }]), TERMINAL_AGENT, RUNTIME), {
      ok: false,
      error: 'not_sendable',
      reason: 'asleep',
    });
  }
  for (const agentStatus of [
    undefined,
    {},
    { agentType: 'codex' },
    { agentType: 'codex', providerSession: { id: '' } },
  ]) {
    assert.deepEqual(resolveTarget(inventory([{ ...terminalTab(), agentStatus }]), TERMINAL_AGENT, RUNTIME), {
      ok: false,
      error: 'not_sendable',
      reason: 'no_session',
    });
  }
  for (const key of ['terminal', 'ptyId', 'incarnationId']) {
    for (const value of [undefined, '', 1]) {
      assert.deepEqual(resolveTarget(inventory([{ ...terminalTab(), [key]: value }]), TERMINAL_AGENT, RUNTIME), {
        ok: false,
        error: 'not_sendable',
        reason: 'identity_unavailable',
      });
    }
  }
  assert.deepEqual(
    resolveTarget(
      inventory([{ ...terminalTab(), launchAgent: 'codex', agentStatus: { providerSession: { id: 's' } } }]),
      TERMINAL_AGENT,
      RUNTIME,
    ),
    {
      ok: false,
      error: 'not_sendable',
      reason: 'identity_unavailable',
    },
  );
  for (const key of ['agent', 'sessionId']) {
    assert.deepEqual(resolveTarget(inventory([{ ...chatTab(), [key]: '' }]), CHAT_AGENT, RUNTIME), {
      ok: false,
      error: 'not_sendable',
      reason: 'no_session',
    });
  }
  for (const bad of [
    null,
    {},
    { snapshots: null },
    { snapshots: [null] },
    { snapshots: [{ worktree: '', tabs: [] }] },
    { snapshots: [{ worktree: 'wt-test', tabs: [null] }] },
  ]) {
    assert.deepEqual(resolveTarget(bad, TERMINAL_AGENT, RUNTIME), { ok: false, error: 'unknown_shape' });
  }
});

test('paneKey がなければタブ id を使い、他のタブや別の worktree を取り違えない', () => {
  const tab = terminalTab();
  delete tab.parentTabId;
  delete tab.leafId;
  assert.deepEqual(resolveTarget(inventory([tab]), 'terminal-test', RUNTIME), {
    ok: true,
    target: { ...terminalTarget(), agentId: 'terminal-test', leafId: null },
  });
  assert.deepEqual(resolveTarget(inventory([tab]), TERMINAL_AGENT, RUNTIME), { ok: false, error: 'agent_not_found' });
  assert.deepEqual(
    resolveTarget(
      {
        snapshots: [
          { worktree: 'other-wt', tabs: [{ type: 'browser', id: 'browser-test' }] },
          { worktree: 'wt-second', tabs: [chatTab()] },
        ],
      },
      CHAT_AGENT,
      RUNTIME,
    ),
    { ok: true, target: { ...chatTarget(), worktreeId: 'wt-second' } },
  );
});

test('宛先の runtime が変われば runtime_changed、同じなら変化なし', () => {
  assert.equal(compareTargets(terminalTarget(), { ...terminalTarget(), runtimeId: 'new-runtime' }), 'runtime_changed');
  assert.equal(compareTargets(terminalTarget(), terminalTarget()), null);
});

test('worktree の移動は宛先の変化として拒む', () => {
  assert.equal(
    compareTargets(terminalTarget(), { ...terminalTarget(), worktreeId: 'other-worktree' }),
    'worktree_changed',
  );
});

test('タブ、leaf、端末、種類、セッションの識別子の違いを種類つきで返す', () => {
  const cases: [Partial<TerminalSendTarget>, string][] = [
    [{ agentId: 'different-pane' }, 'tab_changed'],
    [{ tabId: 'other-tab' }, 'tab_changed'],
    [{ leafId: 'other-leaf' }, 'tab_changed'],
    [{ handle: 'term_other' }, 'terminal_changed'],
    [{ ptyId: 'other-pty' }, 'terminal_changed'],
    [{ incarnationId: 'other-inc' }, 'terminal_changed'],
    [{ agentType: 'claude' }, 'agent_changed'],
    [{ providerSessionId: 'other-session' }, 'session_changed'],
  ];
  for (const [patch, reason] of cases)
    assert.equal(compareTargets(terminalTarget(), { ...terminalTarget(), ...patch }), reason);
  assert.equal(compareTargets(chatTarget(), { ...chatTarget(), sessionId: 'other-session' }), 'session_changed');
  assert.equal(compareTargets(chatTarget(), { ...chatTarget(), agentType: 'codex' }), 'agent_changed');
  assert.equal(compareTargets(chatTarget(), chatTarget()), null);
  assert.equal(compareTargets(terminalTarget(), chatTarget()), 'agent_changed');
  assert.equal(
    compareTargets(terminalTarget(), { ...terminalTarget(), runtimeId: 'new-runtime', worktreeId: 'new-wt' }),
    'runtime_changed',
  );
});

function previewState() {
  return state({
    repos: [repo('repo-test', '仮のリポジトリ')],
    worktrees: [
      worktree({ id: 'wt-test', repoId: 'repo-test', path: fact('/test/worktree'), branch: fact('iss-test') }),
    ],
    agents: [
      agent(TERMINAL_AGENT, {
        worktreeId: 'wt-test',
        terminalHandle: 'term_test',
        agentType: fact('codex'),
        title: fact('仮の端末'),
        state: fact('working'),
      }),
    ],
  });
}

test('確認の項目は宛先に一致した状態から作り、セッションは先頭8文字だけにする', () => {
  assert.deepEqual(buildPreview(previewState(), terminalTarget()), {
    repoName: '仮のリポジトリ',
    worktreePath: '/test/worktree',
    branch: 'iss-test',
    agentType: 'codex',
    title: '仮の端末',
    state: 'working',
    route: 'terminal',
    sessionShortId: 'session-',
  });
});

test('状態の worktree、handle、種類が宛先と一致しなければ確認の項目を作らない', () => {
  const target = terminalTarget();
  for (const patch of [
    { worktreeId: 'other-worktree' },
    { terminalHandle: 'term_other' },
    { agentType: fact('claude') },
  ]) {
    const s = previewState();
    const first = s.agents[0];
    assert.ok(first);
    Object.assign(first, patch);
    assert.equal(buildPreview(s, target), null);
  }
  const s = previewState();
  s.worktrees = [worktree({ id: 'other-worktree' })];
  assert.equal(buildPreview(s, target), null);
  s.agents = [];
  assert.equal(buildPreview(s, target), null);
  const chatState = previewState();
  chatState.agents = [agent(CHAT_AGENT, { kind: 'chat-tab', worktreeId: 'wt-test', terminalHandle: null })];
  assert.equal(buildPreview(chatState, chatTarget())?.route, 'chat');
  assert.equal(buildPreview(chatState, chatTarget())?.sessionShortId, 'session-');
  const first = chatState.agents[0];
  assert.ok(first);
  first.worktreeId = 'other-worktree';
  assert.equal(buildPreview(chatState, chatTarget()), null);
});

test('指紋は経路ごとの固定値で、各識別項目を区別し識別子を含まない', () => {
  for (const [target, expected] of [
    [terminalTarget(), '6339a27dcf1cdc2cf7f87b7fa5b4591f'],
    [chatTarget(), '0e1821f3ebe7bdfe81c7053700be51f1'],
  ] as const) {
    assert.equal(targetFingerprint(target), expected);
    assert.match(targetFingerprint(target), /^[a-f0-9]{32}$/);
    for (const [key, value] of Object.entries(target)) {
      if (key === 'agentId' || key === 'route') continue;
      assert.notEqual(targetFingerprint({ ...target, [key]: `${value}-changed` }), expected, key);
      assert.ok(!expected.includes(value), key);
    }
    assert.equal(targetFingerprint({ ...target, agentId: 'derived-id' }), expected);
  }
  assert.notEqual(targetFingerprint({ ...terminalTarget(), leafId: null }), targetFingerprint(terminalTarget()));
});

test('iss-00049 T-05 terminalPromptOf：タブの agentStatus から state・toolName・interactivePrompt を読み、文字でなければ null', () => {
  const tab = {
    ...terminalTab(),
    agentStatus: {
      agentType: 'claude',
      providerSession: { id: 'session-terminal-test' },
      state: 'waiting',
      toolName: 'AskUserQuestion',
      interactivePrompt: '{"questions":[]}',
    },
  };
  assert.deepEqual(terminalPromptOf(inventory([tab, chatTab()]), terminalTarget()), {
    state: 'waiting',
    toolName: 'AskUserQuestion',
    interactivePrompt: '{"questions":[]}',
  });
  const odd = { ...tab, agentStatus: { state: 3, toolName: null } };
  assert.deepEqual(terminalPromptOf(inventory([odd]), terminalTarget()), {
    state: null,
    toolName: null,
    interactivePrompt: null,
  });
  assert.equal(terminalPromptOf(inventory([{ ...tab, agentStatus: undefined }]), terminalTarget()), null);
  assert.equal(terminalPromptOf(inventory([tab]), { tabId: 'other-tab', leafId: 'leaf-test' }), null);
  assert.equal(terminalPromptOf({ nope: 1 }, terminalTarget()), null);
});

test('CP-1 terminalPromptOf：分割した端末では、id と leafId の両方が宛先と同じペインの agentStatus だけを読む', () => {
  const ask = JSON.stringify({ questions: [{ question: '仮の問い', options: ['甲', '乙'] }] });
  const pane = (leafId: string | undefined, state: string, interactivePrompt?: string) => ({
    ...terminalTab(),
    leafId,
    terminal: `term_${leafId ?? 'none'}`,
    agentStatus: {
      agentType: 'claude',
      providerSession: { id: `session-${leafId}` },
      state,
      toolName: 'AskUserQuestion',
      ...(interactivePrompt === undefined ? {} : { interactivePrompt }),
    },
  });
  const questions = [
    {
      id: '0',
      header: null,
      question: '仮の問い',
      multiSelect: false,
      options: [
        { id: '0', label: '甲', description: null },
        { id: '1', label: '乙', description: null },
      ],
      allowOther: true,
      otherAllowsEmpty: false,
      preview: false,
    },
  ];
  // 別のペインが同じ問いを出していても、宛先のペインが working なら確かめられない
  const otherAsks = inventory([pane('leaf-other', 'waiting', ask), pane('leaf-test', 'working')]);
  assert.equal(terminalPromptOf(otherAsks, terminalTarget())?.state, 'working');
  assert.equal(promptMatches(terminalPromptOf(otherAsks, terminalTarget()), questions), 'unverified');
  // 宛先のペインが出していれば match（並びの順によらない）
  const targetAsks = inventory([pane('leaf-test', 'waiting', ask), pane('leaf-other', 'working')]);
  assert.equal(promptMatches(terminalPromptOf(targetAsks, terminalTarget()), questions), 'match');
  const reversed = inventory([pane('leaf-other', 'working'), pane('leaf-test', 'waiting', ask)]);
  assert.equal(promptMatches(terminalPromptOf(reversed, terminalTarget()), questions), 'match');
  // 宛先の leafId が null なら、leafId のない項目だけを読む（resolveTarget と同じ照合）
  const noLeaf = inventory([pane('leaf-other', 'waiting', ask), pane(undefined, 'working')]);
  assert.equal(terminalPromptOf(noLeaf, { tabId: 'terminal-test', leafId: null })?.state, 'working');
  assert.equal(
    terminalPromptOf(inventory([pane('leaf-other', 'waiting', ask)]), { tabId: 'terminal-test', leafId: null }),
    null,
  );
});
