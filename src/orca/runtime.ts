// Orca のランタイムの口（orca-runtime.json）を読む。authToken は RuntimeEndpoint の非公開のフィールドだけに持つ。
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { inspect } from 'node:util';

export const DEFAULT_ORCA_USER_DATA_DIR = path.join(homedir(), 'Library', 'Application Support', 'orca');
const RUNTIME_FILE = 'orca-runtime.json';

/** ランタイムの口。authToken は外から読めない。要求の行を作るときだけ中で使う。 */
export class RuntimeEndpoint {
  readonly runtimeId: string | null;
  readonly socketPath: string;
  readonly #authToken: string;

  constructor(runtimeId: string | null, socketPath: string, authToken: string) {
    this.runtimeId = runtimeId;
    this.socketPath = socketPath;
    this.#authToken = authToken;
  }

  /** 1つの要求の NDJSON の行（改行つき）。 */
  requestLine(id: string, method: string, params: unknown): string {
    return `${JSON.stringify({ id, authToken: this.#authToken, method, params })}\n`;
  }

  /** 文から authToken の値を伏せる。 */
  redact(text: string): string {
    return this.#authToken ? text.split(this.#authToken).join('<redacted>') : text;
  }

  toJSON(): { runtimeId: string | null; socketPath: string } {
    return { runtimeId: this.runtimeId, socketPath: this.socketPath };
  }

  toString(): string {
    return `RuntimeEndpoint(${this.runtimeId ?? 'unknown'})`;
  }

  [inspect.custom](): string {
    return this.toString();
  }
}

export type LocateOutcome = { ok: true; endpoint: RuntimeEndpoint } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class RuntimeLocator {
  readonly #file: string;

  constructor(options: { userDataDir?: string } = {}) {
    this.#file = path.join(options.userDataDir ?? DEFAULT_ORCA_USER_DATA_DIR, RUNTIME_FILE);
  }

  /** 呼ぶたびに読み直す（Orca の再起動で口と authToken が変わるため）。 */
  async locate(): Promise<LocateOutcome> {
    let raw: string;
    try {
      raw = await readFile(this.#file, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? 'read failed';
      return { ok: false, message: `${RUNTIME_FILE} is not readable (${code})` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, message: `${RUNTIME_FILE} is not valid JSON` };
    }
    if (!isRecord(parsed)) return { ok: false, message: `${RUNTIME_FILE} has an unknown shape` };
    const transports = Array.isArray(parsed.transports) ? parsed.transports : [];
    const unix = transports.find((t): t is Record<string, unknown> => isRecord(t) && t.kind === 'unix');
    const socketPath = unix && typeof unix.endpoint === 'string' ? unix.endpoint : null;
    if (!socketPath) return { ok: false, message: `${RUNTIME_FILE} has no unix transport` };
    if (typeof parsed.authToken !== 'string' || parsed.authToken.length === 0) {
      return { ok: false, message: `${RUNTIME_FILE} has no auth token` };
    }
    const runtimeId = typeof parsed.runtimeId === 'string' ? parsed.runtimeId : null;
    return { ok: true, endpoint: new RuntimeEndpoint(runtimeId, socketPath, parsed.authToken) };
  }
}
