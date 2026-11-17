// 質問のカードの組み立て（web/embed/question-view.js）を確かめる（T-11、T-12、T-13）。DOM に触らない純な関数と、注入した口だけの流れ。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  answererFor,
  buildAnswers,
  buildQuestionCard,
  createChatAnswerer,
  createQuestionBoard,
  initialFlow,
  initialSelection,
  QUESTION_REASONS,
  reduceFlow,
  setOther,
  TERMINAL_REASON,
  terminalAnswerer,
  toggleOption,
  toggleOther,
} from '../../web/embed/question-view.js';

// biome-ignore lint/suspicious/noExplicitAny: the parts and views are untyped JS objects
type Any = any;

const option = (id: string, label = `ラベル${id}`, description: string | null = null) => ({ id, label, description });
const question = (over: Record<string, unknown> = {}) => ({
  id: 'q1',
  header: null,
  question: 'どれにしますか',
  multiSelect: false,
  options: [option('a', 'A案', 'A の説明'), option('b', 'B案')],
  allowOther: false,
  otherAllowsEmpty: false,
  ...over,
});
const chatPart = (questions: Any[] = [question()], over: Record<string, unknown> = {}): Any => ({
  type: 'question',
  source: 'chat',
  prompt: { itemId: 'item-1', revision: 3 },
  callId: null,
  questions,
  state: 'pending',
  answers: null,
  ...over,
});
const terminalPart = (over: Record<string, unknown> = {}): Any => ({
  ...chatPart([question({ id: '0', options: [option('0', 'はい'), option('1', 'いいえ')] })]),
  source: 'terminal',
  prompt: null,
  callId: 'call-1',
  ...over,
});
const OK = { ok: true } as const;
const STATUS_OK = { enabled: true, available: true, answer: { available: true, reason: null } };

test('T-11：単一選択は選んだ1つに入れ替え、その他を外す。その他を選ぶと選択肢を外し、もう一度で外れる', () => {
  const part = chatPart([question({ allowOther: true })]);
  let s = initialSelection(part);
  assert.deepEqual(s, [{ optionIds: [], other: null }]);
  s = toggleOption(s, part, 0, 'a');
  assert.deepEqual(s[0], { optionIds: ['a'], other: null });
  s = toggleOption(s, part, 0, 'b');
  assert.deepEqual(s[0], { optionIds: ['b'], other: null });
  s = toggleOther(s, part, 0);
  assert.deepEqual(s[0], { optionIds: [], other: '' });
  s = setOther(s, part, 0, '自由な文');
  assert.deepEqual(s[0], { optionIds: [], other: '自由な文' });
  s = toggleOption(s, part, 0, 'a');
  assert.deepEqual(s[0], { optionIds: ['a'], other: null }, '選ぶとその他の文を空にする');
  s = setOther(s, part, 0, '書くと選択を外す');
  assert.deepEqual(s[0], { optionIds: [], other: '書くと選択を外す' });
  s = toggleOther(s, part, 0);
  assert.deepEqual(s[0], { optionIds: [], other: null });
});

test('T-11：複数選択は入れ外しで、その他とも並べられる。知らない選択肢と問いの番号、allowOther のない問いのその他は変えない', () => {
  const part = chatPart([question({ multiSelect: true, allowOther: true }), question({ id: 'q2' })]);
  let s = initialSelection(part);
  s = toggleOption(s, part, 0, 'a');
  s = toggleOption(s, part, 0, 'b');
  s = toggleOther(s, part, 0);
  assert.deepEqual(s[0], { optionIds: ['a', 'b'], other: '' });
  s = toggleOption(s, part, 0, 'a');
  assert.deepEqual(s[0], { optionIds: ['b'], other: '' });
  assert.equal(toggleOption(s, part, 0, 'zz'), s);
  assert.equal(toggleOption(s, part, 5, 'a'), s);
  assert.equal(toggleOther(s, part, 1), s, 'allowOther が偽の問いはその他を選べない');
  assert.equal(setOther(s, part, 1, 'x'), s);
});

test('T-11：buildAnswers は全部の問いに答えがあり、単一はちょうど1つ、複数は1つ以上のときだけ ok で、Orca の形にする', () => {
  const part = chatPart([question({ allowOther: true }), question({ id: 'q2', multiSelect: true, allowOther: true })]);
  let s = initialSelection(part);
  assert.deepEqual(buildAnswers(part, s), { ok: false });
  s = toggleOption(s, part, 0, 'b');
  assert.deepEqual(buildAnswers(part, s), { ok: false }, '2問目がまだ');
  s = toggleOption(s, part, 1, 'a');
  s = toggleOther(s, part, 1);
  s = setOther(s, part, 1, '  ');
  assert.deepEqual(buildAnswers(part, s), {
    ok: true,
    answers: [
      { questionId: 'q1', optionIds: ['b'] },
      { questionId: 'q2', optionIds: ['a'] },
    ],
  });
  s = setOther(s, part, 1, '足す');
  assert.deepEqual(buildAnswers(part, s), {
    ok: true,
    answers: [
      { questionId: 'q1', optionIds: ['b'] },
      { questionId: 'q2', optionIds: ['a'], other: '足す' },
    ],
  });
});

test('T-11：その他だけの答えは、空白でない文か otherAllowsEmpty のときだけ数え、空を許す問いでも選んでいなければ数えない', () => {
  const strict = chatPart([question({ allowOther: true })]);
  let s = toggleOther(initialSelection(strict), strict, 0);
  assert.deepEqual(buildAnswers(strict, s), { ok: false }, '空の文は数えない');
  s = setOther(s, strict, 0, ' \n ');
  assert.deepEqual(buildAnswers(strict, s), { ok: false }, '空白だけも数えない');
  s = setOther(s, strict, 0, '自由');
  assert.deepEqual(buildAnswers(strict, s), {
    ok: true,
    answers: [{ questionId: 'q1', optionIds: [], other: '自由' }],
  });

  const empty = chatPart([question({ allowOther: true, otherAllowsEmpty: true })]);
  assert.deepEqual(buildAnswers(empty, initialSelection(empty)), { ok: false }, '選んでいなければ数えない');
  const chosen = toggleOther(initialSelection(empty), empty, 0);
  assert.deepEqual(buildAnswers(empty, chosen), {
    ok: true,
    answers: [{ questionId: 'q1', optionIds: [], other: '' }],
  });
});

test('T-11：その他の文に制御文字がある、64KiB を超える、形の違う選択は送れない（F-04）', () => {
  const part = chatPart([question({ allowOther: true })]);
  const base = toggleOther(initialSelection(part), part, 0);
  assert.deepEqual(buildAnswers(part, setOther(base, part, 0, 'a\u0007b')), { ok: false });
  assert.deepEqual(buildAnswers(part, setOther(base, part, 0, 'a\u009bb')), { ok: false });
  assert.equal(buildAnswers(part, setOther(base, part, 0, 'タブ\tと\n改行')).ok, true);
  assert.deepEqual(buildAnswers(part, setOther(base, part, 0, 'あ'.repeat(22_000))), { ok: false }, '66,000 バイト');
  assert.deepEqual(buildAnswers(part, []), { ok: false });
  assert.deepEqual(buildAnswers(part, [{ optionIds: ['zz'], other: null }]), { ok: false });
});

test('T-12：未回答のカードは見出し・問い・選択肢と説明・複数の印・その他の欄・送るボタンを持つ', () => {
  const part = chatPart([
    question({ header: '方針', allowOther: true }),
    question({ id: 'q2', question: '足すものは', multiSelect: true }),
  ]);
  let selection = initialSelection(part);
  selection = toggleOther(selection, part, 0);
  const view = buildQuestionCard(part, { key: 'm1:0', selection, flow: initialFlow(), availability: OK });
  assert.equal(view.key, 'm1:0');
  assert.equal(view.closed, false);
  assert.equal(view.state, 'pending');
  assert.equal(view.questions.length, 2);
  const [first, second] = view.questions;
  assert.equal(first.header, '方針');
  assert.equal(first.question, 'どれにしますか');
  assert.equal(first.multiSelect, false);
  assert.deepEqual(first.options[0], {
    id: 'a',
    label: 'A案',
    description: 'A の説明',
    selected: false,
    disabled: false,
  });
  assert.deepEqual(first.other, { shown: true, selected: true, value: '', disabled: false });
  assert.equal(second.multiSelect, true);
  assert.equal(second.other.shown, false);
  assert.deepEqual(view.button, { shown: true, disabled: true, busy: false, label: '答える' });
  assert.equal(view.reason, null);
  assert.equal(view.open, false);
  assert.deepEqual(view.answerSummary, []);

  selection = setOther(selection, part, 0, '自由');
  selection = toggleOption(selection, part, 1, 'b');
  const ready = buildQuestionCard(part, { key: 'm1:0', selection, flow: initialFlow(), availability: OK });
  assert.equal(ready.button.disabled, false);
  assert.equal(ready.questions[1].options[1].selected, true);
});

test('T-12：答え済みは選んだラベルとその他の文を「、」で並べた閉じた形、取り消しは「取り消されました」', () => {
  const part = chatPart([question({ multiSelect: true, allowOther: true }), question({ id: 'q2', header: '二つ目' })], {
    state: 'answered',
    answers: [
      { questionId: 'q1', optionIds: ['a', 'b'], other: '足した' },
      { questionId: 'q2', optionIds: ['b'], other: null },
    ],
  });
  const view = buildQuestionCard(part, { key: 'k', availability: OK });
  assert.equal(view.closed, true);
  assert.equal(view.state, 'answered');
  assert.deepEqual(view.answerSummary, ['A案、B案、足した', 'B案']);
  assert.equal(view.button.shown, false);
  assert.equal(view.questions[0].options[0].selected, true);
  assert.equal(view.questions[1].options[0].selected, false);
  for (const q of view.questions) for (const o of q.options) assert.equal(o.disabled, true, '開いても押せない');
  assert.equal(view.questions[0].other.value, '足した');
  assert.equal(view.questions[0].other.disabled, true);

  const cancelled = buildQuestionCard(chatPart(undefined, { state: 'cancelled' }), { key: 'k', availability: OK });
  assert.equal(cancelled.closed, true);
  assert.deepEqual(cancelled.answerSummary, ['取り消されました']);

  const unreadable = buildQuestionCard(chatPart(undefined, { state: 'answered', answers: null }), {
    key: 'k',
    availability: OK,
  });
  assert.equal(unreadable.closed, true);
  assert.deepEqual(unreadable.answerSummary, ['（答えを読めません）']);
});

test('T-12：端末の question は、結びついたツールの結果の文を答えとして閉じる', () => {
  const view = buildQuestionCard(terminalPart({ state: 'answered' }), {
    key: 'k',
    answerText: 'User answered: はい',
    availability: terminalAnswerer.availability(terminalPart(), null),
  });
  assert.equal(view.closed, true);
  assert.deepEqual(view.answerSummary, ['User answered: はい']);
  assert.equal(view.open, false, '閉じた形には開くを出さない');
});

test('T-13：端末の answerer は答えず、理由と「Orca で開く」の印を返し、送るボタンを出さず選択肢を押せない', () => {
  const part = terminalPart();
  const availability = terminalAnswerer.availability(part, STATUS_OK);
  assert.deepEqual(availability, { ok: false, reason: TERMINAL_REASON, open: true });
  assert.equal(TERMINAL_REASON, '端末のエージェントの質問は、いまは Orca で答えてください');
  const view = buildQuestionCard(part, {
    key: 'k',
    selection: initialSelection(part),
    flow: initialFlow(),
    availability,
  });
  assert.equal(view.closed, false);
  assert.equal(view.button.shown, false);
  assert.equal(view.reason, TERMINAL_REASON);
  assert.equal(view.open, true);
  for (const o of view.questions[0].options) assert.equal(o.disabled, true);
});

test('T-13：chat の answerer は sendEnabled 偽・answer.available 偽・status なしで理由を返し、カードは読めるが押せない', () => {
  const answerer = createChatAnswerer({ agentId: 'a1', writer: { send: async () => ({ status: 500, body: {} }) } });
  const part = chatPart([question({ allowOther: true })]);
  assert.deepEqual(answerer.availability(part, STATUS_OK), { ok: true });
  const off = answerer.availability(part, { ...STATUS_OK, enabled: false });
  assert.deepEqual(off, { ok: false, reason: '送信が無効です（設定の sendEnabled が偽）' });
  assert.equal(QUESTION_REASONS.send_disabled, off.ok === false ? off.reason : '');
  const unsupported = answerer.availability(part, {
    ...STATUS_OK,
    answer: { available: false, reason: 'unsupported' },
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.ok === false && unsupported.reason, QUESTION_REASONS.unsupported);
  const unknownReason = answerer.availability(part, { ...STATUS_OK, answer: { available: false, reason: 'zzz' } });
  assert.match(unknownReason.ok === false ? unknownReason.reason : '', /zzz/);
  assert.deepEqual(answerer.availability(part, null), { ok: false, reason: QUESTION_REASONS.loading });
  assert.deepEqual(answerer.availability(part, 'failed'), { ok: false, reason: QUESTION_REASONS.status_unavailable });
  assert.equal(answerer.availability(part, { enabled: true }).ok, false, 'answer の項目がない古い形');

  const selection = toggleOption(initialSelection(part), part, 0, 'a');
  const view = buildQuestionCard(part, { key: 'k', selection, flow: initialFlow(), availability: off });
  assert.equal(view.button.shown, true);
  assert.equal(view.button.disabled, true);
  assert.equal(view.reason, '送信が無効です（設定の sendEnabled が偽）');
  for (const o of view.questions[0].options) assert.equal(o.disabled, true);
  assert.equal(view.questions[0].other.disabled, true);
  assert.equal(view.open, false);
});

test('T-13：answererFor は source で選び、表を差し替えれば別の手段を使える', () => {
  const chat = { availability: () => OK, submit: async () => ({ kind: 'done' }) };
  assert.equal(answererFor(terminalPart(), { chat, terminal: terminalAnswerer }), terminalAnswerer);
  assert.equal(answererFor(chatPart(), { chat, terminal: terminalAnswerer }), chat);
  const replacement = { availability: () => OK, submit: async () => ({ kind: 'done' }) };
  assert.equal(answererFor(terminalPart(), { chat, terminal: replacement }), replacement);
});

/** 書き込みの偽の送り手。呼ばれた道と本体を数え、決めた応答を順に返す。 */
function fakeWriter(responses: Array<{ status: number; body: Any } | Error | Promise<Any>>) {
  const calls: Array<{ path: string; body: Any }> = [];
  return {
    calls,
    writer: {
      send: async (path: string, _method: string, body: Any) => {
        calls.push({ path, body });
        const next = responses.shift();
        if (next instanceof Error) throw next;
        if (!next) throw new Error('no more responses');
        return next;
      },
    },
  };
}

const ANSWERS = [{ questionId: 'q1', optionIds: ['a'] }];
const INTENT_OK = { status: 200, body: { ticket: 't-1', operationId: 'op-1', expiresAt: 1, digest: 'd' } };

test('T-13：chat の answerer は意図と確定を1回ずつ送り、submitted で done、refused でその理由、unknown で操作の ID を返す', async () => {
  const ok = fakeWriter([INTENT_OK, { status: 200, body: { operationId: 'op-1', outcome: 'submitted', detail: {} } }]);
  const answerer = createChatAnswerer({ agentId: 'a1', writer: ok.writer });
  assert.deepEqual(await answerer.submit(chatPart(), ANSWERS), { kind: 'done' });
  assert.deepEqual(ok.calls, [
    { path: '/api/answer/intent', body: { agent: 'a1', prompt: { itemId: 'item-1', revision: 3 }, answers: ANSWERS } },
    { path: '/api/answer/confirm', body: { ticket: 't-1', answers: ANSWERS } },
  ]);

  const refused = fakeWriter([
    INTENT_OK,
    { status: 200, body: { outcome: 'refused', detail: { code: 'agent_session_already_resolved' } } },
  ]);
  assert.deepEqual(await createChatAnswerer({ agentId: 'a1', writer: refused.writer }).submit(chatPart(), ANSWERS), {
    kind: 'refused',
    reason: 'ほかの画面で答え済みです',
  });

  const unknown = fakeWriter([INTENT_OK, { status: 200, body: { outcome: 'unknown', detail: {} } }]);
  assert.deepEqual(await createChatAnswerer({ agentId: 'a1', writer: unknown.writer }).submit(chatPart(), ANSWERS), {
    kind: 'unknown',
    operationId: 'op-1',
  });

  const lost = fakeWriter([INTENT_OK, new Error('network')]);
  assert.deepEqual(await createChatAnswerer({ agentId: 'a1', writer: lost.writer }).submit(chatPart(), ANSWERS), {
    kind: 'unknown',
    operationId: 'op-1',
  });
  assert.equal(lost.calls.length, 2, '確定の応答を失っても送り直さない');
});

test('T-13：意図の拒み・意図の通信の失敗は確定を送らず、理由の言葉を返す', async () => {
  const changed = fakeWriter([
    { status: 409, body: { ok: false, error: 'target_changed', reason: 'question_changed' } },
  ]);
  assert.deepEqual(await createChatAnswerer({ agentId: 'a1', writer: changed.writer }).submit(chatPart(), ANSWERS), {
    kind: 'refused',
    reason: '質問が変わりました',
  });
  assert.equal(changed.calls.length, 1);
  const disabled = fakeWriter([{ status: 403, body: { ok: false, error: 'send_disabled' } }]);
  assert.deepEqual(await createChatAnswerer({ agentId: 'a1', writer: disabled.writer }).submit(chatPart(), ANSWERS), {
    kind: 'refused',
    reason: '送信が無効です（設定の sendEnabled が偽）',
  });
  const down = fakeWriter([new Error('network')]);
  const result = await createChatAnswerer({ agentId: 'a1', writer: down.writer }).submit(chatPart(), ANSWERS);
  assert.equal(result.kind, 'refused');
  assert.equal(down.calls.length, 1);
  const noPrompt = fakeWriter([]);
  const bad = await createChatAnswerer({ agentId: 'a1', writer: noPrompt.writer }).submit(
    chatPart(undefined, { prompt: null }),
    ANSWERS,
  );
  assert.equal(bad.kind, 'refused');
  assert.equal(noPrompt.calls.length, 0);
});

test('T-13：chat の answerer の照会は操作の ID で1回だけ読み、記録の結果を返し、送らない', async () => {
  const urls: string[] = [];
  const reads = [
    { status: 200, body: { state: 'recorded', record: { outcome: 'submitted', detail: { code: 'resolved' } } } },
    { status: 200, body: { state: 'recorded', record: { outcome: 'refused', detail: { code: 'resolved_by_other' } } } },
    { status: 200, body: { state: 'recorded', record: { outcome: 'unknown', detail: { code: 'prompt_pending' } } } },
    { status: 200, body: { state: 'not_sent' } },
    { status: 200, body: { state: 'in_progress' } },
  ];
  const writer = fakeWriter([]);
  const answerer = createChatAnswerer({
    agentId: 'a1',
    writer: writer.writer,
    read: async (url: string) => {
      urls.push(url);
      return reads.shift() ?? { status: 500, body: {} };
    },
  });
  assert.deepEqual(await answerer.check('op/1'), { kind: 'done' });
  assert.deepEqual(await answerer.check('op-1'), { kind: 'refused', reason: 'ほかの画面で答え済みです' });
  const pending = await answerer.check('op-1');
  assert.equal(pending.kind, 'unknown');
  assert.equal((pending as Any).operationId, 'op-1');
  assert.match((pending as Any).note, /まだ分かりません/);
  assert.deepEqual(await answerer.check('op-1'), { kind: 'refused', reason: '送っていません' });
  assert.equal((await answerer.check('op-1')).kind, 'unknown');
  assert.equal(urls[0], '/api/send/op%2F1?check=1');
  assert.equal(writer.calls.length, 0);
});

test('T-13：流れは idle → sending → done・refused・unknown と進み、sending の間の押しを捨て、unknown は確かめるか閉じるだけ', () => {
  let flow = initialFlow();
  flow = reduceFlow(flow, { type: 'submit' });
  assert.equal(flow.phase, 'sending');
  assert.equal(reduceFlow(flow, { type: 'submit' }), flow, 'sending の間の押しを捨てる');
  const unknown = reduceFlow(flow, { type: 'result', result: { kind: 'unknown', operationId: 'op-1' } });
  assert.equal(unknown.phase, 'unknown');
  assert.equal(reduceFlow(unknown, { type: 'submit' }), unknown, '結果不明の後は自動でも手でも送らない');
  const checking = reduceFlow(unknown, { type: 'query' });
  assert.equal(checking.phase, 'checking');
  assert.equal(reduceFlow(checking, { type: 'query' }), checking);
  const done = reduceFlow(checking, { type: 'result', result: { kind: 'done' } });
  assert.equal(done.phase, 'done');
  assert.equal(reduceFlow(done, { type: 'submit' }), done);
  const dismissed = reduceFlow(unknown, { type: 'dismiss' });
  assert.equal(dismissed.phase, 'idle');
  const refused = reduceFlow(reduceFlow(initialFlow(), { type: 'submit' }), {
    type: 'result',
    result: { kind: 'refused', reason: '質問が変わりました' },
  });
  assert.equal(refused.phase, 'refused');
  assert.equal(reduceFlow(refused, { type: 'submit' }).phase, 'sending', '拒みの後は利用者が押し直せる');
});

test('T-13：カードは流れに合わせて、送っている間は押せず、done は「答えました」、unknown は帯と「確かめる」「閉じる」', () => {
  const part = chatPart();
  const selection = toggleOption(initialSelection(part), part, 0, 'a');
  const card = (flow: Any) => buildQuestionCard(part, { key: 'k', selection, flow, availability: OK });
  const sending = card(reduceFlow(initialFlow(), { type: 'submit' }));
  assert.deepEqual(sending.button, { shown: true, disabled: true, busy: true, label: '送っています…' });
  for (const o of sending.questions[0].options) assert.equal(o.disabled, true);
  const done = card({ phase: 'done', result: { kind: 'done' } });
  assert.deepEqual(done.notice, { kind: 'info', text: '答えました' });
  assert.equal(done.button.disabled, true);
  const refused = card({ phase: 'refused', result: { kind: 'refused', reason: '質問が変わりました' } });
  assert.deepEqual(refused.notice, { kind: 'error', text: '質問が変わりました' });
  assert.equal(refused.button.disabled, false);
  const unknown = card({ phase: 'unknown', result: { kind: 'unknown', operationId: 'op-1' } });
  assert.deepEqual(unknown.unknown, { text: '届いたか分かりません。自動では送り直しません', busy: false });
  assert.equal(unknown.button.disabled, true);
  const checking = card({ phase: 'checking', result: { kind: 'unknown', operationId: 'op-1' } });
  assert.equal(checking.unknown?.busy, true);
});

test('T-13：board はカードの key ごとに選択と流れを保ち、1回の押しで submit を1回だけ呼び、unknown では送り直さない', async () => {
  let release: (v: Any) => void = () => {};
  const submits: Any[] = [];
  const checks: string[] = [];
  const chat = {
    availability: () => OK,
    submit: (_part: Any, answers: Any) => {
      submits.push(answers);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    check: async (operationId: string) => {
      checks.push(operationId);
      return { kind: 'done' };
    },
  };
  let changes = 0;
  const board = createQuestionBoard({
    answerers: { chat, terminal: terminalAnswerer },
    onChange: () => {
      changes++;
    },
  });
  const part = chatPart();
  board.toggleOption('k', part, 0, 'a');
  assert.deepEqual(board.selection('k', part), [{ optionIds: ['a'], other: null }]);
  const first = board.submit('k', part, STATUS_OK);
  const second = board.submit('k', part, STATUS_OK);
  assert.equal(submits.length, 1, 'sending の間の押しを捨てる');
  assert.deepEqual(submits[0], [{ questionId: 'q1', optionIds: ['a'] }]);
  release({ kind: 'unknown', operationId: 'op-9' });
  await Promise.all([first, second]);
  assert.equal(board.flow('k').phase, 'unknown');
  await board.submit('k', part, STATUS_OK);
  assert.equal(submits.length, 1, 'unknown の後は送らない');
  await board.query('k');
  assert.deepEqual(checks, ['op-9']);
  assert.equal(board.flow('k').phase, 'done');
  assert.ok(changes > 0);
  board.prune(new Set());
  assert.equal(board.flow('k').phase, 'idle', '消えたカードの状態は忘れる');
});

test('T-13：board は送れないとき（availability が ok でない、答えが揃わない）submit を呼ばない', async () => {
  let calls = 0;
  const chat = {
    availability: (_p: Any, status: Any) => (status?.enabled ? OK : { ok: false, reason: 'x' }),
    submit: async () => {
      calls++;
      return { kind: 'done' };
    },
  };
  const board = createQuestionBoard({ answerers: { chat, terminal: terminalAnswerer } });
  const part = chatPart();
  await board.submit('k', part, STATUS_OK);
  assert.equal(calls, 0, '答えが揃わない');
  board.toggleOption('k', part, 0, 'a');
  await board.submit('k', part, { enabled: false });
  assert.equal(calls, 0, '送れない');
  await board.submit('k', terminalPart(), STATUS_OK);
  assert.equal(calls, 0, '端末');
  await board.submit('k', chatPart(undefined, { state: 'answered' }), STATUS_OK);
  assert.equal(calls, 0, '答え済み');
});
