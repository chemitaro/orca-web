import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ConfigError } from '../../src/server/config.ts';
import {
  buildServiceEnv,
  type ExecResult,
  parseServiceArgs,
  parseTailscaleIpv4,
  renderPlist,
  SERVICE_LABEL,
  ServiceManager,
  UsageError,
} from '../../src/service/launchd.ts';

const NODE = '/opt/node/bin/node';

test('parseServiceArgs は命令と引数を読み、知らない命令と引数を拒む', () => {
  assert.deepEqual(parseServiceArgs(['install']), { command: 'install', tailscaleIp: 'auto', dryRun: false });
  assert.deepEqual(
    parseServiceArgs([
      'install',
      '--port',
      '9000',
      '--tailscale-ip',
      'none',
      '--read-origins',
      'http://127.0.0.1:47801',
      '--orca-bin',
      '/x/orca',
      '--settings-file',
      '/x/s.json',
      '--dry-run',
    ]),
    {
      command: 'install',
      port: '9000',
      tailscaleIp: 'none',
      readOrigins: 'http://127.0.0.1:47801',
      orcaBin: '/x/orca',
      settingsFile: '/x/s.json',
      dryRun: true,
    },
  );
  assert.equal(parseServiceArgs(['status']).command, 'status');
  for (const bad of [[], ['start'], ['install', '--bogus'], ['install', '--port'], ['restart', '--port', '1']]) {
    assert.throws(() => parseServiceArgs(bad), UsageError, bad.join(' '));
  }
});

test('parseTailscaleIpv4 は 100.64.0.0/10 の最初の IPv4 を返し、なければ null', () => {
  assert.equal(parseTailscaleIpv4('100.85.74.8\n'), '100.85.74.8');
  assert.equal(parseTailscaleIpv4('fd7a:115c::1\n100.64.0.1\n100.127.255.254\n'), '100.64.0.1');
  for (const none of ['', '192.168.1.2\n', '100.128.0.1\n', '100.63.255.255\n', 'Tailscale is stopped.\n']) {
    assert.equal(parseTailscaleIpv4(none), null, none);
  }
});

test('buildServiceEnv は loadConfig と同じ規則で確かめ、指定のない項目を書かない', () => {
  assert.deepEqual(buildServiceEnv(parseServiceArgs(['install']), '100.64.0.1'), {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    PORT: '8791',
    ORCA_BIN: '/Applications/Orca.app/Contents/Resources/bin/orca',
    ORCA_WEB_TAILSCALE_IP: '100.64.0.1',
  });
  assert.deepEqual(
    buildServiceEnv(
      parseServiceArgs(['install', '--port', '9000', '--read-origins', 'http://a:1', '--settings-file', '/s.json']),
      null,
    ),
    {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      PORT: '9000',
      ORCA_BIN: '/Applications/Orca.app/Contents/Resources/bin/orca',
      ORCA_WEB_READ_ORIGINS: 'http://a:1',
      ORCA_WEB_SETTINGS_FILE: '/s.json',
    },
  );
  for (const [argv, ip] of [
    [['install', '--port', 'abc'], null],
    [['install', '--read-origins', 'http://a:1/path'], null],
    [['install'], '0.0.0.0'],
    [['install'], '127.0.0.1'],
    [['install', '--orca-bin', 'orca'], null],
    [['install', '--settings-file', 'relative.json'], null],
  ] as const) {
    assert.throws(() => buildServiceEnv(parseServiceArgs([...argv]), ip), ConfigError, argv.join(' '));
  }
});

test('renderPlist は決めたキーと値だけを持ち、XML の特殊な文字を逃がす', () => {
  const xml = renderPlist({
    label: SERVICE_LABEL,
    programArguments: [NODE, '/repo/a&b/dist/server/main.js'],
    workingDirectory: '/repo/a&b',
    environment: { PATH: '/usr/bin:/bin', ORCA_WEB_READ_ORIGINS: 'http://<x>:"1"' },
    logPath: "/home/u/Library/Logs/orca-web/service's.log",
  });
  assert.equal(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.github.chemitaro.orca-web</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/node/bin/node</string>
    <string>/repo/a&amp;b/dist/server/main.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/repo/a&amp;b</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/bin:/bin</string>
    <key>ORCA_WEB_READ_ORIGINS</key>
    <string>http://&lt;x&gt;:&quot;1&quot;</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>/home/u/Library/Logs/orca-web/service&apos;s.log</string>
  <key>StandardErrorPath</key>
  <string>/home/u/Library/Logs/orca-web/service&apos;s.log</string>
</dict>
</plist>
`,
  );
});

// ---- ServiceManager ----

interface Fake {
  manager: ServiceManager;
  calls: string[][];
  out: string[];
  err: string[];
  home: string;
  repo: string;
  plist: string;
  healthCalls: number[];
}

interface FakeOptions {
  loaded?: boolean;
  tailscale?: ExecResult;
  fail?: Record<string, ExecResult>;
  pid?: number;
  healthPid?: number | null;
  nodeVersion?: string;
  nodePath?: string;
  build?: boolean;
}

const ok = (stdout = ''): ExecResult => ({ code: 0, stdout, stderr: '' });
const PRINT = (pid: number) =>
  `gui/501/${SERVICE_LABEL} = {\n\tstate = running\n\tpid = ${pid}\n\tlast exit code = 0\n\tother = x\n}\n`;

async function withFake(options: FakeOptions, fn: (f: Fake) => Promise<void>): Promise<void> {
  const home = await mkdtemp(path.join(tmpdir(), 'orca-web-svc-'));
  const repo = path.join(home, 'repo');
  if (options.build !== false) {
    await mkdir(path.join(repo, 'dist', 'server'), { recursive: true });
    await writeFile(path.join(repo, 'dist', 'server', 'main.js'), '');
  }
  const calls: string[][] = [];
  const out: string[] = [];
  const err: string[] = [];
  const healthCalls: number[] = [];
  let loaded = options.loaded ?? false;
  const pid = options.pid ?? 4242;
  const manager = new ServiceManager({
    home,
    uid: 501,
    repoDir: repo,
    nodePath: options.nodePath ?? NODE,
    nodeVersion: options.nodeVersion ?? 'v24.21.0',
    io: {
      async exec(file, args) {
        calls.push([file, ...args]);
        const key = [file, ...args].join(' ');
        for (const [prefix, result] of Object.entries(options.fail ?? {})) {
          if (key.startsWith(prefix)) return result;
        }
        if (file === 'tailscale' || file.endsWith('/Tailscale')) return options.tailscale ?? ok('100.64.0.1\n');
        if (args[0] === 'print') return loaded ? ok(PRINT(pid)) : { code: 113, stdout: '', stderr: 'not found' };
        if (args[0] === 'bootstrap') loaded = true;
        if (args[0] === 'bootout') loaded = false;
        return ok();
      },
      async health(port) {
        healthCalls.push(port);
        if (!loaded) return null;
        const answered = options.healthPid === undefined ? pid : options.healthPid;
        return answered === null ? null : { pid: answered, listeners: [{ address: '127.0.0.1', state: 'listening' }] };
      },
      sleep: async () => {},
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    },
    waitMs: 50,
  });
  try {
    await fn({
      manager,
      calls,
      out,
      err,
      home,
      repo,
      plist: path.join(home, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`),
      healthCalls,
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

const launchctl = (calls: string[][]) =>
  calls.filter((c) => c[0] === '/bin/launchctl').map((c) => c.slice(1).join(' '));

test('install は定義を書き、決めた launchctl の引数だけを送り、サービスの pid の health を待つ', async () => {
  await withFake({}, async (f) => {
    assert.equal(await f.manager.run(parseServiceArgs(['install'])), 0, f.err.join('\n'));
    assert.deepEqual(launchctl(f.calls), [
      `print gui/501/${SERVICE_LABEL}`,
      `bootstrap gui/501 ${f.plist}`,
      `print gui/501/${SERVICE_LABEL}`,
    ]);
    const xml = await readFile(f.plist, 'utf8');
    assert.match(xml, new RegExp(`<string>${NODE}</string>\\n    <string>${f.repo}/dist/server/main.js</string>`));
    assert.match(xml, /<key>ORCA_WEB_TAILSCALE_IP<\/key>\n {4}<string>100\.64\.0\.1<\/string>/);
    assert.match(xml, new RegExp(`<string>${f.home}/Library/Logs/orca-web/service.log</string>`));
    assert.ok(await exists(path.join(f.home, 'Library', 'Logs', 'orca-web')));
    assert.deepEqual(f.healthCalls.slice(-1), [8791]);
    assert.ok(f.out.some((l) => l.includes('100.64.0.1')));
  });
});

test('install は、読み込み済みなら先に bootout し、Tailscale の IP が取れなければ 127.0.0.1 だけの定義を書いてそう出す', async () => {
  await withFake({ loaded: true, tailscale: { code: 1, stdout: '', stderr: 'Tailscale is stopped.' } }, async (f) => {
    assert.equal(await f.manager.run(parseServiceArgs(['install'])), 0, f.err.join('\n'));
    assert.deepEqual(launchctl(f.calls).slice(0, 4), [
      `print gui/501/${SERVICE_LABEL}`,
      `bootout gui/501/${SERVICE_LABEL}`,
      `print gui/501/${SERVICE_LABEL}`,
      `bootstrap gui/501 ${f.plist}`,
    ]);
    assert.doesNotMatch(await readFile(f.plist, 'utf8'), /ORCA_WEB_TAILSCALE_IP/);
    assert.ok(
      f.out.some((l) => /Tailscale の IP が取れない.*127\.0\.0\.1 だけ/.test(l)),
      f.out.join('\n'),
    );
  });
});

test('install --tailscale-ip none は tailscale を呼ばず、IP を指定すればそれを書く', async () => {
  await withFake({}, async (f) => {
    assert.equal(await f.manager.run(parseServiceArgs(['install', '--tailscale-ip', 'none'])), 0);
    assert.ok(!f.calls.some((c) => c[0] !== '/bin/launchctl'));
    assert.doesNotMatch(await readFile(f.plist, 'utf8'), /ORCA_WEB_TAILSCALE_IP/);
  });
  await withFake({}, async (f) => {
    assert.equal(await f.manager.run(parseServiceArgs(['install', '--tailscale-ip', '100.100.1.2'])), 0);
    assert.match(await readFile(f.plist, 'utf8'), /<string>100\.100\.1\.2<\/string>/);
  });
});

test('install --dry-run は定義と命令を出すだけで、書かず、launchctl を呼ばない', async () => {
  await withFake({}, async (f) => {
    assert.equal(await f.manager.run(parseServiceArgs(['install', '--dry-run'])), 0);
    assert.deepEqual(launchctl(f.calls), []);
    assert.equal(await exists(f.plist), false);
    assert.equal(await exists(path.join(f.home, 'Library', 'Logs', 'orca-web')), false);
    const text = f.out.join('\n');
    assert.match(text, /<key>Label<\/key>/);
    assert.match(text, new RegExp(`launchctl bootstrap gui/501 ${f.plist}`));
  });
});

test('install は設定の誤り、古い node、相対の node、成果物のなさで、何も書かず何も送らずに 2 で止まる', async () => {
  const cases: [FakeOptions, string[], RegExp][] = [
    [{}, ['install', '--port', '99999'], /PORT/],
    [{}, ['install', '--tailscale-ip', '0.0.0.0'], /ORCA_WEB_TAILSCALE_IP/],
    [{ nodeVersion: 'v22.1.0' }, ['install'], /Node\.js 24/],
    [{ nodePath: 'node' }, ['install'], /absolute/],
    [{ build: false }, ['install'], /npm run build/],
  ];
  for (const [options, argv, message] of cases) {
    await withFake(options, async (f) => {
      assert.equal(await f.manager.run(parseServiceArgs(argv)), 2, argv.join(' '));
      assert.deepEqual(launchctl(f.calls), []);
      assert.equal(await exists(f.plist), false);
      assert.match(f.err.join('\n'), message);
    });
  }
});

test('install は bootstrap の失敗、health の無応答、別の pid の答えで 1 を返し、成功と言わない', async () => {
  await withFake(
    { fail: { '/bin/launchctl bootstrap': { code: 5, stdout: '', stderr: 'Input/output error' } } },
    async (f) => {
      assert.equal(await f.manager.run(parseServiceArgs(['install'])), 1);
      assert.match(f.err.join('\n'), /bootstrap.*5.*Input\/output error/);
    },
  );
  await withFake({ healthPid: null }, async (f) => {
    assert.equal(await f.manager.run(parseServiceArgs(['install'])), 1);
    assert.match(f.err.join('\n'), /Library\/Logs\/orca-web\/service\.log/);
  });
  await withFake({ healthPid: 999 }, async (f) => {
    assert.equal(await f.manager.run(parseServiceArgs(['install'])), 1);
    assert.match(f.err.join('\n'), /999/);
  });
});

test('install は bootout の失敗で、定義を書き換えず bootstrap せずに 1 で止まる', async () => {
  await withFake(
    { loaded: true, fail: { '/bin/launchctl bootout': { code: 37, stdout: '', stderr: 'Operation now in progress' } } },
    async (f) => {
      await mkdir(path.dirname(f.plist), { recursive: true });
      await writeFile(f.plist, 'OLD');
      assert.equal(await f.manager.run(parseServiceArgs(['install'])), 1);
      assert.equal(await readFile(f.plist, 'utf8'), 'OLD');
      assert.ok(!launchctl(f.calls).some((c) => c.startsWith('bootstrap')));
    },
  );
});

test('uninstall は bootout して定義を消し、ログを残す。読み込まれていなくても定義を消す。bootout の失敗では消さない', async () => {
  await withFake({ loaded: true }, async (f) => {
    await mkdir(path.dirname(f.plist), { recursive: true });
    await writeFile(f.plist, 'X');
    const logs = path.join(f.home, 'Library', 'Logs', 'orca-web');
    await mkdir(logs, { recursive: true });
    assert.equal(await f.manager.run(parseServiceArgs(['uninstall'])), 0);
    assert.deepEqual(launchctl(f.calls), [
      `print gui/501/${SERVICE_LABEL}`,
      `bootout gui/501/${SERVICE_LABEL}`,
      `print gui/501/${SERVICE_LABEL}`,
    ]);
    assert.equal(await exists(f.plist), false);
    assert.equal(await exists(logs), true);
  });
  await withFake({}, async (f) => {
    await mkdir(path.dirname(f.plist), { recursive: true });
    await writeFile(f.plist, 'X');
    assert.equal(await f.manager.run(parseServiceArgs(['uninstall'])), 0);
    assert.deepEqual(launchctl(f.calls), [`print gui/501/${SERVICE_LABEL}`]);
    assert.equal(await exists(f.plist), false);
  });
  await withFake(
    { loaded: true, fail: { '/bin/launchctl bootout': { code: 1, stdout: '', stderr: 'x' } } },
    async (f) => {
      await mkdir(path.dirname(f.plist), { recursive: true });
      await writeFile(f.plist, 'X');
      assert.equal(await f.manager.run(parseServiceArgs(['uninstall'])), 1);
      assert.equal(await exists(f.plist), true);
    },
  );
});

test('restart は kickstart -k を送り、定義のポートで pid の health を待つ。読み込まれていなければ install を示して 1', async () => {
  await withFake({ loaded: true }, async (f) => {
    await mkdir(path.dirname(f.plist), { recursive: true });
    await writeFile(f.plist, '<key>PORT</key>\n    <string>9000</string>');
    assert.equal(await f.manager.run(parseServiceArgs(['restart'])), 0, f.err.join('\n'));
    assert.deepEqual(launchctl(f.calls).slice(0, 2), [
      `print gui/501/${SERVICE_LABEL}`,
      `kickstart -k gui/501/${SERVICE_LABEL}`,
    ]);
    assert.deepEqual(f.healthCalls.slice(-1), [9000]);
  });
  await withFake({}, async (f) => {
    assert.equal(await f.manager.run(parseServiceArgs(['restart'])), 1);
    assert.match(f.err.join('\n'), /service:install/);
    assert.deepEqual(launchctl(f.calls), [`print gui/501/${SERVICE_LABEL}`]);
  });
});

test('status は読み込みの状態の行と health の待ち受けの状態を出し、print だけを送る', async () => {
  await withFake({ loaded: true }, async (f) => {
    assert.equal(await f.manager.run(parseServiceArgs(['status'])), 0);
    assert.deepEqual(launchctl(f.calls), [`print gui/501/${SERVICE_LABEL}`]);
    const text = f.out.join('\n');
    assert.match(text, /state = running/);
    assert.match(text, /pid = 4242/);
    assert.match(text, /last exit code = 0/);
    assert.doesNotMatch(text, /other = x/);
    assert.match(text, /127\.0\.0\.1 listening/);
  });
  await withFake({}, async (f) => {
    assert.equal(await f.manager.run(parseServiceArgs(['status'])), 1);
    assert.match(f.out.join('\n') + f.err.join('\n'), /読み込まれていない/);
  });
});
