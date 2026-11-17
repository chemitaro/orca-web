// 承認の答えの選択肢の検査と digest。純な関数。
// 常に許可・常に拒否（allow_always・reject_always）は、後の確認を省くので confirmPersistent が true のときだけ通す（R-04）。
import { createHash } from 'node:crypto';
import { canonicalize } from '../orca/send.ts';
import type { ApprovalOptionView } from '../transcript/normalize.ts';

/** Orca の RespondToApprovalParams の optionId の上限。 */
export const MAX_OPTION_ID_CHARS = 1024;

export type OptionReason = 'not_answerable' | 'invalid_option' | 'unknown_option' | 'persistent_unconfirmed';

export type OptionCheck =
  | { ok: true; option: ApprovalOptionView }
  | { ok: false; error: 'invalid_answer'; reason: OptionReason };

const PERSISTENT_INTENTS: ReadonlySet<string> = new Set(['allow_always', 'reject_always']);

export const isPersistent = (option: Pick<ApprovalOptionView, 'intent'>): boolean =>
  option.intent !== null && PERSISTENT_INTENTS.has(option.intent);

export function checkOption(
  approval: { options: readonly ApprovalOptionView[]; answerable: boolean },
  optionId: unknown,
  confirmPersistent: unknown,
): OptionCheck {
  if (!approval.answerable) return { ok: false, error: 'invalid_answer', reason: 'not_answerable' };
  if (typeof optionId !== 'string' || optionId.length === 0 || optionId.length > MAX_OPTION_ID_CHARS)
    return { ok: false, error: 'invalid_answer', reason: 'invalid_option' };
  const option = approval.options.find((o) => o.id === optionId);
  if (!option) return { ok: false, error: 'invalid_answer', reason: 'unknown_option' };
  if (isPersistent(option) && confirmPersistent !== true)
    return { ok: false, error: 'invalid_answer', reason: 'persistent_unconfirmed' };
  return { ok: true, option };
}

/** 記録と照会で比べる選んだ選択肢の digest。選択肢の id は記録に書かない。 */
export function digestOption(optionId: string): string {
  return createHash('sha256').update(canonicalize({ optionId })).digest('hex');
}
