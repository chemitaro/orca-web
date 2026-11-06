import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrcaCli } from '../../src/orca/orca-cli.ts';
import type { CliRecording, RpcRecording } from '../../src/orca/replay/recording.ts';
import { ReplayCliRunner, ReplayRpcTransport } from '../../src/orca/replay/replay.ts';

const cliRecording: CliRecording = {
  version: 1,
  kind: 'cli',
  entries: [
    { argv: ['--version'], exitCode: 0, stdout: '1.4.251\n', stderr: '', delayMs: 0 },
    { argv: ['status', '--json'], exitCode: 0, stdout: '{"ok":true,"result":{"n":1}}', stderr: '', delayMs: 60 },
    { argv: ['status', '--json'], exitCode: 0, stdout: '{"ok":true,"result":{"n":2}}', stderr: '', delayMs: 0 },
    { argv: ['worktree', 'ps', '--json'], exitCode: null, stdout: '', stderr: '', delayMs: 0, timedOut: true },
  ],
};

test('ReplayCliRunner は argv が一致する録画を順に返し、遅延を再現する', async () => {
  const runner = new ReplayCliRunner(cliRecording);
  const cli = new OrcaCli(runner);
  assert.deepEqual(await cli.version(), { ok: true, result: '1.4.251', durationMs: 0 });
  const started = performance.now();
  const first = await cli.json(['status']);
  assert.ok(performance.now() - started >= 50);
  assert.equal(first.ok && (first.result as { n: number }).n, 1);
  const second = await cli.json(['status']);
  assert.equal(second.ok && (second.result as { n: number }).n, 2);
  const timedOut = await cli.json(['worktree', 'ps']);
  assert.equal(!timedOut.ok && timedOut.kind, 'timeout');
  assert.deepEqual(runner.calls, [
    ['--version'],
    ['status', '--json'],
    ['status', '--json'],
    ['worktree', 'ps', '--json'],
  ]);
});

test('ReplayCliRunner は一致しない argv や使い切った argv を誤りにする', async () => {
  const runner = new ReplayCliRunner(cliRecording);
  await assert.rejects(runner.run(['terminal', 'send']), /no recorded entry/);
  await runner.run(['--version']);
  await assert.rejects(runner.run(['--version']), /no recorded entry/);
});

test('ReplayRpcTransport は録画の chunks を UnixSocketRpc と同じ解き方で解く', async () => {
  const recording: RpcRecording = {
    version: 1,
    kind: 'rpc',
    exchanges: [
      {
        method: 'session.tabs.list',
        params: { worktree: 'w' },
        chunks: ['{"_keepalive":true}\n{"id":"$ID","ok":', 'true,"result":{"tabs":[]},"_meta":{"runtimeId":"rt"}}\n'],
        end: 'close',
      },
      {
        method: 'nativeChat.readSession',
        chunks: ['{"id":"$ID","ok":false,"error":{"code":"method_not_found","message":"m"}}\n'],
        end: 'close',
      },
      { method: 'session.tabs.listAll', chunks: ['{"id":"$ID"'], end: 'close' },
      { method: 'session.tabs.listAll', chunks: [], end: 'hold' },
    ],
  };
  const rpc = new ReplayRpcTransport(recording);
  assert.deepEqual(await rpc.call('session.tabs.list', { worktree: 'w' }), {
    ok: true,
    result: { tabs: [] },
    runtimeId: 'rt',
  });
  const missing = await rpc.call('nativeChat.readSession', {});
  assert.equal(!missing.ok && missing.code, 'method_not_found');
  const cut = await rpc.call('session.tabs.listAll', null);
  assert.equal(!cut.ok && cut.kind, 'disconnected');
  const held = await rpc.call('session.tabs.listAll', null);
  assert.equal(!held.ok && held.kind, 'timeout');
  await assert.rejects(rpc.call('session.tabs.listAll', null), /no recorded exchange/);
  assert.deepEqual(
    rpc.calls.map((c) => c.method),
    ['session.tabs.list', 'nativeChat.readSession', 'session.tabs.listAll', 'session.tabs.listAll'],
  );
});

test('ReplayRpcTransport は params が録画と違えば誤りにする', async () => {
  const rpc = new ReplayRpcTransport({
    version: 1,
    kind: 'rpc',
    exchanges: [{ method: 'session.tabs.list', params: { worktree: 'a' }, chunks: [], end: 'close' }],
  });
  await assert.rejects(rpc.call('session.tabs.list', { worktree: 'b' }), /no recorded exchange/);
});
