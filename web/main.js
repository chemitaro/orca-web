// 状態の画面。/api/fields と /api/state を読み、選んだ項目だけを表に描く。5秒ごとに /api/state を読み直す。
// 文字はすべて textContent で入れる（Orca の題名などは信頼しないデータ）。
import { buildView, MISSING_LABELS } from './view.js';

const POLL_MS = 5_000;

const els = {
  status: document.querySelector('#status'),
  tables: document.querySelector('#tables'),
  fieldList: document.querySelector('#field-list'),
  save: document.querySelector('#save-fields'),
  saveStatus: document.querySelector('#save-status'),
};

let fields = [];
let selected = [];
let lastState = null;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderStatus(status, error) {
  els.status.replaceChildren();
  const line = el('p');
  if (error) {
    line.append(el('strong', 'orca-web に接続できない', 'bad'), el('span', ` ${error}`));
  } else if (status.connection === 'connected') {
    line.append(el('strong', 'Orca に接続', 'ok'));
  } else if (status.connection === 'starting') {
    line.append(el('strong', '確かめ中'));
  } else {
    line.append(el('strong', 'Orca に接続できない', 'bad'), el('span', ` ${status.reason ?? ''}`));
  }
  if (status?.lastSuccessAt) {
    const when = new Date(status.lastSuccessAt).toLocaleString('ja-JP', { hour12: false });
    line.append(el('span', ` ・最後に読めた時刻 ${when}`));
  }
  if (status?.stale) line.append(el('span', ' ・古い値を含む', 'warn'));
  els.status.append(line);
}

function renderTables(view) {
  els.tables.replaceChildren();
  if (view.tables.length === 0) {
    els.tables.append(el('p', '表示する項目が選ばれていません。下の「表示する項目」で選びます。'));
    return;
  }
  for (const table of view.tables) {
    const section = el('section');
    section.append(el('h2', `${table.title}（${table.rows.length}）`));
    const wrap = el('div', undefined, 'table-wrap');
    const t = el('table');
    const head = el('tr');
    head.append(
      el('th', table.entity === 'repo' || table.entity === 'run' || table.entity === 'task' ? '名前' : 'worktree'),
    );
    for (const c of table.columns) {
      const th = el('th', c.label);
      th.title = c.description;
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const row of table.rows) {
      const tr = el('tr');
      tr.append(el('th', row.label));
      for (const cell of row.cells) {
        const td = el('td', cell.text);
        if (cell.note) {
          td.title = MISSING_LABELS[cell.note] ?? cell.note;
          if (cell.text === '—') td.className = 'missing';
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    t.append(thead, tbody);
    wrap.append(t);
    section.append(wrap);
    els.tables.append(section);
  }
}

function render() {
  if (!lastState) return;
  const view = buildView(lastState, fields, selected);
  renderStatus(view.status, null);
  renderTables(view);
}

function renderFieldList() {
  els.fieldList.replaceChildren();
  const groups = new Map();
  for (const f of fields) {
    if (!groups.has(f.entity)) groups.set(f.entity, []);
    groups.get(f.entity).push(f);
  }
  for (const [entity, list] of groups) {
    const fieldset = el('fieldset');
    fieldset.append(el('legend', entity));
    for (const f of list) {
      const label = el('label');
      const box = el('input');
      box.type = 'checkbox';
      box.value = f.id;
      box.checked = selected.includes(f.id);
      label.title = f.description;
      label.append(box, el('span', ` ${f.label}`));
      fieldset.append(label);
    }
    els.fieldList.append(fieldset);
  }
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function loadFields() {
  const body = await getJson('/api/fields');
  fields = body.fields;
  selected = body.selected;
  renderFieldList();
  if (body.settings?.error)
    els.saveStatus.textContent = `設定のファイルを読めないので既定の選択（${body.settings.error}）`;
}

async function poll() {
  try {
    lastState = await getJson('/api/state');
    render();
  } catch (error) {
    renderStatus(lastState ? buildView(lastState, fields, selected).status : null, error.message);
  } finally {
    setTimeout(poll, POLL_MS);
  }
}

els.save.addEventListener('click', async () => {
  const chosen = [...els.fieldList.querySelectorAll('input[type=checkbox]:checked')].map((b) => b.value);
  els.saveStatus.textContent = '保存中…';
  try {
    const res = await fetch('/api/settings/fields', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selected: chosen }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? body.error ?? String(res.status));
    selected = body.selected;
    els.saveStatus.textContent = '保存しました';
    render();
  } catch (error) {
    els.saveStatus.textContent = `保存できませんでした：${error.message}`;
  }
});

loadFields()
  .catch((error) => {
    els.saveStatus.textContent = `項目の一覧を読めません：${error.message}`;
  })
  .finally(poll);
