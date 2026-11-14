// エージェントの詳細とチャットの画面（web/embed/agent.html と agent-frame.js）の静的な形を、ファイルの文字で確かめる（T-13、T-17）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../../web/embed/agent.html', import.meta.url), 'utf8');
const frame = readFileSync(new URL('../../web/embed/agent-frame.js', import.meta.url), 'utf8').replace(
  /\/\/.*$|\/\*[\s\S]*?\*\//gm,
  '',
);

/** id の要素の開きタグ。 */
function openTag(id: string): string {
  const match = new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
  assert.ok(match, `id="${id}" の要素がある`);
  return match[0];
}

test('T-13：詳細の details に open の属性がなく、summary に印の置き場と「詳細」がある', () => {
  const details = openTag('detail-box');
  assert.match(details, /^<details\b/);
  assert.doesNotMatch(details, /\bopen\b/);
  const summary = /<summary\b[^>]*>([\s\S]*?)<\/summary>/.exec(html)?.[1] ?? '';
  assert.match(summary, /<span\b[^>]*\bid="detail-mark"[^>]*><\/span>/);
  assert.doesNotMatch(openTag('detail-mark'), /aria-hidden/);
  assert.match(summary, /詳細/);
});

test('T-13：送る欄に入力欄と送るボタン（aria-label 送る）があり、確認の画面と期限の文がない', () => {
  assert.match(openTag('send-text'), /^<textarea\b/);
  const button = openTag('send-button');
  assert.match(button, /^<button\b/);
  assert.match(button, /\baria-label="送る"/);
  assert.match(button, /\btype="button"/);
  assert.match(openTag('send-panel'), /\baria-live="polite"/);
  assert.doesNotMatch(html, /確認|期限|確かめる/);
});

test('T-13：agent-frame.js は幅で details を開け閉めせず、Enter の鍵と送るボタンで流れの submit を呼ぶ', () => {
  assert.doesNotMatch(frame, /detail-box|detailBox/);
  assert.doesNotMatch(frame, /\.open\s*=[^=]/);
  assert.match(frame, /composerKeyAction\(/);
  assert.match(frame, /addEventListener\('keydown'/);
  assert.match(frame, /\(hover: none\) and \(pointer: coarse\)/);
  assert.match(frame, /sendFlow\.submit\(\)/);
  for (const action of ['query', 'dismiss', 'adopt']) assert.match(frame, new RegExp(`'${action}'`));
  assert.doesNotMatch(frame, /'confirm'|'cancel'|'back'/);
});

test('T-17：agent.html が印の部品の CSS を読み、agent-frame.js が要約を同じオリジンで読んで見出しに描く', () => {
  assert.match(html, /<link rel="stylesheet" href="\.\/agent-marks\.css" \/>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/agent\.css" \/>/);
  assert.ok(html.indexOf('agent-marks.css') < html.indexOf('agent.css'), '印の CSS を先に読む');
  assert.match(frame, /watchWorktreeSummary\(''/);
  assert.match(frame, /renderDetailMark\(/);
});
