import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SendRpc } from '../../src/orca/send-gates.ts';
import { wireOrca } from '../../src/orca/wiring.ts';

test('組み立ては接続せずに送信の門を用意する', () => {
  const wired = wireOrca({ executable: '/no-orca' });
  assert.ok(wired.sendRpc instanceof SendRpc);
});

test('openFrom は押した端末を見分けられなければ、Orca に何も送らずに device_unknown を返す', async () => {
  const wired = wireOrca({ executable: '/no-orca', userDataDir: '/no-orca-user-data' });
  const outcome = await wired.openFrom({ worktree: '/p-1' }, undefined);
  assert.equal(!outcome.ok && outcome.error, 'device_unknown');
});
