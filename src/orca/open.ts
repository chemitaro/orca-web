// 「Orca で開く」の処理。worktree を最新の一覧で解決し、既存のタブを1つ選び、門を通して1回だけ送る。
// 送った後の時間切れや結果不明では、別のタブへ切り替えずに unconfirmed を返す（2回目の書き込みを送らない）。
import type { CapabilityReport } from './capabilities.ts';
import type { OpenOrcaCli } from './open-gates.ts';
import { chooseTarget, type OpenReason, type OpenTarget, parseTabsSnapshot } from './open-target.ts';
import { type CliOutcome, clip } from './orca-cli.ts';
import type { RpcOutcome, RpcTransport } from './rpc.ts';

export interface OpenRequest {
  /** Orca の worktree の ID か、worktree のパス（完全一致）。 */
  worktree: string;
  /** エージェントの paneKey（`<parentTabId>:<leafId>`）。 */
  agent?: string;
}

export type OpenRoute = OpenTarget['route'];

export type OpenErrorCode =
  | 'busy'
  | 'unavailable'
  | 'worktree_not_found'
  | 'unknown_shape'
  | 'runtime_changed'
  | 'unconfirmed'
  | 'unsupported'
  | 'target_gone'
  | 'orca_error';

export interface OpenSuccess {
  ok: true;
  status: 'opened';
  route: OpenRoute;
  reason: OpenReason;
  worktreeId: string;
  requestedAgentFound?: boolean;
  /** worktree だけを選んだとき、Orca が最初の端末を作りうるか（タブのない worktree）。 */
  mayCreateInitialTerminal?: boolean;
}

export interface OpenFailure {
  ok: false;
  error: OpenErrorCode;
  message: string;
  /** unavailable のとき、欠けた確かめ。 */
  missing?: string[];
  /** 書き込みを送った後の失敗なら、その経路。 */
  route?: OpenRoute;
}

export type OpenOutcome = OpenSuccess | OpenFailure;

export interface OpenDeps {
  /** 読むコマンドと `terminal switch` だけを呼べる CLI（OpenOrcaCli）。 */
  cli: Pick<OpenOrcaCli, 'json'>;
  /** 読む RPC と `navigation: "host"` の activate だけを送れる口（OpenRpc）。 */
  rpc: RpcTransport;
  /** 機能の確かめ（CapabilityCache.get）。 */
  capabilities: () => Promise<CapabilityReport>;
  /** 書き込みの時間切れ。 */
  writeTimeoutMs?: number;
}

const DEFAULT_WRITE_TIMEOUT_MS = 10_000;

/** 対象のタブや端末が消えたことを示す、Orca の誤りの code か message。 */
const GONE = new Set([
  'tab_not_found',
  'terminal_not_found',
  'terminal_exited',
  'worktree_not_found',
  'selector_not_found',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const fail = (error: OpenErrorCode, message: string, extra: Partial<OpenFailure> = {}): OpenFailure => ({
  ok: false,
  error,
  message: clip(message),
  ...extra,
});

interface WorktreeRow {
  id: string;
  path: string;
}

type Resolved = { ok: true; id: string } | OpenFailure;

export class OpenService {
  readonly #deps: OpenDeps;
  #busy = false;

  constructor(deps: OpenDeps) {
    this.#deps = deps;
  }

  /** 1つの開く要求。処理中に来た要求は busy で断る。 */
  async open(request: OpenRequest): Promise<OpenOutcome> {
    if (this.#busy) return fail('busy', 'another open request is in progress');
    this.#busy = true;
    try {
      return await this.#open(request);
    } finally {
      this.#busy = false;
    }
  }

  async #open(request: OpenRequest): Promise<OpenOutcome> {
    const report = await this.#deps.capabilities();
    const feature = report.features.openExistingTab;
    if (!feature.available) {
      return fail('unavailable', 'openExistingTab is not available', { missing: [...feature.missing] });
    }
    const resolved = await this.#resolveWorktree(request.worktree);
    if (!resolved.ok) return resolved;
    const worktreeId = resolved.id;

    const tabs = await this.#deps.rpc.call<unknown>('session.tabs.list', { worktree: `id:${worktreeId}` });
    if (!tabs.ok) return fail('orca_error', `session.tabs.list: ${tabs.kind} ${tabs.code ?? ''} ${tabs.message}`);
    if (tabs.runtimeId !== null && report.runtimeId !== null && tabs.runtimeId !== report.runtimeId) {
      return fail('runtime_changed', 'the Orca runtime changed since the capability check');
    }
    const snapshot = parseTabsSnapshot(tabs.result, worktreeId);
    if (!snapshot) return fail('unknown_shape', 'session.tabs.list has an unknown shape');

    const choice = request.agent === undefined ? chooseTarget(snapshot) : chooseTarget(snapshot, request.agent);
    const target = choice.target;
    const sent = await this.#send(worktreeId, target);
    if (!sent.ok) return sent;
    const success: OpenSuccess = { ok: true, status: 'opened', route: target.route, reason: target.reason, worktreeId };
    if (choice.requestedAgentFound !== undefined) success.requestedAgentFound = choice.requestedAgentFound;
    if (target.route === 'worktree-activate') success.mayCreateInitialTerminal = target.mayCreateInitialTerminal;
    return success;
  }

  async #resolveWorktree(selector: string): Promise<Resolved> {
    let listed = await this.#deps.cli.json<unknown>(['worktree', 'list']);
    let rows = parseWorktreeList(listed);
    if (rows?.truncated && rows.totalCount !== null && rows.totalCount > rows.rows.length) {
      listed = await this.#deps.cli.json<unknown>(['worktree', 'list', '--limit', String(rows.totalCount)]);
      rows = parseWorktreeList(listed);
    }
    if (!listed.ok) return fail('orca_error', `worktree list: ${listed.kind} ${listed.code ?? ''} ${listed.message}`);
    if (!rows) return fail('unknown_shape', 'worktree list has an unknown shape');
    if (rows.truncated) return fail('unknown_shape', 'worktree list is truncated');
    const matches = rows.rows.filter((r) => r.id === selector || r.path === selector);
    const only = matches[0];
    if (!only || matches.length > 1) return fail('worktree_not_found', 'the worktree is not one Orca worktree');
    return { ok: true, id: only.id };
  }

  async #send(worktreeId: string, target: OpenTarget): Promise<{ ok: true } | OpenFailure> {
    const timeoutMs = this.#deps.writeTimeoutMs ?? DEFAULT_WRITE_TIMEOUT_MS;
    const route = target.route;
    if (route === 'terminal-switch') {
      const outcome = await this.#deps.cli.json<unknown>(['terminal', 'switch', '--terminal', target.handle]);
      return classifyCli(outcome, route);
    }
    if (route === 'tab-activate') {
      const params: Record<string, unknown> = {
        worktree: `id:${worktreeId}`,
        tabId: target.tabId,
        navigation: 'host',
        intent: 'user',
      };
      if (target.leafId !== undefined) params.leafId = target.leafId;
      return classifyRpc(await this.#deps.rpc.call<unknown>('session.tabs.activate', params, { timeoutMs }), route);
    }
    const outcome = await this.#deps.rpc.call<unknown>(
      'worktree.activate',
      { worktree: `id:${worktreeId}`, navigation: 'host' },
      { timeoutMs },
    );
    return classifyRpc(outcome, route);
  }
}

interface WorktreeList {
  rows: WorktreeRow[];
  truncated: boolean;
  totalCount: number | null;
}

function parseWorktreeList(outcome: CliOutcome<unknown>): WorktreeList | null {
  if (!outcome.ok || !isRecord(outcome.result) || !Array.isArray(outcome.result.worktrees)) return null;
  const rows: WorktreeRow[] = [];
  for (const w of outcome.result.worktrees) {
    if (!isRecord(w) || typeof w.id !== 'string' || typeof w.path !== 'string' || !w.id || !w.path) return null;
    rows.push({ id: w.id, path: w.path });
  }
  const { truncated, totalCount } = outcome.result;
  return {
    rows,
    truncated: truncated === true,
    totalCount: typeof totalCount === 'number' ? totalCount : null,
  };
}

function isGone(code: string | undefined, message: string): boolean {
  return (code !== undefined && GONE.has(code)) || GONE.has(message.trim());
}

function classifyRpc(outcome: RpcOutcome<unknown>, route: OpenRoute): { ok: true } | OpenFailure {
  if (outcome.ok) return { ok: true };
  switch (outcome.kind) {
    case 'timeout':
    case 'disconnected':
    case 'invalid-frame':
    case 'mismatched-id':
    case 'oversized':
      return fail('unconfirmed', `could not confirm whether Orca opened the tab (${outcome.kind})`, { route });
    case 'unavailable':
      // つながる前に失敗した（送っていない）。
      return fail('unavailable', outcome.message, { route });
    default:
      if (outcome.code === 'method_not_found') return fail('unsupported', outcome.message, { route });
      if (isGone(outcome.code, outcome.message)) return fail('target_gone', outcome.message, { route });
      return fail('orca_error', `${outcome.code ?? 'error'}: ${outcome.message}`, { route });
  }
}

function classifyCli(outcome: CliOutcome<unknown>, route: OpenRoute): { ok: true } | OpenFailure {
  if (outcome.ok) return { ok: true };
  switch (outcome.kind) {
    case 'timeout':
    case 'invalid-json':
    case 'output-too-large':
      return fail('unconfirmed', `could not confirm whether Orca opened the tab (${outcome.kind})`, { route });
    case 'spawn-failed':
      return fail('unavailable', outcome.message, { route });
    default:
      if (outcome.code === 'method_not_found') return fail('unsupported', outcome.message, { route });
      if (isGone(outcome.code, outcome.message)) return fail('target_gone', outcome.message, { route });
      return fail('orca_error', `${outcome.code ?? outcome.kind}: ${outcome.message}`, { route });
  }
}
