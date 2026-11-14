// Orca の送信結果を、到達を確かめられる範囲だけで分類する。
import { createHash } from 'node:crypto';
import type { ChatSendTarget, TerminalSendTarget } from '../send/model.ts';
import type { RpcOutcome } from './rpc.ts';

export type SendOutcome = 'refused' | 'unknown' | 'accepted' | 'submitted' | 'input_accepted';
export interface SendDetail {
  code?: string;
  method?: string;
  refusedReason?: string;
  stages?: string[];
  provider?: string;
  observation?: string;
  dispatchState?: string;
  queuedState?: string;
  replayed?: true;
  warning?: string;
}
export interface SendResult {
  outcome: SendOutcome;
  detail: SendDetail;
}
const unknown = (): SendResult => ({ outcome: 'unknown', detail: { code: 'unknown_shape' } });
function failure(outcome: Extract<RpcOutcome, { ok: false }>, method: string): SendResult {
  if (outcome.kind === 'unavailable') return { outcome: 'refused', detail: { code: 'not_sent' } };
  const code = outcome.kind === 'orca-error' ? (outcome.code ?? 'orca-error') : outcome.kind;
  if (code === 'method_not_found' || code === 'invalid_argument')
    return { outcome: 'refused', detail: { code, method } };
  return {
    outcome: 'unknown',
    detail:
      code === 'agent_prompt_blocked' && method === 'terminal.send'
        ? { code, warning: 'composer_may_hold_text' }
        : { code },
  };
}
const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
function terminalReceipt(result: unknown, target: TerminalSendTarget): SendResult {
  const receipt = object(object(result).send);
  if (receipt.accepted === false)
    return {
      outcome: 'refused',
      detail: ['no-agent', 'permission'].includes(String(receipt.refusedReason))
        ? { refusedReason: String(receipt.refusedReason) }
        : {},
    };
  if (receipt.accepted !== true) return unknown();
  const prompt = object(receipt.prompt);
  const provider = prompt.provider;
  if (!['claude', 'codex', 'antigravity'].includes(String(provider)))
    return { outcome: 'unknown', detail: { warning: 'agent_not_verified' } };
  if (prompt.observation === 'incarnation_replaced')
    return { outcome: 'unknown', detail: { observation: 'incarnation_replaced' } };
  if (provider !== target.agentType)
    return { outcome: 'unknown', detail: { provider: String(provider), warning: 'agent_mismatch' } };
  const stages = Array.isArray(prompt.stages) ? prompt.stages.filter((s): s is string => typeof s === 'string') : [];
  const detail: SendDetail = { stages, provider: String(provider) };
  if (typeof prompt.observation === 'string') detail.observation = prompt.observation;
  if (stages.includes('turn_started')) return { outcome: 'submitted', detail };
  if (stages.length === 1 && stages[0] === 'input_accepted') {
    if (prompt.observation === 'permission') detail.warning = 'permission_after_submit';
    return { outcome: 'input_accepted', detail };
  }
  return { outcome: 'unknown', detail };
}
export function classifyTerminal(outcome: RpcOutcome, target: TerminalSendTarget): SendResult {
  if (!outcome.ok) return failure(outcome, 'terminal.send');
  const classified = terminalReceipt(outcome.result, target);
  if (object(object(outcome.result).mutation).replayed === true) classified.detail.replayed = true;
  return classified;
}
function chatReceipt(result: unknown): SendResult {
  const reply = object(result);
  if (reply.ok === false) {
    const code = object(reply.refusal).code;
    return typeof code === 'string' ? { outcome: 'refused', detail: { code } } : unknown();
  }
  if (reply.ok !== true) return unknown();
  const value = object(reply.value);
  const queuedState = object(value.queued).state;
  if (typeof queuedState === 'string' && ['waiting', 'returned', 'withdrawn', 'dispatched'].includes(queuedState))
    return {
      outcome: queuedState === 'withdrawn' ? 'refused' : queuedState === 'dispatched' ? 'unknown' : 'accepted',
      detail: { queuedState },
    };
  const submission = object(value.submission);
  const dispatchState = submission.dispatchState;
  if (typeof dispatchState !== 'string' || !['pending', 'accepted', 'rejected', 'unknown'].includes(dispatchState))
    return unknown();
  if (
    dispatchState === 'rejected' &&
    typeof submission.queuedMessageId === 'string' &&
    submission.queuedMessageId.length > 0
  )
    return { outcome: 'accepted', detail: { dispatchState, queuedState: 'card' } };
  return {
    outcome:
      dispatchState === 'pending'
        ? 'accepted'
        : dispatchState === 'accepted'
          ? 'submitted'
          : dispatchState === 'rejected'
            ? 'refused'
            : 'unknown',
    detail: { dispatchState },
  };
}
export function classifyChat(outcome: RpcOutcome): SendResult {
  if (!outcome.ok) return failure(outcome, 'agentSession.send');
  const classified = chatReceipt(outcome.result);
  if (object(outcome.result).replayed === true) classified.detail.replayed = true;
  return classified;
}
// Orca v1.4.258 agent-session-mutation-envelope.ts の canonicalize と同じ規則。
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}
export function chatFingerprint(sessionId: string, body: unknown): string {
  return createHash('sha256')
    .update(canonicalize({ method: 'agentSession.send', sessionId, fields: { body } }))
    .digest('hex');
}
export interface SendReadFailure {
  ok: false;
  error: 'unreachable' | 'unsupported' | 'terminal_gone' | 'unknown_shape' | 'foreground_unknown';
  method?: string;
}
export type SendRead<T> = ({ ok: true } & T) | SendReadFailure;
function readFailure(outcome: Extract<RpcOutcome, { ok: false }>, method: string): SendReadFailure {
  if (outcome.kind !== 'orca-error') return { ok: false, error: 'unreachable' };
  if (outcome.code === 'method_not_found') return { ok: false, error: 'unsupported', method };
  if (['terminal_handle_stale', 'terminal_not_found', 'terminal_gone', 'terminal_exited'].includes(outcome.code ?? ''))
    return { ok: false, error: 'terminal_gone' };
  return { ok: false, error: 'unknown_shape' };
}
export function createSendAdapter({ rpc }: { rpc: import('./send-gates.ts').SendRpc }) {
  return {
    async checkChat(target: ChatSendTarget, operationId: string): Promise<SendRead<SendResult>> {
      const result = await rpc.call('agentSession.sendRecorded', {
        sessionId: target.sessionId,
        clientMessageId: operationId,
      });
      if (!result.ok) return readFailure(result, 'agentSession.sendRecorded');
      const recorded = object(result.result).recorded;
      if (recorded === false) return { ok: true, outcome: 'unknown', detail: { code: 'orca_not_recorded' } };
      if (recorded !== true) return { ok: true, ...unknown() };
      const history = await rpc.call('agentSession.history', {
        sessionId: target.sessionId,
        direction: 'tail',
        limit: 200,
      });
      if (!history.ok) return readFailure(history, 'agentSession.history');
      const reply = object(history.result);
      const page = object(reply.page);
      if (reply.ok === true && page.sessionId === target.sessionId) {
        const cards = Array.isArray(page.queuedMessages) ? page.queuedMessages.map(object) : [];
        const queued = cards.find((card) => card.messageId === operationId);
        const rows = Array.isArray(page.submissions) ? page.submissions.map(object) : [];
        const submission =
          rows.find((row) => row.clientMessageId === operationId) ??
          rows
            .filter((row) => row.queuedMessageId === operationId && typeof row.submittedSequence === 'number')
            .sort((a, b) => Number(b.submittedSequence) - Number(a.submittedSequence))[0];
        if (
          !queued &&
          submission &&
          submission.clientMessageId !== operationId &&
          submission.dispatchState === 'rejected'
        )
          return { ok: true, outcome: 'unknown', detail: { code: 'card_gone', dispatchState: 'rejected' } };
        if (queued || submission)
          return {
            ok: true,
            ...classifyChat({
              ok: true,
              runtimeId: history.runtimeId,
              result: { ok: true, value: queued ? { queued } : { submission } },
            }),
          };
      }
      return { ok: true, outcome: 'unknown', detail: { code: 'orca_recorded' } };
    },
    async checkTerminal(target: TerminalSendTarget, operationId: string): Promise<SendRead<SendResult>> {
      const result = await rpc.call('orchestration.requestShow', { request: operationId });
      if (!result.ok) return readFailure(result, 'orchestration.requestShow');
      const reply = object(result.result);
      if (reply.state === 'pending' || reply.state === 'absent')
        return { ok: true, outcome: 'unknown', detail: { code: `orca_${reply.state}` } };
      if (reply.state === 'completed' && object(reply.receipt).send)
        return {
          ok: true,
          ...classifyTerminal({ ok: true, result: reply.receipt, runtimeId: result.runtimeId }, target),
        };
      return { ok: true, ...unknown() };
    },
    async sendTerminal(target: TerminalSendTarget, text: string, operationId: string): Promise<SendResult> {
      return classifyTerminal(
        await rpc.call(
          'terminal.send',
          {
            terminal: target.handle,
            text,
            enter: true,
            agentPrompt: true,
            client: { id: 'orca-web', type: 'desktop' },
            waitSubmitMs: 10000,
          },
          { timeoutMs: 25000, envelope: { orchestrationRequestId: operationId } },
        ),
        target,
      );
    },
    async sendChat(target: ChatSendTarget, text: string, operationId: string, fence: number): Promise<SendResult> {
      const body = { kind: 'message', role: 'user', blocks: [{ type: 'text', text }] };
      return classifyChat(
        await rpc.call(
          'agentSession.send',
          {
            body,
            envelope: {
              sessionId: target.sessionId,
              clientOperationId: operationId,
              expectedRuntimeFence: fence,
              payloadFingerprint: chatFingerprint(target.sessionId, body),
            },
          },
          { timeoutMs: 15000 },
        ),
      );
    },
    async readChatFence(sessionId: string): Promise<SendRead<{ fence: number }>> {
      const result = await rpc.call('agentSession.history', { sessionId, direction: 'tail', limit: 1 });
      if (!result.ok) return readFailure(result, 'agentSession.history');
      const reply = object(result.result);
      const page = object(reply.page);
      if (
        reply.ok !== true ||
        page.sessionId !== sessionId ||
        !Number.isInteger(page.fence) ||
        (page.fence as number) <= 0
      )
        return { ok: false, error: 'unknown_shape' };
      return { ok: true, fence: page.fence as number };
    },
    async readForeground(
      handle: string,
      incarnationId: string,
      agentType: string,
    ): Promise<SendRead<{ isShell: boolean; matchesAgent: boolean }>> {
      const result = await rpc.call('terminal.inspectProcess', {
        terminal: handle,
        expectedIncarnationId: incarnationId,
      });
      if (!result.ok) return readFailure(result, 'terminal.inspectProcess');
      const foreground = object(object(result.result).process).foregroundProcess;
      if (typeof foreground !== 'string' || !foreground.trim()) return { ok: false, error: 'foreground_unknown' };
      const normalized = foreground
        .trim()
        .replace(/^["']|["']$/g, '')
        .toLowerCase();
      const basename = normalized.split(/[\\/]/).pop() ?? normalized;
      const processName = basename.replace(/\.(?:exe|cmd|bat|ps1)$/i, '');
      const shellNames =
        '|bash|zsh|sh|fish|cmd|cmd.exe|powershell|powershell.exe|pwsh|pwsh.exe|nu|ksh|mksh|dash|ash|tcsh|csh|elvish|xonsh'.split(
          '|',
        );
      return {
        ok: true,
        isShell: [normalized, basename, processName].some((name) => shellNames.includes(name)),
        matchesAgent:
          (agentType === 'claude' && processName === 'claude') ||
          (agentType === 'codex' && (processName === 'codex' || processName.startsWith('codex-'))),
      };
    },
    async readTerminalStatus(handle: string): Promise<SendRead<{ isRunningAgent: boolean; status: string | null }>> {
      const result = await rpc.call('terminal.agentStatus', { terminal: handle });
      if (!result.ok) return readFailure(result, 'terminal.agentStatus');
      const status = object(object(result.result).agentStatus);
      if (typeof status.isRunningAgent !== 'boolean' || (status.status !== null && typeof status.status !== 'string'))
        return { ok: false, error: 'unknown_shape' };
      return { ok: true, isRunningAgent: status.isRunningAgent, status: status.status as string | null };
    },
  };
}

export type SendAdapter = ReturnType<typeof createSendAdapter>;
