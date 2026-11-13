import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderChatRow, renderDetail } from '../../web/embed/agent-dom.js';
import { buildChat } from '../../web/embed/agent-view.js';

/** 小さな偽の要素。textContent だけを文字として持ち、innerHTML などの HTML を解く口を使うと失敗する。 */
class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = '';
  title = '';
  href = '';
  rel = '';
  target = '';
  open = false;
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

  insertAdjacentHTML(): void {
    throw new Error('insertAdjacentHTML must not be used');
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

test('本文、ツールの名前、入力、出力に紛れた HTML は、文字のまま描かれ、要素にならない', () => {
  const rows = buildChat([
    { id: 'm1', role: 'user', at: null, parts: [{ type: 'text', text: DANGER }] },
    {
      id: 'm2',
      role: 'assistant',
      at: '2026-11-13T00:00:00.000Z',
      parts: [{ type: 'tool-call', name: DANGER, input: DANGER, callId: 'c1' }],
    },
    {
      id: 'm3',
      role: 'tool',
      at: null,
      parts: [{ type: 'tool-result', output: DANGER, isError: false, callId: 'c1' }],
    },
  ]);
  const tags = new Set<string>();
  let text = '';
  for (const row of rows) {
    const el = renderChatRow(fakeDocument, row, { formatTime: () => 't' }) as unknown as FakeElement;
    for (const node of el.all()) tags.add(node.tagName);
    text += el.textContent;
  }
  assert.ok(!tags.has('SCRIPT'));
  assert.ok(!tags.has('IMG'));
  assert.equal(text.split(DANGER).length - 1, 4, '本文、名前、入力、出力の4か所に、そのままの文字で出る');
});

test('折り畳みは、開いていた key だけを開いたまま描く', () => {
  const [row] = buildChat([
    { id: 'm1', role: 'assistant', at: null, parts: [{ type: 'tool-call', name: 'Bash', input: 'ls', callId: null }] },
  ]);
  const closed = renderChatRow(fakeDocument, row) as unknown as FakeElement;
  const opened = renderChatRow(fakeDocument, row, { open: new Set([row.key]) }) as unknown as FakeElement;
  const details = (el: FakeElement) => el.all().find((n) => n.tagName === 'DETAILS');
  assert.equal(details(closed)?.open, false);
  assert.equal(details(opened)?.open, true);
});

test('詳細の値と題名は文字のまま描き、リンクは与えた href だけを付ける', () => {
  const el = renderDetail(fakeDocument, {
    title: DANGER,
    rows: [
      { label: '題名', text: DANGER, note: null, href: null },
      { label: 'PR', text: '#1', note: null, href: 'https://github.com/o/r/pull/1' },
      { label: 'モデル', text: '—', note: 'not-provided', href: null },
      { label: '子', text: '1', note: null, href: null, links: [{ text: DANGER, href: '/embed/agent?id=a' }] },
    ],
  }) as unknown as FakeElement;
  const nodes = el.all();
  assert.ok(!nodes.some((n) => n.tagName === 'SCRIPT' || n.tagName === 'IMG'));
  const links = nodes.filter((n) => n.tagName === 'A');
  assert.deepEqual(
    links.map((a) => a.href),
    ['https://github.com/o/r/pull/1', '/embed/agent?id=a'],
  );
  assert.equal(links[0]?.rel, 'noopener noreferrer');
  const missing = nodes.find((n) => n.className === 'missing');
  assert.ok(missing);
});
