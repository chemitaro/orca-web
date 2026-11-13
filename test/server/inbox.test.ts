import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { InboxDocument } from '../../src/inbox/model.ts';
import { type AppOptions, createAppServer } from '../../src/server/app.ts';
import { StatePoller } from '../../src/state/poller.ts';
import { agent, fact, input, message, repo, worktree } from '../inbox/fixture.ts';
import { report, staticReader } from '../state/helpers.ts';

async function withApp(
  options: AppOptions,
  run: (
    send: (
      path?: string,
      method?: string,
      headers?: Record<string, string>,
    ) => Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; json: () => InboxDocument }>,
    origin: string,
  ) => Promise<void>,
) {
  const server = createAppServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const host = `127.0.0.1:${port}`;
  const send = (path = '/api/inbox', method = 'GET', headers: Record<string, string> = {}) =>
    new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; json: () => InboxDocument }>(
      (resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port, path, method, headers: { host, ...headers } }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
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

test('inbox は文書を返し、project で絞り、許可した読取OriginにもCORSを付けない', async () => {
  let views = 0;
  const inputs = input({
    repos: [repo(), repo('repo-b', '別の仮のプロジェクト')],
    worktrees: [worktree(), worktree({ id: 'wt-b', repoId: 'repo-b' })],
    agents: [
      agent('agent-a', { state: fact('waiting') }),
      agent('agent-b', { worktreeId: 'wt-b', state: fact('done') }),
    ],
  });
  await withApp(
    {
      inbox: {
        snapshot: async () => inputs,
        noteViewer() {
          views++;
        },
      },
      stallMinutes: 60,
      readOrigins: ['http://127.0.0.1:47800'],
    },
    async (send, origin) => {
      const all = await send('/api/inbox', 'GET', { origin });
      assert.equal(all.status, 200);
      assert.equal(all.json().schema, 'orca-web.inbox/v1');
      assert.equal(all.json().stallMinutes, 60);
      assert.equal(all.json().stages.flatMap((s: { items: unknown[] }) => s.items).length, 2);
      assert.equal(all.headers['access-control-allow-origin'], undefined);
      const filtered = await send('/api/inbox?project=repo-b');
      assert.equal(filtered.status, 200);
      assert.deepEqual(
        filtered
          .json()
          .stages.flatMap((s: { items: { id: string }[] }) => s.items)
          .map((i: { id: string }) => i.id),
        ['agent:agent-b'],
      );
      assert.equal(views, 2);
    },
  );
});

test('inbox はHostと同じOriginを守り、GET以外405、長いproject400、未設定503、常にCORSなし', async () => {
  let reads = 0;
  await withApp(
    {
      inbox: {
        snapshot: async () => {
          reads++;
          return input();
        },
        noteViewer() {},
      },
      readOrigins: ['http://127.0.0.1:47800'],
    },
    async (send) => {
      for (const [path, method, headers, status] of [
        ['/api/inbox', 'GET', { origin: 'http://127.0.0.1:47800' }, 403],
        ['/api/inbox', 'GET', { origin: 'null' }, 403],
        ['/api/inbox', 'GET', { host: 'evil.example' }, 421],
        ['/api/inbox', 'POST', {}, 405],
        ['/api/inbox', 'OPTIONS', {}, 405],
        ['/api/inbox', 'HEAD', {}, 405],
        [`/api/inbox?project=${'x'.repeat(513)}`, 'GET', {}, 400],
      ] as const) {
        const r = await send(path, method, headers);
        assert.equal(r.status, status);
        assert.equal(r.headers['access-control-allow-origin'], undefined);
      }
      assert.equal(reads, 0);
      assert.equal((await send(`/api/inbox?project=${'x'.repeat(512)}`)).status, 200);
    },
  );
  await withApp({}, async (send) => {
    const r = await send();
    assert.equal(r.status, 503);
    assert.equal(r.headers['access-control-allow-origin'], undefined);
  });
});

test('Orca不達時も実際のpollerから最後の内容とstaleとconnectionをHTTPで返す', async () => {
  let connected = true;
  let now = Date.parse('2026-11-13T00:00:00Z');
  const reader = await staticReader();
  const poller = new StatePoller({
    reader,
    now: () => now,
    capabilities: async () => report({ connected }),
    mailReader: {
      async readRunMail(runId) {
        return { ok: true, data: [message({ id: `m:${runId}`, runId })], truncated: false };
      },
      async readGates() {
        return { ok: true, data: [], truncated: false };
      },
    },
  });
  await withApp(
    { inbox: { snapshot: () => poller.inboxSnapshot(), noteViewer: () => poller.noteInboxViewer() } },
    async (send) => {
      const first = await send();
      assert.equal(first.status, 200);
      assert.equal(first.json().connection.state, 'connected');
      connected = false;
      now += 10000;
      await poller.tick();
      const last = await send();
      assert.equal(last.status, 200);
      assert.deepEqual(last.json().stages, first.json().stages);
      assert.equal(last.json().stale, true);
      assert.equal(last.json().sources.mail.stale, true);
      assert.equal(last.json().sources.mail.lastSuccessAt, first.json().sources.mail.lastSuccessAt);
      assert.equal(last.json().connection.state, 'unreachable');
    },
  );
});
