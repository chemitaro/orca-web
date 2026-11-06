// 起動。設定（環境変数）を読み、Orca の読み取り、機能の確かめ、共有のポーリング、設定のファイルを組み立てて待ち受ける。
// 待ち受けは 127.0.0.1 だけ。常駐と Tailscale のアドレスでの待ち受けは iss-00008 で決める。
import { CapabilityCache, probeCapabilities } from '../orca/capabilities.ts';
import { NodeCliRunner } from '../orca/cli.ts';
import { OrcaCli, ReadOnlyOrcaCli } from '../orca/orca-cli.ts';
import { createStateReader } from '../orca/read-state.ts';
import { ReadOnlyRpc, UnixSocketRpc } from '../orca/rpc.ts';
import { RuntimeLocator } from '../orca/runtime.ts';
import { StatePoller } from '../state/poller.ts';
import { SettingsStore } from '../state/settings.ts';
import { createAppServer } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const locator = new RuntimeLocator();
const cli = new ReadOnlyOrcaCli(new OrcaCli(new NodeCliRunner({ executable: config.orcaBin })));
const rpc = new ReadOnlyRpc(new UnixSocketRpc(locator));
const capabilities = new CapabilityCache(
  () => probeCapabilities({ cli, rpc, locator }),
  async () => {
    const located = await locator.locate();
    return located.ok ? located.endpoint.runtimeId : null;
  },
);
const poller = new StatePoller({ reader: createStateReader(cli, rpc), capabilities: () => capabilities.get() });
const settings = new SettingsStore(config.settingsFile);
await settings.load();

const server = createAppServer({ poller, settings, readOrigins: config.readOrigins });
server.listen(config.port, '127.0.0.1', () => {
  poller.start();
  console.log(`orca-web: http://127.0.0.1:${config.port}/`);
});
