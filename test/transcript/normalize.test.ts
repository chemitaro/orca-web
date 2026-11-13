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
