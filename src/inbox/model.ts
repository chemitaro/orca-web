import type { Connection, SourceStatus, StateDocument } from '../state/model.ts';

export const INBOX_SCHEMA = 'orca-web.inbox/v1';

/** 読む口で本文を捨てた、統括あての未読の連絡。 */
export interface InboxMessage {
  id: string;
  runId: string;
  type: string;
  toHandle: string;
  createdAt: string | null;
  subject: string | null;
  dispatchId: string | null;
  taskId: string | null;
  outcome: string | null;
  prUrl: string | null;
}

export interface InboxGate {
  id: string;
  taskId: string | null;
  status: 'pending';
  createdAt: string | null;
  question: string | null;
}

export interface MailStatus {
  fetchedAt: string | null;
  lastSuccessAt: string | null;
  stale: boolean;
  error: { kind: string; message?: string } | null;
  runsRead: number;
  runsFailed: number;
}

/** 各 Run の最後に読めた値と、連絡全体の鮮度。 */
export interface MailSnapshot extends MailStatus {
  messages: readonly InboxMessage[];
  gates: readonly InboxGate[];
}

export interface InboxInputs {
  state: StateDocument;
  mail: MailSnapshot;
  lastWords: ReadonlyMap<string, string>;
}

export interface BuildInboxInput extends InboxInputs {
  now: number;
  stallMs: number;
  project: string | null;
}

export type InboxStage = 'needs_action' | 'stalled' | 'running' | 'finished' | 'unknown';
export type InboxReason =
  | 'blocked'
  | 'waiting'
  | 'question'
  | 'decision_gate'
  | 'gate'
  | 'no_output'
  | 'terminal_ended'
  | 'working'
  | 'done'
  | 'sleeping'
  | 'ci_failed'
  | 'merge_pending';
export type InboxMissing = 'state_missing' | 'state_unknown' | 'pr_state_missing';

export interface InboxProject {
  id: string;
  name: string;
}

export interface InboxItem {
  id: string;
  kind: 'agent' | 'question' | 'gate' | 'pr';
  stage: InboxStage;
  reasons: InboxReason[];
  project: InboxProject | null;
  worktreeId: string | null;
  issue: string | null;
  agentType: string | null;
  since: string | null;
  lastWords: string | null;
  links: {
    detail: string | null;
    open: { worktreeId: string; agentId: string } | null;
    pr: string | null;
  };
  missing: InboxMissing[];
  mail: Pick<InboxMessage, 'id' | 'type' | 'createdAt' | 'subject'>[];
}

export interface InboxDocument {
  schema: typeof INBOX_SCHEMA;
  generatedAt: string;
  stale: boolean;
  connection: Connection;
  stallMinutes: number;
  sources: {
    state: {
      stale: boolean;
      sources: Record<keyof StateDocument['sources'], Pick<SourceStatus, 'lastSuccessAt' | 'stale' | 'error'>>;
    };
    mail: MailStatus;
  };
  projects: (InboxProject & { count: number })[];
  stages: { stage: InboxStage; collapsed: boolean; items: InboxItem[] }[];
}
