import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TerminalSendTarget } from '../../src/send/model.ts';
import { buildPreview, compareTargets, resolveTarget } from '../../src/send/target.ts';
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
