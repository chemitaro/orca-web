// 「Orca で開く」のタブの選び方。Orca に触らない純な関数。`session.tabs.list` の結果を確かめて型にし、1つの先を選ぶ。
// 形は stablyai/orca v1.4.251 の src/shared/runtime-mobile-session-tab-contracts.ts に合わせる（使う項目だけを読む）。

export interface TerminalTab {
  type: 'terminal';
  id: string;
  parentTabId: string;
  leafId: string;
  isActive: boolean;
  /** `ready` なら端末が動いている。`pending-handle` はスリープ中か復元待ち。 */
  status: string | null;
  /** 動いている端末の handle。 */
  handle: string | null;
  /** agentStatus を持てば、その `updatedAt`（数）。持たなければ null（エージェントと確かめられない）。 */
  agentUpdatedAt: number | null;
  hasAgentStatus: boolean;
  /** `parentLayout.activeLeafId`。 */
  activeLeafId: string | null;
}

export interface OtherTab {
  type: string;
  id: string;
  isActive: boolean;
}

export type Tab = TerminalTab | OtherTab;

export interface TabsSnapshot {
  worktree: string;
  activeTabId: string | null;
  tabs: Tab[];
}

export type OpenReason = 'requested-agent' | 'last-agent' | 'last-tab' | 'worktree-only';

export type OpenTarget =
  | { route: 'terminal-switch'; handle: string; tabId: string; paneKey: string; reason: OpenReason }
  | { route: 'tab-activate'; tabId: string; leafId?: string; reason: OpenReason }
  | { route: 'worktree-activate'; reason: 'worktree-only'; mayCreateInitialTerminal: boolean };

export interface Choice {
  target: OpenTarget;
  /** `agent` を渡したときだけ。最新の一覧にその paneKey の端末のタブがあったか。 */
  requestedAgentFound?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export const isTerminal = (tab: Tab): tab is TerminalTab => tab.type === 'terminal';

export const paneKeyOf = (tab: TerminalTab): string => `${tab.parentTabId}:${tab.leafId}`;

/** `session.tabs.list` の結果を確かめて型にする。worktree が渡した ID と違う、識別子が欠ける、未知の形なら null。 */
export function parseTabsSnapshot(result: unknown, worktreeId: string): TabsSnapshot | null {
  if (!isRecord(result) || result.worktree !== worktreeId || !Array.isArray(result.tabs)) return null;
  const tabs: Tab[] = [];
  for (const raw of result.tabs) {
    if (!isRecord(raw) || !isText(raw.id) || !isText(raw.type)) return null;
    const isActive = raw.isActive === true;
    if (raw.type !== 'terminal') {
      tabs.push({ type: raw.type, id: raw.id, isActive });
      continue;
    }
    if (!isText(raw.parentTabId) || !isText(raw.leafId)) return null;
    const agent = isRecord(raw.agentStatus) ? raw.agentStatus : null;
    const layout = isRecord(raw.parentLayout) ? raw.parentLayout : null;
    tabs.push({
      type: 'terminal',
      id: raw.id,
      parentTabId: raw.parentTabId,
      leafId: raw.leafId,
      isActive,
      status: typeof raw.status === 'string' ? raw.status : null,
      handle: isText(raw.terminal) ? raw.terminal : null,
      hasAgentStatus: agent !== null,
      agentUpdatedAt: agent && typeof agent.updatedAt === 'number' ? agent.updatedAt : null,
      activeLeafId: layout && isText(layout.activeLeafId) ? layout.activeLeafId : null,
    });
  }
  const activeTabId = isText(result.activeTabId) ? result.activeTabId : null;
  return { worktree: worktreeId, activeTabId, tabs };
}

function routeFor(tab: Tab, reason: OpenReason): OpenTarget {
  if (isTerminal(tab)) {
    if (tab.status === 'ready' && tab.handle !== null) {
      return { route: 'terminal-switch', handle: tab.handle, tabId: tab.id, paneKey: paneKeyOf(tab), reason };
    }
    return { route: 'tab-activate', tabId: tab.id, leafId: tab.leafId, reason };
  }
  return { route: 'tab-activate', tabId: tab.id, reason };
}

/** 最後に動いたエージェント。updatedAt が大きいもの、同じなら isActive、それでも同じなら一覧の順の先。 */
function lastAgent(tabs: readonly Tab[]): TerminalTab | null {
  let best: TerminalTab | null = null;
  for (const tab of tabs) {
    if (!isTerminal(tab) || !tab.hasAgentStatus) continue;
    if (best === null) {
      best = tab;
      continue;
    }
    const a = tab.agentUpdatedAt ?? Number.NEGATIVE_INFINITY;
    const b = best.agentUpdatedAt ?? Number.NEGATIVE_INFINITY;
    if (a > b || (a === b && tab.isActive && !best.isActive)) best = tab;
  }
  return best;
}

/** 最後に見ていたタブ。isActive のもの（同じ親の leaf が複数なら activeLeafId に当たるもの）、なければ activeTabId に当たるもの。 */
function lastViewed(snapshot: TabsSnapshot): Tab | null {
  const active = snapshot.tabs.filter((t) => t.isActive);
  const first = active[0];
  if (first) {
    if (isTerminal(first)) {
      const siblings = active.filter((t): t is TerminalTab => isTerminal(t) && t.parentTabId === first.parentTabId);
      return siblings.find((t) => t.activeLeafId === t.leafId) ?? first;
    }
    return first;
  }
  const id = snapshot.activeTabId;
  if (id === null) return null;
  return snapshot.tabs.find((t) => t.id === id || (isTerminal(t) && t.parentTabId === id)) ?? null;
}

/** R-01 の順で1つを選ぶ。 */
export function chooseTarget(snapshot: TabsSnapshot, agent?: string): Choice {
  let requestedAgentFound: boolean | undefined;
  if (agent !== undefined) {
    const tab = snapshot.tabs.find((t): t is TerminalTab => isTerminal(t) && paneKeyOf(t) === agent);
    requestedAgentFound = tab !== undefined;
    if (tab) return { target: routeFor(tab, 'requested-agent'), requestedAgentFound };
  }
  const withFound = (target: OpenTarget): Choice =>
    requestedAgentFound === undefined ? { target } : { target, requestedAgentFound };
  const agentTab = lastAgent(snapshot.tabs);
  if (agentTab) return withFound(routeFor(agentTab, 'last-agent'));
  const viewed = lastViewed(snapshot);
  if (viewed) return withFound(routeFor(viewed, 'last-tab'));
  return withFound({
    route: 'worktree-activate',
    reason: 'worktree-only',
    mayCreateInitialTerminal: snapshot.tabs.length === 0,
  });
}
