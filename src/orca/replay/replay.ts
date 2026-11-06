// 録画の再生。CLI と RPC の境界を、Orca なしで差し替える。
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import type { CliResult, CliRunner } from '../cli.ts';
import { ResponseDecoder, type RpcOutcome, type RpcTransport } from '../rpc.ts';
import type { CliEntry, CliRecording, RpcExchangeRecord, RpcRecording } from './recording.ts';

/** argv が一致する、まだ使っていない録画を、録画の順に返す。 */
export class ReplayCliRunner implements CliRunner {
  readonly calls: string[][] = [];
  readonly #entries: CliEntry[];
  readonly #used = new Set<number>();

  constructor(recording: CliRecording) {
    this.#entries = recording.entries;
  }

  async run(argv: readonly string[]): Promise<CliResult> {
    const index = this.#entries.findIndex((e, i) => !this.#used.has(i) && isDeepStrictEqual(e.argv, [...argv]));
    const entry = this.#entries[index];
    if (!entry) throw new Error(`no recorded entry for orca ${argv.join(' ')}`);
    this.#used.add(index);
    this.calls.push([...argv]);
    if (entry.delayMs > 0) await delay(entry.delayMs);
    const result: CliResult = {
      exitCode: entry.exitCode,
      stdout: entry.stdout,
      stderr: entry.stderr,
      durationMs: entry.delayMs,
      timedOut: entry.timedOut ?? false,
    };
    if (entry.spawnError !== undefined) result.spawnError = entry.spawnError;
    if (entry.outputOverflow) result.outputOverflow = true;
    return result;
  }
}

/** method（と params）が一致する、まだ使っていない録画の chunks を、UnixSocketRpc と同じ ResponseDecoder で解く。 */
export class ReplayRpcTransport implements RpcTransport {
  readonly calls: { method: string; params: unknown }[] = [];
  readonly #exchanges: RpcExchangeRecord[];
  readonly #used = new Set<number>();

  constructor(recording: RpcRecording) {
    this.#exchanges = recording.exchanges;
  }

  async call<T = unknown>(method: string, params: unknown): Promise<RpcOutcome<T>> {
    const index = this.#exchanges.findIndex(
      (e, i) => !this.#used.has(i) && e.method === method && (!('params' in e) || isDeepStrictEqual(e.params, params)),
    );
    const exchange = this.#exchanges[index];
    if (!exchange) throw new Error(`no recorded exchange for ${method}`);
    this.#used.add(index);
    this.calls.push({ method, params });
    const id = randomUUID();
    const decoder = new ResponseDecoder<T>(id, method);
    for (const chunk of exchange.chunks) {
      const outcome = decoder.feed(chunk.split('$ID').join(id));
      if (outcome) return outcome;
    }
    if (exchange.end === 'close') return decoder.closed();
    return { ok: false, kind: 'timeout', message: `${method}: no response (recorded hold)` };
  }
}
