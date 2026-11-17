// 承認のカード（iss-00050 D-06）を DOM の要素にする。描く物は approval-view.js の buildApprovalCard が決める。
// 文字はすべて textContent で入れ、HTML として解かない（innerHTML も属性の文字列の HTML も使わない）。
// 枠と選択肢は質問のカードの規則（question-card・question-option）を使い、承認の差分だけ approval-* の規則を足す。
// 押しは data 属性（data-action、data-option）で親が受ける。「Orca で開く」は共有の部品 createOpenControl を使う。
// document を受けるので、テストは小さな偽の document で確かめる。
import { DEFAULT_APPROVAL_TITLE } from './approval-view.js';
import { createOpenControl } from './open-control.js';

function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(doc, action, className, disabled) {
  const node = make(doc, 'button', null, className);
  node.type = 'button';
  node.dataset.action = action;
  node.disabled = disabled;
  return node;
}

/** 「見出し：値」の1行。 */
function labeled(doc, label, value, className, mono = false) {
  const line = make(doc, 'p', null, className);
  line.append(make(doc, 'span', `${label}：`, 'approval-label'));
  line.append(make(doc, 'span', value, mono ? 'approval-mono' : null));
  return line;
}

/** 説明、理由、要るパス、計画か detail。 */
function context(doc, view, detailOpen) {
  const box = make(doc, 'div', null, 'approval-context');
  if (view.tool) box.append(labeled(doc, '道具', view.tool, 'approval-tool', true));
  if (view.description) box.append(make(doc, 'p', view.description, 'approval-desc'));
  if (view.reason) box.append(labeled(doc, '理由', view.reason, 'approval-reason'));
  if (view.blockedPath) box.append(labeled(doc, '要るパス', view.blockedPath, 'approval-path', true));
  if (view.plan) {
    const plan = make(doc, 'div', null, 'approval-plan');
    plan.append(make(doc, 'pre', view.plan.text, 'approval-plan-text'));
    if (view.plan.filePath) plan.append(labeled(doc, '計画のファイル', view.plan.filePath, 'approval-path', true));
    box.append(plan);
  } else if (view.detail) {
    if (view.detail.hasMore) {
      const more = make(doc, 'details', null, 'approval-more');
      more.dataset.part = 'detail';
      more.open = detailOpen;
      more.append(make(doc, 'summary', '詳しく', 'approval-more-summary'));
      more.append(make(doc, 'pre', view.detail.full, 'approval-detail'));
      box.append(more);
    }
    box.append(make(doc, 'pre', view.detail.preview, 'approval-detail approval-detail-preview'));
  }
  return box.children.length ? box : null;
}

/** 選択肢の並び。主の選択肢に data-primary。閉じた形は選んだものに印を付ける。 */
function optionList(doc, view) {
  const list = make(doc, 'div', null, 'question-options approval-options');
  view.options.forEach((option, i) => {
    const node = button(doc, 'option', 'question-option', option.disabled);
    node.dataset.option = option.id;
    if (option.primary) node.dataset.primary = 'true';
    node.setAttribute('aria-pressed', option.selected ? 'true' : 'false');
    node.setAttribute('aria-busy', option.busy ? 'true' : 'false');
    node.append(make(doc, 'span', option.selected ? '✓' : String(i + 1), 'question-option-mark'));
    const body = make(doc, 'span', null, 'question-option-body');
    body.append(
      make(doc, 'span', option.busy ? `${option.label}（送っています…）` : option.label, 'question-option-label'),
    );
    if (option.description) body.append(make(doc, 'span', option.description, 'question-option-desc'));
    node.append(body);
    list.append(node);
  });
  return list;
}

/** 題の行。題が既定の言葉なら印だけにする。 */
function head(doc, view, badge) {
  const line = make(doc, 'div', null, 'question-head approval-head');
  line.append(make(doc, 'span', badge, 'question-badge'));
  if (view.title !== DEFAULT_APPROVAL_TITLE) line.append(make(doc, 'p', view.title, 'approval-title'));
  return line;
}

/**
 * buildApprovalCard の形から、カードの要素を作る。openControl は「Orca で開く」の部品（出さないときは null）で、
 * 押したときの流れは呼び手が runOpen でつなぐ。
 * @param {any} doc document
 * @param {ReturnType<typeof import('./approval-view.js').buildApprovalCard>} view
 * @param {{ open?: boolean, detailOpen?: boolean }} [options] open は閉じた形を開いて描くか、detailOpen は「詳しく」を開いて描くか
 * @returns {{ root: any, openControl: import('./open-control.js').OpenControl | null }}
 */
export function renderApprovalCard(doc, view, { open = false, detailOpen = false } = {}) {
  const root = make(doc, 'section', null, `question-card approval-card ${view.closed ? 'closed' : 'pending'}`);
  root.dataset.key = view.key;
  root.dataset.state = view.state;
  root.setAttribute('aria-label', view.title);
  if (view.closed) {
    const details = make(doc, 'details', null, 'question-closed');
    details.open = open;
    const summary = make(doc, 'summary', null, 'question-summary');
    summary.append(make(doc, 'span', view.state === 'cancelled' ? '取り消し' : '答え済み', 'question-badge'));
    summary.append(
      make(doc, 'span', view.tool ? `${view.title}（${view.tool}）` : view.title, 'question-summary-text'),
    );
    const result = make(doc, 'ul', null, 'question-answers');
    result.append(make(doc, 'li', view.summary));
    summary.append(result);
    details.append(summary);
    const body = context(doc, view, detailOpen);
    if (body) details.append(body);
    if (view.options.length) details.append(optionList(doc, view));
    root.append(details);
    if (view.truncated) root.append(make(doc, 'p', '（長いので切りました）', 'cut'));
    return { root, openControl: null };
  }
  root.append(head(doc, view, DEFAULT_APPROVAL_TITLE));
  const body = context(doc, view, detailOpen);
  if (body) root.append(body);
  if (view.truncated) root.append(make(doc, 'p', '（長いので切りました）', 'cut'));
  if (view.options.length) root.append(optionList(doc, view));
  if (view.confirm) {
    const band = make(doc, 'div', null, 'approval-confirm');
    band.dataset.option = view.confirm.optionId;
    band.append(make(doc, 'p', view.confirm.note, 'approval-confirm-note'));
    const actions = make(doc, 'div', null, 'question-actions');
    const yes = button(doc, 'persist-confirm', 'approval-confirm-yes', view.confirm.disabled === true);
    yes.textContent = `${view.confirm.label}で答える`;
    const no = button(doc, 'persist-cancel', 'approval-confirm-no', false);
    no.textContent = 'やめる';
    actions.append(yes, no);
    band.append(actions);
    root.append(band);
  }
  if (view.reasonText) root.append(make(doc, 'p', view.reasonText, 'question-reason'));
  // 端末の許可の確認の、届いたか分からない帯と二度と送らない理由（iss-00054）。照会も閉じるも置かず、「Orca で開く」を足に出す。
  const stop = view.partial
    ? { kind: 'partial', text: view.partial.text }
    : view.blocked
      ? { kind: 'blocked', text: view.blocked.text }
      : null;
  if (stop) {
    const band = make(doc, 'div', null, 'approval-band');
    band.dataset.kind = stop.kind;
    band.setAttribute('role', 'status');
    band.append(make(doc, 'p', stop.text, 'approval-band-text'));
    root.append(band);
  }
  if (view.unknown) {
    const band = make(doc, 'div', null, 'question-unknown');
    band.append(make(doc, 'p', view.unknown.text, 'question-unknown-text'));
    const actions = make(doc, 'div', null, 'question-actions');
    const query = button(doc, 'query', null, view.unknown.busy);
    query.textContent = view.unknown.busy ? '確かめています…' : '確かめる';
    const dismiss = button(doc, 'dismiss', null, view.unknown.busy);
    dismiss.textContent = '閉じる';
    actions.append(query, dismiss);
    band.append(actions);
    root.append(band);
  }
  if (view.notice) {
    const notice = make(doc, 'p', view.notice.text, 'question-notice');
    notice.dataset.kind = view.notice.kind;
    root.append(notice);
  }
  let openControl = null;
  if (view.open) {
    const foot = make(doc, 'div', null, 'question-foot');
    openControl = createOpenControl(doc, { size: 'md' });
    foot.append(openControl.root);
    root.append(foot);
  }
  return { root, openControl };
}
