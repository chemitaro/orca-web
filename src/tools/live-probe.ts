// 実機の確かめ（読むだけ）の収集と集計。収集は ReadOnlyOrcaCli と ReadOnlyRpc だけを使い、
// 受け取った応答は、その場で、結ぶのに要る識別子と、項目の有無だけに減らす。本文、プロンプト、題名は持たない。
// 集計（summarizeLive）は件数と値の種類だけを返し、ID やパスを出さない。
import type { ReadOnlyOrcaCli } from '../orca/orca-cli.ts';
import type { RpcTransport } from '../orca/rpc.ts';

const LIMIT = '1000';

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const records = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRecord) : []);

export interface ObservedAgentStatus {
  agentType: string | null;
  state: string | null;
  model: string | null;
  paneKey: string | null;
  isWorker: boolean;
  provider: { key: string | null; id: string | null; transcriptPath: string | null; effort: string | null } | null;
}

export interface ObservedTab {
  type: string;
  id: string | null;
  parentTabId: string | null;
  leafId: string | null;
  status: string | null;
  hasPty: boolean;
  terminal: string | null;
  launchAgent: string | null;
  agent: ObservedAgentStatus | null;
}

export interface ObservedTranscript {
  agent: string;
  ok: boolean;
  code: string | null;
  messageCount: number;
  hasMore: boolean | null;
}

export interface LiveObservation {
  worktreeIds: string[];
  truncated: { worktreeList: boolean; worktreePs: boolean; terminalList: boolean };
  psAgents: {
    worktreeId: string;
    paneKey: string | null;
    agentType: string | null;
    state: string | null;
    hasLivePty: boolean | null;
  }[];
  terminals: { handle: string | null; worktreeId: string | null; tabId: string | null; leafId: string | null }[];
  tabs: { worktreeId: string; ok: boolean; code: string | null; tabs: ObservedTab[] }[];
  transcripts: ObservedTranscript[];
  failures: string[];
}

function observeAgentStatus(raw: unknown): ObservedAgentStatus | null {
  if (!isRecord(raw)) return null;
  const p = isRecord(raw.providerSession) ? raw.providerSession : null;
  return {
    agentType: str(raw.agentType),
    state: str(raw.state),
    model: str(raw.model),
    paneKey: str(raw.paneKey),
    isWorker: isRecord(raw.orchestration),
    provider: p
      ? { key: str(p.key), id: str(p.id), transcriptPath: str(p.transcriptPath), effort: str(p.effort) }
      : null,
  };
}

function observeTab(raw: Rec): ObservedTab {
  return {
    type: str(raw.type) ?? 'unknown',
    id: str(raw.id),
    parentTabId: str(raw.parentTabId),
    leafId: str(raw.leafId),
    status: str(raw.status),
    hasPty: str(raw.ptyId) !== null,
    terminal: str(raw.terminal),
    launchAgent: str(raw.launchAgent),
    agent: observeAgentStatus(raw.agentStatus),
  };
}

export interface CollectDeps {
  cli: ReadOnlyOrcaCli;
  /** 読む RPC だけを送れる口（ReadOnlyRpc）。 */
  rpc: RpcTransport;
  /** 会話の読み取りに使う口。録画に会話を残さないため、録画するときは rpc と分ける。既定は rpc。 */
  transcriptRpc?: RpcTransport;
}

/** 読むだけで集める。会話は provider のセッションごとに1件だけ読み、件数だけを残す。 */
export async function collectLive(deps: CollectDeps): Promise<LiveObservation> {
  const failures: string[] = [];
  const [list, ps, terms] = await Promise.all([
    deps.cli.json<unknown>(['worktree', 'list', '--limit', LIMIT]),
    deps.cli.json<unknown>(['worktree', 'ps', '--limit', LIMIT]),
    deps.cli.json<unknown>(['terminal', 'list', '--limit', LIMIT]),
  ]);
  const result = (o: typeof list, name: string): Rec => {
    if (o.ok && isRecord(o.result)) return o.result;
    failures.push(`${name}: ${o.ok ? 'unknown shape' : o.kind}`);
    return {};
  };
  const listR = result(list, 'worktree list');
  const psR = result(ps, 'worktree ps');
  const termR = result(terms, 'terminal list');

  const worktreeIds = records(listR.worktrees)
    .filter((w) => w.isArchived !== true)
    .map((w) => str(w.id))
    .filter((id): id is string => id !== null);
  const psAgents = records(psR.worktrees).flatMap((w) =>
    records(w.agents).map((a) => ({
      worktreeId: str(w.worktreeId) ?? '',
      paneKey: str(a.paneKey),
      agentType: str(a.agentType),
      state: str(a.state),
      hasLivePty: typeof a.hasLivePty === 'boolean' ? a.hasLivePty : null,
    })),
  );
  const terminals = records(termR.terminals).map((t) => ({
    handle: str(t.handle),
    worktreeId: str(t.worktreeId),
    tabId: str(t.tabId),
    leafId: str(t.leafId),
  }));

  const tabs: LiveObservation['tabs'] = [];
  for (const worktreeId of worktreeIds) {
    const outcome = await deps.rpc.call<unknown>('session.tabs.list', { worktree: `id:${worktreeId}` });
    if (outcome.ok && isRecord(outcome.result)) {
      tabs.push({ worktreeId, ok: true, code: null, tabs: records(outcome.result.tabs).map(observeTab) });
    } else {
      tabs.push({
        worktreeId,
        ok: false,
        code: outcome.ok ? 'unknown-shape' : (outcome.code ?? outcome.kind),
        tabs: [],
      });
    }
  }

  const transcripts: ObservedTranscript[] = [];
  const seen = new Set<string>();
  for (const tab of tabs.flatMap((t) => t.tabs)) {
    const provider = tab.agent?.provider;
    const agent = tab.agent?.agentType ?? tab.launchAgent ?? null;
    if (!provider?.id || !agent || seen.has(`${agent}:${provider.id}`)) continue;
    seen.add(`${agent}:${provider.id}`);
    const params: Rec = { agent, sessionId: provider.id };
    if (provider.transcriptPath) params.transcriptPath = provider.transcriptPath;
    params.limit = 1;
    const outcome = await (deps.transcriptRpc ?? deps.rpc).call<unknown>('nativeChat.readSession', params);
    if (outcome.ok) {
      const r = isRecord(outcome.result) ? outcome.result : {};
      transcripts.push({
        agent,
        ok: true,
        code: null,
        messageCount: Array.isArray(r.messages) ? r.messages.length : 0,
        hasMore: typeof r.hasMore === 'boolean' ? r.hasMore : null,
      });
    } else {
      transcripts.push({ agent, ok: false, code: outcome.code ?? outcome.kind, messageCount: 0, hasMore: null });
    }
  }

  return {
    worktreeIds,
    truncated: {
      worktreeList: listR.truncated === true,
      worktreePs: psR.truncated === true,
      terminalList: termR.truncated === true,
    },
    psAgents,
    terminals,
    tabs,
    transcripts,
    failures,
  };
}

const bump = (map: Record<string, number>, key: string): void => {
  map[key] = (map[key] ?? 0) + 1;
};

/** モデルの値の形（数字を N に）。形が知らない文字を含めば other。 */
export function modelShape(model: string): string {
  const shape = model.replace(/[0-9]+/g, 'N');
  return /^[A-Za-z0-9._[\]-]{1,40}$/.test(shape) ? shape : 'other';
}

const effortValue = (effort: string): string => (/^[a-z]{1,12}$/.test(effort) ? effort : 'other');

type Tally = { unique: number; none: number; multiple: number };
const tally = (counts: number[]): Tally => ({
  unique: counts.filter((n) => n === 1).length,
  none: counts.filter((n) => n === 0).length,
  multiple: counts.filter((n) => n > 1).length,
});

export interface ModelEffortSummary {
  agentTabs: number;
  workers: number;
  withModel: number;
  modelShapes: Record<string, number>;
  withProviderSession: number;
  withEffort: number;
  effortValues: Record<string, number>;
}

export function summarizeLive(o: LiveObservation) {
  const read = o.tabs.filter((t) => t.ok);
  const allTabs = read.flatMap((t) => t.tabs.map((tab) => ({ worktreeId: t.worktreeId, tab })));
  const terminalTabs = allTabs.filter((t) => t.tab.type === 'terminal');
  const tabsByType: Record<string, number> = {};
  for (const { tab } of allTabs) bump(tabsByType, tab.type);

  // 1. モデルと推論
  const modelEffort: Record<string, ModelEffortSummary> = {};
  for (const { tab } of terminalTabs) {
    const a = tab.agent;
    if (!a) continue;
    const name = a.agentType ?? tab.launchAgent ?? 'unknown';
    const m = modelEffort[name] ?? {
      agentTabs: 0,
      workers: 0,
      withModel: 0,
      modelShapes: {},
      withProviderSession: 0,
      withEffort: 0,
      effortValues: {},
    };
    modelEffort[name] = m;
    m.agentTabs += 1;
    if (a.isWorker) m.workers += 1;
    if (a.model) {
      m.withModel += 1;
      bump(m.modelShapes, modelShape(a.model));
    }
    if (a.provider) m.withProviderSession += 1;
    if (a.provider?.effort) {
      m.withEffort += 1;
      bump(m.effortValues, effortValue(a.provider.effort));
    }
  }

  // 2. スリープの見え方
  const tabCombos: Record<string, number> = {};
  for (const { tab } of terminalTabs) {
    bump(
      tabCombos,
      `status=${tab.status ?? 'none'} pty=${tab.hasPty ? 'yes' : 'no'} agentStatus=${tab.agent?.state ?? 'none'} launchAgent=${tab.launchAgent ? 'yes' : 'no'}`,
    );
  }
  const psAgentsWithoutLivePty: Record<string, number> = {};
  for (const a of o.psAgents) if (a.hasLivePty === false) bump(psAgentsWithoutLivePty, a.state ?? 'none');

  // 3. worktree → タブ → leaf → 端末 → provider のセッション
  const toTerminal = terminalTabs.map(
    ({ worktreeId, tab }) =>
      o.terminals.filter((t) => t.worktreeId === worktreeId && t.tabId === tab.parentTabId && t.leafId === tab.leafId)
        .length,
  );
  let handleAgrees = 0;
  for (const { worktreeId, tab } of terminalTabs) {
    const match = o.terminals.filter(
      (t) => t.worktreeId === worktreeId && t.tabId === tab.parentTabId && t.leafId === tab.leafId,
    );
    if (match.length === 1 && tab.terminal !== null && match[0]?.handle === tab.terminal) handleAgrees += 1;
  }
  const toPs = terminalTabs.map(
    ({ worktreeId, tab }) =>
      o.psAgents.filter((a) => a.worktreeId === worktreeId && a.paneKey === `${tab.parentTabId}:${tab.leafId}`).length,
  );
  // 端末の handle からも結び、識別子のどれが一致するかを数える（結び方の取り違えを見つけるため）。
  const readyTabs = terminalTabs.filter(({ tab }) => tab.terminal !== null);
  const byHandle: Record<string, number> = {};
  for (const { worktreeId, tab } of readyTabs) {
    const hits = o.terminals.filter((t) => t.handle === tab.terminal);
    const t = hits[0];
    if (hits.length !== 1 || !t) {
      bump(byHandle, hits.length === 0 ? 'handle-not-listed' : 'handle-listed-twice');
      continue;
    }
    const tabKey = t.tabId === tab.parentTabId ? 'tabId=parentTabId' : t.tabId === tab.id ? 'tabId=id' : 'tabId=other';
    bump(
      byHandle,
      `${tabKey} leaf=${t.leafId === tab.leafId ? 'same' : 'other'} worktree=${t.worktreeId === worktreeId ? 'same' : 'other'}`,
    );
  }
  const psMatched = o.psAgents.filter((a) =>
    terminalTabs.some(
      ({ worktreeId, tab }) => a.worktreeId === worktreeId && a.paneKey === `${tab.parentTabId}:${tab.leafId}`,
    ),
  ).length;
  const agentStatusPaneKeyAgrees = terminalTabs.filter(
    ({ tab }) => tab.agent?.paneKey && tab.agent.paneKey === `${tab.parentTabId}:${tab.leafId}`,
  ).length;
  const providerIds = terminalTabs.map(({ tab }) => tab.agent?.provider?.id).filter((id): id is string => !!id);
  const idCounts = new Map<string, number>();
  for (const id of providerIds) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);

  // 4. 会話の読み取り
  const failedByCode: Record<string, number> = {};
  const okByAgent: Record<string, number> = {};
  for (const t of o.transcripts) {
    if (t.ok) bump(okByAgent, t.agent);
    else bump(failedByCode, t.code ?? 'unknown');
  }

  return {
    counts: {
      worktrees: o.worktreeIds.length,
      tabsRead: read.length,
      tabsFailed: o.tabs.length - read.length,
      terminalTabs: terminalTabs.length,
      tabsByType,
    },
    truncated: o.truncated,
    failures: o.failures,
    modelEffort,
    sleep: { tabCombos, psAgentsWithoutLivePty },
    linking: {
      tabToTerminal: tally(toTerminal),
      handleAgrees,
      readyTabs: readyTabs.length,
      byHandle,
      tabToPsAgent: tally(toPs),
      terminals: o.terminals.length,
      terminalsWithPlaceholderTabId: o.terminals.filter((t) => t.tabId?.startsWith('pty:')).length,
      psAgents: o.psAgents.length,
      psAgentsMatchedToTab: psMatched,
      agentStatusPaneKeyAgrees,
      providerSessions: {
        present: providerIds.length,
        distinct: idCounts.size,
        shared: [...idCounts.values()].filter((n) => n > 1).length,
      },
    },
    transcript: {
      attempted: o.transcripts.length,
      ok: o.transcripts.filter((t) => t.ok).length,
      withMessages: o.transcripts.filter((t) => t.ok && t.messageCount > 0).length,
      okByAgent,
      failedByCode,
    },
  };
}
