// 下書きの口（web/embed/draft-receiver.js、iss-00080 D-03・D-04、T-01・T-02・T-06）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  acceptDraft,
  createDraftReceiver,
  createDraftSender,
  DRAFT_MAX_LENGTH,
  isComposeOff,
} from '../../web/embed/draft-receiver.js';

const SELF = 'http://127.0.0.1:8791';
const parentWin = { name: 'parent' };
const draft = (text: unknown = '下書き') => ({
  origin: SELF,
  source: parentWin,
  data: { type: 'orca-web:draft', text },
});
const ctx = (patch: Record<string, unknown> = {}) => ({
  selfOrigin: SELF,
  parent: parentWin,
  composeOn: true,
  sendPhase: 'compose',
  currentText: '',
  ...patch,
});

test('T-02：同じオリジン・親から・送る欄が出ていて phase が compose か changed で入力欄が空のときだけ受ける', () => {
  assert.deepEqual(acceptDraft(draft(), ctx()), { ok: true, text: '下書き' });
  assert.deepEqual(acceptDraft(draft(), ctx({ sendPhase: 'changed' })), { ok: true, text: '下書き' });
});

test('T-02：改行は残し、ほかの制御文字は除く', () => {
  assert.deepEqual(acceptDraft(draft('一行目\n（Dispatch ctx_1）\u0000\u001b\r\u007f'), ctx()), {
    ok: true,
    text: '一行目\n（Dispatch ctx_1）',
  });
});

test('T-02：別のオリジン・親でない source・別の種類の知らせは受けない（返事もしない ignored）', () => {
  assert.deepEqual(acceptDraft({ ...draft(), origin: 'http://evil.example' }, ctx()), {
    ok: false,
    reason: 'ignored',
  });
  assert.deepEqual(acceptDraft({ ...draft(), source: { name: 'other' } }, ctx()), { ok: false, reason: 'ignored' });
  assert.deepEqual(acceptDraft({ ...draft(), data: { type: 'orca-web:ready' } }, ctx()), {
    ok: false,
    reason: 'ignored',
  });
  assert.deepEqual(acceptDraft({ ...draft(), data: null }, ctx()), { ok: false, reason: 'ignored' });
  assert.deepEqual(acceptDraft(draft(42), ctx()), { ok: false, reason: 'ignored' });
});

test('T-02：compose off・disabled・送信中・書きかけ・1,000 字超は理由を返す', () => {
  assert.deepEqual(acceptDraft(draft(), ctx({ composeOn: false })), { ok: false, reason: 'compose_off' });
  assert.deepEqual(acceptDraft(draft(), ctx({ sendPhase: 'disabled' })), { ok: false, reason: 'disabled' });
  for (const phase of ['sending', 'checking', 'unknown']) {
    assert.deepEqual(acceptDraft(draft(), ctx({ sendPhase: phase })), { ok: false, reason: 'busy' }, phase);
  }
  assert.deepEqual(acceptDraft(draft(), ctx({ currentText: '書きかけ' })), { ok: false, reason: 'not_empty' });
  assert.deepEqual(acceptDraft(draft(), ctx({ currentText: ' ' })), { ok: false, reason: 'not_empty' });
  assert.equal(DRAFT_MAX_LENGTH, 1000);
  assert.deepEqual(acceptDraft(draft('あ'.repeat(1000)), ctx()).ok, true);
  assert.deepEqual(acceptDraft(draft('あ'.repeat(1001)), ctx()), { ok: false, reason: 'too_long' });
});

test('D-03：compose=off だけが送る欄を隠す', () => {
  assert.equal(isComposeOff(new URLSearchParams('id=a&compose=off')), true);
  assert.equal(isComposeOff(new URLSearchParams('id=a')), false);
  assert.equal(isComposeOff(new URLSearchParams('id=a&compose=on')), false);
});

/** 受け手の試しの組み立て。 */
function receiverRig(state: { phase: string; text: string }, composeOn = true) {
  const posted: Array<{ message: unknown; origin: string }> = [];
  const inputs: string[] = [];
  const parent = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
  let listener: ((event: unknown) => void) | null = null;
  const win = {
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      assert.equal(type, 'message');
      listener = fn;
    },
  };
  const receiver = createDraftReceiver({
    win,
    parent,
    selfOrigin: SELF,
    composeOn,
    sendPhase: () => state.phase,
    currentText: () => state.text,
    input: (text: string) => {
      inputs.push(text);
      state.text = text;
    },
  });
  const deliver = (event: Record<string, unknown>) => listener?.({ source: parent, origin: SELF, ...event });
  return { posted, inputs, receiver, deliver, hasListener: () => listener !== null };
}

test('T-06：受け手は受け口を登録し、ready は何度呼んでも親へ1回だけ、自分のオリジンを宛先に送る', () => {
  const rig = receiverRig({ phase: 'compose', text: '' });
  assert.equal(rig.hasListener(), true);
  assert.deepEqual(rig.posted, []);
  rig.receiver.ready();
  rig.receiver.ready();
  assert.deepEqual(rig.posted, [{ message: { type: 'orca-web:ready' }, origin: SELF }]);
});

test('T-06・F-01：受けた下書きごとに draft-result を返し、入れるのは ok のときだけで、送信はしない', () => {
  const state = { phase: 'compose', text: '' };
  const rig = receiverRig(state);
  rig.deliver({ data: { type: 'orca-web:draft', text: '文' } });
  assert.deepEqual(rig.inputs, ['文']);
  rig.deliver({ data: { type: 'orca-web:draft', text: '次' } });
  assert.deepEqual(rig.inputs, ['文'], '書きかけは上書きしない');
  assert.deepEqual(rig.posted, [
    { message: { type: 'orca-web:draft-result', ok: true, reason: null }, origin: SELF },
    { message: { type: 'orca-web:draft-result', ok: false, reason: 'not_empty' }, origin: SELF },
  ]);
  // 別のオリジン・親でない窓からの知らせは無視し、返事もしない。
  rig.deliver({ origin: 'http://evil.example', data: { type: 'orca-web:draft', text: 'x' } });
  rig.deliver({ source: { postMessage: () => {} }, data: { type: 'orca-web:draft', text: 'x' } });
  assert.equal(rig.posted.length, 2);
});

test('T-06：compose=off の受け手は入れずに compose_off を返す', () => {
  const rig = receiverRig({ phase: 'compose', text: '' }, false);
  rig.deliver({ data: { type: 'orca-web:draft', text: '文' } });
  assert.deepEqual(rig.inputs, []);
  assert.deepEqual(rig.posted, [
    { message: { type: 'orca-web:draft-result', ok: false, reason: 'compose_off' }, origin: SELF },
  ]);
});

/** 送り手の試しの組み立て。 */
function senderRig() {
  const results: unknown[] = [];
  const timers = new Map<number, () => void>();
  let next = 1;
  const sender = createDraftSender({
    selfOrigin: SELF,
    timeoutMs: 10_000,
    setTimer: (fn: () => void, ms: number) => {
      assert.equal(ms, 10_000);
      const id = next++;
      timers.set(id, fn);
      return id;
    },
    clearTimer: (id: unknown) => {
      timers.delete(id as number);
    },
    onResult: (result: unknown) => results.push(result),
  });
  const frame = () => {
    const posted: Array<{ message: unknown; origin: string }> = [];
    const contentWindow = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
    return { contentWindow, posted };
  };
  const fire = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const fn of pending) fn();
  };
  return { sender, results, timers, frame, fire };
}

test('T-06：ready の前は送らず、今の枠の ready の後に自分のオリジンを宛先に送る', () => {
  const rig = senderRig();
  const f = rig.frame();
  rig.sender.frameCreated(f);
  rig.sender.send('下書き');
  assert.deepEqual(f.posted, []);
  rig.sender.handleMessage({ origin: SELF, source: f.contentWindow, data: { type: 'orca-web:ready' } });
  assert.deepEqual(f.posted, [{ message: { type: 'orca-web:draft', text: '下書き' }, origin: SELF }]);
  assert.equal(rig.timers.size, 0, '送れば待ちの時計を止める');
  rig.sender.handleMessage({
    origin: SELF,
    source: f.contentWindow,
    data: { type: 'orca-web:draft-result', ok: true, reason: null },
  });
  assert.deepEqual(rig.results, [{ ok: true, reason: null }]);
});

test('T-06：枠が前から ready を送り終えていれば押した時にすぐ送る', () => {
  const rig = senderRig();
  const f = rig.frame();
  rig.sender.frameCreated(f);
  rig.sender.handleMessage({ origin: SELF, source: f.contentWindow, data: { type: 'orca-web:ready' } });
  rig.sender.send('すぐ');
  assert.deepEqual(f.posted, [{ message: { type: 'orca-web:draft', text: 'すぐ' }, origin: SELF }]);
  assert.equal(rig.timers.size, 0);
});

test('T-06：10 秒で ready が来なければ送らず、timeout の結果を返す', () => {
  const rig = senderRig();
  const f = rig.frame();
  rig.sender.frameCreated(f);
  rig.sender.send('下書き');
  rig.fire();
  assert.deepEqual(rig.results, [{ ok: false, reason: 'timeout' }]);
  rig.sender.handleMessage({ origin: SELF, source: f.contentWindow, data: { type: 'orca-web:ready' } });
  assert.deepEqual(f.posted, [], '時間切れの後の ready では送らない');
});

test('T-06：not_empty の結果を返す', () => {
  const rig = senderRig();
  const f = rig.frame();
  rig.sender.frameCreated(f);
  rig.sender.handleMessage({ origin: SELF, source: f.contentWindow, data: { type: 'orca-web:ready' } });
  rig.sender.send('下書き');
  rig.sender.handleMessage({
    origin: SELF,
    source: f.contentWindow,
    data: { type: 'orca-web:draft-result', ok: false, reason: 'not_empty' },
  });
  assert.deepEqual(rig.results, [{ ok: false, reason: 'not_empty' }]);
});

test('T-06：前の枠・別の窓・別のオリジンからの ready は覚えない', () => {
  const rig = senderRig();
  const old = rig.frame();
  rig.sender.frameCreated(old);
  rig.sender.handleMessage({ origin: SELF, source: old.contentWindow, data: { type: 'orca-web:ready' } });
  const current = rig.frame();
  rig.sender.frameCreated(current);
  rig.sender.handleMessage({ origin: SELF, source: old.contentWindow, data: { type: 'orca-web:ready' } });
  rig.sender.handleMessage({ origin: SELF, source: { postMessage: () => {} }, data: { type: 'orca-web:ready' } });
  rig.sender.handleMessage({
    origin: 'http://evil.example',
    source: current.contentWindow,
    data: { type: 'orca-web:ready' },
  });
  rig.sender.send('下書き');
  assert.deepEqual(old.posted, []);
  assert.deepEqual(current.posted, [], '今の枠の ready はまだ');
  rig.sender.handleMessage({ origin: SELF, source: current.contentWindow, data: { type: 'orca-web:ready' } });
  assert.equal(current.posted.length, 1);
  assert.deepEqual(old.posted, []);
});

test('T-06：送る前に枠が作り直されたら、前の枠あての下書きは捨てる', () => {
  const rig = senderRig();
  const first = rig.frame();
  rig.sender.frameCreated(first);
  rig.sender.send('下書き');
  const second = rig.frame();
  rig.sender.frameCreated(second);
  assert.equal(rig.timers.size, 0);
  rig.sender.handleMessage({ origin: SELF, source: second.contentWindow, data: { type: 'orca-web:ready' } });
  assert.deepEqual(second.posted, []);
  assert.deepEqual(rig.results, []);
});

test('T-06：結果は送った後の今の枠からだけ受ける', () => {
  const rig = senderRig();
  const f = rig.frame();
  rig.sender.frameCreated(f);
  rig.sender.handleMessage({
    origin: SELF,
    source: f.contentWindow,
    data: { type: 'orca-web:draft-result', ok: true, reason: null },
  });
  assert.deepEqual(rig.results, [], '送っていなければ受けない');
});

// agent-frame.js の配線（ソースの確かめ。今の形の試しの流儀に合わせる）。
const frame = readFileSync(new URL('../../web/embed/agent-frame.js', import.meta.url), 'utf8').replace(
  /\/\/.*$|\/\*[\s\S]*?\*\//gm,
  '',
);

test('T-01：compose=off は送る欄の要素を隠すだけで、送信の状態の読み（pollSend）は条件なしに始める', () => {
  assert.match(frame, /const composeOn = !isComposeOff\(params\);/);
  assert.match(frame, /if \(!composeOn\) els\.send\.hidden = true;/);
  const start = /\} else \{\s*stateLoop\.restart\(\);([\s\S]*)$/.exec(frame)?.[1] ?? '';
  assert.match(
    start,
    /\n {2}void pollSend\(\)\.then\(\(\) => draftReceiver\.ready\(\)\);/,
    'pollSend を compose に関わらず始める',
  );
  assert.doesNotMatch(frame, /composeOn[^\n]*pollSend|pollSend[^\n]*composeOn/);
  // 質問・承認のカードは同じ sendStatus を読む（compose で分けない）。
  assert.match(frame, /availability: approvalBoard\.approver\(row\.part\)\.availability\(row\.part, sendStatus\)/);
});

test('T-06・F-01：agent-frame.js は受け口を作り、ok なら流れの input だけを呼ぶ（submit を渡さない）', () => {
  const block = /createDraftReceiver\(\{([\s\S]*?)\}\);/.exec(frame)?.[1] ?? '';
  assert.match(block, /win: window,/);
  assert.match(block, /parent: window\.parent === window \? null : window\.parent,/);
  assert.match(block, /selfOrigin: location\.origin,/);
  assert.match(block, /composeOn,/);
  assert.match(block, /sendPhase: \(\) => sendFlow\.getState\(\)\.phase,/);
  assert.match(block, /currentText: \(\) => els\.sendText\.value,/);
  assert.match(block, /input: \(text\) => sendFlow\.input\(text\),/);
  assert.doesNotMatch(block, /submit|writer|confirm/);
});

test('T-08：/embed/draft-receiver.js を STATIC_FILES に登録する', () => {
  const app = readFileSync(new URL('../../src/server/app.ts', import.meta.url), 'utf8');
  assert.match(
    app,
    /'\/embed\/draft-receiver\.js': \{ file: 'embed\/draft-receiver\.js', type: 'text\/javascript; charset=utf-8' \}/,
  );
});

test('T-01：送る欄を隠しても、承認のカードの手段は同じ status で押せる状態になる', async () => {
  const { createChatApprover } = await import('../../web/embed/approval-view.js');
  const { createSendFlow } = await import('../../web/embed/send-view.js');
  let reads = 0;
  const status = { enabled: true, target: 't', agentType: 'claude', approval: { available: true } };
  const read = async (url: string) => {
    if (url.startsWith('/api/send/status')) reads++;
    return { status: 200, body: status };
  };
  const flow = createSendFlow({ agentId: 'a', writer: { send: async () => ({ status: 500, body: {} }) }, read });
  await flow.refreshStatus();
  assert.equal(reads, 1, '/api/send/status を読む');
  const approver = createChatApprover({
    agentId: 'a',
    writer: { send: async () => ({ status: 500, body: {} }) },
    read,
  });
  const part = { kind: 'approval', state: 'pending', answerable: true, prompt: { id: 'p' }, options: [] };
  assert.equal(approver.availability(part, status).ok, true);
});
