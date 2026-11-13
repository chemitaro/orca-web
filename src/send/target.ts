// 送信先の解決。Orca を読まず、session.tabs.listAll の写しだけを扱う。
import type { StateDocument } from '../state/model.ts';
import type { SendPreview, SendTarget, TargetChange, TargetResolution } from './model.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

export function resolveTarget(listAll: unknown, agentId: string, runtimeId: string): TargetResolution {
  if (!isRecord(listAll) || !Array.isArray(listAll.snapshots)) return { ok: false, error: 'unknown_shape' };
  for (const snap of listAll.snapshots) {
    if (!isRecord(snap) || !text(snap.worktree) || !Array.isArray(snap.tabs))
      return { ok: false, error: 'unknown_shape' };
    for (const tab of snap.tabs) {
      if (!isRecord(tab) || !text(tab.id) || !text(tab.type)) return { ok: false, error: 'unknown_shape' };
      if (tab.type === 'agent-session') {
        if (`chat:${tab.id}` !== agentId) continue;
        const agentType = text(tab.agent);
        const sessionId = text(tab.sessionId);
        if (!agentType || !sessionId) return { ok: false, error: 'not_sendable', reason: 'no_session' };
        return {
          ok: true,
          target: {
            route: 'chat',
            agentId,
            worktreeId: snap.worktree as string,
            tabId: tab.id as string,
            agentType,
            sessionId,
            runtimeId,
          },
        };
      }
      if (tab.type !== 'terminal') continue;
      const leafId = text(tab.leafId);
      const parentTabId = text(tab.parentTabId);
      const id = parentTabId && leafId ? `${parentTabId}:${leafId}` : tab.id;
      if (id !== agentId) continue;
      if (tab.status !== 'ready') return { ok: false, error: 'not_sendable', reason: 'asleep' };
      const status = isRecord(tab.agentStatus) ? tab.agentStatus : null;
      const provider = status && isRecord(status.providerSession) ? status.providerSession : null;
      const providerSessionId = text(provider?.id);
      if (!providerSessionId) return { ok: false, error: 'not_sendable', reason: 'no_session' };
      const handle = text(tab.terminal);
      const ptyId = text(tab.ptyId);
      const incarnationId = text(tab.incarnationId);
      const agentType = text(status?.agentType);
      if (!handle || !ptyId || !incarnationId || !agentType)
        return { ok: false, error: 'not_sendable', reason: 'identity_unavailable' };
      return {
        ok: true,
        target: {
          route: 'terminal',
          agentId,
          worktreeId: snap.worktree as string,
          tabId: tab.id as string,
          leafId,
          handle,
          ptyId,
          incarnationId,
          agentType,
          providerSessionId,
          runtimeId,
        },
      };
    }
  }
  return { ok: false, error: 'agent_not_found' };
}

export function compareTargets(confirmed: SendTarget, fresh: SendTarget): TargetChange | null {
  if (confirmed.runtimeId !== fresh.runtimeId) return 'runtime_changed';
  if (confirmed.worktreeId !== fresh.worktreeId) return 'worktree_changed';
  if (confirmed.route !== fresh.route) return 'agent_changed';
  if (confirmed.agentId !== fresh.agentId || confirmed.tabId !== fresh.tabId) return 'tab_changed';
  if (confirmed.route === 'terminal' && fresh.route === 'terminal') {
    if (confirmed.leafId !== fresh.leafId) return 'tab_changed';
    if (
      confirmed.handle !== fresh.handle ||
      confirmed.ptyId !== fresh.ptyId ||
      confirmed.incarnationId !== fresh.incarnationId
    )
      return 'terminal_changed';
  }
  if (confirmed.agentType !== fresh.agentType) return 'agent_changed';
  if (
    confirmed.route === 'terminal' &&
    fresh.route === 'terminal' &&
    confirmed.providerSessionId !== fresh.providerSessionId
  )
    return 'session_changed';
  if (confirmed.route === 'chat' && fresh.route === 'chat' && confirmed.sessionId !== fresh.sessionId)
    return 'session_changed';
  return null;
}

export function buildPreview(state: StateDocument, target: SendTarget): SendPreview | null {
  const agent = state.agents.find((a) => a.id === target.agentId);
  if (!agent || agent.worktreeId !== target.worktreeId) return null;
  const worktree = state.worktrees.find((w) => w.id === target.worktreeId);
  if (!worktree) return null;
  if (
    target.route === 'terminal' &&
    (agent.terminalHandle !== target.handle || agent.agentType.value !== target.agentType)
  )
    return null;
  const repo = state.repos.find((r) => r.id === worktree.repoId);
  return {
    repoName: repo?.displayName.value ?? null,
    worktreePath: worktree.path.value,
    branch: worktree.branch.value,
    agentType: target.agentType,
    title: agent.title.value,
    state: agent.state.value,
    route: target.route,
    sessionShortId: (target.route === 'terminal' ? target.providerSessionId : target.sessionId).slice(0, 8),
  };
}
