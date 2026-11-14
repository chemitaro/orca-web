import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refreshTimes, renderChatRow, renderDetail, renderDetailMark } from '../../web/embed/agent-dom.js';
import { buildChat } from '../../web/embed/agent-view.js';

/** 小さな偽の要素。textContent だけを文字として持ち、innerHTML などの HTML を解く口を使うと失敗する。 */
class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attrs: Record<string, string> = {};
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

  setAttribute(name: string, value: string): void {
    if (name.toLowerCase().startsWith('on')) throw new Error(`event attribute ${name} must not be set`);
    this.attrs[name] = String(value);
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
  createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
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
    const el = renderChatRow(fakeDocument, row, {
      now: Date.parse('2026-11-13T00:05:00.000Z'),
    }) as unknown as FakeElement;
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
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
  const missing = nodes.find((n) => n.className === 'missing');
  assert.ok(missing);
  assert.match(
    missing.textContent,
    /Orca が値を報告しない/,
    '欠けた理由はツールチップだけでなく文字でも示す（iPhone で見える）',
  );
});

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const bubbleAt = (at: string | null) => {
  const [row] = buildChat([{ id: 'm', role: 'assistant', at, parts: [{ type: 'text', text: '本文' }] }]);
  return renderChatRow(fakeDocument, row, { now: NOW }) as unknown as FakeElement & Record<string, unknown>;
};
const timeOf = (el: FakeElement) =>
  el.all().find((n) => n.tagName === 'TIME') as (FakeElement & Record<string, unknown>) | undefined;

test('T-18：会話の行の時刻は now・Nm・Nh・Nd の短い形で、time に元の時刻の datetime と全体の時刻の title がある', () => {
  const cases: [number, string][] = [
    [0, 'now'],
    [59 * SEC, 'now'],
    [60 * SEC, '1m'],
    [59 * MIN, '59m'],
    [HOUR, '1h'],
    [23 * HOUR + 59 * MIN, '23h'],
    [24 * HOUR, '1d'],
    [50 * HOUR, '2d'],
  ];
  for (const [ms, text] of cases) {
    const at = ago(ms);
    const time = timeOf(bubbleAt(at));
    assert.ok(time, String(ms));
    assert.equal(time.textContent, text, String(ms));
    assert.equal(time.dateTime, at, '元の ISO を datetime に持つ');
    assert.equal(typeof time.title, 'string');
    assert.ok(String(time.title).length > 0, '全体の時刻を title に持つ');
    assert.doesNotMatch(time.textContent, /今|分|時間|日/);
  }
});

test('T-18：未来と読めない時刻では、時刻の文字を出さない', () => {
  assert.equal(timeOf(bubbleAt(new Date(NOW + 5 * MIN).toISOString())), undefined);
  assert.equal(timeOf(bubbleAt('いつか')), undefined);
  assert.equal(timeOf(bubbleAt(null)), undefined);
});

test('T-18：refreshTimes は描いた time の文字を今の時刻で描き直す', () => {
  const time = timeOf(bubbleAt(ago(30 * SEC)));
  assert.ok(time);
  assert.equal(time.textContent, 'now');
  refreshTimes({ querySelectorAll: () => [time] }, NOW + 5 * MIN);
  assert.equal(time.textContent, '5m');
  refreshTimes({ querySelectorAll: () => [time] }, NOW + 3 * HOUR);
  assert.equal(time.textContent, '3h');
});

// 印の部品が要素を作るための、名前空間つきの偽の要素。
const SVG_NS = 'http://www.w3.org/2000/svg';
class MarkElement {
  readonly tagName: string;
  readonly ownerDocument: MarkDocument;
  readonly children: MarkElement[] = [];
  readonly attrs: Record<string, string> = {};
  className = '';
  #text = '';
  constructor(doc: MarkDocument, tag: string, ns: string | null) {
    this.ownerDocument = doc;
    this.tagName = ns === SVG_NS ? tag : tag.toUpperCase();
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
  setAttribute(name: string, value: string): void {
    if (name.toLowerCase().startsWith('on')) throw new Error(`event attribute ${name} must not be set`);
    this.attrs[name] = String(value);
  }
  addEventListener(): void {
    throw new Error('the heading mark must not be a button');
  }
  append(...nodes: MarkElement[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: MarkElement[]): void {
    this.#text = '';
    this.children.length = 0;
    this.children.push(...nodes);
  }
  all(): MarkElement[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}
class MarkDocument {
  createElement(tag: string) {
    return new MarkElement(this, tag, null);
  }
  createElementNS(ns: string, tag: string) {
    return new MarkElement(this, tag, ns);
  }
}

const summaryOf = (agents: Record<string, unknown>[], other: Record<string, unknown>[] = []) => ({
  schema: 'orca-web.worktree-summary/v1',
  worktrees: [
    { id: 'wt-0', path: '/repo/x', agents: other },
    { id: 'wt-1', path: '/repo/a', agents },
  ],
});
const markAgent = (id: string, mark: string, agentType = 'claude') => ({
  id,
  mark,
  agentType,
  since: null,
  detail: `/embed/agent?id=${id}`,
  elapsedFrom: ago(3 * HOUR),
  elapsedBasis: 'state',
});

test('T-17：詳細の見出しに、このエージェントだけの印を1つ、経過を外して描く', () => {
  const container = new MarkDocument().createElement('span');
  const summary = summaryOf(
    [markAgent('other', 'blocked'), markAgent('me', 'working'), markAgent('third', 'waiting', 'codex')],
    [markAgent('far', 'done')],
  );
  renderDetailMark(container, summary, 'me', { now: NOW });
  const marks = container.all().filter((n) => /(^| )orca-mark( |$)/.test(n.className));
  assert.equal(marks.length, 1);
  const [mark] = marks;
  assert.match(mark?.className ?? '', /orca-mark--working/);
  assert.ok(!container.all().some((n) => n.className === 'orca-mark-time'), '経過の文字がない');
  assert.ok(!container.all().some((n) => /orca-mark--more/.test(n.className)), '+N がない');
  const label = mark?.attrs['aria-label'] ?? '';
  assert.equal(label, 'Claude、作業中');
  assert.equal(mark?.attrs.title, label);
  assert.doesNotMatch(label, /経過|分|時間|日|この状態/);
  assert.equal(summary.worktrees[1]?.agents[1]?.elapsedFrom, ago(3 * HOUR), '要約の文書は変えない');
});

test('T-17：要約にこのエージェントがない・読めないときは置き場を空にする', () => {
  const container = new MarkDocument().createElement('span');
  renderDetailMark(container, summaryOf([markAgent('me', 'working')]), 'me', { now: NOW });
  assert.ok(container.children.length > 0);
  renderDetailMark(container, summaryOf([markAgent('other', 'working')]), 'me', { now: NOW });
  assert.equal(container.children.length, 0);
  renderDetailMark(container, summaryOf([markAgent('me', 'working')]), 'me', { now: NOW });
  renderDetailMark(container, null, 'me', { now: NOW });
  assert.equal(container.children.length, 0);
  renderDetailMark(container, { schema: 'other', worktrees: [] }, 'me', { now: NOW });
  assert.equal(container.children.length, 0);
});

test('T-01：親・子2つ・PR のすべてを同じ href の新しいタブで開く', () => {
  const el = renderDetail(fakeDocument, {
    title: '詳細',
    rows: [
      { label: '親', text: DANGER, href: '/embed/agent?id=parent', note: null },
      {
        label: '子',
        text: '2',
        href: null,
        note: null,
        links: [
          { text: DANGER, href: '/embed/agent?id=child-1' },
          { text: '子2', href: '/embed/agent?id=child-2' },
        ],
      },
      { label: 'PR', text: '#37', href: 'https://github.com/o/r/pull/37', note: null },
    ],
  }) as unknown as FakeElement;
  const links = el.all().filter((node) => node.tagName === 'A');
  assert.deepEqual(
    links.map((link) => link.href),
    ['/embed/agent?id=parent', '/embed/agent?id=child-1', '/embed/agent?id=child-2', 'https://github.com/o/r/pull/37'],
  );
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
  }
  for (const link of links) {
    assert.equal(link.title, '新しいタブで開く');
    assert.equal(link.className, 'newtab');
    const hidden = link.children.filter((node) => node.className === 'vh');
    assert.equal(hidden.length, 1);
    assert.equal(hidden[0]?.textContent, '（新しいタブで開く）');
    const icons = link.children.filter((node) => node.tagName === 'SVG');
    assert.equal(icons.length, 1);
    assert.equal(icons[0]?.attrs['aria-hidden'], 'true');
    assert.equal(icons[0]?.attrs.focusable, 'false');
    assert.equal(icons[0]?.attrs.class, 'newtab-icon');
    assert.equal(icons[0]?.attrs.viewBox, '0 0 24 24');
    assert.equal(
      icons[0]?.children[0]?.attrs.d,
      'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    );
  }
  assert.equal(links[0]?.textContent, `${DANGER}（新しいタブで開く）`);
  assert.equal(links[1]?.textContent, `${DANGER}（新しいタブで開く）`);
  assert.ok(!el.all().some((node) => node.tagName === 'IMG' || node.tagName === 'SCRIPT'));
});
