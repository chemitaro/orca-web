import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_SELECTED } from '../../src/state/fields.ts';
import { SettingsStore } from '../../src/state/settings.ts';
import { buildTrialPlan, runTrial } from '../../src/tools/trial.ts';

test('試しの計画は常駐の設定を引き継がず専用の環境を作る', () => {
  const plan = buildTrialPlan({
    env: {
      ORCA_BIN: '/example/orca',
      ORCA_WEB_READ_ORIGINS: 'http://bad.example',
      ORCA_WEB_SETTINGS_FILE: '/other/settings',
      ORCA_WEB_SENDS_DIR: '/other/sends',
    },
  });
  assert.equal(plan.env.PORT, '8792');
  assert.equal(plan.env.ORCA_WEB_READ_ORIGINS, 'http://127.0.0.1:47900');
  assert.equal(plan.env.ORCA_BIN, '/example/orca');
  assert.equal(plan.env.ORCA_WEB_SETTINGS_FILE, path.join(plan.stateDir, 'settings.json'));
  assert.equal(plan.env.ORCA_WEB_SENDS_DIR, path.join(plan.stateDir, 'sends'));
  assert.equal(plan.env.ORCA_WEB_TAILSCALE_IP, undefined);
});

test('計画は Tailscale とポートを検査する', () => {
  const plan = buildTrialPlan({
    tailscaleIp: '100.64.0.1',
    env: { ORCA_WEB_STALL_MINUTES: '5', ORCA_WEB_OTHER: 'drop' },
  });
  assert.equal(plan.env.ORCA_WEB_READ_ORIGINS, 'http://127.0.0.1:47900,http://100.64.0.1:47900');
  assert.equal(plan.env.ORCA_WEB_TAILSCALE_IP, '100.64.0.1');
  assert.equal(plan.env.ORCA_WEB_STALL_MINUTES, '5');
  assert.equal(plan.env.ORCA_WEB_OTHER, undefined);
  assert.deepEqual(plan.pageHosts, ['127.0.0.1:47900', '100.64.0.1:47900']);
  for (const orca of [8791, 47800, 47900, 0, 65536, 1.5]) assert.throws(() => buildTrialPlan({ ports: { orca } }));
  for (const ip of ['0.0.0.0', '127.0.0.1', 'bad', '::1']) assert.throws(() => buildTrialPlan({ tailscaleIp: ip }));
});

const usedPorts = new Set([8791, 47800]);
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (usedPorts.has(port)) return freePort();
  usedPorts.add(port);
  return port;
}
async function until(check: () => Promise<boolean>) {
  const end = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('常駐の置き場とその下は計画で拒む', () => {
  for (const suffix of ['', '/trial'])
    assert.throws(() =>
      buildTrialPlan({ stateDir: path.join(homedir(), 'Library/Application Support/orca-web') + suffix }),
    );
});

test('起動は設定を初期化し、SIGTERM で子とサーバーと pid を片付ける。既存設定は保つ', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'trial-'));
  const signals = new EventEmitter();
  const plan = buildTrialPlan({
    stateDir: path.join(dir, 'state'),
    ports: { orca: await freePort(), page: await freePort(), forbidden: await freePort() },
  });
  const script = path.join(dir, 'fake.mjs');
  await writeFile(
    script,
    `import { createServer } from 'node:http'; import { writeFileSync } from 'node:fs'; const server = createServer((req,res) => res.end(JSON.stringify({ok:true,pid:process.pid}))); server.listen(Number(process.env.PORT),'127.0.0.1'); process.on('SIGTERM',()=>{writeFileSync(${JSON.stringify(path.join(dir, 'stopped'))},'yes'); server.close(()=>process.exit(0));});`,
  );
  try {
    for (const iteration of [0, 1]) {
      const running = runTrial(plan, { childArgs: [script], signals, log: () => {}, healthTimeoutMs: 5000 });
      await until(async () => {
        try {
          await readFile(path.join(plan.stateDir, 'trial.pid'));
          return true;
        } catch {
          return false;
        }
      });
      assert.equal((await stat(plan.stateDir)).mode & 0o777, 0o700);
      const settings = new SettingsStore(plan.env.ORCA_WEB_SETTINGS_FILE);
      await settings.load();
      assert.equal(settings.info.error, null);
      assert.deepEqual(settings.selected, [...DEFAULT_SELECTED]);
      assert.equal(await settings.readSendEnabled(), iteration === 1);
      const config = await fetch(`http://127.0.0.1:${plan.ports.page}/config.json`);
      assert.deepEqual(await config.json(), { orcaPort: plan.ports.orca, highlight: 'send-test' });
      signals.emit('SIGTERM');
      assert.equal(await running, 0);
      assert.equal(await readFile(path.join(dir, 'stopped'), 'utf8'), 'yes');
      await assert.rejects(readFile(path.join(plan.stateDir, 'trial.pid')), { code: 'ENOENT' });
      assert.equal(signals.listenerCount('SIGTERM'), 0);
      await assert.rejects(fetch(`http://127.0.0.1:${plan.ports.page}/config.json`));
      await writeFile(
        plan.env.ORCA_WEB_SETTINGS_FILE as string,
        JSON.stringify({ version: 1, fields: DEFAULT_SELECTED, sendEnabled: true }),
      );
    }
  } finally {
    signals.emit('SIGTERM');
    await rm(dir, { recursive: true, force: true });
  }
});

test('health 不応答・子の早い終了・使用中の画面ポートで起動分を片付けて1', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'trial-fail-'));
  try {
    for (const kind of ['health', 'early', 'page', 'forbidden', 'exit-after-ready']) {
      const busy = createServer();
      await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve));
      const busyPort = (busy.address() as AddressInfo).port;
      const signals = new EventEmitter();
      const ports = {
        orca: await freePort(),
        page: kind === 'page' ? busyPort : await freePort(),
        forbidden: kind === 'forbidden' ? busyPort : await freePort(),
      };
      const plan = buildTrialPlan({ stateDir: path.join(dir, kind), ports });
      const marker = path.join(dir, `${kind}.stop`);
      const script = path.join(dir, `${kind}.mjs`);
      await writeFile(
        script,
        kind === 'early'
          ? 'process.exit(0)'
          : `import { createServer } from 'node:http'; import { writeFileSync } from 'node:fs'; const server = createServer((req,res)=>res.end(JSON.stringify({ok:true,pid:process.pid}))); ${kind === 'health' ? 'setInterval(()=>{},1000);' : "server.listen(Number(process.env.PORT),'127.0.0.1');"} process.on('SIGTERM',()=>{writeFileSync(${JSON.stringify(marker)},'yes');process.exit(0)}); ${kind === 'exit-after-ready' ? 'setTimeout(()=>process.exit(0),400);' : ''}`,
      );
      try {
        assert.equal(
          await runTrial(plan, { childArgs: [script], signals, log: () => {}, healthTimeoutMs: 2000 }),
          1,
          kind,
        );
        if (kind !== 'early' && kind !== 'exit-after-ready') assert.equal(await readFile(marker, 'utf8'), 'yes');
        await assert.rejects(readFile(path.join(plan.stateDir, 'trial.pid')), { code: 'ENOENT' });
        assert.equal(signals.listenerCount('SIGINT'), 0);
        if (kind !== 'page') await assert.rejects(fetch(`http://127.0.0.1:${ports.page}/config.json`));
      } finally {
        await new Promise<void>((resolve) => busy.close(() => resolve()));
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI の dry-run は環境と URL を出し、ファイルも子も作らない。誤った引数は2', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'trial-dry-'));
  const stateDir = path.join(dir, 'absent');
  const script = path.resolve(import.meta.dirname, '../../src/tools/trial.ts');
  try {
    const result = spawnSync(
      process.execPath,
      [script, '--dry-run', '--state-dir', stateDir, '--tailscale-ip', '100.64.0.1'],
      { encoding: 'utf8', env: { ORCA_BIN: '/no-orca', PRIVATE_VALUE: 'never-print' } },
    );
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.env.ORCA_WEB_TAILSCALE_IP, '100.64.0.1');
    assert.equal(output.env.PORT, '8792');
    assert.equal(output.env.ORCA_BIN, '/no-orca');
    assert.deepEqual(output.urls, [
      'http://127.0.0.1:47900/',
      'http://127.0.0.1:47900/phone.html',
      'http://127.0.0.1:47901/forbidden.html',
      'http://100.64.0.1:47900/',
      'http://100.64.0.1:47900/phone.html',
      'http://100.64.0.1:47901/forbidden.html',
    ]);
    assert.doesNotMatch(result.stdout, /never-print/);
    await assert.rejects(stat(stateDir), { code: 'ENOENT' });
    for (const args of [['--orca-port', '8791'], ['--unknown']]) {
      const invalid = spawnSync(process.execPath, [script, '--dry-run', ...args], { encoding: 'utf8', env: {} });
      assert.equal(invalid.status, 2);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
