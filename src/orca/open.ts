// 「Orca で開く」の処理。worktree を最新の一覧で解決し、既存のタブを1つ選び、門を通して送る。
// 押した端末（host か client）の navigation で、まず worktree.activate で worktree を表示し、次に選んだタブを選ぶ（Orca の左の一覧を押したときと同じ順）。
// 1 が失敗したら 2 を送らない。送った後の時間切れや結果不明では、送り直さずに unconfirmed を返す。
// Orca の画面を読む RPC はないので、切り替わったかは確かめない（成功の文書の screen: "unverified"）。
import type { CapabilityReport } from './capabilities.ts';
import type { OpenDevice } from './open-device.ts';
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
  | 'orca_error'
  | 'device_not_connected'
  | 'device_unknown';

export interface OpenSuccess {
  ok: true;
  status: 'opened';
  route: OpenRoute;
  reason: OpenReason;
  worktreeId: string;
  /** 押した端末。client では Orca が接続中のすべての端末を動かす（1台に絞れない）。 */
  device: OpenDevice;
  /** orca-web は Orca の画面を読めず、切り替わったかを確かめていない。 */
  screen: 'unverified';
  /** host のときだけ。Orca を前面に出せたか。 */
  raised?: boolean;
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
  /** worktree.activate は通り、タブの選択が失敗したとき。 */
  worktreeShown?: true;
}

export type OpenOutcome = OpenSuccess | OpenFailure;

export interface OpenDeps {
  /** 読むコマンドと `terminal switch` だけを呼べる CLI（OpenOrcaCli）。 */
  cli: Pick<OpenOrcaCli, 'json'>;
  /** 読む RPC と `navigation: "host"`・`"clients"` の activate だけを送れる口（OpenRpc）。 */
  rpc: RpcTransport;
  /** ホストの Orca を前面に出す（raiseOrca）。なければ呼ばず raised を出さない。 */
  raise?: () => Promise<boolean>;
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

type Navigation = 'host' | 'clients';

type Sent = { ok: true; route: OpenRoute } | OpenFailure;

export class OpenService {
  readonly #deps: OpenDeps;
  #busy = false;

  constructor(deps: OpenDeps) {
    this.#deps = deps;
  }

  /** 1つの開く要求。origin は押した端末（open-device.ts で決める）。処理中に来た要求は busy で断る。 */
  async open(request: OpenRequest, origin: OpenDevice = 'host'): Promise<OpenOutcome> {
    if (this.#busy) return fail('busy', 'another open request is in progress');
    this.#busy = true;
    try {
      return await this.#open(request, origin);
    } finally {
      this.#busy = false;
    }
  }

  async #open(request: OpenRequest, origin: OpenDevice): Promise<OpenOutcome> {
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
    const sent = await this.#send(worktreeId, target, origin === 'client' ? 'clients' : 'host');
    if (!sent.ok) return sent;
    const success: OpenSuccess = {
      ok: true,
      status: 'opened',
      route: sent.route,
      reason: target.reason,
      worktreeId,
      device: origin,
      screen: 'unverified',
    };
    if (choice.requestedAgentFound !== undefined) success.requestedAgentFound = choice.requestedAgentFound;
    if (target.route === 'worktree-activate') success.mayCreateInitialTerminal = target.mayCreateInitialTerminal;
    if (origin === 'host' && this.#deps.raise) success.raised = await this.#raise(this.#deps.raise);
    return success;
  }

  async #raise(raise: () => Promise<boolean>): Promise<boolean> {
    try {
      return (await raise()) === true;
    } catch {
      return false;
    }
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

  /** 1. worktree.activate、2. 選んだタブの選択（あれば）。route は最後に送った書き込みの経路。 */
  async #send(worktreeId: string, target: OpenTarget, navigation: Navigation): Promise<Sent> {
    const timeoutMs = this.#deps.writeTimeoutMs ?? DEFAULT_WRITE_TIMEOUT_MS;
    const worktree = `id:${worktreeId}`;
    const shown = classifyRpc(
      await this.#deps.rpc.call<unknown>('worktree.activate', { worktree, navigation }, { timeoutMs }),
      'worktree-activate',
    );
    if (!shown.ok) return shown;
    if (target.route === 'worktree-activate') return { ok: true, route: 'worktree-activate' };

    let selected: { ok: true } | OpenFailure;
    let route: OpenRoute;
    if (target.route === 'terminal-switch' && navigation === 'host') {
      route = 'terminal-switch';
      const outcome = await this.#deps.cli.json<unknown>(['terminal', 'switch', '--terminal', target.handle]);
      selected = classifyCli(outcome, route);
    } else {
      // terminal switch は navigation に clients を取らないので、クライアントでは端末のタブも session.tabs.activate で選ぶ。
      route = 'tab-activate';
      const params: Record<string, unknown> = { worktree, tabId: target.tabId, navigation, intent: 'user' };
      if (target.leafId !== undefined) params.leafId = target.leafId;
      const outcome = await this.#deps.rpc.call<unknown>('session.tabs.activate', params, { timeoutMs });
      selected = classifyRpc(outcome, route);
    }
    if (!selected.ok) return { ...selected, worktreeShown: true };
    return { ok: true, route };
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
    // 封筒（Orca の答え）がないまま終わった。CLI は起動していて、切り替えが届いた可能性がある（FQG-002）。
    case 'timeout':
    case 'exit-nonzero':
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
