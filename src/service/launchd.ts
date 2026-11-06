// orca-web の LaunchAgent（launchd の利用者のサービス）の定義と操作。
// 定義の組み立て（純な関数）と、差し替えられる口（ServiceIo）で launchctl を呼ぶ ServiceManager に分ける。
// テストは一時の HOME と偽の launchctl を使う。本物の登録は、利用者か統括が `npm run service:install` で行う。
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import path from 'node:path';
import { ConfigError, DEFAULT_ORCA_BIN, DEFAULT_PORT, loadConfig } from '../server/config.ts';

export const SERVICE_LABEL = 'io.github.chemitaro.orca-web';
export const SERVICE_PATH_ENV = '/usr/bin:/bin:/usr/sbin:/sbin';
export const LAUNCHCTL = '/bin/launchctl';
export const TAILSCALE_APP = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
const THROTTLE_SECONDS = 10;
const MIN_NODE_MAJOR = 24;
const DEFAULT_WAIT_MS = 15_000;
const POLL_MS = 250;

export type ServiceCommand = 'install' | 'uninstall' | 'restart' | 'status';
const COMMANDS: readonly ServiceCommand[] = ['install', 'uninstall', 'restart', 'status'];

export interface ServiceArgs {
  command: ServiceCommand;
  port?: string;
  /** `auto`（`tailscale ip -4` で探す）、`none`、または IPv4。 */
  tailscaleIp: string;
  readOrigins?: string;
  orcaBin?: string;
  settingsFile?: string;
  dryRun: boolean;
}

/** 命令と引数の誤り（終了コード2）。 */
export class UsageError extends Error {}

export const USAGE =
  'usage: node src/tools/service.ts <install|uninstall|restart|status> ' +
  '[--port N] [--tailscale-ip IP|auto|none] [--read-origins O,...] [--orca-bin PATH] [--settings-file PATH] [--dry-run]\n' +
  '(the options are for install only)';

const VALUE_FLAGS: Readonly<Record<string, 'port' | 'tailscaleIp' | 'readOrigins' | 'orcaBin' | 'settingsFile'>> = {
  '--port': 'port',
  '--tailscale-ip': 'tailscaleIp',
  '--read-origins': 'readOrigins',
  '--orca-bin': 'orcaBin',
  '--settings-file': 'settingsFile',
};

export function parseServiceArgs(argv: readonly string[]): ServiceArgs {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command as ServiceCommand)) throw new UsageError(USAGE);
  const args: ServiceArgs = { command: command as ServiceCommand, tailscaleIp: 'auto', dryRun: false };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i] as string;
    if (command !== 'install') throw new UsageError(`${flag}: ${USAGE}`);
    if (flag === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    const key = Object.hasOwn(VALUE_FLAGS, flag) ? VALUE_FLAGS[flag] : undefined;
    const value = rest[i + 1];
    if (!key || value === undefined || value.startsWith('--')) throw new UsageError(`${flag}: ${USAGE}`);
    args[key] = value;
    i += 1;
  }
  return args;
}

/** `tailscale ip -4` の出力から、Tailscale の範囲（100.64.0.0/10）の最初の IPv4。 */
export function parseTailscaleIpv4(stdout: string): string | null {
  for (const line of stdout.split('\n')) {
    const value = line.trim();
    if (!isIPv4(value)) continue;
    const [a, b] = value.split('.').map(Number) as [number, number];
    if (a === 100 && b >= 64 && b <= 127) return value;
  }
  return null;
}

/** plist の環境変数。サーバーと同じ loadConfig で確かめる（誤りは ConfigError）。指定のない項目はサーバーの既定に任せる。 */
export function buildServiceEnv(args: ServiceArgs, tailscaleIp: string | null): Record<string, string> {
  const env: Record<string, string> = {
    PATH: SERVICE_PATH_ENV,
    PORT: args.port ?? String(DEFAULT_PORT),
    ORCA_BIN: args.orcaBin ?? DEFAULT_ORCA_BIN,
  };
  if (tailscaleIp !== null) env.ORCA_WEB_TAILSCALE_IP = tailscaleIp;
  if (args.readOrigins !== undefined) env.ORCA_WEB_READ_ORIGINS = args.readOrigins;
  if (args.settingsFile !== undefined) env.ORCA_WEB_SETTINGS_FILE = args.settingsFile;
  if (!path.isAbsolute(env.ORCA_BIN as string)) throw new ConfigError(`ORCA_BIN: "${env.ORCA_BIN}" is not absolute`);
  if (args.settingsFile !== undefined && !path.isAbsolute(args.settingsFile)) {
    throw new ConfigError(`ORCA_WEB_SETTINGS_FILE: "${args.settingsFile}" is not absolute`);
  }
  loadConfig(env);
  return env;
}

export interface ServiceDefinition {
  label: string;
  programArguments: readonly string[];
  workingDirectory: string;
  environment: Readonly<Record<string, string>>;
  logPath: string;
}

const escapeXml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] as string,
  );

const str = (text: string, indent: string): string => `${indent}<string>${escapeXml(text)}</string>`;

/** 決めたキーだけの plist。KeepAlive と RunAtLoad で、ログインのときに起動し、止まったら起動し直す。 */
export function renderPlist(def: ServiceDefinition): string {
  const env = Object.entries(def.environment).flatMap(([k, v]) => [`    <key>${escapeXml(k)}</key>`, str(v, '    ')]);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    str(def.label, '  '),
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...def.programArguments.map((a) => str(a, '    ')),
    '  </array>',
    '  <key>WorkingDirectory</key>',
    str(def.workingDirectory, '  '),
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    ...env,
    '  </dict>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <true/>',
    '  <key>ThrottleInterval</key>',
    `  <integer>${THROTTLE_SECONDS}</integer>`,
    '  <key>StandardOutPath</key>',
    str(def.logPath, '  '),
    '  <key>StandardErrorPath</key>',
    str(def.logPath, '  '),
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

export interface ExecResult {
  /** 終了コード。起動できなかったときは null。 */
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface HealthReply {
  pid: number;
  listeners: { address: string; state: string; error?: string }[];
}

export interface ServiceIo {
  exec(file: string, args: readonly string[]): Promise<ExecResult>;
  /** `http://127.0.0.1:<port>/api/health` の答え。答えないか形が違えば null。 */
  health(port: number): Promise<HealthReply | null>;
  sleep(ms: number): Promise<void>;
  out(line: string): void;
  err(line: string): void;
}

export interface ServiceManagerOptions {
  io: ServiceIo;
  home: string;
  uid: number;
  repoDir: string;
  nodePath: string;
  nodeVersion: string;
  /** install と restart で health を待つ上限。 */
  waitMs?: number;
}

const exists = (file: string): Promise<boolean> =>
  access(file).then(
    () => true,
    () => false,
  );

const describe = (r: ExecResult): string => `exit ${r.code ?? 'none'}: ${r.stderr.trim() || r.stdout.trim()}`;

export class ServiceManager {
  readonly #o: ServiceManagerOptions;

  constructor(options: ServiceManagerOptions) {
    this.#o = options;
  }

  get plistPath(): string {
    return path.join(this.#o.home, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`);
  }

  get logPath(): string {
    return path.join(this.#o.home, 'Library', 'Logs', 'orca-web', 'service.log');
  }

  get #target(): string {
    return `gui/${this.#o.uid}/${SERVICE_LABEL}`;
  }

  /** 命令を行い、終了コード（成功 0、設定の誤り 2、そのほか 1）を返す。 */
  async run(args: ServiceArgs): Promise<number> {
    try {
      if (args.command === 'install') return await this.#install(args);
      if (args.command === 'uninstall') return await this.#uninstall();
      if (args.command === 'restart') return await this.#restart();
      return await this.#status();
    } catch (error) {
      if (error instanceof ConfigError || error instanceof UsageError) {
        this.#o.io.err(`orca-web service: ${error.message}`);
        return 2;
      }
      throw error;
    }
  }

  async #launchctl(...args: string[]): Promise<ExecResult> {
    return this.#o.io.exec(LAUNCHCTL, args);
  }

  /** 読み込まれていれば `launchctl print` の出力、なければ null。 */
  async #print(): Promise<string | null> {
    const r = await this.#launchctl('print', this.#target);
    return r.code === 0 ? r.stdout : null;
  }

  /** 外し、外れたこと（print が見つけない）を待つ。外した直後の bootstrap は、launchd の後片付けと競合しうる。 */
  async #bootout(keptNote: string): Promise<boolean> {
    const out = await this.#launchctl('bootout', this.#target);
    if (out.code !== 0) {
      this.#o.io.err(`launchctl bootout failed (${describe(out)}); ${keptNote}`);
      return false;
    }
    const attempts = Math.max(1, Math.ceil((this.#o.waitMs ?? DEFAULT_WAIT_MS) / POLL_MS));
    for (let i = 0; i < attempts; i += 1) {
      if ((await this.#print()) === null) return true;
      await this.#o.io.sleep(POLL_MS);
    }
    this.#o.io.err(`${SERVICE_LABEL} is still loaded after bootout; ${keptNote}`);
    return false;
  }

  async #findTailscaleIp(): Promise<string | null> {
    for (const file of ['tailscale', TAILSCALE_APP]) {
      const r = await this.#o.io.exec(file, ['ip', '-4']);
      if (r.code === 0) return parseTailscaleIpv4(r.stdout);
    }
    return null;
  }

  async #resolveTailscale(args: ServiceArgs): Promise<string | null> {
    if (args.tailscaleIp === 'none') return null;
    if (args.tailscaleIp !== 'auto') return args.tailscaleIp;
    const found = await this.#findTailscaleIp();
    if (found === null) {
      this.#o.io.out(
        'Tailscale の IP が取れないので、127.0.0.1 だけで待ち受ける定義にする（Tailscale を動かしてから入れ直す）',
      );
    }
    return found;
  }

  #checkRuntime(): void {
    if (!path.isAbsolute(this.#o.nodePath))
      throw new ConfigError(`node: "${this.#o.nodePath}" is not an absolute path`);
    const major = Number(/^v?(\d+)\./.exec(this.#o.nodeVersion)?.[1]);
    if (!(major >= MIN_NODE_MAJOR)) {
      throw new ConfigError(`node ${this.#o.nodeVersion}: Node.js ${MIN_NODE_MAJOR} or later is required`);
    }
  }

  async #install(args: ServiceArgs): Promise<number> {
    const tailscaleIp = await this.#resolveTailscale(args);
    const environment = buildServiceEnv(args, tailscaleIp);
    this.#checkRuntime();
    const main = path.join(this.#o.repoDir, 'dist', 'server', 'main.js');
    if (!(await exists(main))) throw new ConfigError(`${main} does not exist; run npm run build first`);
    const plist = renderPlist({
      label: SERVICE_LABEL,
      programArguments: [this.#o.nodePath, main],
      workingDirectory: this.#o.repoDir,
      environment,
      logPath: this.logPath,
    });
    const port = Number(environment.PORT);
    const listen = ['127.0.0.1', ...(tailscaleIp ? [tailscaleIp] : [])].map((a) => `http://${a}:${port}/`).join(' ');

    if (args.dryRun) {
      this.#o.io.out(`# ${this.plistPath}`);
      this.#o.io.out(plist);
      this.#o.io.out(`# 読み込み済みなら: launchctl bootout ${this.#target}`);
      this.#o.io.out(`launchctl bootstrap gui/${this.#o.uid} ${this.plistPath}`);
      this.#o.io.out(`# 待ち受け: ${listen}`);
      return 0;
    }

    if ((await this.#print()) !== null && !(await this.#bootout('the definition was not changed'))) return 1;
    await mkdir(path.dirname(this.logPath), { recursive: true });
    await mkdir(path.dirname(this.plistPath), { recursive: true });
    const temp = `${this.plistPath}.tmp-${process.pid}`;
    await writeFile(temp, plist, { mode: 0o644 });
    await rename(temp, this.plistPath);
    const boot = await this.#launchctl('bootstrap', `gui/${this.#o.uid}`, this.plistPath);
    if (boot.code !== 0) {
      this.#o.io.err(`launchctl bootstrap failed (${describe(boot)})`);
      return 1;
    }
    if (!(await this.#waitHealthy(port))) return 1;
    this.#o.io.out(`入れた: ${this.plistPath}`);
    this.#o.io.out(`待ち受け: ${listen}`);
    this.#o.io.out(`ログ: ${this.logPath}`);
    return 0;
  }

  /** health が答え、その pid が launchd のサービスの pid と一致するまで待つ。 */
  async #waitHealthy(port: number): Promise<boolean> {
    const attempts = Math.max(1, Math.ceil((this.#o.waitMs ?? DEFAULT_WAIT_MS) / POLL_MS));
    let last = 'no answer from /api/health';
    for (let i = 0; i < attempts; i += 1) {
      const reply = await this.#o.io.health(port);
      if (reply) {
        const printed = await this.#print();
        const pid = Number(/^\s*pid = (\d+)$/m.exec(printed ?? '')?.[1]);
        if (reply.pid === pid) {
          for (const l of reply.listeners) this.#o.io.out(`  ${l.address} ${l.state}${l.error ? ` (${l.error})` : ''}`);
          return true;
        }
        last = `127.0.0.1:${port} is answered by pid ${reply.pid}, not by the service (pid ${Number.isNaN(pid) ? 'none' : pid})`;
      }
      if (i + 1 < attempts) await this.#o.io.sleep(POLL_MS);
    }
    this.#o.io.err(`orca-web did not become healthy: ${last}. See ${this.logPath}`);
    return false;
  }

  async #uninstall(): Promise<number> {
    if ((await this.#print()) !== null && !(await this.#bootout('the definition was kept'))) return 1;
    await rm(this.plistPath, { force: true });
    this.#o.io.out(`外した: ${this.plistPath}（ログ ${path.dirname(this.logPath)} と項目の選択の設定は残す）`);
    return 0;
  }

  async #installedPort(): Promise<number> {
    const text = await readFile(this.plistPath, 'utf8').catch(() => '');
    const port = Number(/<key>PORT<\/key>\s*<string>(\d+)<\/string>/.exec(text)?.[1]);
    return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
  }

  async #restart(): Promise<number> {
    if ((await this.#print()) === null) {
      this.#o.io.err(`${SERVICE_LABEL} is not loaded; run npm run service:install`);
      return 1;
    }
    const kick = await this.#launchctl('kickstart', '-k', this.#target);
    if (kick.code !== 0) {
      this.#o.io.err(`launchctl kickstart failed (${describe(kick)})`);
      return 1;
    }
    if (!(await this.#waitHealthy(await this.#installedPort()))) return 1;
    this.#o.io.out('起動し直した');
    return 0;
  }

  async #status(): Promise<number> {
    const printed = await this.#print();
    if (printed === null) {
      this.#o.io.out(`${SERVICE_LABEL} は読み込まれていない（定義: ${this.plistPath}）`);
      return 1;
    }
    for (const line of printed.split('\n')) {
      if (/^\s*(state|pid|last exit code) = /.test(line)) this.#o.io.out(line.trim());
    }
    const port = await this.#installedPort();
    const reply = await this.#o.io.health(port);
    if (!reply) this.#o.io.out(`/api/health (127.0.0.1:${port}) が答えない。ログ: ${this.logPath}`);
    else for (const l of reply.listeners) this.#o.io.out(`${l.address} ${l.state}${l.error ? ` (${l.error})` : ''}`);
    return 0;
  }
}
