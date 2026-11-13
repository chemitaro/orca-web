import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CliResult, CliRunner } from '../../src/orca/cli.ts';
import { OrcaCli, ReadOnlyOrcaCli } from '../../src/orca/orca-cli.ts';

function runnerReturning(result: Partial<CliResult>, seen: string[][] = []): CliRunner {
  return {
    async run(argv) {
      seen.push([...argv]);
      return { exitCode: 0, stdout: '', stderr: '', durationMs: 1, timedOut: false, ...result };
    },
  };
}

test('json は --json を付けて呼び、ok の封筒から result を返す', async () => {
  const seen: string[][] = [];
  const cli = new OrcaCli(runnerReturning({ stdout: '{"id":"x","ok":true,"result":{"a":1}}' }, seen));
  const outcome = await cli.json(['worktree', 'list']);
  assert.deepEqual(seen, [['worktree', 'list', '--json']]);
  assert.deepEqual(outcome, { ok: true, result: { a: 1 }, durationMs: 1 });
});

test('ok: false の封筒は orca-error と Orca の code で返す（終了コードによらない）', async () => {
  const cli = new OrcaCli(
    runnerReturning({
      exitCode: 1,
      stdout: '{"ok":false,"error":{"code":"runtime_unavailable","message":"not running"}}',
    }),
  );
  const outcome = await cli.json(['status']);
  assert.deepEqual(outcome, {
    ok: false,
    kind: 'orca-error',
    code: 'runtime_unavailable',
    message: 'not running',
    exitCode: 1,
  });
});

test('JSON でない stdout は、終了コードが 0 なら invalid-json、0 でなければ exit-nonzero', async () => {
  const a = await new OrcaCli(runnerReturning({ stdout: 'hello' })).json(['status']);
  assert.equal(a.ok, false);
  assert.equal(!a.ok && a.kind, 'invalid-json');
  const b = await new OrcaCli(runnerReturning({ exitCode: 2, stderr: 'bad flag' })).json(['status']);
  assert.equal(!b.ok && b.kind, 'exit-nonzero');
  assert.equal(!b.ok && b.exitCode, 2);
  assert.match(!b.ok ? b.message : '', /bad flag/);
});

test('時間切れは timeout、起動の失敗は spawn-failed', async () => {
  const a = await new OrcaCli(runnerReturning({ exitCode: null, timedOut: true })).json(['status']);
  assert.equal(!a.ok && a.kind, 'timeout');
  const b = await new OrcaCli(runnerReturning({ exitCode: null, spawnError: 'ENOENT' })).json(['status']);
  assert.equal(!b.ok && b.kind, 'spawn-failed');
  assert.match(!b.ok ? b.message : '', /ENOENT/);
});

test('誤りの文は長さを切る', async () => {
  const outcome = await new OrcaCli(runnerReturning({ exitCode: 1, stderr: 'x'.repeat(5000) })).json(['status']);
  assert.ok(!outcome.ok && outcome.message.length <= 500);
});

test('封筒の形でない JSON は invalid-json', async () => {
  const outcome = await new OrcaCli(runnerReturning({ stdout: '[1,2]' })).json(['status']);
  assert.equal(!outcome.ok && outcome.kind, 'invalid-json');
});

test('version は --version の1行目を返す', async () => {
  const seen: string[][] = [];
  const outcome = await new OrcaCli(runnerReturning({ stdout: '1.4.251\n' }, seen)).version();
  assert.deepEqual(seen, [['--version']]);
  assert.deepEqual(outcome, { ok: true, result: '1.4.251', durationMs: 1 });
});

test('ReadOnlyOrcaCli は読むコマンドだけを呼び、ほかのコマンドは呼ばずに誤りにする', async () => {
  const seen: string[][] = [];
  const cli = new ReadOnlyOrcaCli(new OrcaCli(runnerReturning({ stdout: '{"ok":true,"result":{}}' }, seen)));
  assert.equal((await cli.json(['worktree', 'ps'])).ok, true);
  assert.equal((await cli.json(['orchestration', 'worker-show', '--dispatch', 'ctx_1', '--full'])).ok, true);
  for (const args of [
    ['terminal', 'switch', '--terminal', 'term_1'],
    ['terminal', 'send', '--terminal', 'term_1', '--text', 'hi'],
    ['worktree', 'rm'],
    ['status', '--pairing-code', 'x'],
    ['status', '--environment', 'remote'],
  ]) {
    await assert.rejects(cli.json(args), /not a read-only command|not allowed/);
  }
  assert.deepEqual(seen, [
    ['worktree', 'ps', '--json'],
    ['orchestration', 'worker-show', '--dispatch', 'ctx_1', '--full', '--json'],
  ]);
});

test('document は --json の封筒のない JSON（agent-context）をそのまま返す', async () => {
  const seen: string[][] = [];
  const cli = new OrcaCli(runnerReturning({ stdout: '{"schemaVersion":1,"commands":[]}' }, seen));
  assert.deepEqual(await cli.document(['agent-context']), {
    ok: true,
    result: { schemaVersion: 1, commands: [] },
    durationMs: 1,
  });
  assert.deepEqual(seen, [['agent-context', '--json']]);
  const bad = await new OrcaCli(runnerReturning({ stdout: 'nope' })).document(['agent-context']);
  assert.equal(!bad.ok && bad.kind, 'invalid-json');
  const ro = new ReadOnlyOrcaCli(new OrcaCli(runnerReturning({ stdout: '{}' })));
  assert.equal((await ro.document(['agent-context'])).ok, true);
  await assert.rejects(ro.document(['terminal', 'send']), /not a read-only command/);
});

test('出力の超過は output-too-large で返す', async () => {
  const outcome = await new OrcaCli(runnerReturning({ exitCode: null, outputOverflow: true })).json(['status']);
  assert.equal(!outcome.ok && outcome.kind, 'output-too-large');
});

test('誤りの文に Orca の生の stdout を入れない（json・document・version）', async () => {
  const leak = 'PRIVATE stdout line with /Users/someone/secret-plan';
  const cases = [
    await new OrcaCli(runnerReturning({ stdout: leak })).json(['status']),
    await new OrcaCli(runnerReturning({ exitCode: 3, stdout: leak })).json(['status']),
    await new OrcaCli(runnerReturning({ stdout: leak })).document(['agent-context']),
    await new OrcaCli(runnerReturning({ exitCode: 3, stdout: leak })).document(['agent-context']),
    await new OrcaCli(runnerReturning({ exitCode: 3, stdout: leak })).version(),
  ];
  for (const outcome of cases) {
    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && !outcome.message.includes('PRIVATE'), !outcome.ok ? outcome.message : '');
  }
  const [invalid, nonzero] = cases;
  assert.equal(!invalid?.ok && invalid?.message, `stdout is not JSON (${Buffer.byteLength(leak)} bytes)`);
  assert.equal(!nonzero?.ok && nonzero?.message, 'exited with code 3');
  const withStderr = await new OrcaCli(runnerReturning({ exitCode: 3, stdout: leak, stderr: 'bad flag' })).json([
    'status',
  ]);
  assert.equal(!withStderr.ok && withStderr.message, 'bad flag', 'stderr は Orca の誤りの説明として使う');
});

test('check は peek だけを通し、既読や待機の指定を CLI を呼ばずに拒む', async () => {
  const seen: string[][] = [];
  const cli = new ReadOnlyOrcaCli(new OrcaCli(runnerReturning({ stdout: '{"ok":true,"result":{}}' }, seen)));
  for (const invoke of [cli.json.bind(cli), cli.document.bind(cli)]) {
    await assert.rejects(invoke(['orchestration', 'check']), /not a read-only command|not allowed/);
    for (const flag of ['--ack', '--all', '--unread', '--wait', '--retry-request']) {
      for (const value of [flag, `${flag}=true`]) {
        await assert.rejects(
          invoke(['orchestration', 'check', '--peek', value]),
          /not a read-only command|not allowed/,
        );
      }
    }
  }
  assert.equal(seen.length, 0);
  assert.ok((await cli.json(['orchestration', 'check', '--peek', '--terminal', 'run:r1', '--full'])).ok);
  assert.ok((await cli.json(['orchestration', 'gate-list', '--run', 'r1', '--full'])).ok);
});
