import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSendAdapter } from '../../src/orca/send.ts';
import { SendRpc } from '../../src/orca/send-gates.ts';
import { SendJournal } from '../../src/send/journal.ts';
import { SendService } from '../../src/send/service.ts';
import { type AppOptions, createAppServer } from '../../src/server/app.ts';
import { TokenStore } from '../../src/server/guard.ts';
import { SettingsStore } from '../../src/state/settings.ts';
import { state } from '../runs/fixture.ts';

const id = '1234567890123-0123456789abcdef0123456789abcdef';
async function withApp(
  options: AppOptions,
  run: (
    send: (
      path: string,
      method?: string,
      body?: string,
      headers?: Record<string, string>,
    ) => Promise<{ status: number; body: Record<string, unknown>; cors: unknown }>,
  ) => Promise<void>,
) {
  const tokens = new TokenStore();
  const token = tokens.issue().token;
  const server = createAppServer({ ...options, tokens });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const host = `127.0.0.1:${port}`;
  try {
    await run(
      (path, method = 'GET', body, headers = {}) =>
        new Promise((resolve, reject) => {
          const req = request(
            {
              hostname: '127.0.0.1',
              port,
              path,
              method,
              headers: {
                host,
                origin: `http://${host}`,
                'content-type': 'application/json',
                'x-orca-web-token': token,
                ...headers,
              },
            },
            (res) => {
              const chunks: Buffer[] = [];
              res.on('data', (chunk: Buffer) => chunks.push(chunk));
              res.on('end', () =>
                resolve({
                  status: res.statusCode ?? 0,
                  body: JSON.parse(Buffer.concat(chunks).toString()),
                  cors: res.headers['access-control-allow-origin'],
                }),
              );
            },
          );
          req.on('error', reject);
          req.end(body);
        }),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('送信の4つの道はサービスの結果をD-09の形にして返し、CORSを付けない', async () => {
  const calls: unknown[] = [];
  await withApp(
    {
      send: {
        async status(agent) {
          calls.push(agent);
          return {
            enabled: true,
            available: true,
            route: 'terminal',
            reason: null,
            target: 'a'.repeat(32),
            agentType: 'codex',
            answer: { available: false, reason: 'terminal_route' },
            answerKeys: { available: false, reason: 'terminal_route' },
            answerMessage: { available: false, reason: 'terminal_route' },
          };
        },
        async intent(value) {
          calls.push(value);
          return {
            ok: true,
            ticket: 'ticket',
            expiresAt: 123,
            operationId: id,
            preview: {
              repoName: null,
              worktreePath: null,
              branch: null,
              agentType: 'codex',
              title: null,
              state: null,
              route: 'terminal',
              sessionShortId: 'short',
            },
            text: value.text,
            digest: 'digest',
          };
        },
        async confirm(value) {
          calls.push(value);
          return { ok: true, operationId: id, outcome: 'unknown', detail: {}, recordWarning: 'after_record_failed' };
        },
        async check(operationId, options) {
          calls.push(options);
          return { ok: true, operationId, state: 'not_sent' };
        },
      },
    },
    async (send) => {
      assert.deepEqual((await send('/api/send/status?agent=agent')).body, {
        enabled: true,
        available: true,
        route: 'terminal',
        reason: null,
        target: 'a'.repeat(32),
        agentType: 'codex',
        answer: { available: false, reason: 'terminal_route' },
        answerKeys: { available: false, reason: 'terminal_route' },
        answerMessage: { available: false, reason: 'terminal_route' },
      });
      const intent = await send('/api/send/intent', 'POST', JSON.stringify({ agent: 'agent', text: 'test' }));
      assert.equal(intent.status, 200);
      assert.equal(intent.body.operationId, id);
      assert.equal(intent.body.ok, undefined);
      assert.equal(intent.cors, undefined);
      assert.deepEqual(
        (await send('/api/send/confirm', 'POST', JSON.stringify({ ticket: 'ticket', text: 'test' }))).body,
        { operationId: id, outcome: 'unknown', detail: {}, recordWarning: 'after_record_failed' },
      );
      assert.deepEqual((await send(`/api/send/${id}?check=1`)).body, { operationId: id, state: 'not_sent' });
      assert.deepEqual(calls, [
        'agent',
        { agent: 'agent', text: 'test' },
        { ticket: 'ticket', text: 'test' },
        { query: true },
      ]);
    },
  );
});

test('守りはHost→方法→Content-Type→Origin→トークン→大きさと鍵で拒み、サービスを呼ばず件数だけを1分に1回記録する', async () => {
  let calls = 0;
  let now = 0;
  const logs: unknown[] = [];
  const service: NonNullable<AppOptions['send']> = {
    async status() {
      calls++;
      return {
        enabled: false,
        available: false,
        route: null,
        reason: 'send_disabled',
        target: null,
        agentType: null,
        answer: { available: false, reason: 'send_disabled' },
        answerKeys: { available: false, reason: 'send_disabled' },
        answerMessage: { available: false, reason: 'send_disabled' },
      };
    },
    async intent() {
      calls++;
      return { ok: false, error: 'send_disabled' };
    },
    async confirm() {
      calls++;
      return { ok: false, error: 'send_disabled' };
    },
    async check(operationId) {
      calls++;
      return { ok: true, operationId, state: 'not_sent' };
    },
  };
  await withApp({ send: service, sendGuard: { now: () => now, log: (counts) => logs.push(counts) } }, async (send) => {
    const path = '/api/send/confirm';
    for (const [method, body, headers, status, error] of [
      ['PUT', '{}', { host: 'evil' }, 421, 'misdirected_host'],
      ['PUT', '{}', { 'content-type': 'text/plain', origin: 'null' }, 405, 'method_not_allowed'],
      ['POST', '{}', { 'content-type': 'text/plain', origin: 'null' }, 415, 'unsupported_media_type'],
      ['POST', '{}', { origin: 'null', 'x-orca-web-token': 'bad' }, 403, 'origin_rejected'],
      ['POST', 'x'.repeat(131073), { 'x-orca-web-token': 'bad' }, 401, 'token_invalid'],
      ['POST', 'x'.repeat(131073), {}, 413, 'payload_too_large'],
      ['POST', '{', {}, 400, 'invalid_request'],
      ['POST', '{"ticket":"t","text":"secret","extra":true}', {}, 400, 'invalid_request'],
      ['POST', '{"ticket":"t"}', {}, 400, 'invalid_request'],
    ] as const) {
      const result = await send(path, method, body, headers);
      assert.equal(result.status, status);
      assert.equal(result.body.error, error);
      assert.equal(result.cors, undefined);
    }
    for (const site of ['cross-site', 'same-site']) {
      assert.equal((await send('/api/send/status?agent=a', 'GET', undefined, { 'sec-fetch-site': site })).status, 403);
      assert.equal((await send(`/api/send/${id}`, 'GET', undefined, { 'sec-fetch-site': site })).status, 403);
    }
    assert.equal(calls, 0);
    assert.equal(logs.length, 1);
    now = 60_000;
    await send(path, 'PUT');
    assert.deepEqual(logs, [
      { '/api/send/confirm:method_not_allowed': 1 },
      {
        '/api/send/confirm:unsupported_media_type': 1,
        '/api/send/confirm:origin_rejected': 1,
        '/api/send/confirm:token_invalid': 1,
        '/api/send/confirm:payload_too_large': 1,
        '/api/send/status:forbidden_origin': 2,
        '/api/send/:operationId:forbidden_origin': 2,
        '/api/send/confirm:method_not_allowed': 1,
      },
    ]);
    assert.equal((await send(path, 'POST', '{"ticket":"t","text":"secret"}')).status, 403);
    assert.equal(calls, 1);
  });
});

test('サービスの誤りはD-09のHTTP状態とreason/missingを返し、GETの入力を検査する', async () => {
  let failure: import('../../src/send/service.ts').SendFailure = { ok: false, error: 'busy' };
  const service: NonNullable<AppOptions['send']> = {
    async status() {
      return {
        enabled: false,
        available: false,
        route: null,
        reason: 'unreachable',
        target: null,
        agentType: null,
        answer: { available: false, reason: 'send_disabled' },
        answerKeys: { available: false, reason: 'send_disabled' },
        answerMessage: { available: false, reason: 'send_disabled' },
      };
    },
    async intent() {
      return failure;
    },
    async confirm() {
      return failure;
    },
    async check(operationId) {
      return { ok: true, operationId, state: 'in_progress' };
    },
  };
  await withApp({ send: service }, async (send) => {
    for (const [error, status] of [
      ['invalid_text', 400],
      ['send_disabled', 403],
      ['agent_not_found', 404],
      ['not_sendable', 409],
      ['target_changed', 409],
      ['ticket_invalid', 409],
      ['busy', 409],
      ['unsupported', 501],
      ['unknown_shape', 502],
      ['unreachable', 503],
      ['record_failed', 503],
    ] as const) {
      failure = { ok: false, error, reason: 'test-reason', missing: ['rpc:test'] };
      for (const route of ['intent', 'confirm']) {
        const result = await send(
          `/api/send/${route}`,
          'POST',
          JSON.stringify(route === 'intent' ? { agent: 'a', text: 'test' } : { ticket: 't', text: 'test' }),
        );
        assert.equal(result.status, status, error);
        assert.deepEqual(result.body, failure);
        assert.equal(result.cors, undefined);
      }
    }
    for (const path of ['/api/send/status', `/api/send/status?agent=${'x'.repeat(513)}`, '/api/send/bad-id'])
      assert.equal((await send(path)).status, 400);
    for (const site of ['same-origin', 'none'])
      assert.equal((await send(`/api/send/${id}`, 'GET', undefined, { 'sec-fetch-site': site })).status, 200);
    assert.equal((await send(`/api/send/${id}`, 'POST')).status, 405);
    assert.equal((await send(`/api/send/${id}`, 'GET', undefined, { origin: 'null' })).status, 403);
    assert.equal(
      (await send('/api/send/intent', 'POST', JSON.stringify({ agent: 'x'.repeat(513), text: 'test' }))).status,
      400,
    );
  });
});

test('設定を毎回読み、停止中の意図と確定は403、照会は200、守りの拒否は記録せず確定の拒否だけを記録する', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-http-send-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const settingsFile = path.join(dir, 'settings.json');
  const settings = new SettingsStore(settingsFile);
  const rpc = new SendRpc({
    async call() {
      throw new Error('RPC must not be called');
    },
  });
  const service = new SendService({
    snapshotSync: () => state(),
    capabilities: async () => {
      throw new Error('preflight must not be called');
    },
    rpc,
    adapter: createSendAdapter({ rpc }),
    journal: new SendJournal(path.join(dir, 'sends')),
    readSendEnabled: () => settings.readSendEnabled(),
  });
  await withApp({ send: service, sendGuard: { log() {} } }, async (send) => {
    await writeFile(settingsFile, JSON.stringify({ version: 1, sendEnabled: true }));
    assert.equal((await send('/api/send/intent', 'POST', '{"agent":"a","text":""}')).body.error, 'invalid_text');
    await writeFile(settingsFile, JSON.stringify({ version: 1, sendEnabled: false }));
    assert.equal((await send('/api/send/intent', 'POST', '{"agent":"a","text":"test"}')).status, 403);
    assert.equal(
      (await send('/api/send/confirm', 'POST', '{"ticket":"t","text":"test"}', { 'x-orca-web-token': 'bad' })).status,
      401,
    );
    await assert.rejects(readFile(path.join(dir, 'sends', 'sends.jsonl')), { code: 'ENOENT' });
    assert.equal((await send('/api/send/confirm', 'POST', '{"ticket":"t","text":"test"}')).status, 403);
    const rows = (await readFile(path.join(dir, 'sends', 'sends.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'refused');
    assert.equal(rows[0].reason, 'send_disabled');
    assert.equal(rows[0].text, undefined);
    const checked = await send(`/api/send/${rows[0].operationId}`);
    assert.equal(checked.status, 200);
    assert.equal(checked.body.state, 'recorded');
  });
});

test('意図だけが32文字の小文字16進の target を受けてサービスに渡す', async () => {
  const calls: unknown[] = [];
  await withApp(
    {
      send: {
        async status() {
          return {
            enabled: true,
            available: false,
            route: null,
            reason: 'unreachable',
            target: null,
            agentType: null,
            answer: { available: false, reason: 'send_disabled' },
            answerKeys: { available: false, reason: 'send_disabled' },
            answerMessage: { available: false, reason: 'send_disabled' },
          };
        },
        async intent(value) {
          calls.push(value);
          return { ok: false, error: 'target_changed', reason: 'changed_since_shown' };
        },
        async confirm() {
          assert.fail('confirm must not run');
        },
        async check(operationId) {
          return { ok: true, operationId, state: 'not_sent' };
        },
      },
    },
    async (send) => {
      for (const target of [null, 1, {}, [], '', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), 'g'.repeat(32)]) {
        assert.equal(
          (await send('/api/send/intent', 'POST', JSON.stringify({ agent: 'a', text: 'hello', target }))).status,
          400,
        );
      }
      for (const body of [
        { agent: 'a', text: 'hello', target: 'a'.repeat(32), extra: true },
        { ticket: 't', text: 'hello', target: 'a'.repeat(32) },
      ]) {
        const route = 'ticket' in body ? 'confirm' : 'intent';
        assert.equal((await send(`/api/send/${route}`, 'POST', JSON.stringify(body))).status, 400);
      }
      assert.equal(calls.length, 0);
      const body = { agent: 'a', text: 'hello', target: '0123456789abcdef0123456789abcdef' };
      const response = await send('/api/send/intent', 'POST', JSON.stringify(body));
      assert.equal(response.status, 409);
      assert.deepEqual(response.body, { ok: false, error: 'target_changed', reason: 'changed_since_shown' });
      assert.deepEqual(calls, [body]);
    },
  );
});

test('照会の record_unreadable は503で返し not_sent を示さない', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-unreadable-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'sends.jsonl'));
  const rpc = new SendRpc({
    async call() {
      throw new Error('RPC must not be called');
    },
  });
  const service = new SendService({
    snapshotSync: () => state(),
    capabilities: async () => {
      throw new Error('preflight must not be called');
    },
    rpc,
    adapter: createSendAdapter({ rpc }),
    journal: new SendJournal(dir),
    readSendEnabled: async () => false,
  });
  await withApp({ send: service }, async (send) => {
    for (const query of ['', '?check=1']) {
      const response = await send(`/api/send/${id}${query}`);
      assert.equal(response.status, 503);
      assert.deepEqual(response.body, { ok: false, error: 'record_unreadable' });
      assert.equal(response.cors, undefined);
    }
  });
});

// ---- 質問への答えの口（D-04、T-10） ----

function answerService(calls: unknown[]): NonNullable<AppOptions['send']> {
  const preview = {
    repoName: null,
    worktreePath: null,
    branch: null,
    agentType: 'claude',
    title: null,
    state: null,
    route: 'chat' as const,
    sessionShortId: 'short',
  };
  return {
    async status(agent) {
      calls.push(['status', agent]);
      return {
        enabled: true,
        available: true,
        route: 'chat',
        reason: null,
        target: 'a'.repeat(32),
        agentType: 'claude',
        answer: { available: true, reason: null },
        answerKeys: { available: true, reason: null },
        answerMessage: { available: true, reason: null },
      };
    },
    async intent() {
      calls.push(['intent']);
      return { ok: false, error: 'send_disabled' };
    },
    async confirm() {
      calls.push(['confirm']);
      return { ok: false, error: 'send_disabled' };
    },
    async check(operationId) {
      calls.push(['check', operationId]);
      return { ok: true, operationId, state: 'not_sent' };
    },
    async answerIntent(value) {
      calls.push(['answerIntent', value]);
      return { ok: true, ticket: 'ticket', expiresAt: 1, operationId: id, preview, digest: 'd'.repeat(64) };
    },
    async answerConfirm(value) {
      calls.push(['answerConfirm', value]);
      return { ok: true, operationId: id, outcome: 'submitted', detail: { code: 'resolved' } };
    },
  };
}

const answerBody = {
  agent: 'chat:x',
  prompt: { itemId: 'item', revision: 3 },
  answers: [{ questionId: 'q', optionIds: ['a'] }],
};

test('T-10 答えの意図と確定は物の鍵を確かめてサービスに渡し、ok を除いて返し、CORS を付けない', async () => {
  const calls: unknown[] = [];
  await withApp({ send: answerService(calls) }, async (send) => {
    const intent = await send('/api/answer/intent', 'POST', JSON.stringify({ ...answerBody, target: 'b'.repeat(32) }));
    assert.equal(intent.status, 200);
    assert.equal(intent.cors, undefined);
    assert.equal('ok' in intent.body, false);
    assert.equal(intent.body.ticket, 'ticket');
    const confirm = await send(
      '/api/answer/confirm',
      'POST',
      JSON.stringify({ ticket: 'ticket', answers: answerBody.answers }),
    );
    assert.equal(confirm.status, 200);
    assert.equal(confirm.cors, undefined);
    assert.deepEqual(confirm.body, { operationId: id, outcome: 'submitted', detail: { code: 'resolved' } });
    const status = await send('/api/send/status?agent=chat:x');
    assert.deepEqual(status.body.answer, { available: true, reason: null });
    assert.equal(status.cors, undefined);
  });
  assert.deepEqual(calls, [
    ['answerIntent', { ...answerBody, target: 'b'.repeat(32) }],
    ['answerConfirm', { ticket: 'ticket', answers: answerBody.answers }],
    ['status', 'chat:x'],
  ]);
});

test('T-10 答えの口は、同じオリジンの JSON とトークンのない書き込み・余分な鍵・形の誤りを、サービスを呼ばずに拒む', async () => {
  const calls: unknown[] = [];
  await withApp({ send: answerService(calls) }, async (send) => {
    for (const path of ['/api/answer/intent', '/api/answer/confirm']) {
      const good = path.endsWith('intent') ? answerBody : { ticket: 't', answers: answerBody.answers };
      for (const [method, body, headers, status, error] of [
        ['POST', JSON.stringify(good), { host: 'evil' }, 421, 'misdirected_host'],
        ['GET', undefined, {}, 405, 'method_not_allowed'],
        ['PUT', JSON.stringify(good), {}, 405, 'method_not_allowed'],
        ['POST', JSON.stringify(good), { 'content-type': 'text/plain' }, 415, 'unsupported_media_type'],
        ['POST', JSON.stringify(good), { origin: 'http://evil.example' }, 403, 'origin_rejected'],
        ['POST', JSON.stringify(good), { 'x-orca-web-token': 'bad' }, 401, 'token_invalid'],
        ['POST', 'x'.repeat(131073), {}, 413, 'payload_too_large'],
        ['POST', '{', {}, 400, 'invalid_request'],
        ['POST', JSON.stringify({ ...good, extra: true }), {}, 400, 'invalid_request'],
        ['POST', JSON.stringify({ ...good, text: 'x' }), {}, 400, 'invalid_request'],
        ['POST', JSON.stringify({ ...good, answers: 'x' }), {}, 400, 'invalid_request'],
      ] as const) {
        const result = await send(path, method, body, headers);
        assert.equal(result.status, status, `${path} ${method} ${error}`);
        assert.equal(result.body.error, error);
        assert.equal(result.cors, undefined);
      }
    }
    for (const bad of [
      { ...answerBody, agent: '' },
      { ...answerBody, agent: 1 },
      { ...answerBody, prompt: { itemId: 'item' } },
      { ...answerBody, prompt: { itemId: '', revision: 3 } },
      { ...answerBody, prompt: { itemId: 'x'.repeat(1025), revision: 3 } },
      { ...answerBody, prompt: { itemId: 'item', revision: 0 } },
      { ...answerBody, prompt: { itemId: 'item', revision: 1.5 } },
      { ...answerBody, prompt: { itemId: 'item', revision: 3, extra: 1 } },
      { ...answerBody, target: 'short' },
      { agent: 'chat:x', prompt: answerBody.prompt },
    ]) {
      const result = await send('/api/answer/intent', 'POST', JSON.stringify(bad));
      assert.equal(result.status, 400, JSON.stringify(bad));
    }
    for (const bad of [{ ticket: '', answers: [] }, { ticket: 't' }, { answers: [] }]) {
      assert.equal((await send('/api/answer/confirm', 'POST', JSON.stringify(bad))).status, 400);
    }
  });
  assert.deepEqual(calls, []);
});

test('T-10 答えの誤りは invalid_answer を 400 で返し、答えの口のないサービスは 503 にする', async () => {
  const calls: unknown[] = [];
  const service = answerService(calls);
  service.answerIntent = async () => ({ ok: false, error: 'invalid_answer', reason: 'no_choice' });
  service.answerConfirm = async () => ({ ok: false, error: 'target_changed', reason: 'question_changed' });
  await withApp({ send: service }, async (send) => {
    const intent = await send('/api/answer/intent', 'POST', JSON.stringify(answerBody));
    assert.equal(intent.status, 400);
    assert.deepEqual(intent.body, { ok: false, error: 'invalid_answer', reason: 'no_choice' });
    const confirm = await send('/api/answer/confirm', 'POST', JSON.stringify({ ticket: 't', answers: [] }));
    assert.equal(confirm.status, 409);
    assert.deepEqual(confirm.body, { ok: false, error: 'target_changed', reason: 'question_changed' });
  });
  const { answerIntent: _i, answerConfirm: _c, ...old } = answerService([]);
  await withApp({ send: old }, async (send) => {
    assert.equal((await send('/api/answer/intent', 'POST', JSON.stringify(answerBody))).status, 503);
  });
});

// ---- callId の答え（iss-00049 D-06、T-12） ----

const callBody = { agent: 'tab:leaf', callId: 'call-ask', answers: [{ questionId: '0', optionIds: ['1'] }] };

test('T-12 /api/answer/intent は callId の物を受けてサービスに渡し、status は answerKeys と answerMessage を返す', async () => {
  const calls: unknown[] = [];
  await withApp({ send: answerService(calls) }, async (send) => {
    const intent = await send('/api/answer/intent', 'POST', JSON.stringify(callBody));
    assert.equal(intent.status, 200);
    assert.equal(intent.cors, undefined);
    const targeted = await send('/api/answer/intent', 'POST', JSON.stringify({ ...callBody, target: 'c'.repeat(32) }));
    assert.equal(targeted.status, 200);
    const long = await send('/api/answer/intent', 'POST', JSON.stringify({ ...callBody, callId: 'x'.repeat(1024) }));
    assert.equal(long.status, 200);
    const status = await send('/api/send/status?agent=chat:x');
    assert.deepEqual(
      [status.body.answerKeys, status.body.answerMessage],
      [
        { available: true, reason: null },
        { available: true, reason: null },
      ],
    );
  });
  assert.deepEqual(calls.slice(0, 3), [
    ['answerIntent', callBody],
    ['answerIntent', { ...callBody, target: 'c'.repeat(32) }],
    ['answerIntent', { ...callBody, callId: 'x'.repeat(1024) }],
  ]);
});

test('T-12 /api/answer/intent は prompt と callId の両方・どちらもない・余分な鍵・長すぎるか空の callId を 400 で拒み、守りは今のまま', async () => {
  const calls: unknown[] = [];
  await withApp({ send: answerService(calls) }, async (send) => {
    for (const bad of [
      { ...callBody, prompt: answerBody.prompt },
      { agent: 'tab:leaf', answers: callBody.answers },
      { ...callBody, extra: 1 },
      { ...callBody, callId: 'x'.repeat(1025) },
      { ...callBody, callId: '' },
      { ...callBody, callId: 3 },
      { ...callBody, answers: 'x' },
      { ...callBody, target: 'short' },
    ]) {
      const result = await send('/api/answer/intent', 'POST', JSON.stringify(bad));
      assert.equal(result.status, 400, JSON.stringify(bad).slice(0, 80));
      assert.equal(result.body.error, 'invalid_request');
    }
    for (const [headers, status, error] of [
      [{ origin: 'http://evil.example' }, 403, 'origin_rejected'],
      [{ 'x-orca-web-token': 'bad' }, 401, 'token_invalid'],
      [{ 'content-type': 'text/plain' }, 415, 'unsupported_media_type'],
    ] as const) {
      const result = await send('/api/answer/intent', 'POST', JSON.stringify(callBody), headers);
      assert.equal(result.status, status);
      assert.equal(result.body.error, error);
      assert.equal(result.cors, undefined);
    }
  });
  assert.deepEqual(calls, []);
});
