// markdown-dom.js の renderMarkdown（D-02）を、HTML を解く口と on・style の属性で失敗する偽の document で確かめる（T-04、T-05）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdownBody } from '../../web/embed/agent-dom.js';
import { parseMarkdown } from '../../web/embed/markdown.js';
import { renderMarkdown } from '../../web/embed/markdown-dom.js';

const ALLOWED_ATTRS = new Set(['start', 'type', 'aria-hidden', 'focusable', 'class', 'viewBox', 'd']);

class FakeText {
  readonly nodeType = 3;
  readonly tagName = '#text';
  readonly children: FakeNode[] = [];
  readonly data: string;
  constructor(data: string) {
    this.data = data;
  }
  get textContent(): string {
    return this.data;
  }
  all(): FakeNode[] {
    return [this];
  }
}

class FakeElement {
  readonly nodeType = 1;
  readonly tagName: string;
  readonly children: FakeNode[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attrs: Record<string, string> = {};
  className = '';
  title = '';
  href = '';
  rel = '';
  target = '';
  disabled = false;
  checked = false;
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
  set innerHTML(_v: string) {
    throw new Error('innerHTML must not be used');
  }
  set outerHTML(_v: string) {
    throw new Error('outerHTML must not be used');
  }
  set style(_v: string) {
    throw new Error('style must not be used');
  }
  insertAdjacentHTML(): void {
    throw new Error('insertAdjacentHTML must not be used');
  }
  setAttribute(name: string, value: string): void {
    const lower = name.toLowerCase();
    if (lower.startsWith('on')) throw new Error(`event attribute ${name} must not be set`);
    if (lower === 'style') throw new Error('style attribute must not be set');
    if (!ALLOWED_ATTRS.has(name)) throw new Error(`attribute ${name} is not allowed`);
    this.attrs[name] = String(value);
  }
  append(...nodes: FakeNode[]): void {
    this.children.push(...nodes);
  }
  all(): FakeNode[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}
type FakeNode = FakeElement | FakeText;

const strictDocument = {
  createElement: (tag: string) => new FakeElement(tag),
  createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
  createTextNode: (text: string) => new FakeText(text),
  write() {
    throw new Error('document.write must not be used');
  },
};
const { createTextNode: _omit, ...noTextNodeDocument } = strictDocument;

type Link = { text: string; href: string };
function linkSpy() {
  const calls: Link[] = [];
  const link = (doc: typeof strictDocument, text: string, href: string) => {
    calls.push({ text, href });
    const a = doc.createElement('a');
    a.textContent = text;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'newtab';
    return a;
  };
  return { calls, link };
}

const render = (markdown: string, doc = strictDocument) => {
  const spy = linkSpy();
  const root = renderMarkdown(doc, parseMarkdown(markdown), { link: spy.link }) as unknown as FakeElement;
  return { root, calls: spy.calls };
};
const elements = (root: FakeElement) => root.all().filter((n): n is FakeElement => n instanceof FakeElement);
const byTag = (root: FakeElement, tag: string) => elements(root).filter((n) => n.tagName === tag.toUpperCase());
const first = (root: FakeElement, tag: string) => {
  const hit = byTag(root, tag)[0];
  assert.ok(hit, `${tag} がある`);
  return hit;
};
const kids = (node: FakeElement) => node.children.filter((n): n is FakeElement => n instanceof FakeElement);

test('T-04：見出しは h1〜h6.md-h、段落は p、改行は br、強調は strong・em・del・code', () => {
  const { root } = render('# 一\n## 二\n### 三\n#### 四\n##### 五\n###### 六\n\n**太** *斜* ~~消~~ `x<y`\n次の行');
  assert.equal(root.tagName, 'DIV');
  for (let level = 1; level <= 6; level++) {
    const h = first(root, `h${level}`);
    assert.equal(h.className, 'md-h');
  }
  assert.equal(first(root, 'h3').textContent, '三');
  const p = first(root, 'p');
  assert.deepEqual(
    kids(p).map((n) => n.tagName),
    ['STRONG', 'EM', 'DEL', 'CODE', 'BR'],
  );
  assert.equal(first(root, 'strong').textContent, '太');
  assert.equal(first(root, 'em').textContent, '斜');
  assert.equal(first(root, 'del').textContent, '消');
  assert.equal(first(root, 'code').textContent, 'x<y');
  assert.equal(p.textContent, '太 斜 消 x<y次の行');
  assert.ok(
    p.children.some((n) => n instanceof FakeText),
    '文字は文字の節で描く',
  );
});

test('T-04：コードの塊は div.md-code > pre > code で、言語は md-code-lang と data-lang', () => {
  const { root } = render('```ts\nconst a = 1;\n  <b>\n```\n\n~~~\nplain\n~~~');
  const blocks = elements(root).filter((n) => n.className === 'md-code');
  assert.equal(blocks.length, 2);
  const [withLang, plain] = blocks as [FakeElement, FakeElement];
  assert.equal(withLang.dataset.lang, 'ts');
  const [label, pre] = kids(withLang) as [FakeElement, FakeElement];
  assert.equal(label.className, 'md-code-lang');
  assert.equal(label.textContent, 'ts');
  assert.equal(pre.tagName, 'PRE');
  assert.equal(kids(pre)[0]?.tagName, 'CODE');
  assert.equal(pre.textContent, 'const a = 1;\n  <b>');
  assert.equal(plain.dataset.lang, undefined);
  assert.deepEqual(
    kids(plain).map((n) => n.tagName),
    ['PRE'],
  );
});

test('T-04：箇条書きは ul・ol と start、チェックは li.md-task と押せない input', () => {
  const { root } = render('- a\n  - b\n\n3. c\n4. d\n\n区切り\n\n1. e\n\n- [ ] f\n- [x] g');
  const uls = byTag(root, 'ul');
  const ols = byTag(root, 'ol');
  assert.equal(uls.length, 3, '外の ul、入れ子の ul、チェックの ul');
  assert.equal(ols.length, 2);
  assert.equal(ols[0]?.attrs.start, '3');
  assert.equal(ols[1]?.attrs.start, undefined, '1 から始まる ol には start を付けない');
  const tasks = elements(root).filter((n) => n.tagName === 'LI' && n.className === 'md-task');
  assert.equal(tasks.length, 2);
  const boxes = tasks.map((li) => kids(li)[0]);
  for (const box of boxes) {
    assert.equal(box?.tagName, 'INPUT');
    assert.equal(box?.attrs.type, 'checkbox');
    assert.equal(box?.disabled, true);
  }
  assert.deepEqual(
    boxes.map((b) => b?.checked),
    [false, true],
  );
  assert.equal(tasks[1]?.textContent, 'g');
  const plainItems = elements(root).filter((n) => n.tagName === 'LI' && n.className === '');
  assert.ok(plainItems.length >= 5);
});

test('T-04：引用は blockquote、表は div.md-table > table と寄せのクラス、横線は hr', () => {
  const { root } = render('> 引用\n> - 中\n\n| 左 | 中 | 右 | 無 |\n|:--|:-:|--:|---|\n| 1 | **2** | 3 | 4 |\n\n---');
  const quote = first(root, 'blockquote');
  assert.ok(byTag(quote, 'ul').length === 1, '引用の中の箇条書き');
  const wrap = elements(root).find((n) => n.className === 'md-table');
  assert.ok(wrap);
  assert.equal(wrap.tagName, 'DIV');
  const table = kids(wrap)[0];
  assert.equal(table?.tagName, 'TABLE');
  assert.deepEqual(
    kids(table as FakeElement).map((n) => n.tagName),
    ['THEAD', 'TBODY'],
  );
  assert.deepEqual(
    byTag(root, 'th').map((n) => n.className),
    ['md-left', 'md-center', 'md-right', ''],
  );
  assert.deepEqual(
    byTag(root, 'td').map((n) => n.className),
    ['md-left', 'md-center', 'md-right', ''],
  );
  assert.equal(byTag(root, 'td')[1]?.children[0] instanceof FakeElement, true, 'セルの中の行内の構文');
  assert.equal(byTag(root, 'hr').length, 1);
});

test('T-04：リンクは渡した link の口だけで作り、画像は「画像：」の付いたリンク', () => {
  const { root, calls } = render(
    '[**太い**名](https://a.example/x) <https://b.example> https://c.example/p. ![図](https://d.example/i.png)',
  );
  assert.deepEqual(calls, [
    { text: '太い名', href: 'https://a.example/x' },
    { text: 'https://b.example', href: 'https://b.example/' },
    { text: 'https://c.example/p', href: 'https://c.example/p' },
    { text: '画像：図', href: 'https://d.example/i.png' },
  ]);
  for (const a of byTag(root, 'a')) {
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer');
  }
});

test('T-04：createTextNode のない document では文字を span の textContent で描く', () => {
  const { root } = render('a **b** c', noTextNodeDocument as typeof strictDocument);
  assert.equal(root.textContent, 'a b c');
  assert.ok(byTag(root, 'span').length >= 2);
});

test('T-04：知らない type の塊と行内の文字を落とさず文字で描く', () => {
  const spy = linkSpy();
  const root = renderMarkdown(
    strictDocument,
    [
      { type: 'footnote', text: '脚注の文字' },
      {
        type: 'paragraph',
        children: [
          { type: 'math', text: 'x^2' },
          { type: 'mystery', children: [{ type: 'text', text: '中' }] },
        ],
      },
      { type: 'weird', children: [{ type: 'text', text: '子の文字' }] },
    ],
    { link: spy.link },
  ) as unknown as FakeElement;
  for (const word of ['脚注の文字', 'x^2', '中', '子の文字']) assert.ok(root.textContent.includes(word), word);
});

// R-02 の acceptance の XSS の表。[Markdown, 本文に残る元の文字]
const XSS: [string, string][] = [
  ['<script>alert(1)</script>', '<script>alert(1)</script>'],
  ['<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>'],
  ['<a href=javascript:alert(1)>x</a>', '<a href=javascript:alert(1)>x</a>'],
  ['<iframe src="https://e.example"></iframe>', '<iframe src="https://e.example"></iframe>'],
  ['<style>body{}</style>', '<style>body{}</style>'],
  ['[x](javascript:alert(1))', '[x](javascript:alert(1))'],
  ['[x](JaVaScRiPt:alert(1))', '[x](JaVaScRiPt:alert(1))'],
  ['[x]( javascript:alert(1))', 'javascript:alert(1)'],
  ['[x](java\u0000script:alert(1))', 'script:alert(1)'],
  ['[x](data:text/html,<script>alert(1)</script>)', 'data:text/html,<script>alert(1)</script>'],
  ['[x](vbscript:msgbox(1))', '[x](vbscript:msgbox(1))'],
  ['[x](file:///etc/passwd)', 'file:///etc/passwd'],
  ['![x](javascript:alert(1))', 'javascript:alert(1)'],
  ['<javascript:alert(1)>', '<javascript:alert(1)>'],
  ['[x](https://a" onmouseover="x)', 'onmouseover'],
  ['[x](https://a) onerror=alert(1)', 'onerror=alert(1)'],
  ['```js" onload="x\ncode\n```', 'code'],
  ['<', '<'],
];

const docs = [
  ['renderMarkdown', (md: string) => render(md).root],
  ['renderMarkdownBody', (md: string) => renderMarkdownBody(strictDocument, md) as unknown as FakeElement],
] as const;

for (const [name, draw] of docs) {
  test(`T-05：${name} は XSS の表で script・img・iframe・style を作らず、href は http・https だけ、元の文字が残る`, () => {
    for (const [markdown, kept] of XSS) {
      const root = draw(markdown);
      const tags = new Set(elements(root).map((n) => n.tagName));
      for (const bad of ['SCRIPT', 'IMG', 'IFRAME', 'STYLE', 'OBJECT', 'EMBED'])
        assert.ok(!tags.has(bad), `${markdown}：${bad}`);
      for (const a of byTag(root, 'a')) assert.match(a.href, /^https?:\/\//, markdown);
      for (const node of elements(root))
        for (const attr of Object.keys(node.attrs)) assert.ok(ALLOWED_ATTRS.has(attr), `${markdown}：${attr}`);
      assert.ok(root.textContent.includes(kept), `${markdown} の元の文字 ${kept} が残る：${root.textContent}`);
    }
  });
}

test('T-05：コードの塊の言語の引用符は data-lang の文字に入るだけで属性にならない', () => {
  const { root } = render('```js" onload="x\ncode\n```');
  const block = elements(root).find((n) => n.className === 'md-code');
  assert.equal(block?.dataset.lang, 'js"');
  assert.deepEqual(Object.keys(block?.attrs ?? {}), []);
});

test('T-05：描く側でも safeHref を通し、通らない href の link の木は文字で描く', () => {
  const spy = linkSpy();
  const blocks = ['javascript:alert(1)', 'data:text/html,x', ' https://a.example', '/relative', '', 42].map((href) => ({
    type: 'paragraph',
    children: [{ type: 'link', href, children: [{ type: 'text', text: `文字${String(href)}` }] }],
  }));
  const root = renderMarkdown(strictDocument, blocks, { link: spy.link }) as unknown as FakeElement;
  assert.deepEqual(spy.calls, []);
  assert.equal(byTag(root, 'a').length, 0);
  assert.ok(root.textContent.includes('文字javascript:alert(1)'));
  assert.ok(root.textContent.includes('文字/relative'));
});
