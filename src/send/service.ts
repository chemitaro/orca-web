// 確認票の消費と記録の順序を所有する送信サービス（本文の送信と、構造化 Chat の質問への答え）。
import type { CapabilityReport } from '../orca/capabilities.ts';
import type { SendAdapter, SendReadFailure, SendResult } from '../orca/send.ts';
import type { SendRpc } from '../orca/send-gates.ts';
import type { StateDocument } from '../state/model.ts';
import { checkAnswers, digestAnswers } from './answer.ts';
import type { SendJournal, SendRecord } from './journal.ts';
import type { ChatSendTarget, SendPreview, SendTarget } from './model.ts';
import { buildPreview, compareTargets, resolveTarget, targetFingerprint } from './target.ts';
import { checkText, digestText, newOperationId, TicketStore } from './ticket.ts';

export interface SendFailure {
  ok: false;
  error:
    | 'invalid_text'
    | 'invalid_answer'
    | 'send_disabled'
    | 'agent_not_found'
    | 'not_sendable'
    | 'target_changed'
    | 'ticket_invalid'
    | 'busy'
    | 'unsupported'
    | 'unknown_shape'
    | 'unreachable'
    | 'record_failed'
    | 'record_unreadable';
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
/** 答えの意図の結果。答えの中身は返さない（digest だけ）。 */
export interface AnswerIntentResult {
  ticket: string;
  expiresAt: number;
  operationId: string;
  preview: SendPreview;
  digest: string;
}
export interface AnswerStatus {
  available: boolean;
  reason: string | null;
}
type ConfirmAnswer = SendAnswer<SendResult & { operationId: string; recordWarning?: 'after_record_failed' }>;
const ANSWER_METHOD = 'agentSession.respondToQuestion';
/** 確定の前の読みで宛先が変わったと分かる理由。 */
const CHANGED_REASONS = ['asleep', 'untabbed', 'no_session', 'identity_unavailable', 'state_out_of_date'];
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
  | {
      operationId: string;
      state: 'recorded';
      record: SendRecord;
      checkError?: 'unreachable';
      checkWarning?: 'check_record_failed';
    };
type SendRefusal = Omit<SendFailure, 'error'> & { error: Exclude<SendFailure['error'], 'record_unreadable'> };
/** answerChat は、この runtime の能力の確かめで答えの機能が使えるか（status が読み直さずに使う）。 */
type Preflight =
  | { ok: true; target: SendTarget; preview: SendPreview; fence?: number; answerChat: boolean }
  | SendRefusal;
/** send は今の送信、answer は質問への答え（構造化 Chat だけ、能力 answerChat）。 */
type PreflightMode = 'send' | 'answer';
export class SendService {
  readonly #deps: SendDeps;
  #busy = false;
  #runtimeId: string | null = null;
  /** method_not_found で止めた RPC。鍵は経路（terminal・chat）か、答えの 'answer'。 */
  readonly #blocked = new Map<string, Set<string>>();
  readonly #inFlight = new Set<string>();
  readonly #tickets: TicketStore;
  readonly #operationId: () => string;
  constructor(deps: SendDeps) {
    this.#deps = deps;
    this.#tickets = deps.tickets ?? new TicketStore({ now: deps.now ?? Date.now });
    this.#operationId = deps.operationId ?? (() => newOperationId((deps.now ?? Date.now)()));
  }
  #rememberRuntime(cap: CapabilityReport): cap is CapabilityReport & { runtimeId: string } {
    if (cap.connection.state !== 'connected' || !cap.runtimeId) return false;
    if (cap.runtimeId !== this.#runtimeId) {
      this.#blocked.clear();
      this.#runtimeId = cap.runtimeId;
    }
    return true;
  }
  async #preflight(agentId: string, mode: PreflightMode = 'send'): Promise<Preflight> {
    const cap = await this.#deps.capabilities();
    if (!this.#rememberRuntime(cap)) return { ok: false, error: 'unreachable' };
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
    const target = resolved.target;
    if (mode === 'answer' && target.route !== 'chat')
      return { ok: false, error: 'not_sendable', reason: 'terminal_route' };
    const feature =
      cap.features[mode === 'answer' ? 'answerChat' : target.route === 'terminal' ? 'sendTerminal' : 'sendChat'];
    if (!feature.available) return { ok: false, error: 'unsupported', missing: feature.missing };
    // 答えは自分の RPC と、Chat の経路で止めた読み（agentSession.history）で止める。
    const blocked =
      mode === 'answer'
        ? [
            ...(this.#blocked.get('answer') ?? []),
            ...[...(this.#blocked.get('chat') ?? [])].filter((method) => method === 'agentSession.history'),
          ]
        : [...(this.#blocked.get(target.route) ?? [])];
    if (blocked.length) return { ok: false, error: 'unsupported', missing: blocked.map((method) => `rpc:${method}`) };
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
    return {
      ok: true,
      target: resolved.target,
      preview,
      ...(fence === undefined ? {} : { fence }),
      answerChat: cap.features.answerChat.available,
    };
  }
  #readError(failure: SendReadFailure, target: SendTarget): SendRefusal {
    if (failure.error === 'unsupported' && failure.method) this.#block(target, failure.method);
    if (failure.error === 'unsupported')
      return { ok: false, error: 'unsupported', missing: failure.method ? [`rpc:${failure.method}`] : [] };
    if (failure.error === 'terminal_gone') return { ok: false, error: 'not_sendable', reason: 'identity_unavailable' };
    if (failure.error === 'foreground_unknown')
      return { ok: false, error: 'not_sendable', reason: 'foreground_unknown' };
    // question_not_found は答えの読みが先に分ける。ここに来たら知らない形として扱う。
    return { ok: false, error: failure.error === 'question_not_found' ? 'unknown_shape' : failure.error };
  }
  #block(target: SendTarget, method: string): void {
    if (target.runtimeId !== this.#runtimeId) return;
    const key = method === ANSWER_METHOD ? 'answer' : target.route;
    const methods = this.#blocked.get(key) ?? new Set<string>();
    methods.add(method);
    this.#blocked.set(key, methods);
  }
  /** 確定の前の preflight の拒みを、宛先が変わったと分かるものは target_changed にする。 */
  static #confirmRefusal(checked: SendRefusal): SendRefusal {
    const reason =
      checked.error === 'agent_not_found'
        ? 'tab_gone'
        : checked.error === 'unreachable' && checked.reason === 'runtime_changed'
          ? 'runtime_changed'
          : checked.error === 'not_sendable' && CHANGED_REASONS.includes(checked.reason ?? '')
            ? checked.reason
            : null;
    return reason ? { ok: false, error: 'target_changed', reason } : checked;
  }
  /** 質問の今の状態を読み、送れる pending の同じ revision でなければ拒む。 */
  async #readPendingQuestion(target: ChatSendTarget, prompt: { itemId: string; revision: number }) {
    const read = await this.#deps.adapter.readQuestion(target.sessionId, prompt.itemId);
    if (!read.ok) {
      if (read.error === 'question_not_found')
        return { ok: false, error: 'target_changed', reason: 'question_gone' } as const;
      if (read.error === 'unknown_shape') return { ok: false, error: 'unknown_shape' } as const;
      return this.#readError(read, target);
    }
    if (read.state !== 'pending' || read.revision !== prompt.revision)
      return { ok: false, error: 'target_changed', reason: 'question_changed' } as const;
    return read;
  }
  async status(agentId: string): Promise<{
    enabled: boolean;
    available: boolean;
    route: SendTarget['route'] | null;
    reason: string | null;
    target: string | null;
    agentType: string | null;
    answer: AnswerStatus;
  }> {
    const enabled = await this.#deps.readSendEnabled();
    const checked = await this.#preflight(agentId);
    const answer = checked.ok ? this.#answerStatus(checked) : await this.#answerStatusFor(agentId);
    return checked.ok
      ? {
          enabled,
          available: true,
          route: checked.target.route,
          reason: null,
          target: targetFingerprint(checked.target),
          agentType: checked.target.agentType,
          answer,
        }
      : {
          enabled,
          available: false,
          route: null,
          reason: checked.reason ?? checked.error,
          target: null,
          agentType: null,
          answer,
        };
  }
  /** 送信の preflight が通ったときの、答えられるか（読み直さない）。 */
  #answerStatus(checked: Extract<Preflight, { ok: true }>): AnswerStatus {
    if (checked.target.route !== 'chat') return { available: false, reason: 'terminal_route' };
    if (this.#blocked.get('answer')?.size) return { available: false, reason: 'unsupported' };
    return checked.answerChat ? { available: true, reason: null } : { available: false, reason: 'unsupported' };
  }
  /** 送信の preflight が通らないときは、答えの preflight で理由を決める（端末なら terminal_route）。 */
  async #answerStatusFor(agentId: string): Promise<AnswerStatus> {
    const checked = await this.#preflight(agentId, 'answer');
    return checked.ok
      ? { available: true, reason: null }
      : { available: false, reason: checked.reason ?? checked.error };
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
      if (taken.value.prompt)
        return await this.#refuse(
          { ok: false, error: 'ticket_invalid', reason: 'wrong_kind' },
          operationId,
          target.agentId,
        );
      if (!checkText(text).ok || digestText(text) !== digest)
        return await this.#refuse(
          { ok: false, error: 'target_changed', reason: 'text_changed' },
          operationId,
          target.agentId,
        );
      const checked = await this.#preflight(target.agentId);
      if (!checked.ok) return await this.#refuse(SendService.#confirmRefusal(checked), operationId, target.agentId);
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
  async #refuse(failure: SendRefusal, operationId = this.#operationId(), agentId?: string): Promise<SendFailure> {
    const reason =
      failure.error === 'agent_not_found' || failure.error === 'invalid_text' || failure.error === 'invalid_answer'
        ? 'target_changed'
        : failure.error;
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
    let checkWarning: 'check_record_failed' | undefined;
    let record: SendRecord | null;
    try {
      record = await this.#deps.journal.read(operationId);
    } catch {
      return { ok: false, error: 'record_unreadable' };
    }
    if (query && record?.outcome === 'unknown' && record.before) {
      const before = record.before;
      const target = before.target;
      const result =
        before.action === 'answer' && target.route === 'chat'
          ? await this.#deps.adapter.checkAnswer(target, before.prompt, before.digest, operationId)
          : target.route === 'terminal'
            ? await this.#deps.adapter.checkTerminal(target, operationId)
            : await this.#deps.adapter.checkChat(target, operationId);
      if (!result.ok && result.error === 'unreachable')
        return { ok: true, operationId, state: 'recorded', record, checkError: 'unreachable' };
      if (!result.ok && result.error === 'unsupported' && result.method) {
        try {
          if (this.#rememberRuntime(await this.#deps.capabilities())) this.#block(target, result.method);
        } catch {
          // 現在の runtime が読めないときは、記録の古い世代で経路を止めない。
        }
      }
      const classified: SendResult = result.ok
        ? { outcome: result.outcome, detail: result.detail }
        : {
            outcome: 'unknown',
            detail: {
              code: result.error === 'unsupported' ? 'method_not_found' : result.error,
              ...(result.method ? { method: result.method } : {}),
            },
          };
      if (!(await this.#deps.journal.appendCheck({ operationId, ...classified }))) checkWarning = 'check_record_failed';
      try {
        record = (await this.#deps.journal.read(operationId)) ?? record;
      } catch {
        return { ok: false, error: 'record_unreadable' };
      }
    }
    return record
      ? { ok: true, operationId, state: 'recorded', record, ...(checkWarning ? { checkWarning } : {}) }
      : { ok: true, operationId, state: 'not_sent' };
  }
  async intent({
    agent,
    text,
    target,
  }: {
    agent: string;
    text: string;
    target?: string;
  }): Promise<SendAnswer<IntentResult>> {
    if (!(await this.#deps.readSendEnabled())) return { ok: false, error: 'send_disabled' };
    const valid = checkText(text);
    if (!valid.ok) return valid;
    const checked = await this.#preflight(agent);
    if (!checked.ok) return checked;
    if (target !== undefined && target !== targetFingerprint(checked.target))
      return { ok: false, error: 'target_changed', reason: 'changed_since_shown' };
    const operationId = this.#operationId();
    const digest = digestText(text);
    const ticket = this.#tickets.issue({ target: checked.target, digest, operationId });
    return { ok: true, ...ticket, operationId, preview: checked.preview, text, digest };
  }
  /** 質問への答えの意図。送らずに確かめ、使い捨ての票を出す。 */
  async answerIntent({
    agent,
    prompt,
    answers,
    target,
  }: {
    agent: string;
    prompt: { itemId: string; revision: number };
    answers: unknown;
    target?: string;
  }): Promise<SendAnswer<AnswerIntentResult>> {
    if (!(await this.#deps.readSendEnabled())) return { ok: false, error: 'send_disabled' };
    const checked = await this.#preflight(agent, 'answer');
    if (!checked.ok) return checked;
    if (target !== undefined && target !== targetFingerprint(checked.target))
      return { ok: false, error: 'target_changed', reason: 'changed_since_shown' };
    const chat = checked.target as ChatSendTarget;
    const question = await this.#readPendingQuestion(chat, prompt);
    if (!question.ok) return question;
    const valid = checkAnswers(question.questions, answers);
    if (!valid.ok) return valid;
    const operationId = this.#operationId();
    const digest = digestAnswers(valid.answers);
    const ticket = this.#tickets.issue({
      target: checked.target,
      digest,
      operationId,
      prompt: { itemId: prompt.itemId, revision: prompt.revision },
      questions: question.questions,
    });
    return { ok: true, ...ticket, operationId, preview: checked.preview, digest };
  }
  /** 質問への答えの確定。確かめ直してから、送る前の記録の後に agentSession.respondToQuestion を1回だけ送る。 */
  async answerConfirm({ ticket, answers }: { ticket: string; answers: unknown }): Promise<ConfirmAnswer> {
    if (this.#busy) return this.#refuse({ ok: false, error: 'busy' });
    this.#busy = true;
    let activeId: string | undefined;
    try {
      if (!(await this.#deps.readSendEnabled())) return await this.#refuse({ ok: false, error: 'send_disabled' });
      const taken = this.#tickets.take(ticket);
      if (!taken.ok) return await this.#refuse({ ok: false, error: 'ticket_invalid', reason: taken.reason });
      const { operationId, target, digest, prompt, questions } = taken.value;
      // take と印の間に await を置かない。照会はこの印か未使用の票を必ず見る。
      this.#inFlight.add(operationId);
      activeId = operationId;
      const refuse = (failure: SendRefusal) => this.#refuse(failure, operationId, target.agentId);
      if (!prompt || !questions || target.route !== 'chat')
        return await refuse({ ok: false, error: 'ticket_invalid', reason: 'wrong_kind' });
      const shown = checkAnswers(questions, answers);
      if (!shown.ok || digestAnswers(shown.answers) !== digest)
        return await refuse({ ok: false, error: 'target_changed', reason: 'answer_changed' });
      const checked = await this.#preflight(target.agentId, 'answer');
      if (!checked.ok) return await refuse(SendService.#confirmRefusal(checked));
      const change = compareTargets(target, checked.target);
      if (change) return await refuse({ ok: false, error: 'target_changed', reason: change });
      const question = await this.#readPendingQuestion(target, prompt);
      if (!question.ok) return await refuse(question);
      const valid = checkAnswers(question.questions, answers);
      if (!valid.ok) return await refuse(valid);
      if (digestAnswers(valid.answers) !== digest)
        return await refuse({ ok: false, error: 'target_changed', reason: 'answer_changed' });
      try {
        await this.#deps.journal.appendBefore({
          operationId,
          action: 'answer',
          route: 'chat',
          target: {
            ...target,
            repoName: checked.preview.repoName,
            worktreePath: checked.preview.worktreePath,
            branch: checked.preview.branch,
            title: checked.preview.title,
          },
          prompt: { itemId: prompt.itemId, revision: prompt.revision },
          questionCount: valid.answers.length,
          digest,
          generation: { runtimeId: target.runtimeId },
        });
      } catch {
        return await refuse({ ok: false, error: 'record_failed' });
      }
      const result = await this.#deps.adapter.answerChat(target, prompt, valid.answers, operationId, question.fence);
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
}
