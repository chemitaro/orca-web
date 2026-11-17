import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CliResult } from '../../src/orca/cli.ts';
import {
  type CommandRunner,
  classifyOrigin,
  LSOF_EXECUTABLE,
  normalizeAddress,
  type PeersOutcome,
  RuntimePeers,
  resolveOpenDevice,
} from '../../src/orca/open-device.ts';

const TOKEN = 'secret-token-value-1';

const runtimeFile = (transports: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ runtimeId: 'uuid-1', pid: 4242, authToken: TOKEN, startedAt: 1, transports, ...extra });

const WS = [
  { kind: 'unix', endpoint: '/p-1/o.sock' },
  { kind: 'websocket', endpoint: 'ws://0.0.0.0:6768' },
];

const result = (extra: Partial<CliResult> = {}): CliResult => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  durationMs: 1,
  timedOut: false,
  ...extra,
});

function fakeRunner(reply: CliResult | Error) {
  const calls: { executable: string; argv: readonly string[]; options: unknown }[] = [];
  const runner: CommandRunner = async (executable, argv, options) => {
    calls.push({ executable, argv, options });
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { runner, calls };
}

function peers(file: string | Error, reply: CliResult | Error) {
  const fake = fakeRunner(reply);
  const read: string[] = [];
  const service = new RuntimePeers({
    userDataDir: '/p-2',
    runner: fake.runner,
    readRuntimeFile: async (path) => {
      read.push(path);
      if (file instanceof Error) throw file;
      return file;
    },
  });
  return { service, calls: fake.calls, read };
}

test('normalizeAddress は ::ffff: の IPv4、IPv6 の zone、大文字を直す（T-04）', () => {
  assert.equal(normalizeAddress('::ffff:127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeAddress('::FFFF:100.64.0.2'), '100.64.0.2');
  assert.equal(normalizeAddress('fe80::1%en0'), 'fe80::1');
  assert.equal(normalizeAddress('FD7A:115C::1'), 'fd7a:115c::1');
  assert.equal(normalizeAddress('100.64.0.2'), '100.64.0.2');
});

test('classifyOrigin：loopback とホストの口のアドレスは host、ほかは remote、値がなければ unknown（T-04）', () => {
  const hosts = new Set(['100.64.0.1', 'fd7a:115c::1', '192.168.0.5']);
  for (const a of [
    '127.0.0.1',
    '127.1.2.3',
    '::1',
    '::ffff:127.0.0.1',
    '100.64.0.1',
    '::ffff:192.168.0.5',
    'FD7A:115C::1',
  ]) {
    assert.equal(classifyOrigin(a, hosts), 'host', a);
  }
  for (const a of ['100.64.0.2', '::ffff:100.64.0.2', 'fd7a:115c::2', '10.0.0.1']) {
    assert.equal(classifyOrigin(a, hosts), 'remote', a);
  }
  assert.equal(classifyOrigin(undefined, hosts), 'unknown');
  assert.equal(classifyOrigin('', hosts), 'unknown');
});

test('resolveOpenDevice：host は接続を読まない。集合にあれば client、なければ device_not_connected、読めなければ device_unknown（T-04）', async () => {
  let reads = 0;
  const deps = (outcome: PeersOutcome) => ({
    hostAddresses: () => new Set(['100.64.0.1']),
    peers: async () => {
      reads += 1;
      return outcome;
    },
  });
  const withPeer = deps({ ok: true, addresses: new Set(['100.64.0.2']) });

  assert.deepEqual(await resolveOpenDevice('::ffff:127.0.0.1', withPeer), { ok: true, device: 'host' });
  assert.deepEqual(await resolveOpenDevice('100.64.0.1', withPeer), { ok: true, device: 'host' });
  assert.equal(reads, 0);

  assert.deepEqual(await resolveOpenDevice('::ffff:100.64.0.2', withPeer), { ok: true, device: 'client' });
  const missing = await resolveOpenDevice('100.64.0.3', withPeer);
  assert.equal(!missing.ok && missing.error, 'device_not_connected');
  const failed = await resolveOpenDevice('100.64.0.2', deps({ ok: false, message: 'lsof timed out' }));
  assert.equal(!failed.ok && failed.error, 'device_unknown');
  assert.equal(reads, 3);

  const none = await resolveOpenDevice(undefined, withPeer);
  assert.equal(!none.ok && none.error, 'device_unknown');
  assert.equal(reads, 3);
});

test('RuntimePeers は lsof を絶対パスと引数の配列で呼び、-F n の出力の remote のアドレスを集める（T-05）', async () => {
  const stdout = [
    'p4242',
    'f40',
    'n100.64.0.1:6768->100.64.0.2:51000',
    'f41',
    'n[fd7a:115c::1]:6768->[FD7A:115C::2]:51001',
    'f42',
    'n[::ffff:100.64.0.1]:6768->[::ffff:100.64.0.4]:51002',
    'f43',
    'n100.64.0.1:51003->100.64.0.9:6768',
    'f44',
    'n*:6768',
    '',
  ].join('\n');
  const { service, calls, read } = peers(runtimeFile(WS), result({ stdout }));
  const outcome = await service.peers();
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.ok && [...outcome.addresses].sort(), ['100.64.0.2', '100.64.0.4', 'fd7a:115c::2']);
  assert.deepEqual(read, ['/p-2/orca-runtime.json']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.executable, LSOF_EXECUTABLE);
  assert.equal(LSOF_EXECUTABLE, '/usr/sbin/lsof');
  assert.deepEqual(calls[0]?.argv, ['-nP', '-a', '-p', '4242', '-iTCP:6768', '-sTCP:ESTABLISHED', '-F', 'n']);
  assert.deepEqual(calls[0]?.options, { timeoutMs: 3000, maxOutputBytes: 64 * 1024 });
  assert.ok(!JSON.stringify(calls).includes(TOKEN));
});

test('RuntimePeers：終了コード 1 で空は空の集合、websocket のない runtime は lsof を呼ばずに空の集合（T-05）', async () => {
  const empty = peers(runtimeFile(WS), result({ exitCode: 1 }));
  const outcome = await empty.service.peers();
  assert.deepEqual(outcome.ok && [...outcome.addresses], []);

  const noWs = peers(runtimeFile([{ kind: 'unix', endpoint: '/p-1/o.sock' }]), result());
  const none = await noWs.service.peers();
  assert.deepEqual(none.ok && [...none.addresses], []);
  assert.equal(noWs.calls.length, 0);
});

test('RuntimePeers：ほかの失敗・時間切れ・起動の失敗・ファイルの誤りは ok:false で、authToken を出さない（T-05）', async () => {
  const cases: [string | Error, CliResult | Error][] = [
    [runtimeFile(WS), result({ exitCode: 1, stdout: 'p4242\n' })],
    [runtimeFile(WS), result({ exitCode: 2, stderr: TOKEN })],
    [runtimeFile(WS), result({ exitCode: null, timedOut: true })],
    [runtimeFile(WS), result({ exitCode: null, outputOverflow: true })],
    [runtimeFile(WS), result({ exitCode: null, spawnError: 'ENOENT' })],
    [runtimeFile(WS), new Error(TOKEN)],
    [Object.assign(new Error('no'), { code: 'ENOENT' }), result()],
    [`{${TOKEN}`, result()],
    [runtimeFile(WS, { pid: 'x' }), result()],
    [runtimeFile([{ kind: 'websocket', endpoint: `ws://${TOKEN}` }]), result()],
  ];
  for (const [file, reply] of cases) {
    const { service } = peers(file, reply);
    const outcome = await service.peers();
    assert.equal(outcome.ok, false, JSON.stringify(outcome));
    assert.ok(!JSON.stringify(outcome).includes(TOKEN), JSON.stringify(outcome));
  }
});

test('RuntimePeers の結果とその文に authToken が入らない（T-05）', async () => {
  const { service } = peers(runtimeFile(WS), result({ stdout: 'n100.64.0.1:6768->100.64.0.2:51000\n' }));
  const outcome = await service.peers();
  assert.ok(outcome.ok);
  assert.ok(!JSON.stringify([...outcome.addresses]).includes(TOKEN));
  assert.ok(!JSON.stringify(service).includes(TOKEN));
});
