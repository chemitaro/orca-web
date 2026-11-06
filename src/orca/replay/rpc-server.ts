// 録画した RPC の応答を、一時の Unix ソケットで再生する。実物の UnixSocketRpc をそのまま検査するためのもの。

import { rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import type { RpcExchangeRecord } from './recording.ts';

/** 1つの要求と、それに返す生の文字列の並び（録画の形と同じ）。chunks の中の `$ID` は要求の id に置き換える。 */
export type RpcExchange = RpcExchangeRecord;

export interface ReceivedRequest {
  method: string;
  params: unknown;
  /** expectedAuthToken を渡したとき、要求の authToken が一致したか。値そのものは残さない。 */
  authTokenMatched: boolean | null;
}

export class ReplayRpcServer {
  readonly socketPath: string;
  readonly received: ReceivedRequest[] = [];
  readonly mismatches: string[] = [];
  readonly #exchanges: RpcExchange[];
  readonly #expectedAuthToken: string | undefined;
  readonly #sockets = new Set<Socket>();
  #server: Server | null = null;
  #next = 0;

  constructor(socketPath: string, exchanges: RpcExchange[], options: { expectedAuthToken?: string } = {}) {
    this.socketPath = socketPath;
    this.#exchanges = exchanges;
    this.#expectedAuthToken = options.expectedAuthToken;
  }

  /** まだ使っていない録画の数。 */
  get remaining(): number {
    return this.#exchanges.length - this.#next;
  }

  async start(): Promise<void> {
    await rm(this.socketPath, { force: true });
    const server = createServer((socket) => this.#handle(socket));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.socketPath, () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.#server = server;
  }

  async stop(): Promise<void> {
    for (const socket of this.#sockets) socket.destroy();
    const server = this.#server;
    this.#server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(this.socketPath, { force: true });
  }

  #handle(socket: Socket): void {
    this.#sockets.add(socket);
    socket.once('close', () => this.#sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setEncoding('utf8');
    let buffer = '';
    let answered = false;
    socket.on('data', (chunk: string) => {
      if (answered) return;
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      answered = true;
      void this.#answer(socket, buffer.slice(0, newline));
    });
  }

  async #answer(socket: Socket, line: string): Promise<void> {
    let request: { id?: unknown; method?: unknown; params?: unknown; authToken?: unknown };
    try {
      request = JSON.parse(line) as typeof request;
    } catch {
      this.mismatches.push('request line is not JSON');
      socket.destroy();
      return;
    }
    const id = typeof request.id === 'string' ? request.id : '';
    const method = typeof request.method === 'string' ? request.method : '';
    this.received.push({
      method,
      params: request.params,
      authTokenMatched: this.#expectedAuthToken === undefined ? null : request.authToken === this.#expectedAuthToken,
    });
    const exchange = this.#exchanges[this.#next];
    this.#next += 1;
    if (
      !exchange ||
      exchange.method !== method ||
      ('params' in exchange && !isDeepStrictEqual(exchange.params, request.params))
    ) {
      this.mismatches.push(`unexpected request ${method}`);
      socket.end(
        `${JSON.stringify({ id, ok: false, error: { code: 'replay_mismatch', message: `unexpected ${method}` } })}\n`,
      );
      return;
    }
    const idJson = JSON.stringify(id).slice(1, -1);
    for (const chunk of exchange.chunks) {
      if (socket.destroyed) return;
      socket.write(chunk.split('$ID').join(idJson));
      await delay(2);
    }
    if (exchange.end === 'close' && !socket.destroyed) socket.end();
  }
}
