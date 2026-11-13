// 木の画面（/runs/<id>）。/api/runs/<id>/tree を 10 秒ごとに読み、統括を根にした節を textContent だけで描く。
// 読めなければ前の内容を残して「更新できない」と示す。Orca で開く、送信の操作は置かない。
import { renderFreshness } from './inbox-dom.js';
import { renderTree } from './runs-dom.js';
import { buildTreeView, runIdFromPath, runTreeApiPath } from './runs-view.js';

const POLL_MS = 10_000;

const els = {
  title: /** @type {HTMLElement} */ (document.querySelector('#run-title')),
  summary: /** @type {HTMLElement} */ (document.querySelector('#summary')),
  freshness: /** @type {HTMLElement} */ (document.querySelector('#freshness')),
  tree: /** @type {HTMLElement} */ (document.querySelector('#tree')),
};

const runId = runIdFromPath(location.pathname);
let lastDoc = null;
let lastError = null;
let gone = false;

function render() {
  if (!runId || gone) {
    const text = runId ? 'この Run はありません' : 'Run の id が読めません';
    els.freshness.replaceChildren(renderFreshness(document, [{ text, kind: 'bad' }]));
    els.tree.replaceChildren();
    return;
  }
  if (!lastDoc) {
    const text = lastError ? `orca-web に接続できない（${lastError}）` : '読み込み中…';
    els.freshness.replaceChildren(renderFreshness(document, [{ text, kind: lastError ? 'bad' : 'info' }]));
    return;
  }
  const view = buildTreeView(lastDoc, { now: Date.now(), error: lastError });
  document.title = `${view.title ?? view.runId} の木`;
  els.title.textContent = `${view.title ?? '—'}（${view.runId}）・統括のプロジェクト：${view.coordinatorProject}`;
  els.summary.textContent = view.summary;
  els.freshness.replaceChildren(renderFreshness(document, view.freshness));
  els.tree.replaceChildren(renderTree(document, view.rows));
}

async function poll() {
  try {
    const res = await fetch(runTreeApiPath(runId), { cache: 'no-store' });
    if (res.status === 404) {
      gone = true;
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    lastDoc = await res.json();
    lastError = null;
    gone = false;
  } catch (error) {
    lastError = error.message;
  } finally {
    render();
    setTimeout(poll, POLL_MS);
  }
}

render();
if (runId) void poll();
