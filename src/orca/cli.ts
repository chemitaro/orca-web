// Orca の CLI の境界。シェルを通さず、絶対パスの実行ファイルに引数の配列を渡し、管理した環境変数で呼ぶ。
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface CliRunOptions {
  timeoutMs?: number;
}

export interface CliResult {
  /** 終了コード。時間切れ、起動の失敗、シグナルで終わったときは null。 */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  /** 起動できなかったときの理由（例 `ENOENT`）。 */
  spawnError?: string;
}

/** CLI の境界。実物は NodeCliRunner、テストでは録画の再生に差し替える。argv は実行ファイルを含まない。 */
export interface CliRunner {
  run(argv: readonly string[], options?: CliRunOptions): Promise<CliResult>;
}

/** 子に写す環境変数の名前。ここにない名前は渡さない。 */
export const ALLOWED_ENV_NAMES: readonly string[] = [
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TMPDIR',
  'PATH',
];

/**
 * 親の環境から、許した名前だけを写す。`ORCA_` で始まる名前（ORCA_ENVIRONMENT、ORCA_PAIRING_CODE など）は、
 * extra に足されても渡さない。接続先を別の Orca に変えうるため。
 */
export function buildManagedEnv(
  parent: Readonly<Record<string, string | undefined>>,
  extra: readonly string[] = [],
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [...ALLOWED_ENV_NAMES, ...extra]) {
    if (name.startsWith('ORCA_')) continue;
    if (!ALLOWED_ENV_NAMES.includes(name)) continue;
    const value = parent[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

export interface NodeCliRunnerOptions {
  /** 実行ファイルの絶対パス。 */
  executable: string;
  /** 作業ディレクトリ。既定は os.tmpdir()。 */
  cwd?: string;
  /** 環境変数を写す元。既定は process.env。 */
  parentEnv?: Readonly<Record<string, string | undefined>>;
  defaultTimeoutMs?: number;
  /** stdout と stderr のそれぞれの上限。超えたら止める。 */
  maxOutputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export class NodeCliRunner implements CliRunner {
  readonly #executable: string;
  readonly #cwd: string;
  readonly #env: Record<string, string>;
  readonly #defaultTimeoutMs: number;
  readonly #maxOutputBytes: number;

  constructor(options: NodeCliRunnerOptions) {
    if (!path.isAbsolute(options.executable)) {
      throw new Error('orca CLI executable must be an absolute path');
    }
    this.#executable = options.executable;
    this.#cwd = options.cwd ?? tmpdir();
    this.#env = buildManagedEnv(options.parentEnv ?? process.env);
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  }

  run(argv: readonly string[], options: CliRunOptions = {}): Promise<CliResult> {
    const timeoutMs = options.timeoutMs ?? this.#defaultTimeoutMs;
    const started = performance.now();
    return new Promise((resolve) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outBytes = 0;
      let errBytes = 0;
      let timedOut = false;
      let overflow = false;
      let settled = false;
      const child = spawn(this.#executable, [...argv], {
        cwd: this.#cwd,
        env: this.#env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const finish = (exitCode: number | null, spawnError?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const result: CliResult = {
          exitCode: timedOut || overflow ? null : exitCode,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          durationMs: Math.round(performance.now() - started),
          timedOut,
        };
        if (spawnError !== undefined) result.spawnError = spawnError;
        else if (overflow) result.spawnError = 'output exceeded the limit';
        resolve(result);
      };
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => {
        outBytes += chunk.length;
        if (outBytes > this.#maxOutputBytes) {
          overflow = true;
          child.kill('SIGKILL');
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        errBytes += chunk.length;
        if (errBytes > this.#maxOutputBytes) {
          overflow = true;
          child.kill('SIGKILL');
          return;
        }
        stderr.push(chunk);
      });
      child.on('error', (error: NodeJS.ErrnoException) => finish(null, error.code ?? error.message));
      child.on('close', (code) => finish(code));
    });
  }
}
