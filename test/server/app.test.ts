import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { OpenOutcome, OpenRequest } from '../../src/orca/open.ts';
import { createAppServer } from '../../src/server/app.ts';
import { TokenStore } from '../../src/server/guard.ts';

interface Harness {
  host: string;
  origin: string;
  port: number;
  tokens: TokenStore;
  opened: OpenRequest[];
  send(options: SendOptions): Promise<Reply>;
}

interface SendOptions {
  method?: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body?: string;
}

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
  json: () => Record<string, unknown>;
}

async function withApp(
  fn: (h: Harness) => Promise<void>,
  open: (r: OpenRequest) => Promise<OpenOutcome> = async (r) => ({
    ok: true,
    status: 'opened',
    route: 'terminal-switch',
    reason: 'last-agent',
    worktreeId: r.worktree,
  }),
): Promise<void> {
  const tokens = new TokenStore();
  const opened: OpenRequest[] = [];
  const server = createAppServer({
    tokens,
    readOrigins: ['http://127.0.0.1:47800'],
    open: async (r) => {
      opened.push(r);
      return open(r);
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const host = `127.0.0.1:${port}`;
  const send = ({ method = 'GET', path, headers = {}, body }: SendOptions): Promise<Reply> =>
    new Promise((resolve, reject) => {
      const clean: Record<string, string> = { host };
      for (const [k, v] of Object.entries(headers)) {
        if (v === undefined) delete clean[k];
        else clean[k] = v;
      }
      const req = request({ host: '127.0.0.1', port, method, path, headers: clean, setHost: false }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: () => JSON.parse(text) });
        });
      });
      req.on('error', reject);
      req.end(body);
    });
  try {
    await fn({ host, origin: `http://${host}`, port, tokens, opened, send });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** そろった書き込みの見出し。 */
const writeHeaders = (h: Harness, token?: string): Record<string, string | undefined> => ({
  origin: h.origin,
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  'x-orca-web-token': token,
});

async function token(h: Harness): Promise<string> {
  const res = await h.send({ method: 'POST', path: '/api/token', headers: writeHeaders(h), body: '{}' });
  assert.equal(res.status, 200);
  const value = res.json().token;
  assert.equal(typeof value, 'string');
  return value as string;
}

const openBody = JSON.stringify({ worktree: '/p-1', agent: 'a:1' });

test('GET /api/health は 200 と ok を返す', async () => {
  await withApp(async (h) => {
    const res = await h.send({ path: '/api/health' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    assert.deepEqual(res.json(), { ok: true });
  });
});

test('知らないパスは 404 を返す', async () => {
  await withApp(async (h) => {
    assert.equal((await h.send({ path: '/nope' })).status, 404);
  });
});

test('URL として不正な request-target は 400 を返し、サーバーは落ちない', async () => {
  await withApp(async (h) => {
    assert.equal((await h.send({ path: '//[' })).status, 400);
    assert.equal((await h.send({ path: '/api/health' })).status, 200);
  });
});

test('すべての道で、許していない Host と Host の欠けを拒む（DNS rebinding）', async () => {
  await withApp(async (h) => {
    for (const path of [
      '/api/health',
      '/embed/open-button',
      '/embed/open-button.js',
      '/api/token',
      '/api/open',
      '/nope',
    ]) {
      for (const host of [
        `evil.example:${h.port}`,
        '127.0.0.1',
        `127.0.0.1:${h.port + 1}`,
        `127.0.0.1:${h.port}.evil`,
      ]) {
        const res = await h.send({
          method: path.startsWith('/api/') && path !== '/api/health' ? 'POST' : 'GET',
          path,
          headers: { ...writeHeaders(h), host },
        });
        assert.equal(res.status, 421, `${path} ${host}`);
        assert.equal(res.json().error, 'misdirected_host');
      }
    }
    // Host のない HTTP/1.1 の要求は、Node が道の前に 400 で拒む。
    const missing = await h.send({
      method: 'POST',
      path: '/api/open',
      headers: { ...writeHeaders(h), host: undefined },
    });
    assert.equal(missing.status, 400);
    assert.equal(h.opened.length, 0);
  });
});

test('そろった要求だけが開く処理に届き、結果をそのまま返す', async () => {
  await withApp(async (h) => {
    const t = await token(h);
    const res = await h.send({ method: 'POST', path: '/api/open', headers: writeHeaders(h, t), body: openBody });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json(), {
      ok: true,
      status: 'opened',
      route: 'terminal-switch',
      reason: 'last-agent',
      worktreeId: '/p-1',
    });
    assert.deepEqual(h.opened, [{ worktree: '/p-1', agent: 'a:1' }]);
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    assert.equal(res.headers['cache-control'], 'no-store');
  });
});

test('/api/open は守りを1つずつ外した要求を拒み、開く処理を呼ばない', async () => {
  await withApp(async (h) => {
    const t = await token(h);
    const cases: [string, SendOptions, number, string][] = [
      ['GET', { method: 'GET', path: '/api/open', headers: writeHeaders(h, t) }, 405, 'method_not_allowed'],
      [
        'text/plain',
        {
          method: 'POST',
          path: '/api/open',
          headers: { ...writeHeaders(h, t), 'content-type': 'text/plain' },
          body: openBody,
        },
        415,
        'unsupported_media_type',
      ],
      [
        'form',
        {
          method: 'POST',
          path: '/api/open',
          headers: { ...writeHeaders(h, t), 'content-type': 'application/x-www-form-urlencoded' },
          body: 'worktree=x',
        },
        415,
        'unsupported_media_type',
      ],
      [
        'no origin',
        { method: 'POST', path: '/api/open', headers: { ...writeHeaders(h, t), origin: undefined }, body: openBody },
        403,
        'origin_rejected',
      ],
      [
        'null origin',
        { method: 'POST', path: '/api/open', headers: { ...writeHeaders(h, t), origin: 'null' }, body: openBody },
        403,
        'origin_rejected',
      ],
      [
        'specdock origin',
        {
          method: 'POST',
          path: '/api/open',
          headers: { ...writeHeaders(h, t), origin: 'http://127.0.0.1:47800' },
          body: openBody,
        },
        403,
        'origin_rejected',
      ],
      [
        'cross-site',
        {
          method: 'POST',
          path: '/api/open',
          headers: { ...writeHeaders(h, t), 'sec-fetch-site': 'cross-site' },
          body: openBody,
        },
        403,
        'origin_rejected',
      ],
      [
        'no token',
        { method: 'POST', path: '/api/open', headers: writeHeaders(h), body: openBody },
        401,
        'token_missing',
      ],
      [
        'bad token',
        { method: 'POST', path: '/api/open', headers: writeHeaders(h, 'x'.repeat(43)), body: openBody },
        401,
        'token_invalid',
      ],
      [
        'too large',
        {
          method: 'POST',
          path: '/api/open',
          headers: writeHeaders(h, t),
          body: JSON.stringify({ worktree: 'x'.repeat(5000) }),
        },
        413,
        'payload_too_large',
      ],
      [
        'not json',
        { method: 'POST', path: '/api/open', headers: writeHeaders(h, t), body: '{oops' },
        400,
        'invalid_request',
      ],
      ['array', { method: 'POST', path: '/api/open', headers: writeHeaders(h, t), body: '[]' }, 400, 'invalid_request'],
      [
        'no worktree',
        { method: 'POST', path: '/api/open', headers: writeHeaders(h, t), body: '{}' },
        400,
        'invalid_request',
      ],
      [
        'empty worktree',
        { method: 'POST', path: '/api/open', headers: writeHeaders(h, t), body: '{"worktree":""}' },
        400,
        'invalid_request',
      ],
      [
        'bad agent',
        { method: 'POST', path: '/api/open', headers: writeHeaders(h, t), body: '{"worktree":"w","agent":1}' },
        400,
        'invalid_request',
      ],
      [
        'unknown key',
        { method: 'POST', path: '/api/open', headers: writeHeaders(h, t), body: '{"worktree":"w","tabId":"t"}' },
        400,
        'invalid_request',
      ],
    ];
    for (const [name, options, status, error] of cases) {
      const res = await h.send(options);
      assert.equal(res.status, status, name);
      assert.equal(res.json().error, error, name);
      assert.ok(!res.text.includes(t), name);
    }
    assert.equal(h.opened.length, 0);
  });
});

test('/api/token は同じオリジンの JSON の POST にだけトークンを出し、CORS の許可を付けない', async () => {
  await withApp(async (h) => {
    const ok = await h.send({ method: 'POST', path: '/api/token', headers: writeHeaders(h), body: '{}' });
    assert.equal(ok.status, 200);
    const body = ok.json();
    assert.match(String(body.token), /^[A-Za-z0-9_-]{43}$/);
    assert.equal(typeof body.expiresAt, 'string');
    assert.equal(ok.headers['cache-control'], 'no-store');
    assert.equal(ok.headers['access-control-allow-origin'], undefined);
    for (const [headers, method, status] of [
      [{ ...writeHeaders(h), origin: 'http://127.0.0.1:47800' }, 'POST', 403],
      [{ ...writeHeaders(h), origin: undefined }, 'POST', 403],
      [{ ...writeHeaders(h), 'content-type': 'text/plain' }, 'POST', 415],
      [writeHeaders(h), 'GET', 405],
    ] as const) {
      const res = await h.send({ method, path: '/api/token', headers, ...(method === 'POST' ? { body: '{}' } : {}) });
      assert.equal(res.status, status);
      assert.equal(res.json().token, undefined);
    }
  });
});

test('開く処理の失敗は、誤りの種類ごとの HTTP の状態で返り、例外は 500 で中身を出さない', async () => {
  const statuses: [string, number][] = [
    ['busy', 409],
    ['target_gone', 409],
    ['worktree_not_found', 404],
    ['unavailable', 503],
    ['runtime_changed', 503],
    ['unsupported', 501],
    ['orca_error', 502],
    ['unknown_shape', 502],
    ['unconfirmed', 504],
  ];
  for (const [error, status] of statuses) {
    await withApp(
      async (h) => {
        const res = await h.send({
          method: 'POST',
          path: '/api/open',
          headers: writeHeaders(h, await token(h)),
          body: openBody,
        });
        assert.equal(res.status, status, error);
        assert.equal(res.json().error, error);
      },
      async () => ({ ok: false, error: error as never, message: 'text' }),
    );
  }
  await withApp(
    async (h) => {
      const res = await h.send({
        method: 'POST',
        path: '/api/open',
        headers: writeHeaders(h, await token(h)),
        body: openBody,
      });
      assert.equal(res.status, 500);
      assert.deepEqual(res.json(), { ok: false, error: 'internal_error' });
    },
    async () => {
      throw new Error('secret detail');
    },
  );
});

test('/embed/open-button は CSP（frame-ancestors に SpecDock のオリジンだけ、inline なし）と nosniff で返る', async () => {
  await withApp(async (h) => {
    const res = await h.send({ path: '/embed/open-button?worktree=%2Fp-1&theme=dark' });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
    const csp = String(res.headers['content-security-policy']);
    assert.match(csp, /frame-ancestors http:\/\/127\.0\.0\.1:47800(;|$)/);
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.ok(!csp.includes('unsafe-inline'));
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    // no-referrer にすると、Fetch の仕様では同じオリジンの POST の Origin が null になりうる。
    assert.equal(res.headers['referrer-policy'], 'same-origin');
    assert.match(res.text, /open-button-frame\.js/);
    assert.ok(!/<script>[^<]/.test(res.text), 'no inline script');
  });
});

test('部品のファイルは固定の対応だけで返り、ほかのパスと GET でない要求は返さない', async () => {
  await withApp(async (h) => {
    for (const [path, type] of [
      ['/embed/open-button.js', 'text/javascript; charset=utf-8'],
      ['/embed/open-button-frame.js', 'text/javascript; charset=utf-8'],
      ['/embed/open-button.css', 'text/css; charset=utf-8'],
    ]) {
      const res = await h.send({ path: path as string });
      assert.equal(res.status, 200, path);
      assert.equal(res.headers['content-type'], type);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
    }
    for (const path of [
      '/embed/../package.json',
      '/embed/%2e%2e/package.json',
      '/embed/',
      '/embed/open-button.html',
      '/web/index.html',
    ]) {
      assert.equal((await h.send({ path })).status, 404, path);
    }
    assert.equal((await h.send({ method: 'POST', path: '/embed/open-button' })).status, 405);
  });
});

test('状態の画面も frame-ancestors に SpecDock のオリジンだけを持ち、SpecDock のオリジンがなければ none', async () => {
  await withApp(async (h) => {
    const index = await h.send({ path: '/' });
    assert.equal(index.status, 200);
    assert.match(String(index.headers['content-security-policy']), /frame-ancestors http:\/\/127\.0\.0\.1:47800(;|$)/);
    assert.equal(index.headers['referrer-policy'], 'same-origin');
    const writer = await h.send({ path: '/write.js' });
    assert.equal(writer.status, 200);
    assert.equal(writer.headers['content-type'], 'text/javascript; charset=utf-8');
  });
  const server = createAppServer({ readOrigins: [] });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    for (const path of ['/', '/embed/open-button']) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'(;|$)/, path);
      await res.arrayBuffer();
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('開く処理がないサーバーでは、そろった /api/open は 503 で何もしない', async () => {
  const server = createAppServer({});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  const headers = { origin, 'content-type': 'application/json' };
  try {
    const t = (await (await fetch(`${origin}/api/token`, { method: 'POST', headers, body: '{}' })).json()) as {
      token: string;
    };
    const res = await fetch(`${origin}/api/open`, {
      method: 'POST',
      headers: { ...headers, 'x-orca-web-token': t.token },
      body: JSON.stringify({ worktree: 'w' }),
    });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false, error: 'open_unavailable' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('GET /api/health は、渡された pid と待ち受けの状態（listeners）を返す', async () => {
  const listeners = [
    { address: '127.0.0.1', state: 'listening' as const },
    { address: '100.64.0.1', state: 'retrying' as const, error: 'EADDRNOTAVAIL' },
  ];
  const server = createAppServer({ health: () => ({ pid: 4242, listeners }) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, pid: 4242, listeners });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('/ は受け箱の画面、/settings は一覧の表と項目の選択の画面を、inline を許さない CSP で配る', async () => {
  await withApp(async (h) => {
    const inbox = await h.send({ path: '/' });
    assert.equal(inbox.status, 200);
    assert.match(inbox.text, /src="\.\/inbox\.js"/);
    assert.ok(!inbox.text.includes('main.js'));
    assert.match(inbox.text, /href="\/settings"/);
    const settings = await h.send({ path: '/settings' });
    assert.equal(settings.status, 200);
    assert.equal(settings.headers['content-type'], 'text/html; charset=utf-8');
    assert.match(settings.text, /src="\.\/main\.js"/);
    assert.match(settings.text, /id="field-list"/);
    assert.ok(!settings.text.includes('inbox.js'));
    for (const page of [inbox, settings]) {
      const csp = String(page.headers['content-security-policy']);
      assert.match(csp, /default-src 'self'/);
      assert.ok(!csp.includes('unsafe-inline'));
      assert.equal(page.headers['referrer-policy'], 'same-origin');
      assert.ok(!/<script>[^<]/.test(page.text), 'no inline script');
      assert.ok(!/\sstyle=/.test(page.text), 'no inline style');
    }
    for (const path of ['/inbox.js', '/inbox-view.js', '/inbox-dom.js']) {
      const res = await h.send({ path });
      assert.equal(res.status, 200, path);
      assert.equal(res.headers['content-type'], 'text/javascript; charset=utf-8');
    }
    assert.equal((await h.send({ path: '/settings.html' })).status, 404);
    assert.equal((await h.send({ method: 'POST', path: '/settings' })).status, 405);
  });
});
