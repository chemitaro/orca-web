import { type ChildProcess, spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { chmod, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig } from '../server/config.ts';
import { type ListenerSet, startListeners } from '../server/listen.ts';
import { DEFAULT_SELECTED } from '../state/fields.ts';
import { DEFAULT_SETTINGS_FILE } from '../state/settings.ts';
import { createTrialHostHandler } from './trial-host.ts';

interface TrialOptions {
  tailscaleIp?: string;
  stateDir?: string;
  ports?: { orca?: number; page?: number; forbidden?: number };
  env?: NodeJS.ProcessEnv;
}

export function buildTrialPlan(options: TrialOptions = {}) {
  const source = options.env ?? {};
  const ports = { orca: 8792, page: 47900, forbidden: 47901, ...options.ports };
  if (
    Object.values(ports).some((p) => !Number.isInteger(p) || p < 1 || p > 65535 || p === 8791 || p === 47800) ||
    new Set(Object.values(ports)).size !== 3
  )
    throw new Error('invalid or conflicting trial ports');
  const stateDir = path.resolve(options.stateDir ?? '.workbench/trial');
  const resident = path.dirname(DEFAULT_SETTINGS_FILE);
  if (stateDir === resident || stateDir.startsWith(`${resident}${path.sep}`))
    throw new Error('state-dir must not use resident storage');
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(source).filter(([key]) => !key.startsWith('ORCA_WEB_')),
  );
  env.PORT = String(ports.orca);
  env.ORCA_WEB_SETTINGS_FILE = path.join(stateDir, 'settings.json');
  env.ORCA_WEB_SENDS_DIR = path.join(stateDir, 'sends');
  if (source.ORCA_WEB_STALL_MINUTES !== undefined) env.ORCA_WEB_STALL_MINUTES = source.ORCA_WEB_STALL_MINUTES;
  const ip = options.tailscaleIp ?? source.ORCA_WEB_TAILSCALE_IP;
  if (ip) env.ORCA_WEB_TAILSCALE_IP = ip;
  const addresses = loadConfig({ ...env, ORCA_WEB_READ_ORIGINS: '' }).bindAddresses;
  env.ORCA_WEB_READ_ORIGINS = addresses.map((a) => `http://${a}:${ports.page}`).join(',');
  const hosts = (port: number) => addresses.map((a) => `${a}:${port}`);
  return {
    stateDir,
    env,
    ports,
    addresses,
    pageHosts: hosts(ports.page),
    forbiddenHosts: hosts(ports.forbidden),
    urls: addresses.flatMap((a) => [
      `http://${a}:${ports.page}/`,
      `http://${a}:${ports.page}/phone.html`,
      `http://${a}:${ports.forbidden}/forbidden.html`,
    ]),
  };
}

interface RunOptions {
  childArgs?: string[];
  signals?: EventEmitter;
  log?: (line: string) => void;
  healthTimeoutMs?: number;
}

/** 子の起動境界だけをテストで差し替え、実際の HTTP と終了処理を通す。 */
export async function runTrial(plan: ReturnType<typeof buildTrialPlan>, options: RunOptions = {}): Promise<number> {
  const signals = options.signals ?? process;
  const log = options.log ?? console.log;
  const listeners: ListenerSet[] = [];
  let child: ChildProcess | undefined;
  let childExit: Promise<void> = Promise.resolve();
  let childEnded = false;
  let stopCode: number | undefined;
  let wake: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const stop = (code: number) => {
    if (stopCode === undefined) {
      stopCode = code;
      wake();
    }
  };
  const onSignal = () => stop(0);
  const pidFile = path.join(plan.stateDir, 'trial.pid');
  let wrotePid = false;
  signals.on('SIGTERM', onSignal);
  signals.on('SIGINT', onSignal);
  try {
    // 実体が常駐の置き場を指す別名も拒む。存在しない末尾は既存の祖先から解く。
    let ancestor = plan.stateDir;
    const tail: string[] = [];
    for (;;) {
      try {
        const actual = path.join(await realpath(ancestor), ...tail);
        buildTrialPlan({ stateDir: actual, ports: plan.ports });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        tail.unshift(path.basename(ancestor));
        ancestor = path.dirname(ancestor);
      }
    }
    await mkdir(plan.stateDir, { recursive: true, mode: 0o700 });
    await chmod(plan.stateDir, 0o700);
    try {
      await writeFile(
        plan.env.ORCA_WEB_SETTINGS_FILE as string,
        JSON.stringify({ version: 1, fields: DEFAULT_SELECTED, sendEnabled: false }),
        { flag: 'wx', mode: 0o600 },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if (stopCode !== undefined) return stopCode;
    child = spawn(process.execPath, options.childArgs ?? [path.resolve(import.meta.dirname, '../server/main.ts')], {
      env: plan.env,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    childExit = new Promise<void>((resolve) => {
      child?.once('error', () => {
        childEnded = true;
        stop(1);
        resolve();
      });
      child?.once('exit', () => {
        childEnded = true;
        stop(1);
        resolve();
      });
    });
    const deadline = Date.now() + (options.healthTimeoutMs ?? 15_000);
    let healthy = false;
    while (stopCode === undefined && Date.now() < deadline) {
      try {
        const reply = await fetch(`http://127.0.0.1:${plan.ports.orca}/api/health`, {
          signal: AbortSignal.timeout(Math.max(1, Math.min(300, deadline - Date.now()))),
        });
        const health = (await reply.json()) as { ok?: boolean; pid?: number };
        if (reply.ok && health.ok === true && health.pid === child.pid) {
          healthy = true;
          break;
        }
      } catch {
        /* 起動中は、上限まで読むだけで待つ。 */
      }
      await Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, 30))]);
    }
    if (!healthy && stopCode === undefined) throw new Error('trial child did not answer health');
    if (stopCode === undefined) {
      for (const [port, allowedHosts] of [
        [plan.ports.page, plan.pageHosts],
        [plan.ports.forbidden, plan.forbiddenHosts],
      ] as const) {
        if (stopCode !== undefined) break;
        listeners.push(
          await startListeners({
            port,
            addresses: plan.addresses,
            log,
            handler: createTrialHostHandler({
              root: path.resolve(import.meta.dirname, '../../web/trial'),
              orcaPort: plan.ports.orca,
              allowedHosts,
              highlight: 'send-test',
            }),
          }),
        );
      }
      if (stopCode === undefined) {
        await writeFile(pidFile, `${process.pid}\n`, { flag: 'wx', mode: 0o600 });
        wrotePid = true;
        for (const url of plan.urls) log(url);
      }
    }
    await stopped;
  } catch (error) {
    log(`trial: ${(error as Error).message}`);
    stop(1);
  } finally {
    await Promise.all(listeners.map((listener) => listener.close()));
    if (child && !childEnded) {
      child.kill('SIGTERM');
      const killer = setTimeout(() => child?.kill('SIGKILL'), 5000);
      await childExit;
      clearTimeout(killer);
    }
    if (wrotePid) await rm(pidFile, { force: true });
    signals.removeListener('SIGTERM', onSignal);
    signals.removeListener('SIGINT', onSignal);
  }
  return stopCode ?? 1;
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  let plan: ReturnType<typeof buildTrialPlan>;
  try {
    const { values } = parseArgs({
      args,
      options: {
        'tailscale-ip': { type: 'string' },
        'state-dir': { type: 'string' },
        'orca-port': { type: 'string' },
        'page-port': { type: 'string' },
        'forbidden-port': { type: 'string' },
        'dry-run': { type: 'boolean' },
      },
    });
    plan = buildTrialPlan({
      env: process.env,
      ...(values['tailscale-ip'] === undefined ? {} : { tailscaleIp: values['tailscale-ip'] }),
      ...(values['state-dir'] === undefined ? {} : { stateDir: values['state-dir'] }),
      ports: {
        orca: Number(values['orca-port'] ?? 8792),
        page: Number(values['page-port'] ?? 47900),
        forbidden: Number(values['forbidden-port'] ?? 47901),
      },
    });
    if (values['dry-run']) {
      // 起動に使う管理した値だけを表示し、継承した PATH や秘密は出さない。
      const env = Object.fromEntries(
        Object.entries(plan.env).filter(([key]) => key === 'PORT' || key === 'ORCA_BIN' || key.startsWith('ORCA_WEB_')),
      );
      console.log(JSON.stringify({ env, urls: plan.urls }, null, 2));
      return 0;
    }
  } catch (error) {
    console.error(`trial: ${(error as Error).message}`);
    return 2;
  }
  return runTrial(plan);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  process.exitCode = await main();
