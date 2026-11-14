import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as marks from '../../web/embed/agent-marks.js';
import { renderAgentMarks, watchWorktreeSummary } from '../../web/embed/agent-marks.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NOW = Date.parse('2026-01-02T10:00:00.000Z');
const DANGER = '<script>alert(1)</script><img src=x onerror=alert(2)>';

/** 小さな偽の要素。文字は textContent だけで持ち、HTML を解く口を使うと失敗する。 */
class FakeElement {
  readonly tagName: string;
  readonly namespaceURI: string | null;
  readonly ownerDocument: FakeDocument;
  readonly children: FakeElement[] = [];
  readonly attrs: Record<string, string> = {};
  readonly listeners: Record<string, ((event: unknown) => void)[]> = {};
  className = '';
  type = '';
  #text = '';

  constructor(doc: FakeDocument, tag: string, ns: string | null) {
    this.ownerDocument = doc;
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

  setAttribute(name: string, value: string): void {
    if (name.toLowerCase().startsWith('on')) throw new Error(`event attribute ${name} must not be set`);
    this.attrs[name] = String(value);
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  addEventListener(type: string, fn: (event: unknown) => void): void {
    this.listeners[type] = [...(this.listeners[type] ?? []), fn];
  }

  click(): void {
    for (const fn of this.listeners.click ?? []) fn({ type: 'click' });
  }

  append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') throw new Error('append a string is not expected');
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.#text = '';
    this.children.length = 0;
    this.append(...nodes);
  }

  all(): FakeElement[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}

class FakeDocument {
  hidden = false;
  readonly listeners: Record<string, (() => void)[]> = {};
  createElement(tag: string) {
    return new FakeElement(this, tag, null);
  }
  createElementNS(ns: string, tag: string) {
    return new FakeElement(this, tag, ns);
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), fn];
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  fire(type: string) {
    for (const fn of [...(this.listeners[type] ?? [])]) fn();
  }
  write() {
    throw new Error('document.write must not be used');
  }
}

function agent(patch: Record<string, unknown>) {
  return {
    id: 'a',
    mark: 'working',
    agentType: 'claude',
    since: null,
    detail: `/embed/agent?id=${String(patch.id ?? 'a')}`,
    elapsedFrom: null,
    elapsedBasis: null,
    ...patch,
  };
}

const worktree = (agents: unknown[]) => ({ id: 'wt', path: '/repo/a', title: DANGER, agents });

function markEls(root: FakeElement) {
  return root.all().filter((el) => el.className.split(' ').includes('orca-mark'));
}

test('部品の入口は表と組み立てを再び export する', () => {
  for (const name of [
    'AGENT_ICONS',
    'iconKey',
    'MARKS',
    'MARK_LABELS',
    'formatElapsed',
    'findWorktree',
    'buildMarks',
  ]) {
    assert.ok(name in marks, name);
  }
});

test('renderAgentMarks：置き場の中を作り直し、印ごとに class・読み上げ・アイコン・経過を持つ', () => {
  const doc = new FakeDocument();
  const container = doc.createElement('div');
  container.append(doc.createElement('p'));
  container.textContent = '前の描画';
  renderAgentMarks(
    container,
    worktree([
      agent({
        id: 'w',
        mark: 'working',
        agentType: 'claude',
        elapsedFrom: '2026-01-02T09:55:00.000Z',
        elapsedBasis: 'state',
      }),
      agent({
        id: 's',
        mark: 'sleeping',
        agentType: 'codex',
        elapsedFrom: '2026-01-02T08:00:00.000Z',
        elapsedBasis: 'worktree-activity',
      }),
      agent({ id: 'u', mark: DANGER, agentType: DANGER }),
    ]),
    { now: NOW },
  );
  assert.equal(container.children.length, 1);
  const root = container.children[0] as FakeElement;
  assert.equal(root.tagName, 'SPAN');
  assert.equal(root.className, 'orca-marks orca-marks--sm');
  assert.ok(!container.textContent.includes('前の描画'));

  const els = markEls(root);
  assert.equal(els.length, 3);
  const [w, u, s] = els as [FakeElement, FakeElement, FakeElement];
  assert.equal(w.tagName, 'SPAN');
  assert.equal(w.getAttribute('role'), 'img');
  assert.equal(w.className, 'orca-mark orca-mark--working');
  assert.equal(w.getAttribute('aria-label'), 'Claude、作業中、この状態になって 5分');
  assert.equal(w.getAttribute('title'), 'Claude、作業中、この状態になって 5分');
  assert.equal(u.className, 'orca-mark orca-mark--unknown');
  assert.equal(s.className, 'orca-mark orca-mark--sleeping');
  assert.equal(s.getAttribute('aria-label'), 'Codex、スリープ、最後の活動から 2時間');

  // 経過の span
  const time = (el: FakeElement) => el.all().filter((c) => c.className === 'orca-mark-time');
  assert.equal(time(w).length, 1);
  assert.equal(time(w)[0]?.textContent, '5m');
  assert.equal(time(u).length, 0);
  assert.equal(time(s)[0]?.textContent, '2h');

  // アイコンの SVG は createElementNS で作り、aria-hidden
  for (const el of els) {
    const svgs = el.all().filter((c) => c.tagName === 'svg');
    assert.ok(svgs.length >= 1);
    for (const svg of svgs) {
      assert.equal(svg.namespaceURI, SVG_NS);
      assert.equal(svg.getAttribute('aria-hidden'), 'true');
      for (const child of svg.all()) assert.equal(child.namespaceURI, SVG_NS);
    }
  }
  const claudePath = w.all().find((c) => c.tagName === 'path');
  assert.equal(claudePath?.getAttribute('fill'), '#D97757');
  assert.equal(claudePath?.getAttribute('fill-rule'), 'nonzero');
  assert.equal(
    w
      .all()
      .find((c) => c.tagName === 'svg')
      ?.getAttribute('viewBox'),
    '0 0 24 24',
  );

  // スリープだけに月の印
  const moon = (el: FakeElement) =>
    el.all().filter((c) => c.tagName === 'svg' && c.getAttribute('class') === 'orca-mark-moon');
  assert.equal(moon(s).length, 1);
  assert.equal(moon(w).length, 0);
  assert.equal(moon(u).length, 0);

  // 危ない文字は名前としても文字としても見せない（知らない種類の名前は読み上げにだけ）
  assert.ok(!root.textContent.includes('<script>'));
  assert.ok(!root.textContent.includes('Claude'));
});

test('renderAgentMarks：onSelect があればボタンで、押すと id と detail を渡す', () => {
  const doc = new FakeDocument();
  const container = doc.createElement('div');
  const picked: unknown[] = [];
  renderAgentMarks(
    container,
    worktree([agent({ id: 'b', mark: 'blocked' }), agent({ id: 'x', mark: 'done', detail: 'javascript:alert(1)' })]),
    { now: NOW, size: 'md', onSelect: (v: unknown) => picked.push(v) },
  );
  const root = container.children[0] as FakeElement;
  assert.equal(root.className, 'orca-marks orca-marks--md');
  const [b, x] = markEls(root) as [FakeElement, FakeElement];
  assert.equal(b.tagName, 'BUTTON');
  assert.equal(b.type, 'button');
  assert.equal(b.getAttribute('role'), null);
  assert.equal(b.getAttribute('aria-label'), 'Claude、許可待ち');
  b.click();
  x.click();
  assert.deepEqual(picked, [
    { id: 'b', detail: '/embed/agent?id=b' },
    { id: 'x', detail: null },
  ]);
});

test('renderAgentMarks：大きさの値が知らないものなら sm、max を超えると「+N」の印', () => {
  const doc = new FakeDocument();
  const container = doc.createElement('div');
  const agents = ['working', 'done', 'sleeping', 'sleeping', 'blocked'].map((mark, i) => agent({ id: `a${i}`, mark }));
  renderAgentMarks(container, worktree(agents), { now: NOW, size: DANGER, max: 3, onSelect: () => {} });
  const root = container.children[0] as FakeElement;
  assert.equal(root.className, 'orca-marks orca-marks--sm');
  const els = markEls(root);
  assert.equal(els.length, 3);
  const more = els[2] as FakeElement;
  assert.equal(more.className, 'orca-mark orca-mark--more');
  assert.equal(more.tagName, 'SPAN');
  assert.equal(more.textContent, '+3');
  assert.equal(more.getAttribute('aria-label'), 'ほか 3 件');
  assert.equal(more.getAttribute('title'), 'ほか 3 件');
});

test('renderAgentMarks：worktree がなければ空の置き場', () => {
  const doc = new FakeDocument();
  const container = doc.createElement('div');
  renderAgentMarks(container, null, { now: NOW });
  const root = container.children[0] as FakeElement;
  assert.equal(root.className, 'orca-marks orca-marks--sm');
  assert.equal(root.children.length, 0);
});

type Timer = { fn: () => void; ms: number; id: number };

function harness(responses: (() => Promise<unknown>)[]) {
  const doc = new FakeDocument();
  const timers: Timer[] = [];
  let nextId = 1;
  const calls: { url: string; init: unknown }[] = [];
  let pending: ((v: unknown) => void) | null = null;
  const fetchImpl = (url: string, init: unknown) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next) return next();
    return new Promise((resolve) => {
      pending = resolve;
    });
  };
  const setTimer = (fn: () => void, ms: number) => {
    const t = { fn, ms, id: nextId++ };
    timers.push(t);
    return t.id;
  };
  const clearTimer = (id: number) => {
    const at = timers.findIndex((t) => t.id === id);
    if (at >= 0) timers.splice(at, 1);
  };
  const runTimer = () => {
    const t = timers.shift();
    assert.ok(t, 'a timer should be scheduled');
    t.fn();
  };
  return {
    doc,
    timers,
    calls,
    fetchImpl,
    setTimer,
    clearTimer,
    runTimer,
    resolvePending: (v: unknown) => pending?.(v),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const ok = (body: unknown) => () => Promise.resolve({ ok: true, status: 200, json: async () => body });

test('watchWorktreeSummary：すぐに1回読み、終わってから間隔で予約する（重ならない）', async () => {
  const h = harness([ok({ n: 1 }), ok({ n: 2 })]);
  const docs: unknown[] = [];
  const w = watchWorktreeSummary('http://127.0.0.1:8791', {
    onDocument: (d: unknown) => docs.push(d),
    onError: () => assert.fail('no error expected'),
    intervalMs: 5000,
    fetchImpl: h.fetchImpl,
    doc: h.doc,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0]?.url, 'http://127.0.0.1:8791/api/worktrees/summary');
  assert.deepEqual(h.calls[0]?.init, { cache: 'no-store' });
  assert.equal(h.timers.length, 0, '読み終える前は予約しない');
  await flush();
  assert.deepEqual(docs, [{ n: 1 }]);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0]?.ms, 5000);
  h.runTimer();
  assert.equal(h.calls.length, 2);
  await flush();
  assert.deepEqual(docs, [{ n: 1 }, { n: 2 }]);
  assert.equal(h.timers.length, 1);
  w.stop();
});

test('watchWorktreeSummary：既定の間隔は 10 秒。読みの途中に見えるようになっても重ねて読まない', async () => {
  const h = harness([]);
  const w = watchWorktreeSummary('', {
    onDocument: () => {},
    onError: () => {},
    fetchImpl: h.fetchImpl,
    doc: h.doc,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });
  assert.equal(h.calls[0]?.url, '/api/worktrees/summary');
  h.doc.fire('visibilitychange');
  assert.equal(h.calls.length, 1);
  h.resolvePending({ ok: true, status: 200, json: async () => ({}) });
  await flush();
  assert.equal(h.timers[0]?.ms, 10_000);
  w.stop();
});

test('watchWorktreeSummary：hidden の間は読まずに予約を続け、見えたらすぐ読む', async () => {
  const h = harness([ok({ n: 1 }), ok({ n: 2 })]);
  h.doc.hidden = true;
  const docs: unknown[] = [];
  const w = watchWorktreeSummary('http://h', {
    onDocument: (d: unknown) => docs.push(d),
    onError: () => {},
    intervalMs: 1000,
    fetchImpl: h.fetchImpl,
    doc: h.doc,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.length, 1);
  h.runTimer();
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.length, 1);
  h.doc.hidden = false;
  h.doc.fire('visibilitychange');
  assert.equal(h.calls.length, 1);
  assert.equal(h.timers.length, 0, '見えて読むときは前の予約を消す');
  await flush();
  assert.deepEqual(docs, [{ n: 1 }]);
  assert.equal(h.timers.length, 1);
  // 隠れたときの visibilitychange では読まない
  h.doc.hidden = true;
  h.doc.fire('visibilitychange');
  assert.equal(h.calls.length, 1);
  w.stop();
});

test('watchWorktreeSummary：HTTP の誤りと例外は onError に渡し、輪は続く', async () => {
  const h = harness([
    () => Promise.resolve({ ok: false, status: 503, json: async () => ({}) }),
    () => Promise.reject(new Error('network')),
    ok({ n: 3 }),
  ]);
  const errors: unknown[] = [];
  const docs: unknown[] = [];
  const w = watchWorktreeSummary('http://h', {
    onDocument: (d: unknown) => docs.push(d),
    onError: (e: unknown) => errors.push(e),
    intervalMs: 1000,
    fetchImpl: h.fetchImpl,
    doc: h.doc,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });
  await flush();
  assert.equal(errors.length, 1);
  assert.match(String((errors[0] as Error).message), /503/);
  h.runTimer();
  await flush();
  assert.equal(errors.length, 2);
  assert.equal((errors[1] as Error).message, 'network');
  h.runTimer();
  await flush();
  assert.deepEqual(docs, [{ n: 3 }]);
  assert.equal(h.timers.length, 1);
  w.stop();
});

test('watchWorktreeSummary：stop の後は読まず、予約と見え方の受け手を外す', async () => {
  const h = harness([ok({ n: 1 })]);
  const docs: unknown[] = [];
  const w = watchWorktreeSummary('http://h', {
    onDocument: (d: unknown) => docs.push(d),
    onError: () => {},
    intervalMs: 1000,
    fetchImpl: h.fetchImpl,
    doc: h.doc,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });
  await flush();
  assert.equal(h.timers.length, 1);
  assert.equal(h.doc.listeners.visibilitychange?.length, 1);
  w.stop();
  assert.equal(h.timers.length, 0);
  assert.equal(h.doc.listeners.visibilitychange?.length, 0);
  h.doc.fire('visibilitychange');
  assert.equal(h.calls.length, 1);
});

test('watchWorktreeSummary：読みの途中で stop したら、結果を渡さず予約もしない', async () => {
  const h = harness([]);
  const docs: unknown[] = [];
  const w = watchWorktreeSummary('http://h', {
    onDocument: (d: unknown) => docs.push(d),
    onError: () => assert.fail('no error expected'),
    fetchImpl: h.fetchImpl,
    doc: h.doc,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
  });
  w.stop();
  h.resolvePending({ ok: true, status: 200, json: async () => ({ n: 1 }) });
  await flush();
  assert.deepEqual(docs, []);
  assert.equal(h.timers.length, 0);
});
