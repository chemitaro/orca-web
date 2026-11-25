import assert from 'node:assert/strict';
import { type IncomingHttpHeaders, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { ApexListDocument } from '../../src/apex/model.ts';
import { type AppOptions, createAppServer } from '../../src/server/app.ts';
import type { StateDocument } from '../../src/state/model.ts';
import { agent, fact, input, repo, worktree } from '../inbox/fixture.ts';

type Reply = { status: number; headers: IncomingHttpHeaders; text: string; json: <T>() => T };

async function withApp(
  options: AppOptions,
  run: (
    send: (path?: string, method?: string, headers?: Record<string, string>) => Promise<Reply>,
    origin: string,
  ) => Promise<void>,
) {
  const server = createAppServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const host = `127.0.0.1:${port}`;
  const send = (path = '/api/apexes', method = 'GET', headers: Record<string, string> = {}) =>
    new Promise<Reply>((resolve, reject) => {
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
    });
  try {
    await run(send, `http://${host}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function state(): StateDocument {
  return input({
    repos: [repo(), repo('repo-b', '別')],
    worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b' })],
    agents: [
      agent('a'),
      agent('b', { worktreeId: 'wt-b', state: fact('done') }),
      agent('lost', { worktreeId: 'wt-b', parentPaneKey: fact('gone') }),
    ],
  }).state;
}

test('T-07: 頂点の一覧を返し、読む前に見る人を記録し、CORS を付けない', async () => {
  let views = 0;
  await withApp(
    {
      runs: {
        noteViewer() {
          views++;
        },
        async snapshot() {
          assert.equal(views, 1);
          return state();
        },
      },
    },
    async (send, origin) => {
      const reply = await send('/api/apexes', 'GET', { origin });
      assert.equal(reply.status, 200);
      assert.equal(reply.headers['access-control-allow-origin'], undefined);
      const doc = reply.json<ApexListDocument>();
      assert.equal(doc.schema, 'orca-web.apexes/v1');
      assert.equal(doc.project, null);
      assert.deepEqual(
        doc.items.map((item) => item.id),
        ['a', 'b'],
      );
      assert.deepEqual(doc.counts, { needs_action: 0, working: 1, done: 1 });
      assert.equal(views, 1);
    },
  );
});

test('T-07: project で頂点と結べないものを絞り、counts は絞った後。513 字は 400', async () => {
  await withApp({ runs: { snapshot: async () => state(), noteViewer() {} } }, async (send) => {
    const doc = (await send('/api/apexes?project=repo-b')).json<ApexListDocument>();
    assert.equal(doc.project, 'repo-b');
    assert.deepEqual(
      doc.items.map((item) => item.id),
      ['b'],
    );
    assert.deepEqual(
      doc.unlinked.map((item) => item.id),
      ['lost'],
    );
    assert.deepEqual(doc.counts, { needs_action: 0, working: 0, done: 1 });
    assert.equal((await send(`/api/apexes?project=${'x'.repeat(513)}`)).status, 400);
    assert.equal((await send(`/api/apexes?project=${'x'.repeat(512)}`)).status, 200);
  });
});

test('T-07: Host・Origin・GET を守り、部品がなければ 503 apexes_unavailable。どれにも CORS を付けない', async () => {
  let reads = 0;
  await withApp(
    {
      runs: {
        snapshot: async () => {
          reads++;
          return state();
        },
        noteViewer() {},
      },
      readOrigins: ['http://127.0.0.1:47800'],
    },
    async (send) => {
      for (const [method, headers, status] of [
        ['GET', { origin: 'http://127.0.0.1:47800' }, 403],
        ['GET', { origin: 'null' }, 403],
        ['GET', { host: 'evil.example' }, 421],
        ['POST', {}, 405],
        ['PUT', {}, 405],
        ['OPTIONS', {}, 405],
        ['HEAD', {}, 405],
      ] as const) {
        const reply = await send('/api/apexes', method, headers);
        assert.equal(reply.status, status, method);
        assert.equal(reply.headers['access-control-allow-origin'], undefined);
      }
      assert.equal(reads, 0);
    },
  );
  await withApp({}, async (send) => {
    const reply = await send();
    assert.equal(reply.status, 503);
    assert.equal(reply.json<{ error: string }>().error, 'apexes_unavailable');
    assert.equal(reply.headers['access-control-allow-origin'], undefined);
  });
});
