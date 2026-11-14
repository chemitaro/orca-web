// 送信前の耐久記録と、送信後・照会の結果。
import { chmod, mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SendResult } from '../orca/send.ts';
import type { SendPreview, SendTarget } from './model.ts';

const SCHEMA = 'orca-web.send-record/v1';
interface RowBase {
  schema: typeof SCHEMA;
  operationId: string;
  at: string;
}
export interface BeforeInput {
  operationId: string;
  route: SendTarget['route'];
  target: SendTarget & Pick<SendPreview, 'repoName' | 'worktreePath' | 'branch' | 'title'>;
  text: string;
  digest: string;
  generation: { runtimeId: string; incarnationId?: string };
}
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
      typeof row.text === 'string' &&
      typeof row.digest === 'string' &&
      (row.route === 'terminal' || row.route === 'chat')
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
  async read(operationId: string): Promise<SendRecord | null> {
    let raw: string;
    try {
      raw = await readFile(path.join(this.#dir, 'sends.jsonl'), 'utf8');
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
        !this.#memory.some((row) => row.operationId === operationId)
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
