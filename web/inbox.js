// 受け箱の画面。/api/inbox を 10 秒ごとに読み、段に分けた項目を textContent だけで描く。
// プロジェクトの選択は ?project= に残す（history.replaceState）。読めなければ前の内容を残して「更新できない」と示す。
// 「Orca で開く」は共有の部品（embed/open-control.js）で、write.js の短期のトークンで /api/open を呼ぶ。幅 390px 以下では出さない。

import { createOpenBoard } from './embed/open-control.js';
import { renderFreshness, renderStage } from './inbox-dom.js';
import { buildInboxView, inboxApiPath, projectFromSearch, searchForProject } from './inbox-view.js';
import { inboxLinks } from './runs-view.js';
import { createWriter } from './write.js';

const POLL_MS = 10_000;
const narrow = window.matchMedia('(max-width: 390px)');
const writer = createWriter();

const els = {
  project: /** @type {HTMLSelectElement} */ (document.querySelector('#project')),
  freshness: /** @type {HTMLElement} */ (document.querySelector('#freshness')),
  stages: /** @type {HTMLElement} */ (document.querySelector('#stages')),
  projectLink: /** @type {HTMLAnchorElement} */ (document.querySelector('#project-link')),
};

let project = projectFromSearch(location.search);
let lastDoc = null;
let lastError = null;
let timer = null;
/** 開くボタンの最後の状態（エージェントの id ごと）。描き直しで作り直した部品に戻し、最後の要求の結果だけを写す。 */
const openBoard = createOpenBoard();

function mountOpen(target, control) {
  openBoard.mount(target.agentId, control);
}

function openInOrca(target, control) {
  void openBoard.open(target.agentId, control, () =>
    writer.send('/api/open', 'POST', { worktree: target.worktreeId, agent: target.agentId }),
  );
}

/** 見出しのプロジェクトの画面へのリンクを、選んだプロジェクトに合わせる（選んでいなければ隠す）。 */
function renderLinks() {
  const link = inboxLinks(project).find((l) => l.href.startsWith('/projects/'));
  els.projectLink.hidden = !link;
  if (link) els.projectLink.href = link.href;
}

function render() {
  renderLinks();
  if (!lastDoc) {
    const text = lastError ? `orca-web に接続できない（${lastError}）` : '読み込み中…';
    els.freshness.replaceChildren(renderFreshness(document, [{ text, kind: lastError ? 'bad' : 'info' }]));
    return;
  }
  const view = buildInboxView(lastDoc, { now: Date.now(), project, error: lastError });
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

  const expanded = els.stages.querySelector('section[data-stage="finished"] details')?.open === true;
  const options = { showOpen: !narrow.matches, onOpen: openInOrca, onOpenMount: mountOpen, expanded };
  els.stages.replaceChildren(...view.stages.map((stage) => renderStage(document, stage, options)));
}

async function poll() {
  clearTimeout(timer);
  const asked = project;
  try {
    const res = await fetch(inboxApiPath(asked), { cache: 'no-store' });
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

narrow.addEventListener('change', render);

render();
void poll();
