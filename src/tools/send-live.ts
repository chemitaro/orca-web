// 実機の送信の確かめ。import だけでは実行しない。
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { CapabilityReport } from '../orca/capabilities.ts';
import { createStateReader } from '../orca/read-state.ts';
import type { RpcTransport } from '../orca/rpc.ts';
import { createSendAdapter, type SendOutcome } from '../orca/send.ts';
import { SendRpc } from '../orca/send-gates.ts';
import { wireOrca } from '../orca/wiring.ts';
import { SendJournal } from '../send/journal.ts';
import { type SendDeps, SendService } from '../send/service.ts';
import { TicketStore } from '../send/ticket.ts';
import { DEFAULT_ORCA_BIN } from '../server/config.ts';
import type { StateDocument } from '../state/model.ts';
import { StatePoller } from '../state/poller.ts';
import { SettingsStore } from '../state/settings.ts';

export function selectSendTargets(state: StateDocument, worktree: string, handles: readonly string[]): string[] {
  if (!worktree || handles.length < 1 || handles.length > 2 || new Set(handles).size !== handles.length)
    throw new Error('invalid_targets');
  return handles.map((handle) => {
    const matches = state.agents.filter((agent) => agent.terminalHandle === handle);
    const agent = matches[0];
    if (matches.length !== 1 || !agent || agent.kind !== 'terminal-tab') throw new Error('invalid_targets');
    const worktrees = state.worktrees.filter((w) => w.id === agent.worktreeId);
    const target = worktrees[0];
    if (worktrees.length !== 1 || !target || target.path.value !== worktree || target.isMainWorktree.value !== false)
      throw new Error('invalid_targets');
    return agent.id;
  });
}

export interface SendProbeEnvironment {
  snapshotSync(): StateDocument;
  capabilities(): Promise<CapabilityReport>;
  rpc: RpcTransport;
}
export interface SendProbeOptions {
  worktree: string;
  handles: readonly string[];
}

/** 送るRPCは一回だけ委譲する。応答消失時も再送しない。 */
function observeRpc(transport: RpcTransport) {
  const counts = { sends: 0, requestShow: 0 };
  const control = { dropResponses: false };
  const rpc = new SendRpc({
    async call<T>(method: string, params: unknown, options?: import('../orca/rpc.ts').RpcCallOptions) {
      if (method === 'terminal.send' || method === 'agentSession.send') counts.sends++;
      if (method === 'orchestration.requestShow') counts.requestShow++;
      const result = await transport.call<T>(method, params, options);
      if (control.dropResponses && (method === 'terminal.send' || method === 'agentSession.send'))
        return { ok: false as const, kind: 'timeout' as const, message: 'probe_response_discarded' };
      return result;
    },
  });
  return { rpc, counts, control };
}

/** 検証専用の票。消費時の宛先を意図的に変え、本物の再読込との比較を通す。 */
class ProbeTickets extends TicketStore {
  change: 'session' | 'terminal' | null = null;
  override take(ticket: string) {
    const result = super.take(ticket);
    if (result.ok && result.value.target.route === 'terminal') {
      if (this.change === 'session') result.value.target.providerSessionId += '-probe-changed';
      if (this.change === 'terminal') result.value.target.ptyId += '-probe-changed';
    }
    this.change = null;
    return result;
  }
}

type ProbeService = Pick<SendService, 'intent' | 'confirm' | 'check'>;

export async function probeSends(
  environment: SendProbeEnvironment,
  options: SendProbeOptions,
  createService: (deps: SendDeps) => ProbeService = (deps) => new SendService(deps),
) {
  const agents = selectSendTargets(environment.snapshotSync(), options.worktree, options.handles);
  const cap = await environment.capabilities();
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-send-live-'));
  try {
    const settingsFile = path.join(dir, 'settings.json');
    await writeFile(settingsFile, JSON.stringify({ version: 1, sendEnabled: true }), { mode: 0o600 });
    const settings = new SettingsStore(settingsFile);
    const observed = observeRpc(environment.rpc);
    let now = Date.now();
    const tickets = new ProbeTickets({ now: () => now });
    const service = createService({
      snapshotSync: () => environment.snapshotSync(),
      capabilities: () => environment.capabilities(),
      rpc: observed.rpc,
      adapter: createSendAdapter({ rpc: observed.rpc }),
      journal: new SendJournal(path.join(dir, 'sends')),
      readSendEnabled: () => settings.readSendEnabled(),
      tickets,
    });
    const sent = { count: 0, outcomes: {} as Partial<Record<SendOutcome, number>>, sendCalls: 0 };
    const recorded = { count: 0 };
    let usedTicket = '';
    let usedText = '';
    for (const [index, agent] of agents.entries()) {
      const text = `orca-web の送信の確かめ（${index + 1}）。受け取りましたとだけ答えてください。`;
      const intent = await service.intent({ agent, text });
      if (!intent.ok) throw new Error('intent_failed');
      const before = observed.counts.sends;
      const result = await service.confirm({ ticket: intent.ticket, text });
      if (!result.ok || observed.counts.sends - before !== 1) throw new Error('send_count_failed');
      usedTicket = intent.ticket;
      usedText = text;
      sent.count++;
      sent.outcomes[result.outcome] = (sent.outcomes[result.outcome] ?? 0) + 1;
      sent.sendCalls += observed.counts.sends - before;
      const checked = await service.check(intent.operationId, { query: false });
      if (!checked.ok || checked.state !== 'recorded' || observed.counts.sends !== before + 1)
        throw new Error('record_missing');
      recorded.count++;
    }
    const first = agents[0] as string;
    const lostText = `orca-web の送信の確かめ（${agents.length + 1}）。受け取りましたとだけ答えてください。`;
    const lostIntent = await service.intent({ agent: first, text: lostText });
    if (!lostIntent.ok) throw new Error('intent_failed');
    const beforeLost = observed.counts.sends;
    observed.control.dropResponses = true;
    const lostResult = await service.confirm({ ticket: lostIntent.ticket, text: lostText });
    observed.control.dropResponses = false;
    if (!lostResult.ok || lostResult.outcome !== 'unknown' || observed.counts.sends - beforeLost !== 1)
      throw new Error('response_loss_failed');
    const beforeQuery = observed.counts.requestShow;
    const recovered = await service.check(lostIntent.operationId, { query: true });
    if (
      !recovered.ok ||
      recovered.state !== 'recorded' ||
      observed.counts.requestShow - beforeQuery !== 1 ||
      observed.counts.sends - beforeLost !== 1
    )
      throw new Error('query_failed');
    const responseLost = {
      count: 1,
      outcomes: { unknown: 1 },
      sendCalls: observed.counts.sends - beforeLost,
      requestShowCalls: observed.counts.requestShow - beforeQuery,
      conclusion: recovered.record.outcome,
    };
    const beforeChanges = observed.counts.sends;
    const targetChanged = { count: 0, reasons: {} as Record<string, number>, sendCalls: 0 };
    for (const [change, reason] of [
      ['session', 'session_changed'],
      ['terminal', 'terminal_changed'],
    ] as const) {
      const intent = await service.intent({ agent: first, text: lostText });
      if (!intent.ok) throw new Error('intent_failed');
      tickets.change = change;
      const result = await service.confirm({ ticket: intent.ticket, text: lostText });
      if (result.ok || result.error !== 'target_changed' || result.reason !== reason)
        throw new Error('target_change_failed');
      targetChanged.count++;
      targetChanged.reasons[reason] = (targetChanged.reasons[reason] ?? 0) + 1;
    }
    targetChanged.sendCalls = observed.counts.sends - beforeChanges;
    if (targetChanged.sendCalls !== 0) throw new Error('send_count_failed');
    const beforeNotSent = observed.counts.sends;
    const notSent = { count: 0, reasons: {} as Record<string, number>, sendCalls: 0 };
    const refused = async (ticket: string, text: string, error: string, reason?: string) => {
      const result = await service.confirm({ ticket, text });
      if (result.ok || result.error !== error || result.reason !== reason) throw new Error('refusal_failed');
      notSent.count++;
      notSent.reasons[error] = (notSent.reasons[error] ?? 0) + 1;
    };
    await refused(usedTicket, usedText, 'ticket_invalid', 'unknown');
    const changed = await service.intent({ agent: first, text: lostText });
    if (!changed.ok) throw new Error('intent_failed');
    await refused(changed.ticket, `${lostText}changed`, 'target_changed', 'text_changed');
    const disabled = await service.intent({ agent: first, text: lostText });
    if (!disabled.ok) throw new Error('intent_failed');
    await writeFile(settingsFile, JSON.stringify({ version: 1, sendEnabled: false }), { mode: 0o600 });
    await refused(disabled.ticket, lostText, 'send_disabled');
    await writeFile(settingsFile, JSON.stringify({ version: 1, sendEnabled: true }), { mode: 0o600 });
    const expired = await service.intent({ agent: first, text: lostText });
    if (!expired.ok) throw new Error('intent_failed');
    now = expired.expiresAt;
    await refused(expired.ticket, lostText, 'ticket_invalid', 'expired');
    notSent.sendCalls = observed.counts.sends - beforeNotSent;
    if (notSent.sendCalls !== 0) throw new Error('send_count_failed');
    return {
      orca: { cliVersion: cap.cliVersion, appVersion: cap.appVersion },
      agents: agents.length,
      scenarios: { sent, recorded, responseLost, targetChanged, notSent },
      sendCalls: observed.counts.sends,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function parseSendArgs(args: string[]): SendProbeOptions {
  const { values } = parseArgs({
    args,
    options: { worktree: { type: 'string' }, handle: { type: 'string', multiple: true } },
  });
  const handles = values.handle ?? [];
  if (
    !values.worktree ||
    handles.length < 1 ||
    handles.length > 2 ||
    new Set(handles).size !== handles.length ||
    handles.some((h) => !h)
  )
    throw new Error('invalid_targets');
  return { worktree: values.worktree, handles };
}

if (import.meta.main) {
  const main = async () => {
    const options = parseSendArgs(process.argv.slice(2));
    const orca = wireOrca({ executable: process.env.ORCA_BIN || DEFAULT_ORCA_BIN });
    const poller = new StatePoller({
      reader: createStateReader(orca.readCli, orca.readRpc),
      capabilities: () => orca.capabilities.get(),
    });
    await poller.snapshot();
    const result = await probeSends(
      { snapshotSync: () => poller.snapshotSync(), capabilities: () => orca.capabilities.get(), rpc: orca.sendRpc },
      options,
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  };
  main().catch(() => {
    // 例外のメッセージはOrca由来の本文やパスを含みうるため出さない。
    process.stderr.write('send-live failed\n');
    process.exitCode = 1;
  });
}
