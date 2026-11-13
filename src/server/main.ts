// 起動。設定（環境変数）を読み、Orca の読み取り、機能の確かめ、共有のポーリング、設定のファイル、開く口、会話の読み手と見張りを組み立てて待ち受ける。
// 待ち受けは 127.0.0.1 と、設定した Tailscale の IP だけ（listen.ts。0.0.0.0 に代えない）。
// 終了コード：設定の誤りは 2、127.0.0.1 で待ち受けられないときは 1（launchd が起動し直す）、SIGTERM と SIGINT では 0。
import { createMailReader } from '../orca/read-mail.ts';
import { createStateReader } from '../orca/read-state.ts';
import { createTranscriptReader } from '../orca/read-transcript.ts';
import { wireOrca } from '../orca/wiring.ts';
import { StatePoller } from '../state/poller.ts';
import { SettingsStore } from '../state/settings.ts';
import { TranscriptHub } from '../transcript/hub.ts';
import { createAppHandler } from './app.ts';
import { type AppConfig, ConfigError, LOOPBACK, loadConfig } from './config.ts';
import { type ListenerSet, startListeners } from './listen.ts';

/** 閉じ切らないときに、終わりを待つ上限。 */
const SHUTDOWN_TIMEOUT_MS = 5_000;

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`orca-web: ${error.message}`);
  process.exit(2);
}

const orca = wireOrca({ executable: config.orcaBin });
const poller = new StatePoller({
  reader: createStateReader(orca.readCli, orca.readRpc),
  mailReader: createMailReader(orca.readCli),
  capabilities: () => orca.capabilities.get(),
});
const transcriptReader = createTranscriptReader({
  rpc: orca.readRpc,
  capabilities: () => orca.capabilities.get(),
  isUntabbedAgent: (id) => poller.snapshotSync().agents.some((agent) => agent.id === id && agent.kind === 'untabbed'),
});
const transcriptHub = new TranscriptHub({ reader: transcriptReader });
const settings = new SettingsStore(config.settingsFile);
await settings.load();

let listeners: ListenerSet | null = null;
// 待ち受けのアドレスごとのサーバーが、1つの処理（とトークン）を共有する。
const handler = createAppHandler({
  poller,
  runs: poller,
  inbox: { snapshot: () => poller.inboxSnapshot(), noteViewer: () => poller.noteInboxViewer() },
  stallMinutes: config.stallMinutes,
  settings,
  open: (request) => orca.open.open(request),
  transcripts: { reader: transcriptReader, hub: transcriptHub },
  readOrigins: config.readOrigins,
  extraHosts: config.extraHosts,
  health: () => ({ pid: process.pid, listeners: listeners?.status() ?? [] }),
});

try {
  listeners = await startListeners({
    port: config.port,
    addresses: config.bindAddresses,
    handler,
    log: (line) => console.log(line),
  });
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code ?? 'ERROR';
  console.error(`orca-web: cannot listen on ${LOOPBACK}:${config.port} (${code})`);
  process.exit(1);
}
poller.start();

let stopping = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`orca-web: ${signal}, stopping`);
  setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref();
  poller.stop();
  transcriptHub.close();
  await listeners?.close();
  process.exit(0);
}
process.on('SIGTERM', (signal) => void shutdown(signal));
process.on('SIGINT', (signal) => void shutdown(signal));
