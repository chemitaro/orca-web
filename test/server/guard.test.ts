import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { checkHost, checkSameOriginWrite, checkToken, TokenStore } from '../../src/server/guard.ts';

const hosts = new Set(['127.0.0.1:8791', 'localhost:8791', '100.64.1.2:8791']);

const post = (headers: Record<string, string | undefined>) => ({
  method: 'POST',
  headers: {
    host: '127.0.0.1:8791',
    origin: 'http://127.0.0.1:8791',
    'content-type': 'application/json',
    'sec-fetch-site': 'same-origin',
    ...headers,
  },
});

const rejected = (r: { ok: boolean }, status: number, error: string) =>
  assert.deepEqual(r, { ok: false, status, error });

test('checkHost は許す Host との完全一致だけを通し、ほかは 421', () => {
  for (const host of ['127.0.0.1:8791', 'localhost:8791', '100.64.1.2:8791']) {
    assert.deepEqual(checkHost({ headers: { host } }, hosts), { ok: true });
  }
  for (const host of [
    '127.0.0.1',
    '127.0.0.1:8792',
    'evil.example:8791',
    '127.0.0.1:8791.evil',
    'LOCALHOST:8791',
    '',
  ]) {
    rejected(checkHost({ headers: { host } }, hosts), 421, 'misdirected_host');
  }
  rejected(checkHost({ headers: {} }, hosts), 421, 'misdirected_host');
});

test('checkSameOriginWrite はそろった同じオリジンの JSON の書き込みを、決めた method だけで通す', () => {
  assert.deepEqual(checkSameOriginWrite(post({}), 'POST'), { ok: true });
  assert.deepEqual(checkSameOriginWrite({ ...post({}), method: 'PUT' }, 'PUT'), { ok: true });
  assert.deepEqual(checkSameOriginWrite(post({ 'content-type': 'application/json; charset=utf-8' }), 'POST'), {
    ok: true,
  });
  assert.deepEqual(checkSameOriginWrite(post({ 'sec-fetch-site': undefined }), 'POST'), { ok: true });
  assert.deepEqual(checkSameOriginWrite(post({ host: '100.64.1.2:8791', origin: 'http://100.64.1.2:8791' }), 'POST'), {
    ok: true,
  });
});

test('checkSameOriginWrite は違う method、JSON でない型、Origin の欠け・null・別の値、cross-site を拒む', () => {
  rejected(checkSameOriginWrite({ ...post({}), method: 'GET' }, 'POST'), 405, 'method_not_allowed');
  rejected(checkSameOriginWrite(post({}), 'PUT'), 405, 'method_not_allowed');
  for (const type of [
    undefined,
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'application/jsonx',
  ]) {
    rejected(checkSameOriginWrite(post({ 'content-type': type }), 'POST'), 415, 'unsupported_media_type');
  }
  for (const origin of [
    undefined,
    'null',
    'http://127.0.0.1:47800',
    'http://127.0.0.1:8792',
    'https://127.0.0.1:8791',
    'http://localhost:8791',
    'http://100.64.1.2:8791',
    'http://evil.example',
  ]) {
    rejected(checkSameOriginWrite(post({ origin }), 'POST'), 403, 'origin_rejected');
  }
  for (const site of ['cross-site', 'same-site', 'none']) {
    rejected(checkSameOriginWrite(post({ 'sec-fetch-site': site }), 'POST'), 403, 'origin_rejected');
  }
});

test('TokenStore は期限内のトークンを通し、期限切れと知らない値を拒む', () => {
  let now = 1_000_000;
  const store = new TokenStore({ ttlMs: 600_000, now: () => now });
  const { token, expiresAt } = store.issue();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(expiresAt, new Date(1_600_000).toISOString());
  assert.notEqual(store.issue().token, token);
  assert.equal(store.verify(token), true);
  assert.equal(store.verify('x'.repeat(43)), false);
  assert.equal(store.verify(undefined), false);
  now += 600_000;
  assert.equal(store.verify(token), false);
});

test('TokenStore は上限を超えたら古いトークンから捨て、inspect と JSON に値を出さない', () => {
  const store = new TokenStore({ max: 2 });
  const a = store.issue().token;
  const b = store.issue().token;
  const c = store.issue().token;
  assert.equal(store.verify(a), false);
  assert.equal(store.verify(b), true);
  assert.equal(store.verify(c), true);
  const shown = `${inspect(store, { depth: 5 })} ${JSON.stringify(store)} ${String(store)}`;
  for (const t of [b, c]) assert.ok(!shown.includes(t));
});

test('checkToken は X-Orca-Web-Token の見出しの欠けと無効を区別して拒む', () => {
  const store = new TokenStore();
  const { token } = store.issue();
  assert.deepEqual(checkToken({ headers: { 'x-orca-web-token': token } }, store), { ok: true });
  rejected(checkToken({ headers: {} }, store), 401, 'token_missing');
  rejected(checkToken({ headers: { 'x-orca-web-token': 'nope' } }, store), 401, 'token_invalid');
  rejected(checkToken({ headers: { 'x-orca-web-token': [token, token] } }, store), 401, 'token_invalid');
});
