// 埋め込みの1行のスクリプト（web/embed/open-button.js）を偽の document と window の中で動かし、iframe の既定の大きさ、
// data-width の上書き、クエリー、390px 以下で読み込まないことを確かめる。3か所の HTML と JS に、見える「Orca で開く」の
// 文字のボタンが残らないことも確かめる（T-07）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../web/embed/open-button.js', import.meta.url), 'utf8');
const read = (path: string) =>
  readFileSync(new URL(`../../web/${path}`, import.meta.url), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');

type Frame = {
  title: string;
  width: string;
  height: string;
  src: string;
  hidden: boolean;
  attrs: Record<string, string>;
  style: Record<string, string>;
  setAttribute(name: string, value: string): void;
};

function run(data: Record<string, string>, { narrow = false } = {}) {
  class HTMLScriptElement {
    src = 'http://127.0.0.1:8791/embed/open-button.js';
    dataset = data;
    inserted: Frame | null = null;
    after(node: Frame) {
      this.inserted = node;
    }
  }
  const script = new HTMLScriptElement();
  const listeners: ((event: unknown) => void)[] = [];
  const media = {
    matches: narrow,
    addEventListener: (_name: string, fn: (event: unknown) => void) => listeners.push(fn),
  };
  let asked = '';
  const document = {
    currentScript: script,
    createElement: (tag: string): Frame => {
      assert.equal(tag, 'iframe');
      return {
        title: '',
        width: '',
        height: '',
        src: '',
        hidden: false,
        attrs: {},
        style: {},
        setAttribute(name, value) {
          this.attrs[name] = value;
        },
      };
    },
  };
  const window = {
    matchMedia: (query: string) => {
      asked = query;
      return media;
    },
  };
  vm.runInNewContext(source, { document, window, HTMLScriptElement, URL, URLSearchParams });
  const frame = script.inserted;
  assert.ok(frame, 'iframe を差し込む');
  return {
    frame,
    asked,
    query: frame.src ? new URL(frame.src).searchParams : null,
    widen() {
      media.matches = false;
      for (const fn of listeners) fn({});
    },
  };
}

// 文字ありの既定の幅は、試しの画面で測って中のボタンが切れない最小の整数（S-02 の描画の確かめ）。
const SIZES: Array<[Record<string, string>, string, string]> = [
  [{ size: 'sm' }, '64', '24'],
  [{ size: 'md' }, '73', '28'],
  [{}, '73', '28'],
  [{ size: 'sm', label: 'none' }, '24', '24'],
  [{ size: 'md', label: 'none' }, '28', '28'],
  [{ label: 'none' }, '28', '28'],
];

for (const [data, width, height] of SIZES) {
  test(`T-07：${JSON.stringify(data)} の iframe の既定は 幅 ${width}・高さ ${height}`, () => {
    const { frame } = run({ worktree: '/w', ...data });
    assert.equal(frame.width, width);
    assert.equal(frame.height, height);
    assert.equal(frame.title, 'Orca で開く');
  });
}

test('T-07：data-width で幅を上書きでき、高さは形と大きさのまま', () => {
  const { frame } = run({ worktree: '/w', size: 'sm', width: '260' });
  assert.equal(frame.width, '260');
  assert.equal(frame.height, '24');
});

test('T-07：label=none と size と theme と worktree と agent をクエリーに渡し、知らない値は渡さない', () => {
  const { query, frame } = run({ worktree: '/w', agent: 'a1', size: 'sm', theme: 'dark', label: 'none' });
  assert.ok(query);
  assert.equal(new URL(frame.src).pathname, '/embed/open-button');
  assert.deepEqual(Object.fromEntries(query), {
    worktree: '/w',
    agent: 'a1',
    theme: 'dark',
    size: 'sm',
    label: 'none',
  });
  const plain = run({ worktree: '/w', label: 'text', size: 'xl', theme: 'blue' });
  assert.ok(plain.query);
  assert.deepEqual(Object.fromEntries(plain.query), { worktree: '/w' });
});

test('T-07：390px 以下では隠して読み込まず、広くなったら読み込む', () => {
  const r = run({ worktree: '/w' }, { narrow: true });
  assert.equal(r.asked, '(max-width: 390px)');
  assert.equal(r.frame.src, '');
  assert.equal(r.frame.hidden, true);
  assert.equal(r.frame.style.display, 'none');
  r.widen();
  assert.match(r.frame.src, /\/embed\/open-button\?/);
  assert.equal(r.frame.hidden, false);
});

test('T-07：3か所の HTML と JS に、見える「Orca で開く」の文字のボタンと横の結果の文字が残らない', () => {
  for (const path of ['embed/open-button.html', 'embed/agent.html', 'index.html']) {
    const html = read(path);
    assert.doesNotMatch(html, /<button\b[^>]*>\s*Orca で開く/, path);
    assert.doesNotMatch(html, /id="(open|open-status|status)"/, path);
  }
  assert.match(read('embed/agent.html'), /<span\b[^>]*\bid="open-slot"/);
  for (const path of ['embed/open-button.html', 'embed/agent.html', 'index.html']) {
    assert.match(read(path), /href="[./]*(embed\/)?open-control\.css"/, path);
  }
  for (const path of ['embed/open-button-frame.js', 'embed/agent-frame.js', 'inbox.js', 'inbox-dom.js']) {
    const js = read(path);
    assert.doesNotMatch(js, /'Orca で開く'/, path);
    assert.doesNotMatch(js, /worktree_not_found|ほかの開く処理/, `${path} に言葉の表が残らない`);
    assert.doesNotMatch(js, /innerHTML/, path);
  }
  for (const path of ['embed/open-button-frame.js', 'embed/agent-frame.js', 'inbox.js']) {
    assert.match(read(path), /runOpen\(/, path);
    assert.match(read(path), /'\/api\/open', 'POST'/, path);
  }
});
