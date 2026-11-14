// 受け箱の段と項目を DOM の要素にする。文字はすべて textContent で入れ、HTML として解かない（innerHTML を使わない）。
// document を受けるので、テストは小さな偽の document で確かめる。
import { stateIcon } from './embed/agent-marks.js';

function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** 新しい画面で開くリンク。 */
function link(doc, text, href) {
  const a = make(doc, 'a', text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** 鮮度と読めない部分の文。 */
export function renderFreshness(doc, lines) {
  const box = make(doc, 'div', null, 'freshness');
  for (const line of lines) box.append(make(doc, 'p', line.text, line.kind));
  return box;
}

/**
 * 1つの項目。showOpen のときだけ「Orca で開く」を置き、押すと onOpen(target, status, button) を呼ぶ。
 * 許可の承認、返事、送信の操作は置かない。
 */
export function renderItem(doc, item, options) {
  const li = make(doc, 'li', null, 'item');
  li.dataset.key = item.key;
  const meta = make(doc, 'div', null, 'meta');
  if (item.kindLabel) meta.append(make(doc, 'span', item.kindLabel, 'kind'));
  meta.append(make(doc, 'span', item.project ?? 'プロジェクト不明', item.project ? 'project' : 'project missing'));
  if (item.issue) meta.append(make(doc, 'span', item.issue, 'issue'));
  if (item.agentType) meta.append(make(doc, 'span', item.agentType, 'agent'));
  if (item.elapsed) meta.append(make(doc, 'span', item.elapsed, 'elapsed'));
  li.append(meta);
  if (item.lastWords) li.append(make(doc, 'p', item.lastWords, 'words'));
  const why = make(doc, 'p', null, 'reason');
  // monitoring の電気の印（SVG は createElementNS、aria-hidden。意味は続く文字が持つ）。
  if (item.monitoring) why.append(stateIcon(doc, 'monitoring', 'state-icon'));
  if (item.reason) why.append(make(doc, 'span', item.reason));
  if (item.missing) why.append(make(doc, 'span', `欠けた根拠：${item.missing}`, 'missing'));
  if (item.hint) why.append(make(doc, 'span', item.hint, 'hint'));
  if (item.reason || item.missing || item.hint) li.append(why);

  const actions = make(doc, 'div', null, 'actions');
  if (item.detailHref) actions.append(link(doc, '詳細とチャット', item.detailHref));
  if (item.prHref) actions.append(link(doc, 'PR', item.prHref));
  if (options.showOpen && item.open) {
    const button = make(doc, 'button', 'Orca で開く', 'open');
    button.type = 'button';
    const status = make(doc, 'span', null, 'open-status');
    const target = item.open;
    li.dataset.agent = target.agentId;
    button.addEventListener('click', () => options.onOpen(target, status, button));
    actions.append(button, status);
  }
  if (actions.children.length > 0) li.append(actions);
  return li;
}

/** 1つの段。collapsed の段は details で畳み、expanded なら開いて描く。 */
export function renderStage(doc, stage, options) {
  const section = make(doc, 'section', null, 'stage');
  section.dataset.stage = stage.stage;
  const heading = `${stage.title}（${stage.count}）`;
  const body = [];
  if (stage.note) body.push(make(doc, 'p', stage.note, 'note warn'));
  if (stage.items.length === 0) {
    // 読めていない段に「なし」と出すと空と読めるので、注記があれば出さない。
    if (!stage.note) body.push(make(doc, 'p', 'なし', 'empty'));
  } else {
    const list = make(doc, 'ul', null, 'items');
    for (const item of stage.items) list.append(renderItem(doc, item, options));
    body.push(list);
  }
  if (stage.collapsed) {
    const details = make(doc, 'details');
    details.open = options.expanded === true;
    details.append(make(doc, 'summary', heading), ...body);
    section.append(details);
  } else {
    section.append(make(doc, 'h2', heading), ...body);
  }
  return section;
}
