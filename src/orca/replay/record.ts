// 録画の包み。実物の CLI と RPC の境界を包んで起きたことを記録し、仮名化と検査を通した録画だけを書き出す。
import { writeFile } from 'node:fs/promises';
import type { CliResult, CliRunner, CliRunOptions } from '../cli.ts';
import type { RpcCallOptions, RpcOutcome, RpcTransport } from '../rpc.ts';
import type { CliEntry, CliRecording, Recording, RpcExchangeRecord, RpcRecording } from './recording.ts';
import { assertRecordingSafe, type Pseudonymizer, type SafetyOptions, sanitizeRecording } from './sanitize.ts';

/** 仮名化し、検査を通した録画を返す。検査を通らなければ UnsafeRecordingError を投げる。 */
function cleaned<T extends Recording>(raw: T, options: SafetyOptions, pseudonymizer?: Pseudonymizer): T {
  const clean = sanitizeRecording(raw, pseudonymizer) as T;
  assertRecordingSafe(clean, options);
  return clean;
}

export class RecordingCliRunner implements CliRunner {
  readonly #inner: CliRunner;
  readonly #entries: CliEntry[] = [];

  constructor(inner: CliRunner) {
    this.#inner = inner;
  }

  async run(argv: readonly string[], options?: CliRunOptions): Promise<CliResult> {
    const result = await this.#inner.run(argv, options);
    const entry: CliEntry = {
      argv: [...argv],
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      delayMs: result.durationMs,
    };
    if (result.timedOut) entry.timedOut = true;
    if (result.spawnError !== undefined) entry.spawnError = result.spawnError;
    this.#entries.push(entry);
    return result;
  }

  /** 一緒に再生する RPC の録画と仮名を合わせるときは、同じ pseudonymizer を渡す。 */
  recording(options: SafetyOptions = {}, pseudonymizer?: Pseudonymizer): CliRecording {
    return cleaned<CliRecording>({ version: 1, kind: 'cli', entries: this.#entries }, options, pseudonymizer);
  }
}

/** 解いた応答を1つの行として録る。分割、keepalive、不正な JSON は、実機からは録らない（手で書いた録画で表す）。 */
export class RecordingRpcTransport implements RpcTransport {
  readonly #inner: RpcTransport;
  readonly #exchanges: RpcExchangeRecord[] = [];

  constructor(inner: RpcTransport) {
    this.#inner = inner;
  }

  async call<T = unknown>(method: string, params: unknown, options?: RpcCallOptions): Promise<RpcOutcome<T>> {
    const outcome = await this.#inner.call<T>(method, params, options);
    const meta = outcome.ok && outcome.runtimeId !== null ? { runtimeId: outcome.runtimeId } : {};
    let exchange: RpcExchangeRecord;
    if (outcome.ok) {
      exchange = {
        method,
        params,
        chunks: [`${JSON.stringify({ id: '$ID', ok: true, result: outcome.result, _meta: meta })}\n`],
        end: 'close',
      };
    } else if (outcome.kind === 'orca-error') {
      const error =
        outcome.code === undefined ? { message: outcome.message } : { code: outcome.code, message: outcome.message };
      exchange = { method, params, chunks: [`${JSON.stringify({ id: '$ID', ok: false, error })}\n`], end: 'close' };
    } else if (outcome.kind === 'timeout') {
      exchange = { method, params, chunks: [], end: 'hold' };
    } else {
      // 接続断、届かない、不正な応答は、応答のないまま閉じる録画にする。
      exchange = { method, params, chunks: [], end: 'close' };
    }
    this.#exchanges.push(exchange);
    return outcome;
  }

  recording(options: SafetyOptions = {}, pseudonymizer?: Pseudonymizer): RpcRecording {
    return cleaned<RpcRecording>({ version: 1, kind: 'rpc', exchanges: this.#exchanges }, options, pseudonymizer);
  }
}

/** 検査を通った録画だけを書き出す。通らなければ何も書かずに UnsafeRecordingError を投げる。 */
export async function writeRecording(file: string, recording: Recording, options: SafetyOptions = {}): Promise<void> {
  assertRecordingSafe(recording, options);
  await writeFile(file, `${JSON.stringify(recording, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}
