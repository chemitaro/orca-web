// 送る欄の動く部分（1行の知らせ、warning、宛先が変わった知らせ、結果不明の帯）を DOM の要素にする（D-05）。
// 入力欄と送るボタンは agent.html にあり、ここでは作らない。確認の画面と結果の画面は作らない。
// 文字はすべて textContent で入れ、HTML として解かない（innerHTML も属性の文字列も使わない）。
// document を受けるので、テストは小さな偽の document で確かめる。

function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(doc, action, label, disabled) {
  const node = make(doc, 'button', label);
  node.type = 'button';
  node.dataset.action = action;
  node.disabled = disabled;
  return node;
}

/**
 * buildSendView の形から、送る欄の動く部分を作る。ボタンは data-action（adopt、query、dismiss）で押されたものを示す。
 * @param {Document | { createElement: (tag: string) => any }} doc
 * @param {ReturnType<typeof import('./send-view.js').buildSendView>} view
 */
export function renderSendPanel(doc, view) {
  const panel = make(doc, 'div', null, `send-panel ${view.phase}`);
  if (view.changed) {
    const box = make(doc, 'div', null, 'send-changed-box');
    box.append(make(doc, 'p', view.changed.text, 'send-changed'));
    if (view.changed.adopt) box.append(button(doc, 'adopt', '新しい宛先で続ける', false));
    panel.append(box);
  }
  if (view.unknown) {
    const band = make(doc, 'div', null, 'send-unknown');
    band.append(make(doc, 'p', view.unknown.text, 'send-unknown-text'));
    const actions = make(doc, 'div', null, 'send-actions');
    actions.append(
      button(doc, 'query', view.unknown.busy ? '確かめています…' : '確かめる', view.unknown.busy),
      button(doc, 'dismiss', '閉じる', view.unknown.busy),
    );
    band.append(actions);
    panel.append(band);
  }
  if (view.message) {
    const message = make(doc, 'p', view.message.text, 'send-message');
    message.dataset.kind = view.message.kind;
    panel.append(message);
  }
  if (view.warnings.length > 0) {
    const list = make(doc, 'ul', null, 'send-warnings');
    for (const warning of view.warnings) list.append(make(doc, 'li', warning));
    panel.append(list);
  }
  return panel;
}
