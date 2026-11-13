// プロジェクトの画面（/projects/<repo の id>）。上にそのプロジェクトで絞った受け箱（/api/inbox?project=）、
// 下にそのプロジェクトに節がある Run の一覧（/api/runs?project=）を、10 秒ごとに読んで textContent だけで描く。
// 読めなければ前の内容を残して「更新できない」と示す。Orca で開く、送信の操作は置かない（詳細とチャットのリンクだけ）。
import { renderFreshness, renderStage } from './inbox-dom.js';
import { buildInboxView } from './inbox-view.js';
import { renderRunList } from './runs-dom.js';
import { buildRunListView, projectIdFromPath, projectPageApis } from './runs-view.js';

const POLL_MS = 10_000;

const els = {
  name: /** @type {HTMLElement} */ (document.querySelector('#project-name')),
  freshness: /** @type {HTMLElement} */ (document.querySelector('#freshness')),
  inboxFreshness: /** @type {HTMLElement} */ (document.querySelector('#inbox-freshness')),
  stages: /** @type {HTMLElement} */ (document.querySelector('#stages')),
  runs: /** @type {HTMLElement} */ (document.querySelector('#runs')),
};

const project = projectIdFromPath(location.pathname);
const apis = project ? projectPageApis(project) : null;
const inbox = { doc: null, error: null };
const runs = { doc: null, error: null };

function waiting(error) {
  const text = error ? `orca-web に接続できない（${error}）` : '読み込み中…';
  return renderFreshness(document, [{ text, kind: error ? 'bad' : 'info' }]);
}

function render() {
  if (!project) {
    els.freshness.replaceChildren(renderFreshness(document, [{ text: 'プロジェクトの id が読めません', kind: 'bad' }]));
    return;
  }
  if (runs.doc) {
    const view = buildRunListView(runs.doc, { project, error: runs.error });
    const name = view.projectName ?? project;
    els.name.textContent = name;
    document.title = `${name} のプロジェクト`;
    els.freshness.replaceChildren(renderFreshness(document, view.freshness));
    els.runs.replaceChildren(renderRunList(document, view.rows, 'このプロジェクトに節がある Run はありません'));
  } else {
    els.name.textContent = project;
    els.freshness.replaceChildren(waiting(runs.error));
  }
  if (inbox.doc) {
    const view = buildInboxView(inbox.doc, { now: Date.now(), project, error: inbox.error });
    els.inboxFreshness.replaceChildren(renderFreshness(document, view.freshness));
    const expanded = els.stages.querySelector('section[data-stage="finished"] details')?.open === true;
    const options = { showOpen: false, onOpen() {}, expanded };
    els.stages.replaceChildren(...view.stages.map((stage) => renderStage(document, stage, options)));
  } else {
    els.inboxFreshness.replaceChildren(waiting(inbox.error));
  }
}

async function read(path, slot) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    slot.doc = await res.json();
    slot.error = null;
  } catch (error) {
    slot.error = error.message;
  }
}

async function poll() {
  await Promise.all([read(apis.inbox, inbox), read(apis.runs, runs)]);
  render();
  setTimeout(poll, POLL_MS);
}

render();
if (apis) void poll();
