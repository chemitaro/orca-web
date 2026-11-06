import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWriter } from '../../web/write.js';

interface Call {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string; mode: string; referrerPolicy: string };
}

/** 偽の fetch。answer が URL ごとに応答（状態と JSON）を返す。 */
function fakeFetch(answer: (url: string, call: Call) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: Record<string, unknown>) => {
    const call = { url, init: init as unknown as Call['init'] };
    calls.push(call);
    const { status, body } = answer(url, call);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetch, calls };
}

const tokenBody = (n: number, expiresAt = '2026-11-06T00:10:00.000Z') => ({ ok: true, token: `t${n}`, expiresAt });

test('最初の書き込みの前に同じオリジンからトークンを得て、X-Orca-Web-Token の見出しで送る', async () => {
  let issued = 0;
  const { fetch, calls } = fakeFetch((url) => {
    if (url === '/api/token') return { status: 200, body: tokenBody(++issued) };
    return { status: 200, body: { ok: true } };
  });
  const writer = createWriter({ fetch, now: () => Date.parse('2026-11-06T00:00:00Z') });
  const res = await writer.send('/api/settings/fields', 'PUT', { selected: ['agent.model'] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(
    calls.map((c) => `${c.init.method} ${c.url}`),
    ['POST /api/token', 'PUT /api/settings/fields'],
  );
  const write = calls[1];
  assert.equal(write?.init.headers['x-orca-web-token'], 't1');
  assert.equal(write?.init.headers['content-type'], 'application/json');
  assert.equal(write?.init.body, JSON.stringify({ selected: ['agent.model'] }));
  for (const c of calls) {
    assert.equal(c.init.mode, 'same-origin');
    assert.equal(c.init.referrerPolicy, 'same-origin');
  }
  await writer.send('/api/open', 'POST', { worktree: 'w' });
  assert.equal(calls.filter((c) => c.url === '/api/token').length, 1, '期限内のトークンを使い回す');
});

test('期限が近いトークンは取り直し、401 なら取り直して1回だけ送り直す', async () => {
  let issued = 0;
  let rejectOnce = true;
  const { fetch, calls } = fakeFetch((url) => {
    if (url === '/api/token') return { status: 200, body: tokenBody(++issued) };
    if (rejectOnce) {
      rejectOnce = false;
      return { status: 401, body: { ok: false, error: 'token_invalid' } };
    }
    return { status: 200, body: { ok: true } };
  });
  let now = Date.parse('2026-11-06T00:00:00Z');
  const writer = createWriter({ fetch, now: () => now });
  const first = await writer.send('/api/open', 'POST', { worktree: 'w' });
  assert.equal(first.status, 200);
  assert.deepEqual(
    calls.map((c) => c.url),
    ['/api/token', '/api/open', '/api/token', '/api/open'],
  );
  now = Date.parse('2026-11-06T00:09:45Z');
  await writer.send('/api/open', 'POST', { worktree: 'w' });
  assert.equal(calls.filter((c) => c.url === '/api/token').length, 3, '期限の30秒前を過ぎたら取り直す');
});

test('送り直しても 401 なら、その応答を返し、3回目は送らない', async () => {
  const { fetch, calls } = fakeFetch((url) =>
    url === '/api/token'
      ? { status: 200, body: tokenBody(1) }
      : { status: 401, body: { ok: false, error: 'token_invalid' } },
  );
  const writer = createWriter({ fetch, now: () => Date.parse('2026-11-06T00:00:00Z') });
  const res = await writer.send('/api/open', 'POST', { worktree: 'w' });
  assert.equal(res.status, 401);
  assert.equal(calls.filter((c) => c.url === '/api/open').length, 2);
});

test('トークンを得られなければ例外にし、書き込みを送らない', async () => {
  const { fetch, calls } = fakeFetch(() => ({ status: 403, body: { ok: false, error: 'origin_rejected' } }));
  const writer = createWriter({ fetch, now: () => 0 });
  await assert.rejects(writer.send('/api/open', 'POST', { worktree: 'w' }), /token/);
  assert.deepEqual(
    calls.map((c) => c.url),
    ['/api/token'],
  );
});
