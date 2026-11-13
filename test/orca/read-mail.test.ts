import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrcaCli, ReadOnlyOrcaCli } from '../../src/orca/orca-cli.ts';
import { createMailReader } from '../../src/orca/read-mail.ts';
import { ReplayCliRunner } from '../../src/orca/replay/replay.ts';

function reader(command: string[], result: unknown) {
  const runner = new ReplayCliRunner({
    version: 1,
    kind: 'cli',
    entries: [
      {
        argv: [...command, '--json'],
        exitCode: 0,
        stdout: JSON.stringify({ ok: true, result }),
        stderr: '',
        delayMs: 0,
      },
    ],
  });
  return createMailReader(new ReadOnlyOrcaCli(new OrcaCli(runner)));
}

test('統括あてだけを許可項目に減らし、worker_done だけから最初の PR URL を拾う', async () => {
  const message = {
    id: 'm1',
    run_id: 'r1',
    type: 'worker_done',
    to_handle: 'run:r1',
    created_at: '2026-11-13T00:00:00Z',
    subject: '題'.repeat(250),
    body: '仮の完了 https://github.com/owner/repo/pull/12 https://github.com/owner/repo/pull/13',
    payload: JSON.stringify({
      dispatchId: 'd1',
      taskId: 't1',
      outcome: 'succeeded',
      question: '仮の非公開質問',
      options: ['仮の選択'],
      reportPath: '/private/report',
      filesModified: ['private.ts'],
    }),
  };
  const r = await reader(['orchestration', 'check', '--peek', '--terminal', 'run:r1', '--full'], {
    messages: [
      message,
      { ...message, id: 'm2', type: 'question', payload: { dispatchId: 'd2' } },
      { ...message, id: 'm3', to_handle: 'term:other' },
    ],
  }).readRunMail('r1');
  assert.deepEqual(r, {
    ok: true,
    truncated: false,
    data: [
      {
        id: 'm1',
        runId: 'r1',
        type: 'worker_done',
        toHandle: 'run:r1',
        createdAt: '2026-11-13T00:00:00.000Z',
        subject: '題'.repeat(200),
        dispatchId: 'd1',
        taskId: 't1',
        outcome: 'succeeded',
        prUrl: 'https://github.com/owner/repo/pull/12',
      },
      {
        id: 'm2',
        runId: 'r1',
        type: 'question',
        toHandle: 'run:r1',
        createdAt: '2026-11-13T00:00:00.000Z',
        subject: '題'.repeat(200),
        dispatchId: 'd2',
        taskId: null,
        outcome: null,
        prUrl: null,
      },
    ],
  });
});

test('門は pending だけを返し、名前の揺れと切り詰めを受け、未知の形は失敗する', async () => {
  const command = ['orchestration', 'gate-list', '--run', 'r1', '--full'];
  const r = await reader(command, {
    gates: [
      {
        id: 'g1',
        taskId: 't1',
        status: 'pending',
        createdAt: '2026-11-13',
        question: '問'.repeat(250),
        options: ['仮の非公開選択'],
      },
      { id: 'g2', task_id: 't2', status: 'pending', created_at: '2026-11-12', question: '仮の質問' },
      { id: 'g3', status: 'resolved' },
    ],
  }).readGates('r1');
  assert.deepEqual(r, {
    ok: true,
    truncated: false,
    data: [
      { id: 'g1', taskId: 't1', status: 'pending', createdAt: null, question: '問'.repeat(200) },
      { id: 'g2', taskId: 't2', status: 'pending', createdAt: null, question: '仮の質問' },
    ],
  });
  for (const shape of [null, {}, { gates: {} }, { gates: [null] }, { gates: [{ status: 'pending' }] }]) {
    const bad = await reader(command, shape).readGates('r1');
    assert.equal(!bad.ok && bad.error.kind, 'invalid-shape');
  }
});

test('連絡の未知の形と CLI の失敗を SourceRead にし、生の応答を返さない', async () => {
  const command = ['orchestration', 'check', '--peek', '--terminal', 'run:r1', '--full'];
  for (const value of [
    {},
    { messages: [null] },
    { messages: [{ id: 'm' }] },
    { messages: [{ id: 'm', type: 'question', run_id: 'r1', to_handle: 'run:r1', payload: '{' }] },
  ]) {
    const result = await reader(command, value).readRunMail('r1');
    assert.equal(!result.ok && result.error.kind, 'invalid-shape');
  }
  const cli = new ReadOnlyOrcaCli(
    new OrcaCli({
      async run() {
        return { exitCode: 1, stdout: '仮の私的な本文', stderr: '', durationMs: 0, timedOut: false };
      },
    }),
  );
  for (const result of [await createMailReader(cli).readRunMail('r1'), await createMailReader(cli).readGates('r1')]) {
    assert.equal(!result.ok && result.error.kind, 'exit-nonzero');
    assert.ok(!JSON.stringify(result).includes('私的'));
  }
});

test('連絡と関門の時刻を SQLite・ISO・オフセットから UTC ISO にそろえ、不正と欠落は null', async () => {
  const values = ['2026-11-13 00:00:00', '2026-11-13T00:00:00Z', '2026-11-13T09:00:00+09:00', 'bad', undefined];
  const expected = ['2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z', '2026-11-13T00:00:00.000Z', null, null];
  const mail = await reader(['orchestration', 'check', '--peek', '--terminal', 'run:r1', '--full'], {
    messages: values.map((created_at, i) => ({
      id: `m${i}`,
      type: 'question',
      run_id: 'r1',
      to_handle: 'run:r1',
      created_at,
    })),
  }).readRunMail('r1');
  assert.ok(mail.ok);
  assert.deepEqual(
    mail.data.map((m) => m.createdAt),
    expected,
  );
  for (const key of ['createdAt', 'created_at']) {
    const gates = await reader(['orchestration', 'gate-list', '--run', 'r1', '--full'], {
      gates: values.map((value, i) => ({ id: `g${i}`, status: 'pending', [key]: value })),
    }).readGates('r1');
    assert.ok(gates.ok);
    assert.deepEqual(
      gates.data.map((g) => g.createdAt),
      expected,
    );
  }
});
