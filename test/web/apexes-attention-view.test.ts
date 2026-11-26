import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ATTENTION_LABELS, attentionFor, memberAttention } from '../../web/apexes-attention-view.js';

type Q = {
  dispatchId: string;
  taskTitle: string | null;
  kind: 'ask' | 'gate';
  working: boolean;
  answered?: boolean | null;
};

function item(questions: Q[], waitingMembers: Array<{ id: string; title: string | null; mark: string }> = []) {
  return { questions, waitingMembers };
}

const q = (dispatchId: string, kind: 'ask' | 'gate', patch: Partial<Q> = {}): Q => ({
  dispatchId,
  taskTitle: null,
  kind,
  working: false,
  ...patch,
});

const dispatchNode = (dispatchId: string) => ({ kind: 'dispatch', agentId: null, dispatchId });
const agentNode = (agentId: string, dispatchId: string | null = null) => ({ kind: 'agent', agentId, dispatchId });

const kinds = (marks: Array<{ kind: string }>) => marks.map((m) => m.kind);

test('iss-00097 T-01：ask は working 偽・answered 偽か null か無しで question、working 真で question_working、answered 真で question_answered', () => {
  const table = memberAttention(
    item([
      q('d1', 'ask'),
      q('d2', 'ask', { answered: false }),
      q('d3', 'ask', { answered: null }),
      q('d4', 'ask', { working: true }),
      q('d5', 'ask', { answered: true }),
    ]),
  );
  assert.deepEqual(attentionFor(dispatchNode('d1'), table), [
    { kind: 'question', label: ATTENTION_LABELS.question, urgent: true },
  ]);
  assert.deepEqual(kinds(attentionFor(dispatchNode('d2'), table)), ['question']);
  assert.deepEqual(kinds(attentionFor(dispatchNode('d3'), table)), ['question']);
  assert.deepEqual(attentionFor(dispatchNode('d4'), table), [
    { kind: 'question_working', label: '質問あり（作業は継続中）', urgent: false },
  ]);
  assert.deepEqual(attentionFor(dispatchNode('d5'), table), [
    { kind: 'question_answered', label: '質問の印あり（返事済み）', urgent: false },
  ]);
  assert.equal(ATTENTION_LABELS.question, '対応が必要：質問');
  assert.deepEqual(attentionFor(dispatchNode('none'), table), []);
});

test('iss-00097 T-01：gate も同じで、対応が必要なら decision（「対応が必要：判断」）', () => {
  const table = memberAttention(
    item([q('g1', 'gate'), q('g2', 'gate', { working: true }), q('g3', 'gate', { answered: true })]),
  );
  assert.deepEqual(attentionFor(dispatchNode('g1'), table), [
    { kind: 'decision', label: '対応が必要：判断', urgent: true },
  ]);
  assert.deepEqual(kinds(attentionFor(dispatchNode('g2'), table)), ['question_working']);
  assert.deepEqual(kinds(attentionFor(dispatchNode('g3'), table)), ['decision_resolved']);
});

test('iss-00098：answered 真の ask は question_answered「質問の印あり（返事済み）」、gate は decision_resolved「判断の印あり（門は解決済み）」', () => {
  const table = memberAttention(item([q('a1', 'ask', { answered: true }), q('g1', 'gate', { answered: true })]));
  assert.deepEqual(attentionFor(dispatchNode('a1'), table), [
    { kind: 'question_answered', label: '質問の印あり（返事済み）', urgent: false },
  ]);
  assert.deepEqual(attentionFor(dispatchNode('g1'), table), [
    { kind: 'decision_resolved', label: '判断の印あり（門は解決済み）', urgent: false },
  ]);
  assert.equal(ATTENTION_LABELS.decision_resolved, '判断の印あり（門は解決済み）');
});

test('iss-00098：同じ Dispatch の decision と decision_resolved が重なれば decision だけ。控えめの並びは question_working・question_answered・decision_resolved', () => {
  const overlap = memberAttention(item([q('d1', 'gate'), q('d1', 'gate', { answered: true })]));
  assert.deepEqual(kinds(attentionFor(dispatchNode('d1'), overlap)), ['decision']);
  const quiet = memberAttention(
    item([q('d1', 'gate', { answered: true }), q('d1', 'ask', { answered: true }), q('d2', 'ask', { working: true })]),
  );
  assert.deepEqual(kinds(attentionFor(agentNode('x', 'd1'), quiet)), ['question_answered', 'decision_resolved']);
});

test('iss-00097 T-01：waitingMembers の blocked は「対応が必要：許可待ち」、waiting は「対応が必要：入力待ち」。知らない mark は印にしない', () => {
  const table = memberAttention(
    item(
      [],
      [
        { id: 'a1', title: null, mark: 'blocked' },
        { id: 'a2', title: null, mark: 'waiting' },
        { id: 'a3', title: null, mark: 'working' },
      ],
    ),
  );
  assert.deepEqual(attentionFor(agentNode('a1'), table), [
    { kind: 'waiting', label: '対応が必要：許可待ち', urgent: true },
  ]);
  assert.deepEqual(attentionFor(agentNode('a2'), table), [
    { kind: 'waiting', label: '対応が必要：入力待ち', urgent: true },
  ]);
  assert.deepEqual(attentionFor(agentNode('a3'), table), []);
  // Dispatch の節は agentId で引かない。
  assert.deepEqual(attentionFor({ kind: 'dispatch', agentId: 'a1', dispatchId: 'x' }, table), []);
});

test('iss-00097 T-01：agent の節は dispatchId でも引き、対応が必要を控えめより先に、違う種類はすべて並べる', () => {
  const table = memberAttention(
    item(
      [q('d1', 'ask', { working: true }), q('d1', 'gate'), q('d1', 'ask')],
      [{ id: 'a1', title: null, mark: 'blocked' }],
    ),
  );
  // ask の question と question_working が重なれば question だけ。gate の decision と waiting は並べる。
  assert.deepEqual(kinds(attentionFor(agentNode('a1', 'd1'), table)), ['question', 'decision', 'waiting']);
  assert.deepEqual(kinds(attentionFor(agentNode('other', 'd1'), table)), ['question', 'decision']);
});

test('iss-00097 T-01：控えめの印は、違う種類の対応が必要の印の後ろに並ぶ', () => {
  const table = memberAttention(item([q('d1', 'ask', { answered: true }), q('d1', 'gate')]));
  assert.deepEqual(kinds(attentionFor(dispatchNode('d1'), table)), ['decision', 'question_answered']);
});

test('iss-00097 T-01：questions・waitingMembers がない・壊れた項目でも止まらない', () => {
  const empty = memberAttention(null);
  assert.deepEqual(attentionFor(dispatchNode('d1'), empty), []);
  const broken = memberAttention({
    questions: [null, { kind: 'ask' }, { dispatchId: 'd', kind: 'x' }],
    waitingMembers: 3,
  });
  assert.deepEqual(attentionFor(dispatchNode('d'), broken), []);
  assert.deepEqual(attentionFor(null, broken), []);
});
