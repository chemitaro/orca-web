// 受け箱の画面。/api/inbox を 10 秒ごとに読み、段に分けた項目を textContent だけで描く。
// プロジェクトの選択は ?project= に残す（history.replaceState）。読めなければ前の内容を残して「更新できない」と示す。
// 「Orca で開く」は write.js の短期のトークンで /api/open を呼ぶ。幅 390px 以下では出さない。
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

const OPEN_MESSAGES = {
  busy: 'ほかの開く処理が動いています',
  worktree_not_found: 'Orca にこの worktree がありません',
  target_gone: 'タブが閉じられていました',
  unavailable: 'Orca につながりません',
  runtime_changed: 'Orca が再起動しました。もう一度押してください',
  unsupported: 'この Orca の版では開けません',
  unknown_shape: 'Orca の応答を読めません',
  orca_error: 'Orca が誤りを返しました',
  unconfirmed: '開いたか確かめられません',
};

let project = projectFromSearch(location.search);
let lastDoc = null;
let lastError = null;
let timer = null;
/** 開く口の結果の文（項目の key ごと）。描き直しても残す。 */
const openNotes = new Map();

async function openInOrca(target, status, button) {
  button.disabled = true;
  status.textContent = '開いています…';
  let text;
  try {
    const { status: code, body } = await writer.send('/api/open', 'POST', {
      worktree: target.worktreeId,
      agent: target.agentId,
    });
    text = body.ok === true ? '開きました' : (OPEN_MESSAGES[body.error] ?? `開けません（${code}）`);
  } catch (error) {
    text = `開けません（${error.message}）`;
  }
  openNotes.set(target.agentId, text);
  status.textContent = text;
  button.disabled = false;
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
  const options = { showOpen: !narrow.matches, onOpen: openInOrca, expanded };
  els.stages.replaceChildren(...view.stages.map((stage) => renderStage(document, stage, options)));
  for (const li of els.stages.querySelectorAll('li.item')) {
    const note = openNotes.get(li.dataset.agent);
    const status = li.querySelector('.open-status');
    if (note && status) status.textContent = note;
  }
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
