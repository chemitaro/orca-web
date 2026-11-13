import type { AgentState } from '../state/model.ts';
import type { BuildInboxInput, InboxDocument, InboxItem, InboxMessage, InboxStage } from './model.ts';
import { INBOX_SCHEMA } from './model.ts';

const STAGES: readonly InboxStage[] = ['needs_action', 'stalled', 'running', 'unknown', 'finished'];

function oneLine(value: string | null | undefined): string | null {
  return value == null ? null : value.replace(/\s+/gu, ' ').trim().slice(0, 200);
}

/** 候補の順で最初に現れる Issue を、受け箱と Run の木で同じ表記にする。 */
export function findIssue(values: readonly (string | null | undefined)[]): string | null {
  const issue = values.map((value) => value?.match(/iss-(\d+)/)?.[1]).find((value) => value !== undefined);
  return issue === undefined ? null : `iss-${issue.padStart(5, '0')}`;
}

function location(input: BuildInboxInput, worktreeId: string | null, taskId: string | null) {
  const worktree = input.state.worktrees.find((entry) => entry.id === worktreeId);
  const repo = input.state.repos.find((entry) => entry.id === worktree?.repoId);
  const task = input.state.tasks.find((entry) => entry.id === taskId);
  const issue = findIssue([worktree?.branch.value, worktree?.displayName.value, task?.title.value]);
  return {
    project: repo?.displayName.value != null ? { id: repo.id, name: repo.displayName.value } : null,
    worktreeId,
    issue,
  };
}

function linkedAgent(input: BuildInboxInput, dispatchId: string | null): AgentState | undefined {
  if (dispatchId === null) return undefined;
  const direct = input.state.agents.find((agent) => agent.worker?.dispatchId === dispatchId);
  if (direct) return direct;
  const worker = input.state.workers.find((worker) => worker.dispatchId === dispatchId);
  return worker?.terminalHandle == null
    ? undefined
    : input.state.agents.find((agent) => agent.terminalHandle === worker.terminalHandle);
}

function mailSummary(message: InboxMessage): InboxItem['mail'][number] {
  return {
    id: message.id,
    type: message.type,
    createdAt: message.createdAt,
    subject: message.subject?.slice(0, 200) ?? null,
  };
}

function agentItem(agent: AgentState, input: BuildInboxInput): InboxItem {
  const taskId =
    agent.worker?.taskId ??
    input.state.workers.find((worker) => linkedAgent(input, worker.dispatchId)?.id === agent.id)?.taskId ??
    null;
  const item: InboxItem = {
    id: `agent:${agent.id}`,
    kind: 'agent',
    stage: 'unknown',
    reasons: [],
    ...location(input, agent.worktreeId, taskId),
    agentType: agent.agentType.value,
    since: agent.stateStartedAt.value,
    lastWords: oneLine(input.lastWords.get(agent.id)),
    links: {
      detail: `/embed/agent?id=${encodeURIComponent(agent.id)}`,
      open: agent.kind === 'untabbed' ? null : { worktreeId: agent.worktreeId, agentId: agent.id },
      pr: null,
    },
    missing: [],
    mail: [],
  };
  if (agent.state.value === 'blocked' || agent.state.value === 'waiting') {
    item.reasons.push(agent.state.value);
  }
  for (const type of ['question', 'decision_gate'] as const) {
    const messages = input.mail.messages.filter(
      (message) => message.type === type && linkedAgent(input, message.dispatchId)?.id === agent.id,
    );
    if (messages.length > 0) item.reasons.push(type);
    item.mail.push(...messages.map(mailSummary));
  }
  const hasGate = input.mail.gates.some(
    (gate) =>
      gate.taskId !== null &&
      input.state.workers.some(
        (worker) => worker.taskId === gate.taskId && linkedAgent(input, worker.dispatchId)?.id === agent.id,
      ),
  );
  if (hasGate) item.reasons.push('gate');
  if (item.reasons.length > 0) {
    item.stage = 'needs_action';
    return item;
  }
  if (
    agent.state.value === 'working' &&
    agent.lastOutputAt.value !== null &&
    input.now - Date.parse(agent.lastOutputAt.value) >= input.stallMs
  ) {
    item.reasons.push('no_output');
  }
  if (
    agent.state.value !== 'done' &&
    agent.terminal.value !== null &&
    !['attached', 'awaiting-restore'].includes(agent.terminal.value)
  ) {
    item.reasons.push('terminal_ended');
  }
  if (item.reasons.length > 0) {
    item.stage = 'stalled';
  } else if (agent.state.value === 'working') {
    item.stage = 'running';
    item.reasons.push('working');
  } else if (agent.state.value === 'done') {
    item.stage = 'finished';
    item.reasons.push('done');
  } else if (agent.state.value === null && agent.terminal.value === 'awaiting-restore') {
    item.stage = 'finished';
    item.reasons.push('sleeping');
  } else {
    item.missing.push(agent.state.value === null ? 'state_missing' : 'state_unknown');
  }
  return item;
}

function unlinkedItems(input: BuildInboxInput): InboxItem[] {
  const items: InboxItem[] = [];
  for (const message of input.mail.messages) {
    if (message.type !== 'question' && message.type !== 'decision_gate') continue;
    if (linkedAgent(input, message.dispatchId)) continue;
    const worker = input.state.workers.find((worker) => worker.dispatchId === message.dispatchId);
    items.push({
      id: `question:${message.id}`,
      kind: 'question',
      stage: 'needs_action',
      reasons: [message.type],
      ...location(input, worker?.worktreeId.value ?? null, message.taskId ?? worker?.taskId ?? null),
      agentType: null,
      since: message.createdAt,
      lastWords: oneLine(message.subject),
      links: { detail: null, open: null, pr: null },
      missing: [],
      mail: [mailSummary(message)],
    });
  }
  for (const gate of input.mail.gates) {
    const workers = input.state.workers.filter((worker) => gate.taskId !== null && worker.taskId === gate.taskId);
    if (workers.some((worker) => linkedAgent(input, worker.dispatchId))) continue;
    items.push({
      id: `gate:${gate.id}`,
      kind: 'gate',
      stage: 'needs_action',
      reasons: ['gate'],
      ...location(input, workers[0]?.worktreeId.value ?? null, gate.taskId),
      agentType: null,
      since: gate.createdAt,
      lastWords: oneLine(gate.question),
      links: { detail: null, open: null, pr: null },
      missing: [],
      mail: [],
    });
  }
  return items;
}

function httpsUrl(value: string | null | undefined): string | null {
  if (!value?.startsWith('https://')) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function prItems(input: BuildInboxInput): InboxItem[] {
  const items: InboxItem[] = [];
  for (const worktree of input.state.worktrees) {
    const worker = input.state.workers.find(
      (worker) => worker.worktreeId.value === worktree.id && worker.state.value === 'succeeded',
    );
    const open = worktree.pr.value?.state === 'open';
    const failed = open && worktree.ci.value?.status === 'failure';
    const missing = worktree.pr.value === null && worktree.pr.missing !== 'not-provided';
    if (!failed && !(worker && (open || missing))) continue;
    items.push({
      id: `pr:${worktree.id}`,
      kind: 'pr',
      stage: failed ? 'stalled' : open ? 'needs_action' : 'unknown',
      reasons: failed ? (worker ? ['ci_failed', 'merge_pending'] : ['ci_failed']) : open ? ['merge_pending'] : [],
      ...location(input, worktree.id, worker?.taskId ?? null),
      agentType: null,
      since: null,
      lastWords: oneLine(worktree.pr.value?.title),
      links: { detail: null, open: null, pr: httpsUrl(worktree.pr.value?.url) },
      missing: missing ? ['pr_state_missing'] : [],
      mail: [],
    });
  }
  for (const message of input.mail.messages) {
    // URL がない完了報告は PR の根拠ではない。
    if (message.type !== 'worker_done' || message.prUrl === null) continue;
    const worktree = input.state.worktrees.find((worktree) => worktree.pr.value?.url === message.prUrl);
    if (worktree) {
      items.find((item) => item.id === `pr:${worktree.id}`)?.mail.push(mailSummary(message));
      continue;
    }
    const worker = input.state.workers.find((worker) => worker.dispatchId === message.dispatchId);
    items.push({
      id: `pr-mail:${message.id}`,
      kind: 'pr',
      stage: 'unknown',
      reasons: [],
      ...location(input, worker?.worktreeId.value ?? null, message.taskId ?? worker?.taskId ?? null),
      agentType: null,
      since: null,
      lastWords: null,
      links: { detail: null, open: null, pr: httpsUrl(message.prUrl) },
      missing: ['pr_state_missing'],
      mail: [mailSummary(message)],
    });
  }
  return items;
}

function compareItems(a: InboxItem, b: InboxItem): number {
  if (a.since === null && b.since !== null) return 1;
  if (a.since !== null && b.since === null) return -1;
  if (a.since !== null && b.since !== null) {
    const direction = a.stage === 'running' || a.stage === 'finished' ? -1 : 1;
    const difference = Date.parse(a.since) - Date.parse(b.since);
    if (difference !== 0) return direction * difference;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildInbox(input: BuildInboxInput): InboxDocument {
  const { state, mail } = input;
  const items = [...state.agents.map((agent) => agentItem(agent, input)), ...unlinkedItems(input), ...prItems(input)];
  const projects = new Map<string, InboxDocument['projects'][number]>();
  for (const { project } of items) {
    if (project === null) continue;
    const existing = projects.get(project.id);
    if (existing) existing.count++;
    else projects.set(project.id, { ...project, count: 1 });
  }
  const filtered = input.project === null ? items : items.filter((item) => item.project?.id === input.project);
  return {
    schema: INBOX_SCHEMA,
    generatedAt: new Date(input.now).toISOString(),
    stale: state.stale || mail.stale,
    connection: { ...state.connection },
    stallMinutes: input.stallMs / 60_000,
    sources: {
      state: {
        stale: state.stale,
        sources: Object.fromEntries(
          Object.entries(state.sources).map(([name, source]) => [
            name,
            {
              lastSuccessAt: source.lastSuccessAt,
              stale: source.stale,
              error: source.error,
            },
          ]),
        ) as InboxDocument['sources']['state']['sources'],
      },
      mail: {
        fetchedAt: mail.fetchedAt,
        lastSuccessAt: mail.lastSuccessAt,
        stale: mail.stale,
        error: mail.error,
        runsRead: mail.runsRead,
        runsFailed: mail.runsFailed,
      },
    },
    projects: [...projects.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    stages: STAGES.map((stage) => ({
      stage,
      collapsed: stage === 'finished',
      items: filtered.filter((item) => item.stage === stage).sort(compareItems),
    })),
  };
}
