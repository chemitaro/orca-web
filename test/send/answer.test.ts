// 答えの検査（D-03 の checkAnswers、T-06）。Orca v1.4.261 の isValidAgentSessionQuestionAnswers と同じ条件。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { answerForm, checkAnswers, digestAnswers, MAX_OTHER_BYTES } from '../../src/send/answer.ts';
import type { QuestionView } from '../../src/transcript/normalize.ts';

const q = (id: string, extra: Partial<QuestionView> = {}): QuestionView => ({
  id,
  header: null,
  question: '仮の問い',
  multiSelect: false,
  options: [
    { id: `${id}-a`, label: 'A', description: null },
    { id: `${id}-b`, label: 'B', description: null },
  ],
  allowOther: false,
  otherAllowsEmpty: false,
  ...extra,
});

const reason = (questions: QuestionView[], answers: unknown) => {
  const r = checkAnswers(questions, answers);
  return r.ok ? 'ok' : r.reason;
};

test('T-06 単一選択はちょうど1つ、複数選択は1つ以上、全部の問いに1件ずつ', () => {
  const single = [q('s')];
  assert.equal(reason(single, [{ questionId: 's', optionIds: ['s-a'] }]), 'ok');
  assert.equal(reason(single, [{ questionId: 's', optionIds: ['s-a', 's-b'] }]), 'too_many_choices');
  assert.equal(reason(single, [{ questionId: 's', optionIds: [] }]), 'no_choice');
  const multi = [q('m', { multiSelect: true })];
  assert.equal(reason(multi, [{ questionId: 'm', optionIds: ['m-a', 'm-b'] }]), 'ok');
  assert.equal(reason(multi, [{ questionId: 'm', optionIds: [] }]), 'no_choice');
  const two = [q('a'), q('b')];
  assert.equal(reason(two, [{ questionId: 'a', optionIds: ['a-a'] }]), 'answer_count');
  assert.equal(
    reason(two, [
      { questionId: 'a', optionIds: ['a-a'] },
      { questionId: 'a', optionIds: ['a-b'] },
    ]),
    'duplicate_question',
  );
  assert.equal(
    reason(two, [
      { questionId: 'a', optionIds: ['a-a'] },
      { questionId: 'c', optionIds: ['a-b'] },
    ]),
    'unknown_question',
  );
  assert.equal(reason(single, [{ questionId: 's', optionIds: ['x'] }]), 'unknown_option');
  assert.equal(reason(multi, [{ questionId: 'm', optionIds: ['m-a', 'm-a'] }]), 'duplicate_option');
});

test('T-06 other は allowOther の問いだけ、空白だけは otherAllowsEmpty のときだけ答えに数える', () => {
  const free = [q('f', { allowOther: true })];
  assert.equal(reason(free, [{ questionId: 'f', optionIds: [], other: '仮の文' }]), 'ok');
  assert.equal(reason(free, [{ questionId: 'f', optionIds: [], other: '   ' }]), 'no_choice');
  assert.equal(reason(free, [{ questionId: 'f', optionIds: ['f-a'], other: '仮' }]), 'too_many_choices');
  // 数えない other（空白だけ）は選択肢1つと一緒でもよく、決めた形から落ちる
  const kept = checkAnswers(free, [{ questionId: 'f', optionIds: ['f-a'], other: ' ' }]);
  assert.deepEqual(kept, { ok: true, answers: [{ questionId: 'f', optionIds: ['f-a'] }] });
  const empty = [q('e', { allowOther: true, otherAllowsEmpty: true })];
  assert.deepEqual(checkAnswers(empty, [{ questionId: 'e', optionIds: [], other: '' }]), {
    ok: true,
    answers: [{ questionId: 'e', optionIds: [], other: '' }],
  });
  const closed = [q('c')];
  assert.equal(reason(closed, [{ questionId: 'c', optionIds: [], other: '仮' }]), 'other_not_allowed');
  // 数えない other は allowOther のない問いでも誤りにしない（Orca と同じ）
  assert.equal(reason(closed, [{ questionId: 'c', optionIds: ['c-a'], other: '' }]), 'ok');
});

test('T-06 other の制御文字（タブと改行は許す）と 64KiB の上限', () => {
  const free = [q('f', { allowOther: true })];
  assert.equal(reason(free, [{ questionId: 'f', optionIds: [], other: '一\t二\n三' }]), 'ok');
  for (const bad of ['a\u0000b', 'a\u001bb', 'a\u007fb', 'a\u0085b', 'a\rb']) {
    assert.equal(
      reason(free, [{ questionId: 'f', optionIds: [], other: bad }]),
      'control_character',
      JSON.stringify(bad),
    );
  }
  assert.equal(
    reason(free, [{ questionId: 'f', optionIds: [], other: 'あ'.repeat(MAX_OTHER_BYTES / 3 + 1) }]),
    'too_large',
  );
  assert.equal(reason(free, [{ questionId: 'f', optionIds: [], other: 'a'.repeat(MAX_OTHER_BYTES) }]), 'ok');
});

test('T-06 形の誤り（配列でない、余分な鍵、型の違い）を拒む', () => {
  const single = [q('s')];
  for (const bad of [
    null,
    'x',
    {},
    [],
    [null],
    [{ questionId: 's' }],
    [{ questionId: 's', optionIds: 's-a' }],
    [{ questionId: 's', optionIds: [1] }],
    [{ questionId: 's', optionIds: ['s-a'], other: 3 }],
    [{ questionId: 's', optionIds: ['s-a'], extra: true }],
    [{ questionId: 's', optionIds: ['s-a'], optionId: 's-a' }],
  ]) {
    assert.equal(reason(single, bad), 'invalid_shape', JSON.stringify(bad));
  }
  assert.deepEqual(checkAnswers(single, null), { ok: false, error: 'invalid_answer', reason: 'invalid_shape' });
});

test('T-06 決めた形は問いの順に並び、digest は鍵の順によらず決まる', () => {
  const two = [q('a', { multiSelect: true }), q('b', { allowOther: true })];
  const one = checkAnswers(two, [
    { other: '仮', optionIds: [], questionId: 'b' },
    { optionIds: ['a-b', 'a-a'], questionId: 'a' },
  ]);
  const other = checkAnswers(two, [
    { questionId: 'a', optionIds: ['a-b', 'a-a'] },
    { questionId: 'b', other: '仮', optionIds: [] },
  ]);
  assert.ok(one.ok && other.ok);
  assert.deepEqual(one.answers, [
    { questionId: 'a', optionIds: ['a-b', 'a-a'] },
    { questionId: 'b', optionIds: [], other: '仮' },
  ]);
  assert.equal(digestAnswers(one.answers), digestAnswers(other.answers));
  assert.match(digestAnswers(one.answers), /^[0-9a-f]{64}$/);
  // Orca の canonicalize と同じ規則（鍵を並べた JSON）の sha256
  const expected = createHash('sha256')
    .update('[{"optionIds":["a-b","a-a"],"questionId":"a"},{"optionIds":[],"other":"仮","questionId":"b"}]')
    .digest('hex');
  assert.equal(digestAnswers(one.answers), expected);
});

test('answerForm は Orca が書いた答えを、確かめずに決めた形にする（数えない other を落とし、文は切らない）', () => {
  const two = [q('a'), q('b', { allowOther: true })];
  const long = 'x'.repeat(5000);
  assert.deepEqual(
    answerForm(two, [
      { questionId: 'b', optionIds: [], other: long },
      { questionId: 'a', optionIds: ['a-a'], other: '  ' },
    ]),
    [
      { questionId: 'a', optionIds: ['a-a'] },
      { questionId: 'b', optionIds: [], other: long },
    ],
  );
});
