// 実物の Orca につなぐ組み立て。サーバー（main.ts）と実機の確かめの道具が共有する。
import { CapabilityCache, probeCapabilities } from './capabilities.ts';
import { NodeCliRunner } from './cli.ts';
import { type OpenOutcome, type OpenRequest, OpenService } from './open.ts';
import { hostAddresses, RuntimePeers, resolveOpenDevice } from './open-device.ts';
import { OpenOrcaCli, OpenRpc } from './open-gates.ts';
import { OrcaCli, ReadOnlyOrcaCli } from './orca-cli.ts';
import { raiseOrca } from './raise.ts';
import { ReadOnlyRpc, UnixSocketRpc } from './rpc.ts';
import { RuntimeLocator } from './runtime.ts';
import { SendRpc } from './send-gates.ts';

export interface OrcaWiring {
  open: OpenService;
  /** 要求の元のアドレスから押した端末を決めてから開く（POST /api/open）。見分けられなければ Orca に何も送らない。 */
  openFrom: (request: OpenRequest, address: string | undefined) => Promise<OpenOutcome>;
  capabilities: CapabilityCache;
  /** 読むだけの口（実機の確かめでタブの集合を読む）。 */
  readRpc: ReadOnlyRpc;
  readCli: ReadOnlyOrcaCli;
  /** 開く門（実機の確かめで経路を指定して送る）。 */
  openRpc: OpenRpc;
  openCli: OpenOrcaCli;
  sendRpc: SendRpc;
}

export function wireOrca(options: { executable: string; userDataDir?: string }): OrcaWiring {
  const cli = new OrcaCli(new NodeCliRunner({ executable: options.executable }));
  const locator = new RuntimeLocator(options.userDataDir === undefined ? {} : { userDataDir: options.userDataDir });
  const rpc = new UnixSocketRpc(locator);
  const readCli = new ReadOnlyOrcaCli(cli);
  const readRpc = new ReadOnlyRpc(rpc);
  const capabilities = new CapabilityCache(
    () => probeCapabilities({ cli: readCli, rpc: readRpc, locator }),
    async () => {
      const located = await locator.locate();
      return located.ok ? located.endpoint.runtimeId : null;
    },
  );
  const openCli = new OpenOrcaCli(cli);
  const openRpc = new OpenRpc(rpc);
  const open = new OpenService({
    cli: openCli,
    rpc: openRpc,
    capabilities: () => capabilities.get(),
    raise: () => raiseOrca(),
  });
  const peers = new RuntimePeers(options.userDataDir === undefined ? {} : { userDataDir: options.userDataDir });
  const openFrom = async (request: OpenRequest, address: string | undefined): Promise<OpenOutcome> => {
    const device = await resolveOpenDevice(address, { hostAddresses, peers: () => peers.peers() });
    return device.ok ? open.open(request, device.device) : device;
  };
  const sendRpc = new SendRpc(rpc);
  return { open, openFrom, capabilities, readRpc, readCli, openRpc, openCli, sendRpc };
}
