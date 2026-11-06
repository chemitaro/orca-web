import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createAppServer } from '../../src/server/app.ts';

async function withServer(fn: (base: string) => Promise<void>): Promise<void> {
  const server = createAppServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('GET /api/health は 200 と ok を返す', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.deepEqual(await res.json(), { ok: true });
  });
});

test('知らないパスは 404 を返す', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
    await res.arrayBuffer();
  });
});

test('URL として不正な request-target は 400 を返し、サーバーは落ちない', async () => {
  const { request } = await import('node:http');
  await withServer(async (base) => {
    const { port } = new URL(base);
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, method: 'GET', path: '//[' }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 400);
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    await res.arrayBuffer();
  });
});
