import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SendRpc } from '../../src/orca/send-gates.ts';
import { wireOrca } from '../../src/orca/wiring.ts';

test('組み立ては接続せずに送信の門を用意する', () => {
  const wired = wireOrca({ executable: '/no-orca' });
  assert.ok(wired.sendRpc instanceof SendRpc);
});
