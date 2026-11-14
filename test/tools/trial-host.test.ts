import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createTrialHostHandler } from '../../src/tools/trial-host.ts';

test('静的なホストは表・Host・method を制限し、専用の CSP と設定を返す', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'trial-host-'));
  await writeFile(path.join(root, 'index.html'), '<p>trial</p>');
  await writeFile(path.join(root, 'secret.txt'), 'private');
  for (const file of ['phone.html', 'forbidden.html', 'trial.js', 'trial-view.js', 'forbidden.js', 'trial.css'])
    await writeFile(path.join(root, file), file);
  const hosts = ['100.64.0.1:47900'];
  const server = createServer(
    createTrialHostHandler({ root, orcaPort: 8792, allowedHosts: hosts, highlight: 'send-test' }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  hosts.push(`127.0.0.1:${port}`);
  const send = (url: string, method = 'GET', host = hosts[1]) =>
    new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: string }>(
      (resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, path: url, method, headers: { host } }, (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
        });
        req.on('error', reject);
        req.end();
      },
    );
  try {
    const reply = await send('/');
    assert.equal(reply.status, 200);
    assert.equal(reply.body, '<p>trial</p>');
    assert.equal(reply.headers['cache-control'], 'no-store');
    assert.equal(
      reply.headers['content-security-policy'],
      "default-src 'none'; script-src 'self' http://100.64.0.1:8792 http://127.0.0.1:8792; style-src 'self' http://100.64.0.1:8792 http://127.0.0.1:8792; connect-src 'self' http://100.64.0.1:8792 http://127.0.0.1:8792; frame-src 'self' http://100.64.0.1:8792 http://127.0.0.1:8792; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    );
    assert.deepEqual(JSON.parse((await send('/config.json')).body), { orcaPort: 8792, highlight: 'send-test' });
    assert.equal((await send('/index.html', 'HEAD')).body, '');
    assert.equal((await send('/config.json', 'HEAD')).body, '');
    for (const file of ['phone.html', 'forbidden.html', 'trial.js', 'trial-view.js', 'forbidden.js', 'trial.css']) {
      const reply = await send(`/${file}`);
      assert.equal(reply.status, 200);
      assert.equal(reply.body, file);
    }
    for (const url of ['/secret.txt', '/../index.html', '/%2e%2e/index.html', '/missing', '/constructor', '/__proto__'])
      assert.equal((await send(url)).status, 404);
    assert.equal((await send('/', 'POST')).status, 405);
    assert.equal((await send('/', 'GET', `localhost:${port}`)).status, 421);
    assert.equal((await send('/', 'POST', 'evil.example')).status, 421);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
