import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { type AppOptions, createAppServer } from '../../src/server/app.ts';

async function withApp(
  options: AppOptions,
  run: (
    send: (
      path?: string,
      method?: string,
      headers?: Record<string, string>,
    ) => Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; text: string; json: <T>() => T }>,
    origin: string,
  ) => Promise<void>,
) {
  const server = createAppServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const host = `127.0.0.1:${port}`;
  const send = (path = '/api/worktrees/summary', method = 'GET', headers: Record<string, string> = {}) =>
    new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; text: string; json: <T>() => T }>(
      (resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port, path, method, headers: { host, ...headers } }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              text: Buffer.concat(chunks).toString(),
              json: () => JSON.parse(Buffer.concat(chunks).toString()),
            }),
          );
        });
        req.on('error', reject);
        req.end();
      },
    );
  try {
    await run(send, `http://${host}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const assets = [
  '/embed/agent-marks.js',
  '/embed/agent-marks-view.js',
  '/embed/agent-marks-icons.js',
  '/embed/agent-marks.css',
];

test('印の4ファイルを正しい型で配り、Origin なしと自分の Origin に CORS を付けない', async () => {
  await withApp({}, async (send, origin) => {
    for (const path of assets) {
      for (const headers of [{}, { origin }]) {
        const reply = await send(path, 'GET', headers);
        assert.equal(reply.status, 200);
        assert.equal(
          reply.headers['content-type'],
          path.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
        );
        assert.ok(reply.text.length > 0);
        assert.equal(reply.headers['access-control-allow-origin'], undefined);
        assert.equal(reply.headers['cache-control'], 'no-store');
        assert.equal(reply.headers['x-content-type-options'], 'nosniff');
      }
    }
  });
});

test('許した正確な Origin だけ GET・HEAD と OPTIONS の読み取りを許す', async () => {
  const origin = 'http://127.0.0.1:47800';
  await withApp({ readOrigins: [origin] }, async (send) => {
    for (const path of assets) {
      const get = await send(path, 'GET', { origin });
      assert.equal(get.status, 200);
      assert.equal(get.headers['access-control-allow-origin'], origin);
      assert.equal(get.headers.vary, 'Origin');
      const head = await send(path, 'HEAD', { origin });
      assert.equal(head.status, 200);
      assert.equal(head.headers['access-control-allow-origin'], origin);
      assert.equal(head.headers.vary, 'Origin');
      assert.equal(head.headers['content-type'], get.headers['content-type']);
      assert.equal(head.headers['content-length'], get.headers['content-length']);
      assert.equal(head.text, '');
      const options = await send(path, 'OPTIONS', { origin });
      assert.equal(options.status, 204);
      assert.equal(options.headers['access-control-allow-origin'], origin);
      assert.equal(options.headers.vary, 'Origin');
      assert.equal(options.headers['access-control-allow-methods'], 'GET, HEAD');
      assert.equal(options.headers['access-control-max-age'], '600');
      assert.equal(options.text, '');
    }
  });
});

test('部品は異なる Origin を拒み、読み取り以外は許さず、ほかの配信の扱いを保つ', async () => {
  const origin = 'http://127.0.0.1:47800';
  await withApp({ readOrigins: [origin] }, async (send, self) => {
    for (const path of assets) {
      for (const forbidden of ['http://127.0.0.1:47801', 'https://127.0.0.1:47800', 'null', 'http://evil.example']) {
        for (const method of ['GET', 'HEAD', 'OPTIONS', 'POST']) {
          const reply = await send(path, method, { origin: forbidden });
          assert.equal(reply.status, 403);
          assert.equal(reply.headers['access-control-allow-origin'], undefined);
        }
      }
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
        const reply = await send(path, method, { origin });
        assert.equal(reply.status, 405);
        assert.deepEqual(reply.json(), { ok: false, error: 'method_not_allowed' });
        assert.equal(reply.headers['access-control-allow-origin'], origin);
        assert.equal(reply.headers.vary, 'Origin');
      }
      for (const headers of [{}, { origin: self }]) {
        assert.equal((await send(path, 'OPTIONS', headers)).status, 204);
        assert.equal((await send(path, 'HEAD', headers)).status, 200);
      }
      assert.equal((await send(path, 'GET', { host: 'evil.example', origin })).status, 421);
    }
    for (const path of ['/embed/open-button.js', '/embed/agent-view.js', '/style.css']) {
      const reply = await send(path, 'GET', { origin: 'http://evil.example' });
      assert.equal(reply.status, 200);
      assert.equal(reply.headers['access-control-allow-origin'], undefined);
      assert.equal(reply.headers.vary, undefined);
      assert.equal((await send(path, 'OPTIONS', { origin })).status, 405);
    }
    assert.equal((await send('/embed/agent-marks-extra.js', 'GET', { origin })).status, 404);
  });
});
