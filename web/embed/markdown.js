// Markdown（よく使われる GFM の部分）を、物と配列だけの決めた形の木に解く純な関数（D-01）。DOM に触らない。
// 生の HTML は解かず文字のまま。リンクの URL は safeHref が通す http・https だけ。描く側は markdown-dom.js。
//
// 塊（Block）：
//   {type: 'heading', level: 1..6, children: Inline[]}
//   {type: 'paragraph', children: Inline[]}
//   {type: 'code', lang: string | null, text: string}
//   {type: 'list', ordered: boolean, start: number | null, items: {checked: boolean | null, children: Block[]}[]}
//   {type: 'quote', children: Block[]}
//   {type: 'table', align: ('left' | 'center' | 'right' | null)[], head: Inline[][], rows: Inline[][][]}
//   {type: 'hr'}
// 行内（Inline）：
//   {type: 'text', text}、{type: 'break'}、{type: 'strong' | 'em' | 'del', children}、{type: 'code', text}、
//   {type: 'link', href, children}（画像は image: true を足し、children は alt か URL の文字だけ）

/** 入れ子の深さの上限（塊の list と quote を合わせた段、行内の強調とリンクの段）。 */
const MAX_DEPTH = 8;
/** コードの塊の言語の長さの上限。 */
const MAX_LANG = 60;
/** リンクの URL の括弧の深さの上限。 */
const MAX_PAREN_DEPTH = 8;

const ASCII_PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const isPunct = (ch) => ch !== undefined && ch.length === 1 && ASCII_PUNCT.includes(ch);
const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === '\n';
const ALNUM = /[\p{L}\p{N}]/u;
const isAlnum = (ch) => ch !== undefined && ALNUM.test(ch);

/**
 * URL が http・https と決められるときだけ、正規化した href を返す。ほかは null。
 * 空白・制御文字を含むもの、基準なしで解けない相対の URL、ほかの scheme は通さない。
 * @param {unknown} raw
 * @returns {string | null}
 */
export function safeHref(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return null;
  }
  if (/\s/u.test(raw)) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
}

/**
 * Markdown を塊の木に解く。文字でなければ []。例外を出さない形で書くが、呼び手は念のため例外に備える（F-01）。
 * @param {unknown} text
 * @returns {any[]}
 */
export function parseMarkdown(text) {
  if (typeof text !== 'string') return [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // 表のセルの総数の上限。入力の長さに比例させ、超えた行は表にせず段落の文字にする（R-03）。
  return parseBlocks(lines, 0, { cells: text.length + 1000 });
}

// ---- 行の判定（行の頭の短い形だけを見る） ----

const isBlank = (line) => /^[ \t]*$/.test(line);

/** 行頭の空白の幅（タブは 4 の倍数まで進める）。 */
function indentOf(line) {
  let col = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ' ') col++;
    else if (line[i] === '\t') col += 4 - (col % 4);
    else break;
  }
  return col;
}

/** 行頭から cols 幅の空白を落とす（タブの残りは空白にする）。 */
function stripIndent(line, cols) {
  let col = 0;
  let i = 0;
  while (i < line.length && col < cols) {
    if (line[i] === ' ') {
      col++;
      i++;
    } else if (line[i] === '\t') {
      const next = col + 4 - (col % 4);
      if (next > cols) return ' '.repeat(next - cols) + line.slice(i + 1);
      col = next;
      i++;
    } else break;
  }
  return line.slice(i);
}

function stripLeading(line) {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return line.slice(i);
}

function stripTrailing(line) {
  let k = line.length;
  while (k > 0 && (line[k - 1] === ' ' || line[k - 1] === '\t')) k--;
  return line.slice(0, k);
}

function fenceOpen(line) {
  const m = /^( {0,3})(`{3,}|~{3,})/.exec(line);
  if (!m) return null;
  const marker = m[2] ?? '';
  const info = line.slice(m[0].length).trim();
  if (marker[0] === '`' && info.includes('`')) return null;
  const word = info.split(/[ \t]/)[0] ?? '';
  return {
    indent: (m[1] ?? '').length,
    char: marker[0],
    len: marker.length,
    lang: word ? word.slice(0, MAX_LANG) : null,
  };
}

function isFenceClose(line, fence) {
  const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return m !== null && m[1]?.[0] === fence.char && (m[1]?.length ?? 0) >= fence.len;
}

function headingOf(line) {
  const m = /^ {0,3}(#{1,6})(?=[ \t]|$)/.exec(line);
  if (!m) return null;
  let rest = stripTrailing(stripLeading(line.slice(m[0].length)));
  let j = rest.length;
  while (j > 0 && rest[j - 1] === '#') j--;
  if (j < rest.length) {
    if (j === 0) rest = '';
    else if (rest[j - 1] === ' ' || rest[j - 1] === '\t') rest = stripTrailing(rest.slice(0, j));
  }
  return { level: (m[1] ?? '').length, text: rest };
}

function isHr(line) {
  if (indentOf(line) > 3) return false;
  const s = stripLeading(line);
  const ch = s[0];
  if (ch !== '-' && ch !== '*' && ch !== '_') return false;
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ch) count++;
    else if (s[i] !== ' ' && s[i] !== '\t') return false;
  }
  return count >= 3;
}

const isQuote = (line) => /^ {0,3}>/.test(line);

function quoteContent(line) {
  const s = line.slice(line.indexOf('>') + 1);
  if (s[0] === ' ') return s.slice(1);
  if (s[0] === '\t') return stripIndent(s, 1);
  return s;
}

function listStart(line) {
  const m = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/.exec(line);
  if (!m) return null;
  const marker = m[2] ?? '';
  const ordered = /\d/.test(marker[0] ?? '');
  const markerEnd = (m[1] ?? '').length + marker.length;
  const rest = ' '.repeat(markerEnd) + line.slice(markerEnd);
  const after = indentOf(rest) - markerEnd;
  // 印の後の空白が 5 以上（字下げのコード）や空の項目は、印の後の 1 幅を中身の始まりとする。
  const contentIndent = after >= 1 && after <= 4 && m[3] !== '' ? markerEnd + after : markerEnd + 1;
  return {
    ordered,
    key: ordered ? marker[marker.length - 1] : marker,
    start: ordered ? Number(marker.slice(0, -1)) : null,
    contentIndent,
    content: stripIndent(rest, contentIndent),
  };
}

/** 表のセルに分ける。頭と尾の `|` を落とし、`\|` では分けない。 */
function splitCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') i++;
    else if (s[i] === '|') {
      cells.push(s.slice(from, i).trim());
      from = i + 1;
    }
  }
  cells.push(s.slice(from).trim());
  return cells;
}

function delimiterAlign(line) {
  if (!line.includes('-') || (!line.includes('|') && !line.includes(':'))) return null;
  const cells = splitCells(line);
  const align = [];
  for (const cell of cells) {
    if (!/^:?-+:?$/.test(cell)) return null;
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    align.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null);
  }
  return align;
}

function tableAt(lines, i) {
  const head = lines[i];
  const next = lines[i + 1];
  if (head === undefined || next === undefined || !head.includes('|') || isBlank(head)) return null;
  const align = delimiterAlign(next);
  if (!align) return null;
  const headCells = splitCells(head);
  return headCells.length === align.length ? { align, headCells } : null;
}

/** 段落を終わらせる塊の始まりか。 */
function startsBlock(lines, i, depth) {
  const line = lines[i] ?? '';
  if (isBlank(line) || fenceOpen(line) || headingOf(line) || isHr(line)) return true;
  if (depth < MAX_DEPTH && (isQuote(line) || listStart(line))) return true;
  return tableAt(lines, i) !== null;
}

// ---- 塊 ----

function parseBlocks(lines, depth, ctx) {
  const blocks = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const line = lines[i] ?? '';
    if (isBlank(line)) {
      i++;
      continue;
    }
    const fence = fenceOpen(line);
    if (fence) {
      const body = [];
      i++;
      while (i < n && !isFenceClose(lines[i] ?? '', fence)) {
        body.push(stripIndent(lines[i] ?? '', fence.indent));
        i++;
      }
      i++;
      blocks.push({ type: 'code', lang: fence.lang, text: body.join('\n') });
      continue;
    }
    const heading = headingOf(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading.level, children: parseInline(heading.text) });
      i++;
      continue;
    }
    if (isHr(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    if (depth < MAX_DEPTH && isQuote(line)) {
      i = parseQuote(lines, i, depth, ctx, blocks);
      continue;
    }
    if (depth < MAX_DEPTH && listStart(line)) {
      i = parseList(lines, i, depth, ctx, blocks);
      continue;
    }
    const table = tableAt(lines, i);
    if (table && ctx.cells >= table.align.length) {
      i = parseTable(lines, i, table, ctx, blocks);
      continue;
    }
    const para = [stripLeading(line)];
    i++;
    while (i < n && !startsBlock(lines, i, depth)) {
      para.push(stripLeading(lines[i] ?? ''));
      i++;
    }
    blocks.push({ type: 'paragraph', children: parseInline(stripTrailing(para.join('\n'))) });
  }
  return blocks;
}

function parseQuote(lines, i, depth, ctx, blocks) {
  const inner = [];
  let fence = null;
  const n = lines.length;
  while (i < n) {
    const line = lines[i] ?? '';
    if (isQuote(line)) {
      const content = quoteContent(line);
      inner.push(content);
      if (fence) {
        if (isFenceClose(content, fence)) fence = null;
      } else fence = fenceOpen(content);
      i++;
      continue;
    }
    // 印のない続きの行（lazy）は、引用の中の段落が開いているときだけ続きとする。
    const last = inner[inner.length - 1];
    if (fence || last === undefined || isBlank(last) || isBlank(line) || startsBlock(lines, i, depth)) break;
    if (headingOf(last) || isHr(last)) break;
    inner.push(line);
    i++;
  }
  blocks.push({ type: 'quote', children: parseBlocks(inner, depth + 1, ctx) });
  return i;
}

function parseList(lines, i, depth, ctx, blocks) {
  const first = listStart(lines[i] ?? '');
  if (!first) return i + 1;
  const list = { type: 'list', ordered: first.ordered, start: first.start, items: [] };
  const n = lines.length;
  while (i < n) {
    const m = listStart(lines[i] ?? '');
    if (!m || m.ordered !== first.ordered || m.key !== first.key || isHr(lines[i] ?? '')) break;
    const itemLines = [m.content];
    i++;
    while (i < n) {
      const line = lines[i] ?? '';
      if (isBlank(line)) {
        let j = i;
        while (j < n && isBlank(lines[j] ?? '')) j++;
        if (j < n && indentOf(lines[j] ?? '') >= m.contentIndent) {
          for (; i < j; i++) itemLines.push('');
          continue;
        }
        break;
      }
      if (indentOf(line) < m.contentIndent) break;
      itemLines.push(stripIndent(line, m.contentIndent));
      i++;
    }
    let checked = null;
    const task = /^\[([ xX])\](?:[ \t]+|$)/.exec(itemLines[0] ?? '');
    if (task) {
      checked = task[1] !== ' ';
      itemLines[0] = (itemLines[0] ?? '').slice(task[0].length);
    }
    list.items.push({ checked, children: parseBlocks(itemLines, depth + 1, ctx) });
    // 項目の間の空行の後に、同じ種類の印が続けば同じ list。
    let j = i;
    while (j < n && isBlank(lines[j] ?? '')) j++;
    const again = j < n ? listStart(lines[j] ?? '') : null;
    if (j > i && (!again || again.ordered !== first.ordered || again.key !== first.key)) break;
    i = j;
  }
  blocks.push(list);
  return i;
}

function parseTable(lines, i, table, ctx, blocks) {
  const width = table.align.length;
  // 見出しの列の数に合わせる。足りないセルは解かずに空にし、多いセルは落とす。
  // セルの \| は行内を解く前に | にする（cmark-gfm の unescape_pipes と同じ。行内のコードの中でも |）。
  const fit = (cells) => {
    ctx.cells -= width;
    const out = [];
    for (let k = 0; k < width; k++)
      out.push(k < cells.length ? parseInline((cells[k] ?? '').replaceAll('\\|', '|')) : []);
    return out;
  };
  const head = fit(table.headCells);
  const rows = [];
  i += 2;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isBlank(line) || !line.includes('|') || ctx.cells < width) break;
    rows.push(fit(splitCells(line)));
    i++;
  }
  blocks.push({ type: 'table', align: table.align, head, rows });
  return i;
}

// ---- 行内 ----

/**
 * 行内を解く。コードの区間と角括弧の組を先に一度の走査で決め、記号ごとの閉じの探しは
 * 長さの定数倍の予算の中で行う（予算が尽きたら残りを文字にする）。
 */
function parseInline(src) {
  const st = { s: src, budget: src.length * 40 + 2000, spans: codeSpans(src), brackets: new Map() };
  st.brackets = bracketPairs(src, st.spans);
  return merge(parseRange(st, 0, src.length, 0, false));
}

/**
 * 行内のコードの区間を決める。開きは逃がしていない `` ` `` の並び（`\\` の後の `` ` `` は開きにしない）で、
 * 閉じは開きの後の、同じ数のちょうどの並び（中身では `\\` を普通の文字とする）。
 * 並びの位置を数ごとの一覧にし、閉じを二分探索で探す。
 */
function codeSpans(s) {
  const runLen = new Map();
  const byLen = new Map();
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '`') continue;
    let k = i;
    while (k < s.length && s[k] === '`') k++;
    runLen.set(i, k - i);
    const list = byLen.get(k - i);
    if (list) list.push(i);
    else byLen.set(k - i, [i]);
    i = k - 1;
  }
  const spans = new Map();
  /** pos から len 個の並びで開き、閉じがあれば区間を覚えて閉じの後を、なければ開きの後を返す。 */
  const open = (pos, len) => {
    const list = byLen.get(len) ?? [];
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((list[mid] ?? 0) < pos + len) lo = mid + 1;
      else hi = mid;
    }
    const close = list[lo];
    if (close === undefined) return pos + len;
    spans.set(pos, { from: pos + len, to: close, end: close + len });
    return close + len;
  };
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && isPunct(s[i + 1])) {
      const len = s[i + 1] === '`' ? (runLen.get(i + 1) ?? 1) : 0;
      i = len > 1 ? open(i + 2, len - 1) : i + 2;
    } else if (s[i] === '`') i = open(i, runLen.get(i) ?? 1);
    else i++;
  }
  return spans;
}

/** 逃がしとコードの区間の外の `[` と `]` を、内側から組む。 */
function bracketPairs(s, spans) {
  const pairs = new Map();
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && isPunct(s[i + 1])) i++;
    else if (ch === '`' && spans.has(i)) i = spans.get(i).end - 1;
    else if (ch === '[') stack.push(i);
    else if (ch === ']' && stack.length > 0) pairs.set(stack.pop(), i);
  }
  return pairs;
}

const spend = (st, n = 1) => {
  st.budget -= n;
  return st.budget > 0;
};

function textNode(text) {
  return { type: 'text', text };
}

/** 隣り合う文字の節をつなぎ、空の文字を落とす。 */
function merge(nodes) {
  const out = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.text === '') continue;
      const last = out[out.length - 1];
      if (last && last.type === 'text') {
        last.text += node.text;
        continue;
      }
    }
    out.push(node);
  }
  return out;
}

/** 木の文字だけを集める（画像の alt、リンクの文字）。 */
function plain(nodes) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'code') out += node.text;
    else if (node.type === 'break') out += ' ';
    else if (node.children) out += plain(node.children);
  }
  return out;
}

function parseRange(st, start, end, depth, inLink) {
  const s = st.s;
  const nodes = [];
  let ts = start;
  let p = start;
  const flush = (upto) => {
    if (upto > ts) nodes.push(textNode(s.slice(ts, upto)));
  };
  while (p < end) {
    if (!spend(st)) break;
    const ch = s[p];
    if (ch === '\\') {
      const next = s[p + 1];
      if (p + 1 < end && next === '\n') {
        flush(p);
        nodes.push({ type: 'break' });
        p += 2;
        ts = p;
      } else if (p + 1 < end && isPunct(next)) {
        flush(p);
        nodes.push(textNode(next));
        p += 2;
        ts = p;
      } else p++;
      continue;
    }
    if (ch === '\n') {
      let k = p;
      while (k > ts && (s[k - 1] === ' ' || s[k - 1] === '\t')) k--;
      flush(k);
      nodes.push({ type: 'break' });
      p++;
      ts = p;
      continue;
    }
    if (ch === '`') {
      const span = st.spans.get(p);
      if (span && span.end <= end) {
        flush(p);
        nodes.push({ type: 'code', text: codeText(s.slice(span.from, span.to)) });
        p = span.end;
        ts = p;
      } else {
        while (p < end && s[p] === '`') p++;
      }
      continue;
    }
    if (ch === '*' || ch === '_' || ch === '~') {
      const r = emphasis(st, p, end, depth);
      if (r) {
        flush(r.lead);
        nodes.push(r.node);
        p = r.next;
        ts = p;
      } else {
        while (p < end && s[p] === ch) p++;
      }
      continue;
    }
    if (!inLink && (ch === '[' || (ch === '!' && s[p + 1] === '['))) {
      const r = link(st, p, end, depth);
      if (r) {
        flush(p);
        nodes.push(r.node);
        p = r.next;
        ts = p;
      } else p++;
      continue;
    }
    if (!inLink && ch === '<') {
      const r = autolink(st, p, end);
      if (r) {
        flush(p);
        nodes.push(r.node);
        p = r.next;
        ts = p;
      } else p++;
      continue;
    }
    if (!inLink && ch === 'h' && (p === 0 || ' \t\n(*_~'.includes(s[p - 1] ?? ''))) {
      const r = bareUrl(st, p, end);
      if (r) {
        flush(p);
        nodes.push(r.node);
        p = r.next;
        ts = p;
        continue;
      }
    }
    p++;
  }
  // 予算が尽きたときも、残りを文字として欠けさせない。
  flush(end);
  return nodes;
}

function codeText(raw) {
  const text = raw.replace(/\n/g, ' ');
  if (text.length >= 2 && text[0] === ' ' && text[text.length - 1] === ' ' && text.trim() !== '') {
    return text.slice(1, -1);
  }
  return text;
}

/** 強調の開きを p から試す。組めたら {lead, node, next}（lead は開きより前の、文字として残す記号の終わり）。 */
function emphasis(st, p, end, depth) {
  const s = st.s;
  const ch = s[p];
  let r = 0;
  while (p + r < end && s[p + r] === ch) r++;
  if (!spend(st, r)) return null;
  if (depth >= MAX_DEPTH) return null;
  const afterRun = p + r;
  if (afterRun >= end || isSpace(s[afterRun])) return null;
  if (ch === '_' && p > 0 && isAlnum(s[p - 1])) return null;
  const sizes = ch === '~' ? (r === 2 ? [2] : []) : [3, 2, 1].filter((m) => m <= r);
  for (const m of sizes) {
    const close = findCloser(st, ch, m, afterRun, end);
    if (close < 0) {
      if (st.budget <= 0) return null;
      continue;
    }
    const children = merge(parseRange(st, afterRun, close, depth + 1, false));
    let node;
    if (ch === '~') node = { type: 'del', children };
    else if (m === 1) node = { type: 'em', children };
    else if (m === 2) node = { type: 'strong', children };
    else node = { type: 'em', children: [{ type: 'strong', children }] };
    return { lead: p + r - m, node, next: close + m };
  }
  return null;
}

/** 開きの後から、m 個の ch で閉じる位置を探す（並びが長ければ並びの尾の m 個）。なければ -1。 */
function findCloser(st, ch, m, from, end) {
  const s = st.s;
  let q = from;
  while (q < end) {
    if (!spend(st)) return -1;
    const c = s[q];
    if (c === '\\' && isPunct(s[q + 1])) {
      q += 2;
      continue;
    }
    if (c === '`' && st.spans.has(q)) {
      q = st.spans.get(q).end;
      continue;
    }
    if (c === ch) {
      let k = q;
      while (k < end && s[k] === ch) k++;
      const len = k - q;
      const okLen = ch === '~' ? len === 2 : len >= m;
      if (okLen && q > from && !isSpace(s[q - 1]) && !(ch === '_' && isAlnum(s[k]))) return k - m;
      q = k;
      continue;
    }
    q++;
  }
  return -1;
}

/** `[文字](url)` と `![alt](url)`。URL が通らないときは、括弧の閉じまでを元の文字にする。 */
function link(st, p, end, depth) {
  const s = st.s;
  const image = s[p] === '!';
  const open = image ? p + 1 : p;
  const close = st.brackets.get(open);
  if (close === undefined || close >= end || s[close + 1] !== '(' || depth >= MAX_DEPTH) return null;
  const dest = destination(st, close + 2, end);
  if (dest) {
    const href = safeHref(dest.url);
    if (href) {
      const children = merge(parseRange(st, open + 1, close, depth + 1, true));
      if (image) {
        const alt = plain(children);
        return { node: { type: 'link', href, children: [textNode(alt || href)], image: true }, next: dest.next };
      }
      return { node: { type: 'link', href, children }, next: dest.next };
    }
  }
  const paren = closeParen(st, close + 1, end);
  if (paren < 0) return null;
  return { node: textNode(s.slice(p, paren + 1)), next: paren + 1 };
}

/** `(` の後の URL と題と `)`。{url, next} か null。 */
function destination(st, i, end) {
  const s = st.s;
  while (i < end && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n')) i++;
  let url;
  if (s[i] === '<') {
    let j = i + 1;
    while (j < end && s[j] !== '>' && s[j] !== '<' && s[j] !== '\n') {
      if (!spend(st)) return null;
      j++;
    }
    if (s[j] !== '>') return null;
    url = s.slice(i + 1, j);
    i = j + 1;
  } else {
    let j = i;
    let paren = 0;
    while (j < end) {
      if (!spend(st)) return null;
      const c = s[j];
      const code = s.charCodeAt(j);
      if (c === '\\' && isPunct(s[j + 1])) {
        j += 2;
        continue;
      }
      if (code <= 0x20 || code === 0x7f) break;
      if (c === '(') {
        paren++;
        if (paren > MAX_PAREN_DEPTH) return null;
      } else if (c === ')') {
        if (paren === 0) break;
        paren--;
      }
      j++;
    }
    if (paren !== 0) return null;
    url = s.slice(i, j);
    i = j;
  }
  while (i < end && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n')) i++;
  const q = s[i];
  if (q === '"' || q === "'" || q === '(') {
    const closer = q === '(' ? ')' : q;
    let j = i + 1;
    while (j < end && s[j] !== closer) {
      if (!spend(st)) return null;
      if (s[j] === '\\') j++;
      j++;
    }
    if (j >= end) return null;
    i = j + 1;
    while (i < end && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n')) i++;
  }
  if (s[i] !== ')') return null;
  return { url: url.replace(/\\([!-/:-@[-`{-~])/g, '$1'), next: i + 1 };
}

/** `(` から釣り合う `)` の位置。なければ -1。 */
function closeParen(st, i, end) {
  const s = st.s;
  let depth = 0;
  for (let j = i; j < end; j++) {
    if (!spend(st)) return -1;
    if (s[j] === '\\') j++;
    else if (s[j] === '(') depth++;
    else if (s[j] === ')') {
      depth--;
      if (depth === 0) return j;
    } else if (s[j] === '\n' && s[j + 1] === '\n') return -1;
  }
  return -1;
}

/** `<url>`。中に空白と `<` `>` がなく、safeHref が通るものだけ。 */
function autolink(st, p, end) {
  const s = st.s;
  let j = p + 1;
  while (j < end) {
    if (!spend(st)) return null;
    const code = s.charCodeAt(j);
    if (s[j] === '>' || s[j] === '<' || code <= 0x20 || code === 0x7f) break;
    j++;
  }
  if (s[j] !== '>' || j === p + 1 || j >= end) return null;
  const raw = s.slice(p + 1, j);
  const href = safeHref(raw);
  return href ? { node: { type: 'link', href, children: [textNode(raw)] }, next: j + 1 } : null;
}

const TRAILING = '.,:;!?\'"*_~';

/** 本文の中の素の `http://`・`https://` の URL。尾の記号と釣り合わない `)` を落とす。 */
function bareUrl(st, p, end) {
  const s = st.s;
  if (!s.startsWith('http://', p) && !s.startsWith('https://', p)) return null;
  let j = p;
  let open = 0;
  let closed = 0;
  while (j < end) {
    if (!spend(st)) return null;
    const c = s[j];
    const code = s.charCodeAt(j);
    if (c === '<' || code <= 0x20 || code === 0x7f || /\s/u.test(c)) break;
    if (c === '(') open++;
    else if (c === ')') closed++;
    j++;
  }
  while (j > p) {
    const c = s[j - 1];
    if (TRAILING.includes(c)) j--;
    else if (c === ')' && closed > open) {
      closed--;
      j--;
    } else break;
  }
  const raw = s.slice(p, j);
  const href = safeHref(raw);
  if (!href || raw.length <= (raw.startsWith('https') ? 8 : 7)) return null;
  return { node: { type: 'link', href, children: [textNode(raw)] }, next: j };
}
