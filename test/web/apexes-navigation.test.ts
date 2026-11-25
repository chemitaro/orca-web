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
const APEX_FILES = ['apexes.js', 'apexes-view.js', 'apexes-dom.js', 'apexes-cards-view.js'];

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
  const mount =
    /export function mountAgentFrame\(slot, id, \{ compose = true \} = \{\}\) \{([\s\S]*?)\n\}/.exec(dom)?.[1] ?? '';
  const created = mount.indexOf("const frame = slot.ownerDocument.createElement('iframe');");
  const assigned = mount.indexOf('frame.src = frameSrc(id, { compose });');
  const appended = mount.indexOf('slot.append(frame);');
  assert.ok(created >= 0 && created < assigned && assigned < appended, '作る → src を決める → 入れる の順');
});

test('R-01：入口は ?apex= を履歴を増やさない replaceState で覚え、切り替えの前に枠の印を確かめる', () => {
  const entry = read('apexes.js');
  assert.match(entry, /history\.replaceState\(/);
  assert.doesNotMatch(entry, /history\.pushState\(/);
  assert.match(entry, /mayLeaveFrame\(els\.paneFrame, \(text\) => window\.confirm\(text\)\)/);
  assert.match(entry, /mountAgentFrame\(els\.paneFrame, target\.id, \{ compose: target\.compose \}\)/);
  assert.match(entry, /const target = paneFrameTarget\(pane\.header\.id, memberView\);/);
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

test('R-06：900px 未満のメディアクエリに、見出しの nav・行の題名・右のペインの見出しの帯の折り返しの規則がある', () => {
  const css = readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8');
  const narrow = mediaBlock(css, '(max-width: 899.98px)');
  const rule = (selector: string): string => {
    const at = narrow.indexOf(selector);
    assert.ok(at >= 0, selector);
    return narrow.slice(at, narrow.indexOf('}', at));
  };
  const wraps = rule('.apexes-page .bar,');
  assert.match(wraps, /\.apexes-page \.links,/);
  assert.match(wraps, /\.apexes-page \.apex-pane-bar \{/);
  assert.match(wraps, /flex-wrap: wrap;/);
  assert.match(wraps, /min-width: 0;/);
  const words = rule('.apexes-page .links a,');
  assert.match(words, /\.apexes-page \.apex-title \{/);
  assert.match(words, /min-width: 0;/);
  assert.match(words, /overflow-wrap: anywhere;/);
  const title = rule('.apexes-page .apex-head .apex-title {');
  assert.match(title, /flex: 1 1 0;/, '行の題名は残りの幅に収まって折り返す');
});

test('iss-00080 T-04・T-05・F-01：カードの操作は枠の切り替えの確かめを通し、頂点に伝えるは下書きの送り手だけを使う', () => {
  const entry = read('apexes.js');
  const change = /function changeFrame\(next\) \{([\s\S]*?)\n\}/.exec(entry)?.[1] ?? '';
  assert.match(change, /mayLeaveFrame\(els\.paneFrame, \(text\) => window\.confirm\(text\)\)/);
  const tell = /cardAction === 'tell'[\s\S]*?\n {2}\}/.exec(entry)?.[0] ?? '';
  const back = tell.indexOf('if (!changeFrame(null)) return;');
  const send = tell.indexOf('draftSender.send(buildDraftText(card));');
  assert.ok(back >= 0 && back < send, '頂点の枠に戻してから送り手に渡す');
  assert.match(entry, /createDraftSender\(\{\s*selfOrigin: location\.origin,/, '宛先のオリジンは自分のオリジン');
  assert.match(entry, /window\.addEventListener\('message', \(event\) => draftSender\.handleMessage\(event\)\)/);
  assert.match(entry, /noteFrame\(mountAgentFrame\(els\.paneFrame, target\.id, \{ compose: target\.compose \}\)\)/);
  assert.match(entry, /noteFrame\(null\)/);
  // 送る経路を足さない：入口から書き込みの口を呼ぶのは「Orca で開く」だけ。
  assert.equal([...entry.matchAll(/writer\.send\(/g)].length, 1);
  assert.doesNotMatch(entry, /\/api\/(?:send|answer|approval)\//);
  // メンバーは URL に出さない。
  assert.doesNotMatch(entry, /memberView[^\n]*selectionUrl|selectionUrl[^\n]*memberView/);
});
