// この Mac の Orca で、会話の読み取りを読むだけで確かめ、件数と結論だけを JSON で標準出力に出す。
// 使い方: npm run transcript:live
// 状態の API と同じ規則でエージェントを集め、会話を2回読み、前のページを1回読む。購読の口（subscribe）は送らない。
// 本文、題名、パス、セッションの識別子は出さない。読む口は ReadOnlyOrcaCli と ReadOnlyRpc だけ。
import { createStateReader } from '../orca/read-state.ts';
import { createTranscriptReader } from '../orca/read-transcript.ts';
import { wireOrca } from '../orca/wiring.ts';
import { StatePoller } from '../state/poller.ts';
import { collectTranscripts } from './live-transcript.ts';

const DEFAULT_ORCA_BIN = '/Applications/Orca.app/Contents/Resources/bin/orca';

async function main(): Promise<void> {
  const orca = wireOrca({ executable: process.env.ORCA_BIN ?? DEFAULT_ORCA_BIN });
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
    process.stdout.write(`${JSON.stringify({ ...base, transcripts: null }, null, 2)}\n`);
    return;
  }
  const poller = new StatePoller({
    reader: createStateReader(orca.readCli, orca.readRpc),
    capabilities: () => orca.capabilities.get(),
  });
  const state = await poller.snapshot();
  const agents = state.agents.filter((a) => a.kind !== 'untabbed').map((a) => ({ id: a.id }));
  const reader = createTranscriptReader({ rpc: orca.readRpc, capabilities: () => orca.capabilities.get() });
  const transcripts = await collectTranscripts(reader, agents);
  const kinds: Record<string, number> = {};
  for (const a of state.agents) kinds[a.kind] = (kinds[a.kind] ?? 0) + 1;
  process.stdout.write(`${JSON.stringify({ ...base, agentsByKind: kinds, transcripts }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`transcript-live failed: ${error instanceof Error ? error.name : 'error'}\n`);
  process.exitCode = 1;
});
