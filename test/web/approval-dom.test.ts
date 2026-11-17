// 承認のカードの DOM（web/embed/approval-dom.js）を、小さな偽の document で確かめる（iss-00050 T-14、R-02、F-04）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderChatRow } from '../../web/embed/agent-dom.js';
import { renderApprovalCard } from '../../web/embed/approval-dom.js';
import { buildApprovalCard, choose, initialApprovalState, readOnlyApprover } from '../../web/embed/approval-view.js';

// biome-ignore lint/suspicious/noExplicitAny: the parts and views are untyped JS objects
type Any = any;

/** 小さな偽の要素。textContent だけを文字として持ち、HTML を解く口を使うと失敗する。 */
class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attrs: Record<string, string> = {};
  className = '';
  title = '';
  type = '';
  value = '';
  placeholder = '';
  rows = 0;
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

  setAttribute(name: string, value: string): void {
    if (name.toLowerCase().startsWith('on')) throw new Error(`event attribute ${name} must not be set`);
    this.attrs[name] = String(value);
  }

  addEventListener(): void {}

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
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
const ALLOWED = new Set([
  'SECTION',
  'DIV',
  'P',
  'SPAN',
  'BUTTON',
  'PRE',
  'DETAILS',
  'SUMMARY',
  'UL',
  'LI',
  'svg',
  'path',
  'circle',
  'rect',
  'g',
]);
const allowedTag = (el: FakeElement) => ALLOWED.has(el.tagName) || ALLOWED.has(el.tagName.toLowerCase());

const part = (over: Record<string, unknown> = {}): Any => ({
  type: 'approval',
  source: 'chat',
  prompt: { itemId: 'i1', revision: 1 },
  title: DANGER,
  tool: DANGER,
  description: DANGER,
  reason: DANGER,
  blockedPath: DANGER,
  plan: null,
  detail: `${DANGER}\n2\n3\n4\n5`,
  options: [
    { id: 'yes', label: DANGER, description: DANGER, intent: 'allow_once' },
    { id: 'always', label: '常に許可', description: null, intent: 'allow_always' },
    { id: 'no', label: '拒否', description: null, intent: 'reject_once' },
  ],
  answerable: true,
  unanswerableReason: null,
  state: 'pending',
  selectedOptionId: null,
  ...over,
});

const renderCard = (view: Any, options?: Any) =>
  renderApprovalCard(fakeDocument, view, options) as { root: FakeElement; openControl: Any };

const byClass = (root: FakeElement, name: string) => root.all().filter((e) => e.className.split(' ').includes(name));
const countOf = (root: FakeElement, text: string) => root.textContent.split(text).length - 1;

test('T-14：題・道具・説明・理由・要るパス・detail・ラベル・理由の文に紛れた HTML は文字のまま描かれ、決めた種類の要素だけを作る', () => {
  const view = buildApprovalCard(part(), { key: 'm1:0', availability: { ok: false, reason: DANGER } });
  const { root } = renderCard(view);
  assert.equal(root.tagName, 'SECTION');
  assert.deepEqual(root.className.split(' ').slice(0, 2), ['question-card', 'approval-card']);
  assert.equal(root.dataset.key, 'm1:0');
  assert.equal(root.dataset.state, 'pending');
  for (const el of root.all()) assert.ok(allowedTag(el), `作らない要素：${el.tagName}`);
  assert.equal(root.all().filter((e) => e.tagName === 'SCRIPT' || e.tagName === 'IMG').length, 0);
  // 題、道具、説明、理由、要るパス、ラベル、選択肢の説明、理由の文、detail（詳しくと下見）に1回ずつ。
  assert.equal(countOf(root, DANGER), 10);
  assert.equal(byClass(root, 'approval-title')[0]?.textContent, DANGER);
  assert.equal(byClass(root, 'question-reason')[0]?.textContent, DANGER);
  const details = byClass(root, 'approval-detail');
  assert.equal(details.length, 2);
  assert.ok(details.every((d) => d.tagName === 'PRE'));
  const more = byClass(root, 'approval-more')[0];
  assert.equal(more?.tagName, 'DETAILS');
  assert.equal(more?.dataset.part, 'detail');
  assert.equal(more?.open, false);
  assert.equal(
    renderCard(view, { detailOpen: true })
      .root.all()
      .find((e) => e.dataset.part === 'detail')?.open,
    true,
  );
});

test('T-14：選択肢は data-action option と data-option のボタンで、主の選択肢に data-primary、押せないときは disabled', () => {
  const { root, openControl } = renderCard(buildApprovalCard(part(), { key: 'k', availability: { ok: true } }));
  assert.equal(openControl, null);
  const options = byClass(root, 'question-option');
  assert.deepEqual(
    options.map((o) => [o.tagName, o.type, o.dataset.action, o.dataset.option, o.dataset.primary, o.disabled]),
    [
      ['BUTTON', 'button', 'option', 'yes', 'true', false],
      ['BUTTON', 'button', 'option', 'always', undefined, false],
      ['BUTTON', 'button', 'option', 'no', undefined, false],
    ],
  );
  assert.equal(byClass(root, 'approval-confirm').length, 0);
  const off = renderCard(buildApprovalCard(part(), { key: 'k', availability: { ok: false, reason: '無効' } })).root;
  assert.ok(byClass(off, 'question-option').every((o) => o.disabled));
});

test('T-14：確かめの段は1行と「答える」「やめる」のボタンを data-action persist-confirm・persist-cancel で持つ', () => {
  const p = part();
  const state = choose(initialApprovalState(), p, 'always').state;
  const { root } = renderCard(buildApprovalCard(p, { key: 'k', state, availability: { ok: true } }));
  const band = byClass(root, 'approval-confirm')[0];
  assert.ok(band);
  assert.equal(band.tagName, 'DIV');
  assert.equal(
    byClass(band, 'approval-confirm-note')[0]?.textContent,
    '以後、同じ種類の確認が省かれ、自動で許可されます（' + DANGER + '）',
  );
  const yes = band.all().find((e) => e.dataset.action === 'persist-confirm');
  const no = band.all().find((e) => e.dataset.action === 'persist-cancel');
  assert.equal(yes?.textContent, '常に許可で答える');
  assert.equal(no?.textContent, 'やめる');
  assert.equal(yes?.type, 'button');
});

test('T-14：計画の承認は計画の本文を pre で描き、detail を描かない', () => {
  const p = part({ plan: { text: DANGER, filePath: 'plan.md' }, detail: DANGER, blockedPath: null });
  const { root } = renderCard(buildApprovalCard(p, { key: 'k', availability: { ok: true } }));
  assert.equal(byClass(root, 'approval-plan-text')[0]?.tagName, 'PRE');
  assert.equal(byClass(root, 'approval-plan-text')[0]?.textContent, DANGER);
  assert.equal(byClass(root, 'approval-detail').length, 0);
  assert.ok(root.textContent.includes('plan.md'));
});

test('T-14：答え済み・取り消しは details の閉じた形で、summary に題と結果、選択肢は押せない', () => {
  const answered = part({ state: 'answered', selectedOptionId: 'no' });
  const { root, openControl } = renderCard(buildApprovalCard(answered, { key: 'k', availability: { ok: true } }));
  assert.equal(openControl, null);
  assert.ok(root.className.includes('closed'));
  const details = root.children[0];
  assert.equal(details?.tagName, 'DETAILS');
  assert.equal(details?.open, false);
  const summary = details?.children[0];
  assert.equal(summary?.tagName, 'SUMMARY');
  assert.ok(summary?.textContent.includes('答え済み'));
  assert.ok(summary?.textContent.includes('拒否しました：拒否'));
  assert.ok(byClass(root, 'question-option').every((o) => o.disabled));
  assert.equal(byClass(root, 'approval-confirm').length, 0);
  const cancelled = renderCard(buildApprovalCard(part({ state: 'cancelled' }), { key: 'k' }), { open: true }).root;
  assert.equal(cancelled.children[0]?.open, true);
  assert.ok(cancelled.textContent.includes('取り消されました'));
});

test('T-14：端末の未回答は理由と「Orca で開く」の部品を持ち、選択肢のボタンを持たない', () => {
  const terminal = part({ source: 'terminal', prompt: null, title: null, options: [], answerable: false });
  const view = buildApprovalCard(terminal, {
    key: 'k',
    availability: readOnlyApprover.availability(terminal, null),
  });
  const { root, openControl } = renderCard(view);
  assert.ok(openControl, 'createOpenControl の部品');
  assert.ok(root.all().includes(openControl.root));
  assert.ok(openControl.root.className.includes('orca-open'));
  assert.equal(byClass(root, 'question-option').length, 0);
  assert.ok(root.textContent.includes('端末のエージェントの許可は、Orca で答えてください'));
  assert.equal(byClass(root, 'approval-title').length, 0, '題がなければ印だけ');
});

test('T-14：結果不明の帯は「確かめる」と「閉じる」を data-action で持つ', () => {
  const state = {
    ...initialApprovalState(),
    flow: { phase: 'unknown', result: { kind: 'unknown', operationId: 'op' } },
  };
  const { root } = renderCard(buildApprovalCard(part(), { key: 'k', state: state as Any, availability: { ok: true } }));
  assert.equal(root.all().find((e) => e.dataset.action === 'query')?.textContent, '確かめる');
  assert.equal(root.all().find((e) => e.dataset.action === 'dismiss')?.textContent, '閉じる');
});

test('T-14：renderChatRow は approval の行をカードに任せ、「詳しく」の開け閉めを <key>:detail で受ける', () => {
  const row = { kind: 'approval', key: 'm1:0', at: null, part: part() };
  const item: FakeElement = renderChatRow(fakeDocument, row, {
    approval: (r: Any) => buildApprovalCard(r.part, { key: r.key, availability: { ok: true } }),
    open: new Set(['m1:0:detail']),
  });
  assert.equal(item.tagName, 'LI');
  assert.ok(item.className.split(' ').includes('approval'));
  assert.equal(byClass(item, 'approval-card').length, 1);
  assert.equal(item.all().find((e) => e.dataset.part === 'detail')?.open, true);
  const fallback: FakeElement = renderChatRow(fakeDocument, row);
  assert.equal(byClass(fallback, 'approval-card').length, 1, '組み立てを渡さなくても読む形で描く');
});

// iss-00054 T-11：端末の承認のカードの partial の帯と blocked の理由は textContent だけで描き、「Orca で開く」を出す。
const keysPart = (over: Record<string, unknown> = {}): Any =>
  part({
    source: 'terminal',
    prompt: null,
    promptId: 'ta_0123456789abcdef0123',
    title: null,
    reason: null,
    blockedPath: null,
    detail: null,
    options: [
      { id: 'allow_once', label: 'Allow once', description: null, intent: 'allow_once' },
      { id: 'reject_once', label: 'Reject', description: null, intent: 'reject_once' },
    ],
    ...over,
  });
const stopped = (phase: string, result: Any) => ({ ...initialApprovalState(), flow: { phase, result } }) as Any;

test('iss-00054 T-11：partial の帯は role status の1行で、照会と閉じるを持たず、選択肢は押せず、「Orca で開く」を出す', () => {
  const view = buildApprovalCard(keysPart(), {
    key: 'k',
    state: stopped('partial', { kind: 'partial', operationId: 'op', note: DANGER }),
    availability: { ok: true },
  });
  const { root, openControl } = renderCard(view);
  const band = byClass(root, 'approval-band');
  assert.equal(band.length, 1);
  assert.equal(band[0]?.dataset.kind, 'partial');
  assert.equal(band[0]?.attrs.role, 'status');
  assert.equal(band[0]?.textContent, DANGER, 'HTML の文字は文字のまま');
  assert.ok(root.all().every(allowedTag));
  assert.equal(root.all().filter((e) => e.dataset.action === 'query' || e.dataset.action === 'dismiss').length, 0);
  const options = root.all().filter((e) => e.dataset.action === 'option');
  assert.equal(options.length, 2);
  assert.ok(options.every((o) => o.disabled));
  assert.ok(openControl, '「Orca で開く」');
  assert.ok(root.all().includes(openControl.root));
});

test('iss-00054 T-11：blocked の理由は帯の1行で、文字のまま描き、知らせと二重にせず、「Orca で開く」を出す', () => {
  const view = buildApprovalCard(keysPart(), {
    key: 'k',
    state: stopped('blocked', { kind: 'blocked', reason: DANGER }),
    availability: { ok: true },
  });
  const { root, openControl } = renderCard(view);
  const band = byClass(root, 'approval-band');
  assert.equal(band.length, 1);
  assert.equal(band[0]?.dataset.kind, 'blocked');
  assert.equal(
    countOf(root, DANGER),
    countOf(renderCard(buildApprovalCard(keysPart(), { key: 'k', availability: { ok: true } })).root, DANGER) + 1,
    '理由は1回だけ',
  );
  assert.ok(root.all().every(allowedTag));
  assert.ok(
    root
      .all()
      .filter((e) => e.dataset.action === 'option')
      .every((o) => o.disabled),
  );
  assert.ok(openControl);
});

test('iss-00054 T-11：押せる端末の承認のカードは2つの選択肢と「Orca で開く」を持つ', () => {
  const { root, openControl } = renderCard(
    buildApprovalCard(keysPart({ tool: 'Bash', description: 'ls' }), { key: 'k', availability: { ok: true } }),
  );
  const options = root.all().filter((e) => e.dataset.action === 'option');
  assert.deepEqual(
    options.map((o) => [o.dataset.option, o.disabled]),
    [
      ['allow_once', false],
      ['reject_once', false],
    ],
  );
  assert.ok(openControl);
  assert.equal(byClass(root, 'approval-band').length, 0);
});
