import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { startListeners } from '../../src/server/listen.ts';

const handler = (_req: unknown, res: { end(body: string): void }) => res.end('ok');

/** listen の引数を記録し、決めたアドレスで誤りを出す偽の server。 */
class FakeServer extends EventEmitter {
  static calls: { port: number; host: unknown; argc: number }[] = [];
  static failures = new Map<string, string[]>();
  #port = 0;

  listen(...args: unknown[]): this {
    const [port, host] = args as [number, unknown];
    FakeServer.calls.push({ port, host, argc: args.filter((a) => typeof a !== 'function').length });
    const queue = typeof host === 'string' ? FakeServer.failures.get(host) : undefined;
    const code = queue?.shift();
    setImmediate(() => {
      if (code) this.emit('error', Object.assign(new Error(code), { code }));
      else {
        this.#port = port === 0 ? 40000 : port;
        this.emit('listening');
      }
    });
    return this;
  }

  address(): AddressInfo {
    return { address: '', family: 'IPv4', port: this.#port };
  }

  close(cb?: () => void): this {
    if (cb) setImmediate(cb);
    return this;
  }
}

const fake = () => new FakeServer() as unknown as Server;

function reset(failures: Record<string, string[]> = {}): void {
  FakeServer.calls = [];
  FakeServer.failures = new Map(Object.entries(failures));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function get(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => {
        body += c;
      });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('Tailscale の IP があれば、127.0.0.1 とその IP の2つだけに、アドレスを付けて listen する', async () => {
  reset();
  const set = await startListeners({
    port: 8791,
    addresses: ['127.0.0.1', '100.101.102.103'],
    handler,
    log: () => {},
    createServer: fake,
  });
  assert.deepEqual(FakeServer.calls, [
    { port: 8791, host: '127.0.0.1', argc: 2 },
    { port: 8791, host: '100.101.102.103', argc: 2 },
  ]);
  assert.deepEqual(set.status(), [
    { address: '127.0.0.1', state: 'listening' },
    { address: '100.101.102.103', state: 'listening' },
  ]);
  await set.close();
});

test('Tailscale の IP がなければ 127.0.0.1 だけに listen する', async () => {
  reset();
  const set = await startListeners({
    port: 8791,
    addresses: ['127.0.0.1'],
    handler,
    log: () => {},
    createServer: fake,
  });
  assert.deepEqual(FakeServer.calls, [{ port: 8791, host: '127.0.0.1', argc: 2 }]);
  await set.close();
});

test('ポート 0 では、127.0.0.1 で得たポートを Tailscale の IP にも使う', async () => {
  reset();
  const set = await startListeners({
    port: 0,
    addresses: ['127.0.0.1', '100.64.0.1'],
    handler,
    log: () => {},
    createServer: fake,
  });
  assert.equal(set.port, 40000);
  assert.deepEqual(
    FakeServer.calls.map((c) => c.port),
    [0, 40000],
  );
  await set.close();
});

test('待ち受けられない Tailscale の IP（192.0.2.1）でも 127.0.0.1 で答え、retrying を示し、ログは1行だけ', async () => {
  const lines: string[] = [];
  const set = await startListeners({
    port: 0,
    addresses: ['127.0.0.1', '192.0.2.1'],
    handler: (_req, res) => res.end('ok'),
    log: (line) => lines.push(line),
    retryMs: 20,
  });
  try {
    assert.deepEqual(await get(set.port, '/'), { status: 200, body: 'ok' });
    const [loopback, tailscale] = set.status();
    assert.deepEqual(loopback, { address: '127.0.0.1', state: 'listening' });
    assert.equal(tailscale?.address, '192.0.2.1');
    assert.equal(tailscale?.state, 'retrying');
    assert.equal(typeof tailscale?.error, 'string');
    await wait(120);
    const failures = lines.filter((l) => l.includes('192.0.2.1'));
    assert.equal(failures.length, 1, lines.join('\n'));
    assert.match(failures[0] ?? '', /cannot listen on 192\.0\.2\.1:\d+ \(E[A-Z]+\); serving 127\.0\.0\.1 only/);
  } finally {
    await set.close();
  }
});

test('試し直しで待ち受けられたら listening になり、ログに1行を書く。誤りの種類が変われば、もう1行', async () => {
  reset({ '100.64.0.1': ['EADDRNOTAVAIL', 'EADDRNOTAVAIL', 'EADDRINUSE'] });
  const lines: string[] = [];
  const set = await startListeners({
    port: 8791,
    addresses: ['127.0.0.1', '100.64.0.1'],
    handler,
    log: (line) => lines.push(line),
    retryMs: 5,
    createServer: fake,
  });
  for (let i = 0; i < 100 && set.status()[1]?.state !== 'listening'; i += 1) await wait(5);
  assert.deepEqual(set.status()[1], { address: '100.64.0.1', state: 'listening' });
  assert.equal(FakeServer.calls.length, 5, '127.0.0.1 の1回と、Tailscale の IP の4回');
  assert.deepEqual(
    lines.filter((l) => l.includes('100.64.0.1')).map((l) => l.replace(/:8791.*$/, '')),
    [
      'orca-web: cannot listen on 100.64.0.1',
      'orca-web: cannot listen on 100.64.0.1',
      'orca-web: listening on http://100.64.0.1',
    ],
  );
  assert.ok(FakeServer.calls.every((c) => typeof c.host === 'string' && c.argc === 2));
  await set.close();
});

test('close は試し直しを止める（時計が残らない）', async () => {
  reset({ '100.64.0.1': Array(1000).fill('EADDRNOTAVAIL') });
  const set = await startListeners({
    port: 8791,
    addresses: ['127.0.0.1', '100.64.0.1'],
    handler,
    log: () => {},
    retryMs: 5,
    createServer: fake,
  });
  await wait(20);
  await set.close();
  const after = FakeServer.calls.length;
  await wait(30);
  assert.equal(FakeServer.calls.length, after);
  assert.deepEqual(
    set.status().map((s) => s.state),
    ['closed', 'closed'],
  );
});

test('127.0.0.1 で待ち受けられない（使用中のポート）ときは誤りを投げ、Tailscale の IP を試さない', async () => {
  const busy = createServer();
  await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve));
  const { port } = busy.address() as AddressInfo;
  let created = 0;
  try {
    await assert.rejects(
      startListeners({
        port,
        addresses: ['127.0.0.1', '192.0.2.1'],
        handler,
        log: () => {},
        createServer: (h) => {
          created += 1;
          return createServer(h);
        },
      }),
      (error: NodeJS.ErrnoException) => error.code === 'EADDRINUSE',
    );
    assert.equal(created, 1);
  } finally {
    await new Promise<void>((resolve) => busy.close(() => resolve()));
  }
});

test('最初のアドレスが 127.0.0.1 でない、またはアドレスがない組み立ては誤りにする', async () => {
  for (const addresses of [
    [],
    ['0.0.0.0'],
    ['::'],
    ['100.64.0.1', '127.0.0.1'],
    ['127.0.0.1', '0.0.0.0'],
    ['127.0.0.1', '::'],
  ]) {
    await assert.rejects(
      startListeners({ port: 0, addresses, handler, log: () => {}, createServer: fake }),
      /127\.0\.0\.1/,
      addresses.join(','),
    );
  }
});
