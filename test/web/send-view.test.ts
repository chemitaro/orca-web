import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSendView,
  composerKeyAction,
  createSendFlow,
  describeError,
  initialSend,
  reduceSend,
  WARNING_LABELS,
} from '../../web/embed/send-view.js';

type State = ReturnType<typeof initialSend>;

const FP_A = 'a'.repeat(32);
const FP_B = 'b'.repeat(32);
const OP = '1763000000000-0123456789abcdef0123456789abcdef';

const run = (state: State, ...events: Record<string, unknown>[]): State =>
  events.reduce<State>((s, e) => reduceSend(s, e as never), state);
const statusOk = (target = FP_A, agentType = 'claude') => ({
  type: 'status',
  status: 200,
  body: { enabled: true, available: true, route: 'terminal', reason: null, target, agentType },
});
const statusNo = (reason: string) => ({
  type: 'status',
  status: 200,
  body: { enabled: true, available: false, route: null, reason, target: null, agentType: null },
});
const compose = (text = 'こんにちは', target = FP_A): State =>
  run(initialSend(), statusOk(target), { type: 'input', text });

const key = (patch: Record<string, unknown> = {}) => ({
  key: 'Enter',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  isComposing: false,
  keyCode: 13,
  repeat: false,
  ...patch,
});
const desk = { touchPrimary: false };
const touch = { touchPrimary: true };

test('T-08：composerKeyAction は Enter で送り、Shift・Alt の Enter と変換中と押し続けとほかの鍵では何もしない', () => {
  assert.equal(composerKeyAction(key(), desk), 'send');
  assert.equal(composerKeyAction(key({ shiftKey: true }), desk), null);
  assert.equal(composerKeyAction(key({ altKey: true }), desk), null);
  assert.equal(composerKeyAction(key({ metaKey: true }), desk), 'send');
  assert.equal(composerKeyAction(key({ ctrlKey: true }), desk), 'send');
  assert.equal(composerKeyAction(key({ metaKey: true, shiftKey: true }), desk), null);
  assert.equal(composerKeyAction(key({ ctrlKey: true, altKey: true }), desk), null);
  assert.equal(composerKeyAction(key({ isComposing: true }), desk), null);
  assert.equal(composerKeyAction(key({ keyCode: 229 }), desk), null);
  assert.equal(composerKeyAction(key({ metaKey: true, isComposing: true }), desk), null);
  assert.equal(composerKeyAction(key({ repeat: true }), desk), null);
  assert.equal(composerKeyAction(key({ key: 'a', keyCode: 65 }), desk), null);
  assert.equal(composerKeyAction(key({ key: 'Process', keyCode: 229 }), desk), null);
});

test('T-08：タッチが主の端末では Enter は改行で、Cmd/Ctrl+Enter だけが送る', () => {
  assert.equal(composerKeyAction(key(), touch), null);
  assert.equal(composerKeyAction(key({ shiftKey: true }), touch), null);
  assert.equal(composerKeyAction(key({ metaKey: true }), touch), 'send');
  assert.equal(composerKeyAction(key({ ctrlKey: true }), touch), 'send');
  assert.equal(composerKeyAction(key({ ctrlKey: true, keyCode: 229 }), touch), null);
});

test('T-09：最初に送れると分かった指紋を固定し、同じ指紋なら compose、送れなければ固定を消さずに disabled', () => {
  const start = initialSend();
  assert.equal(start.phase, 'disabled');
  assert.equal(start.target, null);
  const ok = reduceSend(start, statusOk());
  assert.equal(ok.phase, 'compose');
  assert.equal(ok.target, FP_A);
  assert.equal(ok.agentType, 'claude');
  assert.equal(reduceSend(ok, statusOk()), ok, '同じ指紋の読み直しは同じ物');

  const off = run(ok, { type: 'input', text: '残す' }, statusNo('permission'));
  assert.equal(off.phase, 'disabled');
  assert.equal(off.reason, 'permission');
  assert.equal(off.target, FP_A, '固定した指紋は消さない');
  assert.equal(off.text, '残す');
  const back = reduceSend(off, statusOk());
  assert.equal(back.phase, 'compose');
  assert.equal(back.text, '残す');

  const disabled = reduceSend(ok, {
    type: 'status',
    status: 200,
    body: { enabled: false, available: true, route: 'terminal', reason: null, target: FP_A, agentType: 'claude' },
  });
  assert.equal(disabled.phase, 'disabled');
  assert.equal(disabled.reason, 'send_disabled');
  assert.equal(reduceSend(ok, { type: 'status-failed' }).reason, 'status_unavailable');
  assert.equal(
    reduceSend(start, { type: 'status', status: 200, body: { enabled: true, available: true } }).phase,
    'disabled',
    '指紋のない応答では送れない',
  );
});

test('T-09：compose の間に別の指紋が来ると target を上書きせずに changed になり、submit を捨て、adopt で新しい指紋を固定する', () => {
  const before = compose('書きかけ');
  const changed = reduceSend(before, statusOk(FP_B, 'codex'));
  assert.equal(changed.phase, 'changed');
  assert.equal(changed.target, FP_A, '上書きしない');
  assert.equal(changed.pendingTarget, FP_B);
  assert.equal(changed.text, '書きかけ');
  assert.equal(reduceSend(changed, { type: 'submit' }), changed, 'changed の間の submit は捨てる');
  const typed = reduceSend(changed, { type: 'input', text: '書き足し' });
  assert.equal(typed.text, '書き足し', 'changed の間も書ける');

  const adopted = reduceSend(typed, { type: 'adopt' });
  assert.equal(adopted.phase, 'compose');
  assert.equal(adopted.target, FP_B);
  assert.equal(adopted.pendingTarget, null);
  assert.equal(adopted.agentType, 'codex');
  assert.equal(adopted.text, '書き足し');

  const same = reduceSend(changed, statusOk(FP_A));
  assert.equal(same.phase, 'compose', '固定と同じ指紋に戻れば compose');
  assert.equal(same.pendingTarget, null);
  assert.equal(reduceSend(compose(), { type: 'adopt' }).phase, 'compose');
  const noPending = { ...changed, pendingTarget: null };
  assert.equal(reduceSend(noPending, { type: 'adopt' }), noPending, '新しい指紋がなければ adopt は効かない');
});

/** 偽の時計。advance で時刻を進め、期限の来たものを呼ぶ。 */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
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
type Answer = { status: number; body: unknown };
const intentOk = (text: string) => ({
  status: 200,
  body: { ticket: 'tk-1', expiresAt: 1, operationId: OP, preview: {}, text, digest: 'd' },
});
const confirmOk = (outcome = 'submitted', extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: { operationId: OP, outcome, detail: {}, ...extra },
});

function flowWith(writerAnswer: (path: string, body: Record<string, unknown>) => Promise<Answer>) {
  const timers = fakeTimers();
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  let readAnswer: (url: string) => Promise<Answer> = async () => statusOk();
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
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    intentTimeoutMs: 30_000,
    confirmTimeoutMs: 60_000,
  });
  return {
    flow,
    timers,
    writes,
    reads,
    statusReads: () => reads.filter((u) => u.startsWith('/api/send/status')).length,
    setRead(fn: typeof readAnswer) {
      readAnswer = fn;
    },
  };
}

test('T-09：1回の submit で意図と確定を1回ずつ送り、意図に固定した target を添え、sending の間の submit を捨て、届いたら本文を空にする', async () => {
  const h = flowWith(async (path, body) =>
    path === '/api/send/intent'
      ? intentOk(String(body.text))
      : confirmOk('submitted', { detail: { warning: 'agent_not_verified' } }),
  );
  await h.flow.refreshStatus();
  assert.equal(h.reads[0], '/api/send/status?agent=agent%2F1');
  h.flow.input('一度だけ');
  const a = h.flow.submit();
  assert.equal(h.flow.getState().phase, 'sending');
  const b = h.flow.submit();
  h.flow.input('割り込み');
  await Promise.all([a, b]);
  assert.deepEqual(
    h.writes.map((w) => w.path),
    ['/api/send/intent', '/api/send/confirm'],
  );
  assert.deepEqual(h.writes[0]?.body, { agent: 'agent/1', text: '一度だけ', target: FP_A });
  assert.deepEqual(h.writes[1]?.body, { ticket: 'tk-1', text: '一度だけ' });
  const done = h.flow.getState();
  assert.equal(done.phase, 'compose');
  assert.equal(done.text, '');
  const view = buildSendView(done);
  assert.equal(view.message?.kind, 'info');
  assert.match(view.message?.text ?? '', /^送りました/);
  assert.deepEqual(view.warnings, [WARNING_LABELS.agent_not_verified]);
  assert.equal(h.timers.pending(), 0, '時間切れの時計を残さない');
});

test('T-09：recordWarning と知らない warning も1つ1行の言葉になる', () => {
  const s = run(
    compose('w'),
    { type: 'submit' },
    { type: 'intent', ...intentOk('w') },
    {
      type: 'confirmed',
      ...confirmOk('accepted', { detail: { warning: 'mystery_warning' }, recordWarning: 'after_record_failed' }),
    },
  );
  assert.deepEqual(buildSendView(s).warnings, ['注意：mystery_warning', WARNING_LABELS.after_record_failed]);
});

test('T-09：送る前の拒みと refused は本文を残して1行の理由を出し、どの送る前の拒みの後も status を1回読み直す', async () => {
  const cases: [string, Answer, Answer | null, string, RegExp][] = [
    [
      '意図の not_sendable',
      { status: 409, body: { ok: false, error: 'not_sendable', reason: 'foreground_mismatch' } },
      null,
      'compose',
      /端末の前面が、このエージェントではありません/,
    ],
    ['意図の busy', { status: 409, body: { ok: false, error: 'busy' } }, null, 'compose', /ほかの送信を処理しています/],
    [
      '意図の守りの拒み',
      { status: 401, body: { ok: false, error: 'token_invalid' } },
      null,
      'compose',
      /token_invalid/,
    ],
    [
      '確定の target_changed',
      intentOk('本文'),
      { status: 409, body: { ok: false, error: 'target_changed', reason: 'session_changed' } },
      'compose',
      /宛先が変わったので送りませんでした：セッションが変わりました。会話を確かめてから、もう一度送ってください/,
    ],
    [
      '確定の ticket_invalid',
      intentOk('本文'),
      { status: 409, body: { ok: false, error: 'ticket_invalid', reason: 'expired' } },
      'compose',
      /送れませんでした/,
    ],
  ];
  for (const [name, intent, confirm, phase, pattern] of cases) {
    const h = flowWith(async (path) => (path === '/api/send/intent' ? intent : (confirm as Answer)));
    await h.flow.refreshStatus();
    h.flow.input('本文');
    await h.flow.submit();
    const s = h.flow.getState();
    assert.equal(s.phase, phase, name);
    assert.equal(s.text, '本文', `${name}：本文を残す`);
    const text = buildSendView(s).message?.text ?? '';
    assert.match(text, pattern, name);
    assert.doesNotMatch(text, /確かめる|確認の画面/, `${name}：なくした操作を促さない`);
    assert.equal(h.statusReads(), 2, `${name}：status を1回読み直す`);
    assert.equal(h.writes.length, confirm ? 2 : 1, name);
  }

  const refused = flowWith(async (path) =>
    path === '/api/send/intent' ? intentOk('本文') : confirmOk('refused', { detail: { refusedReason: 'permission' } }),
  );
  await refused.flow.refreshStatus();
  refused.flow.input('本文');
  await refused.flow.submit();
  assert.equal(refused.flow.getState().phase, 'compose');
  assert.equal(refused.flow.getState().text, '本文');
  assert.match(
    buildSendView(refused.flow.getState()).message?.text ?? '',
    /送っていません：エージェントが権限の確認を待っています/,
  );
});

test('T-09：send_disabled は disabled、意図の changed_since_shown は changed になり、読み直しの新しい指紋で「新しい宛先で続ける」が出る', async () => {
  const off = flowWith(async () => ({ status: 403, body: { ok: false, error: 'send_disabled' } }));
  await off.flow.refreshStatus();
  off.flow.input('止まる');
  off.setRead(async () => ({
    status: 200,
    body: { enabled: false, available: true, route: 'terminal', reason: null, target: FP_A, agentType: 'claude' },
  }));
  await off.flow.submit();
  assert.equal(off.flow.getState().phase, 'disabled');
  assert.equal(off.flow.getState().reason, 'send_disabled');
  assert.equal(off.flow.getState().text, '止まる');
  assert.equal(off.statusReads(), 2);

  const moved = flowWith(async () => ({
    status: 409,
    body: { ok: false, error: 'target_changed', reason: 'changed_since_shown' },
  }));
  await moved.flow.refreshStatus();
  moved.flow.input('別の宛先');
  moved.setRead(async () => statusOk(FP_B));
  await moved.flow.submit();
  const s = moved.flow.getState();
  assert.equal(s.phase, 'changed');
  assert.equal(s.target, FP_A);
  assert.equal(s.pendingTarget, FP_B);
  assert.equal(s.text, '別の宛先');
  assert.deepEqual(buildSendView(s).changed, {
    text: '宛先が変わりました（別のセッションか端末になりました）。会話を確かめてから続けてください',
    adopt: true,
  });
  await moved.flow.submit();
  assert.equal(moved.writes.length, 1, 'changed の間は送らない');
  moved.flow.adopt();
  moved.setRead(async () => ({ status: 409, body: { ok: false, error: 'busy' } }));
  await moved.flow.submit();
  assert.deepEqual(moved.writes[1]?.body, { agent: 'agent/1', text: '別の宛先', target: FP_B }, '新しい指紋を添える');

  const beforeReread = reduceSend(compose('x'), { type: 'submit' });
  const changedNoPending = reduceSend(beforeReread, {
    type: 'intent',
    status: 409,
    body: { ok: false, error: 'target_changed', reason: 'changed_since_shown' },
  });
  assert.equal(changedNoPending.phase, 'changed');
  assert.deepEqual(
    buildSendView(changedNoPending).changed?.adopt,
    false,
    '読み直しの前は「新しい宛先で続ける」を出さない',
  );
});

test('T-09：意図の応答を受けられない・形が違うときは compose に戻り、確定を送らない', async () => {
  let answer: () => Promise<Answer> = () => Promise.reject(new Error('network'));
  const h = flowWith(() => answer());
  await h.flow.refreshStatus();
  h.flow.input('落ちる');
  await h.flow.submit();
  assert.equal(h.flow.getState().phase, 'compose');
  assert.equal(h.flow.getState().text, '落ちる');
  answer = async () => ({ status: 200, body: { ticket: 'tk', operationId: OP, text: '別の本文' } });
  await h.flow.submit();
  assert.equal(h.flow.getState().phase, 'compose');
  answer = () => new Promise(() => {});
  const pending = h.flow.submit();
  await tick();
  h.timers.advance(30_000);
  await pending;
  assert.equal(h.flow.getState().phase, 'compose');
  assert.deepEqual(
    h.writes.map((w) => w.path),
    ['/api/send/intent', '/api/send/intent', '/api/send/intent'],
  );
});

test('T-10：確定の応答を失うと unknown の帯になり、submit と input を捨て、「確かめる」は意図の操作の ID で1回だけ照会する', async () => {
  const h = flowWith((path, body) =>
    path === '/api/send/intent' ? Promise.resolve(intentOk(String(body.text))) : new Promise(() => {}),
  );
  await h.flow.refreshStatus();
  h.flow.input('不明');
  const pending = h.flow.submit();
  await tick();
  h.timers.advance(60_000);
  await pending;
  const s = h.flow.getState();
  assert.equal(s.phase, 'unknown');
  assert.equal(s.operationId, OP);
  assert.equal(s.text, '不明');
  const view = buildSendView(s);
  assert.deepEqual(view.unknown, { text: '届いたか分かりません。自動では送り直しません。', busy: false });
  assert.equal(view.button.disabled, true);
  assert.equal(view.editor.disabled, true);
  assert.equal(reduceSend(s, { type: 'submit' }), s);
  assert.equal(reduceSend(s, { type: 'input', text: '変える' }), s);
  assert.equal(reduceSend(s, statusOk(FP_B)), s, '帯の間は status を受けない');
  await h.flow.submit();
  await h.flow.refreshStatus();
  assert.equal(h.statusReads(), 1, '帯の間は status を読まない');

  h.setRead(async () => ({ status: 200, body: { operationId: OP, state: 'in_progress' } }));
  await h.flow.query();
  assert.deepEqual(h.reads.slice(1), [`/api/send/${OP}?check=1`]);
  assert.equal(h.flow.getState().phase, 'unknown');
  h.timers.advance(600_000);
  await tick();
  assert.equal(h.reads.length, 2, '照会を自動で繰り返さない');
  assert.equal(h.writes.length, 2, '送り直さない');
});

test('T-10：照会が届いたと示せば本文を空に、送っていないと示せば本文を残して compose に、読めなければ帯に戻る', () => {
  const unknown = run(
    compose('照会'),
    { type: 'submit' },
    { type: 'intent', ...intentOk('照会') },
    { type: 'confirm-failed' },
  );
  assert.equal(unknown.phase, 'unknown');
  const checking = reduceSend(unknown, { type: 'query' });
  assert.equal(checking.phase, 'checking');
  assert.equal(buildSendView(checking).unknown?.busy, true);
  assert.equal(reduceSend(checking, { type: 'query' }), checking, '照会の間の2回目は捨てる');
  assert.equal(reduceSend(checking, { type: 'dismiss' }), checking);

  const recorded = (outcome: string, extra: Record<string, unknown> = {}) =>
    reduceSend(checking, {
      type: 'queried',
      status: 200,
      body: { operationId: OP, state: 'recorded', record: { outcome, detail: {} }, ...extra },
    });
  const delivered = recorded('input_accepted');
  assert.equal(delivered.phase, 'compose');
  assert.equal(delivered.text, '');
  assert.match(buildSendView(delivered).message?.text ?? '', /届いていました/);

  const warned = recorded('submitted', { checkWarning: 'check_record_failed' });
  assert.deepEqual(buildSendView(warned).warnings, [WARNING_LABELS.check_record_failed]);

  for (const notSent of [
    recorded('refused'),
    reduceSend(checking, { type: 'queried', status: 200, body: { operationId: OP, state: 'not_sent' } }),
  ]) {
    assert.equal(notSent.phase, 'compose');
    assert.equal(notSent.text, '照会');
    assert.match(buildSendView(notSent).message?.text ?? '', /送っていません/);
  }

  const stillUnknown = reduceSend(checking, {
    type: 'queried',
    status: 200,
    body: { operationId: OP, state: 'recorded', record: { outcome: 'unknown', detail: { code: 'card_gone' } } },
  });
  assert.equal(stillUnknown.phase, 'unknown');
  assert.match(buildSendView(stillUnknown).message?.text ?? '', /カードが消えました/);
  const unreadable = reduceSend(checking, {
    type: 'queried',
    status: 503,
    body: { ok: false, error: 'record_unreadable' },
  });
  assert.equal(unreadable.phase, 'unknown');
  assert.match(buildSendView(unreadable).message?.text ?? '', /送信の記録を読めません/);
  assert.equal(reduceSend(checking, { type: 'query-failed' }).phase, 'unknown');
  const unreachable = recorded('unknown', { checkError: 'unreachable' });
  assert.equal(unreachable.phase, 'unknown');
  assert.equal(unreachable.text, '照会');

  const closed = reduceSend(unknown, { type: 'dismiss' });
  assert.equal(closed.phase, 'compose');
  assert.equal(closed.text, '照会', '「閉じる」は本文を残す');
  assert.equal(closed.operationId, undefined);
});

test('T-10：確定が unknown を返すか、読めない形なら帯になる', () => {
  const sent = run(compose('u'), { type: 'submit' }, { type: 'intent', ...intentOk('u') });
  assert.equal(reduceSend(sent, { type: 'confirmed', ...confirmOk('unknown') }).phase, 'unknown');
  assert.equal(reduceSend(sent, { type: 'confirmed', status: 200, body: { outcome: 'mystery' } }).phase, 'unknown');
  assert.equal(
    reduceSend(sent, { type: 'confirmed', status: 500, body: { ok: false, error: 'internal' } }).phase,
    'unknown',
  );
});

test('T-11：buildSendView は確認の画面・期限・送る前の「確かめる」を作らず、送るボタンは compose で本文があるときだけ押せる', () => {
  const empty = buildSendView(compose(''));
  assert.equal(empty.button.disabled, true);
  assert.equal(buildSendView(compose('   \n')).button.disabled, true);
  const ready = buildSendView(compose('本文'));
  assert.equal(ready.button.disabled, false);
  assert.equal(ready.editor.disabled, false);
  for (const view of [empty, ready, buildSendView(initialSend())]) {
    const keys = Object.keys(view);
    assert.ok(!keys.includes('confirm') && !keys.includes('result') && !keys.includes('actions'), keys.join(','));
    assert.doesNotMatch(JSON.stringify(view), /期限|60 秒|確かめる/);
  }
  const sending = buildSendView(reduceSend(compose('本文'), { type: 'submit' }));
  assert.equal(sending.button.disabled, true);
  assert.equal(sending.button.busy, true);
  assert.equal(sending.editor.disabled, true);
  assert.equal(sending.message?.text, '送っています…');
});

test('T-11：disabled の理由（foreground_mismatch を含む）を言葉で出し、入力欄を止める', () => {
  const loading = buildSendView(initialSend());
  assert.equal(loading.editor.disabled, true);
  assert.equal(loading.message?.kind, 'info');
  const fg = buildSendView(reduceSend(compose('x'), statusNo('foreground_mismatch')));
  assert.equal(fg.message?.text, '端末の前面が、このエージェントではありません');
  assert.equal(fg.message?.kind, 'error');
  assert.equal(fg.editor.disabled, true);
  assert.equal(fg.button.disabled, true);
  assert.equal(fg.chatHead, '会話（読むだけ）');
  assert.match(
    buildSendView(reduceSend(compose('x'), statusNo('mystery_reason'))).message?.text ?? '',
    /mystery_reason/,
  );
});

test('T-11：changed は知らせと「新しい宛先で続ける」を作り、送るボタンを止める', () => {
  const view = buildSendView(reduceSend(compose('書いた'), statusOk(FP_B)));
  assert.equal(view.phase, 'changed');
  assert.equal(view.button.disabled, true);
  assert.equal(view.editor.disabled, false);
  assert.equal(view.changed?.adopt, true);
  assert.equal(view.message, null);
});

test('T-11：placeholder は端末の種類と agentType で作り、理由を書かない', () => {
  assert.equal(
    buildSendView(compose('', FP_A)).editor.placeholder,
    'Claude に送る（Enter で送信、Shift+Enter で改行）',
  );
  assert.equal(buildSendView(compose('', FP_A), { touchPrimary: true }).editor.placeholder, 'Claude に送る');
  const codex = reduceSend(initialSend(), statusOk(FP_A, 'codex'));
  assert.equal(buildSendView(codex).editor.placeholder, 'Codex に送る（Enter で送信、Shift+Enter で改行）');
  const other = reduceSend(initialSend(), statusOk(FP_A, 'gemini'));
  assert.equal(buildSendView(other, { touchPrimary: true }).editor.placeholder, 'gemini に送る');
  assert.equal(
    buildSendView(initialSend()).editor.placeholder,
    'エージェントに送る（Enter で送信、Shift+Enter で改行）',
  );
  assert.equal(
    buildSendView(reduceSend(initialSend(), statusNo('permission')), { touchPrimary: true }).editor.placeholder,
    'エージェントに送る',
  );
});

test('describeError は知らない code でも code を示し、なくした操作を促さない', () => {
  assert.match(describeError('mystery', undefined), /mystery/);
  assert.match(describeError('not_sendable', 'mystery_reason'), /mystery_reason/);
  for (const code of [
    'target_changed',
    'ticket_invalid',
    'not_sendable',
    'invalid_text',
    'token_expired',
    'record_failed',
  ]) {
    assert.doesNotMatch(describeError(code, 'expired'), /確かめる|確かめ直|確認の画面/, code);
  }
});
