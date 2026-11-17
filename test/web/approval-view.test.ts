// 承認のカードの組み立て（web/embed/approval-view.js）を確かめる（T-11、T-12、T-13）。DOM に触らない純な関数と、注入した口だけの流れ。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildChat } from '../../web/embed/agent-view.js';
import {
  APPROVAL_REASONS,
  approverFor,
  buildApprovalCard,
  cancelPending,
  choose,
  createApprovalBoard,
  createChatApprover,
  createTerminalApprover,
  DEFAULT_APPROVAL_TITLE,
  detailPreview,
  initialApprovalState,
  persistentNote,
  READ_ONLY_APPROVAL_REASON,
  readOnlyApprover,
  TERMINAL_APPROVAL_REASON,
} from '../../web/embed/approval-view.js';
import { QUESTION_REASONS } from '../../web/embed/question-view.js';

// biome-ignore lint/suspicious/noExplicitAny: the parts and views are untyped JS objects
type Any = any;

const opt = (id: string, label: string, intent: string | null, description: string | null = null) => ({
  id,
  label,
  description,
  intent,
});
const OPTIONS = [
  opt('yes', '許可', 'allow_once'),
  opt('always', '常に許可', 'allow_always'),
  opt('no', '拒否', 'reject_once'),
  opt('never', '常に拒否', 'reject_always'),
];
const chatPart = (over: Record<string, unknown> = {}): Any => ({
  type: 'approval',
  source: 'chat',
  prompt: { itemId: 'item-1', revision: 2 },
  title: 'Bash を実行しますか',
  tool: 'Bash',
  description: 'ファイルを作ります',
  reason: '書き込みの許可が要ります',
  blockedPath: '/tmp/x',
  plan: null,
  detail: 'touch /tmp/x',
  options: OPTIONS,
  answerable: true,
  unanswerableReason: null,
  state: 'pending',
  selectedOptionId: null,
  ...over,
});
const terminalPart = (over: Record<string, unknown> = {}): Any => ({
  ...chatPart(),
  source: 'terminal',
  prompt: null,
  title: null,
  options: [],
  answerable: false,
  unanswerableReason: 'terminal',
  ...over,
});
const STATUS_OK = {
  enabled: true,
  available: true,
  answer: { available: true, reason: null },
  approval: { available: true, reason: null },
};
const OK = { ok: true } as const;

test('T-11：一度きりの選択肢は送る印、常に許可・常に拒否は確かめの段（送らない）、cancelPending で戻る', () => {
  const part = chatPart();
  const s0 = initialApprovalState();
  assert.deepEqual(choose(s0, part, 'yes'), { state: s0, submit: true, optionId: 'yes' });
  assert.deepEqual(choose(s0, part, 'no'), { state: s0, submit: true, optionId: 'no' });
  const always = choose(s0, part, 'always');
  assert.equal(always.submit, false);
  assert.equal(always.state.pending, 'always');
  const never = choose(s0, part, 'never');
  assert.equal(never.submit, false);
  assert.equal(never.state.pending, 'never');
  assert.equal(cancelPending(always.state).pending, null);
  assert.equal(cancelPending(s0), s0);
  // 知らない選択肢、答え済み、送っている間は何もしない。
  assert.deepEqual(choose(s0, part, 'zzz'), { state: s0, submit: false, optionId: null });
  assert.equal(choose(s0, chatPart({ state: 'answered' }), 'yes').submit, false);
  const sending = { ...s0, flow: { phase: 'sending', result: null } };
  assert.equal(choose(sending as Any, part, 'yes').submit, false);
});

test('T-11：persistentNote は選択肢の説明を使い、なければ道具か題で、何が省かれるかの1行', () => {
  const part = chatPart();
  assert.equal(persistentNote(part, OPTIONS[1]), '以後、同じ種類の確認が省かれ、自動で許可されます（Bash）');
  assert.equal(
    persistentNote(chatPart({ tool: null }), OPTIONS[3]),
    '以後、同じ種類の確認が省かれ、自動で拒否されます（Bash を実行しますか）',
  );
  assert.equal(persistentNote(part, opt('a', 'A', 'allow_always', 'この作業の間だけ')), 'この作業の間だけ');
});

test('T-11：板の confirm は confirmPersistent 真で submit を1回だけ呼び、sending の間の押しを捨て、やめると送らない', async () => {
  const calls: Any[] = [];
  let release: (v: Any) => void = () => {};
  const chat = {
    availability: () => OK,
    submit: (_part: Any, optionId: string, options: Any) => {
      calls.push({ optionId, ...options });
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  const board = createApprovalBoard({ approvers: { chat, readOnly: readOnlyApprover } });
  const part = chatPart();
  await board.choose('k', part, 'always', STATUS_OK);
  assert.equal(calls.length, 0, '常に許可は押しただけでは送らない');
  assert.equal(board.state('k').pending, 'always');
  board.cancel('k');
  assert.equal(board.state('k').pending, null);
  assert.equal(calls.length, 0, 'やめるは送らない');
  await board.choose('k', part, 'always', STATUS_OK);
  const first = board.confirm('k', part, STATUS_OK);
  assert.equal(board.state('k').flow.phase, 'sending');
  assert.equal(board.state('k').chosen, 'always');
  await board.confirm('k', part, STATUS_OK);
  await board.choose('k', part, 'yes', STATUS_OK);
  assert.equal(calls.length, 1, 'sending の間の押しは捨てる');
  assert.deepEqual(calls[0], { optionId: 'always', confirmPersistent: true });
  release({ kind: 'done' });
  await first;
  assert.equal(board.state('k').flow.phase, 'done');
  assert.equal(board.state('k').chosen, null);
  await board.choose('k', part, 'yes', STATUS_OK);
  assert.equal(calls.length, 1, 'done の後は送らない');
});

test('T-11：一度きりは confirmPersistent 偽で1回送り、送れない（答え済み・手段が送れない・answerable 偽）ときは送らない', async () => {
  const calls: Any[] = [];
  const chat = {
    availability: (_p: Any, status: Any) => (status?.enabled ? OK : { ok: false, reason: 'x' }),
    submit: async (_part: Any, optionId: string, options: Any) => {
      calls.push({ optionId, ...options });
      return { kind: 'refused', reason: 'だめ' };
    },
  };
  const board = createApprovalBoard({ approvers: { chat, readOnly: readOnlyApprover } });
  await board.choose('a', chatPart(), 'no', STATUS_OK);
  assert.deepEqual(calls, [{ optionId: 'no', confirmPersistent: false }]);
  assert.equal(board.state('a').flow.phase, 'refused');
  await board.choose('a', chatPart(), 'yes', STATUS_OK);
  assert.equal(calls.length, 2, 'refused の後は押し直せる');
  await board.choose('b', chatPart({ state: 'answered' }), 'yes', STATUS_OK);
  await board.choose('c', chatPart(), 'yes', { ...STATUS_OK, enabled: false });
  await board.choose('d', chatPart({ answerable: false }), 'yes', STATUS_OK);
  await board.choose('e', terminalPart({ options: OPTIONS }), 'yes', STATUS_OK);
  await board.confirm('f', chatPart(), STATUS_OK);
  assert.equal(calls.length, 2);
});

test('T-11：結果不明の後は自動で送り直さず、照会は check を1回、閉じると戻る', async () => {
  let submits = 0;
  const checks: string[] = [];
  const chat = {
    availability: () => OK,
    submit: async () => {
      submits++;
      return { kind: 'unknown', operationId: 'op-1' };
    },
    check: async (id: string) => {
      checks.push(id);
      return { kind: 'unknown', operationId: id, note: 'まだ' };
    },
  };
  const board = createApprovalBoard({ approvers: { chat, readOnly: readOnlyApprover } });
  const part = chatPart();
  await board.choose('k', part, 'yes', STATUS_OK);
  assert.equal(board.state('k').flow.phase, 'unknown');
  await board.choose('k', part, 'yes', STATUS_OK);
  assert.equal(submits, 1, 'unknown の間は送らない');
  await board.query('k', part);
  assert.deepEqual(checks, ['op-1']);
  assert.equal(submits, 1);
  const view = buildApprovalCard(part, { key: 'k', state: board.state('k'), availability: OK });
  assert.ok(view.unknown);
  assert.equal(view.notice?.text, 'まだ');
  board.dismiss('k');
  assert.equal(board.state('k').flow.phase, 'idle');
  board.prune(new Set());
  assert.equal(board.state('k').flow.phase, 'idle');
});

test('T-12：未回答のカードは題、道具、説明、理由、要るパス、detail の下見、選択肢と主の印を持つ', () => {
  const view = buildApprovalCard(chatPart(), { key: 'm:1', availability: OK });
  assert.equal(view.closed, false);
  assert.equal(view.key, 'm:1');
  assert.equal(view.title, 'Bash を実行しますか');
  assert.equal(view.tool, 'Bash');
  assert.equal(view.description, 'ファイルを作ります');
  assert.equal(view.reason, '書き込みの許可が要ります');
  assert.equal(view.blockedPath, '/tmp/x');
  assert.deepEqual(view.detail, { preview: 'touch /tmp/x', full: 'touch /tmp/x', hasMore: false });
  assert.equal(view.plan, null);
  assert.deepEqual(
    view.options.map((o: Any) => [o.id, o.primary, o.disabled, o.busy]),
    [
      ['yes', true, false, false],
      ['always', false, false, false],
      ['no', false, false, false],
      ['never', false, false, false],
    ],
  );
  assert.equal(view.confirm, null);
  assert.equal(view.summary, null);
  assert.equal(view.reasonText, null);
  assert.equal(view.open, false);
  assert.equal(buildApprovalCard(chatPart({ title: null }), { availability: OK }).title, DEFAULT_APPROVAL_TITLE);
});

test('T-12：確かめの段は選択肢のラベルと1行を持ち、選択肢は押せない', () => {
  const state = choose(initialApprovalState(), chatPart(), 'always').state;
  const view = buildApprovalCard(chatPart(), { state, availability: OK });
  assert.deepEqual(view.confirm, {
    optionId: 'always',
    label: '常に許可',
    note: '以後、同じ種類の確認が省かれ、自動で許可されます（Bash）',
  });
  assert.ok(view.options.every((o: Any) => o.disabled));
});

test('T-12：長い detail は Orca と同じ下見（512 字・4 行と「…」）と詳しく、計画があれば detail を描かない', () => {
  const long = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
  assert.equal(detailPreview(long), 'line 0\nline 1\nline 2\nline 3…');
  const wide = 'x'.repeat(600);
  assert.equal(detailPreview(wide), `${'x'.repeat(512)}…`);
  assert.equal(detailPreview('a\nb\n'), 'a\nb\n');
  const view = buildApprovalCard(chatPart({ detail: long }), { availability: OK });
  assert.deepEqual(view.detail, { preview: 'line 0\nline 1\nline 2\nline 3…', full: long, hasMore: true });
  const plan = buildApprovalCard(chatPart({ plan: { text: '# 計画', filePath: 'plan.md' }, detail: '# 計画' }), {
    availability: OK,
  });
  assert.deepEqual(plan.plan, { text: '# 計画', filePath: 'plan.md' });
  assert.equal(plan.detail, null);
});

test('T-12：答え済みは intent による言葉とラベル、選択肢にない id は「答え済み」、取り消しは「取り消されました」の閉じた形', () => {
  const cases: [Any, string][] = [
    [chatPart({ state: 'answered', selectedOptionId: 'yes' }), '許可しました：許可'],
    [chatPart({ state: 'answered', selectedOptionId: 'never' }), '拒否しました：常に拒否'],
    [chatPart({ state: 'answered', selectedOptionId: 'n', options: [opt('n', '続ける', null)] }), '答えました：続ける'],
    [chatPart({ state: 'answered', selectedOptionId: null }), '答え済み'],
    [chatPart({ state: 'answered', selectedOptionId: 'gone' }), '答え済み'],
    [chatPart({ state: 'cancelled' }), '取り消されました'],
  ];
  for (const [part, summary] of cases) {
    const view = buildApprovalCard(part, { availability: OK });
    assert.equal(view.closed, true);
    assert.equal(view.summary, summary);
    assert.equal(view.notice, null);
    assert.equal(view.reasonText, null);
    assert.equal(view.open, false);
    assert.ok(view.options.every((o: Any) => o.disabled));
  }
  const yes = buildApprovalCard(chatPart({ state: 'answered', selectedOptionId: 'yes' }), { availability: OK });
  assert.deepEqual(
    yes.options.filter((o: Any) => o.selected).map((o: Any) => o.id),
    ['yes'],
  );
});

test('T-12：buildChat は approval の部分を approval の行にし、ツールの結果と結びつけない', () => {
  const part = chatPart();
  const rows = buildChat([
    {
      id: 'm1',
      role: 'assistant',
      at: '2026-11-18T00:00:00.000Z',
      parts: [{ type: 'tool-call', name: 'Bash', input: '{}', callId: 'c1' }, part],
    },
    {
      id: 'm2',
      role: 'user',
      at: '2026-11-18T00:00:01.000Z',
      parts: [{ type: 'tool-result', callId: 'c1', output: 'ok', isError: false }],
    },
  ]);
  assert.deepEqual(
    rows.map((r: Any) => r.kind),
    ['tool', 'approval'],
  );
  assert.deepEqual(rows[1], { kind: 'approval', key: 'm1:1', at: '2026-11-18T00:00:00.000Z', part });
  assert.equal(rows[0].output, 'ok');
});

test('T-13：chat の approver は意図と確定を1回ずつ送り（optionId と confirmPersistent）、確定の応答を失えば unknown で送り直さない', async () => {
  const sent: Any[] = [];
  const replies: Any[] = [
    { status: 200, body: { ok: true, ticket: 't1', operationId: 'op-1' } },
    { status: 200, body: { ok: true, outcome: 'submitted', detail: {} } },
  ];
  const writer = {
    send: async (path: string, method: string, body: unknown) => {
      sent.push({ path, method, body });
      return replies.shift();
    },
  };
  const approver = createChatApprover({ agentId: 'a1', writer });
  assert.deepEqual(await approver.submit(chatPart(), 'always', { confirmPersistent: true }), { kind: 'done' });
  assert.deepEqual(sent, [
    {
      path: '/api/approval/intent',
      method: 'POST',
      body: { agent: 'a1', prompt: { itemId: 'item-1', revision: 2 }, optionId: 'always', confirmPersistent: true },
    },
    { path: '/api/approval/confirm', method: 'POST', body: { ticket: 't1', optionId: 'always' } },
  ]);

  const again: Any[] = [];
  const lost = createChatApprover({
    agentId: 'a1',
    writer: {
      send: async (path: string, method: string, body: unknown) => {
        again.push({ path, method, body });
        if (path.endsWith('/confirm')) throw new Error('lost');
        return { status: 200, body: { ok: true, ticket: 't2', operationId: 'op-2' } };
      },
    },
  });
  assert.deepEqual(await lost.submit(chatPart(), 'yes'), { kind: 'unknown', operationId: 'op-2' });
  assert.equal(again.length, 2, '送り直さない');
  assert.equal(again[0].body.confirmPersistent, false);
});

test('T-13：chat の approver は意図の拒みと確定の refused を、承認の言葉で返す（「質問」の字を出さない）', async () => {
  const intentRefused = createChatApprover({
    agentId: 'a1',
    writer: {
      send: async () => ({ status: 409, body: { ok: false, error: 'target_changed', reason: 'question_changed' } }),
    },
  });
  assert.deepEqual(await intentRefused.submit(chatPart(), 'yes'), {
    kind: 'refused',
    reason: '許可の確認が変わりました',
  });
  const persistent = createChatApprover({
    agentId: 'a1',
    writer: {
      send: async () => ({
        status: 400,
        body: { ok: false, error: 'invalid_answer', reason: 'persistent_unconfirmed' },
      }),
    },
  });
  assert.deepEqual(await persistent.submit(chatPart(), 'always'), {
    kind: 'refused',
    reason: '確かめてから答えてください',
  });
  const replies: Any[] = [
    { status: 200, body: { ok: true, ticket: 't', operationId: 'op' } },
    { status: 200, body: { ok: true, outcome: 'refused', detail: { code: 'cancelled' } } },
  ];
  const confirmRefused = createChatApprover({ agentId: 'a1', writer: { send: async () => replies.shift() } });
  assert.deepEqual(await confirmRefused.submit(chatPart(), 'yes'), {
    kind: 'refused',
    reason: '許可の確認は取り消されました',
  });
  for (const [code, text] of Object.entries(APPROVAL_REASONS)) assert.doesNotMatch(text, /質問/, code);
  assert.equal(QUESTION_REASONS.question_changed, '質問が変わりました', '質問の表は変えない');
});

test('T-13：chat の approver の照会は /api/send/{id}?check=1 を1回読み、送らない', async () => {
  const urls: string[] = [];
  let writes = 0;
  const approver = createChatApprover({
    agentId: 'a1',
    writer: {
      send: async () => {
        writes++;
        return { status: 500, body: {} };
      },
    },
    read: async (url: string) => {
      urls.push(url);
      return {
        status: 200,
        body: { state: 'recorded', record: { outcome: 'refused', detail: { code: 'resolved_by_other' } } },
      };
    },
  });
  assert.deepEqual(await approver.check('op 1'), { kind: 'refused', reason: 'ほかの画面で答え済みです' });
  assert.deepEqual(urls, ['/api/send/op%201?check=1']);
  assert.equal(writes, 0);
});

test('T-13：送れるかは sendEnabled と approval.available で決め、偽なら理由を出して選択肢を押せない', () => {
  const approver = createChatApprover({ agentId: 'a1', writer: { send: async () => ({ status: 500, body: {} }) } });
  const part = chatPart();
  assert.deepEqual(approver.availability(part, STATUS_OK), OK);
  const off = approver.availability(part, { ...STATUS_OK, enabled: false });
  assert.deepEqual(off, { ok: false, reason: APPROVAL_REASONS.send_disabled });
  const unavailable = approver.availability(part, {
    ...STATUS_OK,
    approval: { available: false, reason: 'unsupported' },
  });
  assert.deepEqual(unavailable, { ok: false, reason: 'この Orca の版では、ここから許可に答えられません' });
  assert.equal(approver.availability(part, { enabled: true, answer: { available: true } }).ok, false, '古い形');
  assert.deepEqual(approver.availability(part, null), { ok: false, reason: APPROVAL_REASONS.loading });
  for (const availability of [off, unavailable]) {
    const view = buildApprovalCard(part, { availability });
    assert.ok(view.options.every((o: Any) => o.disabled));
    assert.equal(view.reasonText, (availability as Any).reason);
    assert.equal(view.open, false);
  }
});

test('T-13：端末と answerable 偽の承認は読むだけの手段で、選択肢を押せず、理由と Orca で開くの印を持つ', async () => {
  const chat = createChatApprover({ agentId: 'a1', writer: { send: async () => ({ status: 500, body: {} }) } });
  const approvers = { chat, readOnly: readOnlyApprover };
  assert.equal(approverFor(chatPart(), approvers), chat);
  assert.equal(approverFor(terminalPart(), approvers), readOnlyApprover);
  const url = chatPart({ answerable: false, unanswerableReason: 'url' });
  assert.equal(approverFor(url, approvers), readOnlyApprover);

  const terminal = buildApprovalCard(terminalPart(), {
    availability: readOnlyApprover.availability(terminalPart(), STATUS_OK),
  });
  assert.equal(terminal.reasonText, TERMINAL_APPROVAL_REASON);
  assert.equal(terminal.open, true);
  assert.equal(terminal.title, DEFAULT_APPROVAL_TITLE);
  assert.deepEqual(terminal.options, []);
  const readOnly = buildApprovalCard(url, { availability: readOnlyApprover.availability(url, STATUS_OK) });
  assert.equal(readOnly.reasonText, READ_ONLY_APPROVAL_REASON);
  assert.equal(readOnly.open, true);
  assert.ok(readOnly.options.every((o: Any) => o.disabled));
  // 手段が ok でも answerable 偽なら押せない。
  assert.ok(buildApprovalCard(url, { availability: OK }).options.every((o: Any) => o.disabled));
  assert.equal((await readOnlyApprover.submit(terminalPart(), 'yes', {})).kind, 'refused');
});

// iss-00054（端末の承認の答え）。端末の承認の部分は promptId と2つの選択肢、answerable を持つ。
const TERMINAL_OPTIONS = [
  { id: 'allow_once', label: 'Allow once', description: null, intent: 'allow_once' },
  { id: 'reject_once', label: 'Reject', description: null, intent: 'reject_once' },
];
const PROMPT_ID = 'ta_0123456789abcdef0123';
const keysPart = (over: Record<string, unknown> = {}): Any => ({
  ...terminalPart(),
  promptId: PROMPT_ID,
  tool: 'Bash',
  description: 'rm -rf build',
  reason: null,
  blockedPath: null,
  detail: null,
  options: TERMINAL_OPTIONS,
  answerable: true,
  unanswerableReason: null,
  ...over,
});
const KEYS_OK = { ...STATUS_OK, agentType: 'claude', answerKeys: { available: true, reason: null } };
const noWriter = { send: async () => ({ status: 500, body: {} }) };
/** 返事を順に返す writer と、送った物の記録。 */
const scripted = (replies: Any[]) => {
  const sent: Any[] = [];
  return {
    sent,
    writer: {
      send: async (path: string, method: string, body: unknown) => {
        sent.push({ path, method, body });
        const next = replies.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
};
const INTENT_OK = { status: 200, body: { ok: true, ticket: 't1', operationId: 'op-1' } };

test('iss-00054 T-09：端末の手段は promptId・answerable・status・sendEnabled・answerKeys で押せるかを決め、押せない形はみな理由と open 真', () => {
  const approver = createTerminalApprover({ agentId: 'a1', writer: noWriter });
  const part = keysPart();
  assert.deepEqual(approver.availability(part, KEYS_OK), OK);
  const cases: [Any, Any, string][] = [
    [keysPart({ promptId: null }), KEYS_OK, APPROVAL_REASONS.unknown_shape],
    [keysPart({ promptId: undefined }), KEYS_OK, APPROVAL_REASONS.unknown_shape],
    [
      keysPart({ answerable: false, unanswerableReason: 'terminal', truncated: true }),
      KEYS_OK,
      TERMINAL_APPROVAL_REASON,
    ],
    [part, 'failed', APPROVAL_REASONS.status_unavailable],
    [part, { ...KEYS_OK, enabled: false }, APPROVAL_REASONS.send_disabled],
    [part, { ...KEYS_OK, answerKeys: undefined }, APPROVAL_REASONS.unknown_shape],
    [
      part,
      { ...KEYS_OK, answerKeys: { available: false, reason: 'agent_keys_unknown' } },
      'このエージェントの許可の確認は、ここからは答えられません',
    ],
    [
      part,
      { ...KEYS_OK, answerKeys: { available: false, reason: 'unsupported' } },
      'この Orca の版では、ここから許可に答えられません',
    ],
  ];
  for (const [p, status, reason] of cases) {
    const got = approver.availability(p, status);
    assert.deepEqual(got, { ok: false, reason, open: true }, reason);
    const view = buildApprovalCard(p, { availability: got });
    assert.ok(
      view.options.every((o: Any) => o.disabled),
      reason,
    );
    assert.equal(view.reasonText, reason);
    assert.equal(view.open, true);
  }
  assert.deepEqual(approver.availability(part, null), { ok: false, reason: APPROVAL_REASONS.loading });
  assert.equal(
    buildApprovalCard(part, { availability: approver.availability(part, null) }).open,
    true,
    '読み込み中も開ける',
  );
});

test('iss-00054 T-09：端末の手段の submit は意図と確定を1回ずつ {agent, promptId, optionId, confirmPersistent}・{ticket, optionId} で送り、approverFor は端末に terminal の手段を選ぶ', async () => {
  const { sent, writer } = scripted([
    INTENT_OK,
    { status: 200, body: { ok: true, operationId: 'op-1', outcome: 'input_accepted', detail: { code: 'keys_sent' } } },
  ]);
  const approver = createTerminalApprover({ agentId: 'a1', writer });
  const result = await approver.submit(keysPart(), 'allow_once', { confirmPersistent: false });
  assert.deepEqual(result, { kind: 'done', note: '答えを送りました。エージェントの続きを待っています' });
  assert.deepEqual(sent, [
    {
      path: '/api/approval/intent',
      method: 'POST',
      body: { agent: 'a1', promptId: PROMPT_ID, optionId: 'allow_once', confirmPersistent: false },
    },
    { path: '/api/approval/confirm', method: 'POST', body: { ticket: 't1', optionId: 'allow_once' } },
  ]);
  assert.equal('check' in approver, false, '照会しない');
  const chat = createChatApprover({ agentId: 'a1', writer: noWriter });
  const approvers = { chat, readOnly: readOnlyApprover, terminal: approver };
  assert.equal(approverFor(keysPart(), approvers), approver);
  assert.equal(approverFor(keysPart({ answerable: false }), approvers), approver);
  assert.equal(approverFor(chatPart(), approvers), chat);
  // promptId のない部分は送らない。
  const none = scripted([]);
  const bare = createTerminalApprover({ agentId: 'a1', writer: none.writer });
  assert.equal((await bare.submit(keysPart({ promptId: null }), 'allow_once', {})).kind, 'refused');
  assert.equal(none.sent.length, 0);
});

test('iss-00054 T-10：確定の結果は done・blocked（200 の refused）・partial（200 の unknown、応答の欠け、通信の誤り）で、送り直さない', async () => {
  const run = async (confirm: Any) => {
    const { sent, writer } = scripted([INTENT_OK, confirm]);
    const result = await createTerminalApprover({ agentId: 'a1', writer }).submit(keysPart(), 'reject_once', {});
    assert.equal(sent.length, 2, '送り直さない');
    return result;
  };
  assert.deepEqual(await run({ status: 200, body: { ok: true, outcome: 'refused', detail: { code: 'not_sent' } } }), {
    kind: 'blocked',
    reason: '送っていません。この許可の確認には、ここからはもう送れません。Orca で答えてください',
  });
  const partial = { kind: 'partial', operationId: 'op-1', note: '届いたか分かりません。Orca で確かめてください' };
  assert.deepEqual(
    await run({ status: 200, body: { ok: true, outcome: 'unknown', detail: { code: 'unconfirmed' } } }),
    partial,
  );
  assert.deepEqual(await run({ status: 200, body: {} }), partial);
  assert.deepEqual(await run({ status: 502, body: null }), partial);
  assert.deepEqual(await run(new Error('lost')), partial);
  // 確定の送る前の拒みは送っていない。押し直せる拒みと二度と送らない拒みを reason で分ける。
  assert.deepEqual(await run({ status: 409, body: { ok: false, error: 'target_changed', reason: 'question_gone' } }), {
    kind: 'blocked',
    reason: APPROVAL_REASONS.question_gone,
  });
  assert.deepEqual(await run({ status: 409, body: { ok: false, error: 'busy' } }), {
    kind: 'refused',
    reason: APPROVAL_REASONS.busy,
  });
});

test('iss-00054 T-10：意図の already_sent・question_gone・prompt_mismatch・prompt_unsupported・agent_keys_unknown は blocked、prompt_unverified などは押し直せる refused', async () => {
  const intent = async (body: Any, status = 409) => {
    const { sent, writer } = scripted([{ status, body }]);
    const result = await createTerminalApprover({ agentId: 'a1', writer }).submit(keysPart(), 'allow_once', {});
    assert.equal(sent.length, 1, '確定を送らない');
    return result;
  };
  for (const reason of [
    'already_sent',
    'question_answered',
    'question_gone',
    'prompt_mismatch',
    'prompt_unsupported',
    'agent_keys_unknown',
  ])
    assert.deepEqual(
      await intent({ ok: false, error: 'not_sendable', reason }),
      {
        kind: 'blocked',
        reason: APPROVAL_REASONS[reason as keyof typeof APPROVAL_REASONS],
      },
      reason,
    );
  assert.deepEqual(await intent({ ok: false, error: 'not_sendable', reason: 'prompt_unverified' }), {
    kind: 'refused',
    reason: '端末がこの許可の確認を出しているか確かめられません',
  });
  assert.deepEqual(await intent({ ok: false, error: 'unreachable' }, 503), {
    kind: 'refused',
    reason: APPROVAL_REASONS.unreachable,
  });
  const thrown = scripted([new Error('down')]);
  assert.deepEqual(
    await createTerminalApprover({ agentId: 'a1', writer: thrown.writer }).submit(keysPart(), 'allow_once', {}),
    {
      kind: 'refused',
      reason: APPROVAL_REASONS.network,
    },
  );
});

test('iss-00054 T-10：板の流れ：done は知らせ、partial は帯で押し直し・閉じる・照会を受けず、blocked は理由で押せず、refused は押し直せる。どれも送ったと偽らず open 真', async () => {
  const flowFor = async (replies: Any[]) => {
    const { sent, writer } = scripted(replies);
    const terminal = createTerminalApprover({ agentId: 'a1', writer });
    const board = createApprovalBoard({
      approvers: { chat: createChatApprover({ agentId: 'a1', writer }), readOnly: readOnlyApprover, terminal },
    });
    const part = keysPart();
    await board.choose('k', part, 'allow_once', KEYS_OK);
    const view = () =>
      buildApprovalCard(part, {
        key: 'k',
        state: board.state('k'),
        availability: terminal.availability(part, KEYS_OK),
      });
    return { board, part, sent, view };
  };

  const done = await flowFor([
    INTENT_OK,
    { status: 200, body: { ok: true, outcome: 'input_accepted', detail: { code: 'keys_sent' } } },
  ]);
  assert.equal(done.board.state('k').flow.phase, 'done');
  assert.deepEqual(done.view().notice, { kind: 'info', text: '答えを送りました。エージェントの続きを待っています' });
  assert.ok(done.view().options.every((o: Any) => o.disabled));
  assert.equal(done.view().open, true);

  const partial = await flowFor([
    INTENT_OK,
    { status: 200, body: { ok: true, outcome: 'unknown', detail: { code: 'unconfirmed' } } },
  ]);
  assert.equal(partial.board.state('k').flow.phase, 'partial');
  let view = partial.view();
  assert.deepEqual(view.partial, { text: '届いたか分かりません。Orca で確かめてください' });
  assert.equal(view.unknown, null, '照会の帯を出さない');
  assert.equal(view.blocked, null);
  assert.equal(view.open, true);
  assert.ok(view.options.every((o: Any) => o.disabled));
  assert.doesNotMatch(JSON.stringify(view.notice ?? ''), /答えました|送りました/);
  await partial.board.choose('k', partial.part, 'reject_once', KEYS_OK);
  await partial.board.query('k', partial.part);
  partial.board.dismiss('k');
  assert.equal(partial.board.state('k').flow.phase, 'partial');
  assert.equal(partial.sent.length, 2, '押し直し・照会・閉じるで送らない');

  const blocked = await flowFor([{ status: 409, body: { ok: false, error: 'not_sendable', reason: 'already_sent' } }]);
  view = blocked.view();
  assert.equal(blocked.board.state('k').flow.phase, 'blocked');
  assert.deepEqual(view.blocked, { text: APPROVAL_REASONS.already_sent });
  assert.equal(view.partial, null);
  assert.equal(view.open, true);
  assert.ok(view.options.every((o: Any) => o.disabled));
  await blocked.board.choose('k', blocked.part, 'allow_once', KEYS_OK);
  assert.equal(blocked.sent.length, 1, '押し直せない');

  const refused = await flowFor([
    { status: 409, body: { ok: false, error: 'not_sendable', reason: 'prompt_unverified' } },
    INTENT_OK,
    { status: 200, body: { ok: true, outcome: 'input_accepted', detail: { code: 'keys_sent' } } },
  ]);
  view = refused.view();
  assert.equal(refused.board.state('k').flow.phase, 'refused');
  assert.deepEqual(view.notice, { kind: 'error', text: '端末がこの許可の確認を出しているか確かめられません' });
  assert.equal(view.open, true);
  assert.ok(
    view.options.every((o: Any) => !o.disabled),
    '押し直せる',
  );
  await refused.board.choose('k', refused.part, 'allow_once', KEYS_OK);
  assert.equal(refused.board.state('k').flow.phase, 'done');

  // 未回答の押せる端末のカードも「Orca で開く」を出す。
  const fresh = buildApprovalCard(keysPart(), { availability: OK });
  assert.equal(fresh.open, true);
  assert.ok(fresh.options.every((o: Any) => !o.disabled));
  assert.equal(fresh.confirm, null);
  // 構造化 Chat の押せるカードは今のまま開くを出さない。
  assert.equal(buildApprovalCard(chatPart(), { availability: OK }).open, false);
});
