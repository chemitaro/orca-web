// 本文の検査と、確認から確定までの短期の票。
import { createHash, randomBytes } from 'node:crypto';
import type { ApprovalIntent, QuestionView } from '../transcript/normalize.ts';
import type { SendTarget } from './model.ts';
export type TextCheck =
  | { ok: true }
  | { ok: false; error: 'invalid_text'; reason: 'not_string' | 'empty' | 'too_large' | 'control_character' };
export function checkText(text: unknown): TextCheck {
  if (typeof text !== 'string') return { ok: false, error: 'invalid_text', reason: 'not_string' };
  if (!text.trim()) return { ok: false, error: 'invalid_text', reason: 'empty' };
  if (Buffer.byteLength(text, 'utf8') > 16384) return { ok: false, error: 'invalid_text', reason: 'too_large' };
  for (const character of text) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10) || (code >= 127 && code <= 159)) {
      return { ok: false, error: 'invalid_text', reason: 'control_character' };
    }
  }
  return { ok: true };
}

export function digestText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
export function newOperationId(now: number = Date.now(), random: (size: number) => Uint8Array = randomBytes): string {
  const stamp = String(now).padStart(13, '0');
  const bytes = random(16);
  if (!/^\d{13}$/.test(stamp) || bytes.length !== 16) throw new Error('invalid operation id source');
  return `${stamp}-${Buffer.from(bytes).toString('hex')}`;
}

export interface TicketInput {
  target: SendTarget;
  digest: string;
  operationId: string;
  /** 答えの票だけが持つ。答える質問の位置と、意図で確かめた問い（確定で digest を比べるため）。 */
  prompt?: { itemId: string; revision: number };
  /** callId で指す答えの票だけが持つ。keys は端末のキーの組、message は後の発言。キーの列や文は持たず、確定で作り直す。 */
  call?: { callId: string; mode: 'keys' | 'message' };
  questions?: QuestionView[];
  /** 承認の答えの票だけが持つ。答える承認の位置と、意図で確かめた選択肢とその intent。 */
  approval?: { itemId: string; revision: number; optionId: string; intent: ApprovalIntent | null };
}
export interface SendTicket extends TicketInput {
  expiresAt: number;
}
export type TicketTake = { ok: true; value: SendTicket } | { ok: false; reason: 'unknown' | 'expired' };

export class TicketStore {
  readonly #now: () => number;
  readonly #random: (size: number) => Uint8Array;
  readonly #tickets = new Map<string, SendTicket>();

  constructor(options: { now?: () => number; random?: (size: number) => Uint8Array } = {}) {
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? randomBytes;
  }

  issue(input: TicketInput): { ticket: string; expiresAt: number } {
    const bytes = this.#random(32);
    if (bytes.length !== 32) throw new Error('invalid ticket randomness');
    const ticket = Buffer.from(bytes).toString('base64url');
    if (this.#tickets.has(ticket)) throw new Error('duplicate ticket randomness');
    const expiresAt = this.#now() + 60000;
    this.#tickets.set(ticket, {
      ...input,
      target: { ...input.target },
      ...(input.prompt ? { prompt: { ...input.prompt } } : {}),
      ...(input.call ? { call: { ...input.call } } : {}),
      ...(input.questions ? { questions: structuredClone(input.questions) } : {}),
      ...(input.approval ? { approval: { ...input.approval } } : {}),
      expiresAt,
    });
    if (this.#tickets.size > 32) {
      const oldest = this.#tickets.keys().next();
      if (!oldest.done) this.#tickets.delete(oldest.value);
    }
    return { ticket, expiresAt };
  }
  cancelByOperation(operationId: string): boolean {
    let removed = false;
    for (const [ticket, value] of this.#tickets) {
      if (value.operationId === operationId) {
        this.#tickets.delete(ticket);
        removed = true;
      }
    }
    return removed;
  }

  take(ticket: string): TicketTake {
    const value = this.#tickets.get(ticket);
    if (!value) return { ok: false, reason: 'unknown' };
    this.#tickets.delete(ticket);
    if (this.#now() >= value.expiresAt) return { ok: false, reason: 'expired' };
    return { ok: true, value };
  }
}
