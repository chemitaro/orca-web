// 指揮の画面（/apexes）の段と行を DOM の要素にする。文字はすべて textContent で入れ、HTML として解かない
// （innerHTML を使わない）。SVG は部品（agent-marks.js）の createElementNS だけ。document を受けるので、
// テストは小さな偽の document で確かめる。見えない間は読まないポーリングの輪 startApexPolling もここに置く。
import { AGENT_ICONS, appIcon, stateIcon } from './embed/agent-marks.js';
import { createPollLoop } from './poll-loop.js';

function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** 見出しの数（対応が必要・作業中・完了）。 */
export function renderHeadline(doc, headline) {
  const box = make(doc, 'p', null, 'apex-counts');
  for (const part of headline) {
    const span = make(doc, 'span', part.text, 'count');
    span.dataset.key = part.key;
    box.append(span);
  }
  return box;
}

/** 1つの行。行の全体が /embed/agent?id= を新しいタブで開くリンク。 */
export function renderRow(doc, row) {
  const li = make(doc, 'li', null, 'item apex');
  li.dataset.key = row.key;
  const a = make(doc, 'a', null, 'apex-link');
  a.href = row.href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';

  const head = make(doc, 'div', null, 'apex-head');
  const icon = make(doc, 'span', null, 'apex-icon');
  icon.append(appIcon(doc, row.icon, undefined, AGENT_ICONS));
  head.append(icon);
  const mark = make(doc, 'span', null, `apex-mark apex-mark--${row.mark}`);
  if (row.monitoring) mark.append(stateIcon(doc, 'monitoring', 'state-icon'));
  mark.append(make(doc, 'span', row.markLabel));
  head.append(mark, make(doc, 'span', row.title, 'apex-title'));
  a.append(head);

  const meta = make(doc, 'div', null, 'meta');
  meta.append(make(doc, 'span', row.project ?? 'プロジェクト不明', row.project ? 'project' : 'project missing'));
  if (row.issue) meta.append(make(doc, 'span', row.issue, 'issue'));
  if (row.agentType) meta.append(make(doc, 'span', row.agentType, 'agent'));
  if (row.members) {
    const members = make(doc, 'span', `配下 ${row.members}`, 'members');
    members.title = row.membersLabel ?? '';
    meta.append(members);
  }
  if (row.elapsed) meta.append(make(doc, 'span', row.elapsed, 'elapsed'));
  a.append(meta);

  if (row.reasons.length > 0 || row.tags.length > 0) {
    const chips = make(doc, 'p', null, 'reason');
    for (const text of row.reasons) chips.append(make(doc, 'span', text, 'chip'));
    for (const text of row.tags) chips.append(make(doc, 'span', text, 'chip tag'));
    a.append(chips);
  }
  li.append(a);
  return li;
}

/** 1つの段。collapsed の段は details で畳み、expanded なら開いて描く。 */
export function renderSection(doc, section, { expanded = false } = {}) {
  const node = make(doc, 'section', null, 'stage');
  node.dataset.stage = section.key;
  const heading = `${section.title}（${section.count}）`;
  const body = [];
  if (section.rows.length === 0) body.push(make(doc, 'p', 'なし', 'empty'));
  else {
    const ul = make(doc, 'ul', null, 'items');
    for (const row of section.rows) ul.append(renderRow(doc, row));
    body.push(ul);
  }
  if (section.collapsed) {
    const details = make(doc, 'details');
    details.open = expanded === true;
    details.append(make(doc, 'summary', heading), ...body);
    node.append(details);
  } else {
    node.append(make(doc, 'h2', heading), ...body);
  }
  return node;
}

/**
 * 間隔ごとに load を呼ぶ輪（poll-loop.js）。画面が隠れたら予約を取り消し、隠れている間は次を予約しない。
 * 見えたらすぐ読み直す。最初から隠れていれば、見えるまで読まない。
 * @param {{ doc: any, load: (isCurrent: () => boolean) => Promise<void>, delayMs: number,
 *   setTimer?: (fn: () => void, ms: number) => any, clearTimer?: (id: any) => void }} options
 * @returns {{ restart: () => void, stop: () => void }}
 */
export function startApexPolling({
  doc,
  load,
  delayMs,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}) {
  let timer = null;
  let stopped = false;
  const clear = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const loop = createPollLoop({
    load,
    schedule: (fn, ms) => {
      if (stopped || doc.hidden) return null;
      timer = setTimer(() => {
        timer = null;
        fn();
      }, ms);
      return timer;
    },
    cancel: clear,
    delayMs,
  });
  const onVisibility = () => {
    if (doc.hidden) clear();
    else if (!stopped) loop.restart();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  if (!doc.hidden) loop.restart();
  return {
    restart() {
      if (!stopped) loop.restart();
    },
    stop() {
      stopped = true;
      clear();
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
