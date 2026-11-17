// Orca の送信結果を、到達を確かめられる範囲だけで分類する。
import { createHash } from 'node:crypto';
import { answerForm, digestAnswers, type QuestionAnswer } from '../send/answer.ts';
import { digestOption } from '../send/approval.ts';
import { ANSWER_STEP_MS } from '../send/keys.ts';
import type { ChatSendTarget, TerminalSendTarget } from '../send/model.ts';
import {
  type ApprovalOptionView,
  type JournalQuestionAnswer,
  parseJournalApproval,
  parseJournalQuestion,
  type QuestionState,
  type QuestionView,
} from '../transcript/normalize.ts';
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
  /** キーの組の答え：受けられた組の数と全部の組の数。 */
  sentGroups?: number;
  totalGroups?: number;
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
export function canonicalize(value: unknown): string {
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
const ANSWER_METHOD = 'agentSession.respondToQuestion';
const APPROVAL_METHOD = 'agentSession.respondToApproval';
/** 質問と承認への答えの結果。Orca の AgentSessionPromptResult の resolution.state で分ける。 */
function promptReceipt(result: unknown): SendResult {
  const reply = object(result);
  if (reply.ok === false) {
    const code = object(reply.refusal).code;
    return typeof code === 'string' ? { outcome: 'refused', detail: { code } } : unknown();
  }
  if (reply.ok !== true) return unknown();
  const state = object(object(reply.value).resolution).state;
  if (state === 'resolved') return { outcome: 'submitted', detail: { code: 'resolved' } };
  if (state === 'cancelled') return { outcome: 'refused', detail: { code: 'cancelled' } };
  if (state === 'pending') return { outcome: 'unknown', detail: { code: 'prompt_pending' } };
  return unknown();
}
function classifyPrompt(outcome: RpcOutcome, method: string): SendResult {
  if (!outcome.ok) return failure(outcome, method);
  const classified = promptReceipt(outcome.result);
  if (object(outcome.result).replayed === true) classified.detail.replayed = true;
  return classified;
}
export function classifyAnswer(outcome: RpcOutcome): SendResult {
  return classifyPrompt(outcome, ANSWER_METHOD);
}
export function classifyApproval(outcome: RpcOutcome): SendResult {
  return classifyPrompt(outcome, APPROVAL_METHOD);
}
/** Orca の respondToStructuredAgentSessionPrompt が作る指紋（method は `agentSession.respondTo:question`）。 */
export function answerFingerprint(
  sessionId: string,
  fields: { itemId: string; expectedRevision: number; answers: readonly QuestionAnswer[] },
): string {
  return createHash('sha256')
    .update(canonicalize({ method: 'agentSession.respondTo:question', sessionId, fields }))
    .digest('hex');
}
/** Orca の respondToStructuredAgentSessionPrompt が承認に作る指紋（method は `agentSession.respondTo:approval`）。 */
export function approvalFingerprint(
  sessionId: string,
  fields: { itemId: string; expectedRevision: number; optionId: string },
): string {
  return createHash('sha256')
    .update(canonicalize({ method: 'agentSession.respondTo:approval', sessionId, fields }))
    .digest('hex');
}
/** 送る前と照会で読む承認の今の状態。selectedOptionId は answered で今の選択肢にあるときだけ。 */
export interface ApprovalRead {
  fence: number;
  revision: number;
  state: QuestionState;
  options: ApprovalOptionView[];
  answerable: boolean;
  selectedOptionId: string | null;
}
/** 送る前と照会で読む質問の今の状態。answers は Orca が書いた生の答え（解けなければ null）。 */
export interface QuestionRead {
  fence: number;
  revision: number;
  state: QuestionState;
  questions: QuestionView[];
  answers: JournalQuestionAnswer[] | null;
}
export interface SendReadFailure {
  ok: false;
  error:
    | 'unreachable'
    | 'unsupported'
    | 'terminal_gone'
    | 'unknown_shape'
    | 'foreground_unknown'
    | 'question_not_found';
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
export type KeyAck = 'accepted' | 'refused' | 'unknown';
/** Orca の readTerminalSendAcknowledgment を、キーの組では厳しくした読み（writeSettlement がなく accepted が真なら unknown）。unverifiable は unknown。 */
function keyAcknowledgment(result: unknown): KeyAck {
  const reply = object(result);
  if (!('send' in reply)) return 'unknown';
  const sent = reply.send;
  if (typeof sent !== 'object' || sent === null) return 'unknown';
  const receipt = sent as Record<string, unknown>;
  if ('writeSettlement' in receipt) {
    const settlement = receipt.writeSettlement;
    if (typeof settlement === 'object' && settlement !== null && 'outcome' in settlement) {
      if (settlement.outcome === 'refused') return 'refused';
      if (settlement.outcome === 'accepted' && receipt.accepted === true) return 'accepted';
    }
    return 'unknown';
  }
  // キーの組は書き込みの完了を求める。writeSettlement がなければ（古い Orca）受けたとは言えないので、次の組を送らない。
  if (receipt.accepted === false) return 'refused';
  return 'unknown';
}
/** キーの組の RPC の結果。unavailable・method_not_found・invalid_argument は書く前の拒み、ほかの誤りは結果不明。 */
function classifyKeyGroup(outcome: RpcOutcome): { ack: KeyAck; code?: string } {
  if (outcome.ok) return { ack: keyAcknowledgment(outcome.result) };
  if (outcome.kind === 'unavailable') return { ack: 'refused' };
  const code = outcome.kind === 'orca-error' ? (outcome.code ?? 'orca-error') : outcome.kind;
  return code === 'method_not_found' || code === 'invalid_argument' ? { ack: 'refused', code } : { ack: 'unknown' };
}
export function createSendAdapter({ rpc }: { rpc: import('./send-gates.ts').SendRpc }) {
  /** 末尾の 200 件から itemId の項目を読む。 */
  async function readJournalItem(
    sessionId: string,
    itemId: string,
  ): Promise<SendRead<{ fence: number; item: unknown }>> {
    const result = await rpc.call('agentSession.history', { sessionId, direction: 'tail', limit: 200 });
    if (!result.ok) return readFailure(result, 'agentSession.history');
    const reply = object(result.result);
    const page = object(reply.page);
    if (
      reply.ok !== true ||
      page.sessionId !== sessionId ||
      !Number.isInteger(page.fence) ||
      (page.fence as number) <= 0 ||
      !Array.isArray(page.items)
    )
      return { ok: false, error: 'unknown_shape' };
    const found = page.items.findLast((row) => object(row).itemId === itemId);
    if (found === undefined) return { ok: false, error: 'question_not_found' };
    return { ok: true, fence: page.fence as number, item: found };
  }
  /** 末尾の 200 件から itemId の質問を読む。 */
  async function readQuestion(sessionId: string, itemId: string): Promise<SendRead<QuestionRead>> {
    const found = await readJournalItem(sessionId, itemId);
    if (!found.ok) return found;
    const parsed = parseJournalQuestion(found.item);
    if (parsed === null) return { ok: false, error: 'unknown_shape' };
    return {
      ok: true,
      fence: found.fence,
      revision: parsed.prompt.revision,
      state: parsed.state,
      questions: parsed.questions,
      answers: parsed.answers,
    };
  }
  async function sendGroup(target: TerminalSendTarget, bytes: string): Promise<{ ack: KeyAck; code?: string }> {
    return classifyKeyGroup(
      await rpc.call(
        'terminal.send',
        {
          terminal: target.handle,
          text: bytes,
          enter: false,
          requireWriteSettlement: true,
          client: { id: 'orca-web', type: 'desktop' },
        },
        { timeoutMs: 10000 },
      ),
    );
  }
  /** 末尾の 200 件から itemId の承認を読む。見つからなければ question_not_found（名前は質問と共有する）。 */
  async function readApproval(sessionId: string, itemId: string): Promise<SendRead<ApprovalRead>> {
    const found = await readJournalItem(sessionId, itemId);
    if (!found.ok) return found;
    const parsed = parseJournalApproval(found.item);
    if (parsed === null || parsed.prompt === null) return { ok: false, error: 'unknown_shape' };
    return {
      ok: true,
      fence: found.fence,
      revision: parsed.prompt.revision,
      state: parsed.state,
      options: parsed.options,
      answerable: parsed.answerable,
      selectedOptionId: parsed.selectedOptionId,
    };
  }
  return {
    /** キーの組を1つ送り、受けられたか（accepted）、受けられなかったか（refused）、分からないか（unknown）を返す。 */
    async sendKeyGroup(target: TerminalSendTarget, bytes: string): Promise<KeyAck> {
      return (await sendGroup(target, bytes)).ack;
    },
    /**
     * 答えの組を1組ずつ送る。1組目はすぐ、次の組は前の組が受けられてから sleep(ANSWER_STEP_MS) の後に送る。
     * 受けられない組で止め、残りを送らない。自動で送り直さない。
     */
    async answerKeys(
      target: TerminalSendTarget,
      groups: readonly string[],
      sleep: (ms: number) => Promise<void>,
    ): Promise<SendResult> {
      const totalGroups = groups.length;
      let sentGroups = 0;
      for (const [index, bytes] of groups.entries()) {
        if (index > 0) await sleep(ANSWER_STEP_MS);
        const { ack, code } = await sendGroup(target, bytes);
        if (ack === 'accepted') {
          sentGroups += 1;
          continue;
        }
        const method = code === 'method_not_found' ? { method: 'terminal.send' } : {};
        if (sentGroups > 0)
          return { outcome: 'unknown', detail: { code: 'partial_sent', ...method, sentGroups, totalGroups } };
        if (ack === 'refused')
          return {
            outcome: 'refused',
            detail: { code: code === 'method_not_found' ? code : 'not_sent', ...method, sentGroups, totalGroups },
          };
        return { outcome: 'unknown', detail: { code: 'unconfirmed', sentGroups, totalGroups } };
      }
      return { outcome: 'input_accepted', detail: { code: 'keys_sent', sentGroups, totalGroups } };
    },
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
    async answerChat(
      target: ChatSendTarget,
      prompt: { itemId: string; revision: number },
      answers: readonly QuestionAnswer[],
      operationId: string,
      fence: number,
    ): Promise<SendResult> {
      const fields = { itemId: prompt.itemId, expectedRevision: prompt.revision, answers: [...answers] };
      return classifyAnswer(
        await rpc.call(
          ANSWER_METHOD,
          {
            envelope: {
              sessionId: target.sessionId,
              clientOperationId: operationId,
              expectedRuntimeFence: fence,
              payloadFingerprint: answerFingerprint(target.sessionId, fields),
            },
            ...fields,
          },
          { timeoutMs: 15000 },
        ),
      );
    },
    readQuestion,
    /** 結果不明の答えの照会。今の質問の状態だけを読み、送り直さない。 */
    async checkAnswer(
      target: ChatSendTarget,
      prompt: { itemId: string; revision: number },
      digest: string,
      _operationId: string,
    ): Promise<SendRead<SendResult>> {
      const read = await readQuestion(target.sessionId, prompt.itemId);
      if (!read.ok)
        return read.error === 'question_not_found'
          ? { ok: true, outcome: 'unknown', detail: { code: 'question_not_found' } }
          : read;
      if (read.state === 'cancelled') return { ok: true, outcome: 'refused', detail: { code: 'cancelled' } };
      if (read.state === 'pending') return { ok: true, outcome: 'unknown', detail: { code: 'prompt_pending' } };
      if (read.answers === null) return { ok: true, outcome: 'unknown', detail: { code: 'resolved_unverified' } };
      return digestAnswers(answerForm(read.questions, read.answers)) === digest
        ? { ok: true, outcome: 'submitted', detail: { code: 'resolved' } }
        : { ok: true, outcome: 'refused', detail: { code: 'resolved_by_other' } };
    },
    async answerApproval(
      target: ChatSendTarget,
      prompt: { itemId: string; revision: number },
      optionId: string,
      operationId: string,
      fence: number,
    ): Promise<SendResult> {
      const fields = { itemId: prompt.itemId, expectedRevision: prompt.revision, optionId };
      return classifyApproval(
        await rpc.call(
          APPROVAL_METHOD,
          {
            envelope: {
              sessionId: target.sessionId,
              clientOperationId: operationId,
              expectedRuntimeFence: fence,
              payloadFingerprint: approvalFingerprint(target.sessionId, fields),
            },
            ...fields,
          },
          { timeoutMs: 15000 },
        ),
      );
    },
    readApproval,
    /** 結果不明の承認の答えの照会。今の承認の状態だけを読み、送り直さない。 */
    async checkApproval(
      target: ChatSendTarget,
      prompt: { itemId: string; revision: number },
      digest: string,
      _operationId: string,
    ): Promise<SendRead<SendResult>> {
      const read = await readApproval(target.sessionId, prompt.itemId);
      if (!read.ok)
        return read.error === 'question_not_found'
          ? { ok: true, outcome: 'unknown', detail: { code: 'question_not_found' } }
          : read;
      if (read.state === 'cancelled') return { ok: true, outcome: 'refused', detail: { code: 'cancelled' } };
      if (read.state === 'pending') return { ok: true, outcome: 'unknown', detail: { code: 'prompt_pending' } };
      if (read.selectedOptionId === null)
        return { ok: true, outcome: 'unknown', detail: { code: 'resolved_unverified' } };
      return digestOption(read.selectedOptionId) === digest
        ? { ok: true, outcome: 'submitted', detail: { code: 'resolved' } }
        : { ok: true, outcome: 'refused', detail: { code: 'resolved_by_other' } };
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
