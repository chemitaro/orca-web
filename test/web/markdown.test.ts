import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMarkdown, safeHref } from '../../web/embed/markdown.js';

const t = (text: string) => ({ type: 'text', text });
const p = (...children: unknown[]) => ({ type: 'paragraph', children });

test('T-01 見出し：ATX の 1〜6、閉じの # を落とし、C# は残し、7個は段落', () => {
  assert.deepEqual(parseMarkdown('# 題'), [{ type: 'heading', level: 1, children: [t('題')] }]);
  assert.deepEqual(parseMarkdown('   ###### 六'), [{ type: 'heading', level: 6, children: [t('六')] }]);
  assert.deepEqual(parseMarkdown('## 題 ##  '), [{ type: 'heading', level: 2, children: [t('題')] }]);
  assert.deepEqual(parseMarkdown('## C#'), [{ type: 'heading', level: 2, children: [t('C#')] }]);
  assert.deepEqual(parseMarkdown('### ###'), [{ type: 'heading', level: 3, children: [] }]);
  assert.deepEqual(parseMarkdown('#'), [{ type: 'heading', level: 1, children: [] }]);
  assert.deepEqual(parseMarkdown('####### 七'), [p(t('####### 七'))]);
  assert.deepEqual(parseMarkdown('#題'), [p(t('#題'))]);
  assert.deepEqual(parseMarkdown('    # 字下げ4'), [p(t('# 字下げ4'))]);
});

test('T-01 段落と改行：1つの改行、行末の2つの空白、\\ の改行は break、空行で段落が分かれる', () => {
  assert.deepEqual(parseMarkdown('一行目\n二行目'), [p(t('一行目'), { type: 'break' }, t('二行目'))]);
  assert.deepEqual(parseMarkdown('a  \nb'), [p(t('a'), { type: 'break' }, t('b'))]);
  assert.deepEqual(parseMarkdown('a\\\nb'), [p(t('a'), { type: 'break' }, t('b'))]);
  assert.deepEqual(parseMarkdown('a\r\n\r\nb\rc'), [p(t('a')), p(t('b'), { type: 'break' }, t('c'))]);
  assert.deepEqual(parseMarkdown('  頭の空白  '), [p(t('頭の空白'))]);
});

test('T-01 強調：太字・斜体・取り消し線・行内のコード、語の中の _ は文字', () => {
  assert.deepEqual(parseMarkdown('**太** と __太__'), [
    p({ type: 'strong', children: [t('太')] }, t(' と '), { type: 'strong', children: [t('太')] }),
  ]);
  assert.deepEqual(parseMarkdown('*斜* _foo_ (_a_)'), [
    p(
      { type: 'em', children: [t('斜')] },
      t(' '),
      { type: 'em', children: [t('foo')] },
      t(' ('),
      { type: 'em', children: [t('a')] },
      t(')'),
    ),
  ]);
  assert.deepEqual(parseMarkdown('snake_case_name と a__b__c'), [p(t('snake_case_name と a__b__c'))]);
  assert.deepEqual(parseMarkdown('~~消~~'), [p({ type: 'del', children: [t('消')] })]);
  assert.deepEqual(parseMarkdown('~一つ~'), [p(t('~一つ~'))]);
  assert.deepEqual(parseMarkdown('**a *b* c**'), [
    p({ type: 'strong', children: [t('a '), { type: 'em', children: [t('b')] }, t(' c')] }),
  ]);
  assert.deepEqual(parseMarkdown('***両方***'), [
    p({ type: 'em', children: [{ type: 'strong', children: [t('両方')] }] }),
  ]);
  assert.deepEqual(parseMarkdown('** 空白 ** と 2 * 3'), [p(t('** 空白 ** と 2 * 3'))]);
  assert.deepEqual(parseMarkdown('`code` と ``a ` b`` と ` x `'), [
    p({ type: 'code', text: 'code' }, t(' と '), { type: 'code', text: 'a ` b' }, t(' と '), {
      type: 'code',
      text: 'x',
    }),
  ]);
  assert.deepEqual(parseMarkdown('`**太くない**` と `\\*`'), [
    p({ type: 'code', text: '**太くない**' }, t(' と '), { type: 'code', text: '\\*' }),
  ]);
  assert.deepEqual(parseMarkdown('**`a**`'), [p(t('**'), { type: 'code', text: 'a**' })]);
});

test('T-01 行内のコード：中身の \\ は逃がしにせず、閉じの ` の前の \\ もコードの文字', () => {
  assert.deepEqual(parseMarkdown('`a\\`'), [p({ type: 'code', text: 'a\\' })]);
  assert.deepEqual(parseMarkdown('区切りは `\\` と `/`'), [
    p(t('区切りは '), { type: 'code', text: '\\' }, t(' と '), { type: 'code', text: '/' }),
  ]);
  // 逃がした ` は開きにならない。逃がしの後に続く ` の並びは、残りの数で開く。
  assert.deepEqual(parseMarkdown('\\`a\\` と `b`'), [p(t('`a` と '), { type: 'code', text: 'b' })]);
  assert.deepEqual(parseMarkdown('\\``b`'), [p(t('`'), { type: 'code', text: 'b' })]);
});

test('T-01 柵のコード：``` と ~~~、言語、閉じのない塊、字下げを落とす', () => {
  assert.deepEqual(parseMarkdown('```ts extra\nconst a = 1;\n  b\n```\n後'), [
    { type: 'code', lang: 'ts', text: 'const a = 1;\n  b' },
    p(t('後')),
  ]);
  assert.deepEqual(parseMarkdown('~~~~\n~~~\n```\n~~~~'), [{ type: 'code', lang: null, text: '~~~\n```' }]);
  assert.deepEqual(parseMarkdown('```\n閉じない\n\n# 見出しでない'), [
    { type: 'code', lang: null, text: '閉じない\n\n# 見出しでない' },
  ]);
  assert.deepEqual(parseMarkdown('  ```\n  a\n b\nc\n  ```'), [{ type: 'code', lang: null, text: 'a\nb\nc' }]);
  assert.deepEqual(parseMarkdown('```\n```'), [{ type: 'code', lang: null, text: '' }]);
  assert.equal(parseMarkdown(`\`\`\`${'x'.repeat(80)}\n\`\`\``)[0].lang, 'x'.repeat(60));
  assert.deepEqual(parseMarkdown('```ls```'), [p({ type: 'code', text: 'ls' })]);
});

const item = (checked: boolean | null, ...children: unknown[]) => ({ checked, children });
const ul = (...items: unknown[]) => ({ type: 'list', ordered: false, start: null, items });

test('T-01 箇条書き：- * +、番号と start、入れ子、チェック、印が変わると別の list', () => {
  assert.deepEqual(parseMarkdown('- a\n- b'), [ul(item(null, p(t('a'))), item(null, p(t('b'))))]);
  assert.deepEqual(parseMarkdown('* a\n+ b'), [ul(item(null, p(t('a')))), ul(item(null, p(t('b'))))]);
  assert.deepEqual(parseMarkdown('3. c\n4. d'), [
    { type: 'list', ordered: true, start: 3, items: [item(null, p(t('c'))), item(null, p(t('d')))] },
  ]);
  assert.deepEqual(parseMarkdown('1) a\n- b'), [
    { type: 'list', ordered: true, start: 1, items: [item(null, p(t('a')))] },
    ul(item(null, p(t('b')))),
  ]);
  assert.deepEqual(parseMarkdown('- a\n  - b\n    - c\n- d'), [
    ul(item(null, p(t('a')), ul(item(null, p(t('b')), ul(item(null, p(t('c'))))))), item(null, p(t('d')))),
  ]);
  assert.deepEqual(parseMarkdown('1. **一**\n   続き\n\n   次の段落\n2. 二'), [
    {
      type: 'list',
      ordered: true,
      start: 1,
      items: [
        item(null, p({ type: 'strong', children: [t('一')] }, { type: 'break' }, t('続き')), p(t('次の段落'))),
        item(null, p(t('二'))),
      ],
    },
  ]);
  assert.deepEqual(parseMarkdown('- [ ] 未\n- [x] 済\n- [X] 済\n- [y] 違う'), [
    ul(item(false, p(t('未'))), item(true, p(t('済'))), item(true, p(t('済'))), item(null, p(t('[y] 違う')))),
  ]);
  assert.deepEqual(parseMarkdown('- a\n\n- b'), [ul(item(null, p(t('a'))), item(null, p(t('b'))))]);
  assert.deepEqual(parseMarkdown('- ```\n  x\n  ```'), [ul(item(null, { type: 'code', lang: null, text: 'x' }))]);
  assert.deepEqual(parseMarkdown('段落\n- 項目'), [p(t('段落')), ul(item(null, p(t('項目'))))]);
  assert.deepEqual(parseMarkdown('-a'), [p(t('-a'))]);
  assert.deepEqual(parseMarkdown('1234567890. 十桁'), [p(t('1234567890. 十桁'))]);
});

test('T-01 引用：入れ子、引用の中の箇条書きとコード、lazy の続き', () => {
  assert.deepEqual(parseMarkdown('> a\n> b'), [{ type: 'quote', children: [p(t('a'), { type: 'break' }, t('b'))] }]);
  assert.deepEqual(parseMarkdown('> a\n>> b'), [
    { type: 'quote', children: [p(t('a')), { type: 'quote', children: [p(t('b'))] }] },
  ]);
  assert.deepEqual(parseMarkdown('> - x\n> ```js\n> y\n> ```'), [
    { type: 'quote', children: [ul(item(null, p(t('x')))), { type: 'code', lang: 'js', text: 'y' }] },
  ]);
  assert.deepEqual(parseMarkdown('> a\n続き\n\n外'), [
    { type: 'quote', children: [p(t('a'), { type: 'break' }, t('続き'))] },
    p(t('外')),
  ]);
  assert.deepEqual(parseMarkdown('> # 題\n外'), [
    { type: 'quote', children: [{ type: 'heading', level: 1, children: [t('題')] }] },
    p(t('外')),
  ]);
  assert.deepEqual(parseMarkdown('>\n'), [{ type: 'quote', children: [] }]);
});

test('T-01 表：寄せ、\\|、セルの数を見出しに合わせる、区切りの数が違えば段落', () => {
  assert.deepEqual(
    parseMarkdown('| a | b | c | d |\n|---|:---|:---:|---:|\n| 1 | **2** | x \\| y |\n| 1 | 2 | 3 | 4 | 5 |\n後'),
    [
      {
        type: 'table',
        align: [null, 'left', 'center', 'right'],
        head: [[t('a')], [t('b')], [t('c')], [t('d')]],
        rows: [
          [[t('1')], [{ type: 'strong', children: [t('2')] }], [t('x | y')], []],
          [[t('1')], [t('2')], [t('3')], [t('4')]],
        ],
      },
      p(t('後')),
    ],
  );
  assert.deepEqual(parseMarkdown('a | b\n--|--\nc | d'), [
    { type: 'table', align: [null, null], head: [[t('a')], [t('b')]], rows: [[[t('c')], [t('d')]]] },
  ]);
  assert.deepEqual(parseMarkdown('| a | b |\n|---|\n| c |'), [
    p(t('| a | b |'), { type: 'break' }, t('|---|'), { type: 'break' }, t('| c |')),
  ]);
  assert.deepEqual(parseMarkdown('前の段落\n| a |\n| - |\n| b |')[1], {
    type: 'table',
    align: [null],
    head: [[t('a')]],
    rows: [[[t('b')]]],
  });
});

test('T-01 横線：--- *** ___ と空白入り、段落の直後の --- も横線', () => {
  for (const line of ['---', '***', '___', ' - - -', '*  *  *', '_____']) {
    assert.deepEqual(parseMarkdown(line), [{ type: 'hr' }], line);
  }
  assert.deepEqual(parseMarkdown('段落\n---'), [p(t('段落')), { type: 'hr' }]);
  assert.deepEqual(parseMarkdown('--'), [p(t('--'))]);
  assert.deepEqual(parseMarkdown('- - x'), [ul(item(null, ul(item(null, p(t('x'))))))]);
});

const a = (href: string, ...children: unknown[]) => ({ type: 'link', href, children });

test('T-01 リンク：[a](url)、題つき、<url>、素の URL の尾の記号と釣り合わない )、画像は image 真', () => {
  assert.deepEqual(parseMarkdown('[文字](https://example.com/a)'), [p(a('https://example.com/a', t('文字')))]);
  assert.deepEqual(parseMarkdown('[**太**](https://e.com "題")'), [
    p(a('https://e.com/', { type: 'strong', children: [t('太')] })),
  ]);
  assert.deepEqual(parseMarkdown('[a](<https://e.com/a b>)'), [p(t('[a](<https://e.com/a b>)'))]);
  assert.deepEqual(parseMarkdown('[a](https://e.com/(x)) b'), [p(a('https://e.com/(x)', t('a')), t(' b'))]);
  assert.deepEqual(parseMarkdown('<https://e.com/x>'), [p(a('https://e.com/x', t('https://e.com/x')))]);
  assert.deepEqual(parseMarkdown('見て https://e.com/a.b, と (https://e.com/w_(x)) と https://e.com/q?a=1.'), [
    p(
      t('見て '),
      a('https://e.com/a.b', t('https://e.com/a.b')),
      t(', と ('),
      a('https://e.com/w_(x)', t('https://e.com/w_(x)')),
      t(') と '),
      a('https://e.com/q?a=1', t('https://e.com/q?a=1')),
      t('.'),
    ),
  ]);
  assert.deepEqual(parseMarkdown('**https://e.com**'), [
    p({ type: 'strong', children: [a('https://e.com/', t('https://e.com'))] }),
  ]);
  assert.deepEqual(parseMarkdown('xhttps://e.com と https://'), [p(t('xhttps://e.com と https://'))]);
  assert.deepEqual(parseMarkdown('![図](https://e.com/i.png) ![](https://e.com/j.png)'), [
    p({ type: 'link', href: 'https://e.com/i.png', children: [t('図')], image: true }, t(' '), {
      type: 'link',
      href: 'https://e.com/j.png',
      children: [t('https://e.com/j.png')],
      image: true,
    }),
  ]);
  assert.deepEqual(parseMarkdown('[a [b] c](https://e.com)'), [p(a('https://e.com/', t('a [b] c')))]);
  assert.deepEqual(
    parseMarkdown('[参照][1]\n\n[1]: https://e.com'),
    // 参照式のリンクは範囲外なので文字のまま（F-03）。定義の行の URL は素の URL として結ぶ。
    [p(t('[参照][1]')), p(t('[1]: '), a('https://e.com/', t('https://e.com')))],
  );
});

test('T-01 逃がし：ASCII の記号の前の \\ は記号だけを残し、ほかの \\ は残す', () => {
  assert.deepEqual(parseMarkdown('\\*a\\* \\# \\[x\\](y) \\あ \\\\'), [p(t('*a* # [x](y) \\あ \\'))]);
  assert.deepEqual(parseMarkdown('\\# 見出しでない'), [p(t('# 見出しでない'))]);
  assert.deepEqual(parseMarkdown('&amp; と <b>太</b>'), [p(t('&amp; と <b>太</b>'))]);
});

test('T-02 safeHref：http・https だけを正規化して返し、ほかは null', () => {
  assert.equal(safeHref('https://example.com'), 'https://example.com/');
  assert.equal(safeHref('http://e.com/a?b=1#c'), 'http://e.com/a?b=1#c');
  assert.equal(safeHref('HTTPS://E.COM/x'), 'https://e.com/x');
  for (const raw of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    ' https://e.com',
    'https://e.com ',
    'java\u0000script:alert(1)',
    'https://e.com/\u0000',
    'https://e.com/\u007f',
    'https://e.com/　',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '/relative/path',
    'relative',
    '//e.com/x',
    '',
    'https://',
    'javascript&colon;alert(1)',
    'https://a" onmouseover="x',
  ]) {
    assert.equal(safeHref(raw), null, JSON.stringify(raw));
  }
  for (const raw of [undefined, null, 1, {}]) assert.equal(safeHref(raw), null);
});

/** 木の中の文字（text と code の文字）を集める。 */
function collect(nodes: unknown): string {
  if (Array.isArray(nodes)) return nodes.map(collect).join('');
  if (!nodes || typeof nodes !== 'object') return '';
  const n = nodes as Record<string, unknown>;
  let out = typeof n.text === 'string' ? n.text : '';
  for (const key of ['children', 'items', 'head', 'rows']) if (key in n) out += collect(n[key]);
  return out;
}

/** 木の中のリンクの href を集める。 */
function hrefs(nodes: unknown): string[] {
  if (Array.isArray(nodes)) return nodes.flatMap(hrefs);
  if (!nodes || typeof nodes !== 'object') return [];
  const n = nodes as Record<string, unknown>;
  const own = n.type === 'link' ? [String(n.href)] : [];
  return [...own, ...['children', 'items', 'head', 'rows'].flatMap((key) => (key in n ? hrefs(n[key]) : []))];
}

test('T-02 危ない URL のリンクと、属性の差し込みは、リンクにならず元の文字の text になる', () => {
  for (const src of [
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x]( javascript:alert(1))',
    '[x](java\u0000script:alert(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '[x](vbscript:msgbox(1))',
    '[x](file:///etc/passwd)',
    '[x](/relative)',
    '[x]()',
    '![x](javascript:alert(1))',
    '[x](https://a" onmouseover="x)',
    '[x](javascript&colon;alert(1))',
  ]) {
    assert.deepEqual(parseMarkdown(src), [p(t(src))], JSON.stringify(src));
  }
  assert.deepEqual(parseMarkdown('<javascript:alert(1)>'), [p(t('<javascript:alert(1)>'))]);
  assert.deepEqual(parseMarkdown('<data:text/html,x>'), [p(t('<data:text/html,x>'))]);
  assert.deepEqual(parseMarkdown('[x](https://a) onerror='), [p(a('https://a/', t('x')), t(' onerror='))]);
  const tricky = parseMarkdown('javascript:alert(1) と https://e.com/"onmouseover="x');
  // 素の URL の中の引用符は、URL の正規化で %22 になる（属性の差し込みにならない）。
  assert.deepEqual(hrefs(tricky), ['https://e.com/%22onmouseover=%22x']);
});

test('T-02 生の HTML は要素にせず文字のまま。コードの塊の言語の引用符は lang の文字に入るだけ', () => {
  for (const src of [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '<iframe src="https://e.com"></iframe>',
    '<style>body{display:none}</style>',
    'a < b かつ <未閉じ',
  ]) {
    const blocks = parseMarkdown(src);
    assert.equal(blocks.length, 1, src);
    assert.equal(blocks[0].type, 'paragraph', src);
    assert.equal(collect(blocks), src, src);
    assert.deepEqual(hrefs(blocks), [], src);
  }
  assert.deepEqual(parseMarkdown('```js" onload="x\nbody\n```'), [{ type: 'code', lang: 'js"', text: 'body' }]);
  assert.deepEqual(parseMarkdown('```"><script>\nbody\n```'), [{ type: 'code', lang: '"><script>', text: 'body' }]);
});

test('T-03 壊れた入力：例外を出さず、元の語が欠けない', () => {
  const cases: [string, string][] = [
    ['**閉じない太字', '**閉じない太字'],
    ['`閉じないコード', '`閉じないコード'],
    ['```\n閉じない柵', '閉じない柵'],
    ['[閉じない角', '[閉じない角'],
    ['[a](https://e.com 閉じない', '[a](https://e.com 閉じない'],
    ['](', ']('],
    ['| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |', 'ab112'],
    ['文の終わり\\', '文の終わり\\'],
    ['~~閉じない ~~ *a _b', '~~閉じない ~~ *a _b'],
    ['- [ ]', ''],
    ['>', ''],
  ];
  for (const [src, expected] of cases) {
    const blocks = parseMarkdown(src);
    assert.equal(collect(blocks), expected, JSON.stringify(src));
  }
  assert.deepEqual(parseMarkdown(''), []);
  assert.deepEqual(parseMarkdown('\n\n  \n'), []);
  for (const v of [undefined, null, 1, {}, ['# a']]) assert.deepEqual(parseMarkdown(v), []);
});

test('T-03 9段以上の入れ子：8段より深い中身は解かずに文字で残す', () => {
  const quote = `${'>'.repeat(12)} 深い`;
  const blocks = parseMarkdown(quote);
  let node: Record<string, unknown> = blocks[0];
  let depth = 0;
  while (node && node.type === 'quote') {
    depth++;
    node = (node.children as Record<string, unknown>[])[0] as Record<string, unknown>;
  }
  assert.equal(depth, 8);
  assert.equal(node.type, 'paragraph');
  assert.equal(collect(blocks), `${'>'.repeat(4)} 深い`);

  const list = Array.from({ length: 12 }, (_, i) => `${'  '.repeat(i)}- 段${i + 1}`).join('\n');
  const text = collect(parseMarkdown(list));
  for (let i = 1; i <= 12; i++) assert.ok(text.includes(`段${i}`), `段${i}`);
  assert.ok(text.includes('- 段9'));

  const em = `${'*a '.repeat(12)}b${' c*'.repeat(12)}`;
  assert.ok(collect(parseMarkdown(em)).includes('b'));
});

test('T-03 表のセルの総数が入力の長さに比例する上限を超えたら、残りの行は段落の文字にする', () => {
  const src = `${'|a'.repeat(12_500)}\n${'-|'.repeat(12_500)}\n${'|z\n'.repeat(20)}`;
  const blocks = parseMarkdown(src);
  assert.equal(blocks[0].type, 'table');
  assert.equal(blocks[0].rows.length < 20, true);
  assert.equal(blocks[blocks.length - 1].type, 'paragraph');
  assert.equal((collect(blocks).match(/z/g) ?? []).length, 20);
});

test('T-03 病的な入力 100,000 字を、それぞれ 1 秒より短く解く', () => {
  const N = 100_000;
  const inputs: [string, string][] = [
    ['* の並び', '*'.repeat(N)],
    ['文の中の * の並び', `a${'*'.repeat(N - 1)}`],
    ['*a の並び', '*a'.repeat(N / 2)],
    ['** a の並び', '** a'.repeat(N / 4)],
    ['[ の並び', '['.repeat(N)],
    ['[a]( の並び', '[a]('.repeat(N / 4)],
    ['` の並び', '`'.repeat(N)],
    ['a` の並び', 'a`'.repeat(N / 2)],
    ['長さの違う ` の並び', Array.from({ length: 450 }, (_, i) => `${'`'.repeat(i + 1)}x`).join('')],
    ['> の並び', '>'.repeat(N)],
    ['> の行の並び', '> \n'.repeat(N / 3)],
    ['_a の並び', '_a'.repeat(N / 2)],
    ['< の並び', '<a'.repeat(N / 2)],
    ['https:// の並び', 'https://a)'.repeat(N / 10)],
    ['~~ の並び', '~~a '.repeat(N / 4)],
    ['- の入れ子の並び', '- '.repeat(N / 2)],
    ['| の表', `|a|b|\n|-|-|\n${'|x|y|\n'.repeat(N / 6)}`],
    ['広い見出しと | だけの行の表', `${'|a'.repeat(1000)}|\n${'|-'.repeat(1000)}|\n${'|\n'.repeat((N - 4002) / 2)}`],
    ['とても広い見出しと | だけの行の表', `${'|a'.repeat(12_500)}\n${'-|'.repeat(12_500)}\n${'|\n'.repeat(25_000)}`],
    ['\\ の並び', '\\'.repeat(N)],
  ];
  for (const [name, src] of inputs) {
    const begin = performance.now();
    const blocks = parseMarkdown(src);
    const ms = performance.now() - begin;
    assert.ok(Array.isArray(blocks), name);
    assert.ok(ms < 1000, `${name}: ${ms.toFixed(0)}ms`);
  }
});
