import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const MAIN = path.resolve(import.meta.dirname, '..', '..', 'src', 'server', 'main.ts');

interface Started {
  child: ChildProcess;
  output: () => string;
  exit: Promise<[number | null, NodeJS.Signals | null]>;
}

async function withMain(env: Record<string, string>, fn: (s: Started) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-main-'));
  const child = spawn(process.execPath, [MAIN], {
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      ORCA_BIN: path.join(dir, 'no-orca'),
      ORCA_WEB_SETTINGS_FILE: path.join(dir, 'settings.json'),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let text = '';
  child.stdout?.on('data', (c: Buffer) => {
    text += c.toString('utf8');
  });
  child.stderr?.on('data', (c: Buffer) => {
    text += c.toString('utf8');
  });
  const exit = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
  try {
    await fn({ child, output: () => text, exit });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
}

async function until(check: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('main は 127.0.0.1 で答え、待ち受けられない Tailscale の IP を retrying で示し、SIGTERM で終了コード0で終わる', async () => {
  await withMain({ PORT: '0', ORCA_WEB_TAILSCALE_IP: '192.0.2.1' }, async ({ child, output, exit }) => {
    await until(() => /listening on http:\/\/127\.0\.0\.1:\d+\//.test(output()) && output().includes('192.0.2.1'));
    const port = Number(/listening on http:\/\/127\.0\.0\.1:(\d+)\//.exec(output())?.[1]);
    const health = (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()) as Record<string, unknown>;
    assert.equal(health.ok, true);
    assert.equal(health.pid, child.pid);
    const listeners = health.listeners as { address: string; state: string }[];
    assert.deepEqual(
      listeners.map((l) => [l.address, l.state]),
      [
        ['127.0.0.1', 'listening'],
        ['192.0.2.1', 'retrying'],
      ],
    );
    child.kill('SIGTERM');
    const [code] = await exit;
    assert.equal(code, 0, output());
  });
});

test('main は 127.0.0.1 で待ち受けられないとき、理由を書いて終了コード1で止まる', async () => {
  const busy = createServer();
  await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve));
  const { port } = busy.address() as AddressInfo;
  try {
    await withMain({ PORT: String(port) }, async ({ output, exit }) => {
      const [code] = await exit;
      assert.equal(code, 1, output());
      assert.match(output(), new RegExp(`cannot listen on 127\\.0\\.0\\.1:${port} \\(EADDRINUSE\\)`));
    });
  } finally {
    await new Promise<void>((resolve) => busy.close(() => resolve()));
  }
});

test('main は設定の誤り（0.0.0.0 の Tailscale の IP）で、待ち受けずに終了コード2で止まる', async () => {
  await withMain({ PORT: '0', ORCA_WEB_TAILSCALE_IP: '0.0.0.0' }, async ({ output, exit }) => {
    const [code] = await exit;
    assert.equal(code, 2, output());
    assert.match(output(), /ORCA_WEB_TAILSCALE_IP/);
    assert.doesNotMatch(output(), /listening/);
  });
});
