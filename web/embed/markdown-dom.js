// markdown.js が解いた木を DOM の要素にする（D-02）。HTML を解かない：使う口は createElement・createTextNode・textContent・
// append・className・dataset と、setAttribute（ol の start と input の type だけ）、input の disabled・checked だけ。
// on で始まる属性と style の属性は付けない。リンクは呼び手が渡す link の口（agent-dom.js の newTabLink）だけで作る。
import { safeHref } from './markdown.js';

const ALIGN_CLASS = { left: 'md-left', center: 'md-center', right: 'md-right' };

function el(doc, tag, className) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** 文字の節。createTextNode がなければ span の textContent。 */
function textNode(doc, text) {
  if (typeof doc.createTextNode === 'function') return doc.createTextNode(text);
  const span = doc.createElement('span');
  span.textContent = text;
  return span;
}

const list = (value) => (Array.isArray(value) ? value : []);
const str = (value) => (typeof value === 'string' ? value : '');

/** 木の中の文字を集める（リンクの文字と、知らない type を落とさないため）。 */
function plainText(node) {
  if (node === null || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(plainText).join('');
  let out = typeof node.text === 'string' ? node.text : '';
  if (node.type === 'break') out += '\n';
  for (const key of ['children', 'items', 'head', 'rows']) {
    if (Array.isArray(node[key])) out += node[key].map(plainText).join(key === 'children' ? '' : ' ');
  }
  return out;
}

function renderInlines(doc, parent, inlines, link) {
  for (const node of list(inlines)) parent.append(renderInline(doc, node, link));
}

function renderInline(doc, node, link) {
  switch (node?.type) {
    case 'text':
      return textNode(doc, str(node.text));
    case 'break':
      return el(doc, 'br');
    case 'strong':
    case 'em':
    case 'del': {
      const out = el(doc, node.type);
      renderInlines(doc, out, node.children, link);
      return out;
    }
    case 'code': {
      const out = el(doc, 'code');
      out.textContent = str(node.text);
      return out;
    }
    case 'link': {
      const text = `${node.image === true ? '画像：' : ''}${plainText(node.children)}`;
      const href = safeHref(node.href);
      // 二重の守り：木の href が http・https と決められなければ、リンクにせず文字で描く。
      if (href === null) return textNode(doc, text);
      return link(doc, text, href);
    }
    default:
      return textNode(doc, plainText(node));
  }
}

function renderBlocks(doc, parent, blocks, link) {
  for (const block of list(blocks)) parent.append(renderBlock(doc, block, link));
}

function renderBlock(doc, block, link) {
  switch (block?.type) {
    case 'heading': {
      const level = Number.isInteger(block.level) ? Math.min(6, Math.max(1, block.level)) : 1;
      const out = el(doc, `h${level}`, 'md-h');
      renderInlines(doc, out, block.children, link);
      return out;
    }
    case 'paragraph': {
      const out = el(doc, 'p');
      renderInlines(doc, out, block.children, link);
      return out;
    }
    case 'code': {
      const out = el(doc, 'div', 'md-code');
      const lang = str(block.lang);
      if (lang !== '') {
        const label = el(doc, 'div', 'md-code-lang');
        label.textContent = lang;
        out.dataset.lang = lang;
        out.append(label);
      }
      const pre = el(doc, 'pre');
      const code = el(doc, 'code');
      code.textContent = str(block.text);
      pre.append(code);
      out.append(pre);
      return out;
    }
    case 'list': {
      const out = el(doc, block.ordered === true ? 'ol' : 'ul');
      if (block.ordered === true && Number.isInteger(block.start) && block.start !== 1)
        out.setAttribute('start', String(block.start));
      for (const item of list(block.items)) {
        const li = el(doc, 'li');
        if (typeof item?.checked === 'boolean') {
          li.className = 'md-task';
          const box = el(doc, 'input');
          box.setAttribute('type', 'checkbox');
          box.disabled = true;
          box.checked = item.checked;
          li.append(box);
        }
        renderBlocks(doc, li, item?.children, link);
        out.append(li);
      }
      return out;
    }
    case 'quote': {
      const out = el(doc, 'blockquote');
      renderBlocks(doc, out, block.children, link);
      return out;
    }
    case 'table': {
      const out = el(doc, 'div', 'md-table');
      const table = el(doc, 'table');
      const align = list(block.align);
      const cell = (tag, inlines, i) => {
        const node = el(doc, tag, ALIGN_CLASS[align[i]] ?? '');
        renderInlines(doc, node, inlines, link);
        return node;
      };
      const thead = el(doc, 'thead');
      const headRow = el(doc, 'tr');
      list(block.head).forEach((inlines, i) => {
        headRow.append(cell('th', inlines, i));
      });
      thead.append(headRow);
      const tbody = el(doc, 'tbody');
      for (const row of list(block.rows)) {
        const tr = el(doc, 'tr');
        list(row).forEach((inlines, i) => {
          tr.append(cell('td', inlines, i));
        });
        tbody.append(tr);
      }
      table.append(thead, tbody);
      out.append(table);
      return out;
    }
    case 'hr':
      return el(doc, 'hr');
    default: {
      const out = el(doc, 'p');
      out.append(textNode(doc, plainText(block)));
      return out;
    }
  }
}

/**
 * 塊の木を、根の div の中の要素にする。根のクラスは呼び手が付ける。
 * @param {any} doc document（テストでは偽の document）
 * @param {any[]} blocks parseMarkdown の結果
 * @param {{ link: (doc: any, text: string, href: string) => any }} options
 */
export function renderMarkdown(doc, blocks, { link }) {
  const root = el(doc, 'div');
  renderBlocks(doc, root, blocks, link);
  return root;
}
