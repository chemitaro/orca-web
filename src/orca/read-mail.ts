import type { InboxGate, InboxMessage } from '../inbox/model.ts';
import { isoFromText } from '../state/normalize.ts';
import type { ReadOnlyOrcaCli } from './orca-cli.ts';
import type { SourceRead } from './read-state.ts';

export interface MailReader {
  readRunMail(runId: string): Promise<SourceRead<InboxMessage[]>>;
  readGates(runId: string): Promise<SourceRead<InboxGate[]>>;
}

export function createMailReader(cli: ReadOnlyOrcaCli): MailReader {
  return {
    async readRunMail(runId) {
      const o = await cli.json<unknown>(['orchestration', 'check', '--peek', '--terminal', `run:${runId}`, '--full']);
      if (!o.ok) return { ok: false, error: { kind: o.kind, message: 'mail read failed' } };
      const result = record(o.result);
      if (!result || !Array.isArray(result.messages)) return invalid();
      const data: InboxMessage[] = [];
      for (const value of result.messages) {
        const r = record(value);
        if (!r || !str(r.id) || !str(r.type) || !str(r.run_id) || !str(r.to_handle)) return invalid();
        if (r.to_handle !== `run:${runId}`) continue;
        let payload = r.payload;
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload);
          } catch {
            return invalid();
          }
        }
        const p = record(payload);
        data.push({
          id: str(r.id) as string,
          runId: str(r.run_id) as string,
          type: str(r.type) as string,
          toHandle: str(r.to_handle) as string,
          createdAt: isoFromText(str(r.created_at) ?? '') ?? null,
          subject: str(r.subject)?.slice(0, 200) ?? null,
          dispatchId: str(p?.dispatchId),
          taskId: str(p?.taskId),
          outcome: str(p?.outcome),
          prUrl:
            r.type === 'worker_done'
              ? (str(r.body)?.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+\b/)?.[0] ??
                null)
              : null,
        });
      }
      return { ok: true, data, truncated: false };
    },
    async readGates(runId) {
      const o = await cli.json<unknown>(['orchestration', 'gate-list', '--run', runId, '--full']);
      if (!o.ok) return { ok: false, error: { kind: o.kind, message: 'gate read failed' } };
      const result = record(o.result);
      if (!result || !Array.isArray(result.gates)) return invalid();
      const data: InboxGate[] = [];
      for (const value of result.gates) {
        const r = record(value);
        if (!r || !str(r.id) || !str(r.status)) return invalid();
        if (r.status !== 'pending') continue;
        data.push({
          id: str(r.id) as string,
          taskId: str(r.taskId) ?? str(r.task_id),
          status: 'pending',
          createdAt: isoFromText(str(r.createdAt) ?? str(r.created_at) ?? '') ?? null,
          question: str(r.question)?.slice(0, 200) ?? null,
        });
      }
      return { ok: true, data, truncated: false };
    },
  };
}

type Rec = Record<string, unknown>;
const record = (v: unknown): Rec | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const invalid = (): { ok: false; error: { kind: string; message: string } } => ({
  ok: false,
  error: { kind: 'invalid-shape', message: 'mail: unexpected response shape' },
});
