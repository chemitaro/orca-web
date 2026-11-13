// 確認した送信先の識別子。秘密や票はこの型に含めない。
interface TargetBase {
  agentId: string;
  worktreeId: string;
  tabId: string;
  agentType: string;
  runtimeId: string;
}

export interface TerminalSendTarget extends TargetBase {
  route: 'terminal';
  leafId: string | null;
  handle: string;
  ptyId: string;
  incarnationId: string;
  providerSessionId: string;
}

export interface ChatSendTarget extends TargetBase {
  route: 'chat';
  sessionId: string;
}

export type SendTarget = TerminalSendTarget | ChatSendTarget;
export type TargetResolution =
  | { ok: true; target: SendTarget }
  | { ok: false; error: 'agent_not_found' | 'unknown_shape' }
  | { ok: false; error: 'not_sendable'; reason: 'asleep' | 'no_session' | 'identity_unavailable' };

export type TargetChange =
  | 'runtime_changed'
  | 'worktree_changed'
  | 'tab_changed'
  | 'terminal_changed'
  | 'agent_changed'
  | 'session_changed';

export interface SendPreview {
  repoName: string | null;
  worktreePath: string | null;
  branch: string | null;
  agentType: string;
  title: string | null;
  state: string | null;
  route: SendTarget['route'];
  sessionShortId: string;
}
