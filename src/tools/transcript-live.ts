// この Mac の Orca で、会話の読み取りを読むだけで確かめ、件数と結論だけを JSON で標準出力に出す。
// 使い方: npm run transcript:live
// 状態の API と同じ規則でエージェントを集め、会話を2回読み、前のページを1回読む。購読の口（subscribe）は送らない。
// 本文、題名、パス、セッションの識別子は出さない。読む口は ReadOnlyOrcaCli と ReadOnlyRpc だけ。
import { createStateReader } from '../orca/read-state.ts';
import { createTranscriptReader } from '../orca/read-transcript.ts';
import { type OrcaWiring, wireOrca } from '../orca/wiring.ts';
import { StatePoller } from '../state/poller.ts';
import { collectTranscripts } from './live-transcript.ts';

const DEFAULT_ORCA_BIN = '/Applications/Orca.app/Contents/Resources/bin/orca';

/** 読む口を差し替えて、実機に触れずに出力全体を検証する。 */
export async function probeTranscripts(orca: Pick<OrcaWiring, 'readCli' | 'readRpc' | 'capabilities'>) {
  const capabilities = await orca.capabilities.get();
  const base = {
    probedAt: capabilities.checkedAt,
    orca: {
      cliVersion: capabilities.cliVersion,
      appVersion: capabilities.appVersion,
      connection: capabilities.connection.state,
      readTranscript: capabilities.features.readTranscript.available,
    },
  };
  if (capabilities.connection.state !== 'connected') {
    return { ...base, transcripts: null };
  }
  const poller = new StatePoller({
    reader: createStateReader(orca.readCli, orca.readRpc),
    capabilities: () => orca.capabilities.get(),
  });
  const state = await poller.snapshot();
  const agents = state.agents.map((a) => ({ id: a.id }));
  const reader = createTranscriptReader({
    rpc: orca.readRpc,
    capabilities: () => orca.capabilities.get(),
    isUntabbedAgent: (id) => poller.snapshotSync().agents.some((a) => a.id === id && a.kind === 'untabbed'),
  });
  const transcripts = await collectTranscripts(reader, agents);
  const kinds: Record<string, number> = {};
  for (const a of state.agents) kinds[a.kind] = (kinds[a.kind] ?? 0) + 1;
  return { ...base, agentsByKind: kinds, transcripts };
}

if (import.meta.main) {
  const main = async (): Promise<void> => {
    const orca = wireOrca({ executable: process.env.ORCA_BIN ?? DEFAULT_ORCA_BIN });
    const summary = await probeTranscripts(orca);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  };
  main().catch((error: unknown) => {
    process.stderr.write(`transcript-live failed: ${error instanceof Error ? error.name : 'error'}\n`);
    process.exitCode = 1;
  });
}
