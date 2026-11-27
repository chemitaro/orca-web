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
    /let selection = initialSelection\(location\.search\);/,
    '広い画面でも自動で選ばない（iss-00106）',
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
  assert.doesNotMatch(wide, /\.apex-back \{\s*display: none;/, '「← 一覧」は広い画面でも出す（iss-00106）');
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
  assert.match(wraps, /\.apexes-page \.links \{/);
  assert.match(wraps, /flex-wrap: wrap;/);
  assert.match(wraps, /min-width: 0;/);
  // 右のペインの見出しの帯は1行で、題名を省略して横に流れない（iss-00104 D-04）。
  const bar = rule('.apexes-page .apex-pane-bar {');
  assert.match(bar, /flex-wrap: nowrap;/);
  assert.match(bar, /min-width: 0;/);
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

test('iss-00102 T-02：行の「Orca で開く」は板（createOpenBoard）を通し、見出しと同じ1つの送る口で /api/open に送る', () => {
  const entry = read('apexes.js');
  assert.match(entry, /const sendOpen = \(target\) => writer\.send\('\/api\/open', 'POST', target\);/);
  assert.equal([...entry.matchAll(/writer\.send\(/g)].length, 1, '書き込みの口は1か所のまま');
  assert.match(entry, /const rowOpenBoard = createOpenBoard\(\);/);
  assert.match(entry, /onOpenMount: \(target, control\) => rowOpenBoard\.mount\(target\.agent, control\)/);
  assert.match(entry, /rowOpenBoard\.open\(target\.agent, control, \(\) => sendOpen\(target\)\)/);
  assert.match(entry, /renderBoard\(document, boardColumns\(view\.sections\), \{ opened, \.\.\.rowOpenOptions \}\)/);
  assert.match(entry, /runOpen\(openControl, \(\) => sendOpen\(target\)\)/, '見出しも同じ送る口');
});

/** media の塊の中の、選び手がちょうど selector の規則の中身。 */
function ruleIn(block: string, selector: string): string {
  const at = block.indexOf(`${selector} {`);
  assert.ok(at >= 0, selector);
  return block.slice(at, block.indexOf('}', at));
}

test('iss-00102 T-03：行の操作の箱は折り返し、390px 以下では行の Open を出さない', () => {
  const css = withoutComments(readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8'));
  const actions = ruleIn(css, '.apexes-page .apex-actions');
  assert.match(actions, /display: flex;/);
  assert.match(actions, /flex-wrap: wrap;/);
  assert.match(actions, /min-width: 0;/);
  // 390px の塊は画面ごとにいくつかあるので、行の Open の規則を持つ塊を探す。
  const tiny = css.split('@media (max-width: 390px) {').slice(1);
  assert.ok(
    tiny.some((block) =>
      /\.apexes-page \.apex-actions \.orca-open \{\s*display: none;/.test(block.split('@media')[0] ?? ''),
    ),
  );
});

test('iss-00102 T-04：900px 以上はページを巻かず、一覧と右のペインがそれぞれの中で巻く', () => {
  const css = withoutComments(readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8'));
  const wide = mediaBlock(css, '(min-width: 900px)');
  const body = ruleIn(wide, 'body.apexes-page');
  for (const decl of ['height: 100dvh;', 'overflow: hidden;', 'display: flex;', 'flex-direction: column;'])
    assert.ok(body.includes(decl), `body: ${decl}`);
  assert.match(ruleIn(wide, 'body.apexes-page > header'), /flex: none;/);
  const layout = ruleIn(wide, '.apexes-page .apex-layout');
  for (const decl of ['flex: 1 1 auto;', 'min-height: 0;', 'grid-template-rows: minmax(0, 1fr);'])
    assert.ok(layout.includes(decl), `layout: ${decl}`);
  const list = ruleIn(wide, '.apexes-page .apex-list');
  for (const decl of ['overflow-y: auto;', 'overscroll-behavior: contain;', 'min-height: 0;'])
    assert.ok(list.includes(decl), `list: ${decl}`);
  const pane = ruleIn(wide, '.apexes-page .apex-pane');
  assert.match(pane, /height: 100%;/);
  assert.doesNotMatch(css, /position: sticky/, '右のペインを sticky にしない');
  assert.doesNotMatch(wide, /100dvh - 32px/);
  const head = ruleIn(wide, '.apexes-page .apex-pane-head');
  assert.match(head, /overflow-y: auto;/);
  assert.match(head, /max-height: 60%;/);
});

test('iss-00104 T-06：900px 未満で選んだときは余白と枠線をなくし 100dvh、見出しの帯の題名は1行で省略', () => {
  const css = withoutComments(readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8'));
  const narrow = mediaBlock(css, '(max-width: 899.98px)');
  assert.match(ruleIn(narrow, 'body.apexes-page.apexes--selected'), /padding: 0;/);
  const pane = ruleIn(narrow, 'body.apexes-page.apexes--selected .apex-pane');
  for (const decl of ['height: 100dvh;', 'border: 0;', 'border-radius: 0;']) assert.ok(pane.includes(decl), decl);
  const title = ruleIn(narrow, '.apexes-page .apex-pane-bar .apex-pane-title');
  for (const decl of ['white-space: nowrap;', 'overflow: hidden;', 'text-overflow: ellipsis;', 'min-width: 0;'])
    assert.ok(title.includes(decl), decl);
  assert.doesNotMatch(css, /100dvh - (?:24|32)px/, '狭い幅の calc の高さは残さない');
  assert.match(ruleIn(css, '.apexes-page .apex-pane-extras[hidden]'), /display: none;/);
});

test('iss-00104 T-05：詳細はチームの帯と対応のカードを1つの欄に入れ、切り替えで開閉を反転し、フォーカスを戻す', () => {
  const entry = read('apexes.js');
  assert.match(entry, /renderPaneExtras\(document, \[team, renderApexCards\(document, cards\)\], open\)/);
  assert.match(entry, /initialExtrasOpen\(window\.matchMedia\(COMPACT_PANE_QUERY\)\.matches\)/);
  assert.match(entry, /\} catch \{\s*extrasOpen = true;/, 'matchMedia の例外では開く');
  assert.match(entry, /extrasOpen = !currentExtrasOpen\(\);\s*renderPane\(\);/);
  assert.match(entry, /renderPaneHead\(document, pane\.header, \{ openRoot: openControl\.root, extras: toggle \}\)/);
  assert.match(entry, /querySelector\('button\[data-action="extras"\]'\)\)\?\.focus\(\)/);
});

test('iss-00112 T-04：900px 以上・選んでいないときだけ、2列目と3列目の左に縦の線を引き、線と中身の間を空ける', () => {
  const css = withoutComments(readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8'));
  const wide = mediaBlock(css, '(min-width: 900px)');
  const rule = ruleIn(wide, 'body.apexes-page:not(.apexes--selected) .apex-column + .apex-column');
  assert.match(rule, /border-left: 1px solid var\(--line\);/);
  assert.match(rule, /padding-left: 16px;/);
  assert.ok(!css.replace(wide, '').includes('.apex-column + .apex-column'), '900px 以上の塊の外では引かない');
});

test('iss-00106 T-04：900px 以上・選んでいないときは3列で右のペインを隠し、列がそれぞれ巻く', () => {
  const css = withoutComments(readFileSync(new URL('../../web/style.css', import.meta.url), 'utf8'));
  const wide = mediaBlock(css, '(min-width: 900px)');
  const not = 'body.apexes-page:not(.apexes--selected)';
  assert.match(ruleIn(wide, `${not} .apex-layout`), /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(ruleIn(wide, `${not} .apex-pane`), /display: none;/);
  const list = ruleIn(wide, `${not} .apex-list`);
  for (const decl of ['display: grid;', 'grid-template-columns: repeat(3, minmax(0, 1fr));', 'overflow: hidden;'])
    assert.ok(list.includes(decl), decl);
  const column = ruleIn(wide, `${not} .apex-column`);
  for (const decl of ['min-height: 0;', 'overflow-y: auto;', 'overscroll-behavior: contain;'])
    assert.ok(column.includes(decl), decl);
  assert.match(ruleIn(wide, `${not} .apex-column > .stage:first-child`), /margin-top: 0;/);
  const entry = read('apexes.js');
  assert.match(
    entry,
    /els\.sections\.replaceChildren\(\.\.\.renderBoard\(document, boardColumns\(view\.sections\), \{ opened, \.\.\.rowOpenOptions \}\)\);/,
  );
});
