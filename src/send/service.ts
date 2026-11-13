// 確認票の消費と記録の順序を所有する送信サービス。
import type { CapabilityReport } from '../orca/capabilities.ts';
import type { SendAdapter, SendReadFailure, SendResult } from '../orca/send.ts';
import type { SendRpc } from '../orca/send-gates.ts';
import type { StateDocument } from '../state/model.ts';
import type { SendJournal, SendRecord } from './journal.ts';
import type { SendPreview, SendTarget } from './model.ts';
import { buildPreview, compareTargets, resolveTarget } from './target.ts';
import { checkText, digestText, newOperationId, TicketStore } from './ticket.ts';

export interface SendFailure {
  ok: false;
  error:
    | 'invalid_text'
    | 'send_disabled'
    | 'agent_not_found'
    | 'not_sendable'
    | 'target_changed'
    | 'ticket_invalid'
    | 'busy'
    | 'unsupported'
    | 'unknown_shape'
    | 'unreachable'
    | 'record_failed';
  reason?: string;
  missing?: string[];
}
export type SendAnswer<T> = ({ ok: true } & T) | SendFailure;
export interface IntentResult {
  ticket: string;
  expiresAt: number;
  operationId: string;
  preview: SendPreview;
  text: string;
  digest: string;
}
export interface SendDeps {
  snapshotSync(): StateDocument;
  capabilities(): Promise<CapabilityReport>;
  rpc: SendRpc;
  adapter: SendAdapter;
  journal: Pick<SendJournal, 'appendBefore' | 'appendAfter' | 'appendCheck' | 'appendRefused' | 'read'>;
  readSendEnabled(): Promise<boolean>;
  tickets?: TicketStore;
  now?: () => number;
  operationId?: () => string;
}
export type CheckResult =
  | { operationId: string; state: 'in_progress' | 'not_sent' }
  | { operationId: string; state: 'recorded'; record: SendRecord; checkError?: 'unreachable' };
type Preflight = SendAnswer<{ target: SendTarget; preview: SendPreview; fence?: number }>;
export class SendService {
  readonly #deps: SendDeps;
  #busy = false;
  #runtimeId: string | null = null;
  readonly #blocked = new Map<SendTarget['route'], Set<string>>();
  readonly #inFlight = new Set<string>();
  readonly #tickets: TicketStore;
  readonly #operationId: () => string;
  constructor(deps: SendDeps) {
    this.#deps = deps;
    this.#tickets = deps.tickets ?? new TicketStore({ now: deps.now ?? Date.now });
    this.#operationId = deps.operationId ?? (() => newOperationId((deps.now ?? Date.now)()));
  }
  async #preflight(agentId: string): Promise<Preflight> {
    const cap = await this.#deps.capabilities();
    if (cap.connection.state !== 'connected' || !cap.runtimeId) return { ok: false, error: 'unreachable' };
    if (cap.runtimeId !== this.#runtimeId) {
      this.#blocked.clear();
      this.#runtimeId = cap.runtimeId;
    }
    const tabs = await this.#deps.rpc.call('session.tabs.listAll', {});
    if (!tabs.ok || !tabs.runtimeId) return { ok: false, error: 'unreachable' };
    if (tabs.runtimeId !== cap.runtimeId) return { ok: false, error: 'unreachable', reason: 'runtime_changed' };
    const resolved = resolveTarget(tabs.result, agentId, cap.runtimeId);
    if (!resolved.ok) {
      if (
        resolved.error === 'agent_not_found' &&
        this.#deps.snapshotSync().agents.some((a) => a.id === agentId && a.kind === 'untabbed')
      )
        return { ok: false, error: 'not_sendable', reason: 'untabbed' };
      return resolved;
    }
    const feature = cap.features[resolved.target.route === 'terminal' ? 'sendTerminal' : 'sendChat'];
    if (!feature.available) return { ok: false, error: 'unsupported', missing: feature.missing };
    const target = resolved.target;
    const blocked = this.#blocked.get(target.route);
    if (blocked?.size)
      return { ok: false, error: 'unsupported', missing: [...blocked].map((method) => `rpc:${method}`) };
    let fence: number | undefined;
    if (target.route === 'terminal') {
      const status = await this.#deps.adapter.readTerminalStatus(target.handle);
      if (!status.ok) return this.#readError(status, target);
      if (!status.isRunningAgent) return { ok: false, error: 'not_sendable', reason: 'no_agent' };
      if (status.status === 'permission') return { ok: false, error: 'not_sendable', reason: 'permission' };
      const foreground = await this.#deps.adapter.readForeground(target.handle, target.incarnationId, target.agentType);
      if (!foreground.ok)
        return foreground.error === 'foreground_unknown' || foreground.error === 'unknown_shape'
          ? { ok: false, error: 'not_sendable', reason: 'foreground_unknown' }
          : this.#readError(foreground, target);
      if (foreground.isShell) return { ok: false, error: 'not_sendable', reason: 'shell_foreground' };
      if (!foreground.matchesAgent) return { ok: false, error: 'not_sendable', reason: 'foreground_mismatch' };
    }
    if (target.route === 'chat') {
      const history = await this.#deps.adapter.readChatFence(target.sessionId);
      if (!history.ok) return this.#readError(history, target);
      fence = history.fence;
    }
    const preview = buildPreview(this.#deps.snapshotSync(), resolved.target);
    if (!preview) return { ok: false, error: 'not_sendable', reason: 'state_out_of_date' };
    return { ok: true, target: resolved.target, preview, ...(fence === undefined ? {} : { fence }) };
  }
  #readError(failure: SendReadFailure, target: SendTarget): SendFailure {
    if (failure.error === 'unsupported' && failure.method) this.#block(target, failure.method);
    if (failure.error === 'unsupported')
      return { ok: false, error: 'unsupported', missing: failure.method ? [`rpc:${failure.method}`] : [] };
    if (failure.error === 'terminal_gone') return { ok: false, error: 'not_sendable', reason: 'identity_unavailable' };
    if (failure.error === 'foreground_unknown')
      return { ok: false, error: 'not_sendable', reason: 'foreground_unknown' };
    return { ok: false, error: failure.error };
  }
  #block(target: SendTarget, method: string): void {
    if (target.runtimeId !== this.#runtimeId) return;
    const methods = this.#blocked.get(target.route) ?? new Set<string>();
    methods.add(method);
    this.#blocked.set(target.route, methods);
  }
  async status(
    agentId: string,
  ): Promise<{ enabled: boolean; available: boolean; route: SendTarget['route'] | null; reason: string | null }> {
    const enabled = await this.#deps.readSendEnabled();
    const checked = await this.#preflight(agentId);
    return checked.ok
      ? { enabled, available: true, route: checked.target.route, reason: null }
      : { enabled, available: false, route: null, reason: checked.reason ?? checked.error };
  }
  async confirm({
    ticket,
    text,
  }: {
    ticket: string;
    text: string;
  }): Promise<SendAnswer<SendResult & { operationId: string; recordWarning?: 'after_record_failed' }>> {
    if (this.#busy) return this.#refuse({ ok: false, error: 'busy' });
    this.#busy = true;
    let activeId: string | undefined;
    try {
      if (!(await this.#deps.readSendEnabled())) return await this.#refuse({ ok: false, error: 'send_disabled' });
      const taken = this.#tickets.take(ticket);
      if (!taken.ok) return await this.#refuse({ ok: false, error: 'ticket_invalid', reason: taken.reason });
      const { operationId, target, digest } = taken.value;
      // take と印の間に await を置かない。照会はこの印か未使用の票を必ず見る。
      this.#inFlight.add(operationId);
      activeId = operationId;
      if (!checkText(text).ok || digestText(text) !== digest)
        return await this.#refuse(
          { ok: false, error: 'target_changed', reason: 'text_changed' },
          operationId,
          target.agentId,
        );
      const checked = await this.#preflight(target.agentId);
      if (!checked.ok) {
        const reason =
          checked.error === 'agent_not_found'
            ? 'tab_gone'
            : checked.error === 'unreachable' && checked.reason === 'runtime_changed'
              ? 'runtime_changed'
              : checked.error === 'not_sendable' &&
                  ['asleep', 'untabbed', 'no_session', 'identity_unavailable', 'state_out_of_date'].includes(
                    checked.reason ?? '',
                  )
                ? checked.reason
                : null;
        return await this.#refuse(
          reason ? { ok: false, error: 'target_changed', reason } : checked,
          operationId,
          target.agentId,
        );
      }
      const change = compareTargets(target, checked.target);
      if (change)
        return await this.#refuse({ ok: false, error: 'target_changed', reason: change }, operationId, target.agentId);
      try {
        await this.#deps.journal.appendBefore({
          operationId,
          route: target.route,
          target: {
            ...target,
            repoName: checked.preview.repoName,
            worktreePath: checked.preview.worktreePath,
            branch: checked.preview.branch,
            title: checked.preview.title,
          },
          text,
          digest,
          generation: {
            runtimeId: target.runtimeId,
            ...(target.route === 'terminal' ? { incarnationId: target.incarnationId } : {}),
          },
        });
      } catch {
        return await this.#refuse({ ok: false, error: 'record_failed' }, operationId, target.agentId);
      }
      const result =
        target.route === 'terminal'
          ? await this.#deps.adapter.sendTerminal(target, text, operationId)
          : await this.#deps.adapter.sendChat(target, text, operationId, checked.fence as number);
      if (result.detail.code === 'method_not_found' && result.detail.method) this.#block(target, result.detail.method);
      const recorded = await this.#deps.journal.appendAfter({ operationId, ...result });
      return {
        ok: true,
        operationId,
        ...result,
        ...(recorded ? {} : { recordWarning: 'after_record_failed' as const }),
      };
    } finally {
      if (activeId) this.#inFlight.delete(activeId);
      this.#busy = false;
    }
  }
  async #refuse(failure: SendFailure, operationId = this.#operationId(), agentId?: string): Promise<SendFailure> {
    const reason =
      failure.error === 'agent_not_found' || failure.error === 'invalid_text' ? 'target_changed' : failure.error;
    await this.#deps.journal.appendRefused({
      operationId,
      reason,
      ...(agentId === undefined ? {} : { agentId }),
      ...(failure.error === 'target_changed' && failure.reason ? { change: failure.reason } : {}),
      ...(failure.error === 'not_sendable' && failure.reason ? { notSendableReason: failure.reason } : {}),
    });
    return failure;
  }
  async check(operationId: string, { query }: { query: boolean }): Promise<SendAnswer<CheckResult>> {
    // 処理中の判定と未使用票の取消しは、記録の読みより先に同期して終える。
    if (this.#inFlight.has(operationId)) return { ok: true, operationId, state: 'in_progress' };
    this.#tickets.cancelByOperation(operationId);
    let record = await this.#deps.journal.read(operationId);
    if (query && record?.outcome === 'unknown' && record.before) {
      const target = record.before.target;
      const result =
        target.route === 'terminal'
          ? await this.#deps.adapter.checkTerminal(target, operationId)
          : await this.#deps.adapter.checkChat(target, operationId);
      if (!result.ok && result.error === 'unreachable')
        return { ok: true, operationId, state: 'recorded', record, checkError: 'unreachable' };
      if (!result.ok && result.error === 'unsupported' && result.method) this.#block(target, result.method);
      const classified: SendResult = result.ok
        ? { outcome: result.outcome, detail: result.detail }
        : {
            outcome: 'unknown',
            detail: {
              code: result.error === 'unsupported' ? 'method_not_found' : result.error,
              ...(result.method ? { method: result.method } : {}),
            },
          };
      await this.#deps.journal.appendCheck({ operationId, ...classified });
      record = (await this.#deps.journal.read(operationId)) ?? record;
    }
    return record ? { ok: true, operationId, state: 'recorded', record } : { ok: true, operationId, state: 'not_sent' };
  }
  async intent({ agent, text }: { agent: string; text: string }): Promise<SendAnswer<IntentResult>> {
    if (!(await this.#deps.readSendEnabled())) return { ok: false, error: 'send_disabled' };
    const valid = checkText(text);
    if (!valid.ok) return valid;
    const checked = await this.#preflight(agent);
    if (!checked.ok) return checked;
    const operationId = this.#operationId();
    const digest = digestText(text);
    const ticket = this.#tickets.issue({ target: checked.target, digest, operationId });
    return { ok: true, ...ticket, operationId, preview: checked.preview, text, digest };
  }
}
