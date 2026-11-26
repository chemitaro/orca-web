import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrcaCli, ReadOnlyOrcaCli } from '../../src/orca/orca-cli.ts';
import { createThreadReader, isAutoNotice } from '../../src/orca/read-threads.ts';
import { ReplayCliRunner } from '../../src/orca/replay/replay.ts';

const ARGV = ['orchestration', 'inbox', '--run', 'r1', '--limit', '1000', '--full', '--json'];

function reader(result: unknown, ok = true) {
  const runner = new ReplayCliRunner({
    version: 1,
    kind: 'cli',
    entries: [
      {
        argv: ARGV,
        exitCode: 0,
        stdout: JSON.stringify(ok ? { ok: true, result } : { ok: false, error: { code: 'x', message: 'bad' } }),
        stderr: '',
        delayMs: 0,
      },
    ],
  });
  return createThreadReader(new ReadOnlyOrcaCli(new OrcaCli(runner)));
}

const at = (minute: number) => `2026-11-26T00:${String(minute).padStart(2, '0')}:00Z`;

interface Spec {
  id: string;
  type?: string;
  from?: string | null;
  to?: string | null;
  thread?: string | null;
  minute: number;
  body?: unknown;
}

let sequence = 0;
function msg(s: Spec) {
  sequence++;
  return {
    id: s.id,
    type: s.type ?? 'question',
    from_handle: s.from === undefined ? 'dispatch:d1' : s.from,
    to_handle: s.to === undefined ? 'run:r1' : s.to,
    thread_id: s.thread === undefined ? null : s.thread,
    created_at: at(s.minute),
    delivered_at: null,
    delivery_contract: null,
    body: s.body === undefined ? '仮の本文' : s.body,
    subject: '仮の件名',
    payload: JSON.stringify({ dispatchId: 'd1', question: '仮の問い' }),
    priority: 'normal',
    read: false,
    run_id: 'r1',
    sender_pane_key: null,
    sequence,
  };
}

/** 本人あての返事（統括から）。 */
const reply = (id: string, thread: string, minute: number, body: unknown = '仮の答え') =>
  msg({ id, type: 'question', from: 'run:r1', to: 'dispatch:d1', thread, minute, body });

/** 新しい順（sequence の降順）に並べて読む。 */
async function answered(messages: ReturnType<typeof msg>[]) {
  const r = await reader({ messages: [...messages].reverse(), count: messages.length }).readThreads('r1');
  assert.ok(r.ok);
  return r.data.questions.get('d1')?.answered;
}

const NOTICES = [
  'Your question was removed before your coordinator read it. Decide it yourself and say what you chose when you report.',
  'No one coordinates Run run_abc123 now, so no one will read your question. Decide it yourself and say what you chose when you report.',
  'Your coordinator stopped without answering your question and has no worker running for it. Decide it yourself and say what you chose when you report. If an answer comes later, it still reaches you.',
  'The pairing with My Server was re-made. Your question msg_123 there will not be answered. Decide without it, or ask again.',
  "My Server was removed from this Orca's paired servers. Your question msg_123 there will not be answered. Decide without it, or ask again.",
];

test('iss-00098 T-02: 読みの結果の値に body・subject・payload がなく、決めた項目だけを持つ', async () => {
  const q = msg({ id: 'q1', minute: 1 });
  const r = await reader({ messages: [reply('a1', 'q1', 2), q], count: 2 }).readThreads('r1');
  assert.ok(r.ok);
  const text = JSON.stringify(r.data.messages);
  for (const word of ['仮の本文', '仮の答え', '仮の件名', '仮の問い', 'body', 'subject', 'payload']) {
    assert.ok(!text.includes(word), word);
  }
  assert.deepEqual(r.data.messages, [
    {
      id: 'a1',
      type: 'question',
      fromHandle: 'run:r1',
      toHandle: 'dispatch:d1',
      threadId: 'q1',
      createdAt: '2026-11-26T00:02:00.000Z',
      auto: false,
    },
    {
      id: 'q1',
      type: 'question',
      fromHandle: 'dispatch:d1',
      toHandle: 'run:r1',
      threadId: null,
      createdAt: '2026-11-26T00:01:00.000Z',
      auto: false,
    },
  ]);
  assert.deepEqual(
    [...r.data.questions],
    [['d1', { latestId: 'q1', latestAt: '2026-11-26T00:01:00.000Z', answered: true }]],
  );
});

test('iss-00098 T-02: 最新の質問の後に本人あての返事があれば answered 真', async () => {
  assert.equal(await answered([msg({ id: 'q1', minute: 1 }), reply('a1', 'q1', 2)]), true);
  // 古い質問にも返事があり、最新の質問にも返事がある
  assert.equal(
    await answered([
      msg({ id: 'q1', minute: 1 }),
      reply('a1', 'q1', 2),
      msg({ id: 'q2', minute: 3 }),
      reply('a2', 'q2', 4),
    ]),
    true,
  );
});

test('iss-00098 T-02: 返事が古い質問のスレッドだけ・質問より前・宛先が Run（本人の追いの発言）だけなら偽', async () => {
  assert.equal(
    await answered([msg({ id: 'q1', minute: 1 }), reply('a1', 'q1', 2), msg({ id: 'q2', minute: 3 })]),
    false,
  );
  assert.equal(await answered([reply('a0', 'q1', 0), msg({ id: 'q1', minute: 1 })]), false);
  assert.equal(await answered([msg({ id: 'q1', minute: 1 }), reply('a1', 'q1', 1)]), false, '同じ時刻は後でない');
  const followUp = msg({ id: 'f1', from: 'structworker_x', to: 'run:r1', thread: 'q1', minute: 2 });
  assert.equal(await answered([msg({ id: 'q1', minute: 1 }), followUp]), false);
  const otherDispatch = msg({ id: 'a2', from: 'run:r1', to: 'dispatch:d2', thread: 'q1', minute: 2 });
  assert.equal(await answered([msg({ id: 'q1', minute: 1 }), otherDispatch]), false);
});

test('iss-00098 T-02: 最新に返事があっても、返事も自動の知らせもない古い質問があれば偽。本人あての自動の知らせがあれば真', async () => {
  assert.equal(
    await answered([msg({ id: 'q1', minute: 1 }), msg({ id: 'q2', minute: 3 }), reply('a2', 'q2', 4)]),
    false,
  );
  assert.equal(
    await answered([
      msg({ id: 'q1', minute: 1 }),
      reply('n1', 'q1', 2, NOTICES[2]),
      msg({ id: 'q2', minute: 3 }),
      reply('a2', 'q2', 4),
    ]),
    true,
  );
  const toRun = msg({ id: 'n1', from: 'run:r1', to: 'run:r1', thread: 'q1', minute: 2, body: NOTICES[0] });
  assert.equal(
    await answered([msg({ id: 'q1', minute: 1 }), toRun, msg({ id: 'q2', minute: 3 }), reply('a2', 'q2', 4)]),
    false,
    '本人あてでない知らせは古い質問を片付けない',
  );
});

test('iss-00098 T-02: D の質問がなければ記録なし。ほかの種類の発言は質問に数えない', async () => {
  const done = msg({ id: 'w1', type: 'worker_done', minute: 1 });
  const r = await reader({ messages: [done], count: 1 }).readThreads('r1');
  assert.ok(r.ok);
  assert.equal(r.data.questions.size, 0);
});

test('iss-00098 T-02: 形が違う・読めなければ ok 偽', async () => {
  for (const result of [{}, { messages: 'x' }, { messages: [{ id: 'm' }] }, { messages: [null] }, null]) {
    const r = await reader(result).readThreads('r1');
    assert.equal(r.ok, false, JSON.stringify(result));
  }
  assert.equal((await reader(null, false).readThreads('r1')).ok, false);
});

test('iss-00098 T-07: Orca の4つの自動の知らせの文は auto。少し違う文と普通の答えは auto でない', () => {
  for (const body of NOTICES) assert.equal(isAutoNotice(body), true, body);
  for (const body of [
    '仮の答えです',
    'Your question was removed before your coordinator read it.',
    'No one coordinates Run run abc now, so no one will read your question. Decide it yourself and say what you chose when you report.',
    `${NOTICES[0]} 追記`,
    'Your question msg_123 there will not be answered. Decide without it, or ask again.',
    'Note: Your question msg_1 2 there will not be answered. Decide without it, or ask again.',
  ]) {
    assert.equal(isAutoNotice(body), false, body);
  }
});

test('iss-00098 T-07: 本文が文字列でない返事は数えず、自動の知らせだけのスレッドは answered 偽', async () => {
  for (const body of [null, 42, { text: 'x' }]) {
    assert.equal(await answered([msg({ id: 'q1', minute: 1 }), reply('a1', 'q1', 2, body)]), false, String(body));
  }
  for (const body of NOTICES) {
    assert.equal(await answered([msg({ id: 'q1', minute: 1 }), reply('n1', 'q1', 2, body)]), false, body);
  }
});
