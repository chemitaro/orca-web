import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TranscriptTarget } from '../../src/orca/read-transcript.ts';
import {
  buildDocument,
  decodeBefore,
  encodeBefore,
  MAX_TEXT_CHARS,
  MAX_TOOL_INPUT_CHARS,
  MAX_TOOL_OUTPUT_CHARS,
  normalizeJournalItems,
  normalizeNativeMessages,
  TRANSCRIPT_SCHEMA,
} from '../../src/transcript/normalize.ts';
import { journalItems, nativeMessages, SESSION_CLAUDE, TRANSCRIPT_PATH } from './fixture.ts';

test('端末の会話：本文、ツールの呼び出しと結果、表示できない印、system の知らせを返し、思考を印も付けずに落とし、並べ替えない', () => {
  const messages = normalizeNativeMessages(nativeMessages());
  assert.deepEqual(messages, [
    { id: 'm1', role: 'user', at: '2026-11-13T00:00:01.000Z', parts: [{ type: 'text', text: '仮の指示です' }] },
    {
      id: 'm2',
      role: 'assistant',
      at: '2026-11-13T00:00:03.000Z',
      parts: [
        { type: 'text', text: '<script>alert(1)</script> と <img src=x onerror=alert(2)>' },
        { type: 'tool-call', name: 'Bash', input: '{\n  "command": "ls"\n}', callId: 'call-1' },
      ],
    },
    {
      id: 'm3',
      role: 'tool',
      at: '2026-11-13T00:00:04.000Z',
      parts: [{ type: 'tool-result', output: 'a.txt', isError: false, callId: 'call-1' }],
    },
    {
      id: 'm4',
      role: 'user',
      at: null,
      parts: [
        { type: 'unsupported', what: 'image' },
        { type: 'unsupported', what: 'unknown' },
      ],
    },
    {
      id: 'm5',
      role: 'system',
      at: '2026-11-13T00:00:06.000Z',
      parts: [{ type: 'text', text: 'Conversation interrupted' }],
    },
  ]);
});

test('端末の会話：Orca が返す順のまま（時刻や transcriptOrder で並べ替えない）', () => {
  const rows = nativeMessages().reverse();
  assert.deepEqual(
    normalizeNativeMessages(rows)?.map((m) => m.id),
    ['m5', 'm4', 'm3', 'm2', 'm1'],
  );
});

test('長い本文、ツールの入力と出力を切り、Orca の shortened も truncated にする', () => {
  const messages = normalizeNativeMessages([
    { id: 'a', role: 'assistant', blocks: [{ type: 'text', text: 'x'.repeat(MAX_TEXT_CHARS + 5) }], timestamp: 0 },
    {
      id: 'b',
      role: 'assistant',
      blocks: [{ type: 'tool-call', name: 'Write', input: 'y'.repeat(MAX_TOOL_INPUT_CHARS + 1) }],
      timestamp: 0,
    },
    {
      id: 'c',
      role: 'tool',
      blocks: [{ type: 'tool-result', output: 'z'.repeat(MAX_TOOL_OUTPUT_CHARS + 1), isError: true }],
      timestamp: 0,
    },
    { id: 'd', role: 'user', shortened: true, blocks: [{ type: 'text', text: 'short' }], timestamp: 0 },
  ]);
  assert.ok(messages);
  const [a, b, c, d] = messages;
  assert.deepEqual(a?.parts[0], { type: 'text', text: 'x'.repeat(MAX_TEXT_CHARS), truncated: true });
  assert.deepEqual(b?.parts[0], {
    type: 'tool-call',
    name: 'Write',
    input: 'y'.repeat(MAX_TOOL_INPUT_CHARS),
    callId: null,
    truncated: true,
  });
  assert.deepEqual(c?.parts[0], {
    type: 'tool-result',
    output: 'z'.repeat(MAX_TOOL_OUTPUT_CHARS),
    isError: true,
    callId: null,
    truncated: true,
  });
  assert.deepEqual(d?.parts[0], { type: 'text', text: 'short', truncated: true });
});

test('知らない role は assistant の表示できない印にし、知らない形の件は全体を読めない（null）にする', () => {
  assert.deepEqual(
    normalizeNativeMessages([{ id: 'x', role: 'narrator', blocks: [{ type: 'text', text: 'hi' }], timestamp: 0 }]),
    [{ id: 'x', role: 'assistant', at: '1970-01-01T00:00:00.000Z', parts: [{ type: 'unsupported', what: 'unknown' }] }],
  );
  assert.equal(normalizeNativeMessages([{ role: 'user', blocks: [] }]), null);
  assert.equal(normalizeNativeMessages(['nope']), null);
});

test('構造化 Chat：journal の位置の順に並べ、思考と turn と agent-start を落とし、diff と知らない kind を印にする', () => {
  const messages = normalizeJournalItems(journalItems());
  assert.deepEqual(messages, [
    { id: 'j1', role: 'user', at: '2026-11-13T00:00:01.000Z', parts: [{ type: 'text', text: '仮の質問' }] },
    { id: 'j2b', role: 'assistant', at: '2026-11-13T00:00:02.000Z', parts: [{ type: 'text', text: '仮の答え' }] },
    {
      id: 'j3',
      role: 'tool',
      at: '2026-11-13T00:00:03.000Z',
      parts: [
        { type: 'tool-call', name: 'Read', input: '{\n  "path": "a"\n}', callId: 'c1' },
        { type: 'tool-result', output: 'ok', isError: false, callId: 'c1', truncated: true },
      ],
    },
    { id: 'j4', role: 'assistant', at: '2026-11-13T00:00:04.000Z', parts: [{ type: 'unsupported', what: 'diff' }] },
    { id: 'j6', role: 'assistant', at: '2026-11-13T00:00:06.000Z', parts: [{ type: 'unsupported', what: 'unknown' }] },
  ]);
});

test('構造化 Chat の plan は本文を出さず、決めた名前 plan の印にする', () => {
  assert.deepEqual(
    normalizeJournalItems([{ itemId: 'plan-1', sequence: 1, body: { kind: 'plan', text: '仮の計画' } }]),
    [{ id: 'plan-1', role: 'assistant', at: null, parts: [{ type: 'unsupported', what: 'plan' }] }],
  );
});

test('未対応の種類は許した名前だけになり、元の文字や payload を返さない', () => {
  const blocks = ['image-ref', 'subagent-group', 'subagent', 'background-task', '<private-kind>'].map((type) => ({
    type,
    text: '仮の非表示 payload',
  }));
  assert.deepEqual(normalizeNativeMessages([{ id: 'n', role: 'user', blocks }])?.[0]?.parts, [
    { type: 'unsupported', what: 'image' },
    { type: 'unsupported', what: 'subagent' },
    { type: 'unsupported', what: 'subagent' },
    { type: 'unsupported', what: 'background-task' },
    { type: 'unsupported', what: 'unknown' },
  ]);
  const kinds = ['diff', 'approval', 'question', 'status', 'plan', '<private-kind>'];
  assert.deepEqual(
    normalizeJournalItems(
      kinds.map((kind, sequence) => ({
        itemId: `j${sequence}`,
        sequence,
        body: { kind, text: '仮の非表示 payload' },
      })),
    )?.map((m) => m.parts[0]),
    [
      { type: 'unsupported', what: 'diff' },
      { type: 'unsupported', what: 'approval' },
      { type: 'unsupported', what: 'question' },
      { type: 'unsupported', what: 'status' },
      { type: 'unsupported', what: 'plan' },
      { type: 'unsupported', what: 'unknown' },
    ],
  );
});

test('構造化 Chat は sequenceIndex も使い、空の部品と制御の件を落とす', () => {
  const item = (id: string, sequenceIndex: number, text: string) => ({
    itemId: id,
    sequence: 2,
    sequenceIndex,
    body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text }] },
  });
  assert.deepEqual(
    normalizeJournalItems([
      item('b', 1, '後'),
      item('a', 0, '先'),
      { itemId: 'empty', sequence: 3, body: { kind: 'message', role: 'user', blocks: [] } },
      { itemId: 'handoff', sequence: 4, body: { kind: 'agent-handoff' } },
    ])?.map((m) => m.id),
    ['a', 'b'],
  );
  assert.deepEqual(normalizeNativeMessages([{ id: 'empty', role: 'user', blocks: [] }]), []);
});

test('構造化 Chat の本文と入出力も長さを制限し、bounded output の truncated と失敗を引き継ぐ', () => {
  const messages = normalizeJournalItems([
    {
      itemId: 'm',
      sequence: 1,
      body: {
        kind: 'message',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'x'.repeat(100_001) }],
      },
    },
    {
      itemId: 't',
      sequence: 2,
      body: {
        kind: 'tool-call',
        name: 'Read',
        input: 'y'.repeat(4_001),
        callId: 'call',
        state: 'failed',
        output: { head: 'z'.repeat(8_001), truncated: false },
      },
    },
    {
      itemId: 'short',
      sequence: 3,
      body: {
        kind: 'tool-call',
        name: 'Read',
        input: {},
        callId: 'short',
        output: { head: 'ok', truncated: true },
      },
    },
  ]);
  assert.deepEqual(messages?.[0]?.parts, [{ type: 'text', text: 'x'.repeat(100_000), truncated: true }]);
  assert.deepEqual(messages?.[1]?.parts, [
    { type: 'tool-call', name: 'Read', input: 'y'.repeat(4_000), callId: 'call', truncated: true },
    { type: 'tool-result', output: 'z'.repeat(8_000), isError: true, callId: 'call', truncated: true },
  ]);
  assert.deepEqual(messages?.[2]?.parts[1], {
    type: 'tool-result',
    output: 'ok',
    isError: false,
    callId: 'short',
    truncated: true,
  });
});

const target: TranscriptTarget = {
  agentId: 'tab-1:leaf-1',
  source: 'nativeChat',
  agentType: 'claude',
  sessionId: SESSION_CLAUDE,
  transcriptPath: TRANSCRIPT_PATH,
  key: '0123456789abcdef',
};

test('文書は記録のパスとセッションの識別子の全体を持たず、before はセッションの鍵を含む不透明な位置', () => {
  const doc = buildDocument(
    target,
    { source: 'nativeChat', rows: [], hasMore: true, before: { offset: 1200 } },
    [],
    new Date('2026-11-13T00:00:00Z'),
  );
  assert.equal(doc.schema, TRANSCRIPT_SCHEMA);
  assert.deepEqual(doc.session, { key: '0123456789abcdef', short: 'aaaaaaaa', source: 'nativeChat' });
  assert.deepEqual(doc.agent, { id: 'tab-1:leaf-1', agentType: 'claude' });
  const text = JSON.stringify(doc);
  assert.ok(!text.includes(TRANSCRIPT_PATH));
  assert.ok(!text.includes(SESSION_CLAUDE));
  assert.ok(doc.before);
  assert.deepEqual(decodeBefore(doc.before), { key: '0123456789abcdef', position: { offset: 1200 } });
});

test('位置の符号は形の違うものを拒む', () => {
  const cursor = encodeBefore('0123456789abcdef', { cursor: { epoch: 'ep-1', sequence: 3 } });
  assert.deepEqual(decodeBefore(cursor), {
    key: '0123456789abcdef',
    position: { cursor: { epoch: 'ep-1', sequence: 3 } },
  });
  const bad = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  for (const token of [
    '',
    '***',
    'x'.repeat(2000),
    bad({ k: 'short', p: { offset: 1 } }),
    bad({ k: '0123456789abcdef', p: { offset: -1 } }),
    bad({ k: '0123456789abcdef', p: { offset: 1, extra: 2 } }),
    bad({ k: '0123456789abcdef', p: { cursor: { epoch: '', sequence: 1 } } }),
    bad([1, 2]),
  ]) {
    assert.equal(decodeBefore(token), null, token.slice(0, 20));
  }
});

test('知らない role の件と system の件の本文でない部分は、端末でも構造化 Chat でも印にする', () => {
  const blocks = [
    { type: 'text', text: 'x' },
    { type: 'tool-call', name: 'Bash', input: 'ls' },
  ];
  assert.deepEqual(normalizeNativeMessages([{ id: 's', role: 'system', blocks, timestamp: null }])?.[0]?.parts, [
    { type: 'text', text: 'x' },
    { type: 'unsupported', what: 'unknown' },
  ]);
  const journal = (role: string) => [
    { itemId: 'i', sequence: 1, observedAt: 0, body: { kind: 'message', role, blocks } },
  ];
  assert.deepEqual(normalizeJournalItems(journal('narrator'))?.[0], {
    id: 'i',
    role: 'assistant',
    at: '1970-01-01T00:00:00.000Z',
    parts: [
      { type: 'unsupported', what: 'unknown' },
      { type: 'unsupported', what: 'unknown' },
    ],
  });
  assert.deepEqual(normalizeJournalItems(journal('system'))?.[0]?.parts, [
    { type: 'text', text: 'x' },
    { type: 'unsupported', what: 'unknown' },
  ]);
});
