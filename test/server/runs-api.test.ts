import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { RunListDocument, RunTreeDocument } from '../../src/runs/model.ts';
import { type AppOptions, createAppServer } from '../../src/server/app.ts';
import { run, state } from '../runs/fixture.ts';

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
  const send = (path = '/api/runs', method = 'GET', headers: Record<string, string> = {}) =>
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

test('Run 一覧は状態の文書から返し、読む前に見る人を記録する', async () => {
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
      const reply = await send('/api/runs', 'GET', { origin });
      assert.equal(reply.status, 200);
      const doc = reply.json<RunListDocument>();
      assert.equal(doc.schema, 'orca-web.runs/v1');
      assert.deepEqual(
        doc.runs.map((r) => r.id),
        ['run-a'],
      );
      assert.equal(doc.runs[0]?.workers, 1);
      assert.equal(reply.headers['access-control-allow-origin'], undefined);
      assert.equal(views, 1);
    },
  );
});

test('Run 一覧は project で節のある Run を絞る', async () => {
  const doc = state({
    runs: [
      run(),
      run({
        id: 'run-b',
        coordinatorHandle: null,
        coordinatorWorktreeId: { value: null, source: null, field: null, missing: 'not-provided' },
      }),
    ],
  });
  await withApp({ runs: { snapshot: async () => doc, noteViewer() {} } }, async (send) => {
    assert.deepEqual(
      (await send('/api/runs?project=repo-a')).json<RunListDocument>().runs.map((r) => r.id),
      ['run-a'],
    );
    assert.deepEqual((await send('/api/runs?project=absent')).json<RunListDocument>().runs, []);
    assert.equal((await send(`/api/runs?project=${'x'.repeat(513)}`)).status, 400);
    assert.equal((await send(`/api/runs?project=${'x'.repeat(512)}`)).status, 200);
  });
});

test('Run の木は文書を返し、未知 id は404、不正 id は400で返す', async () => {
  let views = 0;
  await withApp(
    {
      runs: {
        snapshot: async () => {
          assert.ok(views > 0);
          return state();
        },
        noteViewer() {
          views++;
        },
      },
    },
    async (send, origin) => {
      const reply = await send('/api/runs/run-a/tree', 'GET', { origin });
      assert.equal(reply.status, 200);
      const doc = reply.json<RunTreeDocument>();
      assert.equal(doc.schema, 'orca-web.run-tree/v1');
      assert.equal(doc.run.id, 'run-a');
      assert.equal(doc.root.role, 'coordinator');
      assert.equal(doc.counts.workers, 1);
      assert.equal(views, 1);
      assert.equal((await send('/api/runs/absent/tree')).status, 404);
      assert.equal((await send(`/api/runs/${'a'.repeat(128)}/tree`)).status, 404);
      for (const id of ['', 'bad.id', 'bad%20id', '%2F', '%ZZ', 'a'.repeat(129)]) {
        assert.equal((await send(`/api/runs/${id}/tree`)).status, 400, id);
      }
    },
  );
});

test('Run API は Host・Origin・GET を守り、未設定503、成功にも失敗にも CORS を付けない', async () => {
  let reads = 0;
  let views = 0;
  await withApp(
    {
      runs: {
        snapshot: async () => {
          reads++;
          return state();
        },
        noteViewer() {
          views++;
        },
      },
      readOrigins: ['http://127.0.0.1:47800'],
    },
    async (send) => {
      for (const path of ['/api/runs', '/api/runs/run-a/tree']) {
        for (const [method, headers, status] of [
          ['GET', { origin: 'http://127.0.0.1:47800' }, 403],
          ['GET', { origin: 'null' }, 403],
          ['GET', { host: 'evil.example' }, 421],
          ['POST', {}, 405],
          ['PUT', {}, 405],
          ['DELETE', {}, 405],
          ['OPTIONS', {}, 405],
          ['HEAD', {}, 405],
        ] as const) {
          const reply = await send(path, method, headers);
          assert.equal(reply.status, status, `${method} ${path}`);
          assert.equal(reply.headers['access-control-allow-origin'], undefined);
        }
      }
      assert.equal(reads, 0);
      assert.equal(views, 0);
    },
  );
  await withApp({}, async (send) => {
    for (const path of ['/api/runs', '/api/runs/run-a/tree']) {
      const reply = await send(path);
      assert.equal(reply.status, 503);
      assert.equal(reply.headers['access-control-allow-origin'], undefined);
    }
  });
});

test('Run 一覧・木・プロジェクトの画面を index と同じ CSP で配る', async () => {
  await withApp({ readOrigins: ['http://127.0.0.1:47800'] }, async (send) => {
    const index = await send('/');
    for (const [path, title] of [
      ['/runs', 'Run の一覧'],
      ['/runs/run-a', 'オーケストレーションの木'],
      ['/projects/repo-a', 'プロジェクト'],
      ['/projects/repo%2Fa%20%E4%BB%AE', 'プロジェクト'],
    ]) {
      const reply = await send(path);
      assert.equal(reply.status, 200, path);
      assert.equal(reply.headers['content-type'], 'text/html; charset=utf-8');
      assert.equal(reply.headers['content-security-policy'], index.headers['content-security-policy']);
      assert.equal(reply.headers['referrer-policy'], 'same-origin');
      assert.equal(reply.headers['x-content-type-options'], 'nosniff');
      assert.ok(reply.text.includes(`<title>${title}</title>`));
      const head = await send(path, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.text, '');
      assert.equal((await send(path, 'POST')).status, 405);
    }
    assert.equal((await send(`/runs/${'a'.repeat(128)}`)).status, 200);
    assert.equal((await send(`/projects/${'a'.repeat(512)}`)).status, 200);
    for (const path of [
      '/runs/',
      '/runs/bad.id',
      '/runs/bad%20id',
      '/runs/%2F',
      '/runs/%ZZ',
      `/runs/${'a'.repeat(129)}`,
      '/runs/run-a/extra',
      '/projects/',
      '/projects/%ZZ',
      '/projects/repo/extra',
      `/projects/${'a'.repeat(513)}`,
    ]) {
      assert.equal((await send(path)).status, 404, path);
    }
  });
});

test('木・一覧・プロジェクトの画面は絶対パスのスクリプトと CSS を読み、その JavaScript を配り、受け箱は /runs にリンクする', async () => {
  await withApp({}, async (send) => {
    for (const [path, script] of [
      ['/runs', '/runs.js'],
      ['/runs/run-a', '/run.js'],
      ['/projects/repo-a', '/project.js'],
    ]) {
      const page = await send(path);
      assert.ok(page.text.includes(`<script type="module" src="${script}"></script>`), path);
      assert.ok(page.text.includes('<link rel="stylesheet" href="/style.css" />'), path);
      assert.ok(!/<script>[^<]/.test(page.text), 'no inline script');
      assert.ok(!/\sstyle=/.test(page.text), 'no inline style');
    }
    for (const path of ['/runs.js', '/run.js', '/project.js', '/runs-view.js', '/runs-dom.js']) {
      const reply = await send(path);
      assert.equal(reply.status, 200, path);
      assert.equal(reply.headers['content-type'], 'text/javascript; charset=utf-8');
    }
    const inbox = await send('/');
    assert.match(inbox.text, /href="\/runs"/);
    assert.match(inbox.text, /id="project-link"/);
  });
});
