// 送信前の耐久記録と、送信後・照会の結果。
import { chmod, mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SendResult } from '../orca/send.ts';
import type { ApprovalIntent } from '../transcript/normalize.ts';
import type { SendPreview, SendTarget } from './model.ts';

const SCHEMA = 'orca-web.send-record/v1';
interface RowBase {
  schema: typeof SCHEMA;
  operationId: string;
  at: string;
}
interface BeforeBase {
  operationId: string;
  route: SendTarget['route'];
  target: SendTarget & Pick<SendPreview, 'repoName' | 'worktreePath' | 'branch' | 'title'>;
  digest: string;
  generation: { runtimeId: string; incarnationId?: string };
}
/** 今の送信の before。本文 text を持つ。 */
export interface SendBeforeInput extends BeforeBase {
  text: string;
  action?: never;
}
/** 質問への答えの before。答えの中身は書かず、digest と問いの数と質問の位置だけを持つ。 */
export interface AnswerBeforeInput extends BeforeBase {
  action: 'answer';
  route: 'chat';
  prompt: { itemId: string; revision: number };
  questionCount: number;
  mode?: never;
  text?: never;
}
/**
 * 端末の質問（keys）と後の発言の質問（message）への答えの before。答えの中身（ラベル、番号、その他の文、キーの列、発言の文）は書かず、
 * callId と問いの数と digest、keys は組の数だけを持つ。
 */
export interface CallAnswerBeforeInput extends BeforeBase {
  action: 'answer';
  mode: 'keys' | 'message';
  callId: string;
  questionCount: number;
  totalGroups?: number;
  prompt?: never;
  text?: never;
}
/** 承認への答えの before。選択肢の id・ラベルと承認の中身は書かず、digest と intent と承認の位置だけを持つ。 */
export interface ApprovalBeforeInput extends BeforeBase {
  action: 'approval';
  route: 'chat';
  prompt: { itemId: string; revision: number };
  intent: ApprovalIntent | null;
  text?: never;
}
export type BeforeInput = SendBeforeInput | AnswerBeforeInput | CallAnswerBeforeInput | ApprovalBeforeInput;
export type BeforeRecord = RowBase & BeforeInput & { kind: 'before' };
export type ResultInput = SendResult & { operationId: string };
export type ResultRecord = RowBase & SendResult & { kind: 'after' | 'check' };
export interface RefusedInput {
  operationId: string;
  reason:
    | 'ticket_invalid'
    | 'target_changed'
    | 'not_sendable'
    | 'send_disabled'
    | 'busy'
    | 'unsupported'
    | 'unreachable'
    | 'record_failed'
    | 'unknown_shape';
  change?: string;
  notSendableReason?: string;
  agentId?: string;
}
export type RefusedRecord = RowBase & RefusedInput & { kind: 'refused' };
type JournalRow = BeforeRecord | ResultRecord | RefusedRecord;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function isCallAnswerBefore(row: Record<string, unknown>): boolean {
  if (row.text !== undefined || row.prompt !== undefined) return false;
  if (typeof row.callId !== 'string' || row.callId.length === 0 || !Number.isInteger(row.questionCount)) return false;
  if (row.mode === 'keys') return row.route === 'terminal' && Number.isInteger(row.totalGroups);
  return row.mode === 'message' && row.totalGroups === undefined;
}
function isAnswerBefore(row: Record<string, unknown>): boolean {
  if (row.action === 'answer' && row.mode !== undefined) return isCallAnswerBefore(row);
  const prompt = row.prompt;
  return (
    row.action === 'answer' &&
    row.route === 'chat' &&
    object(prompt) &&
    typeof prompt.itemId === 'string' &&
    Number.isInteger(prompt.revision) &&
    Number.isInteger(row.questionCount)
  );
}
const INTENTS: readonly unknown[] = ['allow_once', 'allow_always', 'reject_once', 'reject_always', null];
function isApprovalBefore(row: Record<string, unknown>): boolean {
  const prompt = row.prompt;
  return (
    row.action === 'approval' &&
    row.route === 'chat' &&
    object(prompt) &&
    typeof prompt.itemId === 'string' &&
    Number.isInteger(prompt.revision) &&
    INTENTS.includes(row.intent)
  );
}
function parseRow(line: string): JournalRow | null {
  try {
    const row: unknown = JSON.parse(line);
    if (
      !object(row) ||
      row.schema !== SCHEMA ||
      typeof row.operationId !== 'string' ||
      typeof row.at !== 'string' ||
      !Number.isFinite(Date.parse(row.at))
    )
      return null;
    if (
      row.kind === 'before' &&
      object(row.target) &&
      object(row.generation) &&
      typeof row.digest === 'string' &&
      (row.route === 'terminal' || row.route === 'chat') &&
      (row.action === undefined
        ? typeof row.text === 'string'
        : row.action === 'approval'
          ? isApprovalBefore(row)
          : isAnswerBefore(row))
    )
      return row as unknown as BeforeRecord;
    if (
      (row.kind === 'after' || row.kind === 'check') &&
      ['refused', 'unknown', 'accepted', 'submitted', 'input_accepted'].includes(String(row.outcome)) &&
      object(row.detail)
    )
      return row as unknown as ResultRecord;
    if (row.kind === 'refused' && typeof row.reason === 'string') return row as unknown as RefusedRecord;
  } catch {
    /* 途中で切れた行や壊れた行は後の行を妨げない。 */
  }
  return null;
}
export interface SendRecord extends SendResult {
  operationId: string;
  before: BeforeRecord | null;
  after: ResultRecord | null;
  checks: ResultRecord[];
  refused: RefusedRecord | null;
}
export interface JournalIo {
  open: (
    ...args: Parameters<typeof open>
  ) => Promise<
    Pick<import('node:fs/promises').FileHandle, 'chmod' | 'stat' | 'read' | 'writeFile' | 'datasync' | 'close'>
  >;
}
export class SendJournal {
  readonly #dir: string;
  readonly #memory: (ResultRecord | RefusedRecord)[] = [];
  readonly #io: JournalIo;
  constructor(dir: string, io: JournalIo = { open }) {
    this.#dir = dir;
    this.#io = io;
  }
  async appendBefore(input: BeforeInput): Promise<void> {
    await this.#append({ ...input, schema: SCHEMA, kind: 'before', at: new Date().toISOString() }, true);
  }
  async appendRefused(input: RefusedInput): Promise<boolean> {
    const { operationId, reason, change, notSendableReason, agentId } = input;
    const row: RefusedRecord = {
      schema: SCHEMA,
      kind: 'refused',
      at: new Date().toISOString(),
      operationId,
      reason,
      ...(change === undefined ? {} : { change }),
      ...(notSendableReason === undefined ? {} : { notSendableReason }),
      ...(agentId === undefined ? {} : { agentId }),
    };
    this.#memory.push(row);
    try {
      await this.#append(row, false);
      return true;
    } catch {
      return false;
    }
  }
  async appendAfter(input: ResultInput): Promise<boolean> {
    return this.#appendResult('after', input);
  }
  async appendCheck(input: ResultInput): Promise<boolean> {
    return this.#appendResult('check', input);
  }
  async #appendResult(kind: 'after' | 'check', input: ResultInput): Promise<boolean> {
    const row: ResultRecord = structuredClone({ ...input, schema: SCHEMA, kind, at: new Date().toISOString() });
    this.#memory.push(row);
    try {
      await this.#append(row, false);
      return true;
    } catch {
      return false;
    }
  }
  async #append(row: JournalRow, durable: boolean): Promise<void> {
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
    await chmod(this.#dir, 0o700);
    const file = await this.#io.open(path.join(this.#dir, 'sends.jsonl'), 'a+', 0o600);
    try {
      await file.chmod(0o600);
      const { size } = await file.stat();
      let separator = '';
      if (size > 0) {
        const tail = Buffer.alloc(1);
        const { bytesRead } = await file.read(tail, 0, 1, size - 1);
        if (bytesRead !== 1 || tail[0] !== 0x0a) separator = '\n';
      }
      // 切れた行と今回の記録を分け、before では区切りも一緒に耐久化する。
      await file.writeFile(`${separator}${JSON.stringify(row)}\n`);
      if (durable) await file.datasync();
    } finally {
      await file.close();
    }
  }
  /** 同じエージェントの同じ callId に、送り始めた答え（before の行）があるか。記録が読めなければ投げる。 */
  async hasAnswer(agentId: string, callId: string): Promise<boolean> {
    let raw: string;
    try {
      raw = await readFile(path.join(this.#dir, 'sends.jsonl'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
    return raw
      .split('\n')
      .map(parseRow)
      .some(
        (row) =>
          row?.kind === 'before' &&
          row.action === 'answer' &&
          row.mode !== undefined &&
          row.callId === callId &&
          row.target.agentId === agentId,
      );
  }
  async read(operationId: string): Promise<SendRecord | null> {
    let raw: string;
    try {
      raw = await readFile(path.join(this.#dir, 'sends.jsonl'), 'utf8');
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
        !this.#memory.some(
          (row) => row.operationId === operationId && (row.kind !== 'check' || row.outcome !== 'unknown'),
        )
      )
        throw error;
      raw = '';
    }
    const rows = raw
      .trim()
      .split('\n')
      .map(parseRow)
      .filter((row): row is JournalRow => row !== null && row.operationId === operationId);
    const memory = this.#memory.filter((row) => row.operationId === operationId);
    for (const row of memory) {
      const key = JSON.stringify(row);
      const index = rows.findIndex((disk) => JSON.stringify(disk) === key);
      if (index >= 0) rows.splice(index, 1);
    }
    rows.push(...structuredClone(memory));
    if (!rows.length) return null;
    let before: BeforeRecord | null = null;
    let after: ResultRecord | null = null;
    const checks: ResultRecord[] = [];
    let refused: RefusedRecord | null = null;
    for (const row of rows) {
      if (row.kind === 'before') before = row;
      else if (row.kind === 'after') after = row;
      else if (row.kind === 'check') checks.push(row);
      else if (row.kind === 'refused') refused = row;
    }
    const last = checks.findLast((row) => row.outcome !== 'unknown');
    const result: SendResult = last
      ? last
      : (after ??
        (before
          ? { outcome: 'unknown', detail: { code: 'no_after_record' } }
          : { outcome: 'refused', detail: { code: refused?.reason ?? 'not_sent' } }));
    return { operationId, before, after, checks, refused, outcome: result.outcome, detail: result.detail };
  }
}
