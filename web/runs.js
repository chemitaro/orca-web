// Run の一覧の画面（/runs）。/api/runs を 10 秒ごとに読み、各 Run から木の画面へ進める。
// プロジェクトの選択は ?project= に残す（history.replaceState）。読めなければ前の内容を残して「更新できない」と示す。
import { renderFreshness } from './inbox-dom.js';
import { projectFromSearch, searchForProject } from './inbox-view.js';
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
let timer = null;

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

async function poll() {
  clearTimeout(timer);
  const asked = project;
  try {
    const res = await fetch(runsApiPath(asked), { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const doc = await res.json();
    // 読む間に選択が変わったら、古い選択の結果で描かない。
    if (asked === project) {
      lastDoc = doc;
      lastError = null;
    }
  } catch (error) {
    lastError = error.message;
  } finally {
    render();
    timer = setTimeout(poll, POLL_MS);
  }
}

els.project.addEventListener('change', () => {
  project = els.project.value || null;
  history.replaceState(null, '', `${location.pathname}${searchForProject(location.search, project)}${location.hash}`);
  void poll();
});

render();
void poll();
