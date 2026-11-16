// 古い id（構造化 Chat の ps の paneKey）の /embed/agent を、まとめたエージェントの id に転送する（iss-00039）。
import assert from 'node:assert/strict';
import { type IncomingHttpHeaders, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { type AppOptions, createAppServer, type StateSource } from '../../src/server/app.ts';
import { agent, input } from '../inbox/fixture.ts';

const PANE = 'structured-agent-session-s-1:1e844bd7-cd04-497b-abc5-1b92b2985573';
const CHAT_ID = 'chat:agent-session:s-1';

type Reply = { status: number; headers: IncomingHttpHeaders; text: string };

async function withApp(
  options: AppOptions,
  run: (send: (path: string, method?: string, host?: string) => Promise<Reply>) => Promise<void>,
) {
  const server = createAppServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const send = (path: string, method = 'GET', host = `127.0.0.1:${port}`) =>
    new Promise<Reply>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method, headers: { host } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString() }),
        );
      });
      req.on('error', reject);
      req.end();
    });
  try {
    await run(send);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function poller(views: { count: number }): StateSource {
  return {
    noteViewer() {
      views.count++;
    },
    async snapshot() {
      return input({
        agents: [
          agent(CHAT_ID, { kind: 'chat-tab', paneKey: PANE }),
          agent('structured-agent-session-other:x', { kind: 'untabbed', paneKey: 'structured-agent-session-other:x' }),
        ],
      }).state;
    },
  };
}

test('まとめたエージェントの paneKey の id は、ほかの引数を順のまま保って 302 で転送する', async () => {
  const views = { count: 0 };
  await withApp({ poller: poller(views) }, async (send) => {
    for (const method of ['GET', 'HEAD']) {
      const res = await send(`/embed/agent?id=${encodeURIComponent(PANE)}&theme=dark`, method);
      assert.equal(res.status, 302, method);
      assert.equal(res.headers.location, `/embed/agent?id=${encodeURIComponent(CHAT_ID)}&theme=dark`);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.equal(res.headers['content-security-policy'], undefined);
      assert.equal(res.headers['access-control-allow-origin'], undefined);
      assert.equal(res.text, '');
    }
    const first = await send(`/embed/agent?theme=light&id=${encodeURIComponent(PANE)}`);
    assert.equal(first.headers.location, `/embed/agent?theme=light&id=${encodeURIComponent(CHAT_ID)}`);
  });
  assert.equal(views.count, 0);
});

test('一致しない id、ほかの id、状態を読めない、poller なしは今のまま画面を返す', async () => {
  const views = { count: 0 };
  await withApp({ poller: poller(views) }, async (send) => {
    for (const id of ['structured-agent-session-other:x', 'structured-agent-session-none:y', CHAT_ID, 'tab:leaf']) {
      const res = await send(`/embed/agent?id=${encodeURIComponent(id)}`);
      assert.equal(res.status, 200, id);
      assert.equal(res.headers.location, undefined, id);
      assert.match(String(res.headers['content-type']), /text\/html/);
    }
    assert.equal((await send('/embed/agent')).status, 200);
  });
  const failing: StateSource = {
    noteViewer() {},
    async snapshot() {
      throw new Error('unreachable');
    },
  };
  await withApp({ poller: failing }, async (send) => {
    assert.equal((await send(`/embed/agent?id=${encodeURIComponent(PANE)}`)).status, 200);
  });
  await withApp({}, async (send) => {
    assert.equal((await send(`/embed/agent?id=${encodeURIComponent(PANE)}`)).status, 200);
  });
});

test('Host の守りは転送の前に効く', async () => {
  await withApp({ poller: poller({ count: 0 }) }, async (send) => {
    const res = await send(`/embed/agent?id=${encodeURIComponent(PANE)}`, 'GET', 'evil.example:80');
    assert.notEqual(res.status, 302);
    assert.equal(res.headers.location, undefined);
  });
});
