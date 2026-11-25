import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildApexList } from '../../src/apex/build.ts';
import {
  clearAgentFrame,
  mayLeaveFrame,
  mountAgentFrame,
  renderHeadline,
  renderPaneHead,
  renderSection,
  startApexPolling,
} from '../../web/apexes-dom.js';
import { buildApexesView } from '../../web/apexes-view.js';
import { agent, fact, input, NOW, repo, worktree } from '../inbox/fixture.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 小さな偽の要素。textContent だけを文字として持ち、HTML を解く口を使うと失敗する。 */
class FakeElement {
  readonly tagName: string;
  readonly namespaceURI: string | null;
  readonly attrs: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = '';
  title = '';
  href = '';
  rel = '';
  target = '';
  open = false;
  type = '';
  src = '';
  referrerPolicy = '';
  ownerDocument: unknown = null;
  parent: FakeElement | null = null;
  #text = '';

  constructor(tag: string, ns: string | null = null) {
    this.namespaceURI = ns;
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

  set outerHTML(_value: string) {
    throw new Error('outerHTML must not be used');
  }

  insertAdjacentHTML(): void {
    throw new Error('insertAdjacentHTML must not be used');
  }

  /** 属性は SVG の要素だけに付ける。 */
  setAttribute(name: string, value: string): void {
    if (this.namespaceURI !== SVG_NS) throw new Error('setAttribute is not expected');
    if (name.toLowerCase().startsWith('on')) throw new Error(`event attribute ${name} must not be set`);
    this.attrs[name] = String(value);
  }

  append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') throw new Error('append a string is not expected');
      node.parent?.removeChild(node);
      node.parent = this;
      this.children.push(node);
    }
  }

  removeChild(node: FakeElement): void {
    const at = this.children.indexOf(node);
    if (at >= 0) this.children.splice(at, 1);
    node.parent = null;
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of [...this.children]) this.removeChild(child);
    this.append(...nodes);
  }

  all(): FakeElement[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}

const fakeDocument = {
  createElement: (tag: string) => {
    const node = new FakeElement(tag);
    node.ownerDocument = fakeDocument;
    return node;
  },
  createElementNS: (ns: string, tag: string) => new FakeElement(tag, ns),
};

const DANGER = '<script>alert(1)</script><img src=x onerror=alert(2)>';
const ALLOWED = new Set([
  'SECTION',
  'H2',
  'DETAILS',
  'SUMMARY',
  'UL',
  'LI',
  'DIV',
  'SPAN',
  'P',
  'A',
  'BUTTON',
  'svg',
  'path',
]);

function dangerousView() {
  const doc = buildApexList({
    state: input({
      repos: [repo('repo-a', DANGER)],
      worktrees: [worktree({ displayName: fact(DANGER) })],
      agents: [
        agent('a', { state: fact('waiting'), title: fact(DANGER), agentType: fact(DANGER) }),
        agent('b', { parentPaneKey: fact('a'), workingMode: fact('monitoring') }),
        agent('m', { workingMode: fact('monitoring'), title: fact(null) }),
        agent('lost', { parentPaneKey: fact('gone'), title: fact(DANGER) }),
      ],
    }).state,
    now: NOW,
    project: null,
  });
  return { ...buildApexesView(doc, { now: NOW }), doc };
}

test('T-10: 題名などの <script> は文字のまま描かれ、決めた要素のほかを作らない', () => {
  const view = dangerousView();
  const nodes = view.sections.map((s: unknown) => renderSection(fakeDocument, s)) as FakeElement[];
  const tags = new Set(nodes.flatMap((n) => n.all().map((e) => e.tagName)));
  for (const tag of tags) assert.ok(ALLOWED.has(tag), `unexpected element ${tag}`);
  const text = nodes.map((n) => n.textContent).join('\n');
  assert.ok(text.includes(DANGER));
  assert.ok(text.includes('対応が必要（1）'));
  assert.ok(text.includes('配下 1/1'));
  assert.ok(text.includes('バックグラウンドタスクを監視中'));
});

test('T-10: 行の「新しいタブで開く」と結べない行のリンクは /embed/agent?id= を _blank・noopener noreferrer で開く', () => {
  const view = dangerousView();
  const links = view.sections
    .flatMap((s: unknown) => (renderSection(fakeDocument, s) as FakeElement).all())
    .filter((e: FakeElement) => e.tagName === 'A');
  assert.deepEqual(
    links.map((a: FakeElement) => a.href),
    ['/embed/agent?id=a', '/embed/agent?id=m', '/embed/agent?id=lost'],
  );
  for (const a of links) {
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer');
  }
});

test('iss-00077 R-01：頂点の行は選ぶボタン（data-apex）と小さな「新しいタブで開く」、選んだ行に印', () => {
  const view = buildApexesView(dangerousView().doc, { now: NOW, selectedId: 'm' });
  const nodes = view.sections.flatMap((s: unknown) => (renderSection(fakeDocument, s) as FakeElement).all());
  const buttons = nodes.filter((e: FakeElement) => e.tagName === 'BUTTON');
  assert.deepEqual(
    buttons.map((b: FakeElement) => b.dataset.apex),
    ['a', 'm'],
  );
  for (const b of buttons) assert.equal(b.type, 'button');
  const newTabs = nodes.filter((e: FakeElement) => e.className === 'apex-newtab');
  assert.deepEqual(
    newTabs.map((a: FakeElement) => [a.tagName, a.textContent, a.href]),
    [
      ['A', '新しいタブで開く', '/embed/agent?id=a'],
      ['A', '新しいタブで開く', '/embed/agent?id=m'],
    ],
  );
  const selected = nodes.filter((e: FakeElement) => e.tagName === 'LI' && e.dataset.selected === 'true');
  assert.deepEqual(
    selected.map((li: FakeElement) => li.dataset.key),
    ['m'],
  );
});

function slot(): FakeElement {
  return fakeDocument.createElement('div');
}

test('T-05：mountAgentFrame を別の id で3回呼ぶと iframe は1つで src は最後の id。同じ id では作り直さない', () => {
  const box = slot();
  const first = mountAgentFrame(box, 'a') as FakeElement;
  assert.equal(first.tagName, 'IFRAME');
  assert.equal(first.src, '/embed/agent?id=a');
  assert.equal(first.referrerPolicy, 'same-origin');
  assert.ok(first.title.length > 0);
  const second = mountAgentFrame(box, 'b c') as FakeElement;
  const third = mountAgentFrame(box, 'd') as FakeElement;
  assert.notEqual(first, second);
  assert.notEqual(second, third);
  assert.deepEqual(
    box.children.map((c) => c.tagName),
    ['IFRAME'],
  );
  assert.equal(box.children[0], third);
  assert.equal(third.src, '/embed/agent?id=d');
  assert.equal(second.src, '/embed/agent?id=b%20c', '外した枠の src は書き換えない');
  assert.equal(mountAgentFrame(box, 'd'), third, '同じ id では作り直さない');
  clearAgentFrame(box, '案内');
  assert.deepEqual(
    box.children.map((c) => [c.tagName, c.textContent]),
    [['P', '案内']],
  );
});

test('T-06：枠の body に data-unsettled があれば確かめ、取り消せば替えない。印がない・読めない・枠がないなら替える', () => {
  const asked: string[] = [];
  const confirmWith = (answer: boolean) => (text: string) => {
    asked.push(text);
    return answer;
  };
  const withFrame = (contentDocument: unknown) => {
    const box = slot();
    const frame = mountAgentFrame(box, 'a') as FakeElement & { contentDocument?: unknown };
    Object.defineProperty(frame, 'contentDocument', {
      get: () => {
        if (contentDocument instanceof Error) throw contentDocument;
        return contentDocument;
      },
    });
    return box;
  };
  const marked = { body: { getAttribute: (name: string) => (name === 'data-unsettled' ? 'true' : null) } };
  assert.equal(mayLeaveFrame(withFrame(marked), confirmWith(false)), false);
  assert.deepEqual(asked, ['送信の処理中か結果不明の表示があります。切り替えると表示を失います']);
  assert.equal(mayLeaveFrame(withFrame(marked), confirmWith(true)), true);
  asked.length = 0;
  assert.equal(mayLeaveFrame(withFrame({ body: { getAttribute: () => null } }), confirmWith(false)), true);
  assert.equal(mayLeaveFrame(withFrame(new Error('blocked')), confirmWith(false)), true);
  assert.equal(mayLeaveFrame(slot(), confirmWith(false)), true);
  assert.deepEqual(asked, [], '印がなければ聞かない');
});

test('R-01：右のペインの見出しに「← 一覧」・題名・状態の印・「一覧にありません」・開く部品の置き場', () => {
  const openRoot = fakeDocument.createElement('span');
  const head = renderPaneHead(
    fakeDocument,
    {
      id: 'a',
      title: DANGER,
      mark: 'waiting',
      markLabel: '入力待ち',
      monitoring: false,
      missing: true,
      missingLabel: '一覧にありません',
      newTab: '/embed/agent?id=a',
      open: null,
    },
    { openRoot },
  ) as FakeElement;
  const all = head.all();
  const back = all.find((e) => e.tagName === 'BUTTON' && e.dataset.action === 'back');
  assert.equal(back?.textContent, '← 一覧');
  assert.equal(back?.type, 'button');
  assert.ok(head.textContent.includes(DANGER));
  assert.ok(head.textContent.includes('入力待ち'));
  assert.ok(head.textContent.includes('一覧にありません'));
  assert.ok(all.includes(openRoot));
  for (const tag of new Set(all.map((e) => e.tagName))) assert.ok(ALLOWED.has(tag), tag);
});

test('T-10: 畳む段は details で、expanded なら開く。空の段は「なし」', () => {
  const view = dangerousView();
  const sleeping = view.sections.find((s: { key: string }) => s.key === 'sleeping');
  const closed = renderSection(fakeDocument, sleeping) as FakeElement;
  const details = closed.children[0] as FakeElement;
  assert.equal(details.tagName, 'DETAILS');
  assert.equal(details.open, false);
  assert.ok(closed.textContent.includes('なし'));
  const opened = renderSection(fakeDocument, sleeping, { expanded: true }) as FakeElement;
  assert.equal((opened.children[0] as FakeElement).open, true);
  const working = renderSection(fakeDocument, view.sections[1]) as FakeElement;
  assert.equal((working.children[0] as FakeElement).tagName, 'H2');
  assert.equal(working.dataset.stage, 'working');
  const head = renderHeadline(fakeDocument, view.headline) as FakeElement;
  assert.equal(head.textContent, '対応が必要 1作業中 1完了 0');
});

class FakeDocument {
  hidden = false;
  listeners: Record<string, (() => void)[]> = {};
  addEventListener(type: string, fn: () => void) {
    this.listeners[type] ??= [];
    this.listeners[type].push(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  fire(type: string) {
    for (const fn of this.listeners[type] ?? []) fn();
  }
}

function pollHarness(hidden = false) {
  const doc = new FakeDocument();
  doc.hidden = hidden;
  let loads = 0;
  let next = 1;
  const timers = new Map<number, () => void>();
  const poller = startApexPolling({
    doc,
    delayMs: 10_000,
    load: async () => {
      loads++;
    },
    setTimer: (fn: () => void) => {
      const id = next++;
      timers.set(id, fn);
      return id;
    },
    clearTimer: (id: number) => {
      timers.delete(id);
    },
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const tick = async () => {
    const pending = [...timers.entries()];
    timers.clear();
    for (const [, fn] of pending) fn();
    await settle();
  };
  return { doc, poller, timers, settle, tick, loads: () => loads };
}

test('T-10: 隠れたら予約を取り消して読まず、見えたらすぐ読み直す', async () => {
  const h = pollHarness();
  await h.settle();
  assert.equal(h.loads(), 1);
  assert.equal(h.timers.size, 1);
  await h.tick();
  assert.equal(h.loads(), 2);
  h.doc.hidden = true;
  h.doc.fire('visibilitychange');
  assert.equal(h.timers.size, 0);
  await h.tick();
  assert.equal(h.loads(), 2);
  h.doc.hidden = false;
  h.doc.fire('visibilitychange');
  await h.settle();
  assert.equal(h.loads(), 3);
  assert.equal(h.timers.size, 1);
  h.poller.stop();
  assert.equal(h.timers.size, 0);
  assert.equal(h.doc.listeners.visibilitychange?.length, 0);
});

test('T-10: 最初から隠れていれば、見えるまで読まない。読みの途中で隠れたら次を予約しない', async () => {
  const h = pollHarness(true);
  await h.settle();
  assert.equal(h.loads(), 0);
  h.doc.hidden = false;
  h.doc.fire('visibilitychange');
  h.doc.hidden = true;
  await h.settle();
  assert.equal(h.loads(), 1);
  assert.equal(h.timers.size, 0);
  h.poller.stop();
});

test('T-10: 入口は startApexPolling で読み、題名を view から付け、innerHTML を使わない', async () => {
  const entry = await readFile(new URL('../../web/apexes.js', import.meta.url), 'utf8');
  assert.match(entry, /startApexPolling\(\{ doc: document/);
  assert.match(entry, /document\.title = view\.title/);
  for (const path of ['apexes.js', 'apexes-dom.js', 'apexes-view.js', 'apexes.html']) {
    const text = await readFile(new URL(`../../web/${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\(|document\.write\(/, path);
  }
});
