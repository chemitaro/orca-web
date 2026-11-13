import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createTranscriptReader } from '../../src/orca/read-transcript.ts';
import { ReadOnlyRpc } from '../../src/orca/rpc.ts';
import { createAppServer } from '../../src/server/app.ts';
import { StatePoller } from '../../src/state/poller.ts';
import { TranscriptHub } from '../../src/transcript/hub.ts';
import { encodeBefore } from '../../src/transcript/normalize.ts';
import { report, staticReader } from '../state/helpers.ts';
import {
  CHAT_TAB,
  capabilities,
  FakeRpc,
  fakeOrca,
  ok,
  PANE_CLAUDE,
  PANE_SLEEPING,
  SESSION_CLAUDE,
  TRANSCRIPT_PATH,
  tabsInventory,
} from '../transcript/fixture.ts';

interface Harness {
  port: number;
  host: string;
  rpc: FakeRpc;
  hub: TranscriptHub;
  get(
    path: string,
    headers?: Record<string, string>,
  ): Promise<{ status: number; headers: Record<string, unknown>; text: string }>;
}

async function withApp(
  fn: (h: Harness) => Promise<void>,
  options: {
    rpc?: FakeRpc;
    caps?: ReturnType<typeof capabilities>;
    maxWatches?: number;
    maxSubscribers?: number;
    poller?: StatePoller;
    now?: () => number;
  } = {},
): Promise<void> {
  const rpc = options.rpc ?? fakeOrca();
  const caps = options.caps ?? capabilities();
  const reader = createTranscriptReader({
    rpc: new ReadOnlyRpc(rpc),
    capabilities: async () => caps,
    isUntabbedAgent: (id) =>
      options.poller?.snapshotSync().agents.some((a) => a.id === id && a.kind === 'untabbed') ?? false,
    ...(options.now ? { now: options.now } : {}),
  });
  const hub = new TranscriptHub({
    reader,
    tailIntervalMs: 0,
    maxWatches: options.maxWatches ?? 8,
    maxSubscribers: options.maxSubscribers ?? 32,
    ...(options.now ? { now: options.now } : {}),
  });
  const server = createAppServer({
    transcripts: { reader, hub },
    readOrigins: ['http://127.0.0.1:47800'],
    ...(options.poller ? { poller: options.poller } : {}),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const host = `127.0.0.1:${port}`;
  const get: Harness['get'] = (path, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, headers: { host, ...headers }, setHost: false }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }),
        );
      });
      req.on('error', reject);
      req.end();
    });
  try {
    await fn({ port, host, rpc, hub, get });
  } finally {
    hub.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const q = (agent: string, extra = '') => `/api/transcript?agent=${encodeURIComponent(agent)}${extra}`;

test('GET /api/transcript は正規化した会話を返し、記録のパス、セッションの識別子の全体、Orca の誤りの文を含まない', async () => {
  await withApp(async (h) => {
    const res = await h.get(q(PANE_CLAUDE));
    assert.equal(res.status, 200);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    const body = JSON.parse(res.text);
    assert.equal(body.schema, 'orca-web.transcript/v1');
    assert.equal(body.ok, true);
    assert.deepEqual(
      body.messages.map((m: { id: string }) => m.id),
      ['m1', 'm2', 'm3', 'm4', 'm5'],
    );
    assert.equal(body.hasMore, true);
    assert.equal(typeof body.before, 'string');
    assert.ok(!res.text.includes(TRANSCRIPT_PATH));
    assert.ok(!res.text.includes(SESSION_CLAUDE));
    assert.ok(!res.text.includes('reasoning'));
  });
});

test('limit を渡し、範囲の外や形の違う引数は 400', async () => {
  await withApp(async (h) => {
    assert.equal((await h.get(q(PANE_CLAUDE, '&limit=10'))).status, 200);
    const call = h.rpc.calls.find((c) => c.method === 'nativeChat.readSession');
    assert.equal((call?.params as { limit?: number } | undefined)?.limit, 10);
    for (const bad of [
      '&limit=0',
      '&limit=201',
      '&limit=abc',
      '&limit=-1',
      '&limit=1.5',
      '&limit=',
      '&before=***',
      '&before=',
    ]) {
      assert.equal((await h.get(q(PANE_CLAUDE, bad))).status, 400, bad);
    }
    assert.equal((await h.get('/api/transcript')).status, 400);
    const missing = await h.get('/api/transcript/events');
    assert.equal(missing.status, 400);
    assert.deepEqual(JSON.parse(missing.text), { ok: false, error: 'invalid_request' });
  });
});

test('before で前のページを読み、セッションの鍵が今と違えば 409 で読まない', async () => {
  await withApp(async (h) => {
    const first = JSON.parse((await h.get(q(PANE_CLAUDE))).text);
    const older = await h.get(q(PANE_CLAUDE, `&before=${first.before}`));
    assert.equal(older.status, 200);
    const call = h.rpc.calls.filter((c) => c.method === 'nativeChat.readSession').at(-1);
    assert.equal((call?.params as { beforeOffset?: number } | undefined)?.beforeOffset, 1200);

    const reads = h.rpc.calls.filter((c) => c.method === 'nativeChat.readSession').length;
    const stale = encodeBefore('ffffffffffffffff', { offset: 1200 });
    const res = await h.get(q(PANE_CLAUDE, `&before=${stale}`));
    assert.equal(res.status, 409);
    assert.deepEqual(JSON.parse(res.text), { ok: false, error: 'session_changed' });
    assert.equal(h.rpc.calls.filter((c) => c.method === 'nativeChat.readSession').length, reads);
  });
});

test('誤りの種類を区別した code と HTTP の状態で返し、0件の会話は読めたときだけ', async () => {
  await withApp(async (h) => {
    assert.deepEqual(
      [(await h.get(q('tab-9:leaf-9'))).status, JSON.parse((await h.get(q('tab-9:leaf-9'))).text).error],
      [404, 'agent_not_found'],
    );
    assert.equal(JSON.parse((await h.get(q(PANE_SLEEPING))).text).error, 'no_session');
  });
  const rpc = fakeOrca();
  rpc.handlers['nativeChat.readSession'] = () => ok({ error: 'ENOENT /Users/someone/x.jsonl', notFound: true });
  await withApp(
    async (h) => {
      const res = await h.get(q(PANE_CLAUDE));
      assert.equal(res.status, 404);
      assert.deepEqual(JSON.parse(res.text), { ok: false, error: 'transcript_not_found' });
    },
    { rpc },
  );
  await withApp(async (h) => assert.equal((await h.get(q(PANE_CLAUDE))).status, 503), {
    caps: capabilities({ connected: false }),
  });
  await withApp(async (h) => assert.equal((await h.get(q(PANE_CLAUDE))).status, 501), {
    caps: capabilities({ readTranscript: false }),
  });
  const odd = fakeOrca();
  odd.handlers['nativeChat.readSession'] = () => ok({ messages: [{ nope: 1 }], hasMore: false });
  await withApp(async (h) => assert.equal((await h.get(q(PANE_CLAUDE))).status, 502), { rpc: odd });
  const empty = new FakeRpc({
    'session.tabs.listAll': () => ok(tabsInventory()),
    'nativeChat.readSession': () => ok({ messages: [], hasMore: false, beforeOffset: 0 }),
  });
  await withApp(
    async (h) => {
      const res = await h.get(q(PANE_CLAUDE));
      assert.equal(res.status, 200);
      assert.deepEqual(JSON.parse(res.text).messages, []);
    },
    { rpc: empty },
  );
});

test('状態の API の untabbed の id は404 no_session になり、記録を読まない', async () => {
  const poller = new StatePoller({ reader: await staticReader(), capabilities: async () => report() });
  await withApp(
    async (h) => {
      const state = JSON.parse((await h.get('/api/state')).text);
      const agent = state.agents.find((a: { kind: string }) => a.kind === 'untabbed');
      assert.ok(agent);
      const res = await h.get(q(agent.id));
      assert.equal(res.status, 404);
      assert.deepEqual(JSON.parse(res.text), { ok: false, error: 'no_session' });
      assert.equal(
        h.rpc.calls.filter((c) => c.method === 'nativeChat.readSession' || c.method === 'agentSession.history').length,
        0,
      );
    },
    { poller },
  );
});

test('読み取り失敗の HTTP 状態と本文は固定の code だけで、Orca の文を出さない', async () => {
  for (const [outcome, status, error] of [
    [ok({ error: '仮の非公開の詳細' }), 502, 'read_failed'],
    [ok({ messages: '仮の非公開の詳細', hasMore: false }), 502, 'unknown_shape'],
    [{ ok: false, kind: 'unavailable', message: '仮の非公開の詳細' }, 503, 'unreachable'],
    [{ ok: false, kind: 'orca-error', code: 'method_not_found', message: '仮の非公開の詳細' }, 501, 'unsupported'],
  ] as const) {
    const rpc = fakeOrca();
    rpc.handlers['nativeChat.readSession'] = () => outcome;
    await withApp(
      async (h) => {
        const res = await h.get(q(PANE_CLAUDE));
        assert.equal(res.status, status);
        assert.deepEqual(JSON.parse(res.text), { ok: false, error });
        assert.equal(res.headers['access-control-allow-origin'], undefined);
      },
      { rpc },
    );
  }
});

test('会話の API は別のオリジンを 403 で拒み、CORS を付けず、GET のほかは 405', async () => {
  await withApp(async (h) => {
    const cross = await h.get(q(PANE_CLAUDE), { origin: 'http://127.0.0.1:47800' });
    assert.equal(cross.status, 403);
    assert.equal(cross.headers['access-control-allow-origin'], undefined);
    const same = await h.get(q(PANE_CLAUDE), { origin: `http://${h.host}` });
    assert.equal(same.status, 200);
    const events = await h.get('/api/transcript/events?agent=x', { origin: 'http://evil.example' });
    assert.equal(events.status, 403);
    const evilHost = await h.get(q(PANE_CLAUDE), { host: `evil.example:${h.port}` });
    assert.equal(evilHost.status, 421);
  });
  await withApp(async (h) => {
    const res = await new Promise<number>((resolve, reject) => {
      const req = request(
        { host: '127.0.0.1', port: h.port, method: 'POST', path: q(PANE_CLAUDE), headers: { host: h.host } },
        (r) => {
          r.resume();
          resolve(r.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(res, 405);
  });
});

/** SSE を開き、出来事を受ける。 */
function openEvents(h: Harness, agent: string, extraHeaders: Record<string, string> = {}) {
  const events: { event: string; data: unknown }[] = [];
  let buffer = '';
  let headers: Record<string, unknown> = {};
  let status = 0;
  let ended = false;
  let retry: number | null = null;
  const waiters: (() => void)[] = [];
  const req = request(
    {
      host: '127.0.0.1',
      port: h.port,
      path: `/api/transcript/events?agent=${encodeURIComponent(agent)}`,
      headers: { host: h.host, ...extraHeaders },
      setHost: false,
    },
    (res) => {
      status = res.statusCode ?? 0;
      headers = res.headers;
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let end = buffer.indexOf('\n\n');
        while (end !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const name = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          const retryText = /^retry: (\d+)$/m.exec(block)?.[1];
          if (retryText) retry = Number(retryText);
          if (name && data) events.push({ event: name, data: JSON.parse(data) });
          for (const w of waiters.splice(0)) w();
          end = buffer.indexOf('\n\n');
        }
      });
      res.on('end', () => {
        ended = true;
        for (const w of waiters.splice(0)) w();
      });
    },
  );
  req.end();
  const until = async (n: number) => {
    while (events.length < n) {
      assert.equal(ended, false, '必要な出来事が届く前に接続が閉じた');
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  };
  const untilClosed = async () => {
    while (!ended) await new Promise<void>((resolve) => waiters.push(resolve));
  };
  return {
    events,
    until,
    untilClosed,
    retry: () => retry,
    close: () => req.destroy(),
    status: () => status,
    headers: () => headers,
  };
}

test('SSE の道は snapshot の文書を送り、足された件を appended で送る。CORS を付けない', async () => {
  const rpc = fakeOrca();
  const messages = [{ id: 'm1', role: 'user', blocks: [{ type: 'text', text: 'one' }], timestamp: null }];
  rpc.handlers['nativeChat.readSession'] = () => ok({ messages: [...messages], hasMore: false, beforeOffset: 0 });
  await withApp(
    async (h) => {
      const s = openEvents(h, PANE_CLAUDE);
      await s.until(1);
      assert.equal(s.status(), 200);
      assert.equal(s.retry(), 5000);
      assert.equal(s.headers()['content-type'], 'text/event-stream; charset=utf-8');
      assert.equal(s.headers()['access-control-allow-origin'], undefined);
      const first = s.events[0];
      assert.ok(first);
      assert.equal(first.event, 'snapshot');
      const doc = (first.data as unknown as { document: { messages: { id: string }[]; session: { key: string } } })
        .document;
      assert.deepEqual(
        doc.messages.map((m) => m.id),
        ['m1'],
      );
      messages.push({ id: 'm2', role: 'assistant', blocks: [{ type: 'text', text: 'two' }], timestamp: null });
      await h.hub.tick();
      await s.until(2);
      assert.equal(s.events[1]?.event, 'appended');
      const appended = s.events[1]?.data as { session: { key: string }; items: { id: string }[]; updated: unknown[] };
      assert.equal(appended.session.key, doc.session.key);
      assert.deepEqual(
        appended.items.map((m) => m.id),
        ['m2'],
      );
      assert.deepEqual(appended.updated, []);
      s.close();
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(h.hub.subscriberCount, 0, '接続が閉じたら購読をやめる');
    },
    { rpc },
  );
});

test('SSE の道は、見張りの上限で unavailable（busy）を送って閉じる', async () => {
  await withApp(
    async (h) => {
      const one = openEvents(h, PANE_CLAUDE);
      await one.until(1);
      const two = openEvents(h, CHAT_TAB);
      await two.until(1);
      assert.deepEqual(two.events[0], { event: 'unavailable', data: { error: 'busy' } });
      await two.untilClosed();
      one.close();
    },
    { maxWatches: 1 },
  );
});

test('両方の会話の道は GET 以外を405、異なる Origin と Host を拒み、CORS を付けない', async () => {
  await withApp(async (h) => {
    for (const route of [q(PANE_CLAUDE), `/api/transcript/events?agent=${encodeURIComponent(PANE_CLAUDE)}`]) {
      for (const method of ['HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
        const res = await fetch(`http://${h.host}${route}`, { method });
        assert.equal(res.status, 405, `${route} ${method}`);
        assert.equal(res.headers.get('access-control-allow-origin'), null);
        await res.arrayBuffer();
      }
      for (const origin of ['http://127.0.0.1:47800', 'null', `https://${h.host}`, 'http://evil.example']) {
        const res = await h.get(route, { origin });
        assert.equal(res.status, 403);
        assert.deepEqual(JSON.parse(res.text), { ok: false, error: 'forbidden_origin' });
        assert.equal(res.headers['access-control-allow-origin'], undefined);
      }
      assert.equal((await h.get(route, { host: `evil.example:${h.port}` })).status, 421);
    }
    assert.equal(h.rpc.calls.length, 0, '拒否した要求は Orca に届かない');
  });
});

test('SSE は更新、書き換え、unavailable、回復、セッション変更の名前と本文を区別する', { timeout: 5_000 }, async () => {
  const rpc = fakeOrca();
  let now = 0;
  const row = (id: string, text: string) => ({ id, role: 'assistant', blocks: [{ type: 'text', text }] });
  let messages = [row('m1', '仮の開始')];
  rpc.handlers['nativeChat.readSession'] = () => ok({ messages, hasMore: false });
  await withApp(
    async (h) => {
      const s = openEvents(h, PANE_CLAUDE, { origin: `http://${h.host}` });
      await s.until(1);
      const snapshot = s.events[0]?.data as { document: { session: { key: string }; schema: string } };
      assert.equal(snapshot.document.schema, 'orca-web.transcript/v1');
      const key = snapshot.document.session.key;
      const normalized = (id: string, text: string) => ({
        id,
        role: 'assistant',
        at: null,
        parts: [{ type: 'text', text }],
      });
      messages = [row('m1', '仮の完了')];
      await h.hub.tick();
      await s.until(2);
      assert.deepEqual(s.events[1], {
        event: 'appended',
        data: { session: { key }, items: [], updated: [normalized('m1', '仮の完了')] },
      });
      messages = [row('rewrite', '仮の書き換え')];
      await h.hub.tick();
      await s.until(3);
      const rewritten = s.events[2]?.data as {
        reason: string;
        document: { session: { key: string }; messages: unknown[] };
      };
      assert.equal(s.events[2]?.event, 'replacement');
      assert.equal(rewritten.reason, 'rewritten');
      assert.equal(rewritten.document.session.key, key);
      assert.deepEqual(rewritten.document.messages, [normalized('rewrite', '仮の書き換え')]);
      rpc.handlers['nativeChat.readSession'] = () => ok({ error: '仮の非公開の詳細' });
      await h.hub.tick();
      await s.until(4);
      assert.deepEqual(s.events[3], { event: 'unavailable', data: { error: 'read_failed' } });
      rpc.handlers['nativeChat.readSession'] = () => ok({ messages: [], hasMore: false });
      await h.hub.tick();
      await s.until(5);
      const recovered = s.events[4]?.data as { reason: string; document: { messages: unknown[] } };
      assert.equal(s.events[4]?.event, 'replacement');
      assert.equal(recovered.reason, 'recovered');
      assert.deepEqual(recovered.document.messages, []);
      rpc.handlers['session.tabs.listAll'] = () => ok(tabsInventory({ claudeSession: 'new-fake-session' }));
      now += 5_000;
      await h.hub.tick();
      await s.until(6);
      const changed = s.events[5]?.data as { reason: string; document: { session: { key: string } } };
      assert.equal(s.events[5]?.event, 'replacement');
      assert.equal(changed.reason, 'session-changed');
      assert.notEqual(changed.document.session.key, key);
      assert.equal(s.headers()['access-control-allow-origin'], undefined);
      s.close();
    },
    { rpc, now: () => now },
  );
});

test('SSE の購読者の上限でも busy を送って接続を閉じる', { timeout: 5_000 }, async () => {
  await withApp(
    async (h) => {
      const one = openEvents(h, PANE_CLAUDE);
      await one.until(1);
      const two = openEvents(h, PANE_CLAUDE);
      await two.until(1);
      assert.deepEqual(two.events, [{ event: 'unavailable', data: { error: 'busy' } }]);
      await two.untilClosed();
      assert.equal(h.hub.subscriberCount, 1);
      one.close();
    },
    { maxSubscribers: 1 },
  );
});

test('/embed/agent は inline を許さない CSP と、読み取りのオリジンだけの frame-ancestors で配る', async () => {
  await withApp(async (h) => {
    const page = await h.get('/embed/agent?id=x');
    assert.equal(page.status, 200);
    const csp = String(page.headers['content-security-policy']);
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /style-src 'self'(;|$)/);
    assert.match(csp, /connect-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors http:\/\/127\.0\.0\.1:47800(;|$)/);
    assert.ok(!csp.includes('unsafe-inline'));
    for (const path of ['/embed/agent-frame.js', '/embed/agent-view.js', '/embed/agent-dom.js', '/embed/agent.css']) {
      assert.equal((await h.get(path)).status, 200, path);
    }
  });
});

test('会話の道を持たないサーバーは 503 を返す', async () => {
  const server = createAppServer({});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/transcript?agent=x`);
    assert.equal(res.status, 503);
    await res.arrayBuffer();
    const embed = await fetch(`http://127.0.0.1:${port}/embed/agent?id=x`);
    assert.equal(embed.status, 200);
    assert.match(embed.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'(;|$)/);
    await embed.arrayBuffer();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
