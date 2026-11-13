import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInbox } from '../../src/inbox/classify.ts';
import { renderFreshness, renderStage } from '../../web/inbox-dom.js';
import { buildInboxView } from '../../web/inbox-view.js';
import { agent, ci, fact, input, mail, message, NOW, repo, worktree } from '../inbox/fixture.ts';

/** 小さな偽の要素。textContent だけを文字として持ち、HTML を解く口を使うと失敗する。 */
class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly listeners: Record<string, (() => void)[]> = {};
  className = '';
  title = '';
  href = '';
  rel = '';
  target = '';
  type = '';
  open = false;
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
    throw new Error('setAttribute is not expected');
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
const ALLOWED = new Set(['SECTION', 'H2', 'DETAILS', 'SUMMARY', 'UL', 'LI', 'DIV', 'SPAN', 'P', 'A', 'BUTTON']);

function dangerousView() {
  const base = input({
    repos: [repo('repo-a', DANGER)],
    worktrees: [worktree({ branch: fact(DANGER), displayName: fact(DANGER) })],
    agents: [
      agent('agent-a', { state: fact('blocked'), agentType: fact(DANGER), title: fact(DANGER) }),
      agent('agent-b', { state: fact('done') }),
    ],
  });
  base.lastWords = new Map([
    ['agent-a', DANGER],
    ['agent-b', DANGER],
  ]);
  base.mail = mail({ messages: [message({ dispatchId: 'nobody', subject: DANGER })] });
  return buildInboxView(buildInbox(base), { now: NOW, formatTime: (s: string) => s });
}

test('<script> を含む最後の一言と題名は、文字のまま描かれ、要素にならない', () => {
  const view = dangerousView();
  const nodes = view.stages.map((s: unknown) =>
    renderStage(fakeDocument, s, { showOpen: true, onOpen: () => {} }),
  ) as FakeElement[];
  const tags = new Set(nodes.flatMap((n) => n.all().map((e) => e.tagName)));
  for (const tag of tags) assert.ok(ALLOWED.has(tag), `unexpected element ${tag}`);
  const text = nodes.map((n) => n.textContent).join('\n');
  assert.ok(text.includes(DANGER), 'the HTML stays as text');
  // 要対応の項目（エージェントと質問）と、終わった段の最後の一言。
  assert.ok(text.split(DANGER).length - 1 >= 4);
});

test('終わった段は details で畳み、ほかの段は畳まない。開いていた段は開いたまま描く', () => {
  const view = dangerousView();
  const finished = view.stages.find((s: { stage: string }) => s.stage === 'finished');
  const needs = view.stages.find((s: { stage: string }) => s.stage === 'needs_action');
  const closed = renderStage(fakeDocument, finished, { showOpen: true, onOpen: () => {} }) as FakeElement;
  const details = closed.all().find((e) => e.tagName === 'DETAILS');
  assert.ok(details);
  assert.equal(details.open, false);
  assert.match(details.children[0]?.textContent ?? '', /終わった（1）/);
  const kept = renderStage(fakeDocument, finished, { showOpen: true, onOpen: () => {}, expanded: true }) as FakeElement;
  assert.equal(kept.all().find((e) => e.tagName === 'DETAILS')?.open, true);
  const open = renderStage(fakeDocument, needs, { showOpen: true, onOpen: () => {} }) as FakeElement;
  assert.equal(
    open.all().some((e) => e.tagName === 'DETAILS'),
    false,
  );
  assert.match(open.children[0]?.textContent ?? '', /要対応（2）/);
});

test('詳細は新しい画面、PR は https だけで noopener noreferrer のリンク。Orca で開くは showOpen のときだけ出る', () => {
  const base = input({
    agents: [agent('agent a', { state: fact('blocked') })],
    worktrees: [
      worktree({ pr: fact({ number: 1, state: 'open', title: 'PR', url: 'https://github.com/e/d/pull/1' }), ci: ci() }),
    ],
  });
  const view = buildInboxView(buildInbox(base), { now: NOW, formatTime: (s: string) => s });
  const opened: unknown[] = [];
  const nodes = view.stages.map((s: unknown) =>
    renderStage(fakeDocument, s, { showOpen: true, onOpen: (target: unknown) => opened.push(target) }),
  ) as FakeElement[];
  const links = nodes.flatMap((n) => n.all()).filter((e) => e.tagName === 'A');
  assert.deepEqual(
    links.map((a) => [a.href, a.target, a.rel]),
    [
      ['/embed/agent?id=agent%20a', '_blank', 'noopener noreferrer'],
      ['https://github.com/e/d/pull/1', '_blank', 'noopener noreferrer'],
    ],
  );
  const buttons = nodes.flatMap((n) => n.all()).filter((e) => e.tagName === 'BUTTON');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0]?.textContent, 'Orca で開く');
  for (const fn of buttons[0]?.listeners.click ?? []) fn();
  assert.deepEqual(opened.length, 1);
  const narrow = view.stages.map((s: unknown) =>
    renderStage(fakeDocument, s, { showOpen: false, onOpen: () => {} }),
  ) as FakeElement[];
  assert.equal(narrow.flatMap((n) => n.all()).filter((e) => e.tagName === 'BUTTON').length, 0);
  // 許可の承認、返事、送信の操作は置かない。
  const words = nodes.map((n) => n.textContent).join('');
  for (const word of ['承認', '返事', '送信', '許可する']) assert.ok(!words.includes(word), word);
});

test('鮮度の文は段落にして、種類を class で示す', () => {
  const node = renderFreshness(fakeDocument, [
    { text: DANGER, kind: 'bad' },
    { text: 'x', kind: 'info' },
  ]) as FakeElement;
  assert.deepEqual(
    node.children.map((c) => [c.tagName, c.className, c.textContent]),
    [
      ['P', 'bad', DANGER],
      ['P', 'info', 'x'],
    ],
  );
});

test('連絡が読めていない要対応の段は、空の段でも「なし」と示さず、読めていないと示す', () => {
  const base = input({});
  base.mail = mail({ lastSuccessAt: null, error: { kind: 'runs-unavailable' }, runsRead: 0 });
  const view = buildInboxView(buildInbox(base), { now: NOW, formatTime: (s: string) => s });
  const needs = renderStage(fakeDocument, view.stages[0], { showOpen: true, onOpen: () => {} }) as FakeElement;
  assert.ok(needs.textContent.includes('読めていません'));
  assert.ok(!needs.textContent.includes('なし'));
  const running = renderStage(fakeDocument, view.stages[2], { showOpen: true, onOpen: () => {} }) as FakeElement;
  assert.ok(running.textContent.endsWith('なし'));
});
