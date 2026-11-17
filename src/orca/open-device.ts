// 「Orca で開く」を押した端末の見分け。要求の TCP の元のアドレスで、ホストか、ホストのランタイムに接続中の端末（クライアント）かを決める。
// 頭（X-Forwarded-For など）は使わない。接続の一覧は、Orca のランタイムの websocket の口の確立した TCP の接続を lsof で読む。
// orca-runtime.json からは pid と websocket の port だけを取り出す（authToken を取り出さない、持たない）。
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { type CliResult, NodeCliRunner } from './cli.ts';
import type { OpenFailure } from './open.ts';
import { DEFAULT_ORCA_USER_DATA_DIR } from './runtime.ts';

export type OpenDevice = 'host' | 'client';

export type OriginClass = 'host' | 'remote' | 'unknown';

/** 絶対パスの実行ファイルを、シェルを通さず引数の配列で呼ぶ口。テストでは偽物に差し替える。 */
export type CommandRunner = (
  executable: string,
  argv: readonly string[],
  options: { timeoutMs: number; maxOutputBytes?: number },
) => Promise<CliResult>;

/** 実物の CommandRunner（NodeCliRunner と同じ管理した環境変数で呼ぶ）。 */
export const nodeCommandRunner: CommandRunner = (executable, argv, options) => {
  const runner = new NodeCliRunner({
    executable,
    defaultTimeoutMs: options.timeoutMs,
    ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
  });
  return runner.run(argv);
};

/** `::ffff:a.b.c.d` を `a.b.c.d` に、IPv6 の zone（`%en0`）を落とし、小文字にする。 */
export function normalizeAddress(address: string): string {
  let value = address.trim().toLowerCase();
  const zone = value.indexOf('%');
  if (zone >= 0) value = value.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  return mapped?.[1] ?? value;
}

function isLoopback(address: string): boolean {
  return address === '::1' || /^127(?:\.\d{1,3}){3}$/.test(address);
}

/** 要求の元のアドレスを分ける。loopback かホストの口のアドレスなら host、値がなければ unknown、ほかは remote。 */
export function classifyOrigin(address: string | undefined, hostAddresses: ReadonlySet<string>): OriginClass {
  if (address === undefined || address.trim() === '') return 'unknown';
  const normalized = normalizeAddress(address);
  if (isLoopback(normalized) || hostAddresses.has(normalized)) return 'host';
  return 'remote';
}

/** この Mac のネットワークの口が持つすべてのアドレス（tailnet のアドレスを含む）。呼ぶたびに読む。 */
export function hostAddresses(): ReadonlySet<string> {
  const set = new Set<string>();
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) set.add(normalizeAddress(info.address));
  }
  return set;
}

export type PeersOutcome = { ok: true; addresses: ReadonlySet<string> } | { ok: false; message: string };

export const LSOF_EXECUTABLE = '/usr/sbin/lsof';
const LSOF_TIMEOUT_MS = 3_000;
const LSOF_MAX_OUTPUT_BYTES = 64 * 1024;
const RUNTIME_FILE = 'orca-runtime.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type RuntimeSocket = { ok: true; pid: number; port: number | null } | { ok: false; message: string };

/** orca-runtime.json から pid と websocket の port だけを取り出す。websocket がなければ port は null。 */
export function parseRuntimeSocket(raw: string): RuntimeSocket {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: `${RUNTIME_FILE} is not valid JSON` };
  }
  if (!isRecord(parsed)) return { ok: false, message: `${RUNTIME_FILE} has an unknown shape` };
  const pid = parsed.pid;
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) {
    return { ok: false, message: `${RUNTIME_FILE} has no pid` };
  }
  const transports = Array.isArray(parsed.transports) ? parsed.transports : [];
  const ws = transports.find((t): t is Record<string, unknown> => isRecord(t) && t.kind === 'websocket');
  if (!ws) return { ok: true, pid, port: null };
  const port = typeof ws.endpoint === 'string' ? /^wss?:\/\/.+:(\d{1,5})\/?$/.exec(ws.endpoint)?.[1] : undefined;
  const value = port === undefined ? Number.NaN : Number(port);
  if (!Number.isInteger(value) || value <= 0 || value > 65_535) {
    return { ok: false, message: `${RUNTIME_FILE} has an unknown websocket endpoint` };
  }
  return { ok: true, pid, port: value };
}

/** `<host>:<port>` か `[v6]:<port>` を、アドレスと port に分ける。 */
function splitHostPort(text: string): { address: string; port: number } | null {
  const v6 = /^\[([^\]]+)\]:(\d+)$/.exec(text);
  const v4 = v6 ? null : /^([^:]+):(\d+)$/.exec(text);
  const match = v6 ?? v4;
  if (!match?.[1] || !match[2]) return null;
  return { address: normalizeAddress(match[1]), port: Number(match[2]) };
}

/** `lsof -F n` の出力から、local の port が `port` の接続の remote のアドレスを集める。 */
export function parseLsofPeers(stdout: string, port: number): Set<string> {
  const addresses = new Set<string>();
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('n')) continue;
    const [local, remote] = line.slice(1).trim().split('->');
    if (local === undefined || remote === undefined) continue;
    const l = splitHostPort(local);
    const r = splitHostPort(remote);
    if (l && r && l.port === port) addresses.add(r.address);
  }
  return addresses;
}

export interface RuntimePeersOptions {
  userDataDir?: string;
  runner?: CommandRunner;
  /** ファイルを読む口（テスト用）。 */
  readRuntimeFile?: (file: string) => Promise<string>;
}

/** Orca のランタイムの websocket の口に、確立した TCP の接続を持つ端末のアドレス。 */
export class RuntimePeers {
  readonly #file: string;
  readonly #runner: CommandRunner;
  readonly #read: (file: string) => Promise<string>;

  constructor(options: RuntimePeersOptions = {}) {
    this.#file = path.join(options.userDataDir ?? DEFAULT_ORCA_USER_DATA_DIR, RUNTIME_FILE);
    this.#runner = options.runner ?? nodeCommandRunner;
    this.#read = options.readRuntimeFile ?? ((file) => readFile(file, 'utf8'));
  }

  async peers(): Promise<PeersOutcome> {
    let raw: string;
    try {
      raw = await this.#read(this.#file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? 'read failed';
      return { ok: false, message: `${RUNTIME_FILE} is not readable (${code})` };
    }
    const socket = parseRuntimeSocket(raw);
    if (!socket.ok) return socket;
    if (socket.port === null) return { ok: true, addresses: new Set() };
    const argv = ['-nP', '-a', '-p', String(socket.pid), `-iTCP:${socket.port}`, '-sTCP:ESTABLISHED', '-F', 'n'];
    let result: CliResult;
    try {
      result = await this.#runner(LSOF_EXECUTABLE, argv, {
        timeoutMs: LSOF_TIMEOUT_MS,
        maxOutputBytes: LSOF_MAX_OUTPUT_BYTES,
      });
    } catch {
      return { ok: false, message: 'lsof could not run' };
    }
    if (result.exitCode === 0) return { ok: true, addresses: parseLsofPeers(result.stdout, socket.port) };
    // lsof は当たる接続がないと、何も出さずに終了コード 1 で終わる。
    if (result.exitCode === 1 && result.stdout.trim() === '') return { ok: true, addresses: new Set() };
    if (result.timedOut) return { ok: false, message: 'lsof timed out' };
    if (result.outputOverflow) return { ok: false, message: 'lsof output is too large' };
    if (result.spawnError !== undefined) return { ok: false, message: `lsof could not start (${result.spawnError})` };
    return { ok: false, message: `lsof failed (exit ${result.exitCode ?? 'signal'})` };
  }
}

export interface ResolveDeviceDeps {
  hostAddresses: () => ReadonlySet<string>;
  peers: () => Promise<PeersOutcome>;
}

export type DeviceOutcome = { ok: true; device: OpenDevice } | OpenFailure;

/** 押した端末を決める。host なら接続を読まない。見分けられなければ開かない理由を返す。 */
export async function resolveOpenDevice(address: string | undefined, deps: ResolveDeviceDeps): Promise<DeviceOutcome> {
  const origin = classifyOrigin(address, deps.hostAddresses());
  if (origin === 'host') return { ok: true, device: 'host' };
  if (origin === 'unknown') {
    return { ok: false, error: 'device_unknown', message: 'the request has no source address' };
  }
  const peers = await deps.peers();
  if (!peers.ok) {
    return {
      ok: false,
      error: 'device_unknown',
      message: `cannot read the Orca runtime connections: ${peers.message}`,
    };
  }
  const normalized = normalizeAddress(address ?? '');
  if (peers.addresses.has(normalized)) return { ok: true, device: 'client' };
  return {
    ok: false,
    error: 'device_not_connected',
    message: 'no Orca runtime connection was found from this device',
  };
}
