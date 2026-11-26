import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildApexList } from '../../src/apex/build.ts';
import { attentionFor, memberAttention } from '../../web/apexes-attention-view.js';
import { buildApexCards, buildDraftText, paneFrameTarget } from '../../web/apexes-cards-view.js';
import {
  attentionMarks,
  clearAgentFrame,
  createSeenStore,
  createSeenTracker,
  mayLeaveFrame,
  mountAgentFrame,
  renderApexCards,
  renderDraftNotice,
  renderHeadline,
  renderMemberBand,
  renderPaneHead,
  renderSection,
  startApexPolling,
} from '../../web/apexes-dom.js';
import { buildApexesView, SEEN_DWELL_MS, SEEN_STORAGE_KEY } from '../../web/apexes-view.js';
import { createDraftSender } from '../../web/embed/draft-receiver.js';
import { agent, fact, input, NOW, repo, worktree } from '../inbox/fixture.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 小さな偽の要素。textContent だけを文字として持ち、HTML を解く口を使うと失敗する。 */
class FakeElement {
  readonly tagName: string;
  readonly namespaceURI: string | null;
  readonly attrs: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style = {
    props: {} as Record<string, string>,
    setProperty(name: string, value: string) {
      this.props[name] = String(value);
    },
  };
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

  /** 属性は SVG の要素と、HTML の要素の aria-label だけに付ける。 */
  setAttribute(name: string, value: string): void {
    if (this.namespaceURI !== SVG_NS && name !== 'aria-label') throw new Error('setAttribute is not expected');
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
const SHORT_DANGER = '<script>alert(1)</script>';
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

function pollHarness(hidden = false, keep: { alive: boolean } | null = null) {
  const doc = new FakeDocument();
  doc.hidden = hidden;
  let loads = 0;
  let next = 1;
  const timers = new Map<number, () => void>();
  const delays = new Map<number, number>();
  const poller = startApexPolling({
    doc,
    delayMs: 10_000,
    ...(keep ? { keepAliveWhenHidden: () => keep.alive, hiddenDelayMs: 30_000 } : {}),
    load: async () => {
      loads++;
    },
    setTimer: (fn: () => void, ms: number) => {
      const id = next++;
      timers.set(id, fn);
      delays.set(id, ms);
      return id;
    },
    clearTimer: (id: number) => {
      timers.delete(id);
    },
  });
  const pendingDelays = () => [...timers.keys()].map((id) => delays.get(id));
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const tick = async () => {
    const pending = [...timers.entries()];
    timers.clear();
    for (const [, fn] of pending) fn();
    await settle();
  };
  return { doc, poller, timers, settle, tick, pendingDelays, loads: () => loads };
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

test('T-05: 隠れて keepAliveWhenHidden が真なら hiddenDelayMs で読み続け、見えたら今の間隔に戻る', async () => {
  const keep = { alive: true };
  const h = pollHarness(false, keep);
  await h.settle();
  assert.equal(h.loads(), 1);
  assert.deepEqual(h.pendingDelays(), [10_000]);
  h.doc.hidden = true;
  h.doc.fire('visibilitychange');
  assert.deepEqual(h.pendingDelays(), [30_000], '隠れたら 30 秒の予約1つに替える');
  await h.tick();
  assert.equal(h.loads(), 2);
  assert.deepEqual(h.pendingDelays(), [30_000]);
  await h.tick();
  assert.equal(h.loads(), 3);
  assert.deepEqual(h.pendingDelays(), [30_000]);
  h.doc.hidden = false;
  h.doc.fire('visibilitychange');
  await h.settle();
  assert.equal(h.loads(), 4, '見えたらすぐ読む');
  assert.deepEqual(h.pendingDelays(), [10_000]);
  h.poller.stop();
  assert.equal(h.timers.size, 0);
});

test('T-05: 隠れて keepAliveWhenHidden が偽なら予約しない。呼ぶたびに読み直す', async () => {
  const keep = { alive: false };
  const h = pollHarness(false, keep);
  await h.settle();
  h.doc.hidden = true;
  h.doc.fire('visibilitychange');
  assert.equal(h.timers.size, 0);
  h.doc.hidden = false;
  h.doc.fire('visibilitychange');
  await h.settle();
  keep.alive = true;
  h.doc.hidden = true;
  h.doc.fire('visibilitychange');
  assert.deepEqual(h.pendingDelays(), [30_000], '許可した後は読み続ける');
  keep.alive = false;
  await h.tick();
  assert.equal(h.timers.size, 0, '許可がなくなれば次を予約しない');
  h.poller.stop();
});

test('T-05: 最初から隠れていて keepAliveWhenHidden が真なら hiddenDelayMs の後に読む。読みの途中で隠れても予約は1つ', async () => {
  const h = pollHarness(true, { alive: true });
  await h.settle();
  assert.equal(h.loads(), 0);
  assert.deepEqual(h.pendingDelays(), [30_000]);
  await h.tick();
  assert.equal(h.loads(), 1);
  assert.deepEqual(h.pendingDelays(), [30_000]);
  h.doc.hidden = false;
  h.doc.fire('visibilitychange');
  h.doc.hidden = true;
  h.doc.fire('visibilitychange');
  await h.settle();
  assert.deepEqual(h.pendingDelays(), [30_000]);
  h.poller.stop();
});

test('T-10: 入口は startApexPolling で読み、題名を view から付け、innerHTML を使わない', async () => {
  const entry = await readFile(new URL('../../web/apexes.js', import.meta.url), 'utf8');
  assert.match(entry, /startApexPolling\(\{\s+doc: document,/);
  assert.match(entry, /document\.title = view\.title/);
  for (const path of ['apexes.js', 'apexes-dom.js', 'apexes-view.js', 'apexes.html']) {
    const text = await readFile(new URL(`../../web/${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\(|document\.write\(/, path);
  }
});

test('T-07：新着の行は題名の前に点（apex-unseen、aria-label 新着）を出し、見出しの強調は対応が必要が 1 以上のときだけ', () => {
  const doc = buildApexList({
    state: input({ agents: [agent('d', { state: fact('done') }), agent('w')] }).state,
    now: NOW,
    project: null,
  });
  const view = buildApexesView(doc, { now: NOW, seen: {} });
  const done = view.sections.find((s: { key: string }) => s.key === 'done_recent');
  const node = renderSection(fakeDocument, done) as FakeElement;
  const head = node.all().find((e) => e.className === 'apex-head') as FakeElement;
  const classes = head.children.map((c) => c.className);
  assert.ok(classes.indexOf('apex-unseen') >= 0 && classes.indexOf('apex-unseen') < classes.indexOf('apex-title'));
  assert.equal(head.children.find((c) => c.className === 'apex-unseen')?.attrs['aria-label'], '新着');
  const quiet = renderHeadline(fakeDocument, view.headline) as FakeElement;
  assert.equal(quiet.textContent, '対応が必要 0作業中 1完了 1新着 1');
  assert.deepEqual(
    quiet.children.map((c) => c.className),
    ['count', 'count', 'count', 'count'],
    '対応が必要 0 は普通の色',
  );
  const loud = renderHeadline(fakeDocument, [
    { key: 'needs_action', text: '対応が必要 2', emphasis: true },
  ]) as FakeElement;
  assert.equal(loud.children[0]?.className, 'count count--alert');
});

test('T-07：見た時刻の保存は決めた鍵と形で読み書きし、例外や壊れた値でも止まらない', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
  const store = createSeenStore(() => storage);
  assert.deepEqual(store.load(), {});
  assert.equal(store.save({ a: '2026-01-02T12:00:00.000Z' }), true);
  assert.deepEqual(JSON.parse(data.get(SEEN_STORAGE_KEY) ?? ''), { v: 1, seen: { a: '2026-01-02T12:00:00.000Z' } });
  assert.deepEqual(store.load(), { a: '2026-01-02T12:00:00.000Z' });
  data.set(SEEN_STORAGE_KEY, '{broken');
  assert.deepEqual(store.load(), {}, '壊れた値は空として読む');
  data.set(SEEN_STORAGE_KEY, JSON.stringify({ v: 2, seen: { a: 'x' } }));
  assert.deepEqual(store.load(), {}, '知らない版は空');
  data.set(SEEN_STORAGE_KEY, JSON.stringify({ v: 1, seen: { a: 1, b: '2026-01-02T12:00:00.000Z' } }));
  assert.deepEqual(store.load(), { b: '2026-01-02T12:00:00.000Z' }, '文字でない時刻は捨てる');
  const throwing = createSeenStore(() => {
    throw new Error('SecurityError');
  });
  assert.equal(throwing.load(), null, '使えなければ null（点を出さない）');
  assert.equal(throwing.save({}), false);
  const failing = createSeenStore(() => ({
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('quota');
    },
  }));
  assert.equal(failing.load(), null);
  assert.equal(failing.save({ a: 'x' }), false);
});

function trackerHarness() {
  let now = 0;
  let visible = true;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const seen: [string, string][] = [];
  const tracker = createSeenTracker({
    dwellMs: SEEN_DWELL_MS,
    now: () => now,
    isVisible: () => visible,
    schedule: (fn: () => void, ms: number) => {
      const id = next++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    cancel: (id: number | null) => {
      if (id !== null) timers.delete(id);
    },
    onSeen: (id: string, at: string) => seen.push([id, at]),
  });
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...timers]) {
      if (t.at <= now) {
        timers.delete(id);
        t.fn();
      }
    }
  };
  const setVisible = (value: boolean) => {
    visible = value;
    tracker.visibility();
  };
  return { tracker, seen, timers, advance, setVisible };
}

test('T-07：選んだ頂点を 10 秒続けて出すと見た時刻を書き、9 秒で別の頂点に替えると書かない', () => {
  assert.equal(SEEN_DWELL_MS, 10_000);
  const h = trackerHarness();
  h.tracker.show('a');
  h.advance(9_000);
  h.tracker.show('b');
  h.advance(9_000);
  assert.deepEqual(h.seen, [], '9 秒では書かない');
  h.advance(1_000);
  assert.deepEqual(h.seen, [['b', new Date(19_000).toISOString()]]);
  h.tracker.show('b');
  h.advance(30_000);
  assert.equal(h.seen.length, 1, '同じ頂点を出し続けても重ねて書かない');
  h.tracker.show(null);
  assert.equal(h.timers.size, 0);
});

test('T-07：出し続けている頂点の最後の活動が変わると、もう一度 10 秒数えて見た時刻を書き直す', () => {
  const h = trackerHarness();
  h.tracker.show('a', 't1');
  h.advance(10_000);
  assert.equal(h.seen.length, 1);
  h.tracker.show('a', 't1');
  h.advance(30_000);
  assert.equal(h.seen.length, 1, '同じ活動なら書き直さない');
  h.tracker.show('a', 't2');
  h.advance(9_000);
  assert.equal(h.seen.length, 1);
  h.advance(1_000);
  assert.deepEqual(h.seen[1], ['a', new Date(50_000).toISOString()]);
  h.tracker.show('a', 't3');
  h.advance(5_000);
  h.tracker.show('b', 't3');
  h.advance(5_000);
  assert.equal(h.seen.length, 2, '数えている途中に替えると書かない');
  assert.equal(h.timers.size, 1);
});

test('T-07：タブが隠れると数えるのをやめ、見えたら初めから数える', () => {
  const h = trackerHarness();
  h.tracker.show('a');
  h.advance(5_000);
  h.setVisible(false);
  h.advance(30_000);
  assert.deepEqual(h.seen, []);
  h.setVisible(true);
  h.advance(9_000);
  assert.deepEqual(h.seen, []);
  h.advance(1_000);
  assert.equal(h.seen.length, 1);
  const hidden = trackerHarness();
  hidden.setVisible(false);
  hidden.tracker.show('a');
  hidden.advance(20_000);
  assert.deepEqual(hidden.seen, [], '隠れている間に選んでも数えない');
});

test('T-07：入口は見た時刻を保存の口で読み書きし、選びを数える口に渡す', async () => {
  const entry = await readFile(new URL('../../web/apexes.js', import.meta.url), 'utf8');
  assert.match(entry, /createSeenStore\(\(\) => window\.localStorage\)/);
  assert.match(entry, /pruneSeen\(/);
  assert.match(entry, /seenTracker\.show\(selection\.id, pane\.remember\?\.lastActivityAt \?\? null\)/);
  assert.match(entry, /seen: seenMap/);
});

test('T-11: 札は理由の後に chip badge で描き、結べない束の行は /runs/<id> を新しいタブで開く', () => {
  const doc = buildApexList({
    state: input({ agents: [agent('a', { state: fact('done') })] }).state,
    now: NOW,
    project: null,
  });
  const items = doc.items.map((item) => ({ ...item, badges: [{ kind: 'remaining_tasks' as const, count: 2 }] }));
  const view = buildApexesView(
    {
      ...doc,
      items,
      unlinked: [
        { id: 'run-b#1', kind: 'bundle', runId: 'run-b', objective: DANGER, generation: 1, live: 1, questions: 0 },
      ],
    },
    { now: NOW },
  );
  const nodes = view.sections.flatMap((s: unknown) => (renderSection(fakeDocument, s) as FakeElement).all());
  const badges = nodes.filter((e: FakeElement) => e.className === 'chip badge');
  assert.deepEqual(
    badges.map((e: FakeElement) => e.textContent),
    ['残りの task 2'],
  );
  const bundleLink = nodes.find((e: FakeElement) => e.tagName === 'A' && e.href === '/runs/run-b');
  assert.ok(bundleLink);
  assert.equal(bundleLink.target, '_blank');
  assert.equal(bundleLink.rel, 'noopener noreferrer');
  assert.ok(bundleLink.textContent.includes(DANGER));
  assert.ok(bundleLink.textContent.includes('生きた仕事 1'));
});

test('iss-00080 T-04：compose が偽なら &compose=off の枠に作り直し、頂点に戻ると頂点の枠に作り直す', () => {
  const box = slot();
  const apex = mountAgentFrame(box, 'apex') as FakeElement;
  assert.equal(apex.src, '/embed/agent?id=apex');
  const member = mountAgentFrame(box, 'm 1', { compose: false }) as FakeElement;
  assert.notEqual(member, apex);
  assert.equal(member.src, '/embed/agent?id=m%201&compose=off');
  assert.equal(mountAgentFrame(box, 'm 1', { compose: false }), member, '同じ id と compose では作り直さない');
  const back = mountAgentFrame(box, 'apex') as FakeElement;
  assert.notEqual(back, apex, '頂点に戻ると新しい枠');
  assert.equal(back.src, '/embed/agent?id=apex');
  assert.equal(member.src, '/embed/agent?id=m%201&compose=off', '外した枠の src は書き換えない');
  assert.deepEqual(
    box.children.map((c) => c.tagName),
    ['IFRAME'],
  );
  // 同じ id でも compose が違えば作り直す。
  assert.notEqual(mountAgentFrame(box, 'apex', { compose: false }), back);
});

test('iss-00080 T-03・T-04：カードの欄・メンバーの帯・下書きの帯は textContent だけで描き、操作は data 属性', () => {
  assert.equal(renderApexCards(fakeDocument, []), null, 'カードがなければ欄を出さない');
  const cards = buildApexCards({
    reasons: ['apex_blocked'],
    waitingMembers: [{ id: 'm1', title: DANGER, mark: 'blocked' }],
    questions: [{ dispatchId: 'd1', taskTitle: DANGER, kind: 'ask' }],
  });
  const box = renderApexCards(fakeDocument, cards) as FakeElement;
  const all = box.all();
  for (const tag of new Set(all.map((e) => e.tagName))) assert.ok(ALLOWED.has(tag), tag);
  assert.ok(box.textContent.includes(DANGER));
  const buttons = all.filter((e) => e.tagName === 'BUTTON');
  assert.deepEqual(
    buttons.map((b) => [b.textContent, b.dataset.cardAction, b.dataset.cardKey, b.type]),
    [
      ['見て答える', 'answer', 'member:m1', 'button'],
      ['頂点に伝える', 'tell', 'question:ask:d1', 'button'],
    ],
  );
  assert.ok(box.textContent.includes('会話のカードで答えてください'));
  assert.equal(renderMemberBand(fakeDocument, null), null);
  const band = renderMemberBand(fakeDocument, paneFrameTarget('apex', { id: 'm1', title: DANGER }).band) as FakeElement;
  assert.ok(band.textContent.includes(`メンバー「${DANGER}」（答えるだけ）`));
  const back = band.all().find((e) => e.tagName === 'BUTTON');
  assert.equal(back?.dataset.action, 'to-apex');
  assert.equal(back?.textContent, '頂点に戻る');
  assert.equal(renderDraftNotice(fakeDocument, null), null);
  const notice = renderDraftNotice(fakeDocument, { kind: 'bad', text: '下書きを入れられませんでした' }) as FakeElement;
  assert.equal(notice.textContent, '下書きを入れられませんでした');
});

test('iss-00080 T-04：メンバーの枠の間の［頂点に伝える］は頂点の枠に作り直してから、その枠の ready を待って送る', () => {
  const box = slot();
  const posted: Array<{ frame: string; message: unknown; origin: string }> = [];
  const withWindow = (frame: FakeElement) => {
    const win = {
      postMessage: (message: unknown, origin: string) => posted.push({ frame: frame.src, message, origin }),
    };
    Object.assign(frame, { contentWindow: win });
    return win;
  };
  const results: unknown[] = [];
  const sender = createDraftSender({ selfOrigin: 'http://127.0.0.1:8791', onResult: (r) => results.push(r) });
  const memberFrame = mountAgentFrame(box, 'm1', { compose: false }) as FakeElement;
  const memberWin = withWindow(memberFrame);
  sender.frameCreated(memberFrame);
  sender.handleMessage({ origin: 'http://127.0.0.1:8791', source: memberWin, data: { type: 'orca-web:ready' } });
  // 押した：頂点の枠に作り直し、その枠を覚えてから送る。
  const apexFrame = mountAgentFrame(box, 'apex') as FakeElement;
  const apexWin = withWindow(apexFrame);
  sender.frameCreated(apexFrame);
  const text = buildDraftText({ taskTitle: 't', questionKind: 'ask', dispatchId: 'd1' });
  sender.send(text);
  assert.deepEqual(posted, [], '頂点の枠の ready の前は送らない');
  sender.handleMessage({ origin: 'http://127.0.0.1:8791', source: memberWin, data: { type: 'orca-web:ready' } });
  assert.deepEqual(posted, [], '前の枠の ready では送らない');
  sender.handleMessage({ origin: 'http://127.0.0.1:8791', source: apexWin, data: { type: 'orca-web:ready' } });
  assert.deepEqual(posted, [
    { frame: '/embed/agent?id=apex', message: { type: 'orca-web:draft', text }, origin: 'http://127.0.0.1:8791' },
  ]);
  sender.frameCreated(null);
});

test('iss-00092 T-03：頂点の行の選ぶボタンの中に稼働中の内訳の木を textContent だけで描き、選びの動きは変えない', () => {
  const doc = {
    items: [
      {
        id: 'apex',
        kind: 'terminal',
        agentType: 'claude',
        title: '統括',
        worktreeId: 'w',
        group: 'working',
        mark: 'working',
        reasons: ['members_working'],
        tags: [],
        badges: [],
        counts: { total: 3, working: 1, waiting: 0, done: 2 },
        lastActivityAt: new Date(NOW).toISOString(),
        members: [{ id: 'impl', agentType: 'codex' }],
        team: [
          {
            key: 'dispatch:old',
            kind: 'dispatch',
            agentId: null,
            dispatchId: 'old',
            parentKey: null,
            depth: 1,
            title: '終わった',
            status: 'done',
            createdAt: null,
            completedAt: null,
            stateStartedAt: null,
          },
          {
            key: 'dispatch:owner',
            kind: 'dispatch',
            agentId: null,
            dispatchId: 'owner',
            parentKey: null,
            depth: 1,
            title: SHORT_DANGER,
            status: 'done',
            createdAt: null,
            completedAt: null,
            stateStartedAt: null,
          },
          {
            key: 'agent:impl',
            kind: 'agent',
            agentId: 'impl',
            dispatchId: null,
            parentKey: 'dispatch:owner',
            depth: 2,
            title: '実装担当',
            status: 'working',
            createdAt: null,
            completedAt: null,
            stateStartedAt: new Date(NOW - 5 * 60_000).toISOString(),
          },
        ],
      },
      {
        id: 'idle',
        kind: 'terminal',
        agentType: 'claude',
        title: '暇',
        worktreeId: 'w',
        group: 'working',
        mark: 'working',
        reasons: [],
        tags: [],
        badges: [],
        counts: { total: 1, working: 0, waiting: 0, done: 1 },
        lastActivityAt: null,
        members: [],
        team: [
          {
            key: 'dispatch:x',
            kind: 'dispatch',
            agentId: null,
            dispatchId: 'x',
            parentKey: null,
            depth: 1,
            title: '終わった',
            status: 'done',
            createdAt: null,
            completedAt: null,
            stateStartedAt: null,
          },
        ],
      },
    ],
    unlinked: [],
    counts: {},
    stale: false,
    project: null,
  };
  const view = buildApexesView(doc, { now: NOW });
  const section = renderSection(
    fakeDocument,
    view.sections.find((s: { key: string }) => s.key === 'working'),
  ) as FakeElement;
  const nodes = section.all();
  for (const tag of new Set(nodes.map((e) => e.tagName))) assert.ok(ALLOWED.has(tag), `unexpected element ${tag}`);
  const buttons = nodes.filter((e) => e.tagName === 'BUTTON');
  assert.deepEqual(
    buttons.map((b) => b.dataset.apex),
    ['apex', 'idle'],
  );
  const trees = nodes.filter((e) => e.className === 'apex-live');
  assert.equal(trees.length, 1, '稼働中のない頂点には木を出さない');
  const [tree] = trees;
  const [button] = buttons;
  assert.ok(tree && button);
  assert.ok(button.all().includes(tree), '木は選ぶボタンの中');
  const rows = tree.all().filter((e) => e.dataset.liveKey !== undefined);
  assert.deepEqual(
    rows.map((e) => [e.dataset.liveKey, e.style.props['--depth'], e.className]),
    [
      ['dispatch:owner', '1', 'apex-live-node apex-live-node--dim'],
      ['agent:impl', '2', 'apex-live-node'],
    ],
  );
  const [owner, impl] = rows;
  assert.ok(owner && impl);
  assert.ok(owner.textContent.includes(SHORT_DANGER));
  assert.ok(impl.textContent.includes('実装担当'));
  assert.ok(impl.textContent.includes('作業中'));
  assert.ok(impl.textContent.includes('5m'));
  assert.ok(
    impl.all().some((e) => e.tagName === 'svg'),
    'エージェントの節は agentType のアイコン',
  );
  assert.ok(
    owner.all().some((e) => e.className === 'apex-live-dot'),
    'Dispatch の節は小さな印',
  );
  assert.ok(!tree.textContent.includes('終わった'));
});

test('iss-00092 T-03：上限を超えた木は「ほか n」を添える', () => {
  const team = Array.from({ length: 12 }, (_, i) => ({
    key: `dispatch:d${i}`,
    kind: 'dispatch',
    agentId: null,
    dispatchId: `d${i}`,
    parentKey: null,
    depth: 1,
    title: `仕事 ${i}`,
    status: 'live',
    createdAt: null,
    completedAt: null,
    stateStartedAt: null,
  }));
  const item = {
    id: 'apex',
    group: 'working',
    mark: 'working',
    reasons: [],
    tags: [],
    badges: [],
    counts: {},
    members: [],
    team,
  };
  const view = buildApexesView({ items: [item], unlinked: [], counts: {}, stale: false, project: null }, { now: NOW });
  const section = renderSection(
    fakeDocument,
    view.sections.find((s: { key: string }) => s.key === 'working'),
  ) as FakeElement;
  const nodes = section.all();
  assert.equal(nodes.filter((e) => e.dataset.liveKey !== undefined).length, 8);
  assert.deepEqual(
    nodes.filter((e) => e.className === 'apex-live-more').map((e) => e.textContent),
    ['ほか 4'],
  );
});

test('iss-00097 T-04：内訳の木の、対応が必要の done の節は薄くせず、印の札を textContent で状態の言葉の横に描く', () => {
  const item = {
    id: 'apex',
    group: 'working',
    mark: 'working',
    reasons: [],
    tags: [],
    badges: [],
    counts: {},
    members: [],
    team: [
      {
        key: 'dispatch:owner',
        kind: 'dispatch',
        agentId: null,
        dispatchId: 'owner',
        parentKey: null,
        depth: 1,
        title: SHORT_DANGER,
        status: 'done',
        createdAt: null,
        completedAt: null,
        stateStartedAt: null,
      },
    ],
    questions: [{ dispatchId: 'owner', taskTitle: SHORT_DANGER, kind: 'ask', working: false }],
    waitingMembers: [],
  };
  const view = buildApexesView({ items: [item], unlinked: [], counts: {}, stale: false, project: null }, { now: NOW });
  const section = renderSection(
    fakeDocument,
    view.sections.find((s: { key: string }) => s.key === 'working'),
  ) as FakeElement;
  const nodes = section.all();
  for (const tag of new Set(nodes.map((e) => e.tagName))) assert.ok(ALLOWED.has(tag), `unexpected element ${tag}`);
  const row = nodes.find((e) => e.dataset.liveKey === 'dispatch:owner');
  assert.ok(row);
  assert.equal(row.className, 'apex-live-node');
  const classes = row.children.map((e) => e.className);
  const at = classes.indexOf('apex-live-mark apex-live-mark--done');
  assert.ok(at >= 0);
  assert.equal(classes[at + 1], 'member-attention member-attention--urgent');
  assert.equal(row.children[at + 1]?.textContent, '対応が必要：質問');
});

test('iss-00098：attentionMarks は question_answered・decision_resolved を控えめの印として文字だけで描く', () => {
  const table = memberAttention({
    questions: [
      { dispatchId: 'a', kind: 'ask', working: false, answered: true },
      { dispatchId: 'g', kind: 'gate', working: false, answered: true },
    ],
    waitingMembers: [],
  });
  const marks = ['a', 'g'].map((id) => attentionFor({ kind: 'dispatch', dispatchId: id }, table)[0]);
  const nodes = attentionMarks(fakeDocument, marks) as FakeElement[];
  assert.deepEqual(
    nodes.map((node) => [node.textContent, node.className]),
    [
      ['質問の印あり（返事済み）', 'member-attention member-attention--quiet'],
      ['判断の印あり（門は解決済み）', 'member-attention member-attention--quiet'],
    ],
  );
});
