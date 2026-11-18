import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  agentHref,
  buildChat,
  buildDetail,
  detailMarkWorktree,
  errorLabel,
  initialChat,
  olderResult,
  prependOlder,
  reduceChat,
  safeHref,
} from '../../web/embed/agent-view.js';
import { expectedState } from '../state/expected.ts';

const iso = (s: string): string => s;
interface DetailRow {
  label: string;
  text: string;
  note: string | null;
  href: string | null;
  links?: { text: string; href: string }[];
}
const byLabel = (detail: { rows: DetailRow[] } | null, label: string): DetailRow | undefined =>
  detail?.rows.find((r) => r.label === label);

test('buildDetail は状態、種類、モデルと推論と意味、PR と CI、開く要求を作る', () => {
  const detail = buildDetail(expectedState, 'uuid-50:uuid-51', { formatTime: iso });
  assert.ok(detail);
  assert.equal(detail.title, 'claude：text-5');
  assert.deepEqual(byLabel(detail, '種類'), { label: '種類', text: 'claude', note: null, href: null });
  assert.equal(byLabel(detail, '状態')?.text, 'working（2026-11-06T09:26:00.000Z から）');
  assert.equal(byLabel(detail, 'モデル')?.text, 'claude-opus-5-5（起動時の解決）');
  assert.equal(byLabel(detail, '推論')?.text.startsWith('xhigh（'), true);
  assert.equal(byLabel(detail, 'worktree')?.text, 'feature-a');
  assert.equal(byLabel(detail, 'PR')?.text, '#12 open text-1');
  assert.equal(byLabel(detail, 'PR')?.href, null, 'https でない URL はリンクにしない');
  assert.equal(byLabel(detail, 'CI')?.text, 'success 3/3');
  assert.deepEqual(detail.open, { worktree: 'uuid-1::/p-1/p-2', agent: 'uuid-50:uuid-51' });
});

test('buildDetail は、取れない値を「—」と理由で示す', () => {
  const detail = buildDetail(expectedState, 'uuid-30:uuid-31', { formatTime: iso });
  assert.ok(detail);
  assert.deepEqual(byLabel(detail, 'モデル'), { label: 'モデル', text: '—', note: 'not-provided', href: null });
  assert.equal(byLabel(detail, '状態')?.text, '—');
});

test('buildDetail は親と子を、詳細の画面へのリンクで示す', () => {
  const parent = buildDetail(expectedState, 'uuid-10:uuid-11', { formatTime: iso });
  assert.ok(parent);
  const children = byLabel(parent, '子');
  assert.ok(children?.links);
  assert.equal(children.text, '1');
  assert.deepEqual(
    children.links.map((l) => l.href),
    ['/embed/agent?id=uuid-40%3Auuid-41'],
  );
  const child = buildDetail(expectedState, 'uuid-40:uuid-41', { formatTime: iso });
  assert.equal(byLabel(child, '親')?.href, '/embed/agent?id=uuid-10%3Auuid-11');
  const orphan = buildDetail(expectedState, 'uuid-50:uuid-51', { formatTime: iso });
  assert.deepEqual(byLabel(orphan, '親'), { label: '親', text: 'uuid-60:uuid-61', note: 'not-linked', href: null });
});

test('buildDetail は、構造化 Chat のタブでは agent を付けずに開き、知らない id には null', () => {
  assert.deepEqual(buildDetail(expectedState, 'chat:uuid-80')?.open, { worktree: 'uuid-1::/p-1/p-2' });
  assert.equal(buildDetail(expectedState, 'nope'), null);
});

test('safeHref は https の URL だけを返す', () => {
  assert.equal(safeHref('https://github.com/o/r/pull/1'), 'https://github.com/o/r/pull/1');
  for (const bad of ['javascript:alert(1)', 'http://example.com', 'data:text/html,x', 'text-2', null]) {
    assert.equal(safeHref(bad), null, String(bad));
  }
  assert.equal(agentHref('a:b/c'), '/embed/agent?id=a%3Ab%2Fc');
});

const msg = (id: string, role: string, parts: unknown[], at: string | null = null) => ({ id, role, at, parts });

test('buildChat は role assistant の bubble にだけ markdown 真を付け、user と tool の bubble は偽（iss-00063 R-02）', () => {
  const rows = buildChat([
    msg('u', 'user', [{ type: 'text', text: '**x**' }]),
    msg('a', 'assistant', [{ type: 'text', text: '**x**' }]),
    msg('t', 'tool', [{ type: 'text', text: '**x**' }]),
  ]);
  assert.deepEqual(
    rows.map((r: { kind: string; role: string; markdown: boolean }) => [r.kind, r.role, r.markdown]),
    [
      ['bubble', 'user', false],
      ['bubble', 'assistant', true],
      ['bubble', 'assistant', false],
    ],
  );
});

test('buildChat は吹き出し、callId で組にしたツール、表示できない印、system の知らせの行を作る', () => {
  const rows = buildChat([
    msg('m1', 'user', [{ type: 'text', text: '指示' }]),
    msg('m2', 'assistant', [
      { type: 'text', text: '答え' },
      { type: 'tool-call', name: 'Bash', input: 'ls', callId: 'c1' },
    ]),
    msg('m3', 'tool', [{ type: 'tool-result', output: 'a.txt', isError: false, callId: 'c1' }]),
    msg('m4', 'tool', [{ type: 'tool-result', output: 'orphan', isError: true, callId: 'c9' }]),
    msg('m5', 'user', [{ type: 'unsupported', what: 'image' }]),
    msg('m6', 'system', [{ type: 'text', text: 'Conversation interrupted' }]),
  ]);
  assert.deepEqual(
    rows.map((r: { kind: string }) => r.kind),
    ['bubble', 'bubble', 'tool', 'tool', 'unsupported', 'notice'],
  );
  assert.equal(rows[0].role, 'user');
  assert.equal(rows[1].role, 'assistant');
  assert.deepEqual(
    { name: rows[2].name, input: rows[2].input, output: rows[2].output, isError: rows[2].isError },
    { name: 'Bash', input: 'ls', output: 'a.txt', isError: false },
  );
  assert.deepEqual(
    { name: rows[3].name, output: rows[3].output, isError: rows[3].isError },
    {
      name: null,
      output: 'orphan',
      isError: true,
    },
  );
  assert.equal(rows[4].text, '表示できない（画像）');
  assert.equal(rows[5].text, 'Conversation interrupted');
  assert.equal(new Set(rows.map((r: { key: string }) => r.key)).size, rows.length, '行の key は重ならない');
});

const doc = (key: string, ids: string[], before: string | null = 'b1') => ({
  schema: 'orca-web.transcript/v1',
  ok: true,
  agent: { id: 'a', agentType: 'claude' },
  session: { key, short: 'aaaaaaaa', source: 'nativeChat' },
  messages: ids.map((id) => msg(id, 'assistant', [{ type: 'text', text: id }])),
  hasMore: before !== null,
  before,
  readAt: '2026-11-13T00:00:00.000Z',
});

const ids = (state: { messages: { id: string }[] }) => state.messages.map((m) => m.id);

test('reduceChat は replacement で前のページを含めて捨て、appended で同じ id を差し替えて足す', () => {
  let s = reduceChat(initialChat(), { type: 'snapshot', document: doc('k1', ['m3', 'm4']) });
  s = prependOlder(s, doc('k1', ['m1', 'm2'], null), s.generation);
  assert.deepEqual(ids(s), ['m1', 'm2', 'm3', 'm4']);
  assert.equal(s.hasMore, false);
  s = reduceChat(s, {
    type: 'appended',
    session: { key: 'k1' },
    items: [msg('m5', 'assistant', [{ type: 'text', text: 'm5' }])],
    updated: [msg('m4', 'assistant', [{ type: 'text', text: 'm4 done' }])],
  });
  assert.deepEqual(ids(s), ['m1', 'm2', 'm3', 'm4', 'm5']);
  assert.equal(s.messages[3].parts[0].text, 'm4 done');
  s = reduceChat(s, { type: 'replacement', reason: 'session-changed', document: doc('k2', ['x1']) });
  assert.deepEqual(ids(s), ['x1'], '置き換えで前のページの件も残らない');
  assert.equal(s.key, 'k2');
});

test('reduceChat は鍵の違う appended を足さない', () => {
  const s = reduceChat(initialChat(), { type: 'snapshot', document: doc('k1', ['m1']) });
  const next = reduceChat(s, {
    type: 'appended',
    session: { key: 'k2' },
    items: [msg('z', 'user', [])],
    updated: [],
  });
  assert.deepEqual(ids(next), ['m1']);
});

test('prependOlder は、要求の後に置き換えを受けたとき、または鍵が違うとき、古いページを足さない', () => {
  let s = reduceChat(initialChat(), { type: 'snapshot', document: doc('k1', ['m3']) });
  const requested = s.generation;
  s = reduceChat(s, { type: 'replacement', reason: 'rewritten', document: doc('k1', ['m9']) });
  assert.deepEqual(ids(prependOlder(s, doc('k1', ['m1']), requested)), ['m9']);
  assert.deepEqual(ids(prependOlder(s, doc('k2', ['m1']), s.generation)), ['m9']);
  assert.deepEqual(ids(prependOlder(s, doc('k1', ['m1']), s.generation)), ['m1', 'm9']);
});

test('reduceChat は unavailable で件を捨てて理由を持ち、読めない理由の文を返す', () => {
  let s = reduceChat(initialChat(), { type: 'snapshot', document: doc('k1', ['m1']) });
  s = reduceChat(s, { type: 'unavailable', error: 'no_session' });
  assert.equal(s.status, 'unavailable');
  assert.equal(s.error, 'no_session');
  assert.deepEqual(s.messages, []);
  assert.match(errorLabel('no_session'), /セッション/);
  assert.match(errorLabel('mystery'), /mystery/);
  const connecting = reduceChat(initialChat(), { type: 'disconnected' });
  assert.equal(connecting.status, 'unavailable');
  const kept = reduceChat(reduceChat(initialChat(), { type: 'snapshot', document: doc('k1', ['m1']) }), {
    type: 'disconnected',
  });
  assert.deepEqual(ids(kept), ['m1'], 'つなぎ直しの間は読めた会話を残す（次の snapshot で置き換える）');
});

test('reduceChat は、読めない理由（busy など）を、続く接続の切れで上書きしない', () => {
  const busy = reduceChat(initialChat(), { type: 'unavailable', error: 'busy' });
  assert.equal(reduceChat(busy, { type: 'disconnected' }).error, 'busy');
});

test('buildChat は思考を出さない（reasoning の件と、知らない部品の中身を描かない）', () => {
  const rows = buildChat([
    msg('r1', 'reasoning', [{ type: 'text', text: 'secret-thought' }]),
    msg('m1', 'assistant', [
      { type: 'thinking', text: 'secret-thought' },
      { type: 'text', text: '答え' },
    ]),
  ]);
  assert.ok(!JSON.stringify(rows).includes('secret-thought'));
  assert.deepEqual(
    rows.map((r: { kind: string }) => r.kind),
    ['unsupported', 'bubble'],
  );
});

test('olderResult は、前のページの応答を足すか、409 で置き換えを待つか、理由を示す', () => {
  const s = reduceChat(initialChat(), { type: 'snapshot', document: doc('k1', ['m3']) });
  const ok = olderResult(s, { status: 200, body: doc('k1', ['m1']) }, s.generation);
  assert.deepEqual(ids(ok.chat), ['m1', 'm3']);
  assert.equal(ok.notice, null);
  const stale = olderResult(s, { status: 200, body: doc('k2', ['m1']) }, s.generation);
  assert.equal(stale.chat, s, '鍵の違う古いページは足さない');
  const changed = olderResult(s, { status: 409, body: { ok: false, error: 'session_changed' } }, s.generation);
  assert.equal(changed.chat, s);
  assert.match(changed.notice ?? '', /待っています/);
  const failed = olderResult(s, { status: 502, body: { ok: false, error: 'read_failed' } }, s.generation);
  assert.equal(failed.chat, s);
  assert.match(failed.notice ?? '', /前のページを読めない/);
});

test('T-17：detailMarkWorktree は、このエージェントだけを持ち経過の起点を外した worktree の写しを返し、なければ null', () => {
  const me = {
    id: 'me',
    mark: 'waiting',
    agentType: 'codex',
    elapsedFrom: '2026-11-14T00:00:00.000Z',
    elapsedBasis: 'state',
  };
  const summary = {
    schema: 'orca-web.worktree-summary/v1',
    worktrees: [
      { id: 'w0', path: '/a', agents: [{ id: 'x', mark: 'done' }] },
      { id: 'w1', path: '/b', agents: [{ id: 'y', mark: 'working' }, me] },
    ],
  };
  assert.deepEqual(detailMarkWorktree(summary, 'me'), {
    id: 'w1',
    path: '/b',
    agents: [{ ...me, elapsedFrom: null, elapsedBasis: null }],
  });
  assert.equal(me.elapsedFrom, '2026-11-14T00:00:00.000Z', '元の文書を変えない');
  assert.equal(detailMarkWorktree(summary, 'nobody'), null);
  assert.equal(detailMarkWorktree(summary, ''), null);
  assert.equal(detailMarkWorktree({ ...summary, schema: 'x' }, 'me'), null);
  assert.equal(detailMarkWorktree(null, 'me'), null);
  assert.equal(
    detailMarkWorktree({ schema: 'orca-web.worktree-summary/v1', worktrees: [null, { agents: 'x' }] }, 'me'),
    null,
  );
});

const questionPart = (over: Record<string, unknown> = {}) => ({
  type: 'question',
  source: 'terminal',
  prompt: null,
  callId: 'call-q',
  questions: [
    {
      id: '0',
      header: null,
      question: 'どちら',
      multiSelect: false,
      options: [{ id: '0', label: 'はい', description: null }],
      allowOther: false,
      otherAllowsEmpty: false,
    },
  ],
  state: 'pending',
  answers: null,
  ...over,
});

test('T-12：buildChat は question の部分を question の行にし、端末は後に来た同じ callId のツールの結果で答え済みにする', () => {
  const rows = buildChat([
    msg('m1', 'assistant', [{ type: 'text', text: '聞きます' }, questionPart()]),
    msg('m2', 'tool', [{ type: 'tool-result', output: 'はい を選びました', isError: false, callId: 'call-q' }]),
    msg('m3', 'assistant', [questionPart({ source: 'chat', callId: null, prompt: { itemId: 'i1', revision: 1 } })]),
  ]);
  assert.deepEqual(
    rows.map((r: { kind: string }) => r.kind),
    ['bubble', 'question', 'question'],
  );
  assert.equal(rows[1].key, 'm1:1');
  assert.equal(rows[1].part.state, 'answered');
  assert.equal(rows[1].answerText, 'はい を選びました');
  assert.equal(rows[2].part.state, 'pending');
  assert.equal(rows[2].answerText, null);
});

test('T-12：buildChat は、結果が先に来ても同じ callId の端末の質問に結びつけ、単独のツールの行を残さない', () => {
  const rows = buildChat([
    msg('m0', 'tool', [{ type: 'tool-result', output: '先の結果', isError: false, callId: 'call-q' }]),
    msg('m1', 'assistant', [questionPart()]),
    msg('m2', 'assistant', [questionPart({ callId: 'call-other' })]),
  ]);
  assert.deepEqual(
    rows.map((r: { kind: string }) => r.kind),
    ['question', 'question'],
  );
  assert.equal(rows[0].part.state, 'answered');
  assert.equal(rows[0].answerText, '先の結果');
  assert.equal(rows[1].part.state, 'pending', 'ほかの callId は結びつけない');
});

test('T-12：buildChat は、構造化 Chat の question に同じ callId の結果を結びつけず、読めない question は「表示できない（質問）」のまま', () => {
  const rows = buildChat([
    msg('m1', 'assistant', [questionPart({ source: 'chat', callId: 'x', prompt: { itemId: 'i', revision: 1 } })]),
    msg('m2', 'tool', [{ type: 'tool-result', output: 'r', isError: false, callId: 'x' }]),
    msg('m3', 'assistant', [{ type: 'unsupported', what: 'question' }]),
  ]);
  assert.deepEqual(
    rows.map((r: { kind: string }) => r.kind),
    ['question', 'tool', 'unsupported'],
  );
  assert.equal(rows[0].part.state, 'pending');
  assert.equal(rows[2].text, '表示できない（質問）');
});

// ---- iss-00049 T-15：答え方ごとの答え済みの判定 ----

const keysQuestion = (over: Record<string, unknown> = {}) => questionPart({ answerVia: 'keys', ...over });
const messageQuestion = (over: Record<string, unknown> = {}) =>
  questionPart({
    answerVia: 'message',
    callId: 'call-m',
    questions: [
      {
        id: '0',
        header: null,
        question: 'どちらに\nしますか',
        multiSelect: false,
        options: [{ id: '0', label: 'はい', description: null }],
        allowOther: true,
        otherAllowsEmpty: false,
      },
    ],
    ...over,
  });

test('iss-00049 T-15：keys の質問は isError の結果で declined（結果の文）、そうでなければ answered', () => {
  const declined = buildChat([
    msg('m1', 'assistant', [keysQuestion()]),
    msg('m2', 'tool', [{ type: 'tool-result', output: 'User declined to answer', isError: true, callId: 'call-q' }]),
  ]);
  assert.deepEqual(
    declined.map((r: { kind: string }) => r.kind),
    ['question'],
  );
  assert.equal(declined[0].part.state, 'declined');
  assert.equal(declined[0].answerText, 'User declined to answer');
  const earlier = buildChat([
    msg('m0', 'tool', [{ type: 'tool-result', output: '閉じた', isError: true, callId: 'call-q' }]),
    msg('m1', 'assistant', [keysQuestion()]),
  ]);
  assert.equal(earlier.length, 1);
  assert.equal(earlier[0].part.state, 'declined', '結果が先でも同じ');
  const answered = buildChat([
    msg('m1', 'assistant', [keysQuestion()]),
    msg('m2', 'tool', [{ type: 'tool-result', output: 'はい', isError: false, callId: 'call-q' }]),
  ]);
  assert.equal(answered[0].part.state, 'answered');
  assert.equal(answered[0].answerText, 'はい');
});

test('iss-00049 T-15：message の質問は受付の結果では pending のまま、後の利用者の発言の引用で answered、引用でない発言では pending', () => {
  const accepted = buildChat([
    msg('m1', 'assistant', [
      messageQuestion(),
      { type: 'tool-result', output: 'queued', isError: false, callId: 'call-m' },
    ]),
  ]);
  assert.deepEqual(
    accepted.map((r: { kind: string }) => r.kind),
    ['question', 'tool'],
  );
  assert.equal(accepted[0].part.state, 'pending', '受付の結果では答え済みにしない');

  const reply = '> どちらに しますか\n\nはい';
  const answered = buildChat([
    msg('m1', 'assistant', [messageQuestion()]),
    msg('m2', 'user', [{ type: 'text', text: reply }]),
  ]);
  assert.equal(answered[0].part.state, 'answered');
  assert.equal(answered[0].answerText, reply);
  const after = buildChat([
    msg('m1', 'assistant', [messageQuestion()]),
    msg('m2', 'user', [{ type: 'text', text: `前置き\n\n${reply}` }]),
  ]);
  assert.equal(after[0].part.state, 'answered', '空行の後の引用');

  for (const text of ['はい', '> どちらに\nしますか\n\nはい', 'x > どちらに しますか\n\nはい']) {
    const rows = buildChat([msg('m1', 'assistant', [messageQuestion()]), msg('m2', 'user', [{ type: 'text', text }])]);
    assert.equal(rows[0].part.state, 'pending', JSON.stringify(text));
  }
  const before = buildChat([
    msg('m0', 'user', [{ type: 'text', text: reply }]),
    msg('m1', 'assistant', [messageQuestion()]),
  ]);
  assert.equal(before[1].part.state, 'pending', '前の発言では答え済みにしない');
  const byAssistant = buildChat([
    msg('m1', 'assistant', [messageQuestion()]),
    msg('m2', 'assistant', [{ type: 'text', text: reply }]),
  ]);
  assert.equal(byAssistant[0].part.state, 'pending', '利用者の発言だけ');
});

test('FQG2 T-15：届いていない（undelivered の）引用の発言では、message の質問は pending のまま', () => {
  const reply = '> どちらに しますか\n\nはい';
  const rows = buildChat([
    msg('m1', 'assistant', [messageQuestion()]),
    { ...msg('m2', 'user', [{ type: 'text', text: reply }]), undelivered: true },
  ]);
  assert.equal(rows[0].part.state, 'pending');
  const later = buildChat([
    msg('m1', 'assistant', [messageQuestion()]),
    { ...msg('m2', 'user', [{ type: 'text', text: reply }]), undelivered: true },
    msg('m3', 'user', [{ type: 'text', text: reply }]),
  ]);
  assert.equal(later[0].part.state, 'answered', '後で届いた引用で答え済み');
});

test('FQG3 T-15：ほかのエージェントからの（fromAgent の）引用の発言では、message の質問は pending のまま', () => {
  const rows = buildChat([
    msg('m1', 'assistant', [messageQuestion()]),
    { ...msg('m2', 'user', [{ type: 'text', text: '> どちらに しますか\n\nはい' }]), fromAgent: true },
  ]);
  assert.equal(rows[0].part.state, 'pending');
});

// iss-00054 T-11：端末の承認の行の key は promptId を含み、新しい許可の確認に前の確認の流れの状態を持ち越さない。
test('iss-00054 T-11：buildChat は端末の承認の行の key に promptId を含め、構造化 Chat の承認の key は今のまま', async () => {
  const { buildApprovalCard, createApprovalBoard, readOnlyApprover } = await import('../../web/embed/approval-view.js');
  const terminal = (promptId: string | null) => ({
    type: 'approval',
    source: 'terminal',
    prompt: null,
    promptId,
    title: null,
    tool: 'Bash',
    description: null,
    reason: null,
    blockedPath: null,
    plan: null,
    detail: null,
    options: [
      { id: 'allow_once', label: 'Allow once', description: null, intent: 'allow_once' },
      { id: 'reject_once', label: 'Reject', description: null, intent: 'reject_once' },
    ],
    answerable: true,
    unanswerableReason: null,
    state: 'pending',
    selectedOptionId: null,
  });
  const chatApproval = { ...terminal(null), source: 'chat', prompt: { itemId: 'i', revision: 1 }, promptId: null };
  const at = '2026-11-18T00:00:00.000Z';
  const first = buildChat([{ id: 'live', role: 'assistant', at, parts: [terminal('ta_aaaaaaaaaaaaaaaaaaaa')] }]);
  const second = buildChat([{ id: 'live', role: 'assistant', at, parts: [terminal('ta_bbbbbbbbbbbbbbbbbbbb')] }]);
  assert.equal(first[0].key, 'live:0:ta_aaaaaaaaaaaaaaaaaaaa');
  assert.equal(second[0].key, 'live:0:ta_bbbbbbbbbbbbbbbbbbbb');
  assert.equal(buildChat([{ id: 'live', role: 'assistant', at, parts: [terminal(null)] }])[0].key, 'live:0');
  assert.equal(buildChat([{ id: 'm', role: 'assistant', at, parts: [chatApproval] }])[0].key, 'm:0');

  // 前の確認で止まった流れは、promptId の違う確認のカードに持ち越さない。
  const blocked = {
    availability: () => ({ ok: true }),
    submit: async () => ({ kind: 'blocked', reason: '止めた' }),
  };
  const board = createApprovalBoard({ approvers: { chat: blocked, readOnly: readOnlyApprover, terminal: blocked } });
  await board.choose(first[0].key, first[0].part, 'allow_once', {});
  assert.equal(board.state(first[0].key).flow.phase, 'blocked');
  board.prune(new Set([second[0].key]));
  const view = buildApprovalCard(second[0].part, {
    key: second[0].key,
    state: board.state(second[0].key),
    availability: { ok: true },
  });
  assert.equal(view.blocked, null);
  assert.ok(view.options.every((o: { disabled: boolean }) => !o.disabled));
});
