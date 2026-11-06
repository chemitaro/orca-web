import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { CliRunner } from '../../src/orca/cli.ts';
import {
  RecordingCliRunner,
  RecordingRpcTransport,
  writeRecording,
  writeRecordingSet,
} from '../../src/orca/replay/record.ts';
import type { CliRecording, RpcRecording } from '../../src/orca/replay/recording.ts';
import { ReplayCliRunner, ReplayRpcTransport } from '../../src/orca/replay/replay.ts';
import { Pseudonymizer } from '../../src/orca/replay/sanitize.ts';
import type { RpcTransport } from '../../src/orca/rpc.ts';

const HOME = '/Users/someone';
const U1 = '0b9c1f2e-1111-4a2b-8c3d-aaaaaaaaaaaa';

test('RecordingCliRunner は呼んだ結果を返し、仮名化した録画を作り、録画は再生できる', async () => {
  const inner: CliRunner = {
    async run(argv) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ ok: true, result: { id: U1, path: `${HOME}/w`, prompt: 'private words' } }),
        stderr: '',
        durationMs: 7,
        timedOut: false,
        ...(argv[0] === 'x' ? {} : {}),
      };
    },
  };
  const recorder = new RecordingCliRunner(inner);
  const live = await recorder.run(['worktree', 'list', '--json']);
  assert.match(live.stdout, /private words/);
  const recording = recorder.recording({ homeDir: HOME });
  const text = JSON.stringify(recording);
  assert.ok(!text.includes('private words') && !text.includes(U1) && !text.includes(HOME));
  assert.equal(recording.entries[0]?.delayMs, 7);
  const replayed = await new ReplayCliRunner(recording).run(['worktree', 'list', '--json']);
  assert.match(replayed.stdout, /"id":"uuid-1"/);
});

test('RecordingRpcTransport は応答を1つの行として録り、$ID で再生できる', async () => {
  const inner: RpcTransport = {
    async call<T>() {
      return { ok: true as const, result: { worktree: `${U1}::${HOME}/w`, title: 'secret tab' } as T, runtimeId: U1 };
    },
  };
  const recorder = new RecordingRpcTransport(inner);
  await recorder.call('session.tabs.list', { worktree: `${U1}::${HOME}/w` });
  const failing: RpcTransport = {
    async call() {
      return { ok: false as const, kind: 'orca-error' as const, code: 'method_not_found', message: 'Unknown method' };
    },
  };
  const recorder2 = new RecordingRpcTransport(failing);
  await recorder2.call('nativeChat.readSession', {});
  const recording = recorder.recording({ homeDir: HOME });
  assert.equal(recording.exchanges[0]?.chunks.length, 1);
  const replay = new ReplayRpcTransport(recording);
  const params = recording.exchanges[0]?.params;
  const outcome = await replay.call('session.tabs.list', params);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.runtimeId, 'uuid-1');
  const err = await new ReplayRpcTransport(recorder2.recording()).call('nativeChat.readSession', {});
  assert.equal(!err.ok && err.code, 'method_not_found');
});

test('RecordingRpcTransport は通信の失敗（時間切れ、接続断）も再生できる形で録る', async () => {
  const kinds = ['timeout', 'disconnected', 'unavailable'] as const;
  for (const kind of kinds) {
    const recorder = new RecordingRpcTransport({
      async call() {
        return { ok: false as const, kind, message: 'x' };
      },
    });
    await recorder.call('session.tabs.listAll', null);
    const outcome = await new ReplayRpcTransport(recorder.recording()).call('session.tabs.listAll', null);
    assert.equal(!outcome.ok && outcome.kind, kind === 'unavailable' ? 'disconnected' : kind);
  }
});

test('writeRecording は検査を通った録画だけを書き、通らなければ何も書かない', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ow-rec-'));
  try {
    const good: CliRecording = { version: 1, kind: 'cli', entries: [] };
    await writeRecording(path.join(dir, 'good.json'), good);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'good.json'), 'utf8')), good);
    const bad: RpcRecording = {
      version: 1,
      kind: 'rpc',
      exchanges: [{ method: 'm', chunks: ['{"id":"$ID","ok":true,"result":{"prompt":"leak"}}\n'], end: 'close' }],
    };
    await assert.rejects(writeRecording(path.join(dir, 'bad.json'), bad), /unsafe recording/);
    await assert.rejects(stat(path.join(dir, 'bad.json')), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('同じ Pseudonymizer を渡すと、CLI と RPC の録画をまたいで同じ値が同じ仮名になる', async () => {
  const cliRec = new RecordingCliRunner({
    async run() {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ ok: true, result: { id: U1 } }),
        stderr: '',
        durationMs: 0,
        timedOut: false,
      };
    },
  });
  await cliRec.run(['worktree', 'list', '--json']);
  const rpcRec = new RecordingRpcTransport({
    async call<T>() {
      return { ok: true as const, result: { worktree: U1 } as T, runtimeId: null };
    },
  });
  await rpcRec.call('session.tabs.listAll', null);
  const shared = new Pseudonymizer();
  const a = JSON.parse(cliRec.recording({}, shared).entries[0]?.stdout ?? '{}').result.id;
  const b = JSON.parse(rpcRec.recording({}, shared).exchanges[0]?.chunks[0] ?? '{}').result.worktree;
  assert.equal(a, b);
  // 別々なら、それぞれの表で数える
  const c = JSON.parse(rpcRec.recording().exchanges[0]?.chunks[0] ?? '{}').result.worktree;
  assert.match(c, /^uuid-\d+$/);
});

test('writeRecordingSet は全部の録画を検査してから、出力先を作って書く。1つでも通らなければ何も書かない', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ow-set-'));
  try {
    const good: CliRecording = { version: 1, kind: 'cli', entries: [] };
    const bad: RpcRecording = {
      version: 1,
      kind: 'rpc',
      exchanges: [{ method: 'm', chunks: ['{"id":"$ID","ok":true,"result":{"prompt":"leak"}}\n'], end: 'close' }],
    };
    const out = path.join(dir, 'new', 'sub');
    await assert.rejects(writeRecordingSet(out, { 'a.json': good, 'b.json': bad }), /unsafe recording/);
    await assert.rejects(stat(out), /ENOENT/);
    await writeRecordingSet(out, { 'a.json': good });
    assert.deepEqual(JSON.parse(await readFile(path.join(out, 'a.json'), 'utf8')), good);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
