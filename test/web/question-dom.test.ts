// 質問のカードの DOM（web/embed/question-dom.js）を、小さな偽の document で確かめる（T-14、R-02、F-04）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderChatRow } from '../../web/embed/agent-dom.js';
import { renderQuestionCard } from '../../web/embed/question-dom.js';
import {
  buildQuestionCard,
  initialFlow,
  initialSelection,
  terminalAnswerer,
  toggleOption,
  toggleOther,
} from '../../web/embed/question-view.js';

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
  'TEXTAREA',
  'DETAILS',
  'SUMMARY',
  'UL',
  'LI',
  'LABEL',
  'svg',
  'path',
  'circle',
  'rect',
  'g',
]);
const allowedTag = (el: FakeElement) => ALLOWED.has(el.tagName) || ALLOWED.has(el.tagName.toLowerCase());

const part = (over: Record<string, unknown> = {}): Any => ({
  type: 'question',
  source: 'chat',
  prompt: { itemId: 'i1', revision: 1 },
  callId: null,
  questions: [
    {
      id: 'q1',
      header: DANGER,
      question: DANGER,
      multiSelect: false,
      options: [
        { id: 'a', label: DANGER, description: DANGER },
        { id: 'b', label: 'B', description: null },
      ],
      allowOther: true,
      otherAllowsEmpty: false,
    },
    {
      id: 'q2',
      header: null,
      question: '二つ目',
      multiSelect: true,
      options: [{ id: 'x', label: 'X', description: null }],
      allowOther: false,
      otherAllowsEmpty: false,
    },
  ],
  state: 'pending',
  answers: null,
  ...over,
});

const renderCard = (view: Any, options?: Any) =>
  renderQuestionCard(fakeDocument, view, options) as { root: FakeElement; openControl: Any };

const byClass = (root: FakeElement, name: string) => root.all().filter((e) => e.className.split(' ').includes(name));

test('T-14：問い・見出し・ラベル・説明・理由に紛れた HTML は文字のまま描かれ、決めた種類の要素だけを作る', () => {
  const p = part();
  let selection = toggleOption(initialSelection(p), p, 0, 'a');
  selection = toggleOther(selection, p, 0);
  const view = buildQuestionCard(p, {
    key: 'm1:0',
    selection,
    flow: initialFlow(),
    availability: { ok: false, reason: DANGER },
  });
  const { root } = renderCard(view);
  assert.equal(root.tagName, 'SECTION');
  assert.ok(root.className.split(' ').includes('question-card'));
  assert.equal(root.dataset.key, 'm1:0');
  for (const el of root.all()) assert.ok(allowedTag(el), `作らない要素：${el.tagName}`);
  assert.ok(root.textContent.includes(DANGER));
  assert.equal(root.all().filter((e) => e.tagName === 'SCRIPT' || e.tagName === 'IMG').length, 0);
  assert.equal(byClass(root, 'question-reason')[0]?.textContent, DANGER);
});

test('T-14：選択肢は aria-pressed と data 属性のボタンで、その他は欄、送るボタンは data-action submit', () => {
  const p = part();
  let selection = toggleOption(initialSelection(p), p, 0, 'b');
  selection = toggleOption(selection, p, 1, 'x');
  const view = buildQuestionCard(p, { key: 'k', selection, flow: initialFlow(), availability: { ok: true } });
  const { root, openControl } = renderCard(view);
  assert.equal(openControl, null);
  const options = byClass(root, 'question-option').filter((e) => e.dataset.action === 'option');
  assert.equal(options.length, 3);
  const b = options.find((o) => o.dataset.option === 'b' && o.dataset.question === '0');
  assert.ok(b);
  assert.equal(b.tagName, 'BUTTON');
  assert.equal(b.type, 'button');
  assert.equal(b.attrs['aria-pressed'], 'true');
  assert.equal(b.disabled, false);
  const a = options.find((o) => o.dataset.option === 'a');
  assert.equal(a?.attrs['aria-pressed'], 'false');
  const other = byClass(root, 'question-option').find((e) => e.dataset.action === 'other');
  assert.equal(other?.dataset.question, '0');
  assert.equal(other?.attrs['aria-pressed'], 'false');
  assert.equal(byClass(root, 'question-other-text').length, 0, '選んでいないその他は欄を出さない');
  assert.ok(root.textContent.includes('複数選べます'));
  const submit = root.all().find((e) => e.dataset.action === 'submit');
  assert.equal(submit?.tagName, 'BUTTON');
  assert.equal(submit?.textContent, '答える');
  assert.equal(submit?.disabled, false);

  const withOther = buildQuestionCard(p, {
    key: 'k',
    selection: toggleOther(selection, p, 0),
    flow: initialFlow(),
    availability: { ok: true },
  });
  const field = byClass(renderCard(withOther).root, 'question-other-text')[0];
  assert.equal(field?.tagName, 'TEXTAREA');
  assert.equal(field?.dataset.question, '0');
  assert.equal(field?.dataset.action, 'other-text');
});

test('T-14：答え済みは details の閉じた形で、summary に答え、中の選択肢は押せない。open で開いたまま描く', () => {
  const answered = part({ state: 'answered', answers: [{ questionId: 'q1', optionIds: ['b'], other: null }] });
  const view = buildQuestionCard(answered, { key: 'k', availability: { ok: true } });
  const { root } = renderCard(view, { open: true });
  const details = root.all().find((e) => e.tagName === 'DETAILS');
  assert.ok(details);
  assert.equal(details.open, true);
  const summary = details.children[0];
  assert.equal(summary?.tagName, 'SUMMARY');
  assert.ok(summary?.textContent.includes('B'));
  assert.ok(summary?.textContent.includes('答え済み'));
  for (const b of root.all().filter((e) => e.tagName === 'BUTTON')) assert.equal(b.disabled, true);
  assert.equal(
    root.all().find((e) => e.dataset.action === 'submit'),
    undefined,
  );
  assert.equal(
    renderCard(view)
      .root.all()
      .find((e) => e.tagName === 'DETAILS')?.open,
    false,
  );
});

test('T-14：端末の未回答は理由と「Orca で開く」の部品を持ち、送るボタンを持たない', () => {
  const terminal = part({ source: 'terminal', prompt: null, callId: 'c' });
  const view = buildQuestionCard(terminal, {
    key: 'k',
    selection: initialSelection(terminal),
    flow: initialFlow(),
    availability: terminalAnswerer.availability(terminal, null),
  });
  const { root, openControl } = renderCard(view);
  assert.ok(openControl, 'createOpenControl の部品');
  assert.ok(root.all().includes(openControl.root));
  assert.ok(openControl.root.className.includes('orca-open'));
  assert.equal(
    root.all().find((e) => e.dataset.action === 'submit'),
    undefined,
  );
  assert.ok(root.textContent.includes('端末のエージェントの質問は、いまは Orca で答えてください'));
});

test('T-14：結果不明の帯は「確かめる」と「閉じる」を data-action で持ち、照会の間は押せない', () => {
  const p = part();
  const card = (phase: string) =>
    renderCard(
      buildQuestionCard(p, {
        key: 'k',
        selection: initialSelection(p),
        flow: { phase, result: { kind: 'unknown', operationId: 'op' } } as Any,
        availability: { ok: true },
      }),
    ).root;
  const band = card('unknown');
  const query = band.all().find((e) => e.dataset.action === 'query');
  const dismiss = band.all().find((e) => e.dataset.action === 'dismiss');
  assert.equal(query?.textContent, '確かめる');
  assert.equal(dismiss?.textContent, '閉じる');
  assert.equal(query?.disabled, false);
  const checking = card('checking');
  assert.equal(checking.all().find((e) => e.dataset.action === 'query')?.disabled, true);
});

test('T-14：renderChatRow は question の行をカードに任せ、時刻を付ける', () => {
  const row = { kind: 'question', key: 'm1:0', at: null, part: part(), answerText: null };
  const item: FakeElement = renderChatRow(fakeDocument, row, {
    question: (r: Any) => buildQuestionCard(r.part, { key: r.key, availability: { ok: true } }),
  });
  assert.equal(item.tagName, 'LI');
  assert.equal(item.dataset.key, 'm1:0');
  assert.ok(item.className.includes('question'));
  assert.ok(byClass(item as Any, 'question-card').length === 1);
  const fallback: FakeElement = renderChatRow(fakeDocument, row);
  assert.ok(byClass(fallback as Any, 'question-card').length === 1, '組み立てを渡さなくても読む形で描く');
});

// ---- iss-00049 T-16：途中まで送った帯、二度と送らない拒み、答えずに閉じた形、注と送れない理由 ----

const keysPart = (over: Record<string, unknown> = {}): Any =>
  part({ source: 'terminal', answerVia: 'keys', prompt: null, callId: 'c', ...over });

test('iss-00049 T-16：partial の帯は文字のまま描き、「Orca で開く」を持ち、送るボタンも照会のボタンも持たない', () => {
  const view = buildQuestionCard(keysPart(), {
    key: 'k',
    flow: { phase: 'partial', result: { kind: 'partial', operationId: 'op', note: DANGER } } as Any,
    availability: { ok: true },
  });
  const { root, openControl } = renderCard(view);
  for (const el of root.all()) assert.ok(allowedTag(el), `作らない要素：${el.tagName}`);
  const band = byClass(root, 'question-partial')[0];
  assert.ok(band, '途中まで送った帯');
  assert.equal(band.textContent, DANGER);
  assert.ok(openControl);
  assert.ok(root.all().includes(openControl.root));
  for (const action of ['submit', 'query', 'dismiss'])
    assert.equal(
      root.all().find((e) => e.dataset.action === action),
      undefined,
      action,
    );
});

test('iss-00049 T-16：blocked は理由と「Orca で開く」を出し、送るボタンを出さない', () => {
  const view = buildQuestionCard(keysPart(), {
    key: 'k',
    flow: { phase: 'blocked', result: { kind: 'blocked', reason: DANGER } } as Any,
    availability: { ok: true },
  });
  const { root, openControl } = renderCard(view);
  assert.ok(openControl);
  assert.equal(byClass(root, 'question-notice')[0]?.textContent, DANGER);
  assert.equal(
    root.all().find((e) => e.dataset.action === 'submit'),
    undefined,
  );
});

test('iss-00049 T-16：declined は閉じた形で、印は「答えずに閉じた」、要約は結果の文を文字のまま描く', () => {
  const view = buildQuestionCard(keysPart({ state: 'declined' }), {
    key: 'k',
    answerText: DANGER,
    availability: { ok: true },
  });
  assert.equal(view.title, '答えずに閉じられた質問');
  const { root, openControl } = renderCard(view);
  assert.equal(openControl, null);
  assert.ok(root.className.split(' ').includes('closed'));
  assert.equal(root.dataset.state, 'declined');
  assert.equal(root.attrs['aria-label'], '答えずに閉じられた質問');
  for (const el of root.all()) assert.ok(allowedTag(el), `作らない要素：${el.tagName}`);
  assert.equal(byClass(root, 'question-badge')[0]?.textContent, '答えずに閉じた');
  assert.equal(byClass(root, 'question-answers')[0]?.textContent, DANGER);
  for (const b of root.all().filter((e) => e.tagName === 'BUTTON')) assert.equal(b.disabled, true);
});

test('iss-00049 T-16：keys の未回答は送るボタンの近くに注を、送れないその他の文には理由を出す', () => {
  const p = keysPart();
  const selection = toggleOther(initialSelection(p), p, 0);
  selection[0] = { optionIds: [], other: 'a\tb' };
  const view = buildQuestionCard(p, { key: 'k', selection, flow: initialFlow(), availability: { ok: true } });
  const { root } = renderCard(view);
  const foot = byClass(root, 'question-foot')[0];
  assert.ok(foot);
  assert.equal(
    byClass(foot, 'question-keys-note')[0]?.textContent,
    'Orca の画面で途中まで答えた質問は、Orca で続けてください',
  );
  assert.equal(byClass(root, 'question-hint')[0]?.textContent, 'その他の文は1行で、制御文字を含めないでください');
  assert.equal(root.all().find((e) => e.dataset.action === 'submit')?.disabled, true);
  const chat = renderCard(buildQuestionCard(part(), { key: 'k', availability: { ok: true } })).root;
  assert.equal(byClass(chat, 'question-keys-note').length, 0);
  assert.equal(byClass(chat, 'question-hint').length, 0);
});
