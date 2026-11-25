// 指揮の画面（/apexes）。/api/apexes を 10 秒ごとに読み（輪は apexes-dom.js の startApexPolling）、
// 頂点を段に分けて textContent だけで描く。画面が隠れている間は読まず、見えたらすぐ読み直す。
// ?project= があればその repo に絞る。読めなければ前の内容を残して「更新できない」と示す。
import { renderHeadline, renderSection, startApexPolling } from './apexes-dom.js';
import { apexesApiPath, apexesTitle, buildApexesView } from './apexes-view.js';
import { renderFreshness } from './inbox-dom.js';
import { projectFromSearch } from './inbox-view.js';

const POLL_MS = 10_000;

const els = {
  counts: /** @type {HTMLElement} */ (document.querySelector('#counts')),
  freshness: /** @type {HTMLElement} */ (document.querySelector('#freshness')),
  sections: /** @type {HTMLElement} */ (document.querySelector('#sections')),
};

const project = projectFromSearch(location.search);
let lastDoc = null;
let lastError = null;

function render() {
  if (!lastDoc) {
    const text = lastError ? `orca-web に接続できない（${lastError}）` : '読み込み中…';
    els.freshness.replaceChildren(renderFreshness(document, [{ text, kind: lastError ? 'bad' : 'info' }]));
    document.title = apexesTitle(0);
    return;
  }
  const view = buildApexesView(lastDoc, { now: Date.now(), error: lastError });
  document.title = view.title;
  els.counts.replaceChildren(renderHeadline(document, view.headline));
  els.freshness.replaceChildren(renderFreshness(document, view.freshness));
  // 畳んだ段を利用者が開いていたら、描き直しても開いたままにする。
  const opened = new Set(
    [...els.sections.querySelectorAll('section[data-stage] details[open]')].map(
      (details) => details.closest('section')?.dataset.stage,
    ),
  );
  els.sections.replaceChildren(
    ...view.sections.map((section) => renderSection(document, section, { expanded: opened.has(section.key) })),
  );
}

/** 1回の読み。輪が新しい読みを始めていたら（isCurrent が偽）、古い結果で描かない。 */
async function load(isCurrent) {
  try {
    const res = await fetch(apexesApiPath(project), { cache: 'no-store' });
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

render();
startApexPolling({ doc: document, load, delayMs: POLL_MS });
