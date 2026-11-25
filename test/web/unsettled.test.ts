// 送信の処理中か結果不明の印（web/embed/unsettled.js、iss-00077 D-04、T-03 の印の条件、T-06 の読み）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  frameUnsettled,
  isUnsettled,
  markUnsettled,
  pendingPhases,
  UNSETTLED_ATTRIBUTE,
} from '../../web/embed/unsettled.js';

test('印の属性の名前は data-unsettled の1つ', () => {
  assert.equal(UNSETTLED_ATTRIBUTE, 'data-unsettled');
});

test('T-03：送る欄は sending・checking・unknown の間だけ印を付ける', () => {
  for (const phase of ['sending', 'checking', 'unknown']) assert.equal(isUnsettled({ sendPhase: phase }), true, phase);
  for (const phase of ['disabled', 'compose', 'changed']) assert.equal(isUnsettled({ sendPhase: phase }), false, phase);
  assert.equal(isUnsettled({}), false);
});

test('T-03：質問と承認のカードは、送る途中・照会・結果不明・partial の間だけ印を付ける', () => {
  for (const phase of ['sending', 'checking', 'unknown', 'partial']) {
    assert.equal(isUnsettled({ sendPhase: 'compose', questionPhases: ['idle', phase] }), true, `question ${phase}`);
    assert.equal(isUnsettled({ sendPhase: 'compose', approvalPhases: [phase] }), true, `approval ${phase}`);
  }
  for (const phase of ['idle', 'done', 'refused', 'blocked']) {
    assert.equal(isUnsettled({ sendPhase: 'compose', questionPhases: [phase], approvalPhases: [phase] }), false, phase);
  }
});

test('markUnsettled は真で "true" を付け、偽で外す', () => {
  const attrs = new Map<string, string>();
  const body = {
    setAttribute: (name: string, value: string) => attrs.set(name, value),
    removeAttribute: (name: string) => attrs.delete(name),
  };
  markUnsettled(body, true);
  assert.equal(attrs.get('data-unsettled'), 'true');
  markUnsettled(body, false);
  assert.equal(attrs.has('data-unsettled'), false);
});

test('T-06：frameUnsettled は枠の body の印を読み、印がない・文書がない・例外なら偽', () => {
  const frameWith = (value: string | null) => ({
    contentDocument: { body: { getAttribute: (name: string) => (name === 'data-unsettled' ? value : null) } },
  });
  assert.equal(frameUnsettled(frameWith('true')), true);
  assert.equal(frameUnsettled(frameWith(null)), false);
  assert.equal(frameUnsettled({ contentDocument: null }), false);
  assert.equal(frameUnsettled(null), false);
  const throwing = {
    get contentDocument() {
      throw new Error('SecurityError');
    },
  };
  assert.equal(frameUnsettled(throwing), false);
});

test('pendingPhases は part.state が pending のカードの段だけを返す（答え済み・取り消しで閉じたカードは数えない）', () => {
  const rows = new Map([
    ['open', { part: { state: 'pending' } }],
    ['answered', { part: { state: 'answered' } }],
    ['cancelled', { part: { state: 'cancelled' } }],
    ['broken', { part: null }],
  ]);
  const phases: Record<string, string> = { open: 'idle', answered: 'unknown', cancelled: 'partial', broken: 'sending' };
  assert.deepEqual(
    pendingPhases(rows, (key: string) => phases[key] ?? ''),
    ['idle'],
  );
  assert.equal(
    isUnsettled({ sendPhase: 'compose', questionPhases: pendingPhases(rows, (key: string) => phases[key] ?? '') }),
    false,
  );
  phases.open = 'sending';
  assert.deepEqual(
    pendingPhases(rows, (key: string) => phases[key] ?? ''),
    ['sending'],
  );
});
