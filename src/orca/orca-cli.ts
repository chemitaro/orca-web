// Orca の CLI の `--json` の応答を、型の結果に解く。
import type { CliResult, CliRunner } from './cli.ts';

export type CliFailureKind = 'orca-error' | 'exit-nonzero' | 'timeout' | 'invalid-json' | 'spawn-failed';

export type CliOutcome<T = unknown> =
  | { ok: true; result: T; durationMs: number }
  | { ok: false; kind: CliFailureKind; code?: string; message: string; exitCode?: number | null };

const MAX_MESSAGE_CHARS = 500;

export function clip(text: string, max = MAX_MESSAGE_CHARS): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function processFailure(r: CliResult): CliOutcome<never> | null {
  if (r.timedOut) return { ok: false, kind: 'timeout', message: `timed out after ${r.durationMs}ms` };
  if (r.spawnError !== undefined) return { ok: false, kind: 'spawn-failed', message: clip(r.spawnError) };
  return null;
}

export class OrcaCli {
  readonly #runner: CliRunner;
  readonly #timeoutMs: number | undefined;

  constructor(runner: CliRunner, options: { timeoutMs?: number } = {}) {
    this.#runner = runner;
    this.#timeoutMs = options.timeoutMs;
  }

  async #run(argv: readonly string[]): Promise<CliResult> {
    return this.#runner.run(argv, this.#timeoutMs === undefined ? {} : { timeoutMs: this.#timeoutMs });
  }

  /** `orca <args> --json` を呼び、Orca の封筒（`{ ok, result }` か `{ ok: false, error }`）を解く。 */
  async json<T = unknown>(args: readonly string[]): Promise<CliOutcome<T>> {
    const r = await this.#run([...args, '--json']);
    const failed = processFailure(r);
    if (failed) return failed;
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.stdout);
    } catch {
      if (r.exitCode !== 0) {
        return { ok: false, kind: 'exit-nonzero', exitCode: r.exitCode, message: clip(r.stderr || r.stdout) };
      }
      return { ok: false, kind: 'invalid-json', exitCode: r.exitCode, message: clip(r.stdout) };
    }
    if (!isRecord(parsed) || typeof parsed.ok !== 'boolean') {
      return { ok: false, kind: 'invalid-json', exitCode: r.exitCode, message: 'stdout is not an Orca JSON envelope' };
    }
    if (parsed.ok === false) {
      const error = isRecord(parsed.error) ? parsed.error : {};
      const outcome: CliOutcome<T> = {
        ok: false,
        kind: 'orca-error',
        message: clip(typeof error.message === 'string' ? error.message : 'orca reported an error'),
        exitCode: r.exitCode,
      };
      if (typeof error.code === 'string') outcome.code = error.code;
      return outcome;
    }
    if (r.exitCode !== 0) {
      return { ok: false, kind: 'exit-nonzero', exitCode: r.exitCode, message: clip(r.stderr || 'non-zero exit') };
    }
    return { ok: true, result: parsed.result as T, durationMs: r.durationMs };
  }

  /** `orca --version` の1行目。 */
  async version(): Promise<CliOutcome<string>> {
    const r = await this.#run(['--version']);
    const failed = processFailure(r);
    if (failed) return failed;
    if (r.exitCode !== 0) {
      return { ok: false, kind: 'exit-nonzero', exitCode: r.exitCode, message: clip(r.stderr || r.stdout) };
    }
    const line = r.stdout.split('\n')[0]?.trim() ?? '';
    if (!line) return { ok: false, kind: 'invalid-json', exitCode: r.exitCode, message: 'empty version output' };
    return { ok: true, result: line, durationMs: r.durationMs };
  }
}
