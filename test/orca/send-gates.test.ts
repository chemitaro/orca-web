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
