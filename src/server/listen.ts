// 待ち受けの組み立て。127.0.0.1 と、設定した Tailscale の IP だけで待ち受ける（0.0.0.0 や :: に代えない）。
// 127.0.0.1 で待ち受けられなければ誤りを投げる（main が終了コード1で止まり、launchd が起動し直す）。
// Tailscale の IP で待ち受けられなければ（ログインの直後で Tailscale がまだ動いていないなど）、127.0.0.1 だけで続け、
// ログに1行を書き、retryMs ごとに試し直す。同じ誤りの繰り返しは書かない。
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { isIPv4 } from 'node:net';

export const LOOPBACK_ADDRESS = '127.0.0.1';
export const DEFAULT_RETRY_MS = 30_000;

export type ListenerState = 'listening' | 'retrying' | 'closed';

export interface ListenerStatus {
  address: string;
  state: ListenerState;
  /** 最後に待ち受けられなかった誤りの種類（EADDRNOTAVAIL など）。retrying のときだけ。 */
  error?: string;
}

export interface ListenOptions {
  port: number;
  /** 待ち受けのアドレス。最初は 127.0.0.1、残りは Tailscale の IPv4（loadConfig の bindAddresses）。 */
  addresses: readonly string[];
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  log: (line: string) => void;
  retryMs?: number;
  /** テストが差し替える。 */
  createServer?: (handler: (req: IncomingMessage, res: ServerResponse) => void) => Server;
}

export interface ListenerSet {
  /** 待ち受けのポート（ポート 0 で始めたときは、127.0.0.1 で得たポート）。 */
  readonly port: number;
  status(): ListenerStatus[];
  /** 試し直しを止め、すべての待ち受けを閉じる。 */
  close(): Promise<void>;
}

function checkAddresses(addresses: readonly string[]): void {
  const [first, ...rest] = addresses;
  const unicast = (a: string) => isIPv4(a) && a !== '0.0.0.0' && !a.startsWith('127.');
  if (first !== LOOPBACK_ADDRESS || !rest.every(unicast)) {
    throw new Error('listen addresses must be 127.0.0.1 followed by unicast IPv4 addresses (never 0.0.0.0 or ::)');
  }
}

/** アドレスを付けて listen する（付けないと 0.0.0.0 か :: になる）。得たポートを返す。 */
function listenOn(server: Server, port: number, address: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      const bound = server.address();
      resolve(typeof bound === 'object' && bound !== null ? bound.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, address);
  });
}

const errorCode = (error: unknown): string =>
  typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : 'ERROR';

/** 閉じる。持続の接続も切る（launchd の SIGTERM で、開いたままの接続が終わりを止めないように）。 */
const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });

export async function startListeners(options: ListenOptions): Promise<ListenerSet> {
  checkAddresses(options.addresses);
  const make = options.createServer ?? createHttpServer;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const [loopback, ...others] = options.addresses as [string, ...string[]];

  const first = make(options.handler);
  const port = await listenOn(first, options.port, loopback);
  options.log(`orca-web: listening on http://${loopback}:${port}/`);

  const statuses = new Map<string, ListenerStatus>([[loopback, { address: loopback, state: 'listening' }]]);
  const servers = new Set<Server>([first]);
  const timers = new Set<NodeJS.Timeout>();
  let closed = false;

  const attempt = async (address: string): Promise<void> => {
    const server = make(options.handler);
    try {
      await listenOn(server, port, address);
    } catch (error) {
      await closeServer(server).catch(() => {});
      if (closed) return;
      const code = errorCode(error);
      if (statuses.get(address)?.error !== code) {
        options.log(
          `orca-web: cannot listen on ${address}:${port} (${code}); serving ${loopback} only, retrying every ${Math.round(retryMs / 1000)}s`,
        );
      }
      statuses.set(address, { address, state: 'retrying', error: code });
      const timer = setTimeout(() => {
        timers.delete(timer);
        void attempt(address);
      }, retryMs);
      timers.add(timer);
      return;
    }
    if (closed) {
      await closeServer(server);
      return;
    }
    servers.add(server);
    statuses.set(address, { address, state: 'listening' });
    options.log(`orca-web: listening on http://${address}:${port}/`);
  };

  for (const address of others) {
    statuses.set(address, { address, state: 'retrying' });
    await attempt(address);
  }

  return {
    port,
    status: () => options.addresses.map((a) => ({ ...(statuses.get(a) ?? { address: a, state: 'closed' }) })),
    async close() {
      closed = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      await Promise.all([...servers].map(closeServer));
      servers.clear();
      for (const address of options.addresses) statuses.set(address, { address, state: 'closed' });
    },
  };
}
