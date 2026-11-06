// この Mac の Orca で、読むだけの実機の確かめを行い、集計だけを JSON で標準出力に出す。
// 使い方: npm run probe:live -- [--record <dir>]
//   --record <dir>  CLI と RPC（会話の読み取りを除く）の録画を、仮名化と検査を通して <dir> に書く。
// 書き込みの RPC とコマンドは呼べない（ReadOnlyOrcaCli と ReadOnlyRpc）。
import path from 'node:path';
import { parseArgs } from 'node:util';
import { type CapabilityReport, probeCapabilities } from '../orca/capabilities.ts';
import { NodeCliRunner } from '../orca/cli.ts';
import { OrcaCli, ReadOnlyOrcaCli } from '../orca/orca-cli.ts';
import { RecordingCliRunner, RecordingRpcTransport, writeRecordingSet } from '../orca/replay/record.ts';
import { Pseudonymizer } from '../orca/replay/sanitize.ts';
import { ReadOnlyRpc, UnixSocketRpc } from '../orca/rpc.ts';
import { RuntimeLocator } from '../orca/runtime.ts';
import { collectLive, summarizeLive } from './live-probe.ts';

const DEFAULT_ORCA_BIN = '/Applications/Orca.app/Contents/Resources/bin/orca';

function featureSummary(report: CapabilityReport) {
  return {
    cliVersion: report.cliVersion,
    appVersion: report.appVersion,
    runtimeIdConsistent: report.runtimeIdConsistent,
    connection: report.connection,
    features: Object.fromEntries(
      Object.entries(report.features).map(([name, f]) => [
        name,
        { available: f.available, missing: f.missing, deferred: f.deferred },
      ]),
    ),
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { record: { type: 'string' } } });
  const executable = process.env.ORCA_BIN ?? DEFAULT_ORCA_BIN;
  const locator = new RuntimeLocator();
  const realRunner = new NodeCliRunner({ executable, defaultTimeoutMs: 30_000 });
  const realRpc = new UnixSocketRpc(locator, { timeoutMs: 15_000 });
  const cliRecorder = values.record ? new RecordingCliRunner(realRunner) : null;
  const rpcRecorder = values.record ? new RecordingRpcTransport(realRpc) : null;
  const cli = new ReadOnlyOrcaCli(new OrcaCli(cliRecorder ?? realRunner));
  const rpc = new ReadOnlyRpc(rpcRecorder ?? realRpc);
  const transcriptRpc = new ReadOnlyRpc(realRpc);

  const report = await probeCapabilities({ cli, rpc, locator });
  const observation = report.connection.state === 'connected' ? await collectLive({ cli, rpc, transcriptRpc }) : null;
  const summary = {
    probedAt: report.checkedAt,
    orca: featureSummary(report),
    live: observation ? summarizeLive(observation) : null,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (values.record && cliRecorder && rpcRecorder) {
    // CLI と RPC の録画は一緒に再生するので、仮名の表を共有し、両方を検査してからまとめて書く。
    const shared = new Pseudonymizer();
    await writeRecordingSet(path.resolve(values.record), {
      'live-cli.json': cliRecorder.recording({}, shared),
      'live-rpc.json': rpcRecorder.recording({}, shared),
    });
    process.stderr.write(`recordings written to ${values.record}\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`probe-live failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
