import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { type AppOptions, createAppServer } from '../../src/server/app.ts';
import type { WorktreeSummaryDocument } from '../../src/summary/model.ts';
import { agent, input } from '../inbox/fixture.ts';

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

test('要約は共有の状態から作り、見る人を記録し stale を保つ', async () => {
  let views = 0;
  await withApp(
    {
      poller: {
        noteViewer() {
          views++;
        },
        async snapshot() {
          assert.ok(views > 0);
          return input({ agents: [agent()], stale: true }).state;
        },
      },
    },
    async (send, origin) => {
      for (const headers of [{}, { origin }]) {
        const reply = await send(undefined, 'GET', headers);
        assert.equal(reply.status, 200);
        const doc = reply.json<WorktreeSummaryDocument>();
        assert.equal(doc.schema, 'orca-web.worktree-summary/v1');
        assert.equal(doc.stale, true);
        assert.equal(doc.worktrees[0]?.counts.total, 1);
        assert.equal(doc.worktrees[0]?.agents[0]?.mark, 'working');
        assert.equal(reply.headers['access-control-allow-origin'], undefined);
      }
      assert.equal(views, 2);
    },
  );
});

test('許したオリジンだけに GET と OPTIONS の CORS を返す', async () => {
  let reads = 0;
  const allowed = ['http://127.0.0.1:47800', 'http://100.64.0.1:47800'] as const;
  await withApp(
    {
      readOrigins: allowed,
      poller: {
        noteViewer() {},
        snapshot: async () => {
          reads++;
          return input().state;
        },
      },
    },
    async (send) => {
      for (const origin of allowed) {
        for (const method of ['GET', 'OPTIONS']) {
          const reply = await send(undefined, method, { origin });
          assert.equal(reply.status, method === 'OPTIONS' ? 204 : 200);
          assert.equal(reply.headers['access-control-allow-origin'], origin);
          assert.equal(reply.headers.vary, 'Origin');
          if (method === 'OPTIONS') {
            assert.equal(reply.headers['access-control-allow-methods'], 'GET');
            assert.equal(reply.headers['access-control-max-age'], '600');
            assert.equal(reply.text, '');
          }
        }
      }
      assert.equal(reads, 2);
      for (const origin of ['http://127.0.0.1:47801', 'https://127.0.0.1:47800', 'null', 'http://evil.example']) {
        for (const method of ['GET', 'OPTIONS']) {
          const reply = await send(undefined, method, { origin });
          assert.equal(reply.status, 403);
          assert.deepEqual(reply.json(), { ok: false, error: 'forbidden_origin' });
          assert.equal(reply.headers['access-control-allow-origin'], undefined);
        }
      }
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
        const reply = await send(undefined, method, { origin: allowed[0] });
        assert.equal(reply.status, 405);
        assert.equal(reply.headers['access-control-allow-origin'], allowed[0]);
      }
      assert.equal((await send(undefined, 'GET', { host: 'evil.example' })).status, 421);
      assert.equal(reads, 2);
    },
  );
});

test('poller がなければ CORS つきの summary_unavailable を返す', async () => {
  const origin = 'http://127.0.0.1:47800';
  await withApp({ readOrigins: [origin] }, async (send) => {
    const reply = await send(undefined, 'GET', { origin });
    assert.equal(reply.status, 503);
    assert.deepEqual(reply.json(), { ok: false, error: 'summary_unavailable' });
    assert.equal(reply.headers['access-control-allow-origin'], origin);
    assert.equal(reply.headers.vary, 'Origin');
  });
});
