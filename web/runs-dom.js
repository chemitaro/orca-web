// 木の行と Run の一覧の行を DOM の要素にする。文字はすべて textContent で入れ、HTML として解かない（innerHTML を使わない）。
// リンクの href は runs-view.js が組んだ /runs/<id> と、決めた形の /embed/agent?id=… だけ。
import { stateIcon } from './embed/agent-marks.js';

function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** 「名前：値」の小さな欄。 */
function fact(doc, label, value) {
  const span = make(doc, 'span', null, 'fact');
  span.append(make(doc, 'span', label, 'label'), make(doc, 'span', value, 'value'));
  return span;
}

/** 状態の欄。monitoring なら文字の前に電気の印（SVG は createElementNS、aria-hidden）。 */
function stateFact(doc, row) {
  if (!row.monitoring) return fact(doc, '状態', row.state);
  const span = make(doc, 'span', null, 'fact');
  const value = make(doc, 'span', null, 'value');
  value.append(stateIcon(doc, 'monitoring', 'state-icon'), make(doc, 'span', row.state));
  span.append(make(doc, 'span', '状態', 'label'), value);
  return span;
}

/** 木の1つの節。字下げは CSS の変数 --depth で持つ（style の属性は書かない）。 */
export function renderTreeRow(doc, row) {
  const li = make(doc, 'li', null, 'node');
  li.dataset.key = row.key;
  li.dataset.role = row.role;
  li.style.setProperty('--depth', String(row.depth));

  const head = make(doc, 'div', null, 'meta');
  head.append(make(doc, 'span', row.roleLabel, 'role'));
  if (row.coordinatorNote) head.append(make(doc, 'small', row.coordinatorNote));
  head.append(make(doc, 'span', row.issue, 'issue'));
  head.append(make(doc, 'span', row.project, 'project-name'));
  if (row.badge) head.append(make(doc, 'span', row.badge, 'badge'));
  if (row.orphan) head.append(make(doc, 'span', row.orphan, 'orphan'));
  li.append(head);

  li.append(make(doc, 'p', row.title, 'title'));

  const facts = make(doc, 'div', null, 'facts');
  facts.append(
    fact(doc, '種類', row.agentType),
    fact(doc, 'モデル', row.model),
    fact(doc, '推論', row.effort),
    stateFact(doc, row),
    fact(doc, '経過', row.elapsed),
  );
  li.append(facts);

  if (row.detailHref) {
    const actions = make(doc, 'div', null, 'actions');
    const a = make(doc, 'a', '詳細とチャット');
    a.href = row.detailHref;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    actions.append(a);
    li.append(actions);
  }
  return li;
}

/** 木の全体。 */
export function renderTree(doc, rows) {
  const ul = make(doc, 'ul', null, 'tree');
  for (const row of rows) ul.append(renderTreeRow(doc, row));
  return ul;
}

/** Run の一覧の1行。題名から木の画面へ進む。 */
export function renderRunRow(doc, row) {
  const li = make(doc, 'li', null, 'run');
  li.dataset.key = row.key;
  const title = make(doc, 'p', null, 'title');
  const a = make(doc, 'a', row.title);
  a.href = row.href;
  title.append(a);
  li.append(title);

  const meta = make(doc, 'div', null, 'meta');
  meta.append(make(doc, 'span', row.coordinator, 'coordinator'));
  if (row.from) meta.append(make(doc, 'span', row.from, 'from'));
  li.append(meta);

  const projects = make(doc, 'div', null, 'projects');
  for (const name of row.projects) projects.append(make(doc, 'span', name, 'chip'));
  li.append(projects);

  const counts = make(doc, 'div', null, 'counts');
  counts.append(make(doc, 'span', row.workers), make(doc, 'span', row.active));
  li.append(counts);
  return li;
}

/** Run の一覧。行がなければ empty の文を出す。 */
export function renderRunList(doc, rows, empty) {
  if (rows.length === 0) return make(doc, 'p', empty, 'empty');
  const ul = make(doc, 'ul', null, 'runs');
  for (const row of rows) ul.append(renderRunRow(doc, row));
  return ul;
}
