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
const T0 = Date.parse('2026-11-13T00:00:00.000Z');
const ALLOWED = new Set(['DIV', 'P', 'DL', 'DT', 'DD', 'UL', 'LI', 'BUTTON', 'SPAN']);

function confirmState(text: string) {
  let s = reduceSend(initialSend(), {
    type: 'status',
    status: 200,
    body: { enabled: true, available: true, route: 'terminal', reason: null },
  });
  s = reduceSend(s, { type: 'input', text });
  s = reduceSend(s, { type: 'submit' });
  return reduceSend(s, {
    type: 'intent',
    status: 200,
    body: {
      ticket: 'tk',
      expiresAt: T0 + 60_000,
      operationId: OP,
      text,
      digest: 'd',
      preview: {
        repoName: DANGER,
        worktreePath: DANGER,
        branch: DANGER,
        agentType: 'claude',
        title: DANGER,
        state: 'idle',
        route: 'terminal',
        sessionShortId: 'abcd1234',
      },
    },
  });
}

test('`<script>` を含む本文と題名が、確認の画面に文字のまま描かれ、要素にならない', () => {
  const view = buildSendView(confirmState(`${DANGER}\n二行目`), { formatTime: () => 't' });
  const panel = renderSendPanel(fakeDocument, view) as unknown as FakeElement;
  const nodes = panel.all();
  for (const node of nodes) assert.ok(ALLOWED.has(node.tagName), `思わない要素 ${node.tagName}`);
  assert.ok(!nodes.some((n) => n.tagName === 'SCRIPT' || n.tagName === 'IMG'));
  const text = panel.textContent;
  assert.ok(text.includes(`${DANGER}\n二行目`), '本文は改行を含めて文字のまま');
  assert.equal(text.split(DANGER).length - 1, 5, '題名、リポジトリ、worktree、ブランチ、本文の5か所');
  const body = nodes.find((n) => n.className.includes('send-text'));
  assert.equal(body?.textContent, `${DANGER}\n二行目`);
  const buttons = nodes.filter((n) => n.tagName === 'BUTTON');
  assert.deepEqual(
    buttons.map((b) => [b.dataset.action, b.textContent, b.type, b.disabled]),
    [
      ['confirm', '送る', 'button', false],
      ['cancel', 'やめる', 'button', false],
    ],
  );
});

test('送っている間はボタンを押せなくし、結果と warning と操作の ID を文字で描く', () => {
  const sending = reduceSend(confirmState('本文'), { type: 'confirm', now: T0 + 1 });
  const sendingPanel = renderSendPanel(fakeDocument, buildSendView(sending)) as unknown as FakeElement;
  const sendingButtons = sendingPanel.all().filter((n) => n.tagName === 'BUTTON');
  assert.ok(sendingButtons.length > 0);
  assert.ok(sendingButtons.every((b) => b.disabled));

  const result = reduceSend(sending, {
    type: 'confirmed',
    status: 200,
    body: { operationId: OP, outcome: 'unknown', detail: { warning: 'agent_not_verified', code: DANGER } },
  });
  const panel = renderSendPanel(fakeDocument, buildSendView(result)) as unknown as FakeElement;
  const nodes = panel.all();
  for (const node of nodes) assert.ok(ALLOWED.has(node.tagName), `思わない要素 ${node.tagName}`);
  const text = panel.textContent;
  assert.match(text, /結果不明/);
  assert.match(text, /要確認/);
  assert.ok(text.includes(OP));
  assert.ok(text.includes(DANGER), 'detail の値も文字のまま');
  const outcome = nodes.find((n) => n.className.includes('send-outcome'));
  assert.equal(outcome?.dataset.outcome, 'unknown');
  assert.deepEqual(
    nodes.filter((n) => n.tagName === 'BUTTON').map((b) => b.dataset.action),
    ['query', 'back'],
  );
});

test('止まっているときは理由を描き、ボタンを押せなくする', () => {
  const off = reduceSend(initialSend(), {
    type: 'status',
    status: 200,
    body: { enabled: false, available: true, route: 'terminal', reason: null },
  });
  const panel = renderSendPanel(fakeDocument, buildSendView(off)) as unknown as FakeElement;
  const message = panel.all().find((n) => n.className.includes('send-message'));
  assert.match(message?.textContent ?? '', /設定で送信が止まっています/);
  assert.equal(message?.dataset.kind, 'error');
  assert.ok(
    panel
      .all()
      .filter((n) => n.tagName === 'BUTTON')
      .every((b) => b.disabled),
  );
});
