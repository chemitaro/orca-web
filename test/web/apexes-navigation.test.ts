// 指揮の画面の枠の作り直しと幅の、ソースの確かめ（iss-00077 T-05、T-08、R-01 の URL）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// 字句としてコメントだけを除く。文字列の中の // は消さない。
function withoutComments(source: string): string {
  return source.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g,
    (token) => (token.startsWith('/') ? ' ' : token),
  );
}

const read = (path: string) => withoutComments(readFileSync(new URL(`../../web/${path}`, import.meta.url), 'utf8'));
const APEX_FILES = ['apexes.js', 'apexes-view.js', 'apexes-dom.js'];

test('T-05：apexes の web のソースに、既にある iframe の src・location の書き換え、window.open がない', () => {
  for (const path of APEX_FILES) {
    const code = read(path);
    assert.doesNotMatch(code, /\blocation\s*(?:\.\s*href\s*)?=(?!=)/, `${path}: location の代入`);
    assert.doesNotMatch(code, /\blocation\s*\.\s*(?:assign|replace)\s*\(/, `${path}: location.assign・replace`);
    assert.doesNotMatch(code, /\bwindow\s*\.\s*open\s*\(|\bopen\s*\(\s*['"`]/, `${path}: window.open`);
    assert.doesNotMatch(code, /contentWindow/, `${path}: 枠の中の窓に触らない`);
    assert.doesNotMatch(code, /setAttribute\(\s*['"]src['"]/, `${path}: src の属性を書き換えない`);
    const assigns = [...code.matchAll(/\.src\s*=(?!=)/g)];
    if (path !== 'apexes-dom.js') assert.equal(assigns.length, 0, `${path}: src の代入がない`);
  }
  // src の代入は mountAgentFrame の中の1か所だけで、作ったばかりの要素に入れる前に決める。
  const dom = read('apexes-dom.js');
  assert.equal([...dom.matchAll(/\.src\s*=(?!=)/g)].length, 1);
  const mount = /export function mountAgentFrame\(slot, id\) \{([\s\S]*?)\n\}/.exec(dom)?.[1] ?? '';
  const created = mount.indexOf("const frame = slot.ownerDocument.createElement('iframe');");
  const assigned = mount.indexOf('frame.src = frameSrc(id);');
  const appended = mount.indexOf('slot.append(frame);');
  assert.ok(created >= 0 && created < assigned && assigned < appended, '作る → src を決める → 入れる の順');
});

test('R-01：入口は ?apex= を履歴を増やさない replaceState で覚え、切り替えの前に枠の印を確かめる', () => {
  const entry = read('apexes.js');
  assert.match(entry, /history\.replaceState\(/);
  assert.doesNotMatch(entry, /history\.pushState\(/);
  assert.match(entry, /mayLeaveFrame\(els\.paneFrame, \(text\) => window\.confirm\(text\)\)/);
  assert.match(entry, /mountAgentFrame\(els\.paneFrame, pane\.header\.id\)/);
  assert.match(
    entry,
    /initialSelection\(location\.search, \{\s*wide: window\.matchMedia\(`\(min-width: \$\{WIDE_MIN_PX\}px\)`\)\.matches,/,
  );
  assert.match(entry, /createOpenControl\(document, \{ size: 'md' \}\)/, '「Orca で開く」は共有の部品');
  const html = readFileSync(new URL('../../web/apexes.html', import.meta.url), 'utf8');
  for (const id of ['sections', 'pane', 'pane-head', 'pane-frame']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /href="\/embed\/open-control\.css"/);
});

/** media の中身（最初に一致した @media の塊）。 */
function mediaBlock(css: string, query: string): string {
  const start = css.indexOf(`@media ${query} {`);
  assert.ok(start >= 0, `@media ${query}`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(start, i + 1);
  }
  return assert.fail('閉じていない @media');
}

test('T-08：900px 未満は選択の class で一覧と右のペインの片方だけを出し、900px 以上は2列（一覧 320px）で「← 一覧」を隠す', () => {
  const css = readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8');
  const narrow = mediaBlock(css, '(max-width: 899.98px)');
  assert.match(narrow, /body\.apexes-page:not\(\.apexes--selected\) \.apex-pane \{\s*display: none;/);
  assert.match(narrow, /body\.apexes-page\.apexes--selected \.apex-list,[^{]*\{\s*display: none;/);
  const wide = mediaBlock(css, '(min-width: 900px)');
  assert.match(wide, /grid-template-columns: 320px minmax\(0, 1fr\);/);
  assert.match(wide, /\.apex-back \{\s*display: none;/);
  assert.match(css, /\.apexes-page \.apex-title \{[^}]*overflow-wrap: anywhere;/);
  const entry = read('apexes.js');
  assert.match(entry, /document\.body\.classList\.toggle\('apexes--selected', pane\.selected\)/);
  assert.match(entry, /changeSelection\(\{ type: 'clear' \}\)/, '「← 一覧」は ?apex= を外す clear');
});
