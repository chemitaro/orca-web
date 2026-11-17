import assert from 'node:assert/strict';
import { test } from 'node:test';
import { READ_METHODS, type RpcCallOptions, type RpcOutcome, type RpcTransport } from '../../src/orca/rpc.ts';
import { SendRpc } from '../../src/orca/send-gates.ts';

const operationId = '1760000000000-0123456789abcdef0123456789abcdef';
const terminal = () => ({
  terminal: 'term_test',
  text: 'hello',
  enter: true,
  agentPrompt: true,
  client: { id: 'orca-web', type: 'desktop' },
  waitSubmitMs: 10000,
});
const options = { timeoutMs: 25000, envelope: { orchestrationRequestId: operationId } };
function setup() {
  const calls: { method: string; params: unknown; options: RpcCallOptions | undefined }[] = [];
  const transport: RpcTransport = {
    async call<T>(method: string, params: unknown, options?: RpcCallOptions): Promise<RpcOutcome<T>> {
      calls.push({ method, params, options });
      return { ok: true, result: null as T, runtimeId: 'rt-test' };
    },
  };
  return { rpc: new SendRpc(transport), calls };
}

test('端末へは操作の ID を持つ、決めた形の送信だけを通す', async () => {
  const { rpc, calls } = setup();
  const params = terminal();
  assert.ok((await rpc.call('terminal.send', params, options)).ok);
  assert.deepEqual(calls, [{ method: 'terminal.send', params, options }]);
});

const chat = () => ({
  envelope: {
    sessionId: 'session-test',
    clientOperationId: operationId,
    expectedRuntimeFence: 1,
    payloadFingerprint: 'a'.repeat(64),
  },
  body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'hello' }] },
});

test('構造化 Chat へは操作の ID を持つ封筒と1つの user text block を通す', async () => {
  const { rpc, calls } = setup();
  const params = chat();
  assert.ok((await rpc.call('agentSession.send', params)).ok);
  assert.deepEqual(calls, [{ method: 'agentSession.send', params, options: undefined }]);
});

test('端末の危険な引数、鍵の欠落、操作の ID なしは送らずに拒む', async () => {
  const { rpc, calls } = setup();
  const invalid: unknown[] = [
    null,
    [],
    {},
    ...['interrupt', 'requireAgentStatus', 'inputSequence'].map((key) => ({ ...terminal(), [key]: true })),
  ];
  for (const key of Object.keys(terminal())) {
    const p: Record<string, unknown> = terminal();
    delete p[key];
    invalid.push(p);
  }
  for (const patch of [
    { terminal: 'other' },
    { terminal: '' },
    { text: '' },
    { text: 1 },
    { enter: false },
    { agentPrompt: false },
    { client: { id: 'orca-web', type: 'mobile' } },
    { client: { id: 'other', type: 'desktop' } },
    { client: { id: 'orca-web', type: 'desktop', extra: true } },
    ...[-1, 60001, 0.5, '1', null].map((waitSubmitMs) => ({ waitSubmitMs })),
  ])
    invalid.push({ ...terminal(), ...patch });
  for (const params of invalid) await assert.rejects(rpc.call('terminal.send', params, options));
  for (const id of ['', 'abc', '1760000000000-A'.padEnd(46, 'A')]) {
    await assert.rejects(rpc.call('terminal.send', terminal(), { envelope: { orchestrationRequestId: id } }));
  }
  await assert.rejects(rpc.call('terminal.send', terminal()));
  assert.equal(calls.length, 0);
  for (const waitSubmitMs of [0, 60000])
    assert.ok((await rpc.call('terminal.send', { ...terminal(), waitSubmitMs }, options)).ok);
});

test('Chat の追加の操作、複数や画像の block、不正な封筒は送らずに拒む', async () => {
  const { rpc, calls } = setup();
  const invalid: unknown[] = [
    null,
    {},
    ...['delivery', 'options', 'selection', 'retryUnknown', 'skills'].map((key) => ({ ...chat(), [key]: {} })),
  ];
  for (const key of ['sessionId', 'clientOperationId', 'expectedRuntimeFence', 'payloadFingerprint']) {
    const envelope: Record<string, unknown> = chat().envelope;
    delete envelope[key];
    invalid.push({ ...chat(), envelope });
  }
  for (const patch of [
    { sessionId: '' },
    { clientOperationId: 'bad' },
    { expectedRuntimeFence: 0 },
    { payloadFingerprint: 'bad' },
    { extra: true },
  ]) {
    invalid.push({ ...chat(), envelope: { ...chat().envelope, ...patch } });
  }
  for (const patch of [
    { kind: 'stop' },
    { role: 'assistant' },
    { skills: [] },
    { blocks: [] },
    { blocks: [{ type: 'image', data: 'x' }] },
    {
      blocks: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ],
    },
    { blocks: [{ type: 'text', text: 'a', extra: true }] },
  ])
    invalid.push({ ...chat(), body: { ...chat().body, ...patch } });
  for (const params of invalid) await assert.rejects(rpc.call('agentSession.send', params));
  assert.equal(calls.length, 0);
});

test('読む許可は SendRpc の中だけで広げ、未許可の RPC を送らない', async () => {
  const { rpc, calls } = setup();
  assert.deepEqual(READ_METHODS, [
    'session.tabs.list',
    'session.tabs.listAll',
    'nativeChat.readSession',
    'agentSession.history',
  ]);
  for (const method of [
    ...READ_METHODS,
    'terminal.agentStatus',
    'terminal.inspectProcess',
    'orchestration.requestShow',
    'agentSession.sendRecorded',
  ]) {
    assert.ok((await rpc.call(method, null)).ok);
  }
  const count = calls.length;
  for (const method of ['terminal.interrupt', 'agentSession.stop', 'session.tabs.activate', 'unknown']) {
    await assert.rejects(rpc.call(method, {}));
  }
  assert.equal(calls.length, count);
});

const answer = () => ({
  envelope: {
    sessionId: 'session-test',
    clientOperationId: operationId,
    expectedRuntimeFence: 2,
    payloadFingerprint: 'b'.repeat(64),
  },
  itemId: 'item-test',
  expectedRevision: 3,
  answers: [
    { questionId: 'q1', optionIds: ['a'] },
    { questionId: 'q2', optionIds: [], other: '仮の文' },
  ],
});

test('T-04 構造化 Chat の質問へは、決めた形の agentSession.respondToQuestion だけを通す', async () => {
  const { rpc, calls } = setup();
  const params = answer();
  assert.ok((await rpc.call('agentSession.respondToQuestion', params, { timeoutMs: 15000 })).ok);
  const many = {
    ...answer(),
    answers: [{ questionId: 'q', optionIds: Array.from({ length: 64 }, (_, i) => `o${i}`) }],
  };
  assert.ok((await rpc.call('agentSession.respondToQuestion', many)).ok);
  const four = { ...answer(), answers: [1, 2, 3, 4].map((i) => ({ questionId: `q${i}`, optionIds: ['a'] })) };
  assert.ok((await rpc.call('agentSession.respondToQuestion', four)).ok);
  const big = { ...answer(), answers: [{ questionId: 'q', optionIds: [], other: 'a'.repeat(64 * 1024) }] };
  assert.ok((await rpc.call('agentSession.respondToQuestion', big)).ok);
  assert.deepEqual(calls[0], { method: 'agentSession.respondToQuestion', params, options: { timeoutMs: 15000 } });
  assert.equal(calls.length, 4);
});

test('T-04 余分な鍵・optionId・空や5件以上の answers・65件以上の optionIds・64KiB を超える other・形の違う封筒を送らずに拒む', async () => {
  const { rpc, calls } = setup();
  const invalid: unknown[] = [null, {}, [], { ...answer(), optionId: 'a' }, { ...answer(), extra: true }];
  for (const key of ['envelope', 'itemId', 'expectedRevision', 'answers']) {
    const p: Record<string, unknown> = answer();
    delete p[key];
    invalid.push(p);
  }
  // 古い詰めた形（answers の代わりの optionId）
  const { answers: _answers, ...legacy } = answer();
  invalid.push({ ...legacy, optionId: 'a' });
  for (const patch of [
    { itemId: '' },
    { itemId: 3 },
    { expectedRevision: 0 },
    { expectedRevision: 1.5 },
    { expectedRevision: '3' },
    { answers: [] },
    { answers: 'x' },
    { answers: [1, 2, 3, 4, 5].map((i) => ({ questionId: `q${i}`, optionIds: ['a'] })) },
    { answers: [{ questionId: 'q', optionIds: Array.from({ length: 65 }, (_, i) => `o${i}`) }] },
    { answers: [{ questionId: 'q', optionIds: [], other: 'a'.repeat(64 * 1024 + 1) }] },
    { answers: [{ questionId: 'q', optionIds: [], other: 'あ'.repeat(21846) }] },
    { answers: [{ questionId: 'q', optionIds: [], other: 1 }] },
    { answers: [{ questionId: '', optionIds: ['a'] }] },
    { answers: [{ questionId: 'q'.repeat(1025), optionIds: ['a'] }] },
    { answers: [{ questionId: 'q', optionIds: [''] }] },
    { answers: [{ questionId: 'q', optionIds: [1] }] },
    { answers: [{ questionId: 'q', optionIds: 'a' }] },
    { answers: [{ questionId: 'q', optionIds: ['a'], optionId: 'a' }] },
    { answers: [{ questionId: 'q', optionIds: ['a'], extra: true }] },
    { answers: [null] },
  ])
    invalid.push({ ...answer(), ...patch });
  for (const patch of [
    { sessionId: '' },
    { clientOperationId: 'bad' },
    { expectedRuntimeFence: 0 },
    { payloadFingerprint: 'bad' },
    { extra: true },
  ]) {
    invalid.push({ ...answer(), envelope: { ...answer().envelope, ...patch } });
  }
  for (const params of invalid)
    await assert.rejects(rpc.call('agentSession.respondToQuestion', params), JSON.stringify(params)?.slice(0, 80));
  // 承認の答えと取り消しは通さない
  for (const method of ['agentSession.respondToApproval', 'agentSession.cancel']) {
    await assert.rejects(rpc.call(method, answer()));
  }
  assert.equal(calls.length, 0);
  // 今の terminal.send・agentSession.send の門は変わらない
  assert.ok((await rpc.call('terminal.send', terminal(), options)).ok);
  assert.ok((await rpc.call('agentSession.send', chat())).ok);
});

// ---- 承認の答え（iss-00050 D-03、T-04） ----

const approval = () => ({
  envelope: {
    sessionId: 'session-test',
    clientOperationId: operationId,
    expectedRuntimeFence: 2,
    payloadFingerprint: 'c'.repeat(64),
  },
  itemId: 'item-test',
  expectedRevision: 3,
  optionId: 'allow',
});

test('T-04 構造化 Chat の承認へは、決めた形の agentSession.respondToApproval だけを通す', async () => {
  const { rpc, calls } = setup();
  const params = approval();
  assert.ok((await rpc.call('agentSession.respondToApproval', params, { timeoutMs: 15000 })).ok);
  assert.ok((await rpc.call('agentSession.respondToApproval', { ...approval(), optionId: 'o'.repeat(1024) })).ok);
  assert.deepEqual(calls[0], { method: 'agentSession.respondToApproval', params, options: { timeoutMs: 15000 } });
  assert.equal(calls.length, 2);
});

test('T-04 承認の余分な鍵・answers・空や 1025 字以上の optionId・形の違う封筒・正でない revision を送らずに拒む', async () => {
  const { rpc, calls } = setup();
  const invalid: unknown[] = [null, {}, [], { ...approval(), extra: true }, { ...approval(), answers: [] }];
  for (const key of ['envelope', 'itemId', 'expectedRevision', 'optionId']) {
    const p: Record<string, unknown> = approval();
    delete p[key];
    invalid.push(p);
  }
  const { optionId: _optionId, ...withoutOption } = approval();
  invalid.push({ ...withoutOption, answers: [{ questionId: 'q', optionIds: ['a'] }] });
  for (const patch of [
    { itemId: '' },
    { itemId: 3 },
    { expectedRevision: 0 },
    { expectedRevision: -1 },
    { expectedRevision: 1.5 },
    { expectedRevision: '3' },
    { optionId: '' },
    { optionId: 'o'.repeat(1025) },
    { optionId: 1 },
    { optionId: ['allow'] },
  ])
    invalid.push({ ...approval(), ...patch });
  for (const patch of [
    { sessionId: '' },
    { clientOperationId: 'bad' },
    { expectedRuntimeFence: 0 },
    { payloadFingerprint: 'bad' },
    { extra: true },
  ]) {
    invalid.push({ ...approval(), envelope: { ...approval().envelope, ...patch } });
  }
  for (const params of invalid)
    await assert.rejects(rpc.call('agentSession.respondToApproval', params), JSON.stringify(params)?.slice(0, 80));
  // 承認の形を質問の口に送らない。取り消しは通さない
  await assert.rejects(rpc.call('agentSession.respondToQuestion', approval()));
  await assert.rejects(rpc.call('agentSession.cancel', approval()));
  assert.equal(calls.length, 0);
  // 今の terminal.send・agentSession.send・respondToQuestion の門は変わらない
  assert.ok((await rpc.call('terminal.send', terminal(), options)).ok);
  assert.ok((await rpc.call('agentSession.send', chat())).ok);
  assert.ok((await rpc.call('agentSession.respondToQuestion', answer())).ok);
});
