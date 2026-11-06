// 起動。127.0.0.1 と、設定した Tailscale の IP だけで待ち受ける（0.0.0.0 に代えない）。常駐の定義は iss-00008 で作る。
import { createServer } from 'node:http';
import { wireOrca } from '../orca/wiring.ts';
import { createAppHandler } from './app.ts';
import { type AppConfig, ConfigError, loadConfig } from './config.ts';

let config: AppConfig;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`orca-web: ${error.message}`);
  process.exit(2);
}

const orca = wireOrca({ executable: config.orcaCli });
// 待ち受けのアドレスごとにサーバーを作り、1つの処理（とトークン）を共有する。
const handler = createAppHandler({ config, open: (request) => orca.open.open(request) });
for (const address of config.bindAddresses) {
  createServer(handler).listen(config.port, address, () => {
    console.log(`orca-web: http://${address}:${config.port}/`);
  });
}
