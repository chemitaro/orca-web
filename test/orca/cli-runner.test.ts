import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildManagedEnv, NodeCliRunner } from '../../src/orca/cli.ts';

const FAKE = fileURLToPath(new URL('../fixtures/bin/fake-orca', import.meta.url));

test('buildManagedEnv は許した名前だけを写し、ORCA_ の変数を渡さない', () => {
  const env = buildManagedEnv(
    {
      HOME: '/h',
      PATH: '/bin',
      LANG: 'ja_JP.UTF-8',
      SECRET: 'x',
      ORCA_ENVIRONMENT: 'remote',
      ORCA_PAIRING_CODE: 'orca://pair?code=abc',
      ORCA_TERMINAL_HANDLE: 'term_1',
    },
    ['ORCA_ENVIRONMENT', 'EXTRA'],
  );
  assert.deepEqual(env, { HOME: '/h', PATH: '/bin', LANG: 'ja_JP.UTF-8' });
});

test('NodeCliRunner は親の ORCA_ENVIRONMENT と ORCA_PAIRING_CODE を子に渡さず、作業ディレクトリを固定する', async () => {
  const runner = new NodeCliRunner({
    executable: FAKE,
    parentEnv: { ...process.env, ORCA_ENVIRONMENT: 'remote', ORCA_PAIRING_CODE: 'orca://pair?code=abc' },
  });
  const result = await runner.run(['env']);
  assert.equal(result.exitCode, 0);
  const seen = JSON.parse(result.stdout) as { env: Record<string, string>; cwd: string };
  assert.equal(seen.env.ORCA_ENVIRONMENT, undefined);
  assert.equal(seen.env.ORCA_PAIRING_CODE, undefined);
  assert.equal(seen.env.HOME, process.env.HOME);
  assert.equal(realpathSync(seen.cwd), realpathSync(tmpdir()));
});

test('NodeCliRunner は引数を配列のまま渡し、シェルで解釈しない', async () => {
  const runner = new NodeCliRunner({ executable: FAKE });
  const result = await runner.run(['echo', '$(whoami)', 'a b', ';', '*']);
  assert.deepEqual(JSON.parse(result.stdout), { argv: ['$(whoami)', 'a b', ';', '*'] });
  assert.equal(result.stderr, 'note');
  assert.equal(result.timedOut, false);
});

test('相対パスの実行ファイルは呼ばずに誤りにする', () => {
  assert.throws(() => new NodeCliRunner({ executable: 'orca' }), /absolute/);
  assert.throws(() => new NodeCliRunner({ executable: './bin/orca' }), /absolute/);
});

test('時間切れは timedOut で区別できる', async () => {
  const runner = new NodeCliRunner({ executable: FAKE });
  const result = await runner.run(['sleep', '5000'], { timeoutMs: 200 });
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, null);
});

test('0 でない終了コードと stderr を返す', async () => {
  const runner = new NodeCliRunner({ executable: FAKE });
  const result = await runner.run(['fail', '3']);
  assert.equal(result.exitCode, 3);
  assert.equal(result.stderr, 'boom');
  assert.equal(result.timedOut, false);
});

test('起動できない実行ファイルは spawnError で返す', async () => {
  const runner = new NodeCliRunner({ executable: '/nonexistent/orca' });
  const result = await runner.run(['status']);
  assert.equal(result.exitCode, null);
  assert.match(result.spawnError ?? '', /ENOENT/);
});
