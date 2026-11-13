// 試しの画面の読みと DOM。要約を 10 秒ごとに読み（見えない間は読まない）、trial-view.js の組み立てを
// textContent だけで描く。丸を選ぶと詳細とチャットの iframe を開き、節ごとに open-button.js のボタンを置く。
import { buildTrialView, detailUrl, orcaBase } from './trial-view.js';

const POLL_MS = 10_000;
const wide = window.matchMedia('(min-width: 721px)');
const dark = window.matchMedia('(prefers-color-scheme: dark)');

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const sectionsEl = $('sections');
const panel = $('panel');
const panelTitle = $('panel-title');
const panelSlot = $('panel-slot');
const banner = $('banner');
const status = $('status');

let base = '';
let highlight = '';
/** @type {{ sectionKey: string, agentId: string } | null} */
let selected = null;
/** @type {any} */
let view = { banner: null, sections: [] };
/** @type {Map<string, HTMLElement>} 節の要素。読み直しのたびに作り直さず、中の iframe を読み直させない。 */
const nodes = new Map();
/** @type {HTMLIFrameElement | null} */
let frame = null;
let timer = null;

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

function selectedAgent() {
  if (!selected) return null;
  const section = view.sections.find((s) => s.key === selected.sectionKey);
  const agent = section?.agents.find((a) => a.id === selected.agentId);
  return section && agent ? { section, agent } : null;
}

function toggle(section, agent) {
  if (selected && selected.sectionKey === section.key && selected.agentId === agent.id) selected = null;
  else selected = { sectionKey: section.key, agentId: agent.id };
  render();
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

  const counts = el('div', 'counts');
  counts.append(el('span', 'count total', `計 ${section.total}`));
  for (const c of section.counts) counts.append(el('span', `count mark-${c.mark}`, `${c.label} ${c.count}`));
  body.append(counts);

  const dots = el('div', 'dots');
  for (const agent of section.agents) {
    const button = el('button', `dot mark-${agent.mark}`);
    button.type = 'button';
    const isSelected = selected?.sectionKey === section.key && selected?.agentId === agent.id;
    button.setAttribute('aria-pressed', String(isSelected));
    button.append(el('span', 'dot-type', agent.typeLabel), el('span', 'dot-mark', agent.markLabel));
    if (agent.elapsed) button.append(el('span', 'dot-time', agent.elapsed));
    if (!agent.detail || !agent.id) button.disabled = true;
    else button.addEventListener('click', () => toggle(section, agent));
    dots.append(button);
  }
  body.append(dots);
  return body;
}

/** 節の開くボタン。対象か選んだエージェントが変わったときだけ、1行のスクリプトを作り直す。 */
function syncOpenButton(container, section) {
  const agentId = selected?.sectionKey === section.key ? selected.agentId : '';
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
  node.classList.toggle('sel', selected?.sectionKey === section.key);
  node.querySelector('.node-body')?.replaceWith(sectionBody(section));
  syncOpenButton(/** @type {HTMLElement} */ (node.querySelector('.node-open')), section);
  return node;
}

function placeFrame() {
  const target = selectedAgent();
  if (!target) {
    frame?.remove();
    frame = null;
    panel.hidden = true;
    return;
  }
  const theme = dark.matches ? 'dark' : 'light';
  const src = detailUrl(base, target.agent.detail, theme);
  if (!frame || frame.dataset.src !== src) {
    frame?.remove();
    frame = document.createElement('iframe');
    frame.title = `${target.section.name} の ${target.agent.typeLabel}`;
    frame.className = 'agent-frame';
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.style.colorScheme = theme;
    frame.dataset.src = src;
    frame.src = src;
  }
  const slot = wide.matches ? panelSlot : nodes.get(target.section.key)?.querySelector('.node-slot');
  if (slot && frame.parentElement !== slot) slot.append(frame);
  panel.hidden = !wide.matches;
  panelTitle.textContent = `${target.section.name} · ${target.agent.typeLabel} · ${target.agent.markLabel}`;
}

function render() {
  if (selected && !selectedAgent()) selected = null;
  showBanner(view.banner);
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
  placeFrame();
}

async function load() {
  try {
    const res = await fetch(`${base}/api/worktrees/summary`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    view = buildTrialView(await res.json(), { highlight, now: Date.now() });
    status.textContent = `読んだ時刻 ${new Date().toLocaleTimeString('ja-JP')}`;
    render();
  } catch {
    showBanner('要約を読めません（このオリジンが許されていないか、試しの orca-web に届きません）。');
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!document.hidden) await load();
    schedule();
  }, POLL_MS);
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
  wide.addEventListener('change', placeFrame);
  dark.addEventListener('change', placeFrame);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void load().then(schedule);
  });
  await load();
  schedule();
}

void start();
