// 送る欄の動く部分（理由と知らせ、確認の画面、結果、ボタン）を DOM の要素にする（D-10）。
// 文字はすべて textContent で入れ、HTML として解かない（innerHTML も属性の文字列も使わない）。
// document を受けるので、テストは小さな偽の document で確かめる。

function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/**
 * buildSendView の形から、送る欄の動く部分を作る。ボタンは data-action で押されたものを示す。
 * @param {Document | { createElement: (tag: string) => any }} doc
 * @param {ReturnType<typeof import('./send-view.js').buildSendView>} view
 */
export function renderSendPanel(doc, view) {
  const panel = make(doc, 'div', null, `send-panel ${view.phase}`);
  if (view.message) {
    const message = make(doc, 'p', view.message.text, 'send-message');
    message.dataset.kind = view.message.kind;
    panel.append(message);
  }
  if (view.confirm) {
    const box = make(doc, 'div', null, 'send-confirm');
    box.append(make(doc, 'p', 'この宛先に、この本文を送ります。', 'send-heading'));
    const list = make(doc, 'dl', null, 'detail send-target');
    for (const row of view.confirm.rows) list.append(make(doc, 'dt', row.label), make(doc, 'dd', row.text));
    box.append(list, make(doc, 'div', view.confirm.text, 'send-text'));
    if (view.confirm.expires) box.append(make(doc, 'p', view.confirm.expires, 'send-expires'));
    panel.append(box);
  }
  if (view.result) {
    const box = make(doc, 'div', null, 'send-result');
    const outcome = make(doc, 'p', view.result.label, 'send-outcome');
    outcome.dataset.outcome = view.result.outcome;
    box.append(outcome);
    if (view.result.description) box.append(make(doc, 'p', view.result.description, 'send-description'));
    if (view.result.warnings.length > 0) {
      const list = make(doc, 'ul', null, 'send-warnings');
      for (const warning of view.result.warnings) list.append(make(doc, 'li', warning));
      box.append(list);
    }
    if (view.result.detail) box.append(make(doc, 'p', `詳しく：${view.result.detail}`, 'send-detail'));
    box.append(make(doc, 'p', `操作の ID：${view.result.operationId}`, 'send-detail'));
    panel.append(box);
  }
  const actions = make(doc, 'div', null, 'send-actions');
  for (const item of view.actions) {
    const button = make(doc, 'button', item.label);
    button.type = 'button';
    button.dataset.action = item.action;
    button.disabled = item.disabled;
    actions.append(button);
  }
  panel.append(actions);
  return panel;
}
