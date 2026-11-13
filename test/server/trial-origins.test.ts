import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createAppServer } from '../../src/server/app.ts';
import { loadConfig } from '../../src/server/config.ts';
import { TokenStore } from '../../src/server/guard.ts';
import { buildTrialPlan } from '../../src/tools/trial.ts';
import { input } from '../inbox/fixture.ts';

test('試しの環境の許しは47900だけ。拒否した書き込みは送信とOrcaへ届かない', async () => {
  for (const tailscaleIp of [undefined, '100.64.0.1']) {
    const plan = buildTrialPlan(tailscaleIp ? { tailscaleIp } : {});
    const config = loadConfig(plan.env);
    let reads = 0;
    let sends = 0;
    let opens = 0;
    const tokens = new TokenStore();
    const token = tokens.issue().token;
    const server = createAppServer({
      readOrigins: config.readOrigins,
      tokens,
      sendGuard: { log: () => {} },
      poller: {
        noteViewer() {},
        async snapshot() {
          reads++;
          return input().state;
        },
      },
      async open() {
        opens++;
        throw new Error('Orca must not be called');
      },
      send: {
        async status() {
          sends++;
          throw new Error('must not call');
        },
        async intent() {
          sends++;
          throw new Error('must not call');
        },
        async confirm() {
          sends++;
          throw new Error('must not call');
        },
        async check() {
          sends++;
          throw new Error('must not call');
        },
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    try {
      for (const origin of config.readOrigins)
        for (const method of ['GET', 'OPTIONS']) {
          const reply = await fetch(`${base}/api/worktrees/summary`, { method, headers: { origin } });
          assert.equal(reply.status, method === 'GET' ? 200 : 204);
          assert.equal(reply.headers.get('access-control-allow-origin'), origin);
          await reply.text();
        }
      assert.equal(reads, config.readOrigins.length);
      for (const origin of [
        'http://127.0.0.1:47901',
        'http://127.0.0.1:47800',
        'http://100.64.0.1:47901',
        'http://100.64.0.1:47800',
      ]) {
        for (const method of ['GET', 'OPTIONS']) {
          const reply = await fetch(`${base}/api/worktrees/summary`, { method, headers: { origin } });
          assert.equal(reply.status, 403);
          assert.equal(reply.headers.get('access-control-allow-origin'), null);
          await reply.text();
        }
        for (const route of ['/api/token', '/api/send/intent']) {
          const reply = await fetch(`${base}${route}`, {
            method: 'POST',
            headers: { origin, 'content-type': 'application/json', 'x-orca-web-token': token },
            body: JSON.stringify({ agent: 'example', text: 'test' }),
          });
          assert.equal(reply.status, 403);
          await reply.text();
        }
      }
      assert.equal(reads, config.readOrigins.length);
      assert.equal(sends, 0);
      assert.equal(opens, 0);
      for (const route of ['/embed/agent?id=example', '/embed/open-button']) {
        const reply = await fetch(`${base}${route}`);
        assert.equal(reply.status, 200);
        const ancestors = reply.headers
          .get('content-security-policy')
          ?.split(';')
          .find((s) => s.trim().startsWith('frame-ancestors'))
          ?.trim();
        assert.equal(ancestors, `frame-ancestors ${config.readOrigins.join(' ')}`);
        await reply.text();
      }
      assert.equal((await fetch(`${base}/trial/index.html`)).status, 404);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});
