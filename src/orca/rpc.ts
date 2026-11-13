// Orca の内部の Unix ソケットの RPC の境界。1回の接続で1つの要求を NDJSON の1行で送り、同じ id の応答を1つ受けて閉じる。
// 形は stablyai/orca v1.4.249 の src/main/runtime/rpc/unix-socket-transport.ts と errors.ts に合わせる。
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { clip } from './orca-cli.ts';
import type { RuntimeEndpoint, RuntimeLocator } from './runtime.ts';

export type RpcFailureKind =
  | 'orca-error'
  | 'timeout'
  | 'disconnected'
  | 'invalid-frame'
  | 'mismatched-id'
  | 'unavailable'
  | 'oversized';

export type RpcOutcome<T = unknown> =
  | { ok: true; result: T; runtimeId: string | null }
  | { ok: false; kind: RpcFailureKind; code?: string; message: string };

export interface RpcCallOptions {
  timeoutMs?: number;
  envelope?: { orchestrationRequestId?: string };
}

/** RPC の境界。実物は UnixSocketRpc、テストでは録画の再生に差し替える。 */
export interface RpcTransport {
  call<T = unknown>(method: string, params: unknown, options?: RpcCallOptions): Promise<RpcOutcome<T>>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_FRAME_BYTES = 16 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 応答の生の文字列を順に受け、NDJSON の行に分けて解く。分割された行をつなぎ、keepalive の行を読み飛ばす。
 * feed が結果を返したら、その要求は終わり。UnixSocketRpc と再生の口が同じ解き方を使う。
 */
export class ResponseDecoder<T = unknown> {
  readonly #id: string;
  readonly #method: string;
  readonly #maxFrameBytes: number;
  #buffer = '';
  #done = false;
  /** keepalive の行を受けたら呼ぶ（時間切れを延ばす）。 */
  onKeepalive: () => void = () => {};

  constructor(id: string, method: string, maxFrameBytes = DEFAULT_MAX_FRAME_BYTES) {
    this.#id = id;
    this.#method = method;
    this.#maxFrameBytes = maxFrameBytes;
  }

  feed(chunk: string): RpcOutcome<T> | null {
    if (this.#done) return null;
    this.#buffer += chunk;
    let newline = this.#buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.#buffer.slice(0, newline).trim();
      this.#buffer = this.#buffer.slice(newline + 1);
      if (line) {
        const outcome = this.#line(line);
        if (outcome) {
          this.#done = true;
          return outcome;
        }
      }
      newline = this.#buffer.indexOf('\n');
    }
    if (Buffer.byteLength(this.#buffer, 'utf8') > this.#maxFrameBytes) {
      this.#done = true;
      return failure('oversized', `${this.#method}: response line exceeds ${this.#maxFrameBytes} bytes`);
    }
    return null;
  }

  /** 応答の前に接続が閉じたときの結果。 */
  closed(): RpcOutcome<T> {
    this.#done = true;
    return failure('disconnected', `${this.#method}: connection closed before a response`);
  }

  #line(line: string): RpcOutcome<T> | null {
    const method = this.#method;
    let frame: unknown;
    try {
      frame = JSON.parse(line);
    } catch {
      return failure('invalid-frame', `${method}: response line is not JSON`);
    }
    if (!isRecord(frame)) return failure('invalid-frame', `${method}: response line is not an object`);
    if (frame._keepalive === true) {
      this.onKeepalive();
      return null;
    }
    if (frame.id !== this.#id) return failure('mismatched-id', `${method}: response id does not match the request`);
    const meta = isRecord(frame._meta) ? frame._meta : {};
    const runtimeId = typeof meta.runtimeId === 'string' ? meta.runtimeId : null;
    if (frame.ok === true) return { ok: true, result: frame.result as T, runtimeId };
    if (frame.ok === false) {
      const error = isRecord(frame.error) ? frame.error : {};
      const message = typeof error.message === 'string' ? error.message : `${method}: failed`;
      return failure('orca-error', message, typeof error.code === 'string' ? error.code : undefined);
    }
    return failure('invalid-frame', `${method}: response has no ok field`);
  }
}

function failure<T>(kind: RpcFailureKind, message: string, code?: string): RpcOutcome<T> {
  const outcome: RpcOutcome<T> = { ok: false, kind, message };
  if (code !== undefined) outcome.code = code;
  return outcome;
}

export interface UnixSocketRpcOptions {
  timeoutMs?: number;
  maxFrameBytes?: number;
  idFactory?: () => string;
}

export class UnixSocketRpc implements RpcTransport {
  readonly #locator: RuntimeLocator;
  readonly #timeoutMs: number;
  readonly #maxFrameBytes: number;
  readonly #idFactory: () => string;

  constructor(locator: RuntimeLocator, options: UnixSocketRpcOptions = {}) {
    this.#locator = locator;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  async call<T = unknown>(method: string, params: unknown, options: RpcCallOptions = {}): Promise<RpcOutcome<T>> {
    const located = await this.#locator.locate();
    if (!located.ok) return { ok: false, kind: 'unavailable', message: located.message };
    return this.#exchange<T>(located.endpoint, method, params, options);
  }

  #exchange<T>(
    endpoint: RuntimeEndpoint,
    method: string,
    params: unknown,
    options: RpcCallOptions,
  ): Promise<RpcOutcome<T>> {
    const timeoutMs = options.timeoutMs ?? this.#timeoutMs;
    const id = this.#idFactory();
    const decoder = new ResponseDecoder<T>(id, method, this.#maxFrameBytes);
    return new Promise((resolve) => {
      let settled = false;
      let connected = false;
      const socket = createConnection(endpoint.socketPath);
      const settle = (outcome: RpcOutcome<T>): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (!outcome.ok) outcome.message = clip(endpoint.redact(outcome.message));
        resolve(outcome);
      };
      const timer = setTimeout(
        () => settle(failure('timeout', `${method}: no response within ${timeoutMs}ms`)),
        timeoutMs,
      );
      decoder.onKeepalive = () => timer.refresh();
      socket.setEncoding('utf8');
      socket.on('connect', () => {
        connected = true;
        socket.write(endpoint.requestLine(id, method, params, options.envelope));
      });
      socket.on('data', (chunk: string) => {
        const outcome = decoder.feed(chunk);
        if (outcome) settle(outcome);
      });
      socket.on('error', (error: NodeJS.ErrnoException) => {
        const reason = error.code ?? error.message;
        settle(
          connected
            ? failure('disconnected', `${method}: connection error (${reason})`)
            : failure('unavailable', `${method}: cannot connect to the Orca runtime (${reason})`),
        );
      });
      socket.on('close', () => settle(decoder.closed()));
    });
  }
}

/** 送ってよい、読むだけの RPC の名前。streaming の method（subscribe）は入れない（Unix ソケットは受けない）。 */
export const READ_METHODS: readonly string[] = [
  'session.tabs.list',
  'session.tabs.listAll',
  'nativeChat.readSession',
  'agentSession.history',
];

/** 読む RPC だけを送れる口。一覧にない名前は送らずに例外にする（呼び出し側の誤り）。 */
export class ReadOnlyRpc implements RpcTransport {
  readonly #transport: RpcTransport;

  constructor(transport: RpcTransport) {
    this.#transport = transport;
  }

  call<T = unknown>(method: string, params: unknown, options?: RpcCallOptions): Promise<RpcOutcome<T>> {
    if (!READ_METHODS.includes(method)) {
      return Promise.reject(new Error(`${method} is not a read-only method`));
    }
    return this.#transport.call<T>(method, params, options);
  }
}
