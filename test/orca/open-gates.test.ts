import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CliResult, CliRunner } from '../../src/orca/cli.ts';
import { OpenOrcaCli, OpenRpc } from '../../src/orca/open-gates.ts';
import { OrcaCli } from '../../src/orca/orca-cli.ts';
import type { RpcOutcome, RpcTransport } from '../../src/orca/rpc.ts';

class RecordingRunner implements CliRunner {
  readonly calls: string[][] = [];
  async run(argv: readonly string[]): Promise<CliResult> {
    this.calls.push([...argv]);
    return { exitCode: 0, stdout: '{"ok":true,"result":{}}', stderr: '', durationMs: 1, timedOut: false };
  }
}

class RecordingRpc implements RpcTransport {
  readonly calls: { method: string; params: unknown }[] = [];
  async call<T>(method: string, params: unknown): Promise<RpcOutcome<T>> {
    this.calls.push({ method, params });
    return { ok: true, result: {} as T, runtimeId: 'r' };
  }
}

test('OpenOrcaCli は読むコマンドと terminal switch だけを呼び、作る操作と接続先を変えるフラグを送らずに拒む', async () => {
  const runner = new RecordingRunner();
  const cli = new OpenOrcaCli(new OrcaCli(runner));
  await cli.json(['terminal', 'switch', '--terminal', 'term_1']);
  await cli.json(['worktree', 'list']);
  for (const args of [
    ['terminal', 'create'],
    ['terminal', 'send', '--terminal', 't'],
    ['terminal', 'close'],
    ['file', 'open'],
    ['worktree', 'create'],
    ['terminal', 'switchx'],
    ['terminal'],
  ]) {
    await assert.rejects(cli.json(args), /not allowed/, args.join(' '));
  }
  for (const flag of ['--pairing-code', '--environment=x']) {
    await assert.rejects(cli.json(['terminal', 'switch', flag]), /connection-changing/);
  }
  assert.deepEqual(runner.calls, [
    ['terminal', 'switch', '--terminal', 'term_1', '--json'],
    ['worktree', 'list', '--json'],
  ]);
});

test('OpenRpc は読む RPC と navigation: host の activate だけを送り、ほかを送らずに拒む', async () => {
  const inner = new RecordingRpc();
  const rpc = new OpenRpc(inner);
  await rpc.call('session.tabs.list', { worktree: 'id:w' });
  await rpc.call('session.tabs.activate', { worktree: 'id:w', tabId: 't', navigation: 'host' });
  await rpc.call('worktree.activate', { worktree: 'id:w', navigation: 'host' });
  for (const navigation of [undefined, 'all', 'clients', 'caller']) {
    await assert.rejects(rpc.call('session.tabs.activate', { worktree: 'id:w', tabId: 't', navigation }), /host only/);
    await assert.rejects(rpc.call('worktree.activate', { worktree: 'id:w', navigation }), /host only/);
  }
  await assert.rejects(rpc.call('worktree.activate', null), /host only/);
  for (const method of ['session.tabs.create', 'terminal.create', 'terminal.send', 'worktree.create', 'file.open']) {
    await assert.rejects(rpc.call(method, { navigation: 'host' }), /not allowed/, method);
  }
  assert.deepEqual(
    inner.calls.map((c) => c.method),
    ['session.tabs.list', 'session.tabs.activate', 'worktree.activate'],
  );
});

test('開く門は不要な連絡のコマンドを引数によらず送らない', async () => {
  const runner = new RecordingRunner();
  const cli = new OpenOrcaCli(new OrcaCli(runner));
  for (const args of [[], ['--peek'], ['--ack'], ['--peek', '--all']]) {
    await assert.rejects(cli.json(['orchestration', 'check', ...args]), /not allowed/);
  }
  await assert.rejects(cli.json(['orchestration', 'gate-list', '--run', 'r1']), /not allowed/);
  assert.deepEqual(runner.calls, []);
});
