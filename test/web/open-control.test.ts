// 開くボタンの DOM の部品（web/embed/open-control.js）を、小さな偽の document で確かめる（T-04、T-05）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APP_ICONS } from '../../web/embed/agent-marks-icons.js';
import { createOpenControl, runOpen } from '../../web/embed/open-control.js';
import { OPEN_DONE_MS, OPEN_MESSAGES } from '../../web/embed/open-control-view.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

class FakeElement {
  readonly tagName: string;
  readonly namespaceURI: string | null;
  readonly attrs: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners: Record<string, (() => void)[]> = {};
  className = '';
  title = '';
  type = '';
  disabled = false;
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

  setAttribute(name: string, value: string): void {
    if (name.toLowerCase().startsWith('on')) throw new Error(`event attribute ${name} must not be set`);
    this.attrs[name] = String(value);
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  addEventListener(name: string, fn: () => void): void {
    this.listeners[name] ??= [];
    this.listeners[name].push(fn);
  }

  append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') throw new Error('append a string is not expected');
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }

  all(): FakeElement[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}

const doc = {
  createElement: (tag: string) => new FakeElement(tag),
  createElementNS: (ns: string, tag: string) => new FakeElement(tag, ns),
  write() {
    throw new Error('document.write must not be used');
  },
};

function parts(control: { root: unknown; button: unknown }) {
  const root = control.root as FakeElement;
  const button = control.button as FakeElement;
  const find = (className: string) => root.all().filter((e) => e.className === className);
  const icon = find('orca-open-icon')[0];
  assert.ok(icon);
  const svgs = icon.children;
  assert.equal(svgs.length, 1, 'アイコンの置き場に svg がちょうど1つ');
  return {
    root,
    button,
    icon,
    svg: svgs[0] as FakeElement,
    text: find('orca-open-text'),
    status: find('orca-open-status'),
  };
}

test('T-04：文字ありの部品は、Open の文字、aria-label、title、aria-hidden のロゴ、見えない status を持つ', () => {
  const control = createOpenControl(doc, { size: 'md' });
  const { root, button, svg, text, status } = parts(control);
  assert.equal(root.tagName, 'SPAN');
  assert.equal(root.className, 'orca-open');
  assert.equal(root.dataset.size, 'md');
  assert.equal(root.dataset.label, 'text');
  assert.equal(root.dataset.tone, undefined);
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.className, 'orca-open-button');
  assert.equal(button.type, 'button');
  assert.equal(button.getAttribute('aria-label'), 'Open（Orca で開く）');
  assert.equal(button.title, 'Orca で開く');
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-busy'), 'false');
  assert.equal(svg.namespaceURI, SVG_NS);
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.equal(svg.getAttribute('viewBox'), APP_ICONS.orca.viewBox);
  assert.equal(svg.children[0]?.getAttribute('d'), APP_ICONS.orca.paths[0]?.d);
  assert.equal(text.length, 1);
  assert.equal(text[0]?.textContent, 'Open');
  assert.equal(button.textContent, 'Open');
  assert.equal(status.length, 1);
  assert.equal(status[0]?.getAttribute('role'), 'status');
  assert.equal(status[0]?.getAttribute('aria-live'), 'polite');
  assert.equal(status[0]?.textContent, '');
  // status はボタンの外（読み上げの名前に混ざらない）。
  assert.ok(!button.all().includes(status[0] as FakeElement));
});

test('T-04：アイコンだけの部品は Open の文字がなく、aria-label が「Orca で開く」。大きさの既定は sm', () => {
  const control = createOpenControl(doc, { label: 'none' });
  const { root, button, text } = parts(control);
  assert.equal(root.dataset.size, 'sm');
  assert.equal(root.dataset.label, 'none');
  assert.equal(text.length, 0);
  assert.equal(button.textContent, '');
  assert.equal(button.getAttribute('aria-label'), 'Orca で開く');
  assert.equal(button.title, 'Orca で開く');
});

test('T-04：知らない大きさと形は sm と text に戻る', () => {
  const { root } = parts(createOpenControl(doc, { size: 'xl', label: 'icon' } as never));
  assert.equal(root.dataset.size, 'sm');
  assert.equal(root.dataset.label, 'text');
});

test('T-04：setState で、アイコン・data-tone・disabled・aria-busy・title・status の文字が変わる', () => {
  const control = createOpenControl(doc, {});
  const read = () => {
    const p = parts(control);
    return {
      icon: p.svg.getAttribute('data-icon'),
      tone: p.root.dataset.tone,
      disabled: p.button.disabled,
      busy: p.button.getAttribute('aria-busy'),
      title: p.button.title,
      status: p.status[0]?.textContent,
      text: p.button.textContent,
    };
  };
  assert.equal(read().icon, 'orca');
  control.setState('busy');
  assert.deepEqual(read(), {
    icon: 'spinner',
    tone: undefined,
    disabled: true,
    busy: 'true',
    title: '開いています…',
    status: '開いています…',
    text: 'Open',
  });
  assert.equal(control.state, 'busy');
  control.setState('done', '開きました');
  assert.deepEqual(read(), {
    icon: 'check',
    tone: undefined,
    disabled: false,
    busy: 'false',
    title: '開きました',
    status: '開きました',
    text: 'Open',
  });
  control.setState('error', OPEN_MESSAGES.target_gone);
  assert.deepEqual(read(), {
    icon: 'orca',
    tone: 'warn',
    disabled: false,
    busy: 'false',
    title: OPEN_MESSAGES.target_gone,
    status: OPEN_MESSAGES.target_gone,
    text: 'Open',
  });
  control.setState('missing');
  assert.deepEqual(read(), {
    icon: 'orca',
    tone: 'warn',
    disabled: true,
    busy: 'false',
    title: 'worktree の指定がありません',
    status: 'worktree の指定がありません',
    text: 'Open',
  });
  control.setState('idle');
  assert.equal(read().tone, undefined);
  assert.equal(read().status, '');
  assert.equal(read().disabled, false);
});

test('T-04：言葉に HTML があっても文字のまま入り、要素にならない', () => {
  const control = createOpenControl(doc, {});
  const danger = '<img src=x onerror=alert(1)>';
  control.setState('error', danger);
  const { root, button, status } = parts(control);
  assert.equal(button.title, danger);
  assert.equal(status[0]?.textContent, danger);
  const allowed = new Set(['SPAN', 'BUTTON', 'svg', 'path']);
  for (const el of root.all()) assert.ok(allowed.has(el.tagName), el.tagName);
});

// 偽の時計：setTimer で予約した関数を手で進める。
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      seq += 1;
      timers.set(seq, { at: now + ms, fn });
      return seq;
    },
    clearTimer: (id: number) => {
      timers.delete(id);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    },
    pending: () => timers.size,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('T-05：busy の間の2回目の押しは send を呼ばず、done の後 OPEN_DONE_MS で idle に戻る', async () => {
  const control = createOpenControl(doc, {});
  const clock = fakeClock();
  const reply = deferred<{ status: number; body: unknown }>();
  let calls = 0;
  const send = () => {
    calls += 1;
    return reply.promise;
  };
  const seen: string[] = [];
  const onState = (state: string) => seen.push(state);
  const first = runOpen(control, send, { ...clock, onState });
  assert.equal(control.state, 'busy');
  assert.equal(await runOpen(control, send, { ...clock, onState }), null);
  assert.equal(calls, 1);
  reply.resolve({ status: 200, body: { ok: true } });
  assert.deepEqual(await first, { state: 'done', message: '開きました' });
  assert.equal(control.state, 'done');
  clock.advance(OPEN_DONE_MS - 1);
  assert.equal(control.state, 'done');
  clock.advance(1);
  assert.equal(control.state, 'idle');
  assert.deepEqual(seen, ['busy', 'done', 'idle']);
});

test('T-05：done の間にまた押すと古い時計を消し、新しい結果が残る', async () => {
  const control = createOpenControl(doc, {});
  const clock = fakeClock();
  await runOpen(control, async () => ({ status: 200, body: { ok: true } }), clock);
  assert.equal(clock.pending(), 1);
  clock.advance(OPEN_DONE_MS / 2);
  await runOpen(control, async () => ({ status: 409, body: { ok: false, error: 'busy' } }), clock);
  assert.equal(clock.pending(), 0);
  clock.advance(OPEN_DONE_MS);
  assert.equal(control.state, 'error');
});

test('T-05：error は時計が進んでも残り、send の投げは network の言葉になる', async () => {
  const control = createOpenControl(doc, {});
  const clock = fakeClock();
  const result = await runOpen(
    control,
    async () => ({ status: 404, body: { ok: false, error: 'worktree_not_found', message: '<b>x</b>' } }),
    clock,
  );
  assert.deepEqual(result, { state: 'error', message: OPEN_MESSAGES.worktree_not_found });
  clock.advance(OPEN_DONE_MS * 10);
  assert.equal(control.state, 'error');
  assert.equal(parts(control).button.title, OPEN_MESSAGES.worktree_not_found);

  const thrown = await runOpen(
    control,
    async () => {
      throw new Error('secret detail');
    },
    clock,
  );
  assert.deepEqual(thrown, { state: 'error', message: 'orca-web につながりません' });
  assert.equal(parts(control).button.title, 'orca-web につながりません');
});

test('T-05：missing の部品は押しても send を呼ばない', async () => {
  const control = createOpenControl(doc, {});
  control.setState('missing');
  let calls = 0;
  assert.equal(
    await runOpen(control, async () => {
      calls += 1;
      return { status: 200, body: { ok: true } };
    }),
    null,
  );
  assert.equal(calls, 0);
  assert.equal(control.state, 'missing');
});
