// iss-00082 S-01：`/` が指揮の画面、受け箱は `/inbox`。見出しのリンクが新しい道を指す。
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { type IncomingHttpHeaders, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { type AppOptions, createAppServer } from '../../src/server/app.ts';

type Reply = { status: number; headers: IncomingHttpHeaders; text: string };

async function withApp(
  options: AppOptions,
  run: (send: (path: string, method?: string) => Promise<Reply>) => Promise<void>,
) {
  const server = createAppServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const host = `127.0.0.1:${port}`;
  const send = (path: string, method = 'GET') =>
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

const APEX_TITLE = '<title>指揮 — orca-web</title>';

test('T-01: /・/index.html・/apexes は指揮の画面、/inbox は受け箱。CSP は今の index の画面の値', async () => {
  await withApp({ readOrigins: ['http://127.0.0.1:47800'] }, async (send) => {
    const settings = await send('/settings');
    const policy = settings.headers['content-security-policy'];
    assert.match(String(policy), /frame-ancestors http:\/\/127\.0\.0\.1:47800(;|$)/);
    for (const path of ['/', '/index.html', '/apexes', '/?project=repo-a', '/inbox', '/inbox?project=repo-a']) {
      const reply = await send(path);
      assert.equal(reply.status, 200, path);
      assert.equal(reply.headers['content-type'], 'text/html; charset=utf-8', path);
      assert.equal(reply.headers['content-security-policy'], policy, path);
      assert.equal(reply.headers['referrer-policy'], 'same-origin', path);
      assert.equal(reply.headers['access-control-allow-origin'], undefined, path);
      assert.equal((await send(path, 'HEAD')).status, 200, path);
      assert.equal((await send(path, 'POST')).status, 405, path);
    }
    for (const path of ['/', '/index.html', '/apexes']) {
      const reply = await send(path);
      assert.ok(reply.text.includes(APEX_TITLE), path);
      assert.match(reply.text, /src="\/apexes\.js"/, path);
    }
    const inbox = await send('/inbox?project=repo-a');
    assert.ok(!inbox.text.includes(APEX_TITLE));
    assert.match(inbox.text, /src="\/inbox\.js"/);
    for (const path of ['/inbox.html', '/inbox/', '/apexes.html']) {
      assert.equal((await send(path)).status, 404, path);
    }
  });
});

test('T-02: /embed/agent・/embed/open-button・/api/state・/api/worktrees/summary の応答の見出しが今のまま', async () => {
  const origin = 'http://127.0.0.1:47800';
  await withApp({ readOrigins: [origin] }, async (send) => {
    const agent = await send('/embed/agent?id=a');
    assert.equal(agent.status, 200);
    assert.match(
      String(agent.headers['content-security-policy']),
      /frame-ancestors 'self' http:\/\/127\.0\.0\.1:47800(;|$)/,
    );
    const button = await send('/embed/open-button');
    assert.equal(button.status, 200);
    assert.match(String(button.headers['content-security-policy']), /frame-ancestors http:\/\/127\.0\.0\.1:47800(;|$)/);
    for (const path of ['/api/state', '/api/worktrees/summary']) {
      const reply = await send(path);
      assert.equal(reply.headers['content-type'], 'application/json; charset=utf-8', path);
    }
  });
});

/** HTML の見出し（<header>）の中のリンクの [href, 文字]。 */
function headerLinks(html: string): Array<[string, string]> {
  const header = /<header[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';
  return [...header.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [
    m[1] ?? '',
    (m[2] ?? '').trim(),
  ]);
}

test('T-03: 各画面の見出しで、受け箱は /inbox、指揮は / を指し、受け箱へのリンクが / を指さない', async () => {
  const webDir = new URL('../../web/', import.meta.url);
  const pages = (await readdir(webDir)).filter((name) => name.endsWith('.html'));
  assert.deepEqual(pages.sort(), [
    'apexes.html',
    'inbox.html',
    'project.html',
    'run.html',
    'runs.html',
    'settings.html',
  ]);
  for (const page of pages) {
    const links = headerLinks(await readFile(new URL(page, webDir), 'utf8'));
    const inbox = links.filter(([, text]) => text.includes('受け箱'));
    const apex = links.filter(([, text]) => text.includes('指揮'));
    if (page !== 'inbox.html')
      assert.deepEqual(
        inbox.map(([href]) => href),
        ['/inbox'],
        page,
      );
    if (page !== 'apexes.html')
      assert.deepEqual(
        apex.map(([href]) => href),
        ['/'],
        page,
      );
    for (const [href, text] of links) {
      if (href === '/') assert.ok(text.includes('指揮'), `${page}: ${text}`);
      assert.notEqual(href, '/apexes', page);
    }
  }
});
