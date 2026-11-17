import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TranscriptTarget } from '../../src/orca/read-transcript.ts';
import {
  buildDocument,
  decodeBefore,
  encodeBefore,
  MAX_QUESTION_CHARS,
  MAX_QUESTION_DESCRIPTION_CHARS,
  MAX_QUESTION_LABEL_CHARS,
  MAX_QUESTION_OTHER_CHARS,
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

// ---- 質問の部分（D-01、T-01〜T-03） ----

const option = (id: string, label: string, description?: string) => ({
  id,
  label,
  ...(description === undefined ? {} : { description }),
});
const pending = { state: 'pending', selectedOptionId: null, resolvedBy: null, resolvedAt: null };
const resolved = (extra: Record<string, unknown>) => ({
  state: 'resolved',
  resolvedBy: 'client-1',
  resolvedAt: 1,
  selectedOptionId: null,
  ...extra,
});
const questionItem = (body: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  itemId: 'q-item',
  revision: 3,
  sequence: 1,
  observedAt: 0,
  ...extra,
  body: { kind: 'question', ...body },
});
const firstPart = (items: unknown[]) => normalizeJournalItems(items)?.[0]?.parts[0];

test('T-01 構造化 Chat：1問の question（freeTextQuestionId なし）は id q1・単一選択の部分になり、prompt に itemId と revision が入る', () => {
  const part = firstPart([
    questionItem({
      question: '仮の問いです',
      options: [option('a', 'はい', '仮の説明'), option('b', 'いいえ')],
      resolution: pending,
    }),
  ]);
  assert.deepEqual(part, {
    type: 'question',
    source: 'chat',
    prompt: { itemId: 'q-item', revision: 3 },
    callId: null,
    questions: [
      {
        id: 'q1',
        header: null,
        question: '仮の問いです',
        multiSelect: false,
        options: [
          { id: 'a', label: 'はい', description: '仮の説明' },
          { id: 'b', label: 'いいえ', description: null },
        ],
        allowOther: false,
        otherAllowsEmpty: false,
      },
    ],
    state: 'pending',
    answers: null,
  });
  assert.equal(
    normalizeJournalItems([questionItem({ question: 'x', options: [], resolution: pending })])?.[0]?.role,
    'assistant',
  );
});

test('T-01 構造化 Chat：1問で freeTextQuestionId があれば、その id と allowOther、allowEmpty で otherAllowsEmpty', () => {
  const part = firstPart([
    questionItem({
      question: '仮の問い',
      options: [option('a', 'A')],
      freeTextQuestionId: 'free-1',
      freeTextInput: { allowEmpty: true, placeholder: '仮' },
      resolution: pending,
    }),
  ]);
  assert.equal(part?.type, 'question');
  if (part?.type !== 'question') return;
  assert.deepEqual(part.questions[0], {
    id: 'free-1',
    header: null,
    question: '仮の問い',
    multiSelect: false,
    options: [{ id: 'a', label: 'A', description: null }],
    allowOther: true,
    otherAllowsEmpty: true,
  });
});

test('T-01 構造化 Chat：questions の複数問と複数選択と見出しを、そのままの順で返す', () => {
  const part = firstPart([
    questionItem({
      question: '外の問い',
      options: [],
      questions: [
        { id: 'q-a', question: '一つ目', header: '見出し', multiSelect: false, options: [option('o1', '甲')] },
        {
          id: 'q-b',
          question: '二つ目',
          multiSelect: true,
          options: [option('o2', '乙'), option('o3', '丙')],
          freeTextQuestionId: 'q-b',
        },
      ],
      resolution: pending,
    }),
  ]);
  assert.equal(part?.type, 'question');
  if (part?.type !== 'question') return;
  assert.deepEqual(
    part.questions.map((q) => [q.id, q.header, q.question, q.multiSelect, q.options.length, q.allowOther]),
    [
      ['q-a', '見出し', '一つ目', false, 1, false],
      ['q-b', null, '二つ目', true, 2, true],
    ],
  );
});

test('T-01 構造化 Chat：answers のある答え済みは answered と answers（other は null か文字）', () => {
  const part = firstPart([
    questionItem({
      question: '外',
      options: [],
      questions: [
        { id: 'q-a', question: '一', multiSelect: true, options: [option('o1', '甲'), option('o2', '乙')] },
        { id: 'q-b', question: '二', multiSelect: false, options: [], freeTextQuestionId: 'q-b' },
      ],
      resolution: resolved({
        answers: [
          { questionId: 'q-a', optionIds: ['o1', 'o2'] },
          { questionId: 'q-b', optionIds: [], other: '仮の自由な答え' },
        ],
      }),
    }),
  ]);
  assert.equal(part?.type, 'question');
  if (part?.type !== 'question') return;
  assert.equal(part.state, 'answered');
  assert.deepEqual(part.answers, [
    { questionId: 'q-a', optionIds: ['o1', 'o2'], other: null },
    { questionId: 'q-b', optionIds: [], other: '仮の自由な答え' },
  ]);
});

test('T-01 構造化 Chat：answers のない古い形は selectedOptionId を Orca の規則で解く（選択肢の id、question-group: の JSON、<id>:<文>）', () => {
  const single = (selectedOptionId: string, extra: Record<string, unknown> = {}) =>
    firstPart([
      questionItem({
        question: '仮',
        options: [option('a', 'A')],
        ...extra,
        resolution: resolved({ selectedOptionId }),
      }),
    ]);
  const answersOf = (p: unknown) => (p as { answers: unknown }).answers;
  assert.deepEqual(answersOf(single('a')), [{ questionId: 'q1', optionIds: ['a'], other: null }]);
  assert.deepEqual(answersOf(single(`free-1:${encodeURIComponent('仮の文 a:b')}`, { freeTextQuestionId: 'free-1' })), [
    { questionId: 'free-1', optionIds: [], other: '仮の文 a:b' },
  ]);
  // 解けない（freeTextQuestionId のない自由入力、知らない id）は null
  assert.equal(answersOf(single('free-1:x')), null);
  assert.equal(answersOf(single('zzz')), null);
  const grouped = [
    { questionId: 'q-a', optionIds: ['o1'] },
    { questionId: 'q-b', optionIds: [], other: '50%' },
  ];
  const group = firstPart([
    questionItem({
      question: '外',
      options: [],
      questions: [
        { id: 'q-a', question: '一', multiSelect: false, options: [option('o1', '甲')] },
        { id: 'q-b', question: '二', multiSelect: false, options: [], freeTextQuestionId: 'q-b' },
      ],
      resolution: resolved({
        selectedOptionId: `question-group:${JSON.stringify(grouped).replaceAll('%', '%25')}`,
      }),
    }),
  ]);
  assert.deepEqual(answersOf(group), [
    { questionId: 'q-a', optionIds: ['o1'], other: null },
    { questionId: 'q-b', optionIds: [], other: '50%' },
  ]);
});

test('T-01 構造化 Chat：取り消しは cancelled で answers は null', () => {
  const part = firstPart([
    questionItem({
      question: '仮',
      options: [option('a', 'A')],
      resolution: { state: 'cancelled', selectedOptionId: null, resolvedBy: null, resolvedAt: 2 },
    }),
  ]);
  assert.equal(part?.type, 'question');
  if (part?.type !== 'question') return;
  assert.equal(part.state, 'cancelled');
  assert.equal(part.answers, null);
});

test('構造化 Chat の question も上限で切り、truncated を付け、shortened も truncated にする', () => {
  const part = firstPart([
    questionItem({
      question: 'q'.repeat(MAX_QUESTION_CHARS + 1),
      options: [option('a', 'l'.repeat(MAX_QUESTION_LABEL_CHARS + 1), 'd'.repeat(MAX_QUESTION_DESCRIPTION_CHARS + 1))],
      freeTextQuestionId: 'f',
      resolution: resolved({
        answers: [{ questionId: 'f', optionIds: [], other: 'o'.repeat(MAX_QUESTION_OTHER_CHARS + 1) }],
      }),
    }),
  ]);
  assert.equal(part?.type, 'question');
  if (part?.type !== 'question') return;
  assert.equal(part.truncated, true);
  assert.equal(part.questions[0]?.question.length, MAX_QUESTION_CHARS);
  assert.equal(part.questions[0]?.options[0]?.label.length, MAX_QUESTION_LABEL_CHARS);
  assert.equal(part.questions[0]?.options[0]?.description?.length, MAX_QUESTION_DESCRIPTION_CHARS);
  assert.equal(part.answers?.[0]?.other?.length, MAX_QUESTION_OTHER_CHARS);
  const short = firstPart([
    questionItem({ question: '仮', options: [option('a', 'A')], resolution: pending }, { shortened: true }),
  ]);
  assert.equal((short as { truncated?: true }).truncated, true);
  const plain = firstPart([questionItem({ question: '仮', options: [option('a', 'A')], resolution: pending })]);
  assert.equal('truncated' in (plain as object), false);
});

const nativeCall = (name: string, input: unknown, extra: Record<string, unknown> = {}) => [
  {
    id: 'n1',
    role: 'assistant',
    timestamp: 0,
    blocks: [{ type: 'tool-call', name, input, callId: 'call-q', ...extra }],
  },
];
const nativePart = (name: string, input: unknown, extra: Record<string, unknown> = {}) =>
  normalizeNativeMessages(nativeCall(name, input, extra))?.[0]?.parts[0];

test('T-02 端末：AskUserQuestion の入力（物）が question の部分になり、id は番号の文字、state は pending', () => {
  const part = nativePart('AskUserQuestion', {
    questions: [
      {
        question: '仮の問い',
        header: '見出し',
        multiSelect: true,
        options: [{ label: '甲', description: '仮の説明' }, { label: '乙' }],
      },
      { question: '二つ目', options: ['丙', '丁'] },
    ],
  });
  assert.deepEqual(part, {
    type: 'question',
    source: 'terminal',
    prompt: null,
    callId: 'call-q',
    questions: [
      {
        id: '0',
        header: '見出し',
        question: '仮の問い',
        multiSelect: true,
        options: [
          { id: '0', label: '甲', description: '仮の説明' },
          { id: '1', label: '乙', description: null },
        ],
        allowOther: false,
        otherAllowsEmpty: false,
      },
      {
        id: '1',
        header: null,
        question: '二つ目',
        multiSelect: false,
        options: [
          { id: '0', label: '丙', description: null },
          { id: '1', label: '丁', description: null },
        ],
        allowOther: false,
        otherAllowsEmpty: false,
      },
    ],
    state: 'pending',
    answers: null,
  });
});

test('T-02 端末：JSON の文字の入力、request_user_input、title と multiple の別名も読む', () => {
  const json = nativePart(
    'request_user_input',
    JSON.stringify({ questions: [{ title: '仮のタイトル', multiple: true, options: ['a'] }] }),
  );
  assert.equal(json?.type, 'question');
  if (json?.type !== 'question') return;
  assert.equal(json.questions[0]?.question, '仮のタイトル');
  assert.equal(json.questions[0]?.multiSelect, true);
  for (const name of ['ask_user_question', 'askUserQuestion', 'requestUserInput']) {
    assert.equal(nativePart(name, { questions: [{ question: 'x', options: ['a'] }] })?.type, 'question', name);
  }
});

test('T-02 端末：読めない入力・failed の呼び出し・request_user_input_async・ほかの名前はツールの呼び出しのまま', () => {
  const ok = { questions: [{ question: 'x', options: ['a'] }] };
  for (const [name, input, extra] of [
    ['AskUserQuestion', { questions: [] }, {}],
    ['AskUserQuestion', { questions: [{}, 'x'] }, {}],
    ['AskUserQuestion', '{not json', {}],
    ['AskUserQuestion', { other: 1 }, {}],
    ['AskUserQuestion', ok, { state: 'failed' }],
    ['request_user_input_async', { questions: [{ title: 'x', options: ['a'] }] }, {}],
    ['Bash', ok, {}],
  ] as const) {
    assert.equal(nativePart(name, input, extra)?.type, 'tool-call', `${name} ${JSON.stringify(extra)}`);
  }
  // 構造化 Chat の tool-call の件は質問の部分にしない（質問は journal の question で来る）
  const journal = normalizeJournalItems([
    { itemId: 't', sequence: 1, body: { kind: 'tool-call', name: 'AskUserQuestion', input: ok, callId: 'c' } },
  ]);
  assert.equal(journal?.[0]?.parts[0]?.type, 'tool-call');
});

test('T-02 端末：上限を超える文字は切られ truncated が付く', () => {
  const part = nativePart('AskUserQuestion', {
    questions: [
      {
        question: 'q'.repeat(MAX_QUESTION_CHARS + 3),
        header: 'h'.repeat(MAX_QUESTION_LABEL_CHARS + 1),
        options: [
          {
            label: 'l'.repeat(MAX_QUESTION_LABEL_CHARS + 1),
            description: 'd'.repeat(MAX_QUESTION_DESCRIPTION_CHARS + 1),
          },
        ],
      },
    ],
  });
  assert.equal(part?.type, 'question');
  if (part?.type !== 'question') return;
  assert.equal(part.truncated, true);
  const q = part.questions[0];
  assert.equal(q?.question.length, MAX_QUESTION_CHARS);
  assert.equal(q?.header?.length, MAX_QUESTION_LABEL_CHARS);
  assert.equal(q?.options[0]?.label.length, MAX_QUESTION_LABEL_CHARS);
  assert.equal(q?.options[0]?.description?.length, MAX_QUESTION_DESCRIPTION_CHARS);
});

test('T-03 知らない形の question は unsupported（question）、approval は今のまま unsupported（approval）', () => {
  const base = { question: '仮', options: [option('a', 'A')], resolution: pending };
  const cases: [string, unknown][] = [
    ['questions が配列でない', questionItem({ ...base, questions: { id: 'x' } })],
    ['選択肢に id がない', questionItem({ ...base, options: [{ label: 'A' }] })],
    [
      '問いの選択肢に id がない',
      questionItem({ ...base, questions: [{ id: 'q', question: 'x', multiSelect: false, options: [{ label: 'A' }] }] }),
    ],
    ['問いに id がない', questionItem({ ...base, questions: [{ question: 'x', multiSelect: false, options: [] }] })],
    ['questions が空', questionItem({ ...base, questions: [] })],
    ['resolution の state が知らない値', questionItem({ ...base, resolution: { ...pending, state: 'expired' } })],
    ['resolution がない', questionItem({ question: '仮', options: [] })],
    ['answers の形が違う', questionItem({ ...base, resolution: resolved({ answers: [{ questionId: 1 }] }) })],
    ['revision が正の整数でない', questionItem(base, { revision: 0 })],
    ['revision が小数', questionItem(base, { revision: 1.5 })],
    ['revision がない', questionItem(base, { revision: undefined })],
    ['question が文字でない', questionItem({ ...base, question: 3 })],
  ];
  for (const [name, item] of cases) {
    assert.deepEqual(firstPart([item]), { type: 'unsupported', what: 'question' }, name);
  }
  assert.deepEqual(
    firstPart([
      { itemId: 'ap', sequence: 1, body: { kind: 'approval', title: '仮', options: [], resolution: pending } },
    ]),
    {
      type: 'unsupported',
      what: 'approval',
    },
  );
});
