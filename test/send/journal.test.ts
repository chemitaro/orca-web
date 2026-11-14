import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SendJournal } from '../../src/send/journal.ts';
import { terminalTarget } from './fixture.ts';

async function directory(t: import('node:test').TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-journal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'sends');
}
const before = () => ({
  operationId: 'op',
  route: 'terminal' as const,
  target: { ...terminalTarget(), repoName: 'repo', worktreePath: '/test/worktree', branch: 'test', title: 'test' },
  text: 'hello',
  digest: 'digest',
  generation: { runtimeId: 'runtime-test', incarnationId: 'inc-test' },
});

test('before は専用権限で永続化し after がなければ結果不明になる', async (t) => {
  const dir = await directory(t);
  const journal = new SendJournal(dir);
  await journal.appendBefore(before());
  const record = await new SendJournal(dir).read('op');
  assert.ok(record);
  assert.equal(record.outcome, 'unknown');
  assert.deepEqual(record.detail, { code: 'no_after_record' });
  assert.ok(record.before);
  assert.equal(record.before.text, 'hello');
  assert.equal((await stat(dir)).mode & 0o777, 0o700);
  assert.equal((await stat(path.join(dir, 'sends.jsonl'))).mode & 0o777, 0o600);
  const row = JSON.parse(await readFile(path.join(dir, 'sends.jsonl'), 'utf8'));
  assert.equal(row.schema, 'orca-web.send-record/v1');
  assert.equal(row.kind, 'before');
  assert.ok(Number.isFinite(Date.parse(row.at)));
  assert.equal(await journal.read('absent'), null);
});

test('切れた末尾の後の各記録は再起動後も読めて before だけなら結果不明になる', async (t) => {
  const dir = await directory(t);
  await mkdir(dir);
  const file = path.join(dir, 'sends.jsonl');
  const fragment = '{"schema":"orca-web.send-record/v1","operationId":"broken","kind":';
  await appendFile(file, fragment);
  const journal = new SendJournal(dir);
  await journal.appendBefore(before());
  let record = await new SendJournal(dir).read('op');
  assert.ok(record?.before);
  assert.equal(record.before.text, 'hello');
  assert.equal(record.outcome, 'unknown');
  assert.deepEqual(record.detail, { code: 'no_after_record' });

  await appendFile(file, fragment);
  assert.equal(await journal.appendAfter({ operationId: 'op', outcome: 'unknown', detail: { code: 'timeout' } }), true);
  record = await new SendJournal(dir).read('op');
  assert.ok(record?.after);
  assert.equal(record.after.detail.code, 'timeout');

  await appendFile(file, fragment);
  assert.equal(await journal.appendCheck({ operationId: 'op', outcome: 'submitted', detail: {} }), true);
  record = await new SendJournal(dir).read('op');
  assert.equal(record?.outcome, 'submitted');
  assert.equal(record?.checks.length, 1);

  await appendFile(file, fragment);
  assert.equal(await journal.appendRefused({ operationId: 'refused-op', reason: 'busy' }), true);
  const refused = await new SendJournal(dir).read('refused-op');
  assert.equal(refused?.outcome, 'refused');
  assert.equal(refused?.refused?.reason, 'busy');
  assert.equal(await new SendJournal(dir).read('broken'), null);
});

test('before は datasync の完了まで戻らず失敗したら投げる', async (t) => {
  const dir = await directory(t);
  await mkdir(dir);
  await appendFile(path.join(dir, 'sends.jsonl'), '{"kind":');
  const { open } = await import('node:fs/promises');
  const { promise, resolve } = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  let done = false;
  const journal = new SendJournal(dir, {
    open: async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      return {
        chmod: file.chmod.bind(file),
        stat: file.stat.bind(file),
        read: file.read.bind(file),
        writeFile: file.writeFile.bind(file),
        close: file.close.bind(file),
        datasync: async () => {
          started.resolve();
          await promise;
        },
      };
    },
  });
  const pending = journal.appendBefore(before()).then(() => {
    done = true;
  });
  await Promise.race([started.promise, pending]);
  assert.equal(done, false);
  resolve();
  await pending;
  assert.equal(done, true);
  assert.ok((await new SendJournal(dir).read('op'))?.before);
  const broken = new SendJournal(dir, {
    open: async (...args: Parameters<typeof open>) => {
      const file = await open(...args);
      return {
        chmod: file.chmod.bind(file),
        stat: file.stat.bind(file),
        read: file.read.bind(file),
        writeFile: file.writeFile.bind(file),
        close: file.close.bind(file),
        datasync: async () => {
          throw new Error('sync failed');
        },
      };
    },
  });
  await assert.rejects(broken.appendBefore(before()), /sync failed/);
});

test('末尾を読めなければ before の追記を成功とせず失敗を返す', async (t) => {
  const dir = await directory(t);
  await mkdir(dir);
  const filePath = path.join(dir, 'sends.jsonl');
  await appendFile(filePath, '{"kind":');
  const { open } = await import('node:fs/promises');
  const journal = new SendJournal(dir, {
    open: async (...args) => {
      const file = await open(...args);
      return {
        chmod: file.chmod.bind(file),
        stat: file.stat.bind(file),
        read: async () => {
          throw new Error('tail read failed');
        },
        writeFile: file.writeFile.bind(file),
        datasync: file.datasync.bind(file),
        close: file.close.bind(file),
      };
    },
  });
  await assert.rejects(journal.appendBefore(before()), /tail read failed/);
  assert.equal(await readFile(filePath, 'utf8'), '{"kind":');
  assert.equal(await new SendJournal(dir).read('op'), null);
});

test('after と check を保持し再読込でも最新の確定結果と照会の順が残る', async (t) => {
  const dir = await directory(t);
  const journal = new SendJournal(dir);
  await journal.appendBefore(before());
  assert.equal(await journal.appendAfter({ operationId: 'op', outcome: 'unknown', detail: { code: 'timeout' } }), true);
  assert.equal(
    await journal.appendCheck({ operationId: 'op', outcome: 'submitted', detail: { stages: ['turn_started'] } }),
    true,
  );
  const record = await journal.read('op');
  assert.ok(record);
  assert.equal(record.outcome, 'submitted');
  assert.equal(record.checks.length, 1);
  assert.ok(record.after);
  assert.equal(record.after.outcome, 'unknown');
  assert.deepEqual(await new SendJournal(dir).read('op'), record);
  await journal.appendCheck({ operationId: 'op', outcome: 'unknown', detail: { code: 'orca_pending' } });
  assert.equal((await journal.read('op'))?.outcome, 'submitted');
  assert.equal((await new SendJournal(dir).read('op'))?.outcome, 'submitted');
});

test('after と check は書けなくても偽を返して結果をメモリーに保つ', async (t) => {
  const dir = await directory(t);
  const { open } = await import('node:fs/promises');
  let broken = false;
  const journal = new SendJournal(dir, {
    open: async (...args) => {
      if (broken) throw new Error('disk failed');
      return open(...args);
    },
  });
  await journal.appendBefore(before());
  broken = true;
  assert.equal(
    await journal.appendAfter({ operationId: 'op', outcome: 'unknown', detail: { code: 'timeout' } }),
    false,
  );
  assert.equal(await journal.appendCheck({ operationId: 'op', outcome: 'submitted', detail: {} }), false);
  const result = await journal.read('op');
  assert.ok(result);
  assert.equal(result.outcome, 'submitted');
  assert.equal(result.checks.length, 1);
  assert.ok(result.after);
  assert.equal(result.after.outcome, 'unknown');
  assert.equal((await new SendJournal(dir).read('op'))?.detail.code, 'no_after_record');
});

test('失敗した古い照会より復旧後の新しい照会を優先し二重に重ねない', async (t) => {
  const dir = await directory(t);
  const { open } = await import('node:fs/promises');
  let broken = false;
  const journal = new SendJournal(dir, {
    open: async (...args) => {
      if (broken) throw new Error('disk failed');
      return open(...args);
    },
  });
  await journal.appendBefore(before());
  broken = true;
  await journal.appendCheck({ operationId: 'op', outcome: 'unknown', detail: { code: 'orca_pending' } });
  broken = false;
  await journal.appendCheck({ operationId: 'op', outcome: 'submitted', detail: {} });
  const record = await journal.read('op');
  assert.ok(record);
  assert.equal(record.outcome, 'submitted');
  assert.equal(record.checks.length, 2);
});

test('refused は書けなくても偽を返して拒否の理由をメモリーに保つ', async (t) => {
  const dir = await directory(t);
  const journal = new SendJournal(dir, {
    open: async () => {
      throw new Error('disk failed');
    },
  });
  assert.equal(
    await journal.appendRefused({
      operationId: 'op',
      reason: 'not_sendable',
      notSendableReason: 'foreground_mismatch',
      agentId: 'agent',
    }),
    false,
  );
  const record = await journal.read('op');
  assert.ok(record);
  assert.equal(record.outcome, 'refused');
  assert.equal(record.before, null);
  assert.equal(record.after, null);
  assert.deepEqual(record.detail, { code: 'not_sendable' });
  assert.ok(record.refused);
  assert.equal(record.refused.notSendableReason, 'foreground_mismatch');
  assert.equal(record.refused.agentId, 'agent');
  assert.equal(Object.hasOwn(record.refused, 'text'), false);
  assert.equal(Object.hasOwn(record.refused, 'ticket'), false);
  assert.equal(await new SendJournal(dir).read('op'), null);
});

test('拒否は本文を含めず記録し壊れた行は飛ばす', async (t) => {
  const dir = await directory(t);
  const journal = new SendJournal(dir);
  assert.equal(
    await journal.appendRefused({ operationId: 'op', reason: 'target_changed', change: 'tab_gone', agentId: 'agent' }),
    true,
  );
  const { appendFile } = await import('node:fs/promises');
  await appendFile(
    path.join(dir, 'sends.jsonl'),
    '\ninvalid\nnull\n{"schema":"orca-web.send-record/v1","kind":"after","operationId":"op"}\n',
  );
  const record = await journal.read('op');
  assert.ok(record);
  assert.equal(record.outcome, 'refused');
  assert.ok(record.refused);
  assert.equal(record.refused.reason, 'target_changed');
  const raw = await readFile(path.join(dir, 'sends.jsonl'), 'utf8');
  assert.equal(raw.includes('"text"'), false);
  assert.equal(raw.includes('authToken'), false);
  assert.equal(raw.includes('ticket'), false);
  const blocked = new SendJournal(path.join(dir, 'sends.jsonl'));
  assert.equal(await blocked.appendRefused({ operationId: 'op', reason: 'busy' }), false);
  await assert.rejects(blocked.appendBefore(before()));
});

test('ENOENT 以外で読めなくても当該 ID のメモリーの結果だけで返し、なければ投げる', async (t) => {
  const dir = await directory(t);
  const journal = new SendJournal(dir);
  await journal.appendBefore(before());
  await journal.appendAfter({ operationId: 'op', outcome: 'submitted', detail: { code: 'saved' } });
  await journal.appendCheck({ operationId: 'checked', outcome: 'input_accepted', detail: {} });
  await journal.appendRefused({ operationId: 'refused', reason: 'busy' });
  const file = path.join(dir, 'sends.jsonl');
  await rm(file);
  await mkdir(file);
  assert.equal((await journal.read('op'))?.outcome, 'submitted');
  assert.equal((await journal.read('op'))?.before, null);
  assert.equal((await journal.read('checked'))?.outcome, 'input_accepted');
  assert.equal((await journal.read('refused'))?.outcome, 'refused');
  await assert.rejects(journal.read('absent'), { code: 'EISDIR' });
  await assert.rejects(new SendJournal(dir).read('op'), { code: 'EISDIR' });
});
