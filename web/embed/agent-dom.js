// 詳細と会話の行と、詳細の見出しの印を DOM の要素にする。文字はすべて textContent で入れ、HTML として解かない（innerHTML を使わない）。
// document を受けるので、テストは小さな偽の document で確かめる。
import { renderAgentMarks } from './agent-marks.js';
import { detailMarkWorktree, MISSING_LABELS } from './agent-view.js';
import { formatElapsed } from './elapsed.js';

/** title に入れる全体の時刻。 */
const fullTime = (iso) => {
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
      const reason = MISSING_LABELS[row.note] ?? row.note;
      dd.title = reason;
      if (row.text === '—') {
        // 取れない理由は、ツールチップのない iPhone でも読めるように文字でも示す。
        dd.className = 'missing';
        dd.append(make(doc, 'span', `（取れない：${reason}）`, 'why'));
      }
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
  const now = options.now ?? Date.now();
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
  // 時刻は短い形（now・Nm・Nh・Nd、D-09）。元の時刻は datetime に、全体の時刻は title に持つ。未来と読めない値は出さない。
  const ago = row.at ? formatElapsed(row.at, now) : null;
  if (ago !== null) {
    const time = make(doc, 'time', ago);
    time.dateTime = row.at;
    time.title = fullTime(row.at);
    item.append(time);
  }
  return item;
}

/** 描いた会話の行の時刻を、now の時刻で描き直す（30 秒ごとに呼ぶ）。 */
export function refreshTimes(root, now) {
  for (const time of root.querySelectorAll('time[datetime]')) {
    const ago = formatElapsed(time.dateTime, now);
    if (ago !== null) time.textContent = ago;
  }
}

/**
 * 詳細の見出しの置き場に、要約の中のこのエージェントだけの印を1つ描く（D-08）。経過の文字は出さない。
 * 見つからない・読めないときは置き場を空にする。
 * @param {any} container 置き場の要素
 * @param {any} summary GET /api/worktrees/summary の文書（読めなければ null）
 * @param {string} agentId
 * @param {{ now?: number }} [options]
 */
export function renderDetailMark(container, summary, agentId, { now = Date.now() } = {}) {
  const worktree = detailMarkWorktree(summary, agentId);
  if (!worktree) {
    container.replaceChildren();
    return;
  }
  renderAgentMarks(container, worktree, { now, size: 'sm', max: 1 });
}
