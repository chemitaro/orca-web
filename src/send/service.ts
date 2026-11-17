// 確認票の消費と記録の順序を所有する送信サービス（本文の送信と、質問への答え：構造化 Chat の rpc、端末のキーの組 keys、後の発言 message。構造化 Chat の承認への答え）。
import type { CapabilityReport, FeatureName } from '../orca/capabilities.ts';
import type { TranscriptErrorCode, TranscriptReader, TranscriptSource } from '../orca/read-transcript.ts';
import type { SendAdapter, SendRead, SendReadFailure, SendResult } from '../orca/send.ts';
import type { SendRpc } from '../orca/send-gates.ts';
import type { StateDocument } from '../state/model.ts';
import {
  type ApprovalIntent,
  normalizePage,
  type QuestionPart,
  type TranscriptMessage,
} from '../transcript/normalize.ts';
import { checkAnswers, digestAnswers, type QuestionAnswer } from './answer.ts';
import { checkOption, digestOption } from './approval.ts';
import type { BeforeRecord, SendJournal, SendRecord } from './journal.ts';
import { formatAsyncAnswer, planKeys } from './keys.ts';
import type { ChatSendTarget, SendPreview, SendTarget, TerminalSendTarget } from './model.ts';
import { findCallQuestion, promptMatches, sameQuestions } from './question-state.ts';
import { buildPreview, compareTargets, resolveTarget, targetFingerprint, terminalPromptOf } from './target.ts';
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
/** 承認の答えの意図の結果。選択肢の id は返さない（digest と intent だけ）。 */
export interface ApprovalIntentResult extends AnswerIntentResult {
  intent: ApprovalIntent | null;
}
export interface AnswerStatus {
  available: boolean;
  reason: string | null;
}
type ConfirmAnswer = SendAnswer<SendResult & { operationId: string; recordWarning?: 'after_record_failed' }>;
const ANSWER_METHOD = 'agentSession.respondToQuestion';
const APPROVAL_METHOD = 'agentSession.respondToApproval';
/** キーの組の列を Orca が知っているエージェント（buildAskAnswerKeys・buildCodexAskAnswerKeys）。 */
const KEY_AGENTS: ReadonlySet<string> = new Set(['claude', 'codex']);
/** 読んだ会話のセッション（端末は nativeChat とエージェントのセッション、構造化 Chat は agentSession とそのセッション）。 */
export interface TranscriptSession {
  source: TranscriptSource;
  sessionId: string;
}
/** 会話の記録の末尾のページ（正規化した件）と、読んだセッション。 */
export type TranscriptTail = (
  agentId: string,
) => Promise<
  { ok: true; messages: TranscriptMessage[]; session: TranscriptSession } | { ok: false; error: TranscriptErrorCode }
>;
/**
 * 会話を読んだセッションが送り先のセッションか。端末は providerSessionId、構造化 Chat は sessionId と比べる
 * （read-transcript.ts の resolveFromTabs が同じタブの値から解く）。同じペインでセッションが入れ替わったら偽。
 */
function sameSession(session: TranscriptSession, target: SendTarget): boolean {
  return target.route === 'terminal'
    ? session.source === 'nativeChat' && session.sessionId === target.providerSessionId
    : session.source === 'agentSession' && session.sessionId === target.sessionId;
}
/** 会話の読み（TranscriptReader）と正規化をつなぎ、末尾の 200 件を読む。 */
export function transcriptTail(reader: TranscriptReader): TranscriptTail {
  return async (agentId) => {
    const resolved = await reader.resolve(agentId);
    if (!resolved.ok) return resolved;
    const read = await reader.read(resolved.target, { limit: 200 });
    if (!read.ok) return read;
    const messages = normalizePage(read.page);
    const session = { source: resolved.target.source, sessionId: resolved.target.sessionId };
    return messages ? { ok: true, messages, session } : { ok: false, error: 'unknown_shape' };
  };
}
const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
/** 確定の前の読みで宛先が変わったと分かる理由。 */
const CHANGED_REASONS = ['asleep', 'untabbed', 'no_session', 'identity_unavailable', 'state_out_of_date'];
export interface SendDeps {
  snapshotSync(): StateDocument;
  capabilities(): Promise<CapabilityReport>;
  rpc: SendRpc;
  adapter: SendAdapter;
  journal: Pick<SendJournal, 'appendBefore' | 'appendAfter' | 'appendCheck' | 'appendRefused' | 'read' | 'hasAnswer'>;
  readSendEnabled(): Promise<boolean>;
  /** 会話の記録の末尾（端末の質問と後の発言の質問への答えが使う）。なければ、その答えは unreachable。 */
  readTranscript?: TranscriptTail;
  /** キーの組の間を待つ（テストは偽の sleep を渡す）。 */
  sleep?: (ms: number) => Promise<void>;
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
/**
 * answerChat・answerApproval・readTranscript は、この runtime の能力の確かめで機能が使えるか（status が読み直さずに使う）。
 * listAll は読んだタブの一覧（keys が interactivePrompt を読む）。permission は端末の status が permission だったか（status と keys だけが通す）。
 */
type Preflight =
  | {
      ok: true;
      target: SendTarget;
      preview: SendPreview;
      fence?: number;
      answerChat: boolean;
      answerApproval: boolean;
      readTranscript: boolean;
      listAll: unknown;
      permission: boolean;
    }
  | SendRefusal;
/**
 * send は今の送信、answer は質問への答え（構造化 Chat だけ、能力 answerChat）、approval は承認への答え（構造化 Chat だけ、能力 answerApproval）、keys は端末の質問へのキーの組（端末だけ、能力 answerKeys、
 * status の permission を拒まない）、status は送れるかの口（端末では送信とキーの組のどちらかが使えれば読み、permission を拒まない）。
 */
type PreflightMode = 'send' | 'answer' | 'approval' | 'keys' | 'status';
/** 答えの道の、能力の名前と止めた鍵。 */
const ANSWER_FEATURES = { answer: 'answerChat', approval: 'answerApproval' } as const;
type Resolved = { ok: true; cap: CapabilityReport; listAll: unknown; target: SendTarget };
/** 答えの票の種類。call は callId で指す端末の質問（keys）か後の発言の質問（message）。 */
type CallMode = 'keys' | 'message';
type CallPlan =
  | {
      ok: true;
      checked: Extract<Preflight, { ok: true }>;
      answers: QuestionAnswer[];
      groups?: string[];
      text?: string;
    }
  | SendRefusal
  | { ok: false; error: 'invalid_answer'; reason: string };
export class SendService {
  readonly #deps: SendDeps;
  #busy = false;
  #runtimeId: string | null = null;
  /** method_not_found で止めた RPC。鍵は経路（terminal・chat）か、答えの 'answer'・'approval'。 */
  readonly #blocked = new Map<string, Set<string>>();
  readonly #inFlight = new Set<string>();
  /** 送り始めた答え（記録を書いた直後に足す）。鍵はエージェントの id と callId。 */
  readonly #startedCalls = new Set<string>();
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
  async #resolve(agentId: string): Promise<Resolved | SendRefusal> {
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
    return { ok: true, cap, listAll: tabs.result, target: resolved.target };
  }
  /** 機能が使えないか、method_not_found で止めた RPC があれば unsupported。 */
  #gate(cap: CapabilityReport, name: FeatureName, blocked: readonly string[]): SendRefusal | null {
    const feature = cap.features[name];
    if (!feature.available) return { ok: false, error: 'unsupported', missing: feature.missing };
    if (blocked.length) return { ok: false, error: 'unsupported', missing: blocked.map((method) => `rpc:${method}`) };
    return null;
  }
  #blockedFor(key: 'terminal' | 'chat' | 'answer' | 'approval'): string[] {
    // 答えは自分の RPC と、Chat の経路で止めた読み（agentSession.history）で止める。
    if (key === 'answer' || key === 'approval')
      return [
        ...(this.#blocked.get(key) ?? []),
        ...[...(this.#blocked.get('chat') ?? [])].filter((method) => method === 'agentSession.history'),
      ];
    return [...(this.#blocked.get(key) ?? [])];
  }
  async #preflight(agentId: string, mode: PreflightMode = 'send'): Promise<Preflight> {
    const resolved = await this.#resolve(agentId);
    return resolved.ok ? this.#check(resolved, mode) : resolved;
  }
  async #check({ cap, listAll, target }: Resolved, mode: PreflightMode): Promise<Preflight> {
    if ((mode === 'answer' || mode === 'approval') && target.route !== 'chat')
      return { ok: false, error: 'not_sendable', reason: 'terminal_route' };
    if (mode === 'keys' && target.route !== 'terminal')
      return { ok: false, error: 'not_sendable', reason: 'chat_route' };
    if (mode === 'keys' && !KEY_AGENTS.has(target.agentType))
      return { ok: false, error: 'not_sendable', reason: 'agent_keys_unknown' };
    if (mode === 'status' && target.route === 'terminal') {
      const send = this.#gate(cap, 'sendTerminal', this.#blockedFor('terminal'));
      const keys = KEY_AGENTS.has(target.agentType)
        ? this.#gate(cap, 'answerKeys', this.#blockedFor('terminal'))
        : send;
      if (send && keys) return send;
    } else {
      const gate =
        mode === 'answer' || mode === 'approval'
          ? this.#gate(cap, ANSWER_FEATURES[mode], this.#blockedFor(mode))
          : mode === 'keys'
            ? this.#gate(cap, 'answerKeys', this.#blockedFor('terminal'))
            : this.#gate(
                cap,
                target.route === 'terminal' ? 'sendTerminal' : 'sendChat',
                this.#blockedFor(target.route),
              );
      if (gate) return gate;
    }
    let fence: number | undefined;
    let permission = false;
    if (target.route === 'terminal') {
      const status = await this.#deps.adapter.readTerminalStatus(target.handle);
      if (!status.ok) return this.#readError(status, target);
      if (!status.isRunningAgent) return { ok: false, error: 'not_sendable', reason: 'no_agent' };
      // 質問を待つ間の status は permission。キーの組と status は拒まない。
      permission = status.status === 'permission';
      if (permission && mode === 'send') return { ok: false, error: 'not_sendable', reason: 'permission' };
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
    const preview = buildPreview(this.#deps.snapshotSync(), target);
    if (!preview) return { ok: false, error: 'not_sendable', reason: 'state_out_of_date' };
    return {
      ok: true,
      target,
      preview,
      ...(fence === undefined ? {} : { fence }),
      answerChat: cap.features.answerChat.available,
      answerApproval: cap.features.answerApproval.available,
      readTranscript: cap.features.readTranscript.available,
      listAll,
      permission,
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
    const key = method === ANSWER_METHOD ? 'answer' : method === APPROVAL_METHOD ? 'approval' : target.route;
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
  /** 承認の今の状態を読み、送れる pending の同じ revision でなければ拒む（理由の名前は質問と同じ）。 */
  async #readPendingApproval(target: ChatSendTarget, prompt: { itemId: string; revision: number }) {
    const read = await this.#deps.adapter.readApproval(target.sessionId, prompt.itemId);
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
    approval: AnswerStatus;
    answerKeys: AnswerStatus;
    answerMessage: AnswerStatus;
  }> {
    const enabled = await this.#deps.readSendEnabled();
    const off = (reason: string): AnswerStatus => ({ available: false, reason });
    const closed = (
      reason: string,
      answer: AnswerStatus,
      approval: AnswerStatus,
      keys: AnswerStatus = off(reason),
    ) => ({
      enabled,
      available: false,
      route: null,
      reason,
      target: null,
      agentType: null,
      answer,
      approval,
      answerKeys: keys,
      answerMessage: off(reason),
    });
    const resolved = await this.#resolve(agentId);
    if (!resolved.ok)
      return closed(
        resolved.reason ?? resolved.error,
        await this.#answerStatusFor(agentId, 'answer'),
        await this.#answerStatusFor(agentId, 'approval'),
      );
    const { cap, target } = resolved;
    const keysReason =
      target.route !== 'terminal' ? 'chat_route' : KEY_AGENTS.has(target.agentType) ? null : 'agent_keys_unknown';
    // 端末の確かめは1回だけ読み、送信とキーの組で permission の違いだけを使い分ける。
    const checked = await this.#check(resolved, 'status');
    // 答えと承認は構造化 Chat だけ。端末なら terminal_route、Chat で送信の確かめが通らなければ答えの確かめで理由を決める。
    const chatAnswer = async (mode: 'answer' | 'approval'): Promise<AnswerStatus> =>
      target.route === 'terminal' ? off('terminal_route') : await this.#answerStatusFor(agentId, mode);
    if (!checked.ok) {
      const reason = checked.reason ?? checked.error;
      return closed(reason, await chatAnswer('answer'), await chatAnswer('approval'), off(keysReason ?? reason));
    }
    const sendRefusal: SendRefusal | null =
      target.route === 'terminal'
        ? (this.#gate(cap, 'sendTerminal', this.#blockedFor('terminal')) ??
          (checked.permission ? { ok: false, error: 'not_sendable', reason: 'permission' } : null))
        : null;
    const answerKeys: AnswerStatus = keysReason
      ? off(keysReason)
      : this.#gate(cap, 'answerKeys', this.#blockedFor('terminal'))
        ? off('unsupported')
        : { available: true, reason: null };
    const sendReason = sendRefusal ? (sendRefusal.reason ?? sendRefusal.error) : null;
    const answer = sendRefusal === null ? this.#answerStatus(checked, 'answer') : await chatAnswer('answer');
    const approval = sendRefusal === null ? this.#answerStatus(checked, 'approval') : await chatAnswer('approval');
    const answerMessage: AnswerStatus =
      sendReason !== null
        ? off(sendReason)
        : checked.readTranscript
          ? { available: true, reason: null }
          : off('unsupported');
    // 送信が permission で通らなくても、キーの組で答えられるなら宛先の経路と種類を返す（画面が codex の判定に使う）。
    const shown = sendRefusal === null || answerKeys.available;
    return {
      enabled,
      available: sendRefusal === null,
      route: shown ? target.route : null,
      reason: sendReason,
      target: sendRefusal === null ? targetFingerprint(target) : null,
      agentType: shown ? target.agentType : null,
      answer,
      approval,
      answerKeys,
      answerMessage,
    };
  }
  /** 送信の preflight が通ったときの、答えられるか（読み直さない）。 */
  #answerStatus(checked: Extract<Preflight, { ok: true }>, mode: 'answer' | 'approval'): AnswerStatus {
    if (checked.target.route !== 'chat') return { available: false, reason: 'terminal_route' };
    if (this.#blocked.get(mode)?.size) return { available: false, reason: 'unsupported' };
    return checked[ANSWER_FEATURES[mode]]
      ? { available: true, reason: null }
      : { available: false, reason: 'unsupported' };
  }
  /** 送信の preflight が通らないときは、答えの preflight で理由を決める（端末なら terminal_route）。 */
  async #answerStatusFor(agentId: string, mode: 'answer' | 'approval'): Promise<AnswerStatus> {
    const checked = await this.#preflight(agentId, mode);
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
      if (taken.value.prompt || taken.value.call || taken.value.approval)
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
        before.action === 'answer' && before.mode === 'keys'
          ? await this.#checkKeys(before)
          : before.action === 'answer' && before.mode === undefined && target.route === 'chat'
            ? await this.#deps.adapter.checkAnswer(target, before.prompt, before.digest, operationId)
            : before.action === 'approval' && target.route === 'chat'
              ? await this.#deps.adapter.checkApproval(target, before.prompt, before.digest, operationId)
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
  async answerIntent(
    input:
      | {
          agent: string;
          prompt: { itemId: string; revision: number };
          callId?: never;
          answers: unknown;
          target?: string;
        }
      | { agent: string; callId: string; prompt?: never; answers: unknown; target?: string },
  ): Promise<SendAnswer<AnswerIntentResult>> {
    if (input.callId !== undefined) return this.#callIntent(input);
    const { agent, prompt, answers, target } = input;
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
      if (taken.value.call) return await this.#callConfirm(taken.value, answers, refuse);
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
  // ---- 端末の質問（keys）と後の発言の質問（message）への答え（callId で指す） ----

  static #transcriptRefusal(error: TranscriptErrorCode): SendRefusal {
    if (error === 'agent_not_found') return { ok: false, error: 'agent_not_found' };
    if (error === 'no_session' || error === 'transcript_not_found')
      return { ok: false, error: 'not_sendable', reason: error };
    if (error === 'unsupported') return { ok: false, error: 'unsupported', missing: ['feature:readTranscript'] };
    if (error === 'unknown_shape') return { ok: false, error: 'unknown_shape' };
    return { ok: false, error: 'unreachable' };
  }
  /** 会話の記録の末尾から callId の質問を読み、まだ答えられていないものだけを返す。 */
  async #readCallQuestion(
    agentId: string,
    callId: string,
  ): Promise<{ ok: true; part: QuestionPart; session: TranscriptSession } | SendRefusal> {
    const read = this.#deps.readTranscript
      ? await this.#deps.readTranscript(agentId)
      : ({ ok: false, error: 'unreachable' } as const);
    if (!read.ok) return SendService.#transcriptRefusal(read.error);
    const found = findCallQuestion(read.messages, callId);
    if (found === null) return { ok: false, error: 'target_changed', reason: 'question_gone' };
    if (found.state !== 'pending') return { ok: false, error: 'target_changed', reason: 'question_answered' };
    // 切った問いの文やラベルでは、Orca と同じ発言を作れず、端末が出している問いと同じかも確かめられない。
    if (found.part.truncated) return { ok: false, error: 'not_sendable', reason: 'prompt_unsupported' };
    return { ok: true, part: found.part, session: read.session };
  }
  /** 同じエージェントの同じ callId に送り始めた答えがあれば already_sent。記録が読めなければ record_unreadable。 */
  async #alreadyStarted(agentId: string, callId: string): Promise<SendFailure | null> {
    if (this.#startedCalls.has(`${agentId}\u0000${callId}`))
      return { ok: false, error: 'not_sendable', reason: 'already_sent' };
    try {
      if (await this.#deps.journal.hasAnswer(agentId, callId))
        return { ok: false, error: 'not_sendable', reason: 'already_sent' };
    } catch {
      return { ok: false, error: 'record_unreadable' };
    }
    return null;
  }
  /** 宛先と端末の確かめと、答えの検査。keys はキーの組の列、message は発言の文を作る（票には持たず、確定で作り直す）。 */
  async #planCall(agentId: string, part: QuestionPart, answers: unknown): Promise<CallPlan> {
    const mode: CallMode = part.answerVia === 'keys' ? 'keys' : 'message';
    const checked = await this.#preflight(agentId, mode === 'keys' ? 'keys' : 'send');
    if (!checked.ok) return checked;
    if (mode === 'keys') {
      const shown = promptMatches(
        terminalPromptOf(checked.listAll, checked.target as TerminalSendTarget),
        part.questions,
      );
      if (shown === 'unverified') return { ok: false, error: 'not_sendable', reason: 'prompt_unverified' };
      if (shown === 'mismatch') return { ok: false, error: 'target_changed', reason: 'prompt_mismatch' };
      const valid = checkAnswers(part.questions, answers);
      if (!valid.ok) return valid;
      const plan = planKeys(checked.target.agentType, part.questions, valid.answers);
      if (!plan.ok) return { ok: false, error: plan.error, reason: plan.reason };
      return { ok: true, checked, answers: valid.answers, groups: plan.groups };
    }
    if (!checked.readTranscript) return { ok: false, error: 'unsupported', missing: ['feature:readTranscript'] };
    const valid = checkAnswers(part.questions, answers);
    if (!valid.ok) return valid;
    const text = formatAsyncAnswer(part.questions, valid.answers);
    const textCheck = checkText(text);
    if (!textCheck.ok) return { ok: false, error: 'invalid_answer', reason: textCheck.reason };
    return { ok: true, checked, answers: valid.answers, text };
  }
  async #callIntent({
    agent,
    callId,
    answers,
    target,
  }: {
    agent: string;
    callId: string;
    answers: unknown;
    target?: string;
  }): Promise<SendAnswer<AnswerIntentResult>> {
    if (!(await this.#deps.readSendEnabled())) return { ok: false, error: 'send_disabled' };
    const question = await this.#readCallQuestion(agent, callId);
    if (!question.ok) return question;
    const started = await this.#alreadyStarted(agent, callId);
    if (started) return started;
    const plan = await this.#planCall(agent, question.part, answers);
    if (!plan.ok) return plan as SendFailure;
    if (!sameSession(question.session, plan.checked.target))
      return { ok: false, error: 'target_changed', reason: 'session_changed' };
    if (target !== undefined && target !== targetFingerprint(plan.checked.target))
      return { ok: false, error: 'target_changed', reason: 'changed_since_shown' };
    const operationId = this.#operationId();
    const digest = digestAnswers(plan.answers);
    const ticket = this.#tickets.issue({
      target: plan.checked.target,
      digest,
      operationId,
      call: { callId, mode: question.part.answerVia === 'keys' ? 'keys' : 'message' },
      questions: question.part.questions,
    });
    return { ok: true, ...ticket, operationId, preview: plan.checked.preview, digest };
  }
  /** callId の答えの確定。確かめ直し、送る前の記録の後に、keys は組を1組ずつ、message は発言を1回だけ送る。 */
  async #callConfirm(
    ticket: import('./ticket.ts').SendTicket,
    answers: unknown,
    refuse: (failure: SendRefusal) => Promise<SendFailure>,
  ): Promise<ConfirmAnswer> {
    const { operationId, target, digest, call, questions } = ticket;
    if (!call || !questions) return await refuse({ ok: false, error: 'ticket_invalid', reason: 'wrong_kind' });
    const shown = checkAnswers(questions, answers);
    if (!shown.ok || digestAnswers(shown.answers) !== digest)
      return await refuse({ ok: false, error: 'target_changed', reason: 'answer_changed' });
    const question = await this.#readCallQuestion(target.agentId, call.callId);
    if (!question.ok) return await refuse(SendService.#confirmRefusal(question));
    // digest は選択肢の id だけなので、問いの文やラベルが変わっていないかも比べる。
    if (question.part.answerVia !== call.mode || !sameQuestions(questions, question.part.questions))
      return await refuse({ ok: false, error: 'target_changed', reason: 'question_changed' });
    const started = await this.#alreadyStarted(target.agentId, call.callId);
    if (started) return started.error === 'record_unreadable' ? started : await refuse(started as SendRefusal);
    const plan = await this.#planCall(target.agentId, question.part, answers);
    if (!plan.ok) return await refuse(SendService.#confirmRefusal(plan as SendRefusal));
    const change = compareTargets(target, plan.checked.target);
    if (change) return await refuse({ ok: false, error: 'target_changed', reason: change });
    if (!sameSession(question.session, target))
      return await refuse({ ok: false, error: 'target_changed', reason: 'session_changed' });
    if (digestAnswers(plan.answers) !== digest)
      return await refuse({ ok: false, error: 'target_changed', reason: 'answer_changed' });
    const preview = plan.checked.preview;
    try {
      await this.#deps.journal.appendBefore({
        operationId,
        action: 'answer',
        mode: call.mode,
        route: target.route,
        target: {
          ...target,
          repoName: preview.repoName,
          worktreePath: preview.worktreePath,
          branch: preview.branch,
          title: preview.title,
        },
        callId: call.callId,
        questionCount: plan.answers.length,
        ...(plan.groups ? { totalGroups: plan.groups.length } : {}),
        digest,
        generation: {
          runtimeId: target.runtimeId,
          ...(target.route === 'terminal' ? { incarnationId: target.incarnationId } : {}),
        },
      });
    } catch {
      return await refuse({ ok: false, error: 'record_failed' });
    }
    // 送り始めた答えは、結果によらず二度と送らない（起動し直した後は記録の before の行から分かる）。
    this.#startedCalls.add(`${target.agentId}\u0000${call.callId}`);
    const result = plan.groups
      ? await this.#deps.adapter.answerKeys(target as TerminalSendTarget, plan.groups, this.#deps.sleep ?? realSleep)
      : target.route === 'terminal'
        ? await this.#deps.adapter.sendTerminal(target, plan.text as string, operationId)
        : await this.#deps.adapter.sendChat(target, plan.text as string, operationId, plan.checked.fence as number);
    if (result.detail.code === 'method_not_found' && result.detail.method) this.#block(target, result.detail.method);
    const recorded = await this.#deps.journal.appendAfter({ operationId, ...result });
    return {
      ok: true,
      operationId,
      ...result,
      ...(recorded ? {} : { recordWarning: 'after_record_failed' as const }),
    };
  }
  /** keys の結果不明の照会。会話の今の状態だけを読み、送り直さない。 */
  async #checkKeys(before: BeforeRecord): Promise<SendRead<SendResult>> {
    const callId = before.action === 'answer' && before.mode !== undefined ? before.callId : '';
    const read = this.#deps.readTranscript
      ? await this.#deps.readTranscript(before.target.agentId)
      : ({ ok: false, error: 'unreachable' } as const);
    if (!read.ok)
      return read.error === 'unreachable' || read.error === 'read_failed'
        ? { ok: false, error: 'unreachable' }
        : { ok: true, outcome: 'unknown', detail: { code: read.error } };
    // 別のセッションの会話の同じ callId は、送った質問ではない。
    const found = sameSession(read.session, before.target) ? findCallQuestion(read.messages, callId) : null;
    if (found === null) return { ok: true, outcome: 'unknown', detail: { code: 'question_not_found' } };
    if (found.state === 'failed') return { ok: true, outcome: 'refused', detail: { code: 'cancelled' } };
    return {
      ok: true,
      outcome: 'unknown',
      detail: { code: found.state === 'answered' ? 'resolved_unverified' : 'prompt_pending' },
    };
  }
  /** 承認への答えの意図。送らずに確かめ、使い捨ての票を出す。常に許可・常に拒否は confirmPersistent が true のときだけ。 */
  async approvalIntent({
    agent,
    prompt,
    optionId,
    confirmPersistent,
    target,
  }: {
    agent: string;
    prompt: { itemId: string; revision: number };
    optionId: unknown;
    confirmPersistent?: unknown;
    target?: string;
  }): Promise<SendAnswer<ApprovalIntentResult>> {
    if (!(await this.#deps.readSendEnabled())) return { ok: false, error: 'send_disabled' };
    const checked = await this.#preflight(agent, 'approval');
    if (!checked.ok) return checked;
    if (target !== undefined && target !== targetFingerprint(checked.target))
      return { ok: false, error: 'target_changed', reason: 'changed_since_shown' };
    const approval = await this.#readPendingApproval(checked.target as ChatSendTarget, prompt);
    if (!approval.ok) return approval;
    const valid = checkOption(approval, optionId, confirmPersistent);
    if (!valid.ok) return valid;
    const operationId = this.#operationId();
    const digest = digestOption(valid.option.id);
    const ticket = this.#tickets.issue({
      target: checked.target,
      digest,
      operationId,
      approval: {
        itemId: prompt.itemId,
        revision: prompt.revision,
        optionId: valid.option.id,
        intent: valid.option.intent,
      },
    });
    return { ok: true, ...ticket, operationId, preview: checked.preview, digest, intent: valid.option.intent };
  }
  /** 承認への答えの確定。確かめ直してから、送る前の記録の後に agentSession.respondToApproval を1回だけ送る。 */
  async approvalConfirm({ ticket, optionId }: { ticket: string; optionId: unknown }): Promise<ConfirmAnswer> {
    if (this.#busy) return this.#refuse({ ok: false, error: 'busy' });
    this.#busy = true;
    let activeId: string | undefined;
    try {
      if (!(await this.#deps.readSendEnabled())) return await this.#refuse({ ok: false, error: 'send_disabled' });
      const taken = this.#tickets.take(ticket);
      if (!taken.ok) return await this.#refuse({ ok: false, error: 'ticket_invalid', reason: taken.reason });
      const { operationId, target, digest, approval } = taken.value;
      // take と印の間に await を置かない。照会はこの印か未使用の票を必ず見る。
      this.#inFlight.add(operationId);
      activeId = operationId;
      const refuse = (failure: SendRefusal) => this.#refuse(failure, operationId, target.agentId);
      if (!approval || taken.value.prompt || target.route !== 'chat')
        return await refuse({ ok: false, error: 'ticket_invalid', reason: 'wrong_kind' });
      if (optionId !== approval.optionId)
        return await refuse({ ok: false, error: 'target_changed', reason: 'answer_changed' });
      const checked = await this.#preflight(target.agentId, 'approval');
      if (!checked.ok) return await refuse(SendService.#confirmRefusal(checked));
      const change = compareTargets(target, checked.target);
      if (change) return await refuse({ ok: false, error: 'target_changed', reason: change });
      const prompt = { itemId: approval.itemId, revision: approval.revision };
      const current = await this.#readPendingApproval(target, prompt);
      if (!current.ok) return await refuse(current);
      // 常に許可の確かめは意図で済ませた。ここでは今の選択肢にあり、intent が意図のときと同じことを確かめる。
      const valid = checkOption(current, approval.optionId, true);
      if (!valid.ok) return await refuse(valid);
      if (valid.option.intent !== approval.intent)
        return await refuse({ ok: false, error: 'target_changed', reason: 'question_changed' });
      try {
        await this.#deps.journal.appendBefore({
          operationId,
          action: 'approval',
          route: 'chat',
          target: {
            ...target,
            repoName: checked.preview.repoName,
            worktreePath: checked.preview.worktreePath,
            branch: checked.preview.branch,
            title: checked.preview.title,
          },
          prompt,
          intent: approval.intent,
          digest,
          generation: { runtimeId: target.runtimeId },
        });
      } catch {
        return await refuse({ ok: false, error: 'record_failed' });
      }
      const result = await this.#deps.adapter.answerApproval(
        target,
        prompt,
        approval.optionId,
        operationId,
        current.fence,
      );
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
