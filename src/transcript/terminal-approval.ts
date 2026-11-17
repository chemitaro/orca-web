// 端末のエージェントの待っている許可の確認（タブの agentStatus の state・interactivePrompt・stateStartedAt）の読みと同一性。純な関数。
// 会話の正規化と、送る前・送る直前の確かめと照会が同じ値を使う。送信の層はこのファイルを import してよい。逆はしない。
// Orca v1.4.261 の次を写す（値も同じ）：
// - src/shared/agent-status/contracts/agent-pending-prompt.ts（readAgentPromptAnswers：blocked・waiting の行の選択肢 allow_once・reject_once）
// - src/shared/native-chat/input/approvals/native-chat-approval-envelope.ts（parseNativeChatApprovalEnvelope）
import { createHash } from 'node:crypto';

/** 承認の道具の名前とラベルの上限。normalize.ts も使う。 */
export const MAX_APPROVAL_LABEL_CHARS = 500;
/** 承認の説明（端末では要約）の上限。normalize.ts も使う。 */
export const MAX_APPROVAL_DESCRIPTION_CHARS = 2_000;

/** 端末の承認の選択肢（Orca の readAgentPromptAnswers と同じ id とラベル）。型は ApprovalOptionView と同じ形。 */
export const TERMINAL_APPROVAL_OPTIONS: readonly {
  readonly id: 'allow_once' | 'reject_once';
  readonly label: string;
  readonly description: null;
  readonly intent: 'allow_once' | 'reject_once';
}[] = Object.freeze([
  Object.freeze({ id: 'allow_once', label: 'Allow once', description: null, intent: 'allow_once' } as const),
  Object.freeze({ id: 'reject_once', label: 'Reject', description: null, intent: 'reject_once' } as const),
]);

/** タブの agentStatus のうち、許可の確認の読みに使う3つの値（手を加えない）。 */
export interface TerminalApprovalStatus {
  state: unknown;
  interactivePrompt: unknown;
  stateStartedAt: unknown;
}

export type TerminalApprovalRead =
  | { kind: 'unverified' }
  | { kind: 'not_waiting' }
  | { kind: 'other' }
  | { kind: 'approval'; promptId: string; tool: string; summary: string | null; truncated: boolean };

export type TerminalApprovalMatch = 'match' | 'unverified' | 'gone' | 'mismatch' | 'truncated';

const WAITING_STATES: ReadonlySet<unknown> = new Set(['blocked', 'waiting']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 許可の確認の同一性。'ta_' と、[interactivePrompt, startedAt] の JSON の sha256 の16進の先頭20字。 */
export function terminalApprovalId(interactivePrompt: string, stateStartedAt: unknown): string {
  const startedAt = typeof stateStartedAt === 'number' || typeof stateStartedAt === 'string' ? stateStartedAt : null;
  const digest = createHash('sha256')
    .update(JSON.stringify([interactivePrompt, startedAt]))
    .digest('hex');
  return `ta_${digest.slice(0, 20)}`;
}

/** タブの agentStatus から、待っている許可の確認を読む（parseNativeChatApprovalEnvelope と同じ規則）。 */
export function readTerminalApproval(status: TerminalApprovalStatus | null): TerminalApprovalRead {
  if (!isRecord(status)) return { kind: 'unverified' };
  if (!WAITING_STATES.has(status.state)) return { kind: 'not_waiting' };
  const prompt = status.interactivePrompt;
  if (typeof prompt !== 'string' || prompt.length === 0) return { kind: 'unverified' };
  let value: unknown;
  try {
    value = JSON.parse(prompt);
  } catch {
    return { kind: 'other' };
  }
  if (!isRecord(value) || !isRecord(value.approval)) return { kind: 'other' };
  const { tool, summary } = value.approval;
  if (typeof tool !== 'string' || tool.length === 0) return { kind: 'other' };
  const shownSummary = typeof summary === 'string' && summary.length > 0 ? summary : null;
  return {
    kind: 'approval',
    promptId: terminalApprovalId(prompt, status.stateStartedAt),
    tool,
    summary: shownSummary,
    truncated:
      tool.length > MAX_APPROVAL_LABEL_CHARS ||
      (shownSummary !== null && shownSummary.length > MAX_APPROVAL_DESCRIPTION_CHARS),
  };
}

/** 端末が promptId の許可の確認をまだ出しているか。 */
export function matchTerminalApproval(status: TerminalApprovalStatus | null, promptId: string): TerminalApprovalMatch {
  const read = readTerminalApproval(status);
  if (read.kind === 'unverified') return 'unverified';
  if (read.kind === 'not_waiting') return 'gone';
  if (read.kind === 'other' || read.promptId !== promptId) return 'mismatch';
  return read.truncated ? 'truncated' : 'match';
}
