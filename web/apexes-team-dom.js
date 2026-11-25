// 指揮の画面の「チームの帯」（iss-00079 D-02）を DOM の要素にする。組み立ては apexes-team-view.js の buildTeamBand。
// 文字はすべて textContent で入れ、HTML として解かない（innerHTML を使わない）。開閉は <details>。
// 履歴の帯の四角は button（data-team-target）で、押すと revealTeamNode がまとめを開いてその節を返す。
import { newTabLink } from './apexes-dom.js';

/** 字下げの段の上限（それより深い節は同じ字下げ）。 */
const DEPTH_MAX = 6;

function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function depthClass(depth) {
  return `team-depth-${Math.min(Math.max(Number(depth) || 1, 1), DEPTH_MAX)}`;
}

function renderNode(doc, row) {
  const li = make(doc, 'li', null, `team-node ${depthClass(row.depth)}`);
  li.dataset.teamKey = row.key;
  li.append(make(doc, 'span', row.statusLabel, `team-mark team-mark--${row.status}`));
  li.append(row.href ? newTabLink(doc, row.href, row.title, 'team-title') : make(doc, 'span', row.title, 'team-title'));
  if (row.elapsed) li.append(make(doc, 'span', row.elapsed, 'team-elapsed'));
  return li;
}

function renderRows(doc, rows, openGroups) {
  const ul = make(doc, 'ul', null, 'team-tree');
  for (const row of rows) {
    if (row.type !== 'group') {
      ul.append(renderNode(doc, row));
      continue;
    }
    // 字下げはまとめの見出しだけに付ける（中の行は節の深さで置く）。
    const li = make(doc, 'li', null, 'team-group');
    const details = make(doc, 'details');
    details.dataset.teamGroup = row.key;
    details.open = openGroups.has(row.key);
    details.append(make(doc, 'summary', row.label, depthClass(row.depth)), renderRows(doc, row.rows, openGroups));
    li.append(details);
    ul.append(li);
  }
  return ul;
}

/**
 * 帯を描く。band が null（チームのない頂点）なら null。state は readTeamState の結果（開いた帯とまとめ）。
 * @param {any} doc
 * @param {any} band buildTeamBand の結果
 * @param {{ open?: boolean, groups?: string[] }} [state]
 */
export function renderTeamBand(doc, band, state = {}) {
  if (!band) return null;
  const root = make(doc, 'details', null, 'team-band');
  root.dataset.teamBand = 'true';
  root.open = state.open === true;
  const body = make(doc, 'div', null, 'team-body');
  const history = make(doc, 'div', null, 'team-history');
  for (const cell of band.history) {
    const button = make(doc, 'button', null, `team-cell team-cell--${cell.status}`);
    button.type = 'button';
    button.dataset.teamTarget = cell.target;
    button.title = cell.label;
    button.setAttribute('aria-label', cell.label);
    history.append(button);
  }
  body.append(history, renderRows(doc, band.rows, new Set(state.groups ?? [])));
  root.append(make(doc, 'summary', band.summary, 'team-summary'), body);
  return root;
}

function children(node) {
  return node?.children ? [...node.children] : [];
}

function isDetails(node) {
  return String(node.tagName).toUpperCase() === 'DETAILS';
}

/** 帯の開閉の状態（描き直しの前に読む）。帯がなければ閉じた状態。 */
export function readTeamState(root) {
  if (!root) return { open: false, groups: [] };
  const groups = [];
  const visit = (node) => {
    for (const child of children(node)) {
      if (isDetails(child) && child.dataset?.teamGroup !== undefined && child.open)
        groups.push(child.dataset.teamGroup);
      visit(child);
    }
  };
  visit(root);
  return { open: root.open === true, groups };
}

/** 鍵の節を探し、帯とその上のまとめをすべて開いて、その要素を返す（なければ null で何も開かない）。 */
export function revealTeamNode(root, key) {
  if (!root) return null;
  const find = (node, path) => {
    for (const child of children(node)) {
      if (child.dataset?.teamKey === key) return { found: child, path };
      const next = find(child, isDetails(child) ? [...path, child] : path);
      if (next) return next;
    }
    return null;
  };
  const hit = find(root, [root]);
  if (!hit) return null;
  for (const details of hit.path) details.open = true;
  return hit.found;
}
