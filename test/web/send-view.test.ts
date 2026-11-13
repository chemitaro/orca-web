import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildConfirm,
  buildResult,
  buildSendView,
  createSendFlow,
  describeError,
  initialSend,
  OUTCOME_LABELS,
  reduceSend,
  WARNING_LABELS,
} from '../../web/embed/send-view.js';

type State = ReturnType<typeof initialSend>;

const OP = '1763000000000-0123456789abcdef0123456789abcdef';
const PREVIEW = {
  repoName: 'orca-web',
  worktreePath: '/w/send-test',
  branch: 'send-test',
  agentType: 'claude',
  title: '送信の確かめ',
  state: 'idle',
  route: 'terminal',
  sessionShortId: 'abcd1234',
};
const T0 = Date.parse('2026-11-13T00:00:00.000Z');
const intentBody = (text: string) => ({
  ticket: 'tk-1',
  expiresAt: T0 + 60_000,
  operationId: OP,
  preview: PREVIEW,
  text,
  digest: 'd'.repeat(64),
});

const run = (state: State, ...events: Record<string, unknown>[]): State =>
  events.reduce<State>((s, e) => reduceSend(s, e as never), state);

const compose = (text = 'こんにちは'): State =>
  run(
    initialSend(),
    { type: 'status', status: 200, body: { enabled: true, available: true, route: 'terminal', reason: null } },
    { type: 'input', text },
  );
const confirming = (text = 'こんにちは'): State =>
  run(compose(text), { type: 'submit' }, { type: 'intent', status: 200, body: intentBody(text) });
const sending = (text = 'こんにちは'): State => run(confirming(text), { type: 'confirm', now: T0 + 1_000 });
const resultOf = (outcome: string, extra: Record<string, unknown> = {}): State =>
  run(sending(), {
    type: 'confirmed',
    status: 200,
    body: { operationId: OP, outcome, detail: {}, ...extra },
  });

test('status の応答で、送れるなら書く欄、止まっているか送れないなら理由つきで止まる', () => {
  const start = initialSend();
  assert.equal(start.phase, 'disabled');
  assert.equal(buildSendView(start).chatHead, '会話（読むだけ）');

  const ok = reduceSend(start, {
    type: 'status',
    status: 200,
    body: { enabled: true, available: true, route: 'chat', reason: null },
  });
  assert.equal(ok.phase, 'compose');
  assert.equal(buildSendView(ok).chatHead, '会話');

  const off = reduceSend(ok, {
    type: 'status',
    status: 200,
    body: { enabled: false, available: true, route: 'terminal', reason: null },
  });
  assert.equal(off.phase, 'disabled');
  assert.equal(off.reason, 'send_disabled');
  assert.match(buildSendView(off).message?.text ?? '', /設定で送信が止まっています/);
  assert.equal(buildSendView(off).chatHead, '会話（読むだけ）');

  const shell = reduceSend(ok, {
    type: 'status',
    status: 200,
    body: { enabled: true, available: false, route: null, reason: 'shell_foreground' },
  });
  assert.equal(shell.phase, 'disabled');
  assert.match(buildSendView(shell).message?.text ?? '', /シェル/);
  const view = buildSendView(shell);
  assert.equal(view.editor.disabled, true);
  assert.deepEqual(
    view.actions.map((a) => [a.action, a.disabled]),
    [['submit', true]],
  );

  const unsupported = reduceSend(ok, {
    type: 'status',
    status: 200,
    body: { enabled: true, available: false, route: null, reason: 'unsupported' },
  });
  assert.match(buildSendView(unsupported).message?.text ?? '', /Orca の版/);

  const failed = reduceSend(ok, { type: 'status-failed' });
  assert.equal(failed.phase, 'disabled');
  assert.match(buildSendView(failed).message?.text ?? '', /確かめられません/);
  const odd = reduceSend(ok, { type: 'status', status: 503, body: {} });
  assert.equal(odd.phase, 'disabled');
});

test('止まっている間も本文は残り、status が戻ると書く欄に戻る', () => {
  const typed = compose('残す本文');
  const off = reduceSend(typed, {
    type: 'status',
    status: 200,
    body: { enabled: false, available: true, route: 'terminal', reason: null },
  });
  assert.equal(off.text, '残す本文');
  const back = reduceSend(off, {
    type: 'status',
    status: 200,
    body: { enabled: true, available: true, route: 'terminal', reason: null },
  });
  assert.equal(back.phase, 'compose');
  assert.equal(back.text, '残す本文');
});

test('確認・送信・結果の間は status の出来事を受けない（同じ状態を返す）', () => {
  const status = {
    type: 'status',
    status: 200,
    body: { enabled: false, available: false, route: null, reason: 'send_disabled' },
  };
  for (const state of [confirming(), sending(), resultOf('submitted')]) {
    assert.equal(reduceSend(state, status as never), state);
    assert.equal(reduceSend(state, { type: 'status-failed' } as never), state);
  }
});

test('「確かめる」は書く欄で空白だけでない本文のときだけ効き、checking の間の2回目の押しは捨てる', () => {
  const blank = compose('  \n ');
  assert.equal(reduceSend(blank, { type: 'submit' }), blank);
  assert.equal(buildSendView(blank).actions[0]?.disabled, true);

  const checking = reduceSend(compose(), { type: 'submit' });
  assert.equal(checking.phase, 'checking');
  assert.equal(reduceSend(checking, { type: 'submit' }), checking);
  assert.equal(reduceSend(checking, { type: 'input', text: '変える' }), checking);
  const view = buildSendView(checking);
  assert.equal(view.editor.disabled, true);
  assert.ok(view.actions.every((a) => a.disabled));
});

test('意図の応答で確認の画面に進み、確認の項目、本文、期限を示す', () => {
  const state = confirming('一行目\n二行目');
  assert.equal(state.phase, 'confirm');
  assert.equal(state.ticket, 'tk-1');
  assert.equal(state.operationId, OP);
  assert.equal(state.expiresAt, T0 + 60_000);

  const view = buildSendView(state, { formatTime: () => '09:01:00' });
  assert.equal(view.editor.visible, false);
  assert.ok(view.confirm);
  assert.equal(view.confirm.text, '一行目\n二行目');
  assert.match(view.confirm.expires, /09:01:00/);
  assert.deepEqual(
    view.actions.map((a) => [a.action, a.label, a.disabled]),
    [
      ['confirm', '送る', false],
      ['cancel', 'やめる', false],
    ],
  );

  const rows = Object.fromEntries(buildConfirm(PREVIEW, 'x').rows.map((r) => [r.label, r.text]));
  assert.deepEqual(rows, {
    リポジトリ: 'orca-web',
    worktree: '/w/send-test',
    ブランチ: 'send-test',
    エージェント: 'claude',
    題名: '送信の確かめ',
    状態: 'idle',
    経路: '端末',
    セッション: 'abcd1234',
  });
  const chat = Object.fromEntries(
    buildConfirm({ ...PREVIEW, route: 'chat', title: null, branch: null }, 'x').rows.map((r) => [r.label, r.text]),
  );
  assert.equal(chat.経路, '構造化 Chat');
  assert.equal(chat.題名, '—');
  assert.equal(chat.ブランチ, '—');
});

test('意図の誤りは理由を示して書く欄に戻り、本文を残す。send_disabled は止める', () => {
  const checking = reduceSend(compose('本文'), { type: 'submit' });
  const busy = reduceSend(checking, {
    type: 'intent',
    status: 409,
    body: { ok: false, error: 'not_sendable', reason: 'permission' },
  });
  assert.equal(busy.phase, 'compose');
  assert.equal(busy.text, '本文');
  assert.match(buildSendView(busy).message?.text ?? '', /権限の確認/);

  const off = reduceSend(checking, { type: 'intent', status: 403, body: { ok: false, error: 'send_disabled' } });
  assert.equal(off.phase, 'disabled');
  assert.equal(off.text, '本文');

  const lost = reduceSend(checking, { type: 'intent-failed' });
  assert.equal(lost.phase, 'compose');
  assert.equal(lost.text, '本文');
  assert.match(buildSendView(lost).message?.text ?? '', /orca-web につながりません/);

  const odd = reduceSend(checking, { type: 'intent', status: 200, body: {} });
  assert.equal(odd.phase, 'compose');
  const echoed = reduceSend(checking, { type: 'intent', status: 200, body: intentBody('別の本文') });
  assert.equal(echoed.phase, 'compose', 'サーバーが受けた本文が違えば確認に進まない');
});

test('「やめる」と期限の経過は、本文を残して書く欄に戻る', () => {
  const cancelled = reduceSend(confirming('やめる本文'), { type: 'cancel' });
  assert.equal(cancelled.phase, 'compose');
  assert.equal(cancelled.text, 'やめる本文');
  assert.equal(cancelled.ticket, undefined);

  const expired = reduceSend(confirming('期限の本文'), { type: 'expire' });
  assert.equal(expired.phase, 'compose');
  assert.equal(expired.text, '期限の本文');
  assert.match(buildSendView(expired).message?.text ?? '', /60 秒/);

  const late = reduceSend(confirming('遅い本文'), { type: 'confirm', now: T0 + 60_000 });
  assert.equal(late.phase, 'compose', '期限を過ぎた「送る」は送らずに戻る');
  assert.equal(late.text, '遅い本文');
});

test('sending の間は2回目の「送る」と「やめる」を捨て、ボタンを押せなくする', () => {
  const state = sending();
  assert.equal(state.phase, 'sending');
  assert.equal(reduceSend(state, { type: 'confirm', now: T0 + 2_000 }), state);
  assert.equal(reduceSend(state, { type: 'cancel' }), state);
  assert.equal(reduceSend(state, { type: 'expire' }), state);
  assert.equal(reduceSend(state, { type: 'submit' }), state);
  const view = buildSendView(state);
  assert.ok(view.actions.every((a) => a.disabled));
  assert.ok(view.confirm, '送っている間も確認の項目を示す');
});

test('5つの outcome の言葉と、warning の言葉を作る', () => {
  assert.deepEqual(OUTCOME_LABELS, {
    accepted: '受け付けた',
    input_accepted: '入力を受けた',
    submitted: '送信を確かめた',
    unknown: '結果不明',
    refused: '拒んだ',
  });
  for (const [outcome, label] of Object.entries(OUTCOME_LABELS)) {
    const state = resultOf(outcome);
    assert.equal(state.phase, 'result');
    const view = buildSendView(state);
    assert.equal(view.result?.label, label);
    assert.equal(view.result?.operationId, OP);
    assert.equal(
      view.actions.some((a) => a.action === 'query'),
      outcome === 'unknown',
      'unknown のときだけ「確かめる」を出す',
    );
  }

  const verify = buildResult({ operationId: OP, outcome: 'unknown', detail: { warning: 'agent_not_verified' } });
  assert.ok(verify.warnings.some((w) => w.includes('要確認')));
  assert.ok(verify.warnings.some((w) => w.includes('Orca がエージェントを確かめずに書いた')));
  const composer = buildResult({
    operationId: OP,
    outcome: 'unknown',
    detail: { code: 'agent_prompt_blocked', warning: 'composer_may_hold_text' },
  });
  assert.ok(composer.warnings.some((w) => w.includes('入力欄に残っている')));
  const permission = buildResult({
    operationId: OP,
    outcome: 'input_accepted',
    detail: { stages: ['input_accepted'], provider: 'claude', warning: 'permission_after_submit' },
  });
  assert.ok(permission.warnings.some((w) => w.includes('権限の確認')));
  const mismatch = buildResult({ operationId: OP, outcome: 'unknown', detail: { warning: 'agent_mismatch' } });
  assert.ok(mismatch.warnings.some((w) => w.includes('別のエージェント')));
  const record = buildResult({
    operationId: OP,
    outcome: 'submitted',
    detail: {},
    recordWarning: 'after_record_failed',
  });
  assert.ok(record.warnings.some((w) => w.includes('記録')));
  assert.equal(WARNING_LABELS.agent_not_verified.startsWith('要確認'), true);

  const refused = buildResult({ operationId: OP, outcome: 'refused', detail: { refusedReason: 'permission' } });
  assert.match(refused.description, /送っていません/);
  assert.match(refused.description, /権限/);
});

test('確定の 409 と守りの拒みは理由を示し、本文を残して書く欄に戻る', () => {
  for (const [error, reason, pattern] of [
    ['target_changed', 'session_changed', /セッションが変わりました/],
    ['target_changed', 'text_changed', /本文/],
    ['not_sendable', 'permission', /権限の確認/],
    ['ticket_invalid', 'expired', /60 秒/],
    ['ticket_invalid', 'unknown', /票/],
    ['busy', undefined, /ほかの送信/],
  ] as const) {
    const back = reduceSend(sending('残る本文'), {
      type: 'confirmed',
      status: 409,
      body: { ok: false, error, ...(reason ? { reason } : {}) },
    });
    assert.equal(back.phase, 'compose', `${error}:${reason}`);
    assert.equal(back.text, '残る本文');
    assert.match(buildSendView(back).message?.text ?? '', pattern);
  }
  const off = reduceSend(sending('残る本文'), {
    type: 'confirmed',
    status: 403,
    body: { ok: false, error: 'send_disabled' },
  });
  assert.equal(off.phase, 'disabled');
  assert.equal(off.text, '残る本文');
  const guard = reduceSend(sending('残る本文'), {
    type: 'confirmed',
    status: 401,
    body: { ok: false, error: 'token_invalid' },
  });
  assert.equal(guard.phase, 'compose');
  assert.equal(guard.text, '残る本文');
});

test('確定の応答を受けられなければ、意図の操作の ID で結果不明を示し、送り直さない', () => {
  for (const event of [
    { type: 'confirm-failed' },
    { type: 'confirmed', status: 200, body: {} },
    { type: 'confirmed', status: 500, body: { ok: false, error: 'internal_error' } },
    { type: 'confirmed', status: 502, body: {} },
    { type: 'confirmed', status: 200, body: { operationId: OP, outcome: 'delivered', detail: {} } },
  ]) {
    const state = reduceSend(sending('失った本文'), event as never);
    assert.equal(state.phase, 'result', JSON.stringify(event));
    assert.equal(state.result?.outcome, 'unknown');
    assert.equal(state.result?.operationId, OP);
    const view = buildSendView(state);
    assert.equal(view.result?.label, '結果不明');
    assert.match(view.result?.description ?? '', /送り直しません/);
    assert.deepEqual(
      view.actions.map((a) => a.action),
      ['query', 'back'],
    );
    // 結果の画面で「送る」の出来事が来ても送信に戻らない。
    assert.equal(reduceSend(state, { type: 'confirm', now: T0 + 2_000 }), state);
  }
});

test('結果不明の照会：not_sent、in_progress、recorded、照会の失敗', () => {
  const unknown = reduceSend(sending('照会の本文'), { type: 'confirm-failed' });
  const querying = reduceSend(unknown, { type: 'query' });
  assert.equal(querying.phase, 'checking');
  assert.equal(reduceSend(querying, { type: 'query' }), querying, '照会の間の2回目の押しを捨てる');
  assert.equal(reduceSend(querying, { type: 'back' }), querying);
  assert.ok(buildSendView(querying).actions.every((a) => a.disabled));

  const notSent = reduceSend(querying, {
    type: 'queried',
    status: 200,
    body: { operationId: OP, state: 'not_sent' },
  });
  assert.equal(notSent.phase, 'result');
  const nsView = buildSendView(notSent);
  assert.match(nsView.result?.label ?? '', /送っていません（後から届いても送りません）/);
  assert.deepEqual(
    nsView.actions.map((a) => a.action),
    ['back'],
  );
  const back = reduceSend(notSent, { type: 'back' });
  assert.equal(back.phase, 'compose');
  assert.equal(back.text, '照会の本文');

  const progress = reduceSend(querying, {
    type: 'queried',
    status: 200,
    body: { operationId: OP, state: 'in_progress' },
  });
  assert.equal(progress.phase, 'result');
  assert.equal(progress.result?.outcome, 'unknown');
  const pView = buildSendView(progress);
  assert.match(pView.message?.text ?? '', /送っている途中です。少し待ってもう一度確かめてください/);
  assert.ok(pView.actions.some((a) => a.action === 'query' && !a.disabled));

  const recorded = reduceSend(querying, {
    type: 'queried',
    status: 200,
    body: {
      operationId: OP,
      state: 'recorded',
      record: { operationId: OP, outcome: 'submitted', detail: { stages: ['turn_started'] }, before: { text: 'x' } },
    },
  });
  assert.equal(recorded.result?.outcome, 'submitted');
  assert.equal(buildSendView(recorded).result?.label, '送信を確かめた');

  const still = reduceSend(querying, {
    type: 'queried',
    status: 200,
    body: {
      operationId: OP,
      state: 'recorded',
      record: { operationId: OP, outcome: 'unknown', detail: { code: 'orca_not_recorded' } },
      checkError: 'unreachable',
    },
  });
  assert.equal(still.result?.outcome, 'unknown');
  assert.match(buildSendView(still).message?.text ?? '', /Orca につながりません/);

  const failed = reduceSend(querying, { type: 'query-failed' });
  assert.equal(failed.phase, 'result');
  assert.equal(failed.result?.outcome, 'unknown');
  assert.match(buildSendView(failed).message?.text ?? '', /orca-web につながりません/);
});

test('結果から書く欄に戻ると、届いた送信は本文を消し、届いていない送信は本文を残す', () => {
  assert.equal(reduceSend(resultOf('submitted'), { type: 'back' }).text, '');
  assert.equal(reduceSend(resultOf('accepted'), { type: 'back' }).text, '');
  assert.equal(reduceSend(resultOf('input_accepted'), { type: 'back' }).text, '');
  assert.equal(reduceSend(resultOf('refused'), { type: 'back' }).text, 'こんにちは');
  assert.equal(reduceSend(resultOf('unknown'), { type: 'back' }).text, 'こんにちは');
});

test('誤りの code の言葉は知らない code でも code を示す', () => {
  assert.match(describeError('target_changed', 'tab_changed'), /タブ/);
  assert.match(describeError('mystery', undefined), /mystery/);
  assert.match(describeError('not_sendable', 'mystery_reason'), /mystery_reason/);
});

/** 偽の時計と時間切れ。fire で時刻を進め、期限の来たものを呼ぶ。 */
function fakeTimers(start: number) {
  let now = start;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id: unknown) => {
      timers.delete(id as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    },
    pending: () => timers.size,
  };
}

const tick = () => new Promise((r) => setImmediate(r));

function flowWith(
  writerAnswer: (path: string, body: Record<string, unknown>) => Promise<{ status: number; body: unknown }>,
) {
  const timers = fakeTimers(T0);
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  let readAnswer: (url: string) => Promise<{ status: number; body: unknown }> = async () => ({
    status: 200,
    body: { enabled: true, available: true, route: 'terminal', reason: null },
  });
  const states: State[] = [];
  const flow = createSendFlow({
    agentId: 'agent/1',
    writer: {
      send: (path: string, _method: string, body: unknown) => {
        writes.push({ path, body: body as Record<string, unknown> });
        return writerAnswer(path, body as Record<string, unknown>);
      },
    },
    read: (url: string) => {
      reads.push(url);
      return readAnswer(url);
    },
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onChange: (s: State) => states.push(s),
    confirmTimeoutMs: 60_000,
    intentTimeoutMs: 30_000,
  });
  return {
    flow,
    timers,
    writes,
    reads,
    states,
    setRead(fn: typeof readAnswer) {
      readAnswer = fn;
    },
  };
}

test('流れ：「確かめる」と「送る」を2回ずつ押しても、意図と確定の要求は1回ずつだけ送られる', async () => {
  const h = flowWith(async (path, body) =>
    path === '/api/send/intent'
      ? { status: 200, body: intentBody(String(body.text)) }
      : { status: 200, body: { operationId: OP, outcome: 'submitted', detail: { stages: ['turn_started'] } } },
  );
  await h.flow.refreshStatus();
  assert.equal(h.reads[0], '/api/send/status?agent=agent%2F1');
  h.flow.input('二度押し');
  const a = h.flow.submit();
  const b = h.flow.submit();
  await Promise.all([a, b]);
  assert.equal(h.flow.getState().phase, 'confirm');
  const c = h.flow.confirm();
  const d = h.flow.confirm();
  await Promise.all([c, d]);
  assert.deepEqual(
    h.writes.map((w) => w.path),
    ['/api/send/intent', '/api/send/confirm'],
  );
  assert.deepEqual(h.writes[0]?.body, { agent: 'agent/1', text: '二度押し' });
  assert.deepEqual(h.writes[1]?.body, { ticket: 'tk-1', text: '二度押し' });
  assert.equal(h.flow.getState().result?.outcome, 'submitted');
  assert.equal(h.timers.pending(), 0, '期限と時間切れの時計を残さない');
});

test('流れ：確定が時間切れなら、送り直さず、意図の操作の ID で照会し、in_progress でも自動で繰り返さない', async () => {
  const h = flowWith((path, body) =>
    path === '/api/send/intent'
      ? Promise.resolve({ status: 200, body: intentBody(String(body.text)) })
      : new Promise(() => {}),
  );
  await h.flow.refreshStatus();
  h.flow.input('時間切れ');
  await h.flow.submit();
  const pending = h.flow.confirm();
  await tick();
  assert.equal(h.flow.getState().phase, 'sending');
  h.timers.advance(60_000);
  await pending;
  const state = h.flow.getState();
  assert.equal(state.phase, 'result');
  assert.equal(state.result?.outcome, 'unknown');
  assert.equal(state.result?.operationId, OP);
  assert.equal(h.writes.filter((w) => w.path === '/api/send/confirm').length, 1);

  h.setRead(async () => ({ status: 200, body: { operationId: OP, state: 'in_progress' } }));
  await h.flow.query();
  assert.deepEqual(h.reads.slice(1), [`/api/send/${OP}?check=1`]);
  assert.equal(h.flow.getState().phase, 'result');
  h.timers.advance(600_000);
  await tick();
  assert.equal(h.reads.length, 2, '照会を自動で繰り返さない');
  assert.equal(h.writes.filter((w) => w.path === '/api/send/confirm').length, 1, '送り直さない');
});

test('流れ：確認の期限が来たら本文を残して書く欄に戻り、確定を送らない', async () => {
  const h = flowWith(async (path, body) =>
    path === '/api/send/intent'
      ? { status: 200, body: intentBody(String(body.text)) }
      : { status: 200, body: { operationId: OP, outcome: 'submitted', detail: {} } },
  );
  await h.flow.refreshStatus();
  h.flow.input('期限');
  await h.flow.submit();
  assert.equal(h.flow.getState().phase, 'confirm');
  h.timers.advance(60_000);
  assert.equal(h.flow.getState().phase, 'compose');
  assert.equal(h.flow.getState().text, '期限');
  await h.flow.confirm();
  assert.equal(h.writes.filter((w) => w.path === '/api/send/confirm').length, 0);
});

test('流れ：書き込みの送り手が投げたら、確定は結果不明、意図は書く欄に戻る', async () => {
  let failConfirm = false;
  const h = flowWith(async (path, body) => {
    if (path === '/api/send/intent') {
      if (!failConfirm) return { status: 200, body: intentBody(String(body.text)) };
      throw new Error('network');
    }
    throw new Error('network');
  });
  await h.flow.refreshStatus();
  h.flow.input('投げる');
  await h.flow.submit();
  await h.flow.confirm();
  assert.equal(h.flow.getState().result?.outcome, 'unknown');
  assert.equal(h.flow.getState().result?.operationId, OP);
  h.flow.back();
  failConfirm = true;
  await h.flow.submit();
  assert.equal(h.flow.getState().phase, 'compose');
  assert.equal(h.flow.getState().text, '投げる');
});

test('流れ：status は書く欄と止まった間だけ読み、確認の間は読まない', async () => {
  const h = flowWith(async (_path, body) => ({ status: 200, body: intentBody(String(body.text)) }));
  await h.flow.refreshStatus();
  h.flow.input('読む');
  await h.flow.submit();
  await h.flow.refreshStatus();
  assert.equal(h.reads.length, 1);
  h.setRead(async () => {
    throw new Error('down');
  });
  h.flow.cancel();
  await h.flow.refreshStatus();
  assert.equal(h.flow.getState().phase, 'disabled');
  assert.equal(h.flow.getState().text, '読む');
});
