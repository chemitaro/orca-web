// 試しの画面の読みと DOM。試しの orca-web の印の部品（/embed/agent-marks.js と .css）を別のオリジンから読み、
// 部品の watchWorktreeSummary の1つの輪で要約を読む（見えない間は読まない）。同じ文書から、構造の図の箱、
// Issue の一覧の行、worktree の節の見本を描く。文字は textContent だけ。印を選ぶと詳細とチャットの iframe を開き、
// 節ごとに open-button.js のボタンを置く。
import { buildTrialView, detailUrl, orcaBase } from './trial-view.js';

const wide = window.matchMedia('(min-width: 721px)');
const dark = window.matchMedia('(prefers-color-scheme: dark)');

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const boxesEl = $('boxes');
const rowsEl = $('rows');
const sectionsEl = $('sections');
const panel = $('panel');
const panelTitle = $('panel-title');
const panelSlot = $('panel-slot');
const banner = $('banner');
const status = $('status');

let base = '';
let highlight = '';
/** @type {any} 試しの orca-web の部品（agent-marks.js）。 */
let marks = null;
/** @type {any} 最後に読めた要約の文書。 */
let summary = null;
/** @type {{ place: 'box' | 'row' | 'section', key: string, agentId: string, detail: string } | null} */
let selected = null;
/** @type {any} */
let view = { banner: null, sections: [], boxes: [], rows: [] };
/** @type {Map<string, HTMLElement>} 節の要素。読み直しのたびに作り直さず、中の iframe を読み直させない。 */
const nodes = new Map();
/** @type {HTMLIFrameElement | null} */
let frame = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function showBanner(text) {
  banner.hidden = !text;
  banner.textContent = text ?? '';
}

const isSelected = (place, key) => selected?.place === place && selected.key === key;

/** 選んだエージェントの worktree と、部品の組み立ての印（読み上げの名前に使う）。 */
function selectedTarget() {
  if (!selected || !marks) return null;
  const entry = view.sections.find((s) => s.key === selected.key);
  const worktree = entry ? marks.findWorktree(summary, entry.where) : null;
  const agent = Array.isArray(worktree?.agents) ? worktree.agents.find((a) => a?.id === selected.agentId) : null;
  if (!entry || !agent) return null;
  const mark = marks.buildMarks({ agents: [agent] }, { now: Date.now(), max: 1 }).marks[0];
  return { entry, label: mark?.label ?? '' };
}

/** 置き場に印を描く。印を選ぶと、同じ印をもう一度選べば閉じる。 */
function drawMarks(container, place, key, where, size) {
  const worktree = marks.findWorktree(summary, where);
  marks.renderAgentMarks(container, worktree, {
    now: Date.now(),
    size,
    onSelect: ({ id, detail }) => {
      if (!id || !detail) return;
      if (isSelected(place, key) && selected?.agentId === id) selected = null;
      else selected = { place, key, agentId: id, detail };
      render();
    },
  });
}

function renderBoxes() {
  const items = view.boxes.map((box) => {
    const node = el('div', 'box');
    node.classList.toggle('sel', isSelected('box', box.key));
    node.append(el('div', 'box-name', box.name), el('div', 'box-branch mono', box.branch ?? 'ブランチなし'));
    const slot = el('div', 'box-marks');
    drawMarks(slot, 'box', box.key, box.where, 'sm');
    node.append(slot);
    return node;
  });
  boxesEl.replaceChildren(...items);
}

function renderRows() {
  const items = view.rows.map((row) => {
    const node = el('li', 'row');
    node.classList.toggle('sel', isSelected('row', row.key));
    node.append(el('span', 'row-label', row.label));
    const slot = el('span', 'row-marks');
    drawMarks(slot, 'row', row.key, row.where, 'sm');
    node.append(slot);
    return node;
  });
  rowsEl.replaceChildren(...items);
}

function sectionBody(section) {
  const body = el('div', 'node-body');
  const head = el('div', 'node-head');
  head.append(el('span', 'node-name', section.name));
  if (section.highlight) head.append(el('span', 'tag-send', '試しの送り先'));
  body.append(head);

  const meta = el('div', 'node-meta');
  meta.append(el('span', 'mono', section.branch ?? 'ブランチなし'));
  if (section.project) meta.append(el('span', null, section.project));
  body.append(meta);

  // 数の札は色の点と数だけ（文字の状態の名前を出さない）。
  const counts = el('div', 'counts');
  counts.append(el('span', 'count total', `計 ${section.total}`));
  for (const c of section.counts) {
    const chip = el('span', `count count--${c.mark}`);
    chip.append(el('span', 'count-dot'), el('span', null, String(c.count)));
    counts.append(chip);
  }
  body.append(counts);

  const slot = el('div', 'node-marks');
  drawMarks(slot, 'section', section.key, section.where, 'md');
  body.append(slot);
  return body;
}

/** 節の開くボタン。対象か選んだエージェントが変わったときだけ、1行のスクリプトを作り直す。 */
function syncOpenButton(container, section) {
  const agentId = selected?.key === section.key ? selected.agentId : '';
  const key = `${section.openTarget ?? ''}\n${agentId}`;
  if (container.dataset.key === key) return;
  container.dataset.key = key;
  container.replaceChildren();
  if (!section.openTarget) return;
  const script = document.createElement('script');
  script.src = `${base}/embed/open-button.js`;
  script.dataset.worktree = section.openTarget;
  if (agentId) script.dataset.agent = agentId;
  script.dataset.size = 'sm';
  container.append(script);
}

function nodeFor(section) {
  let node = nodes.get(section.key);
  if (!node) {
    node = el('article', 'node');
    node.dataset.key = section.key;
    node.append(el('div', 'node-body'), el('div', 'node-open'), el('div', 'slot node-slot'));
    nodes.set(section.key, node);
  }
  node.classList.toggle('highlight', section.highlight);
  node.classList.toggle('sel', isSelected('section', section.key));
  node.querySelector('.node-body')?.replaceWith(sectionBody(section));
  syncOpenButton(/** @type {HTMLElement} */ (node.querySelector('.node-open')), section);
  return node;
}

function renderSections() {
  const keys = new Set(view.sections.map((s) => s.key));
  for (const [key, node] of nodes) {
    if (!keys.has(key)) {
      node.remove();
      nodes.delete(key);
    }
  }
  const ordered = view.sections.map(nodeFor);
  const current = [...sectionsEl.children];
  // 並びが変わったときだけ動かす（動かすと中の iframe が読み直しになる）。
  if (ordered.length !== current.length || ordered.some((node, i) => node !== current[i])) {
    sectionsEl.replaceChildren(...ordered);
  }
  if (ordered.length === 0) sectionsEl.replaceChildren(el('p', 'note', 'エージェントのいる worktree はありません。'));
}

/** 狭い幅では、選んだ見本の下に開く。 */
function narrowSlot(place, key) {
  if (place === 'box') return $('boxes-slot');
  if (place === 'row') return $('rows-slot');
  return nodes.get(key)?.querySelector('.node-slot');
}

function placeFrame() {
  const target = selectedTarget();
  if (!target || !selected) {
    frame?.remove();
    frame = null;
    panel.hidden = true;
    return;
  }
  const theme = dark.matches ? 'dark' : 'light';
  const src = detailUrl(base, selected.detail, theme);
  const title = `${target.entry.name} · ${target.label}`;
  if (!frame || frame.dataset.src !== src) {
    frame?.remove();
    frame = document.createElement('iframe');
    frame.title = title;
    frame.className = 'agent-frame';
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.style.colorScheme = theme;
    frame.dataset.src = src;
    frame.src = src;
  }
  const slot = wide.matches ? panelSlot : narrowSlot(selected.place, selected.key);
  if (slot && frame.parentElement !== slot) slot.append(frame);
  panel.hidden = !wide.matches;
  panelTitle.textContent = title;
}

function render() {
  if (selected && !selectedTarget()) selected = null;
  showBanner(view.banner);
  renderBoxes();
  renderRows();
  renderSections();
  placeFrame();
}

/** 試しの orca-web の部品の CSS と JS を読む。CSS は <link>、JS は動的な import。 */
async function loadParts() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${base}/embed/agent-marks.css`;
  document.head.append(link);
  return import(`${base}/embed/agent-marks.js`);
}

async function start() {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    const config = await res.json();
    if (!Number.isInteger(config?.orcaPort)) throw new Error('orcaPort');
    base = orcaBase(location.hostname, config.orcaPort);
    highlight = typeof config.highlight === 'string' ? config.highlight : '';
  } catch {
    showBanner('試しの設定（config.json）を読めません。');
    return;
  }
  try {
    marks = await loadParts();
  } catch {
    showBanner(
      '印の部品（/embed/agent-marks.js）を読めません（このオリジンが許されていないか、試しの orca-web に届きません）。',
    );
    return;
  }
  wide.addEventListener('change', placeFrame);
  dark.addEventListener('change', placeFrame);
  marks.watchWorktreeSummary(base, {
    onDocument: (doc) => {
      summary = doc;
      view = buildTrialView(doc, { highlight });
      status.textContent = `読んだ時刻 ${new Date().toLocaleTimeString('ja-JP')}`;
      render();
    },
    // 読めないときは帯で示すだけで、前の描画を消さない。
    onError: () => {
      showBanner('要約を読めません（このオリジンが許されていないか、試しの orca-web に届きません）。');
    },
  });
}

void start();
