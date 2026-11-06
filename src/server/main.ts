// 起動。設定（環境変数）を読み、Orca の読み取り、機能の確かめ、共有のポーリング、設定のファイル、開く口を組み立てて待ち受ける。
// 待ち受けは 127.0.0.1 と、設定した Tailscale の IP だけ（0.0.0.0 に代えない）。常駐の定義は iss-00008 で作る。
import { createServer } from 'node:http';
import { createStateReader } from '../orca/read-state.ts';
import { wireOrca } from '../orca/wiring.ts';
import { StatePoller } from '../state/poller.ts';
import { SettingsStore } from '../state/settings.ts';
import { createAppHandler } from './app.ts';
import { type AppConfig, ConfigError, loadConfig } from './config.ts';

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
  capabilities: () => orca.capabilities.get(),
});
const settings = new SettingsStore(config.settingsFile);
await settings.load();

// 待ち受けのアドレスごとにサーバーを作り、1つの処理（とトークン）を共有する。
const handler = createAppHandler({
  poller,
  settings,
  open: (request) => orca.open.open(request),
  readOrigins: config.readOrigins,
  extraHosts: config.extraHosts,
});
poller.start();
for (const address of config.bindAddresses) {
  createServer(handler).listen(config.port, address, () => {
    console.log(`orca-web: http://${address}:${config.port}/`);
  });
}
