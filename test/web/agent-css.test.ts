// エージェントの詳細とチャットの CSS（web/embed/agent.css）の文字を読み、SpecDock のデザインシステム（app.css c050e7bd7）に
// 合わせた色・字体・角丸・線・フォーカスと、印の部品に渡す状態の変数を確かめる（T-16）。test/web/agent-marks-css.test.ts と同じ方式。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const css = strip(readFileSync(new URL('../../web/embed/agent.css', import.meta.url), 'utf8'));
const marksCss = strip(readFileSync(new URL('../../web/embed/agent-marks.css', import.meta.url), 'utf8'));

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
const darkScheme = (m: string | null) => m !== null && /prefers-color-scheme:\s*dark/.test(m);

function only(selector: string, media: (m: string | null) => boolean, from: Rule[] = rules): Map<string, string> {
  const hits = from.filter((r) => r.selector === selector && media(r.media));
  assert.equal(hits.length, 1, `${selector} がちょうど1つ（${hits.length}）`);
  return declarations(hits[0]?.body ?? '');
}

const BLOCKS = [
  ['明るい（:root）', () => only(':root', (m) => m === null), 'light'],
  ['暗い（prefers-color-scheme）', () => only(':root:not([data-theme="light"])', darkScheme), 'dark'],
  ['暗い（data-theme="dark"）', () => only(':root[data-theme="dark"]', (m) => m === null), 'dark'],
] as const;

// [この CSS の変数, SpecDock の変数, 明るい値, 暗い値]（app.css c050e7bd7）
const TOKENS: [string, string, string, string][] = [
  ['--chat-bg', '--ds-bg', '#ffffff', '#111318'],
  ['--chat-surface', '--ds-surface-2', '#f4f6f8', '#1d212a'],
  ['--chat-text', '--ds-text', '#1c2230', '#e6e9ef'],
  ['--chat-muted', '--ds-muted', '#5a6372', '#98a1b2'],
  ['--chat-border', '--ds-border', '#dfe3e9', '#2b313c'],
  ['--chat-border-strong', '--ds-border-2', '#848d9c', '#6f7889'],
  ['--chat-focus', '--ds-focus', '#1a56c4', '#8fb4ff'],
  ['--chat-on-accent', '--ds-on-accent', '#ffffff', '#0b0d12'],
  ['--chat-danger', '--ds-danger', '#c21f4d', '#ff7a99'],
  ['--chat-danger-bg', '--ds-danger-bg', '#fdeff3', 'rgb(255 122 153 / 10%)'],
  ['--chat-danger-line', '--ds-danger-line', '#f5c8d5', 'rgb(255 122 153 / 28%)'],
  ['--chat-danger-ink', '--ds-danger-ink', '#a3173f', '#ffadc0'],
  ['--chat-accent', '--sd-ready', '#2457c5', '#6f9dff'],
  ['--chat-user-bg', '--sd-ready-bg', '#edf2fc', 'rgb(111 157 255 / 10%)'],
  ['--chat-user-line', '--sd-ready-line', '#c3d3f3', 'rgb(111 157 255 / 28%)'],
];

/** agent-marks.css の .orca-marks の既定（var(--sd-x, 値) と var(--ds-x, 値)）を、変数の名前 → 値の表にする。 */
function markDefaults(media: (m: string | null) => boolean): Map<string, string> {
  const table = new Map<string, string>();
  for (const value of only('.orca-marks', media, parseRules(marksCss)).values()) {
    const hit = /^var\((--(?:sd|ds)-[a-z0-9-]+), (.+)\)$/.exec(value);
    if (hit?.[1] && hit[2]) table.set(hit[1], hit[2]);
  }
  return table;
}
const MARK_DEFAULTS = { light: markDefaults((m) => m === null), dark: markDefaults(darkScheme) };
const STATE_VARS = ['ready', 'doing', 'blocked', 'unknown', 'done'].flatMap((s) =>
  ['', '-bg', '-line', '-ink'].map((suffix) => `--sd-${s}${suffix}`),
);

for (const [name, read, scheme] of BLOCKS) {
  test(`T-16：${name} の色の変数が SpecDock の変数を先に使い、既定が app.css の値と同じ`, () => {
    const decl = read();
    for (const [local, ds, light, dark] of TOKENS)
      assert.equal(decl.get(local), `var(${ds}, ${scheme === 'light' ? light : dark})`, local);
  });

  test(`T-16：${name} に、印の部品が読む状態の変数を agent-marks.css の既定と同じ値で置く`, () => {
    const decl = read();
    const defaults = MARK_DEFAULTS[scheme];
    for (const v of [...STATE_VARS, '--sd-track', '--ds-muted', '--ds-focus']) {
      assert.ok(defaults.has(v), `agent-marks.css に ${v} の既定がある`);
      assert.equal(decl.get(v), defaults.get(v), v);
    }
  });
}

test('T-16：古い名前の色の変数（--bg など）が残らない', () => {
  for (const old of [
    '--bg',
    '--fg',
    '--muted',
    '--line',
    '--user-bg',
    '--assistant-bg',
    '--tool-bg',
    '--error',
    '--button-bg',
  ])
    assert.doesNotMatch(css, new RegExp(`${old}\\s*[:)]`), old);
});

test('T-16：変数の置き場のほかの規則は、色を直書きせず変数を通す', () => {
  const tokenBlocks = new Set([':root', ':root:not([data-theme="light"])', ':root[data-theme="dark"]']);
  for (const rule of rules) {
    if (tokenBlocks.has(rule.selector) || rule.selector.startsWith('@keyframes')) continue;
    for (const [prop, value] of declarations(rule.body)) {
      if (prop.startsWith('--')) continue;
      assert.doesNotMatch(value, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${rule.selector} の ${prop}: ${value}`);
    }
  }
});

test('T-16：字体は --ds-font-sans の 14px / 1.6、角丸は --ds-radius の3つ、フォーカスは --ds-focus の 3px の輪', () => {
  const body = only('body', (m) => m === null);
  assert.equal(
    body.get('font-family'),
    'var(--ds-font-sans, "BIZ UDPGothic", -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif)',
  );
  assert.equal(body.get('font-size'), '14px');
  assert.equal(body.get('line-height'), '1.6');
  assert.equal(body.get('background'), 'var(--chat-bg)');
  assert.equal(body.get('color'), 'var(--chat-text)');
  const radii = rules.flatMap((r) =>
    [...declarations(r.body)].filter(([p]) => p === 'border-radius').map(([, v]) => v),
  );
  assert.ok(radii.length >= 4);
  for (const value of radii)
    assert.match(value, /^var\(--ds-radius(-s|-l)?, (4|6|8)px\)$|^50%$/, `border-radius: ${value}`);
  assert.ok(radii.includes('var(--ds-radius-s, 4px)'));
  assert.ok(radii.includes('var(--ds-radius, 6px)'));
  assert.ok(radii.includes('var(--ds-radius-l, 8px)'));
  const focus = rules.filter((r) => /:focus-visible/.test(r.selector));
  assert.ok(focus.length > 0);
  for (const rule of focus)
    assert.equal(declarations(rule.body).get('outline'), '3px solid var(--chat-focus)', rule.selector);
});

test('T-16：確認の画面と結果の画面の規則がない', () => {
  assert.doesNotMatch(css, /\.send-confirm|\.send-result|\.send-expires|\.send-outcome|\.send-target/);
});
