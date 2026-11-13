// 詳細と会話の行を DOM の要素にする。文字はすべて textContent で入れ、HTML として解かない（innerHTML を使わない）。
// document を受けるので、テストは小さな偽の document で確かめる。
import { MISSING_LABELS } from './agent-view.js';

const defaultTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ja-JP', { hour12: false });
};

function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** 詳細の行の並び（dl）。 */
export function renderDetail(doc, detail) {
  const list = make(doc, 'dl', null, 'detail');
  for (const row of detail.rows) {
    list.append(make(doc, 'dt', row.label));
    const dd = make(doc, 'dd');
    if (row.href) {
      const a = make(doc, 'a', row.text);
      a.href = row.href;
      a.rel = 'noopener noreferrer';
      a.target = row.href.startsWith('/') ? '_self' : '_blank';
      dd.append(a);
    } else {
      dd.textContent = row.text;
    }
    if (row.note) {
      dd.title = MISSING_LABELS[row.note] ?? row.note;
      if (row.text === '—') dd.className = 'missing';
    }
    for (const link of row.links ?? []) {
      const a = make(doc, 'a', link.text);
      a.href = link.href;
      dd.append(make(doc, 'br'), a);
    }
    list.append(dd);
  }
  return list;
}

/** 会話の1行。open は開いていた折り畳みの key の集合。 */
export function renderChatRow(doc, row, options = {}) {
  const formatTime = options.formatTime ?? defaultTime;
  const open = options.open ?? new Set();
  const item = make(doc, 'li', null, `row ${row.kind}${row.role ? ` ${row.role}` : ''}`);
  item.dataset.key = row.key;
  if (row.kind === 'tool') {
    const details = make(doc, 'details', null, row.isError ? 'tool error' : 'tool');
    details.open = open.has(row.key);
    details.append(make(doc, 'summary', `ツール ${row.name ?? '（結果）'}${row.isError ? '（誤り）' : ''}`));
    if (row.input !== null && row.input !== '') {
      details.append(make(doc, 'div', '入力', 'label'), make(doc, 'pre', row.input));
    }
    if (row.output !== null) details.append(make(doc, 'div', '結果', 'label'), make(doc, 'pre', row.output));
    if (row.truncated) details.append(make(doc, 'div', '（長いので切りました）', 'cut'));
    item.append(details);
  } else {
    const body = make(doc, 'div', row.text, row.kind === 'bubble' ? 'bubble' : row.kind);
    item.append(body);
    if (row.truncated) item.append(make(doc, 'div', '（長いので切りました）', 'cut'));
  }
  if (row.at) item.append(make(doc, 'time', formatTime(row.at)));
  return item;
}
