import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LINK_ICONS } from '../../web/embed/agent-marks.js';

const externalPath = 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5';

// 字句としてコメントだけを除く。URL や文字列の中の // は消さない。
function withoutComments(source: string): string {
  return source.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g,
    (token) => (token.startsWith('/') ? ' ' : token),
  );
}

function agentScripts(): Map<string, string> {
  const htmlUrl = new URL('../../web/embed/agent.html', import.meta.url);
  const html = readFileSync(htmlUrl, 'utf8');
  const scripts = new Map<string, string>();
  function visit(url: URL): void {
    if (scripts.has(url.href)) return;
    const source = readFileSync(url, 'utf8');
    scripts.set(url.href, withoutComments(source));
    const code = withoutComments(source);
    // 複数行の import と再輸出、動的 import をたどり、../ の階層も制限しない。
    const imports =
      /^\s*(?:import|export)\s+(?:(?:\{[^}]*\}|\*\s*(?:as\s+\w+)?|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s+from\s*)?['"]([^'"]+)['"]/gm;
    const dynamicImports = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;
    for (const match of [...code.matchAll(imports), ...code.matchAll(dynamicImports)]) {
      const specifier = match[1];
      assert.ok(specifier);
      assert.match(specifier, /^\.\.?\//, `ローカルの import: ${specifier}`);
      visit(new URL(specifier, url));
    }
  }
  for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
    if (!/\btype=["']module["']/.test(tag)) continue;
    const src = tag.match(/\bsrc=["']([^"']+)["']/)?.[1];
    assert.ok(src, 'module の入口の src がある');
    visit(new URL(src, htmlUrl));
  }
  assert.ok(scripts.has(new URL('./agent-frame.js', htmlUrl).href), 'agent-frame.js を入口から読む');
  return scripts;
}

test('T-02：詳細が読む全スクリプトは、iframe 内や親を移す操作を含まない', () => {
  const scripts = agentScripts();
  for (const file of ['../write.js', '../view.js', './elapsed.js']) {
    assert.ok(scripts.has(new URL(`../../web/embed/${file}`, import.meta.url).href), `${file} も推移的に読む`);
  }
  const forbidden =
    /_self|_parent|_top|\blocation\s*(?:\.\s*href\s*)?=(?!=)|\blocation\s*\.\s*(?:assign|replace)\s*\(|\bwindow\s*\.\s*open\s*\(/;
  for (const [file, source] of scripts) assert.doesNotMatch(source, forbidden, file);
  const dom = scripts.get(new URL('../../web/embed/agent-dom.js', import.meta.url).href);
  assert.ok(dom);
  assert.equal([...dom.matchAll(/['"]a['"]/g)].length, 1, 'a を作るのは共通の関数の1か所');
  assert.match(dom, /function newTabLink\(doc, text, href\)/);
});

test('T-03：新しいタブの印は SpecDock の形と線の属性を持ち、出典が1行で残る', () => {
  assert.deepEqual(LINK_ICONS.external, {
    label: '新しいタブで開く',
    viewBox: '0 0 24 24',
    paths: [
      {
        d: externalPath,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '1.9',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
    ],
  });
  const source = readFileSync(new URL('../../web/embed/agent-marks-icons.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /^\/\/ .*spec-dock 67abbe6c1 .*src\/spec_dock\/assets\/dashboard\/core\/ui\.js .*ICONS\.external.*$/m,
  );
  const copies = [...agentScripts().values()].reduce(
    (count, script) => count + script.split(externalPath).length - 1,
    0,
  );
  assert.equal(copies, 1, '印の形は1か所だけ');
});
