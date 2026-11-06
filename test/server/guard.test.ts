import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { loadConfig } from '../../src/server/config.ts';
import { checkHost, checkSameOriginPost, checkToken, TokenStore } from '../../src/server/guard.ts';

const config = loadConfig({ ORCA_WEB_PORT: '8791', ORCA_WEB_TAILSCALE_IP: '100.64.1.2' });

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

test('checkHost は許す Host との完全一致だけを通す', () => {
  for (const host of ['127.0.0.1:8791', '100.64.1.2:8791']) {
    assert.deepEqual(checkHost({ headers: { host } }, config), { ok: true });
  }
  for (const host of [
    'localhost:8791',
    '127.0.0.1',
    '127.0.0.1:8792',
    'evil.example:8791',
    '127.0.0.1:8791.evil',
    '',
  ]) {
    rejected(checkHost({ headers: { host } }, config), 403, 'host_rejected');
  }
  rejected(checkHost({ headers: {} }, config), 403, 'host_rejected');
});

test('checkSameOriginPost はそろった同じオリジンの JSON の POST を通す（Tailscale の Host でも）', () => {
  assert.deepEqual(checkSameOriginPost(post({}), config), { ok: true });
  assert.deepEqual(checkSameOriginPost(post({ 'content-type': 'application/json; charset=utf-8' }), config), {
    ok: true,
  });
  assert.deepEqual(checkSameOriginPost(post({ 'sec-fetch-site': undefined }), config), { ok: true });
  assert.deepEqual(checkSameOriginPost(post({ host: '100.64.1.2:8791', origin: 'http://100.64.1.2:8791' }), config), {
    ok: true,
  });
});

test('checkSameOriginPost は GET、JSON でない型、Origin の欠け・null・別の値、cross-site を拒む', () => {
  rejected(checkSameOriginPost({ ...post({}), method: 'GET' }, config), 405, 'method_not_allowed');
  for (const type of [
    undefined,
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'application/jsonx',
  ]) {
    rejected(checkSameOriginPost(post({ 'content-type': type }), config), 415, 'unsupported_media_type');
  }
  for (const origin of [
    undefined,
    'null',
    'http://127.0.0.1:47800',
    'http://127.0.0.1:8792',
    'https://127.0.0.1:8791',
    'http://100.64.1.2:8791',
    'http://evil.example',
  ]) {
    rejected(checkSameOriginPost(post({ origin }), config), 403, 'origin_rejected');
  }
  for (const site of ['cross-site', 'same-site', 'none']) {
    rejected(checkSameOriginPost(post({ 'sec-fetch-site': site }), config), 403, 'origin_rejected');
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
