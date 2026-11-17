import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CliResult } from '../../src/orca/cli.ts';
import type { CommandRunner } from '../../src/orca/open-device.ts';
import { raiseOrca } from '../../src/orca/raise.ts';

const result = (extra: Partial<CliResult> = {}): CliResult => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  durationMs: 1,
  timedOut: false,
  ...extra,
});

test('raiseOrca は /usr/bin/open -b com.stablyai.orca を引数の配列で呼び、終了コード 0 なら true（T-06）', async () => {
  const calls: { executable: string; argv: readonly string[]; options: unknown }[] = [];
  const runner: CommandRunner = async (executable, argv, options) => {
    calls.push({ executable, argv, options });
    return result();
  };
  assert.equal(await raiseOrca(runner), true);
  assert.deepEqual(calls, [
    { executable: '/usr/bin/open', argv: ['-b', 'com.stablyai.orca'], options: { timeoutMs: 5000 } },
  ]);
});

test('raiseOrca は終了コードが 0 でない・時間切れ・起動の失敗・例外で false を返し、投げない（T-06）', async () => {
  for (const reply of [
    result({ exitCode: 1 }),
    result({ exitCode: null, timedOut: true }),
    result({ exitCode: null, spawnError: 'ENOENT' }),
    new Error('x'),
  ]) {
    const runner: CommandRunner = async () => {
      if (reply instanceof Error) throw reply;
      return reply;
    };
    assert.equal(await raiseOrca(runner), false);
  }
});
