// キーの列と答えの発言（iss-00049 D-02、T-02〜T-04）。期待値は Orca v1.4.261 の native-chat-ask-answer.ts、
// native-chat-paste-bytes.ts、terminal-bracketed-paste-text.ts の関数を同じ入力で辿った値。
import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuestionAnswer } from '../../src/send/answer.ts';
import {
  ANSWER_STEP_MS,
  buildClaudeKeys,
  buildCodexKeys,
  formatAsyncAnswer,
  MAX_KEY_GROUPS,
  pasteBytes,
  planKeys,
  quoteOf,
  selectionsOf,
} from '../../src/send/keys.ts';
import type { QuestionView } from '../../src/transcript/normalize.ts';

const ESC = '\x1b';
const ENTER = { raw: '\r' };
const RIGHT = { raw: `${ESC}[C` };
const UP = { raw: `${ESC}[A` };
const DOWN = { raw: `${ESC}[B` };
const TAB = { raw: '\t' };

const q = (id: string, labels: string[], extra: Partial<QuestionView> = {}): QuestionView => ({
  id,
  header: null,
  question: `仮の問い${id}`,
  multiSelect: false,
  options: labels.map((label, i) => ({ id: String(i), label, description: null })),
  allowOther: true,
  otherAllowsEmpty: false,
  preview: false,
  ...extra,
});
const ABC = ['甲', '乙', '丙'];
const sel = (indices: number[], other?: string) => (other === undefined ? { indices } : { indices, other });

test('T-02 値：組の間は Orca の NATIVE_CHAT_QUESTION_STEP_MS（1000ms）、組の上限は 64', () => {
  assert.equal(ANSWER_STEP_MS, 1000);
  assert.equal(MAX_KEY_GROUPS, 64);
});

test('T-02 selectionsOf：番号の文字を小さい順の数にし、other を trim する', () => {
  const questions = [q('0', ABC, { multiSelect: true }), q('1', ABC)];
  const answers: QuestionAnswer[] = [
    { questionId: '0', optionIds: ['2', '0'] },
    { questionId: '1', optionIds: [], other: '  仮の文 ' },
  ];
  assert.deepEqual(selectionsOf(questions, answers), [{ indices: [0, 2] }, { indices: [], other: '仮の文' }]);
});

test('T-02 Claude：単一選択は番号の数字1つで確定する', () => {
  assert.deepEqual(buildClaudeKeys([q('0', ABC)], [sel([1])]), [{ raw: '2' }]);
});

test('T-02 Claude：単一選択のその他の文は Type something の番号、文、Enter', () => {
  assert.deepEqual(buildClaudeKeys([q('0', ABC)], [sel([], '仮の文')]), [{ raw: '4' }, { text: '仮の文' }, ENTER]);
});

test('T-02 Claude：1問の複数選択は数字で入れ外し、その他、右矢印、最後に Submit の Enter', () => {
  assert.deepEqual(buildClaudeKeys([q('0', ABC, { multiSelect: true })], [sel([0, 2], '仮')]), [
    { raw: '1' },
    { raw: '3' },
    { raw: '4' },
    { text: '仮' },
    ENTER,
    RIGHT,
    ENTER,
  ]);
  assert.deepEqual(buildClaudeKeys([q('0', ABC, { multiSelect: true })], [sel([1])]), [{ raw: '2' }, RIGHT, ENTER]);
});

test('T-02 Claude：複数問は各問いの列の後に Submit の Enter', () => {
  assert.deepEqual(
    buildClaudeKeys(
      [q('0', ABC), q('1', ABC, { multiSelect: true }), q('2', ['a', 'b'])],
      [sel([0]), sel([1, 2]), sel([], 'x')],
    ),
    [{ raw: '1' }, { raw: '2' }, { raw: '3' }, RIGHT, { raw: '3' }, { text: 'x' }, ENTER, ENTER],
  );
});

test('T-02 Claude：preview の問いは数字で移って Enter で確定する', () => {
  const preview = q('0', ['a', 'b'], { preview: true, allowOther: false });
  assert.deepEqual(buildClaudeKeys([preview], [sel([1])]), [{ raw: '2' }, ENTER]);
  assert.deepEqual(buildClaudeKeys([preview], [sel([0])]), [{ raw: '1' }, ENTER]);
  // メモ（Orca の列。ここからは送らないが、写した関数は同じ値を返す）
  assert.deepEqual(buildClaudeKeys([preview], [sel([0], 'n1')]), [
    { raw: '2' },
    { raw: '1' },
    { raw: 'n' },
    { text: 'n1' },
    ENTER,
  ]);
});

test('T-02 Codex：単一選択は数字で確定し、複数問は続けて数字', () => {
  assert.deepEqual(buildCodexKeys([q('0', ABC)], [sel([2])]), [{ raw: '3' }]);
  assert.deepEqual(buildCodexKeys([q('0', ABC), q('1', ABC)], [sel([0]), sel([1])]), [{ raw: '1' }, { raw: '2' }]);
});

test('T-02 Codex：メモは矢印で行を移り、Tab、文、Enter（近い向きの矢印）', () => {
  // 選んだ行 1（3つの選択肢と None の4行）：下へ1つ
  assert.deepEqual(buildCodexKeys([q('0', ABC)], [sel([1], 'メモ')]), [DOWN, TAB, { text: 'メモ' }, ENTER]);
  // 選択なし：選択肢の後の行へ、上へ1つ
  assert.deepEqual(buildCodexKeys([q('0', ABC)], [sel([], 'メモ')]), [UP, TAB, { text: 'メモ' }, ENTER]);
  // 選んだ行 0：動かない
  assert.deepEqual(buildCodexKeys([q('0', ABC)], [sel([0], 'm')]), [TAB, { text: 'm' }, ENTER]);
});

const ans = (questionId: string, optionIds: string[], other?: string): QuestionAnswer =>
  other === undefined ? { questionId, optionIds } : { questionId, optionIds, other };

test('T-03 planKeys：claude と codex で組のバイトの列を返す', () => {
  assert.deepEqual(planKeys('claude', [q('0', ABC)], [ans('0', [], '仮の文')]), {
    ok: true,
    groups: ['4', '仮の文', '\r'],
  });
  assert.deepEqual(planKeys('codex', [q('0', ABC)], [ans('0', ['1'], 'メモ')]), {
    ok: true,
    groups: [`${ESC}[B`, '\t', 'メモ', '\r'],
  });
});

test('T-03 planKeys：ほかの種類は agent_keys_unknown、codex の複数選択と preview は prompt_unsupported', () => {
  for (const agent of ['gemini', 'opencode', '', 'Claude']) {
    assert.deepEqual(planKeys(agent, [q('0', ABC)], [ans('0', ['0'])]), {
      ok: false,
      error: 'not_sendable',
      reason: 'agent_keys_unknown',
    });
  }
  assert.deepEqual(planKeys('codex', [q('0', ABC, { multiSelect: true })], [ans('0', ['0'])]), {
    ok: false,
    error: 'not_sendable',
    reason: 'prompt_unsupported',
  });
  assert.deepEqual(planKeys('codex', [q('0', ABC, { preview: true, allowOther: false })], [ans('0', ['0'])]), {
    ok: false,
    error: 'not_sendable',
    reason: 'prompt_unsupported',
  });
  assert.equal(planKeys('claude', [q('0', ABC, { preview: true, allowOther: false })], [ans('0', ['0'])]).ok, true);
});

test('T-03 planKeys：番号が2桁になる問いは prompt_unsupported', () => {
  const labels = (n: number) => Array.from({ length: n }, (_, i) => `l${i}`);
  assert.equal(planKeys('claude', [q('0', labels(8))], [ans('0', ['7'])]).ok, true);
  assert.deepEqual(planKeys('claude', [q('0', labels(9))], [ans('0', ['0'])]), {
    ok: false,
    error: 'not_sendable',
    reason: 'prompt_unsupported',
  });
  assert.equal(planKeys('codex', [q('0', labels(9))], [ans('0', ['8'])]).ok, true);
  assert.deepEqual(planKeys('codex', [q('0', labels(10))], [ans('0', ['0'])]), {
    ok: false,
    error: 'not_sendable',
    reason: 'prompt_unsupported',
  });
});

test('T-03 planKeys：64組を超える答えは invalid_answer（too_large）', () => {
  const many = Array.from({ length: 16 }, (_, i) => q(String(i), ABC, { multiSelect: true }));
  // 16問 ×（数字3つ＋右矢印）＋ Submit = 65組
  const answers = many.map((m) => ans(m.id, ['0', '1', '2']));
  assert.deepEqual(planKeys('claude', many, answers), { ok: false, error: 'invalid_answer', reason: 'too_large' });
  const fits = many.slice(0, 15);
  assert.equal(planKeys('claude', fits, answers.slice(0, 15)).ok, true);
});

test('T-03 planKeys：その他の文に Tab・改行・C0・DEL・C1 があれば invalid_answer（control_character）', () => {
  for (const bad of ['a\tb', 'a\nb', 'a\rb', 'a\x01b', 'a\x7fb', 'a\x85b', 'a\x1b[201~b']) {
    for (const agent of ['claude', 'codex']) {
      assert.deepEqual(
        planKeys(agent, [q('0', ABC)], [ans('0', [], bad)]),
        { ok: false, error: 'invalid_answer', reason: 'control_character' },
        `${agent} ${JSON.stringify(bad)}`,
      );
    }
  }
});

test('T-03 pasteBytes：ESC を ␛ に替え、改行を含むか 512 バイトを超える文を、改行を CR にして括弧付きの貼り付けで包む', () => {
  assert.equal(pasteBytes('仮の文'), '仮の文');
  assert.equal(pasteBytes(`a${ESC}[201~b`), 'a␛[201~b');
  assert.equal(pasteBytes('a\nb\r\nc'), `${ESC}[200~a\rb\rc${ESC}[201~`);
  assert.equal(pasteBytes(`a${ESC}\n`), `${ESC}[200~a␛\r${ESC}[201~`);
  assert.equal(pasteBytes('x'.repeat(512)), 'x'.repeat(512));
  assert.equal(pasteBytes('x'.repeat(513)), `${ESC}[200~${'x'.repeat(513)}${ESC}[201~`);
  // UTF-8 で数える（3バイトの字 171 個 = 513 バイト）
  assert.equal(pasteBytes('あ'.repeat(171)), `${ESC}[200~${'あ'.repeat(171)}${ESC}[201~`);
  assert.equal(pasteBytes('あ'.repeat(170)), 'あ'.repeat(170));
  const long = planKeys('claude', [q('0', ABC)], [ans('0', [], 'y'.repeat(600))]);
  assert.deepEqual(long, { ok: true, groups: ['4', `${ESC}[200~${'y'.repeat(600)}${ESC}[201~`, '\r'] });
});

test('T-04 formatAsyncAnswer と quoteOf：Orca の formatAskAnswer（replyAsMessage）と askAnswerQuote と同じ文', () => {
  const first = q('0', ['甲', '乙'], { question: '一つ目\r\n\r\n続き' });
  const second = q('1', [], { question: '二つ目' });
  assert.equal(quoteOf(first), '> 一つ目 続き\n\n');
  assert.equal(quoteOf(second), '> 二つ目\n\n');
  assert.equal(formatAsyncAnswer([first], [ans('0', ['1'])]), '> 一つ目 続き\n\n乙');
  assert.equal(
    formatAsyncAnswer([first, second], [ans('0', ['0']), ans('1', [], ' 仮の自由な答え ')]),
    '> 一つ目 続き\n\n甲\n\n> 二つ目\n\n仮の自由な答え',
  );
  // ラベルとその他の文は「, 」で並べる
  assert.equal(formatAsyncAnswer([first], [ans('0', ['0'], 'x')]), '> 一つ目 続き\n\n甲, x');
});
