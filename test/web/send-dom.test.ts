import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderSendPanel } from '../../web/embed/send-dom.js';
import { buildSendView, initialSend, reduceSend } from '../../web/embed/send-view.js';

/** 小さな偽の要素。textContent だけを文字として持ち、innerHTML などの HTML を解く口を使うと失敗する。 */
class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = '';
  type = '';
  disabled = false;
  #text = '';

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  set textContent(value: string) {
    this.#text = String(value);
    this.children.length = 0;
  }

  get textContent(): string {
    return this.#text + this.children.map((c) => c.textContent).join('');
  }

  set innerHTML(_value: string) {
    throw new Error('innerHTML must not be used');
  }

  set outerHTML(_value: string) {
    throw new Error('outerHTML must not be used');
  }

  insertAdjacentHTML(): void {
    throw new Error('insertAdjacentHTML must not be used');
  }

  setAttribute(): void {
    throw new Error('setAttribute must not be used');
  }

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  all(): FakeElement[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}

const fakeDocument = {
  createElement: (tag: string) => new FakeElement(tag),
  write() {
    throw new Error('document.write must not be used');
  },
};

const DANGER = '<script>alert(1)</script><img src=x onerror=alert(2)>';
const OP = '1763000000000-0123456789abcdef0123456789abcdef';
const FP_A = 'a'.repeat(32);
const FP_B = 'b'.repeat(32);
const ALLOWED = new Set(['DIV', 'P', 'UL', 'LI', 'BUTTON', 'SPAN']);
type State = ReturnType<typeof initialSend>;

const run = (state: State, ...events: Record<string, unknown>[]): State =>
  events.reduce<State>((s, e) => reduceSend(s, e as never), state);
const statusOk = (target = FP_A) => ({
  type: 'status',
  status: 200,
  body: { enabled: true, available: true, route: 'terminal', reason: null, target, agentType: 'claude' },
});
const sent = (text: string) =>
  run(
    initialSend(),
    statusOk(),
    { type: 'input', text },
    { type: 'submit' },
    { type: 'intent', status: 200, body: { ticket: 'tk', operationId: OP, text } },
  );
const draw = (state: State) => renderSendPanel(fakeDocument, buildSendView(state)) as unknown as FakeElement;

function checkNodes(panel: FakeElement) {
  const nodes = panel.all();
  for (const node of nodes) assert.ok(ALLOWED.has(node.tagName), `思わない要素 ${node.tagName}`);
  return nodes;
}
const buttonsOf = (nodes: FakeElement[]) =>
  nodes.filter((n) => n.tagName === 'BUTTON').map((b) => [b.dataset.action, b.textContent, b.type, b.disabled]);

test('T-12：理由・warning・code に紛れた HTML は文字のまま描かれ、要素にならない', () => {
  const disabled = run(initialSend(), {
    type: 'status',
    status: 200,
    body: { enabled: true, available: false, route: null, reason: DANGER, target: null, agentType: null },
  });
  const reasonPanel = draw(disabled);
  checkNodes(reasonPanel);
  assert.ok(reasonPanel.textContent.includes(DANGER), '理由は文字のまま');

  const warned = reduceSend(sent('本文'), {
    type: 'confirmed',
    status: 200,
    body: { operationId: OP, outcome: 'accepted', detail: { warning: DANGER } },
  });
  const warnPanel = draw(warned);
  const nodes = checkNodes(warnPanel);
  const items = nodes.filter((n) => n.tagName === 'LI');
  assert.deepEqual(
    items.map((n) => n.textContent),
    [`注意：${DANGER}`],
  );
  assert.equal(nodes.find((n) => n.tagName === 'UL')?.className, 'send-warnings');
  const message = nodes.find((n) => n.className === 'send-message');
  assert.equal(message?.dataset.kind, 'info');

  const refused = run(
    initialSend(),
    statusOk(),
    { type: 'input', text: 'x' },
    { type: 'submit' },
    {
      type: 'intent',
      status: 409,
      body: { ok: false, error: 'not_sendable', reason: DANGER },
    },
  );
  const refusedPanel = draw(refused);
  checkNodes(refusedPanel);
  assert.ok(refusedPanel.textContent.includes(DANGER), 'reason は文字のまま');

  const unknownCode = run(
    initialSend(),
    statusOk(),
    { type: 'input', text: 'x' },
    { type: 'submit' },
    {
      type: 'intent',
      status: 503,
      body: { ok: false, error: 'unreachable', reason: DANGER },
    },
  );
  assert.ok(draw(unknownCode).textContent.includes(DANGER), '知らない reason も文字のまま');
});

test('T-12：結果不明の帯は文と「確かめる」「閉じる」を作り、照会の間は押せなくする', () => {
  const unknown = reduceSend(sent('本文'), { type: 'confirm-failed' });
  const nodes = checkNodes(draw(unknown));
  assert.ok(nodes.some((n) => n.className === 'send-unknown'));
  assert.ok(nodes.some((n) => n.textContent === '届いたか分かりません。自動では送り直しません。'));
  assert.deepEqual(buttonsOf(nodes), [
    ['query', '確かめる', 'button', false],
    ['dismiss', '閉じる', 'button', false],
  ]);
  const checking = checkNodes(draw(reduceSend(unknown, { type: 'query' })));
  assert.deepEqual(buttonsOf(checking), [
    ['query', '確かめています…', 'button', true],
    ['dismiss', '閉じる', 'button', true],
  ]);
});

test('T-12：changed は知らせの1行と「新しい宛先で続ける」を作り、新しい指紋がなければ知らせだけ', () => {
  const changed = run(initialSend(), statusOk(), { type: 'input', text: 'x' }, statusOk(FP_B));
  const nodes = checkNodes(draw(changed));
  assert.ok(nodes.some((n) => n.className === 'send-changed' && /宛先が変わりました/.test(n.textContent)));
  assert.deepEqual(buttonsOf(nodes), [['adopt', '新しい宛先で続ける', 'button', false]]);
  const noPending = checkNodes(draw({ ...changed, pendingTarget: null }));
  assert.deepEqual(buttonsOf(noPending), []);
});

test('T-12：書く欄では確認の画面・期限・ボタンを作らない（送るボタンは agent.html にある）', () => {
  const panel = draw(run(initialSend(), statusOk(), { type: 'input', text: '本文' }));
  const nodes = checkNodes(panel);
  assert.deepEqual(buttonsOf(nodes), []);
  assert.doesNotMatch(panel.textContent, /期限|この宛先に|確かめる/);
});

test('T-12：innerHTML を使うと偽の要素が投げる', () => {
  const el = new FakeElement('div');
  assert.throws(() => {
    el.innerHTML = DANGER;
  });
});
