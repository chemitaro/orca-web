import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  MAX_APPROVAL_DESCRIPTION_CHARS,
  MAX_APPROVAL_LABEL_CHARS,
  matchTerminalApproval,
  readTerminalApproval,
  TERMINAL_APPROVAL_OPTIONS,
  terminalApprovalId,
} from '../../src/transcript/terminal-approval.ts';

const approvalJson = (approval: unknown) => JSON.stringify({ approval });
const waiting = (interactivePrompt: unknown, stateStartedAt: unknown = 1000, state: unknown = 'waiting') => ({
  state,
  interactivePrompt,
  stateStartedAt,
});

test('T-01 TERMINAL_APPROVAL_OPTIONS は Orca の readAgentPromptAnswers と同じ2つの選択肢', () => {
  assert.deepEqual(TERMINAL_APPROVAL_OPTIONS, [
    { id: 'allow_once', label: 'Allow once', description: null, intent: 'allow_once' },
    { id: 'reject_once', label: 'Reject', description: null, intent: 'reject_once' },
  ]);
});

test('T-01 terminalApprovalId は ta_ と16進20字で、interactivePrompt と stateStartedAt の digest', () => {
  const prompt = approvalJson({ tool: 'Bash' });
  const id = terminalApprovalId(prompt, 1000);
  assert.match(id, /^ta_[0-9a-f]{20}$/);
  const expected = createHash('sha256')
    .update(JSON.stringify([prompt, 1000]))
    .digest('hex')
    .slice(0, 20);
  assert.equal(id, `ta_${expected}`);
  assert.equal(terminalApprovalId(prompt, 1000), id);
  assert.notEqual(terminalApprovalId(prompt, 1001), id);
  assert.notEqual(terminalApprovalId(approvalJson({ tool: 'Edit' }), 1000), id);
  // 数と文字はそのまま、ほかは null として digest にする。
  assert.equal(
    terminalApprovalId(prompt, '1000'),
    `ta_${createHash('sha256')
      .update(JSON.stringify([prompt, '1000']))
      .digest('hex')
      .slice(0, 20)}`,
  );
  assert.equal(terminalApprovalId(prompt, undefined), terminalApprovalId(prompt, null));
  assert.equal(terminalApprovalId(prompt, { at: 1 }), terminalApprovalId(prompt, null));
});

test('T-01 readTerminalApproval：null・物でない・待っているのに interactivePrompt がない（空の文字を含む）は unverified', () => {
  const cases: [string, unknown][] = [
    ['null', null],
    ['文字', 'waiting'],
    ['配列', []],
    ['interactivePrompt がない', waiting(undefined)],
    ['interactivePrompt が空', waiting('')],
    ['interactivePrompt が数', waiting(1)],
    ['blocked で interactivePrompt が null', waiting(null, 0, 'blocked')],
  ];
  for (const [name, status] of cases) {
    assert.deepEqual(readTerminalApproval(status as never), { kind: 'unverified' }, name);
  }
});

test('T-01 readTerminalApproval：state が blocked・waiting でなければ not_waiting', () => {
  for (const state of ['working', 'done', null, undefined]) {
    assert.deepEqual(
      readTerminalApproval({ state, interactivePrompt: approvalJson({ tool: 'Bash' }), stateStartedAt: 0 }),
      { kind: 'not_waiting' },
      String(state),
    );
  }
});

test('T-01 readTerminalApproval：JSON でない・物でない・approval のない封筒（質問）・tool が空は other', () => {
  const cases: [string, string][] = [
    ['JSON でない', '{not json'],
    ['物でない JSON', '[1]'],
    ['null の JSON', 'null'],
    ['質問の封筒', JSON.stringify({ questions: [{ question: 'x' }] })],
    ['approval が文字', approvalJson('Bash')],
    ['tool が空', approvalJson({ tool: '' })],
    ['tool がない', approvalJson({ summary: 'x' })],
    ['tool が数', approvalJson({ tool: 1 })],
  ];
  for (const [name, prompt] of cases) {
    assert.deepEqual(readTerminalApproval(waiting(prompt)), { kind: 'other' }, name);
  }
});

test('T-01 readTerminalApproval：承認の封筒を読み、summary は空でない文字のときだけ、上限を超えれば truncated', () => {
  for (const state of ['blocked', 'waiting']) {
    const prompt = approvalJson({ tool: 'Bash', summary: 'ls -la' });
    assert.deepEqual(readTerminalApproval(waiting(prompt, 5, state)), {
      kind: 'approval',
      promptId: terminalApprovalId(prompt, 5),
      tool: 'Bash',
      summary: 'ls -la',
      truncated: false,
    });
  }
  for (const summary of ['', 1, null, undefined]) {
    const read = readTerminalApproval(waiting(approvalJson({ tool: 'Bash', summary })));
    assert.equal(read.kind === 'approval' && read.summary, null, String(summary));
  }
  const atLimit = readTerminalApproval(
    waiting(
      approvalJson({ tool: 'T'.repeat(MAX_APPROVAL_LABEL_CHARS), summary: 'S'.repeat(MAX_APPROVAL_DESCRIPTION_CHARS) }),
    ),
  );
  assert.equal(atLimit.kind === 'approval' && atLimit.truncated, false);
  const longTool = readTerminalApproval(waiting(approvalJson({ tool: 'T'.repeat(MAX_APPROVAL_LABEL_CHARS + 1) })));
  assert.equal(longTool.kind === 'approval' && longTool.truncated, true);
  const longSummary = readTerminalApproval(
    waiting(approvalJson({ tool: 'Bash', summary: 'S'.repeat(MAX_APPROVAL_DESCRIPTION_CHARS + 1) })),
  );
  assert.equal(longSummary.kind === 'approval' && longSummary.truncated, true);
});

test('T-01 matchTerminalApproval：match・unverified・gone・mismatch・truncated', () => {
  const prompt = approvalJson({ tool: 'Bash' });
  const id = terminalApprovalId(prompt, 7);
  assert.equal(matchTerminalApproval(waiting(prompt, 7), id), 'match');
  assert.equal(matchTerminalApproval(null, id), 'unverified');
  assert.equal(matchTerminalApproval(waiting(''), id), 'unverified');
  assert.equal(matchTerminalApproval(waiting(prompt, 7, 'working'), id), 'gone');
  assert.equal(matchTerminalApproval(waiting(prompt, 8), id), 'mismatch');
  assert.equal(matchTerminalApproval(waiting(JSON.stringify({ questions: [] }), 7), id), 'mismatch');
  const long = approvalJson({ tool: 'T'.repeat(MAX_APPROVAL_LABEL_CHARS + 1) });
  assert.equal(matchTerminalApproval(waiting(long, 7), terminalApprovalId(long, 7)), 'truncated');
  assert.equal(matchTerminalApproval(waiting(long, 7), id), 'mismatch');
});
