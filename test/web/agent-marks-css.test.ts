// 印の部品の CSS（web/embed/agent-marks.css）の文字を読み、SpecDock に合わせた色と形（T-11）と、作業中の回る動き（T-12）を確かめる。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const CSS_PATH = new URL('../../web/embed/agent-marks.css', import.meta.url);
const css = readFileSync(CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

type Rule = { media: string | null; selector: string; body: string };

// 規則を、外側の @media（なければ null）と選択子と中身に分ける。入れ子は @media の1段だけを扱う。
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

const rules = parseRules(css);

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

function ruleFor(selector: string, media: (m: string | null) => boolean): Map<string, string> {
  return declarations(
    only(
      rules.filter((r) => r.selector === selector && media(r.media)),
      selector,
    ).body,
  );
}

function only<T>(items: T[], what: string): T {
  const [first] = items;
  assert.equal(items.length, 1, `${what} がちょうど1つ（${items.length}）`);
  assert.ok(first !== undefined);
  return first;
}

const plain = (m: string | null) => m === null;
const darkScheme = (m: string | null) => m !== null && /prefers-color-scheme:\s*dark/.test(m);
const reducedMotion = (m: string | null) => m !== null && /prefers-reduced-motion:\s*reduce/.test(m);

// D-08 の表。[状態, SpecDock の変数（主・背景・線・文字）, 明るい値, 暗い値]
type Four = [string, string, string, string];
const TABLE: Array<[string, Four, Four, Four]> = [
  [
    'working',
    ['--sd-doing', '--sd-doing-bg', '--sd-doing-line', '--sd-doing-ink'],
    ['#0b8a4a', '#e7f6ee', '#b3e0c6', '#0a6b3a'],
    ['#3ddc84', 'rgb(61 220 132 / 10%)', 'rgb(61 220 132 / 28%)', '#7ce8ab'],
  ],
  [
    'blocked',
    ['--sd-blocked', '--sd-blocked-bg', '--sd-blocked-line', '--sd-blocked-ink'],
    ['#a86e00', '#fff6dc', '#efd595', '#7a5000'],
    ['#ffc93c', 'rgb(255 201 60 / 10%)', 'rgb(255 201 60 / 28%)', '#ffd978'],
  ],
  [
    'waiting',
    ['--sd-ready', '--sd-ready-bg', '--sd-ready-line', '--sd-ready-ink'],
    ['#2457c5', '#edf2fc', '#c3d3f3', '#1d469f'],
    ['#6f9dff', 'rgb(111 157 255 / 10%)', 'rgb(111 157 255 / 28%)', '#a8c3ff'],
  ],
  [
    'done',
    ['--sd-done', '--sd-done-bg', '--sd-done-line', '--sd-done-ink'],
    ['#7d8696', '#f3f5f8', '#d6dbe3', '#343c4a'],
    ['#7f889a', 'rgb(163 172 187 / 9%)', 'rgb(163 172 187 / 26%)', '#d0d6df'],
  ],
  [
    'unknown',
    ['--sd-unknown', '--sd-unknown-bg', '--sd-unknown-line', '--sd-unknown-ink'],
    ['#7048c0', '#f3effc', '#d6c8f2', '#5b37a6'],
    ['#b79bff', 'rgb(183 155 255 / 10%)', 'rgb(183 155 255 / 28%)', '#d2c0ff'],
  ],
];
const SUFFIXES = ['', '-bg', '-line', '-ink'];

for (const [scheme, pick, column] of [
  ['明るい', plain, 2],
  ['暗い', darkScheme, 3],
] as const) {
  test(`T-11：.orca-marks の${scheme}既定が SpecDock の変数を先に使い、D-08 の表の値と同じ`, () => {
    const decl = ruleFor('.orca-marks', pick);
    for (const row of TABLE) {
      const [state, vars] = row;
      const values = row[column];
      SUFFIXES.forEach((suffix, k) => {
        assert.equal(decl.get(`--orca-mark-${state}${suffix}`), `var(${vars[k]}, ${values[k]})`, `${state}${suffix}`);
      });
    }
    const track = scheme === '明るい' ? '#848d9c' : '#6f7889';
    const muted = scheme === '明るい' ? '#5a6372' : '#98a1b2';
    assert.equal(decl.get('--orca-mark-sleeping'), `var(--sd-track, ${track})`);
    assert.equal(decl.get('--orca-mark-sleeping-line'), `var(--sd-track, ${track})`);
    assert.equal(decl.get('--orca-mark-sleeping-bg'), 'transparent');
    assert.equal(decl.get('--orca-mark-sleeping-ink'), `var(--ds-muted, ${muted})`);
    const focus = scheme === '明るい' ? '#1a56c4' : '#8fb4ff';
    assert.equal(decl.get('--orca-mark-focus'), `var(--ds-focus, ${focus})`);
  });
}

test('T-11：各状態の印が、その状態の4つの変数を使い、+N は done の組を使う', () => {
  const states = [...TABLE.map((r) => r[0]), 'sleeping'];
  for (const [mark, from] of [...states.map((s) => [s, s]), ['more', 'done']]) {
    const decl = ruleFor(`.orca-mark--${mark}`, plain);
    SUFFIXES.forEach((suffix) => {
      assert.equal(decl.get(`--orca-mark-st${suffix}`), `var(--orca-mark-${from}${suffix})`, `${mark}${suffix}`);
    });
  }
});

test('T-11：.orca-mark は SpecDock の .chip の形（角丸 4px、線 1px、太さ 700、字体 --ds-font-sans）', () => {
  const decl = ruleFor('.orca-mark', plain);
  assert.equal(decl.get('border-radius'), 'var(--ds-radius-s, 4px)');
  assert.equal(decl.get('border'), '1px solid var(--orca-mark-st-line)');
  assert.equal(decl.get('background'), 'var(--orca-mark-st-bg)');
  assert.equal(decl.get('color'), 'var(--orca-mark-st-ink)');
  assert.equal(decl.get('font-weight'), '700');
  assert.match(decl.get('font-family') ?? '', /^var\(--ds-font-sans, "BIZ UDPGothic", -apple-system,/);
});

test('T-11：不明の破線と、アイコンの白い台がない', () => {
  assert.doesNotMatch(css, /dashed/);
  assert.doesNotMatch(css, /--orca-mark-icon-bg/);
});

test('T-11：フォーカスの縁は SpecDock の --ds-focus の 2px', () => {
  const decl = ruleFor('button.orca-mark:focus-visible', plain);
  assert.equal(decl.get('outline'), '2px solid var(--orca-mark-focus)');
});

test('T-12：回る keyframes は transform だけを動かす', () => {
  const frames = rules.filter((r) => r.selector.startsWith('@keyframes'));
  assert.deepEqual(
    frames.map((r) => r.selector),
    ['@keyframes orca-mark-spin'],
  );
  const spin = only(frames, '@keyframes');
  const steps = parseRules(spin.body);
  assert.ok(steps.length > 0);
  for (const step of steps) {
    assert.deepEqual([...declarations(step.body).keys()], ['transform'], step.selector);
  }
  assert.match(spin.body, /rotate\(360deg\)/);
});

test('T-12：animation を持つ規則は working の印の中の要素だけで、動きを減らす設定では none', () => {
  const animated = rules.filter(
    (r) =>
      !r.selector.startsWith('@keyframes') && [...declarations(r.body).keys()].some((k) => k.startsWith('animation')),
  );
  const moving = animated.filter((r) => !reducedMotion(r.media));
  const spin = only(moving, 'animation を持つ規則');
  for (const sel of spin.selector.split(',')) {
    assert.match(sel.trim(), /^\.orca-mark--working:not\(\.orca-mark--monitoring\) \S/, sel);
  }
  assert.match(declarations(spin.body).get('animation') ?? '', /^orca-mark-spin 1\.2s linear infinite$/);

  const still = ruleFor(spin.selector, reducedMotion);
  assert.equal(still.get('animation'), 'none');
  assert.equal(animated.length, 2);
});

const RING = '.orca-mark--working:not(.orca-mark--monitoring) .orca-mark-icon';

test('T-22：作業中の輪の全体（余白・静かな輪・回る弧・animation）は monitoring で出ない', () => {
  // 作業中の印のアイコンに掛かる規則は、どれも monitoring を除く。
  const ringRules = rules.filter(
    (r) => r.selector.includes('.orca-mark--working') && r.selector.includes('.orca-mark-icon'),
  );
  assert.ok(ringRules.length >= 4, String(ringRules.length));
  for (const r of ringRules) {
    for (const sel of r.selector.split(',')) assert.ok(sel.trim().startsWith(RING), sel);
  }
  assert.equal(ruleFor(RING, plain).get('padding'), '2px');
  const both = only(
    rules.filter((r) => r.media === null && r.selector.replace(/\s+/g, ' ') === `${RING}::before, ${RING}::after`),
    'the ring rule',
  );
  assert.equal(declarations(both.body).get('content'), '""');
  assert.match(ruleFor(`${RING}::after`, plain).get('animation') ?? '', /^orca-mark-spin /);
  // monitoring の規則は、輪も animation も足さない。
  for (const r of rules.filter((x) => x.selector.includes('.orca-mark--monitoring') && !x.selector.includes(':not('))) {
    const keys = [...declarations(r.body).keys()];
    assert.ok(!keys.some((k) => k.startsWith('animation')), r.selector);
    assert.ok(!/::(before|after)/.test(r.selector), r.selector);
  }
});

test('T-22：monitoring の色は working の変数のまま（独自の色の変数を持たない）、電気の印は主の色で小 11px・中 13px', () => {
  assert.doesNotMatch(css, /--orca-mark-monitoring/);
  assert.equal(rules.filter((r) => r.selector === '.orca-mark--monitoring').length, 0);
  const state = ruleFor('.orca-mark-state', plain);
  assert.equal(state.get('color'), 'var(--orca-mark-st)');
  assert.equal(state.get('width'), '11px');
  assert.equal(state.get('height'), '11px');
  assert.equal(state.get('flex'), 'none');
  const md = ruleFor('.orca-marks--md .orca-mark-state', plain);
  assert.equal(md.get('width'), '13px');
  assert.equal(md.get('height'), '13px');
});
