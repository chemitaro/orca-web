// 手書きの仮のタブ。実物の Orca の会話や識別子は使わない。
import type { ChatSendTarget, TerminalSendTarget } from '../../src/send/model.ts';

export const RUNTIME = 'runtime-test';
export const TERMINAL_AGENT = 'tab-test:leaf-test';
export const CHAT_AGENT = 'chat:chat-test';
export const terminalTarget = (): TerminalSendTarget => ({
  route: 'terminal',
  agentId: TERMINAL_AGENT,
  worktreeId: 'wt-test',
  tabId: 'terminal-test',
  leafId: 'leaf-test',
  handle: 'term_test',
  ptyId: 'pty-test',
  incarnationId: 'inc-test',
  agentType: 'codex',
  providerSessionId: 'session-terminal-test',
  runtimeId: RUNTIME,
});
export const chatTarget = (): ChatSendTarget => ({
  route: 'chat',
  agentId: CHAT_AGENT,
  worktreeId: 'wt-test',
  tabId: 'chat-test',
  agentType: 'claude',
  sessionId: 'session-chat-test',
  runtimeId: RUNTIME,
});
export const terminalTab = (): Record<string, unknown> => ({
  type: 'terminal',
  id: 'terminal-test',
  parentTabId: 'tab-test',
  leafId: 'leaf-test',
  status: 'ready',
  terminal: 'term_test',
  ptyId: 'pty-test',
  incarnationId: 'inc-test',
  agentStatus: { agentType: 'codex', providerSession: { id: 'session-terminal-test' } },
});
export const chatTab = (): Record<string, unknown> => ({
  type: 'agent-session',
  id: 'chat-test',
  agent: 'claude',
  sessionId: 'session-chat-test',
});
export const inventory = (tabs: unknown[] = [terminalTab(), chatTab()]): unknown => ({
  snapshots: [{ worktree: 'wt-test', tabs }],
});
