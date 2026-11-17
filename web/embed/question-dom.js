// 質問のカード（D-05）を DOM の要素にする。描く物は question-view.js の buildQuestionCard が決める。
// 文字はすべて textContent で入れ、HTML として解かない（innerHTML も属性の文字列の HTML も使わない）。
// 途中まで送った帯（partial）と答えずに閉じた形（declined）も同じ規則で描く（iss-00049）。
// 押しは data 属性（data-action、data-question、data-option）で親が受ける。「Orca で開く」は共有の部品 createOpenControl を使う。
// document を受けるので、テストは小さな偽の document で確かめる。
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

/** 選択肢の1つ。印（番号か ✓）、ラベル、説明。 */
function optionButton(doc, option, questionIndex, number) {
  const node = button(doc, 'option', 'question-option', option.disabled);
  node.dataset.question = String(questionIndex);
  node.dataset.option = option.id;
  node.setAttribute('aria-pressed', option.selected ? 'true' : 'false');
  node.append(make(doc, 'span', option.selected ? '✓' : String(number), 'question-option-mark'));
  const body = make(doc, 'span', null, 'question-option-body');
  body.append(make(doc, 'span', option.label, 'question-option-label'));
  if (option.description) body.append(make(doc, 'span', option.description, 'question-option-desc'));
  node.append(body);
  return node;
}

/** 1つの問い。見出し、問いの文、複数の印、選択肢、その他。 */
function questionBlock(doc, question, index) {
  const block = make(doc, 'div', null, 'question');
  block.dataset.question = String(index);
  if (question.header) block.append(make(doc, 'p', question.header, 'question-header'));
  block.append(make(doc, 'p', question.question, 'question-text'));
  if (question.multiSelect) block.append(make(doc, 'p', '複数選べます', 'question-multi'));
  const list = make(doc, 'div', null, 'question-options');
  question.options.forEach((option, i) => {
    list.append(optionButton(doc, option, index, i + 1));
  });
  if (question.other.shown) {
    const other = button(doc, 'other', 'question-option question-other', question.other.disabled);
    other.dataset.question = String(index);
    other.setAttribute('aria-pressed', question.other.selected ? 'true' : 'false');
    other.append(make(doc, 'span', question.other.selected ? '✓' : '…', 'question-option-mark'));
    const body = make(doc, 'span', null, 'question-option-body');
    body.append(make(doc, 'span', 'その他（自由に書く）', 'question-option-label'));
    other.append(body);
    list.append(other);
    if (question.other.selected) {
      const field = make(doc, 'textarea', null, 'question-other-text');
      field.dataset.action = 'other-text';
      field.dataset.question = String(index);
      field.rows = 2;
      field.value = question.other.value;
      field.disabled = question.other.disabled;
      field.placeholder = 'その他の答えを書く';
      field.setAttribute('aria-label', 'その他の答え');
      list.append(field);
    }
  }
  block.append(list);
  return block;
}

/** 閉じた形の印。declined は答えずに閉じた端末の質問。 */
const CLOSED_BADGES = { answered: '答え済み', cancelled: '取り消し', declined: '答えずに閉じた' };

function questionList(doc, view) {
  const list = make(doc, 'div', null, 'question-list');
  view.questions.forEach((question, i) => {
    list.append(questionBlock(doc, question, i));
  });
  return list;
}

/**
 * buildQuestionCard の形から、カードの要素を作る。openControl は「Orca で開く」の部品（出さないときは null）で、
 * 押したときの流れは呼び手が runOpen でつなぐ。
 * @param {any} doc document
 * @param {ReturnType<typeof import('./question-view.js').buildQuestionCard>} view
 * @param {{ open?: boolean }} [options] open は閉じた形を開いて描くか
 * @returns {{ root: any, openControl: import('./open-control.js').OpenControl | null }}
 */
export function renderQuestionCard(doc, view, { open = false } = {}) {
  const root = make(doc, 'section', null, `question-card ${view.closed ? 'closed' : 'pending'}`);
  root.dataset.key = view.key;
  root.dataset.state = view.state;
  root.setAttribute('aria-label', view.title);
  if (view.closed) {
    const details = make(doc, 'details', null, 'question-closed');
    details.open = open;
    const summary = make(doc, 'summary', null, 'question-summary');
    summary.append(make(doc, 'span', CLOSED_BADGES[view.state] ?? '答え済み', 'question-badge'));
    summary.append(make(doc, 'span', view.questions[0]?.question ?? '', 'question-summary-text'));
    const answers = make(doc, 'ul', null, 'question-answers');
    for (const line of view.answerSummary) answers.append(make(doc, 'li', line));
    summary.append(answers);
    details.append(summary, questionList(doc, view));
    root.append(details);
    if (view.truncated) root.append(make(doc, 'p', '（長いので切りました）', 'cut'));
    return { root, openControl: null };
  }
  const head = make(doc, 'p', null, 'question-head');
  head.append(make(doc, 'span', view.title, 'question-badge'));
  if (view.count > 1) head.append(make(doc, 'span', `${view.count} 問`, 'question-count'));
  root.append(head, questionList(doc, view));
  if (view.truncated) root.append(make(doc, 'p', '（長いので切りました）', 'cut'));
  if (view.reason) root.append(make(doc, 'p', view.reason, 'question-reason'));
  if (view.hint) root.append(make(doc, 'p', view.hint, 'question-hint'));
  if (view.partial) {
    const band = make(doc, 'div', null, 'question-partial');
    band.setAttribute('role', 'status');
    band.append(make(doc, 'p', view.partial.text, 'question-partial-text'));
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
  const foot = make(doc, 'div', null, 'question-foot');
  if (view.open) {
    openControl = createOpenControl(doc, { size: 'md' });
    foot.append(openControl.root);
  }
  if (view.keysNote) foot.append(make(doc, 'p', view.keysNote, 'question-keys-note'));
  if (view.button.shown) {
    const submit = button(doc, 'submit', 'question-submit', view.button.disabled);
    submit.textContent = view.button.label;
    submit.setAttribute('aria-busy', view.button.busy ? 'true' : 'false');
    foot.append(submit);
  }
  if (openControl || view.button.shown || view.keysNote) root.append(foot);
  return { root, openControl };
}
