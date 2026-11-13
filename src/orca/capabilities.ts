// Orca の機能の確かめ。機能ごとに、使えるか、満たした確かめ、欠けた確かめ、呼ぶときまで確かめられないことを返す。
// 確かめのために書き込みの RPC やコマンドは呼ばない（ReadOnlyOrcaCli と ReadOnlyRpc を受ける）。
import type { ReadOnlyOrcaCli } from './orca-cli.ts';
import type { RpcTransport } from './rpc.ts';
import type { LocateOutcome } from './runtime.ts';

export type FeatureName = 'readState' | 'readTabs' | 'openExistingTab' | 'readTranscript' | 'sendTerminal' | 'sendChat';

export interface FeatureReport {
  available: boolean;
  satisfied: string[];
  missing: string[];
  /** 呼ぶときまで確かめられないこと（書き込みの RPC の有無など）。呼ぶ側が method_not_found を扱う。 */
  deferred: string[];
}

export type ConnectionState = { state: 'connected' } | { state: 'unreachable'; reason: string };

export interface CapabilityReport {
  checkedAt: string;
  cliVersion: string | null;
  appVersion: string | null;
  runtimeId: string | null;
  runtimeIdConsistent: boolean;
  connection: ConnectionState;
  features: Record<FeatureName, FeatureReport>;
}

export interface ProbeDeps {
  cli: ReadOnlyOrcaCli;
  /** 読む RPC だけを送れる口（ReadOnlyRpc）を渡す。 */
  rpc: RpcTransport;
  locator: { locate(): Promise<LocateOutcome> };
  now?: () => Date;
}

/** readState に要るコマンド。 */
export const STATE_COMMANDS: readonly string[] = [
  'repo list',
  'worktree list',
  'worktree ps',
  'terminal list',
  'orchestration run-list',
  'orchestration task-list',
  'orchestration worker-list',
  'orchestration worker-show',
];

const CAP_INVENTORY = 'session-tabs.authoritative-inventory.v1';
const CAP_PROMPT_DELIVERY = 'terminal.prompt-delivery.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** `session.tabs.listAll` の結果が、タブを結ぶのに要る識別子を持つか。 */
export function isTabsInventory(result: unknown): boolean {
  if (!isRecord(result) || !Array.isArray(result.snapshots)) return false;
  return result.snapshots.every(
    (snap) =>
      isRecord(snap) &&
      isText(snap.worktree) &&
      Array.isArray(snap.tabs) &&
      snap.tabs.every(
        (tab) =>
          isRecord(tab) &&
          isText(tab.id) &&
          isText(tab.type) &&
          (tab.type !== 'terminal' || (isText(tab.parentTabId) && isText(tab.leafId))),
      ),
  );
}

class Checks {
  readonly satisfied: string[] = [];
  readonly missing: string[] = [];
  readonly deferred: string[] = [];

  need(name: string, ok: boolean): this {
    (ok ? this.satisfied : this.missing).push(name);
    return this;
  }

  defer(...names: string[]): this {
    this.deferred.push(...names);
    return this;
  }

  report(): FeatureReport {
    return {
      available: this.missing.length === 0,
      satisfied: this.satisfied,
      missing: this.missing,
      deferred: this.deferred,
    };
  }
}

interface CommandIndex {
  ok: boolean;
  flags: Map<string, Set<string>>;
}

function indexCommands(doc: unknown): CommandIndex {
  const flags = new Map<string, Set<string>>();
  if (!isRecord(doc) || !Array.isArray(doc.commands)) return { ok: false, flags };
  for (const c of doc.commands) {
    if (!isRecord(c) || !Array.isArray(c.path)) continue;
    const name = c.path.filter((p): p is string => typeof p === 'string').join(' ');
    const f = Array.isArray(c.flags) ? c.flags.filter((x): x is string => typeof x === 'string') : [];
    flags.set(name, new Set(f));
  }
  return { ok: true, flags };
}

export async function probeCapabilities(deps: ProbeDeps): Promise<CapabilityReport> {
  const now = deps.now ?? (() => new Date());
  const [version, status, context, located] = await Promise.all([
    deps.cli.version(),
    deps.cli.json<unknown>(['status']),
    deps.cli.document<unknown>(['agent-context']),
    deps.locator.locate(),
  ]);

  const runtime =
    status.ok && isRecord(status.result) && isRecord(status.result.runtime) ? status.result.runtime : null;
  const capabilities = new Set(
    runtime && Array.isArray(runtime.capabilities)
      ? runtime.capabilities.filter((c): c is string => typeof c === 'string')
      : [],
  );
  const statusRuntimeId = runtime && typeof runtime.runtimeId === 'string' ? runtime.runtimeId : null;
  const appVersion = runtime && typeof runtime.appVersion === 'string' ? runtime.appVersion : null;
  let connection: ConnectionState;
  if (!status.ok) {
    connection = { state: 'unreachable', reason: `orca status: ${status.kind}${status.code ? ` ${status.code}` : ''}` };
  } else if (runtime?.reachable !== true || runtime.state !== 'ready') {
    const state = runtime && typeof runtime.state === 'string' ? runtime.state : 'unknown';
    connection = { state: 'unreachable', reason: `runtime is not ready (${state})` };
  } else {
    connection = { state: 'connected' };
  }
  const reachable = connection.state === 'connected';

  const commands = context.ok ? indexCommands(context.result) : { ok: false, flags: new Map<string, Set<string>>() };
  const needCommand = (checks: Checks, name: string, flag?: string): void => {
    if (!commands.ok) return;
    const flags = commands.flags.get(name);
    checks.need(`command:${name}`, flags !== undefined);
    if (flags && flag) checks.need(`flag:${name} --${flag}`, flags.has(flag));
  };
  const base = (): Checks => new Checks().need('runtime:reachable', reachable);
  const withCommands = (checks: Checks): Checks => (commands.ok ? checks : checks.need('cli:agent-context', false));

  // 読む RPC は、runtime に届くときだけ送る。
  let tabsRpc = false;
  let tabsShape = false;
  let rpcRuntimeId: string | null = null;
  let transcriptRpc = false;
  if (reachable) {
    const [tabs, transcript] = await Promise.all([
      deps.rpc.call<unknown>('session.tabs.listAll', null),
      deps.rpc.call<unknown>('nativeChat.readSession', {}),
    ]);
    if (tabs.ok) {
      tabsRpc = true;
      tabsShape = isTabsInventory(tabs.result);
      rpcRuntimeId = tabs.runtimeId;
    }
    // 空の引数で呼び、引数の誤り（invalid_argument）なら口がある。method_not_found なら無い。
    transcriptRpc = transcript.ok || (transcript.kind === 'orca-error' && transcript.code === 'invalid_argument');
  }

  const fileRuntimeId = located.ok ? located.endpoint.runtimeId : null;
  const runtimeIdConsistent =
    reachable &&
    statusRuntimeId !== null &&
    fileRuntimeId === statusRuntimeId &&
    (rpcRuntimeId === null || rpcRuntimeId === statusRuntimeId);

  const readState = withCommands(base());
  for (const name of STATE_COMMANDS) needCommand(readState, name);

  const readTabs = base();
  if (reachable) {
    readTabs.need('rpc:session.tabs.listAll', tabsRpc);
    if (tabsRpc) readTabs.need('shape:session.tabs.listAll', tabsShape);
  }
  const readTabsReport = readTabs.report();

  const openExistingTab = withCommands(base());
  if (reachable) openExistingTab.need('feature:readTabs', readTabsReport.available);
  needCommand(openExistingTab, 'terminal switch', 'terminal');
  openExistingTab
    .need(`capability:${CAP_INVENTORY}`, capabilities.has(CAP_INVENTORY))
    .need('runtime-id:consistent', runtimeIdConsistent)
    .defer('rpc:session.tabs.activate', 'rpc:worktree.activate');

  const readTranscript = base();
  if (reachable) readTranscript.need('rpc:nativeChat.readSession', transcriptRpc);

  const sendTerminal = base()
    .need(`capability:${CAP_PROMPT_DELIVERY}`, capabilities.has(CAP_PROMPT_DELIVERY))
    .need('runtime-id:consistent', runtimeIdConsistent)
    .need('feature:readTabs', readTabsReport.available)
    .defer(
      'rpc:terminal.send',
      'rpc:terminal.agentStatus',
      'rpc:terminal.inspectProcess',
      'rpc:orchestration.requestShow',
    );
  const sendChat = base()
    .need('capability:agent-session.structured.v1', capabilities.has('agent-session.structured.v1'))
    .need('capability:agent-session.send-recorded.v1', capabilities.has('agent-session.send-recorded.v1'))
    .need('runtime-id:consistent', runtimeIdConsistent)
    .need('feature:readTabs', readTabsReport.available)
    .need('feature:readTranscript', readTranscript.report().available)
    .defer('rpc:agentSession.send', 'rpc:agentSession.sendRecorded');

  return {
    checkedAt: now().toISOString(),
    cliVersion: version.ok ? version.result : null,
    appVersion,
    runtimeId: statusRuntimeId ?? fileRuntimeId,
    runtimeIdConsistent,
    connection,
    features: {
      readState: readState.report(),
      readTabs: readTabsReport,
      openExistingTab: openExistingTab.report(),
      readTranscript: readTranscript.report(),
      sendTerminal: sendTerminal.report(),
      sendChat: sendChat.report(),
    },
  };
}

/**
 * runtime の ID ごとに確かめの結果を持つ。ID が変わったら（Orca の再起動や接続先の変化）捨てて確かめ直す。
 * 接続できなかった結果は持たず、次の get で確かめ直す。
 */
export class CapabilityCache {
  readonly #probe: () => Promise<CapabilityReport>;
  readonly #currentRuntimeId: () => Promise<string | null>;
  #cached: CapabilityReport | null = null;

  constructor(probe: () => Promise<CapabilityReport>, currentRuntimeId: () => Promise<string | null>) {
    this.#probe = probe;
    this.#currentRuntimeId = currentRuntimeId;
  }

  async get(): Promise<CapabilityReport> {
    const current = await this.#currentRuntimeId();
    const cached = this.#cached;
    if (cached && current !== null && cached.runtimeId === current) return cached;
    const report = await this.#probe();
    this.#cached = report.connection.state === 'connected' && report.runtimeId !== null ? report : null;
    return report;
  }
}
