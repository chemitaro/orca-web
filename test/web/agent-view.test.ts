import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  agentHref,
  buildChat,
  buildDetail,
  errorLabel,
  initialChat,
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
