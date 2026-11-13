// Run の一覧の画面（/runs）。/api/runs を 10 秒ごとに読み（輪は poll-loop.js で1本に保つ）、各 Run から木の画面へ進める。
// プロジェクトの選択は ?project= に残す（history.replaceState）。読めなければ前の内容を残して「更新できない」と示す。
import { renderFreshness } from './inbox-dom.js';
import { projectFromSearch, searchForProject } from './inbox-view.js';
import { createPollLoop } from './poll-loop.js';
import { renderRunList } from './runs-dom.js';
import { buildRunListView, projectHref, runsApiPath } from './runs-view.js';

const POLL_MS = 10_000;

const els = {
  project: /** @type {HTMLSelectElement} */ (document.querySelector('#project')),
  projectLink: /** @type {HTMLAnchorElement} */ (document.querySelector('#project-link')),
  freshness: /** @type {HTMLElement} */ (document.querySelector('#freshness')),
  runs: /** @type {HTMLElement} */ (document.querySelector('#runs')),
};

let project = projectFromSearch(location.search);
let lastDoc = null;
let lastError = null;

function render() {
  els.projectLink.hidden = !project;
  if (project) els.projectLink.href = projectHref(project);
  if (!lastDoc) {
    const text = lastError ? `orca-web に接続できない（${lastError}）` : '読み込み中…';
    els.freshness.replaceChildren(renderFreshness(document, [{ text, kind: lastError ? 'bad' : 'info' }]));
    return;
  }
  const view = buildRunListView(lastDoc, { project, error: lastError });
  els.freshness.replaceChildren(renderFreshness(document, view.freshness));
  els.project.replaceChildren(
    ...view.projects.map((p) => {
      const option = document.createElement('option');
      option.value = p.value;
      option.textContent = p.label;
      option.selected = p.selected;
      return option;
    }),
  );
  els.runs.replaceChildren(renderRunList(document, view.rows, 'Run はありません'));
}

/** 1回の読み。読む間に選び直されたら（isCurrent が偽）、古い選択の結果で描かない。 */
async function load(isCurrent) {
  const asked = project;
  try {
    const res = await fetch(runsApiPath(asked), { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const doc = await res.json();
    if (!isCurrent()) return;
    lastDoc = doc;
    lastError = null;
  } catch (error) {
    if (!isCurrent()) return;
    lastError = error.message;
  }
  render();
}

const loop = createPollLoop({
  load,
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (timer) => clearTimeout(timer),
  delayMs: POLL_MS,
});

els.project.addEventListener('change', () => {
  project = els.project.value || null;
  history.replaceState(null, '', `${location.pathname}${searchForProject(location.search, project)}${location.hash}`);
  loop.restart();
});

render();
loop.restart();
