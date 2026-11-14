// 開くボタンの CSS（web/embed/open-control.css）の文字を読み、SpecDock の .chip の仲間の色・字体・角丸・線・フォーカスと、
// 大きさ、動きを減らす設定を確かめ、古い開くボタンの見た目の規則が残らないことを確かめる（T-06）。agent-marks-css.test.ts と同じ方式。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (path: string) => strip(readFileSync(new URL(`../../web/${path}`, import.meta.url), 'utf8'));
const css = read('embed/open-control.css');

type Rule = { media: string | null; selector: string; body: string };

function parseRules(text: string, media: string | null = null): Rule[] {
  const rules: Rule[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    const inner = text.slice(open + 1, j - 1);
    if (head.startsWith('@media')) rules.push(...parseRules(inner, head));
    else rules.push({ media, selector: head, body: inner });
    i = j;
  }
  return rules;
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of body.split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    map.set(
      part.slice(0, at).trim(),
      part
        .slice(at + 1)
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\( /g, '(')
        .replace(/ \)/g, ')'),
    );
  }
  return map;
}

const rules = parseRules(css);
const plain = (m: string | null) => m === null;
const darkScheme = (m: string | null) => m !== null && /prefers-color-scheme:\s*dark/.test(m);
const reducedMotion = (m: string | null) => m !== null && /prefers-reduced-motion:\s*reduce/.test(m);

function only(selector: string, media: (m: string | null) => boolean): Map<string, string> {
  const hits = rules.filter((r) => r.selector === selector && media(r.media));
  assert.equal(hits.length, 1, `${selector} がちょうど1つ（${hits.length}）`);
  return declarations(hits[0]?.body ?? '');
}

// [部品の変数, SpecDock の変数, 明るい値, 暗い値]（SpecDock の app.css の値）
const TABLE: Array<[string, string, string, string]> = [
  ['--orca-open-border', '--ds-border', '#dfe3e9', '#2b313c'],
  ['--orca-open-border-hover', '--ds-border-2', '#848d9c', '#6f7889'],
  ['--orca-open-text', '--ds-text', '#1c2230', '#e6e9ef'],
  ['--orca-open-warn', '--ds-warn', '#a87400', '#e0a83a'],
  ['--orca-open-focus', '--ds-focus', '#1a56c4', '#8fb4ff'],
];

test('T-06：明るい既定が SpecDock の変数を先に使い、app.css の明るい値と同じ', () => {
  const decl = only('.orca-open', plain);
  for (const [name, ds, light] of TABLE) assert.equal(decl.get(name), `var(${ds}, ${light})`, name);
});

test('T-06：暗い既定は、prefers-color-scheme（data-theme=light を除く）と data-theme=dark の両方で app.css の暗い値', () => {
  const scheme = only(':root:not([data-theme="light"]) .orca-open', darkScheme);
  const forced = only(':root[data-theme="dark"] .orca-open', plain);
  for (const decl of [scheme, forced]) {
    for (const [name, ds, , dark] of TABLE) assert.equal(decl.get(name), `var(${ds}, ${dark})`, name);
  }
});

test('T-06：ボタンは .chip の仲間（1px の線、角丸 4px、太さ 700、字体 --ds-font-sans、背景は透明）', () => {
  const decl = only('.orca-open-button', plain);
  assert.equal(decl.get('border'), '1px solid var(--orca-open-border)');
  assert.equal(decl.get('border-radius'), 'var(--ds-radius-s, 4px)');
  assert.equal(decl.get('font-weight'), '700');
  assert.match(decl.get('font-family') ?? '', /^var\(--ds-font-sans, "BIZ UDPGothic", -apple-system,/);
  assert.equal(decl.get('background'), 'transparent');
  assert.equal(decl.get('color'), 'var(--orca-open-text)');
  assert.equal(decl.get('display'), 'inline-flex');
  assert.equal(decl.get('white-space'), 'nowrap');
  assert.equal(decl.get('line-height'), '1');
  assert.equal(decl.get('box-sizing'), 'border-box');
});

test('T-06：hover で線を border-2 に、フォーカスは --ds-focus の 2px を内側に描く', () => {
  assert.equal(
    only('.orca-open-button:hover:not(:disabled)', plain).get('border-color'),
    'var(--orca-open-border-hover)',
  );
  const focus = only('.orca-open-button:focus-visible', plain);
  assert.equal(focus.get('outline'), '2px solid var(--orca-open-focus)');
  assert.equal(focus.get('outline-offset'), '-2px');
});

test('T-06：sm は高さ 24px・アイコン 14px、md は高さ 28px・アイコン 16px、アイコンだけは正方形', () => {
  for (const [size, height, icon] of [
    ['sm', '24px', '14px'],
    ['md', '28px', '16px'],
  ]) {
    const decl = only(`.orca-open[data-size="${size}"]`, plain);
    assert.equal(decl.get('--orca-open-height'), height, size);
    assert.equal(decl.get('--orca-open-icon'), icon, size);
  }
  const button = only('.orca-open-button', plain);
  assert.equal(button.get('height'), 'var(--orca-open-height)');
  const icon = only('.orca-open-icon', plain);
  assert.equal(icon.get('width'), 'var(--orca-open-icon)');
  assert.equal(icon.get('height'), 'var(--orca-open-icon)');
  const square = only('.orca-open[data-label="none"] .orca-open-button', plain);
  assert.equal(square.get('width'), 'var(--orca-open-height)');
  assert.equal(square.get('padding'), '0');
});

test('T-06：警告の色は琥珀、押せない間は薄く、回る印は動きを減らす設定で止まる', () => {
  const warn = only('.orca-open[data-tone="warn"] .orca-open-button', plain);
  assert.equal(warn.get('border-color'), 'var(--orca-open-warn)');
  assert.equal(only('.orca-open[data-tone="warn"] .orca-open-icon', plain).get('color'), 'var(--orca-open-warn)');
  assert.equal(only('.orca-open-button:disabled', plain).get('opacity'), '0.6');
  assert.equal(only('.orca-open-button[aria-busy="true"]', plain).get('opacity'), '1');
  const spin = only('.orca-open-icon [data-icon="spinner"]', plain);
  assert.equal(spin.get('animation'), 'orca-open-spin 0.8s linear infinite');
  assert.equal(only('.orca-open-icon [data-icon="spinner"]', reducedMotion).get('animation'), 'none');
});

test('T-06：status は見えない形で隠す', () => {
  const decl = only('.orca-open-status', plain);
  assert.equal(decl.get('position'), 'absolute');
  assert.equal(decl.get('width'), '1px');
  assert.equal(decl.get('height'), '1px');
  assert.equal(decl.get('overflow'), 'hidden');
  assert.match(decl.get('clip-path') ?? decl.get('clip') ?? '', /inset\(50%\)|rect\(0/);
});

test('T-06：新しい色を足さない（色の値は変数の既定だけ）', () => {
  const values = new Set(TABLE.flatMap(([, , light, dark]) => [light, dark]));
  for (const hex of css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) assert.ok(values.has(hex.toLowerCase()), hex);
});

test('T-06：agent.css・style.css・open-button.css に古い開くボタンの見た目の規則が残らない', () => {
  for (const path of ['embed/agent.css', 'style.css', 'embed/open-button.css']) {
    const text = read(path);
    assert.doesNotMatch(text, /#open(?![\w-])|#open-status|\.open-status|\.item \.open(?![\w-])/, path);
    if (path === 'embed/open-button.css') {
      assert.doesNotMatch(text, /(^|[}\s,])button\b|#status\b/, path);
    }
  }
});
