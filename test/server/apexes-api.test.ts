import assert from 'node:assert/strict';
import { type IncomingHttpHeaders, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { ApexListDocument } from '../../src/apex/model.ts';
import { type AppOptions, createAppServer } from '../../src/server/app.ts';
import type { StateDocument } from '../../src/state/model.ts';
import type { StateWithExtras } from '../../src/state/poller.ts';
import { orchestration, tabbedWorker } from '../apex/fixture.ts';
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

test('R-05: /apexes を index と同じ CSP で配り、部品の JS を配り、ほかの画面の見出しからリンクする', async () => {
  await withApp({}, async (send) => {
    const index = await send('/');
    const page = await send('/apexes');
    assert.equal(page.status, 200);
    assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(page.headers['content-security-policy'], index.headers['content-security-policy']);
    assert.ok(page.text.includes('<title>指揮 — orca-web</title>'));
    assert.match(page.text, /src="\/apexes\.js"/);
    assert.ok(!/<script>[^<]/.test(page.text), 'no inline script');
    assert.ok(!/\sstyle=/.test(page.text), 'no inline style');
    assert.equal((await send('/apexes', 'POST')).status, 405);
    for (const path of ['/apexes.js', '/apexes-view.js', '/apexes-dom.js']) {
      const res = await send(path);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers['content-type'], 'text/javascript; charset=utf-8');
      assert.equal(res.headers['access-control-allow-origin'], undefined);
    }
    assert.equal((await send('/apexes.html')).status, 404);
    for (const path of ['/', '/runs', '/settings']) {
      assert.match((await send(path)).text, /<a href="\/apexes">指揮<\/a>/, path);
    }
  });
});

test('T-01: favicon の2つの SVG を image/svg+xml で配り、/apexes が普通の favicon を参照する', async () => {
  await withApp({}, async (send) => {
    for (const path of ['/favicon.svg', '/favicon-alert.svg']) {
      const res = await send(path);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers['content-type'], 'image/svg+xml', path);
      assert.match(res.text, /^<svg[\s\S]*<\/svg>\s*$/, path);
      assert.ok(!/<script/i.test(res.text), path);
    }
    assert.match((await send('/apexes')).text, /<link rel="icon" id="favicon" href="\/favicon\.svg"/);
  });
});

test('T-11: snapshotWithExtras があれば、内部の値で束を結び、対応表と memo を要求の間で保つ', async () => {
  const chat = agent('chat', { kind: 'chat-tab', paneKey: 'pane-chat', terminal: fact(null), state: fact('done') });
  const kid = tabbedWorker('kid', 'd1', 't-1', { parentPaneKey: fact('pane-chat') });
  const o = orchestration({
    tasks: [{ id: 't-root' }, { id: 't-1', parent: 't-root' }, { id: 't-2', parent: 't-root' }],
    dispatches: [
      { id: 'd1', task: 't-1', state: 'working' },
      { id: 'd2', task: 't-2', state: 'blocked', attention: ['input'] },
    ],
  });
  const reads: StateWithExtras[] = [
    {
      state: input({ agents: [chat, kid], tasks: o.tasks, workers: o.workers }).state,
      extras: o.extras,
      generation: 1,
    },
    { state: input({ agents: [chat], tasks: o.tasks, workers: o.workers }).state, extras: o.extras, generation: 2 },
  ];
  const staleRead = (): StateWithExtras => {
    const base = input({ agents: [chat], tasks: o.tasks, workers: o.workers }).state;
    return {
      state: { ...base, sources: { ...base.sources, workers: { ...base.sources.workers, stale: true } } },
      extras: o.extras,
      generation: 3,
    };
  };
  let plainReads = 0;
  await withApp(
    {
      runs: {
        noteViewer() {},
        async snapshot() {
          plainReads++;
          return reads[0]?.state as StateDocument;
        },
        async snapshotWithExtras() {
          return reads.shift() ?? staleRead();
        },
      },
    },
    async (send) => {
      const first = (await send()).json<ApexListDocument>();
      assert.deepEqual(first.items[0]?.counts, { total: 2, working: 2, waiting: 0, done: 0 });
      const second = (await send()).json<ApexListDocument>();
      assert.deepEqual(second.items[0]?.counts, { total: 2, working: 2, waiting: 0, done: 0 }, 'タブが閉じた後も結ぶ');
      assert.equal(second.items[0]?.status, 'needs_action');
      assert.ok(second.items[0]?.reasons.includes('question'));
      const third = (await send()).json<ApexListDocument>();
      assert.equal(third.items[0]?.status, 'needs_action', '鮮度が偽の間は memo の理由を使う');
      assert.equal(plainReads, 0);
    },
  );
});

test('T-11: /api/state の口には内部の値を出さない（snapshot だけを使う）', async () => {
  const o = orchestration({ runs: { 'run-a': 2 }, tasks: [{ id: 't-root', paneKey: 'pane-c', generation: 2 }] });
  await withApp(
    {
      poller: {
        noteViewer() {},
        snapshot: async () => input({ tasks: o.tasks }).state,
        snapshotWithExtras: async () => ({ state: input({ tasks: o.tasks }).state, extras: o.extras, generation: 1 }),
      },
    },
    async (send) => {
      const reply = await send('/api/state');
      assert.equal(reply.status, 200);
      for (const key of ['generation', 'paneKey":"pane-c', 'attention', 'consumerGeneration']) {
        assert.ok(!reply.text.includes(key), key);
      }
    },
  );
});
