// 会話の中の質問の今の状態（iss-00049 D-03、T-05）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { findCallQuestion, promptMatches, sameQuestions } from '../../src/send/question-state.ts';
import type { QuestionPart, TranscriptMessage, TranscriptPart } from '../../src/transcript/normalize.ts';
import { normalizeNativeMessages } from '../../src/transcript/normalize.ts';

const view = (question: string, labels: string[], multiSelect = false) => ({
  id: '0',
  header: null,
  question,
  multiSelect,
  options: labels.map((label, i) => ({ id: String(i), label, description: null })),
  allowOther: true,
  otherAllowsEmpty: false,
  preview: false,
});
const question = (callId: string, answerVia: 'keys' | 'message', text = '仮の問い'): QuestionPart => ({
  type: 'question',
  source: 'terminal',
  answerVia,
  prompt: null,
  callId,
  questions: [view(text, ['甲', '乙'])],
  state: 'pending',
  answers: null,
});
let n = 0;
const msg = (role: TranscriptMessage['role'], ...parts: TranscriptPart[]): TranscriptMessage => ({
  id: `m${++n}`,
  role,
  at: null,
  parts,
});
const result = (callId: string, isError = false): TranscriptPart => ({
  type: 'tool-result',
  output: 'x',
  isError,
  callId,
});
const say = (text: string): TranscriptPart => ({ type: 'text', text });

test('T-05 findCallQuestion：keys の質問は後の tool-result で answered（isError で failed）、なければ pending', () => {
  const q = question('c1', 'keys');
  assert.deepEqual(findCallQuestion([msg('assistant', q)], 'c1'), { part: q, state: 'pending' });
  assert.deepEqual(findCallQuestion([msg('assistant', q), msg('tool', result('c1'))], 'c1'), {
    part: q,
    state: 'answered',
  });
  assert.deepEqual(findCallQuestion([msg('assistant', q), msg('tool', result('c1', true))], 'c1'), {
    part: q,
    state: 'failed',
  });
  // 同じ件の後ろの tool-result も数え、別の callId や前の tool-result は数えない
  assert.equal(findCallQuestion([msg('assistant', q, result('c1'))], 'c1')?.state, 'answered');
  assert.equal(findCallQuestion([msg('tool', result('c1')), msg('assistant', q)], 'c1')?.state, 'pending');
  assert.equal(findCallQuestion([msg('assistant', q), msg('tool', result('c2'))], 'c1')?.state, 'pending');
});

test('T-05 findCallQuestion：見つからなければ null、同じ callId が2つあれば後の物、rpc の質問とツールの呼び出しは数えない', () => {
  assert.equal(findCallQuestion([msg('assistant', question('c1', 'keys'))], 'c2'), null);
  const later = question('c1', 'keys', '後の問い');
  assert.equal(
    findCallQuestion([msg('assistant', question('c1', 'keys')), msg('assistant', later)], 'c1')?.part,
    later,
  );
  const rpc: QuestionPart = { ...question('c1', 'keys'), answerVia: 'rpc' };
  assert.equal(findCallQuestion([msg('assistant', rpc)], 'c1'), null);
  assert.equal(
    findCallQuestion([msg('assistant', { type: 'tool-call', name: 'AskUserQuestion', input: '', callId: 'c1' })], 'c1'),
    null,
  );
});

test('T-05 findCallQuestion：message の質問は後の利用者の発言の引用（先頭か空行の後）で answered、引用でない発言では pending', () => {
  const q = question('a1', 'message', '一つ目\n続き');
  const base = [msg('assistant', q), msg('tool', result('a1'))];
  assert.equal(findCallQuestion(base, 'a1')?.state, 'pending', '受付の tool-result では答え済みにしない');
  assert.equal(findCallQuestion([...base, msg('user', say('> 一つ目 続き\n\n甲'))], 'a1')?.state, 'answered');
  assert.equal(findCallQuestion([...base, msg('user', say('前置き\n\n> 一つ目 続き\n\n甲'))], 'a1')?.state, 'answered');
  assert.equal(findCallQuestion([...base, msg('user', say('前置き > 一つ目 続き\n\n甲'))], 'a1')?.state, 'pending');
  assert.equal(findCallQuestion([...base, msg('user', say('甲にします'))], 'a1')?.state, 'pending');
  // エージェントの発言の引用は数えない。前の利用者の発言も数えない
  assert.equal(findCallQuestion([...base, msg('assistant', say('> 一つ目 続き\n\n甲'))], 'a1')?.state, 'pending');
  assert.equal(findCallQuestion([msg('user', say('> 一つ目 続き\n\n甲')), ...base], 'a1')?.state, 'pending');
});

const ask = JSON.stringify({ questions: [{ question: '仮の問い', options: ['甲', '乙'] }] });
const status = (extra: Record<string, unknown> = {}) => ({
  state: 'waiting',
  toolName: 'AskUserQuestion',
  interactivePrompt: ask,
  ...extra,
});
const questions = question('c', 'keys').questions;

test('T-05 promptMatches：waiting・blocked と質問のツールの名前と同じ問いで match', () => {
  assert.equal(promptMatches(status(), questions), 'match');
  assert.equal(promptMatches(status({ state: 'blocked', toolName: 'request_user_input' }), questions), 'match');
  // 会話の記録の正規化と同じ読み（会話の呼び出しから読んだ問いとも一致する）
  const parsed = normalizeNativeMessages([
    { id: 'm', role: 'assistant', blocks: [{ type: 'tool-call', name: 'AskUserQuestion', input: ask, callId: 'c' }] },
  ])?.[0]?.parts[0];
  assert.equal(parsed?.type, 'question');
  if (parsed?.type === 'question') assert.equal(promptMatches(status(), parsed.questions), 'match');
});

test('T-05 promptMatches：問いの文・ラベル・数・複数選択が違えば mismatch、ほかのツールも mismatch', () => {
  const other = (q: unknown) => status({ interactivePrompt: JSON.stringify({ questions: q }) });
  assert.equal(promptMatches(other([{ question: '別の問い', options: ['甲', '乙'] }]), questions), 'mismatch');
  assert.equal(promptMatches(other([{ question: '仮の問い', options: ['甲', '丙'] }]), questions), 'mismatch');
  assert.equal(promptMatches(other([{ question: '仮の問い', options: ['甲'] }]), questions), 'mismatch');
  assert.equal(
    promptMatches(other([{ question: '仮の問い', multiSelect: true, options: ['甲', '乙'] }]), questions),
    'mismatch',
  );
  assert.equal(
    promptMatches(
      other([
        { question: '仮の問い', options: ['甲', '乙'] },
        { question: '二', options: ['a'] },
      ]),
      questions,
    ),
    'mismatch',
  );
  assert.equal(promptMatches(status({ toolName: 'Bash' }), questions), 'mismatch');
});

test('T-05 promptMatches：interactivePrompt がないか読めない、state が違う、toolName がない、agentStatus がなければ unverified', () => {
  assert.equal(promptMatches(status({ interactivePrompt: null }), questions), 'unverified');
  assert.equal(promptMatches(status({ interactivePrompt: '{not json' }), questions), 'unverified');
  for (const state of ['working', 'done', null]) {
    assert.equal(promptMatches(status({ state }), questions), 'unverified', String(state));
  }
  assert.equal(promptMatches(status({ toolName: null }), questions), 'unverified');
  assert.equal(promptMatches(null, questions), 'unverified');
});

test('FQG promptMatches：preview の違いも mismatch にする', () => {
  const withPreview = status({
    interactivePrompt: JSON.stringify({
      questions: [{ question: '仮の問い', options: [{ label: '甲', preview: 'code' }, { label: '乙' }] }],
    }),
  });
  assert.equal(promptMatches(withPreview, questions), 'mismatch');
  assert.equal(
    promptMatches(
      withPreview,
      questions.map((q) => ({ ...q, preview: true, allowOther: false })),
    ),
    'match',
  );
});

test('FQG sameQuestions：問いの文・header・複数選択・選択肢の id とラベル・allowOther・preview が同じときだけ真', () => {
  const base = question('c', 'keys').questions;
  assert.equal(sameQuestions(base, structuredClone(base)), true);
  const changed = (over: Record<string, unknown>) => [{ ...(base[0] as (typeof base)[0]), ...over }];
  for (const over of [
    { question: '別の問い' },
    { header: '見出し' },
    { multiSelect: true },
    { allowOther: false },
    { preview: true },
    { options: [{ id: '0', label: '甲', description: null }] },
    {
      options: [
        { id: '0', label: '甲', description: null },
        { id: '1', label: '丙', description: null },
      ],
    },
    {
      options: [
        { id: '0', label: '甲', description: null },
        { id: '9', label: '乙', description: null },
      ],
    },
  ]) {
    assert.equal(sameQuestions(base, changed(over)), false, JSON.stringify(over));
  }
  assert.equal(sameQuestions(base, [...base, ...base]), false);
});
