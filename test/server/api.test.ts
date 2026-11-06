import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { type AppOptions, createAppServer } from '../../src/server/app.ts';
import { loadConfig } from '../../src/server/config.ts';
import { DEFAULT_SELECTED, FIELDS } from '../../src/state/fields.ts';
import { StatePoller } from '../../src/state/poller.ts';
import { SettingsStore } from '../../src/state/settings.ts';
import { expectedState } from '../state/expected.ts';
import { ms, PRIVATE_TEXTS } from '../state/fixture.ts';
import { report, staticReader } from '../state/helpers.ts';

const SPECDOCK = 'http://127.0.0.1:47800';

async function withServer(options: AppOptions, fn: (base: string, port: number) => Promise<void>): Promise<void> {
  const server = createAppServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`, port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function withSettings(fn: (store: SettingsStore, file: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-api-'));
  try {
    const file = path.join(dir, 'settings.json');
    const store = new SettingsStore(file);
    await store.load();
    await fn(store, file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** fetch は Host を書き換えられないので、生の要求を送る。 */
function raw(
  port: number,
  options: { method?: string; path: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method: options.method ?? 'GET', path: options.path, headers: options.headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => {
          body += c;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}

/** 同じオリジンから書き込みの短期のトークンを得る（画面と同じ手順）。 */
async function writeToken(base: string): Promise<string> {
  const res = await fetch(`${base}/api/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: '{}',
  });
  assert.equal(res.status, 200);
  return ((await res.json()) as { token: string }).token;
}

async function fixturePoller(): Promise<StatePoller> {
  return new StatePoller({ reader: await staticReader(), capabilities: async () => report(), now: () => ms(40) });
}

test('GET /api/state が、録画から正規化した文書を返し、本文を含まない', async () => {
  await withServer({ poller: await fixturePoller(), readOrigins: [SPECDOCK] }, async (base) => {
    const res = await fetch(`${base}/api/state`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), expectedState);
    for (const secret of PRIVATE_TEXTS) assert.ok(!text.includes(secret));
  });
});

test('許したオリジンの GET と OPTIONS に Access-Control-Allow-Origin と Vary: Origin が付く', async () => {
  const settings = new SettingsStore('/dev/null/not-used.json');
  await withServer({ poller: await fixturePoller(), settings, readOrigins: [SPECDOCK] }, async (base) => {
    for (const p of ['/api/state', '/api/fields']) {
      const res = await fetch(`${base}${p}`, { headers: { origin: SPECDOCK } });
      assert.equal(res.status, 200, p);
      assert.equal(res.headers.get('access-control-allow-origin'), SPECDOCK);
      assert.match(res.headers.get('vary') ?? '', /Origin/);
      assert.equal(res.headers.get('access-control-allow-credentials'), null);
      await res.arrayBuffer();
      const pre = await fetch(`${base}${p}`, {
        method: 'OPTIONS',
        headers: { origin: SPECDOCK, 'access-control-request-method': 'GET' },
      });
      assert.equal(pre.status, 204);
      assert.equal(pre.headers.get('access-control-allow-origin'), SPECDOCK);
      assert.equal(pre.headers.get('access-control-allow-methods'), 'GET');
      await pre.arrayBuffer();
    }
  });
});

test('ポート、スキーム、名前だけが違うオリジンは 403 で、状態を返さない', async () => {
  await withServer({ poller: await fixturePoller(), readOrigins: [SPECDOCK] }, async (base) => {
    for (const origin of ['http://127.0.0.1:47801', 'https://127.0.0.1:47800', 'http://localhost:47800', 'null']) {
      const res = await fetch(`${base}/api/state`, { headers: { origin } });
      assert.equal(res.status, 403, origin);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      const body = await res.text();
      assert.ok(!body.includes('worktrees'));
      const pre = await fetch(`${base}/api/state`, { method: 'OPTIONS', headers: { origin } });
      assert.equal(pre.status, 403);
      await pre.arrayBuffer();
    }
  });
});

test('同じオリジンの Origin と、Origin のない要求は通る', async () => {
  await withServer({ poller: await fixturePoller(), readOrigins: [SPECDOCK] }, async (base) => {
    const res = await fetch(`${base}/api/state`, { headers: { origin: base } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    await res.arrayBuffer();
  });
});

test('selfHosts にない Host の /api/ の要求は 421 で拒む（DNS の付け替えへの守り）', async () => {
  await withServer({ poller: await fixturePoller(), readOrigins: [SPECDOCK] }, async (_base, port) => {
    for (const host of ['evil.example:80', `evil.example:${port}`, `127.0.0.2:${port}`]) {
      const res = await raw(port, { path: '/api/state', headers: { host } });
      assert.equal(res.status, 421, host);
      assert.ok(!res.body.includes('worktrees'));
    }
    const ok = await raw(port, { path: '/api/state', headers: { host: `localhost:${port}` } });
    assert.equal(ok.status, 200);
  });
});

test('GET /api/fields が項目の一覧と選択を返し、PUT で保存した選択が作り直したサーバーで残る', async () => {
  await withSettings(async (settings, file) => {
    await withServer({ settings }, async (base) => {
      const res = await fetch(`${base}/api/fields`);
      const body = (await res.json()) as { fields: unknown[]; selected: string[]; settings: unknown };
      assert.equal(body.fields.length, FIELDS.length);
      assert.deepEqual(body.selected, DEFAULT_SELECTED);
      assert.deepEqual(body.settings, { source: 'default', error: null });
      const put = await fetch(`${base}/api/settings/fields`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', origin: base, 'x-orca-web-token': await writeToken(base) },
        body: JSON.stringify({ selected: ['agent.model', 'worktree.branch'] }),
      });
      assert.equal(put.status, 200);
      assert.deepEqual(((await put.json()) as { selected: string[] }).selected, ['agent.model', 'worktree.branch']);
    });
    const again = new SettingsStore(file);
    await again.load();
    await withServer({ settings: again }, async (base) => {
      const body = (await (await fetch(`${base}/api/fields`)).json()) as { selected: string[] };
      assert.deepEqual(body.selected, ['agent.model', 'worktree.branch']);
    });
  });
});

test('PUT は知らない識別子、重複、JSON でない本文、大きすぎる本文を 400 で拒み、ファイルは変わらない', async () => {
  await withSettings(async (settings, file) => {
    await withServer({ settings }, async (base) => {
      const token = await writeToken(base);
      const put = (body: string) =>
        fetch(`${base}/api/settings/fields`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json', origin: base, 'x-orca-web-token': token },
          body,
        });
      for (const body of [
        JSON.stringify({ selected: ['agent.nope'] }),
        JSON.stringify({ selected: ['agent.model', 'agent.model'] }),
        JSON.stringify({ selected: 'agent.model' }),
        JSON.stringify(['agent.model']),
        '{oops',
        JSON.stringify({ selected: ['agent.model'], pad: 'x'.repeat(70_000) }),
      ]) {
        const res = await put(body);
        assert.equal(res.status, 400, body.slice(0, 40));
        await res.arrayBuffer();
      }
    });
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  });
});

test('PUT は Origin がない、別のオリジン（SpecDock も）、JSON でない Content-Type、許していない Host、トークンのない要求を拒む', async () => {
  await withSettings(async (settings, file) => {
    await withServer({ settings, readOrigins: [SPECDOCK] }, async (base, port) => {
      const body = JSON.stringify({ selected: ['agent.model'] });
      const cases: [Record<string, string>, number][] = [
        [{ 'content-type': 'application/json' }, 403],
        [{ 'content-type': 'application/json', origin: SPECDOCK }, 403],
        [{ 'content-type': 'application/json', origin: 'http://evil.example' }, 403],
        [{ 'content-type': 'text/plain', origin: base }, 415],
        [{ 'content-type': 'application/json', origin: 'http://evil.example', host: 'evil.example' }, 421],
        [{ 'content-type': 'application/json', origin: base }, 401],
        [{ 'content-type': 'application/json', origin: base, 'x-orca-web-token': 'x'.repeat(43) }, 401],
      ];
      for (const [headers, status] of cases) {
        const res = await raw(port, { method: 'PUT', path: '/api/settings/fields', headers, body });
        assert.equal(res.status, status, JSON.stringify(headers));
      }
      const pre = await fetch(`${base}/api/settings/fields`, {
        method: 'OPTIONS',
        headers: { origin: SPECDOCK, 'access-control-request-method': 'PUT' },
      });
      assert.equal(pre.headers.get('access-control-allow-origin'), null);
      await pre.arrayBuffer();
    });
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  });
});

test('保存に失敗したら 500 と理由を返し、選択は変わらず、サーバーは落ちない', async () => {
  const settings = new SettingsStore('/dev/null/orca-web/settings.json');
  await settings.load();
  await withServer({ settings }, async (base) => {
    const res = await fetch(`${base}/api/settings/fields`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: base, 'x-orca-web-token': await writeToken(base) },
      body: JSON.stringify({ selected: ['agent.model'] }),
    });
    assert.equal(res.status, 500);
    assert.match(((await res.json()) as { error: string }).error, /cannot save settings/);
    const fields = (await (await fetch(`${base}/api/fields`)).json()) as { selected: string[] };
    assert.deepEqual(fields.selected, DEFAULT_SELECTED);
  });
});

test('部品のない口は 503、知らないメソッドは 405', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/state`);
    assert.equal(res.status, 503);
    await res.arrayBuffer();
    const del = await fetch(`${base}/api/state`, { method: 'DELETE' });
    assert.equal(del.status, 405);
    await del.arrayBuffer();
  });
});

test('静的な画面の口は表のファイルだけを配り、ほかのパスは 404', async () => {
  await withServer({}, async (base, port) => {
    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await index.text(), /<html/);
    for (const [p, type] of [
      ['/main.js', /javascript/],
      ['/view.js', /javascript/],
      ['/style.css', /text\/css/],
    ] as const) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 200, p);
      assert.match(res.headers.get('content-type') ?? '', type);
      await res.arrayBuffer();
    }
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/web/main.js', '/index.js', '/main.js/']) {
      const res = await raw(port, { path: p, headers: { host: `127.0.0.1:${port}` } });
      assert.equal(res.status, 404, p);
    }
  });
});

test('loadConfig は ORCA_WEB_READ_ORIGINS で許すオリジンを変え、不正なオリジンを誤りにする', () => {
  assert.deepEqual(loadConfig({}).readOrigins, [SPECDOCK]);
  assert.deepEqual(
    loadConfig({ ORCA_WEB_READ_ORIGINS: 'http://127.0.0.1:47800, http://100.64.0.1:47800' }).readOrigins,
    [SPECDOCK, 'http://100.64.0.1:47800'],
  );
  for (const bad of [
    'http://127.0.0.1:47800/',
    'http://127.0.0.1:47800/x',
    'ftp://127.0.0.1',
    '127.0.0.1:47800',
    '*',
  ]) {
    assert.throws(() => loadConfig({ ORCA_WEB_READ_ORIGINS: bad }), /ORCA_WEB_READ_ORIGINS/, bad);
  }
  assert.equal(loadConfig({ PORT: '9000' }).port, 9000);
  assert.throws(() => loadConfig({ PORT: 'x' }), /PORT/);
  assert.equal(loadConfig({ ORCA_WEB_SETTINGS_FILE: '/tmp/x.json' }).settingsFile, '/tmp/x.json');
});
