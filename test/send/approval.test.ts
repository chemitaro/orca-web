import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkOption, digestOption } from '../../src/send/approval.ts';
import type { ApprovalOptionView } from '../../src/transcript/normalize.ts';

const options: ApprovalOptionView[] = [
  { id: 'allow', label: 'Allow', description: null, intent: 'allow_once' },
  { id: 'allowForSession', label: 'Allow for this session', description: null, intent: 'allow_always' },
  { id: 'deny', label: 'Deny', description: null, intent: 'reject_once' },
  { id: 'denyAlways', label: 'Always deny', description: null, intent: 'reject_always' },
  { id: 'stop', label: 'Stop', description: null, intent: null },
];
const approval = { options, answerable: true };

test('T-06 checkOption は一度きりの選択肢と intent のない選択肢を通し、選んだ選択肢を返す', () => {
  for (const id of ['allow', 'deny', 'stop']) {
    const checked = checkOption(approval, id, undefined);
    assert.ok(checked.ok, id);
    assert.equal(checked.option.id, id);
  }
  assert.ok(checkOption(approval, 'allow', false).ok);
});

test('T-06 checkOption は allow_always・reject_always を confirmPersistent が true のときだけ通す', () => {
  for (const id of ['allowForSession', 'denyAlways']) {
    for (const confirm of [undefined, false, 'true', 1, null])
      assert.deepEqual(
        checkOption(approval, id, confirm),
        { ok: false, error: 'invalid_answer', reason: 'persistent_unconfirmed' },
        `${id} ${String(confirm)}`,
      );
    const checked = checkOption(approval, id, true);
    assert.ok(checked.ok);
    assert.equal(checked.option.intent, id === 'allowForSession' ? 'allow_always' : 'reject_always');
  }
});

test('T-06 checkOption は answerable 偽、形の誤り、選択肢にない id を invalid_answer とその reason で拒む', () => {
  assert.deepEqual(checkOption({ options, answerable: false }, 'allow', true), {
    ok: false,
    error: 'invalid_answer',
    reason: 'not_answerable',
  });
  for (const id of [undefined, null, 1, '', 'o'.repeat(1025), ['allow']])
    assert.deepEqual(
      checkOption(approval, id, true),
      { ok: false, error: 'invalid_answer', reason: 'invalid_option' },
      String(id),
    );
  assert.deepEqual(checkOption(approval, 'gone', true), {
    ok: false,
    error: 'invalid_answer',
    reason: 'unknown_option',
  });
});

test('T-06 digestOption は {optionId} の決めた JSON の sha256', () => {
  // 手で書いた JSON: {"optionId":"allow"}
  assert.equal(digestOption('allow'), '1742f3684cd649fbbd068bee9f138722c406352a0a1939d55c0b5d7b69194320');
  assert.notEqual(digestOption('deny'), digestOption('allow'));
});
