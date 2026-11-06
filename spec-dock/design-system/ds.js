/* 説明資料デザインシステム（japanese-explanatory-html 1.0.0 から SpecDock が派生）
   資料の本文は <script type="text/markdown" id="ds-source"> に書き、このファイルは編集しない。
   SpecDock の配布資産（spec-dock/design-system/ds.js）。説明資料は <head> でこのファイルを同期に読む。
   元からの直し（iss-00475）：
   1. VERSION に派生を示す "+specdock.N" を付ける。
   2. 元の ds-preflight（テーマと文字の大きさ）と UD フォントの <link> を、このファイルの読み込みの直後に行う。
   3. marked を、このファイルと同じ場所の vendor/marked.umd.js から読む。
   4. PlantUML と highlight.js を、<meta name="ds-vendor-base"> が示す手元の場所、CDN の順に試して読む。 */
(() => {
  "use strict";

  const VERSION = "1.0.0+specdock.1";
  const PLANTUML_VERSION = "1.2026.6";
  const HLJS_VERSION = "11.11.1";
  const VENDOR = {
    plantuml: { local: `plantuml/${PLANTUML_VERSION}/`, cdn: `https://unpkg.com/@plantuml/core@${PLANTUML_VERSION}/` },
    hljs: { local: `highlightjs/${HLJS_VERSION}/`, cdn: `https://unpkg.com/@highlightjs/cdn-assets@${HLJS_VERSION}/` },
  };
  const SELF_URL = document.currentScript?.src || document.baseURI;
  const root = document.documentElement;

  /* 元の ds-preflight：描く前にテーマと文字の大きさを決める */
  try {
    const t = new URLSearchParams(location.search).get("theme") || localStorage.getItem("ds:theme") || "auto";
    const dark = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    root.setAttribute("data-theme", dark ? "dark" : "light");
    const f = localStorage.getItem("ds:fontsize");
    if (f === "large") root.style.setProperty("--ds-body-size", "18px");
    else if (f === "xlarge") root.style.setProperty("--ds-body-size", "20px");
  } catch {
    root.setAttribute("data-theme", "light");
  }
  /* UDフォント。読めない環境では端末の標準ゴシック体で表示する */
  if (document.head && !document.querySelector("link[data-ds-font]")) {
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap";
    font.dataset.dsFont = "";
    document.head.append(font);
  }
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  /* ------------------------------------------------------------
     アイコン（24×24、線のみ）
     ------------------------------------------------------------ */
  const ICONS = {
    dot: '<circle cx="12" cy="12" r="2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
    alert: '<path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    octagon: '<path d="M7.9 2.5h8.2l5.4 5.4v8.2l-5.4 5.4H7.9l-5.4-5.4V7.9z"/><path d="m15 9-6 6M9 9l6 6"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    triangle: '<path d="M12 5 4.5 18h15z"/>',
    plusCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    minusCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
    fillScreen: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 6.5v11M9 9l3-2.5L15 9M9 15l3 2.5 3-2.5"/>',
    fullscreen: '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/>',
    fullscreenExit: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    hash: '<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    chevronLeft: '<path d="m15 6-6 6 6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
    queue: '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v16H5.5A1.5 1.5 0 0 0 4 20.5zM4 20.5A1.5 1.5 0 0 0 5.5 22H20"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
    trendUp: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
    trendDown: '<path d="m3 7 6 6 4-4 8 8M15 17h6v-6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    branch: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8M18 10c0 4-6 3-11.5 6.5"/>',
    terminal: '<path d="m6 9 3 3-3 3M12 15h6"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
    gauge: '<path d="M4 18a9 9 0 1 1 16 0"/><path d="m12 13 4-5"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    type: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    sortAsc: '<path d="M8 17V5M4 9l4-4 4 4M14 8h6M14 13h4M14 18h2"/>',
    sortDesc: '<path d="M8 5v12M4 13l4 4 4-4M14 8h2M14 13h4M14 18h6"/>' 
  };
  // 存在しないアイコン名は黙って置き換えず、「不明な部品」として表示する（検証で見つけられるように）
  const icon = (name, extra = "") => (ICONS[name]
    ? `<svg class="ds-icon${extra ? ` ${extra}` : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`
    : `<span class="ds-unknown ds-unknown--icon">不明なアイコン「${String(name).replace(/[&<>"']/g, "")}」</span>`);

  /* ------------------------------------------------------------
     小さな道具
     ------------------------------------------------------------ */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ESC[c]);
  const fromHTML = markup => {
    const template = document.createElement("template");
    template.innerHTML = markup.trim();
    return template.content.firstElementChild;
  };
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* 保存できない環境では無視する */ } }
  };
    const usedIds = new Set();
  const slugify = (text, prefix = "") => {
    const base = prefix + (String(text).trim().toLowerCase()
      .replace(/[\s　]+/g, "-")
      .replace(/[^\p{L}\p{N}\-_]/gu, "")
      .slice(0, 48) || "section");
    let id = base;
    for (let n = 2; usedIds.has(id); n += 1) id = `${base}-${n}`;
    usedIds.add(id);
    return id;
  };
  let uid = 0;
  const nextId = prefix => `${prefix}-${++uid}`;

  function parseAttrs(text = "") {
    const attrs = {};
    const words = [];
    const pattern = /([^\s="'{}]+)=(?:"([^"]*)"|'([^']*)'|([^\s"']+))|"([^"]*)"|'([^']*)'|(\S+)/g;
    for (const m of String(text).matchAll(pattern)) {
      if (m[1] !== undefined) attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
      else words.push(m[5] ?? m[6] ?? m[7]);
    }
    return { attrs, words, label: words.join(" "), flags: new Set(words) };
  }
  function trailingAttrs(text) {
    const m = /\s*\{([^{}]*)\}\s*$/.exec(text);
    if (!m) return { text: text.trim(), attrs: {}, flags: new Set() };
    const parsed = parseAttrs(m[1]);
    return { text: text.slice(0, m.index).trim(), attrs: parsed.attrs, flags: parsed.flags };
  }
  function parseFrontmatter(src) {
    const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
    if (!m) return { meta: {}, body: src };
    const meta = {};
    const unquote = s => s.replace(/^["']|["']$/g, "");
    let key = null;
    for (const line of m[1].split("\n")) {
      const item = /^\s+-\s+(.*)$/.exec(line);
      if (item && key) {
        if (!Array.isArray(meta[key])) meta[key] = [];
        meta[key].push(unquote(item[1].trim()));
        continue;
      }
      const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
      if (!kv) continue;
      key = kv[1];
      const value = kv[2].trim();
      if (value.startsWith("[") && value.endsWith("]")) {
        meta[key] = value.slice(1, -1).split(",").map(s => unquote(s.trim())).filter(Boolean);
      } else {
        meta[key] = value === "" ? [] : unquote(value);
      }
    }
    return { meta, body: src.slice(m[0].length) };
  }

  const isFenceClose = (line, fence) => {
    const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
    return Boolean(m && m[1][0] === fence[0] && m[1].length >= fence.length);
  };
  // CommonMark と同じく、バッククォートの囲みは情報文字列にバッククォートを含まない場合だけ開始とみなす
  const fenceOpen = line => {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!m || (m[1][0] === "`" && m[2].includes("`"))) return null;
    return m[1];
  };
  // 行ごとに「コードブロック内か」「部品の入れ子の深さ」を返す
  function scanLines(body) {
    const out = [];
    let fence = null;
    const stack = [];
    for (const line of body.split("\n")) {
      if (fence) {
        out.push({ line, depth: stack.length, inFence: true });
        if (isFenceClose(line, fence)) fence = null;
        continue;
      }
      const f = fenceOpen(line);
      if (f) {
        fence = f;
        out.push({ line, depth: stack.length, inFence: true });
        continue;
      }
      const open = /^(:{3,})[a-z]/.exec(line);
      if (open) {
        out.push({ line, depth: stack.length, inFence: false });
        stack.push(open[1].length);
        continue;
      }
      const close = /^(:{3,})\s*$/.exec(line);
      if (close && stack.length && close[1].length === stack.at(-1)) {
        stack.pop();
        out.push({ line, depth: stack.length + 1, inFence: false });
        continue;
      }
      out.push({ line, depth: stack.length, inFence: false });
    }
    return out;
  }
  function splitSections(body) {
    const scanned = scanLines(body);
    const heads = [];
    scanned.forEach((s, index) => {
      if (s.inFence || s.depth !== 0) return;
      const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(s.line);
      if (m) heads.push({ index, depth: m[1].length, text: m[2] });
    });
    const lines = body.split("\n");
    if (!heads.length) return { intro: body, sections: [] };
    const depth = Math.min(...heads.map(h => h.depth));
    const marks = heads.filter(h => h.depth === depth);
    const sections = marks.map((h, k) => {
      const end = k + 1 < marks.length ? marks[k + 1].index : lines.length;
      const t = trailingAttrs(h.text);
      return { title: t.text, attrs: t.attrs, flags: t.flags, body: lines.slice(h.index + 1, end).join("\n") };
    });
    return { intro: lines.slice(0, marks[0].index).join("\n"), sections };
  }

  /* ------------------------------------------------------------
     部品の登録
     ------------------------------------------------------------ */
  const blockComponents = new Map();
  const inlineComponents = new Map();
  const hydrators = new Map();
  const DS = window.DS = {
    version: VERSION,
    icon,
    esc,
    component(name, render) { blockComponents.set(name, render); },
    inline(name, render) { inlineComponents.set(name, render); },
    hydrate(name, fn) { hydrators.set(name, fn); },
    style(css) {
      const el = document.createElement("style");
      el.textContent = css;
      document.head.append(el);
    },
    components: blockComponents,
    inlines: inlineComponents
  };

  /* ------------------------------------------------------------
     Markdown エンジン
     ------------------------------------------------------------ */
  let engine = null;
  let diagrams = [];
  let footnotes = { notes: new Map(), order: [] };
  const md = text => (text && text.trim() ? engine.parse(text) : "");
  const mdInline = text => (text ? engine.parseInline(String(text)) : "");
  const mdAuto = text => (/\n\s*\n|\n\s*[-*+] |\n\s*\d+\. |\n```/.test(text.trim()) ? md(text) : mdInline(text.trim()));

  const directiveExtension = {
    name: "directive",
    level: "block",
    start(src) {
      const m = /(^|\n)(:{3,})[a-z]/.exec(src);
      return m ? m.index + m[1].length : undefined;
    },
    tokenizer(src) {
      const head = /^(:{3,})([a-z][\w-]*)[^\S\n]*([^\n]*)/.exec(src);
      if (!head) return undefined;
      const lines = src.split("\n");
      const stack = [head[1].length];
      let fence = null;
      let end = -1;
      for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (fence) { if (isFenceClose(line, fence)) fence = null; continue; }
        const f = fenceOpen(line);
        if (f) { fence = f; continue; }
        const open = /^(:{3,})[a-z][\w-]*/.exec(line);
        if (open) { stack.push(open[1].length); continue; }
        const close = /^(:{3,})[^\S\n]*$/.exec(line);
        if (close && close[1].length === stack.at(-1)) {
          stack.pop();
          if (!stack.length) { end = i; break; }
        }
      }
      const last = end < 0 ? lines.length - 1 : end;
      let raw = lines.slice(0, last + 1).join("\n");
      if (last + 1 < lines.length) raw += "\n";
      return {
        type: "directive",
        raw,
        name: head[2],
        args: head[3].trim(),
        body: lines.slice(1, end < 0 ? lines.length : end).join("\n")
      };
    },
    renderer(token) { return renderDirective(token); }
  };

  const inlineDirectiveExtension = {
    name: "inlineDirective",
    level: "inline",
    start(src) {
      const m = /(?:^|[^\w:/]):[a-z][\w-]*\[/.exec(src);
      if (!m) return undefined;
      return m.index + (m[0][0] === ":" ? 0 : 1);
    },
    tokenizer(src) {
      const m = /^:([a-z][\w-]*)\[([^\]\n]*)\](?:\{([^}\n]*)\})?/.exec(src);
      if (!m || !inlineComponents.has(m[1])) return undefined;
      return { type: "inlineDirective", raw: m[0], name: m[1], text: m[2], args: m[3] || "" };
    },
    renderer(token) {
      const render = inlineComponents.get(token.name);
      return render({ text: token.text, ...parseAttrs(token.args) });
    }
  };

  const footnoteExtension = {
    name: "footnoteRef",
    level: "inline",
    start(src) { const i = src.indexOf("[^"); return i < 0 ? undefined : i; },
    tokenizer(src) {
      const m = /^\[\^([^\]\s]+)\]/.exec(src);
      if (!m || !footnotes.notes.has(m[1])) return undefined;
      return { type: "footnoteRef", raw: m[0], key: m[1] };
    },
    renderer(token) {
      if (!footnotes.order.includes(token.key)) footnotes.order.push(token.key);
      const n = footnotes.order.indexOf(token.key) + 1;
      return `<sup class="ds-fnref"><a href="#fn-${esc(token.key)}" id="fnref-${esc(token.key)}" aria-label="脚注${n}">${n}</a></sup>`;
    }
  };

  // 脚注の定義は先に集めておき、本文中の定義行そのものは何も表示しない
  const footnoteDefExtension = {
    name: "footnoteDef",
    level: "block",
    start(src) {
      const m = /(^|\n)\[\^[^\]\s]+\]:\s/.exec(src);
      return m ? m.index + m[1].length : undefined;
    },
    tokenizer(src) {
      const m = /^\[\^([^\]\s]+)\]:\s+[^\n]*(?:\n|$)/.exec(src);
      return m ? { type: "footnoteDef", raw: m[0] } : undefined;
    },
    renderer() { return ""; }
  };
  function collectFootnotes(body) {
    const notes = new Map();
    for (const s of scanLines(body)) {
      const m = !s.inFence && /^\[\^([^\]\s]+)\]:\s+(.*)$/.exec(s.line);
      if (m) notes.set(m[1], m[2]);
    }
    return notes;
  }

  const SYMBOLS = { "✓": "yes", "✔": "yes", "○": "yes", "◯": "yes", "◎": "best", "△": "partial", "▲": "partial", "✗": "no", "✕": "no", "×": "no" };
  const SYMBOL_META = {
    yes: ["check", "対応"], best: ["check", "最適"], partial: ["triangle", "一部対応"], no: ["x", "非対応"]
  };
  const decorateSymbol = cellHtml => cellHtml.replace(/^\s*([✓✔○◯◎△▲✗✕×])\s*/u, (_, s) => {
    const kind = SYMBOLS[s];
    const [ic, label] = SYMBOL_META[kind];
    return `<span class="ds-sym" data-sym="${kind}" role="img" aria-label="${label}">${icon(ic)}</span>`;
  });
  const alignAttr = align => (align ? ` data-align="${align}"` : "");
  function tableHTML(token, { recIndex = -1, sortable = false } = {}) {
    const head = token.header.map((c, i) => {
      const label = `${mdInline(c.text)}${i === recIndex ? ' <span class="ds-badge" data-tone="solid">推奨</span>' : ""}`;
      const inner = sortable ? `<button type="button" class="ds-sort" data-col="${i}">${label}<span class="ds-sort__icon" aria-hidden="true"></span></button>` : label;
      return `<th scope="col"${alignAttr(token.align[i])}${i === recIndex ? ' class="is-rec"' : ""}${sortable ? ' aria-sort="none"' : ""}>${inner}</th>`;
    }).join("");
    const rows = token.rows.map(row => `<tr>${row.map((c, i) => {
      const cls = i === recIndex ? ' class="is-rec"' : "";
      return `<td${alignAttr(token.align[i])}${cls}>${decorateSymbol(mdInline(c.text))}</td>`;
    }).join("")}</tr>`).join("");
    return `<div class="ds-table__scroll" tabindex="0"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  const LANG_LABELS = {
    ts: "TypeScript", typescript: "TypeScript", tsx: "TSX", js: "JavaScript", javascript: "JavaScript", jsx: "JSX",
    py: "Python", python: "Python", sh: "Shell", bash: "Bash", zsh: "Zsh", shell: "Shell", console: "Console",
    json: "JSON", yaml: "YAML", yml: "YAML", sql: "SQL", diff: "Diff", html: "HTML", css: "CSS", go: "Go",
    rust: "Rust", java: "Java", kotlin: "Kotlin", swift: "Swift", md: "Markdown", markdown: "Markdown", toml: "TOML",
    plantuml: "PlantUML", text: "テキスト", txt: "テキスト"
  };
  function parseRanges(text) {
    const set = new Set();
    for (const part of String(text || "").split(",")) {
      const m = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
      if (!m) continue;
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      for (let i = Math.min(a, b); i <= Math.max(a, b); i += 1) set.add(i);
    }
    return set;
  }
  function parseInfo(lang = "") {
    const info = String(lang).trim();
    const space = info.search(/\s/);
    const language = (space < 0 ? info : info.slice(0, space)).toLowerCase();
    const parsed = parseAttrs(space < 0 ? "" : info.slice(space + 1));
    let hl = parsed.attrs.hl || "";
    for (const w of parsed.words) if (/^\{[\d,\s-]+\}$/.test(w)) hl = w.slice(1, -1);
    return { language, attrs: parsed.attrs, flags: parsed.flags, hl: parseRanges(hl) };
  }
  const parsePins = text => new Map(String(text || "").split(",").filter(Boolean).map(p => p.split(":").map(Number)));
  function lineSpans(lineHtmls, rawLines, language, hl, pins = null) {
    return lineHtmls.map((h, i) => {
      const cls = ["ds-line"];
      if (hl.has(i + 1)) cls.push("is-hl");
      if (language === "diff") {
        const c = rawLines[i]?.[0];
        if (c === "+") cls.push("is-add");
        else if (c === "-") cls.push("is-del");
      }
      const pin = pins?.get(i + 1);
      if (pin) cls.push("has-pin");
      return `<span class="${cls.join(" ")}"${pin ? ` data-line-pin="${pin}"` : ""}>${h}${pin ? `<button type="button" class="ds-pin" data-pin="${pin}" aria-label="解説${pin}を見る">${pin}</button>` : ""}</span>`;
    }).join("");
  }
  function renderCodeBlock({ text, lang }) {
    const info = parseInfo(lang);
    if (info.language === "plantuml" || info.language === "puml") return renderDiagram(text, info.attrs);
    return codeBlockHTML(text, info);
  }
  function codeBlockHTML(text, info, pins = null) {
    const rawLines = text.split("\n");
    const title = info.attrs.title || info.attrs.file || "";
    const ln = info.flags.has("ln") || info.attrs.ln === "true";
    const label = LANG_LABELS[info.language] || info.language || "テキスト";
    const pinAttr = pins?.size ? ` data-pins="${[...pins].map(([line, n]) => `${line}:${n}`).join(",")}"` : "";
    return `<div class="ds-bleed"><figure class="ds-code ds-bleed__inner" data-lang="${esc(info.language)}" data-ln="${ln}" data-hl="${[...info.hl].join(",")}"${pinAttr} data-ds-hydrate="code">` +
      `<figcaption class="ds-code__bar">${title ? `<span class="ds-code__title">${icon("file")}${esc(title)}</span>` : ""}<span class="ds-code__lang">${esc(label)}</span>` +
      `<button class="ds-code__copy" type="button" aria-label="コードをコピーする">${icon("copy")}<span>コピー</span></button></figcaption>` +
      `<pre tabindex="0"><code>${lineSpans(rawLines.map(esc), rawLines, info.language, info.hl, pins)}</code></pre>` +
      `<template class="ds-code__raw">${esc(text)}</template></figure></div>`;
  }

  function renderDiagram(source, attrs) {
    const key = attrs.id ? attrs.id : `diagram-${diagrams.length + 1}`;
    const id = slugify(key, "fig-");
    const titleLine = /^\s*title\s+(.+)$/im.exec(source);
    const caption = attrs.caption || (titleLine ? titleLine[1].trim() : "");
    diagrams.push({ id, source, caption, stripTitle: !attrs.caption && Boolean(titleLine) });
    return `<div class="ds-bleed"><figure class="ds-figure ds-diagram ds-bleed__inner" id="${id}" data-kind="diagram" data-status="pending" data-caption="${esc(caption)}">` +
      `<div class="ds-figure__frame"><div class="ds-diagram__canvas"><div class="ds-diagram__placeholder"><span class="ds-spinner"></span>図を描画しています…</div></div>` +
      `<div class="ds-figure__tools"><button type="button" class="ds-figure__tool" data-action="zoom" disabled>${icon("expand")}<span>拡大</span></button></div></div>` +
      `<figcaption class="ds-figure__caption"><span class="ds-figure__num"></span><span class="ds-figure__text">${mdInline(caption)}</span>` +
      `<button type="button" class="ds-figure__srcbtn" aria-expanded="false">PlantUMLソース</button></figcaption>` +
      `<pre class="ds-figure__source" hidden>${esc(source.trim())}</pre></figure></div>`;
  }

  function renderDirective(token) {
    const render = blockComponents.get(token.name);
    if (!render) {
      return `<div class="ds-unknown">${icon("alert")} 不明な部品「${esc(token.name)}」です。部品名を確認してください。</div>`;
    }
    const parsed = parseAttrs(token.args);
    const body = token.body;
    const ctx = {
      name: token.name,
      ...parsed,
      body,
      md,
      inline: mdInline,
      auto: mdAuto,
      lex: text => engine.lexer(text),
      sections: () => splitSections(body),
      list: () => engine.lexer(body).find(t => t.type === "list")?.items ?? [],
      table: () => engine.lexer(body).find(t => t.type === "table") ?? null
    };
    try {
      return render(ctx);
    } catch (error) {
      console.error(error);
      return `<div class="ds-unknown">部品「${esc(token.name)}」を表示できませんでした: ${esc(error.message)}</div>`;
    }
  }

  function createEngine() {
    const marked = new window.marked.Marked({ gfm: true, breaks: false });
    marked.use({
      extensions: [directiveExtension, footnoteDefExtension, inlineDirectiveExtension, footnoteExtension],
      renderer: {
        code(token) { return renderCodeBlock(token); },
        table(token) { return `<div class="ds-bleed"><div class="ds-table ds-bleed__inner">${tableHTML(token)}</div></div>`; }
      }
    });
    return marked;
  }

  // 「**題名** — 説明 {属性}」形式の項目を分解する
  function splitItem(text) {
    const lines = text.split("\n");
    const ta = trailingAttrs(lines[0]);
    const rest = lines.slice(1).join("\n").trim();
    const m = /^\*\*(.+?)\*\*\s*(?:[—–:：]\s*|-\s+)?([\s\S]*)$/.exec(ta.text);
    if (m) return { title: m[1], desc: [m[2].trim(), rest].filter(Boolean).join("\n"), attrs: ta.attrs, flags: ta.flags };
    return { title: "", desc: [ta.text, rest].filter(Boolean).join("\n"), attrs: ta.attrs, flags: ta.flags };
  }
  const bleed = (inner, size = "") => `<div class="ds-bleed"${size ? ` data-size="${size}"` : ""}><div class="ds-bleed__inner">${inner}</div></div>`;

  /* ------------------------------------------------------------
     標準の部品
     ------------------------------------------------------------ */
  const CALLOUTS = {
    note: ["補足", "info", "NOTE"],
    tip: ["ヒント", "bulb", "TIP"],
    warning: ["注意", "alert", "WARNING"],
    danger: ["危険", "octagon", "DANGER"],
    success: ["成功", "checkCircle", "OK"]
  };
  for (const [tone, [title, ic, kind]] of Object.entries(CALLOUTS)) {
    DS.component(tone, ctx => `<aside class="ds-callout" data-tone="${tone}"><span class="ds-callout__icon">${icon(ic)}</span>` +
      `<p class="ds-callout__title" data-kind="${kind}" data-label="${title}"${ctx.label ? ' data-custom="true"' : ""}>${ctx.inline(ctx.label || title)}</p><div class="ds-callout__body">${ctx.md(ctx.body)}</div></aside>`);
  }

  DS.component("summary", ctx => {
    const items = ctx.list();
    const body = items.length ? `<ol>${items.map(it => `<li><div>${mdAuto(it.text)}</div></li>`).join("")}</ol>` : ctx.md(ctx.body);
    return `<section class="ds-summary"><p class="ds-summary__title">${icon("target")}${ctx.inline(ctx.label || "この資料の要点")}</p>${body}</section>`;
  });

  DS.component("cards", ctx => {
    const { sections } = ctx.sections();
    const cards = sections.map(s => {
      const href = s.attrs.href || s.attrs.link;
      const tag = href ? "a" : "div";
      const badges = (s.attrs.badge || "").split(/[,、]/).filter(Boolean)
        .map(b => `<span class="ds-badge" data-tone="${esc(s.attrs.tone || "accent")}">${esc(b.trim())}</span>`).join("");
      return `<${tag} class="ds-card"${href ? ` href="${esc(href)}"` : ""}>` +
        `<div class="ds-card__head">${s.attrs.icon ? `<span class="ds-card__icon">${icon(s.attrs.icon)}</span>` : ""}` +
        `<div><p class="ds-card__title"${s.attrs.icon ? "" : ' style="padding-top:0"'}>${ctx.inline(s.title)}</p>${badges ? `<div class="ds-card__badges">${badges}</div>` : ""}</div></div>` +
        `<div class="ds-card__body">${ctx.md(s.body)}</div>${href ? `<span class="ds-card__more">${esc(s.attrs.more || "開く")}${icon("arrowRight")}</span>` : ""}</${tag}>`;
    }).join("");
    const grid = `<div class="ds-cards" data-cols="${esc(ctx.attrs.cols || "")}">${cards}</div>`;
    return ctx.flags.has("wide") ? bleed(grid, "wide") : grid;
  });

  DS.component("compare", ctx => {
    const table = ctx.table();
    if (!table) return ctx.md(ctx.body);
    const rec = ctx.attrs["推奨"] || ctx.attrs.recommend || "";
    const headers = table.header.map(c => c.text.trim());
    const recIndex = rec ? headers.indexOf(rec) : -1;
    const cards = headers.slice(1).map((_, k) => {
      const i = k + 1;
      return `<section class="ds-compare__card${i === recIndex ? " is-rec" : ""}"><h4>${mdInline(table.header[i].text)}${i === recIndex ? '<span class="ds-badge" data-tone="solid">推奨</span>' : ""}</h4>` +
        `<dl>${table.rows.map(r => `<dt>${mdInline(r[0]?.text ?? "")}</dt><dd>${decorateSymbol(mdInline(r[i]?.text ?? ""))}</dd>`).join("")}</dl></section>`;
    }).join("");
    const inner = `<div class="ds-compare ds-table">${tableHTML(table, { recIndex })}<div class="ds-compare__cards">${cards}</div></div>`;
    return ctx.flags.has("wide") ? bleed(inner, "wide") : inner;
  });

  DS.component("proscons", ctx => {
    const [pros, cons] = ctx.sections().sections;
    const box = (s, kind, fallback, ic) => (s ? `<section class="ds-pair__box" data-kind="${kind}"><p class="ds-pair__title">${icon(ic)}${ctx.inline(s.title || fallback)}</p>${ctx.md(s.body)}</section>` : "");
    return `<div class="ds-pair">${box(pros, "pros", "長所", "plusCircle")}${box(cons, "cons", "短所", "minusCircle")}</div>`;
  });

  DS.component("beforeafter", ctx => {
    const [before, after] = ctx.sections().sections;
    const box = (s, kind, fallback, ic) => (s ? `<section class="ds-pair__box" data-kind="${kind}"><p class="ds-pair__title">${icon(ic)}${ctx.inline(s.title || fallback)}</p>${ctx.md(s.body)}</section>` : "");
    return `<div class="ds-ba">${box(before, "before", "変更前", "history")}<div class="ds-ba__arrow" aria-hidden="true">${icon("arrowRight")}</div>${box(after, "after", "変更後", "sparkle")}</div>`;
  });

  const statusTone = status => (/決定|承認|採用|完了|確定/.test(status) ? "success" : /検討|提案|保留|レビュー/.test(status) ? "warning" : /却下|廃止|中止/.test(status) ? "danger" : "accent");
  DS.component("decision", ctx => {
    const { intro, sections } = ctx.sections();
    const status = ctx.attrs.status || ctx.attrs["状態"] || "決定済み";
    const date = ctx.attrs.date || ctx.attrs["日付"] || "";
    const rows = sections.map((s, i) => `<dt${i === 0 ? ' class="is-key"' : ""}>${ctx.inline(s.title)}</dt><dd>${ctx.md(s.body)}</dd>`).join("");
    return `<section class="ds-decision"><header class="ds-decision__head"><span class="ds-decision__kicker">決定記録</span>` +
      `<p class="ds-decision__title">${ctx.inline(ctx.label || "設計判断")}</p><span class="ds-badge" data-tone="${statusTone(status)}">${esc(status)}</span>` +
      `${date ? `<span class="ds-decision__date">${esc(date)}</span>` : ""}</header>${intro.trim() ? `<div class="ds-flow" style="padding:14px 18px 0">${ctx.md(intro)}</div>` : ""}` +
      `<dl class="ds-decision__rows">${rows}</dl></section>`;
  });

  DS.component("steps", ctx => {
    const layout = ctx.flags.has("horizontal") ? "horizontal" : "vertical";
    const items = ctx.list().map(it => {
      const s = splitItem(it.text);
      const title = s.title ? ctx.inline(s.title) : mdInline(s.desc.split("\n")[0]);
      const desc = s.title ? s.desc : s.desc.split("\n").slice(1).join("\n");
      return `<li class="ds-step"><div><p class="ds-step__title">${title}</p>${desc.trim() ? `<div class="ds-step__body">${mdAuto(desc)}</div>` : ""}</div></li>`;
    }).join("");
    return `<ol class="ds-steps" data-layout="${layout}">${items}</ol>`;
  });

  DS.component("timeline", ctx => `<ol class="ds-timeline">${ctx.list().map(it => {
    const s = splitItem(it.text);
    const now = s.flags.has("now") || s.flags.has("現在");
    return `<li${now ? ' class="is-now"' : ""}><div class="ds-timeline__date">${ctx.inline(s.title)}</div><div class="ds-timeline__dot"></div>` +
      `<div class="ds-timeline__body">${now ? '<span class="ds-badge" data-tone="solid">現在</span> ' : ""}${mdAuto(s.desc)}</div></li>`;
  }).join("")}</ol>`);

  DS.component("flow", ctx => {
    const items = ctx.list();
    const chain = `<div class="ds-flow-chain"><ol>${items.map(it => {
      const s = splitItem(it.text);
      return `<li><div class="ds-flow-chain__box">${s.attrs.icon ? `<span class="ds-flow-chain__icon">${icon(s.attrs.icon)}</span>` : ""}` +
        `<p class="ds-flow-chain__title">${ctx.inline(s.title || s.desc)}</p>${s.title && s.desc ? `<p class="ds-flow-chain__desc">${ctx.inline(s.desc)}</p>` : ""}</div>` +
        `<span class="ds-flow-chain__arrow" aria-hidden="true">${icon("arrowRight")}</span></li>`;
    }).join("")}</ol></div>`;
    return items.length >= 5 || ctx.flags.has("wide") ? bleed(chain, "wide") : chain;
  });

  DS.component("layers", ctx => `<div class="ds-layers">${ctx.list().map((it, i) => {
    const s = splitItem(it.text);
    return `<div class="ds-layer" style="--depth:${i}"><div class="ds-layer__name">${s.attrs.icon ? icon(s.attrs.icon) : ""}${ctx.inline(s.title)}</div>` +
      `<div class="ds-layer__desc">${ctx.inline(s.desc)}</div></div>`;
  }).join("")}</div>`);

  const TREE_MARKS = { "+": "追加", "-": "削除", "~": "変更" };
  DS.component("tree", ctx => {
    const top = { children: [], indent: -1 };
    const stack = [top];
    for (const line of ctx.body.split("\n")) {
      if (!line.trim()) continue;
      const indent = line.match(/^\s*/)[0].replace(/\t/g, "  ").length;
      let text = line.trim();
      let mark = "";
      const mm = /^([+\-~])\s+/.exec(text);
      if (mm) { mark = mm[1]; text = text.slice(mm[0].length); }
      let note = "";
      const nm = /\s+#\s+(.*)$/.exec(text);
      if (nm) { note = nm[1]; text = text.slice(0, nm.index); }
      const node = { name: text, note, mark, indent, children: [] };
      while (stack.length > 1 && stack.at(-1).indent >= indent) stack.pop();
      stack.at(-1).children.push(node);
      stack.push(node);
    }
    const renderNodes = nodes => `<ul>${nodes.map(n => {
      const dir = n.name.endsWith("/") || n.children.length > 0;
      return `<li><span class="ds-tree__row" data-kind="${dir ? "dir" : "file"}"${n.mark ? ` data-mark="${n.mark}"` : ""}>${icon(dir ? "folder" : "file")}` +
        `<span class="ds-tree__name">${esc(n.name)}</span>${n.mark ? `<span class="ds-tree__mark" data-mark="${n.mark}">${TREE_MARKS[n.mark]}</span>` : ""}` +
        `${n.note ? `<span class="ds-tree__note">${mdInline(n.note)}</span>` : ""}</span>${n.children.length ? renderNodes(n.children) : ""}</li>`;
    }).join("")}</ul>`;
    return `<div class="ds-tree">${renderNodes(top.children)}</div>`;
  });

  DS.component("glossary", ctx => `<dl class="ds-glossary">${ctx.list().map(it => {
    const m = /^\*\*(.+?)\*\*(?:\s*[（(]([^）)]+)[）)])?\s*[:：—–]?\s*([\s\S]*)$/.exec(it.text);
    if (!m) return "";
    const term = m[1].trim();
    return `<dt id="${slugify(term, "term-")}" data-term="${esc(term)}">${esc(term)}${m[2] ? `<small>${esc(m[2])}</small>` : ""}</dt><dd>${mdAuto(m[3])}</dd>`;
  }).join("")}</dl>`);

  // 指標の横に置く小さな推移グラフ（spark=1,2,3）
  function sparkline(text) {
    const values = String(text || "").split(",").map(Number).filter(Number.isFinite);
    if (values.length < 2) return "";
    const w = 96;
    const h = 30;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const y = v => (max === min ? h / 2 : 3 + (h - 6) * (1 - (v - min) / (max - min)));
    const x = i => 2 + (i / (values.length - 1)) * (w - 4);
    const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    return `<svg class="ds-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="推移：${values.join("、")}"><path d="${d}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(values.length - 1)}" cy="${y(values.at(-1))}" r="3"/></svg>`;
  }
  DS.component("metrics", ctx => `<div class="ds-metrics">${ctx.list().map(it => {
    const ta = trailingAttrs(it.text.split("\n")[0]);
    const [value = "", label = "", note = ""] = ta.text.split("|").map(s => s.trim());
    const vm = /^([+\-−]?[\d.,]+)(.*)$/.exec(value);
    const tone = ta.flags.has("good") ? "good" : ta.flags.has("bad") ? "bad" : "";
    const sign = /[+＋]\s*\d/.test(note) ? "trendUp" : /[−-]\s*\d/.test(note) ? "trendDown" : "";
    const spark = sparkline(ta.attrs.spark);
    return `<div class="ds-metric"><div class="ds-metric__label">${mdInline(label)}</div>` +
      `<div class="ds-metric__row"><div class="ds-metric__value">${vm ? `${esc(vm[1])}<span class="ds-metric__unit">${esc(vm[2])}</span>` : mdInline(value)}</div>${spark}</div>` +
      `${note ? `<div class="ds-metric__delta"${tone ? ` data-tone="${tone}"` : ""}>${sign ? icon(sign) : ""}${mdInline(note)}</div>` : ""}</div>`;
  }).join("")}</div>`);

  function tabsHTML(items) {
    const gid = nextId("tabs");
    const tabs = items.map((t, i) => `<button class="ds-tabs__tab" type="button" role="tab" id="${gid}-t${i}" aria-controls="${gid}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${t.title}</button>`).join("");
    const panels = items.map((t, i) => `<div class="ds-tabs__panel ds-flow" role="tabpanel" id="${gid}-p${i}" aria-labelledby="${gid}-t${i}" tabindex="0"${i ? " hidden" : ""}>${t.body}</div>`).join("");
    return `<div class="ds-tabs" data-ds-hydrate="tabs"><div class="ds-tabs__list" role="tablist">${tabs}</div>${panels}</div>`;
  }
  DS.component("tabs", ctx => tabsHTML(ctx.sections().sections.map(s => ({ title: ctx.inline(s.title), body: ctx.md(s.body) }))));

  DS.component("details", ctx => {
    const label = ctx.words.filter(w => w !== "open").join(" ") || "詳細";
    return `<details class="ds-details"${ctx.flags.has("open") ? " open" : ""}><summary>${icon("chevronRight")}<span>${ctx.inline(label)}</span></summary><div class="ds-details__body ds-flow">${ctx.md(ctx.body)}</div></details>`;
  });

  DS.component("checklist", ctx => {
    const items = ctx.list();
    const key = ctx.attrs.id || nextId("check");
    return `<section class="ds-checklist" data-ds-hydrate="checklist" data-key="${esc(key)}"><header class="ds-checklist__head"><span class="ds-checklist__title">${ctx.inline(ctx.label || "確認項目")}</span>` +
      `<span class="ds-checklist__meter" aria-hidden="true"><span></span></span><span class="ds-checklist__count">0 / ${items.length}</span></header>` +
      `<ul>${items.map((it, i) => `<li><label><input type="checkbox" data-index="${i}"${it.checked ? " checked" : ""}><span>${mdInline(it.text.split("\n")[0])}</span></label></li>`).join("")}</ul>` +
      `<footer class="ds-checklist__foot"><span>チェックの状態は、このブラウザーにだけ保存されます。</span><button type="button" class="ds-btn" data-reset>すべて外す</button></footer></section>`;
  });

  DS.component("quiz", ctx => {
    const tokens = ctx.lex(ctx.body);
    const list = tokens.find(t => t.type === "list");
    const question = ctx.label || tokens.find(t => t.type === "paragraph")?.text || "";
    const options = (list?.items ?? []).map((it, i) => `<button type="button" class="ds-quiz__opt" data-correct="${Boolean(it.checked)}"><span class="ds-quiz__mark">${"ABCDEFGH"[i]}</span><span>${mdInline(it.text)}</span></button>`).join("");
    const quote = tokens.find(t => t.type === "blockquote");
    return `<section class="ds-quiz" data-ds-hydrate="quiz"><p class="ds-quiz__kicker">${icon("question")}理解度チェック</p><p class="ds-quiz__q">${mdInline(question)}</p>` +
      `<div class="ds-quiz__options">${options}</div><div class="ds-quiz__result" hidden></div><template class="ds-quiz__explain">${quote ? md(quote.text) : ""}</template></section>`;
  });

  DS.component("sources", ctx => `<ol class="ds-sources">${ctx.list().map(it => {
    const first = it.text.split("\n")[0];
    const url = /\]\((https?:[^)\s]+)/.exec(first)?.[1];
    let host = "";
    try { host = url ? new URL(url).hostname : ""; } catch { host = ""; }
    return `<li><div>${mdInline(first)}${host ? `<span class="ds-sources__host">${esc(host)}</span>` : ""}</div></li>`;
  }).join("")}</ol>`);

  DS.component("columns", ctx => `<div class="ds-columns">${ctx.sections().sections.map(s => `<section class="ds-flow"><p class="ds-columns__title">${ctx.inline(s.title)}</p>${ctx.md(s.body)}</section>`).join("")}</div>`);

  DS.component("wide", ctx => bleed(`<div class="ds-flow">${ctx.md(ctx.body)}</div>`, "wide"));

  const parseNumber = text => {
    const n = Number(String(text ?? "").replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  DS.component("chart", ctx => {
    const table = ctx.table();
    if (!table) return `<div class="ds-unknown">グラフには表が必要です。</div>`;
    const type = ctx.words.includes("line") ? "line" : "bar";
    const data = {
      type,
      title: ctx.attrs.title || "",
      sub: ctx.attrs.sub || "",
      unit: ctx.attrs.unit || "",
      target: ctx.attrs.target ? Number(ctx.attrs.target) : null,
      targetLabel: ctx.attrs.targetLabel || "",
      categories: table.rows.map(r => r[0]?.text ?? ""),
      series: table.header.slice(1).map((h, i) => ({ name: h.text, values: table.rows.map(r => parseNumber(r[i + 1]?.text)) }))
    };
    const legend = data.series.length > 1
      ? `<ul class="ds-chart__legend">${data.series.map((s, i) => `<li><i style="--c:var(--ds-series-${(i % 4) + 1})"></i>${esc(s.name)}</li>`).join("")}</ul>`
      : "";
    const summary = `${type === "line" ? "折れ線グラフ" : "棒グラフ"}：${data.title}。系列は${data.series.map(s => s.name).join("、")}。詳しい値は「表で見る」で確認できます。`;
    const id = slugify(ctx.attrs.id || `chart-${uid + 1}`, "fig-");
    return `<figure class="ds-figure ds-chart-figure" id="${id}" data-kind="chart" data-caption="${esc(data.title)}"><div class="ds-chart" data-ds-hydrate="chart">` +
      `<div class="ds-chart__head"><div class="ds-chart__titles"><p class="ds-chart__title"><span class="ds-figure__num"></span> ${esc(data.title)}</p>${data.sub ? `<p class="ds-chart__sub">${esc(data.sub)}</p>` : ""}</div>${legend}</div>` +
      `<div class="ds-chart__plot" role="img" aria-label="${esc(summary)}"></div>` +
      `<div class="ds-chart__foot"><button class="ds-btn" type="button" data-toggle-table aria-expanded="false">${icon("table")}<span>表で見る</span></button></div>` +
      `<div class="ds-chart__table ds-table" hidden>${tableHTML(table)}</div>` +
      `<script type="application/json" class="ds-chart__data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script></div></figure>`;
  });

  DS.component("example", ctx => {
    const source = ctx.body.replace(/^\n+|\s+$/g, "");
    const label = ctx.words.filter(w => w !== "stack").join(" ") || "見本";
    return bleed(`<section class="ds-example"${ctx.flags.has("stack") ? ' data-layout="stack"' : ""}><header class="ds-example__head"><span class="ds-example__name">${ctx.inline(label)}</span>` +
      `${ctx.attrs.tag ? `<code class="ds-example__tag">${esc(ctx.attrs.tag)}</code>` : ""}${ctx.attrs.desc ? `<p class="ds-example__desc">${ctx.inline(ctx.attrs.desc)}</p>` : ""}</header>` +
      `<div class="ds-example__grid"><div class="ds-example__preview ds-flow">${ctx.md(source)}</div>` +
      `<div class="ds-example__source"><div class="ds-example__source-label"><span>書き方</span><button class="ds-code__copy" type="button" data-copy-source>${icon("copy")}<span>コピー</span></button></div>` +
      `<pre tabindex="0"><code>${esc(source)}</code></pre></div></div></section>`, "wide");
  });

  /* ------------------------------------------------------------
     高機能な部品
     ------------------------------------------------------------ */
  // コード解説：コードの行末の「// (1)」を番号の印に置き換え、下の番号付きリストと結び付ける
  const PIN_MARK = /\s*(?:\/\/|#|--|;|\/\*|<!--)\s*\((\d+)\)\s*(?:\*\/|-->)?\s*$/;
  DS.component("annotate", ctx => {
    const tokens = ctx.lex(ctx.body);
    const code = tokens.find(t => t.type === "code");
    if (!code) return ctx.md(ctx.body);
    const info = parseInfo(code.lang);
    const pins = new Map();
    const lines = code.text.split("\n").map((line, i) => {
      const m = PIN_MARK.exec(line);
      if (!m) return line;
      pins.set(i + 1, Number(m[1]));
      return line.slice(0, m.index);
    });
    const list = tokens.find(t => t.type === "list");
    const notes = (list?.items ?? []).map((it, i) => `<li class="ds-anno__note" data-note="${i + 1}" tabindex="0"><span class="ds-anno__num" aria-hidden="true">${i + 1}</span><div class="ds-anno__text">${mdAuto(it.text)}</div></li>`).join("");
    return bleed(`<section class="ds-anno" data-ds-hydrate="annotate">${ctx.label ? `<p class="ds-anno__title">${icon("code")}${ctx.inline(ctx.label)}</p>` : ""}` +
      `<div class="ds-anno__grid"><div class="ds-anno__code">${codeBlockHTML(lines.join("\n"), info, pins)}</div><ol class="ds-anno__notes" aria-label="コードの解説">${notes}</ol></div></section>`, "wide");
  });

  // ターミナル：「$ 」で始まる行がコマンド、「# 」で始まる行が説明、それ以外が出力
  DS.component("terminal", ctx => {
    const commands = [];
    const rows = ctx.body.replace(/^\n+|\s+$/g, "").split("\n").map(line => {
      const m = /^(\$|❯)\s?(.*)$/.exec(line);
      if (m) {
        commands.push(m[2]);
        return `<div class="ds-tline is-cmd"><span class="ds-tline__prompt" aria-hidden="true">${esc(m[1])}</span><span class="ds-tline__cmd">${esc(m[2])}</span><button type="button" class="ds-tline__copy" data-copy="${esc(m[2])}" aria-label="このコマンドをコピーする">${icon("copy")}</button></div>`;
      }
      if (/^#\s/.test(line)) return `<div class="ds-tline is-note">${esc(line)}</div>`;
      return `<div class="ds-tline is-out">${esc(line) || "&nbsp;"}</div>`;
    }).join("");
    return `<div class="ds-bleed"><figure class="ds-terminal ds-bleed__inner"><figcaption class="ds-terminal__bar"><span class="ds-dots" aria-hidden="true"><i></i><i></i><i></i></span>` +
      `<span class="ds-terminal__title">${icon("terminal")}${esc(ctx.attrs.title || ctx.label || "ターミナル")}</span>` +
      `${commands.length ? `<button type="button" class="ds-terminal__copy" data-copy="${esc(commands.join("\n"))}">${icon("copy")}<span>コマンドをすべてコピー</span></button>` : ""}</figcaption>` +
      `<div class="ds-terminal__body" tabindex="0">${rows}</div></figure></div>`;
  });

  // 順を追った説明：「###」ごとに1画面ずつ進める
  DS.component("walkthrough", ctx => {
    const { sections } = ctx.sections();
    const n = sections.length;
    const steps = sections.map((s, i) => `<section class="ds-walk__step ds-flow" data-step="${i}"${i ? " hidden" : ""}><p class="ds-walk__step-title"><span>${i + 1}</span>${ctx.inline(s.title)}</p>${ctx.md(s.body)}</section>`).join("");
    const dots = sections.map((s, i) => `<li><button type="button" class="ds-walk__dot" data-go="${i}"${i === 0 ? ' aria-current="step"' : ""}><span class="ds-walk__dot-num">${i + 1}</span><span class="ds-walk__dot-label">${ctx.inline(s.title)}</span></button></li>`).join("");
    return bleed(`<section class="ds-walk" data-ds-hydrate="walkthrough" tabindex="0" aria-label="${esc(ctx.label || "順を追った説明")}（矢印キーで移動）">` +
      `<header class="ds-walk__head"><p class="ds-walk__title">${icon("list")}${ctx.inline(ctx.label || "順を追って見る")}</p><span class="ds-walk__count" aria-live="polite">1 / ${n}</span>` +
      `<button type="button" class="ds-btn ds-walk__all" aria-pressed="false">${icon("menu")}<span>すべて表示</span></button></header>` +
      `<ol class="ds-walk__dots" aria-label="手順の一覧">${dots}</ol><div class="ds-walk__body">${steps}</div>` +
      `<footer class="ds-walk__foot"><button type="button" class="ds-btn" data-move="-1">${icon("chevronLeft")}<span>前へ</span></button><div class="ds-walk__bar" aria-hidden="true"><span></span></div>` +
      `<button type="button" class="ds-btn ds-btn--primary" data-move="1"><span>次へ</span>${icon("chevronRight")}</button></footer></section>`, "wide");
  });

  // 絞り込みと並べ替えができる表
  DS.component("datatable", ctx => {
    const table = ctx.table();
    if (!table) return ctx.md(ctx.body);
    return `<div class="ds-bleed"><div class="ds-datatable ds-table ds-bleed__inner" data-ds-hydrate="datatable">` +
      `<div class="ds-datatable__tools">${ctx.label ? `<p class="ds-datatable__title">${ctx.inline(ctx.label)}</p>` : ""}<label class="ds-datatable__search">${icon("search")}<input type="search" placeholder="表の中を絞り込む" aria-label="表の中を絞り込む"></label>` +
      `<span class="ds-datatable__count" aria-live="polite"></span></div>${tableHTML(table, { sortable: true })}</div></div>`;
  });

  // APIの仕様：メソッドとパス、パラメーター、例（タブ）、エラー
  const HTTP_TONE = { GET: "note", POST: "ok", PUT: "warn", PATCH: "warn", DELETE: "danger" };
  const httpStatus = html => html.replace(/(^|[^\d])([1-5]\d\d)(?!\d)/, (_, pre, code) => `${pre}<span class="ds-http" data-class="${code[0]}xx">${code}</span>`);
  DS.component("api", ctx => {
    const [rawMethod = "GET", ...rest] = ctx.words;
    const method = rawMethod.toUpperCase();
    const path = rest.join(" ") || "/";
    const { intro, sections } = ctx.sections();
    const isExample = s => /^(例|リクエスト|応答|レスポンス)/.test(s.title);
    const examples = sections.filter(isExample);
    const others = sections.filter(s => !isExample(s));
    const pathHTML = esc(path).replace(/\{([^}]+)\}/g, '<span class="ds-api__var">{$1}</span>').replace(/:([a-zA-Z_]\w*)/g, '<span class="ds-api__var">:$1</span>');
    const blocks = others.map(s => `<section class="ds-api__sec"><p class="ds-api__sec-title">${httpStatus(ctx.inline(s.title))}</p>${ctx.md(s.body)}</section>`).join("");
    const exampleBox = examples.length ? `<section class="ds-api__sec"><p class="ds-api__sec-title">例</p>${tabsHTML(examples.map(s => ({ title: httpStatus(ctx.inline(s.title)), body: ctx.md(s.body) })))}</section>` : "";
    return `<div class="ds-bleed"><section class="ds-api ds-bleed__inner"><header class="ds-api__head">` +
      `<span class="ds-api__method" data-tone="${HTTP_TONE[method] || "tip"}">${esc(method)}</span><code class="ds-api__path">${pathHTML}</code>` +
      `<button type="button" class="ds-iconbtn ds-api__copy" data-copy="${esc(path)}" aria-label="パスをコピーする" title="パスをコピー">${icon("copy")}</button>` +
      `${ctx.attrs.auth ? `<span class="ds-badge" data-tone="warning">${icon("shield")}${esc(ctx.attrs.auth)}</span>` : ""}</header>` +
      `<div class="ds-api__body ds-flow">${ctx.md(intro)}${blocks}${exampleBox}</div></section></div>`;
  });

  // よくある質問
  DS.component("faq", ctx => {
    const { sections } = ctx.sections();
    const items = sections.map(s => `<details class="ds-faq__item"><summary><span class="ds-faq__mark" data-kind="q" aria-hidden="true">Q</span><span class="ds-faq__question">${ctx.inline(s.title)}</span>${icon("chevronDown", "ds-faq__chev")}</summary>` +
      `<div class="ds-faq__answer"><span class="ds-faq__mark" data-kind="a" aria-hidden="true">A</span><div class="ds-flow">${ctx.md(s.body)}</div></div></details>`).join("");
    return `<section class="ds-faq" data-ds-hydrate="faq"><header class="ds-faq__head"><p class="ds-faq__title">${icon("question")}${ctx.inline(ctx.label || "よくある質問")}<small>${sections.length}件</small></p>` +
      `<button type="button" class="ds-btn" data-toggle-all>すべて開く</button></header>${items}</section>`;
  });

  // 責任分担表（RACI）
  const RACI = { R: ["実行", "作業を実行する人"], A: ["責任", "最終的な責任を持つ人（1つの作業に1人）"], C: ["相談", "事前に相談を受ける人"], I: ["報告", "結果を知らされる人"] };
  const raciChips = text => {
    const keys = String(text).toUpperCase().split(/[^RACI]+/).join("").split("").filter((k, i, a) => RACI[k] && a.indexOf(k) === i);
    return keys.length
      ? keys.map(k => `<span class="ds-raci" data-r="${k}" title="${RACI[k][0]}：${RACI[k][1]}">${k}<span class="ds-visually-hidden">（${RACI[k][0]}）</span></span>`).join("")
      : '<span class="ds-raci__none" aria-label="関与なし">—</span>';
  };
  DS.component("raci", ctx => {
    const table = ctx.table();
    if (!table) return ctx.md(ctx.body);
    const head = table.header.map(c => `<th scope="col">${mdInline(c.text)}</th>`).join("");
    const rows = table.rows.map(r => {
      const accountable = r.slice(1).filter(c => /A/i.test(c.text)).length;
      const warn = accountable === 1 ? "" : `<span class="ds-raci__warn" title="責任（A）は1つの作業に1人だけにします">${icon("alert")}${accountable ? "責任者が複数" : "責任者がいない"}</span>`;
      return `<tr><th scope="row">${mdInline(r[0]?.text ?? "")}${warn}</th>${r.slice(1).map(c => `<td class="ds-raci__cell">${raciChips(c.text)}</td>`).join("")}</tr>`;
    }).join("");
    const legend = Object.entries(RACI).map(([k, [name, desc]]) => `<li><span class="ds-raci" data-r="${k}" aria-hidden="true">${k}</span><b>${name}</b><span>${desc}</span></li>`).join("");
    return `<div class="ds-bleed"><div class="ds-raci-table ds-table ds-bleed__inner"><ul class="ds-raci__legend" aria-label="記号の意味">${legend}</ul>` +
      `<div class="ds-table__scroll" tabindex="0"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
  });

  // リスク一覧：影響と起きやすさから優先度を計算し、表とヒートマップで示す
  const LEVEL = { 高: 3, 大: 3, 中: 2, 低: 1, 小: 1, high: 3, medium: 2, mid: 2, low: 1 };
  const LEVEL_NAME = { 3: "高", 2: "中", 1: "低" };
  const levelOf = text => LEVEL[String(text).trim().toLowerCase()] || LEVEL[String(text).trim()] || 0;
  const levelChip = v => (v ? `<span class="ds-level" data-level="${v}"><span class="ds-level__bars" aria-hidden="true"><i></i><i></i><i></i></span>${LEVEL_NAME[v]}</span>` : "—");
  const priorityOf = score => (score >= 6 ? ["最優先", "danger", "octagon"] : score >= 3 ? ["要対策", "warning", "alert"] : ["監視", "note", "info"]);
  DS.component("risks", ctx => {
    const table = ctx.table();
    if (!table) return ctx.md(ctx.body);
    const headers = table.header.map(c => c.text.trim());
    const iImpact = headers.findIndex(h => /影響/.test(h));
    const iLike = headers.findIndex(h => /起きやすさ|発生|頻度|可能性/.test(h));
    const rows = table.rows.map(r => {
      const impact = levelOf(r[iImpact]?.text);
      const like = levelOf(r[iLike]?.text);
      return { r, impact, like, score: impact * like };
    }).sort((a, b) => b.score - a.score);
    const head = `<th scope="col">優先度</th>${table.header.map(c => `<th scope="col">${mdInline(c.text)}</th>`).join("")}`;
    const body = rows.map(({ r, impact, like, score }) => {
      const [name, tone, ic] = priorityOf(score);
      return `<tr><td><span class="ds-badge" data-tone="${tone}">${icon(ic)}${name}</span></td>${r.map((c, i) => (i === iImpact ? `<td>${levelChip(impact)}</td>` : i === iLike ? `<td>${levelChip(like)}</td>` : `<td>${decorateSymbol(mdInline(c.text))}</td>`)).join("")}</tr>`;
    }).join("");
    let heat = "";
    for (let l = 3; l >= 1; l -= 1) {
      heat += `<span class="ds-heat__axis">${LEVEL_NAME[l]}</span>`;
      for (let im = 1; im <= 3; im += 1) {
        const count = rows.filter(x => x.like === l && x.impact === im).length;
        heat += `<span class="ds-heat__cell" data-score="${l * im}" title="起きやすさ${LEVEL_NAME[l]}・影響${LEVEL_NAME[im]}：${count}件">${count || ""}</span>`;
      }
    }
    heat += `<span></span>${[1, 2, 3].map(im => `<span class="ds-heat__axis">${LEVEL_NAME[im]}</span>`).join("")}`;
    return `<div class="ds-bleed" data-size="wide"><div class="ds-bleed__inner ds-risks"><figure class="ds-heat" aria-label="リスクの分布"><div class="ds-heat__grid">${heat}</div>` +
      `<figcaption><span>縦：起きやすさ</span><span>横：影響</span></figcaption></figure>` +
      `<div class="ds-table"><div class="ds-table__scroll" tabindex="0"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div></div></div>`;
  });

  // ロードマップ
  const PHASE = { done: ["完了", "checkCircle"], doing: ["進行中", "clock"], todo: ["予定", "calendar"], hold: ["保留", "pause"] };
  const PHASE_ALIAS = { 完了: "done", 進行中: "doing", 予定: "todo", 保留: "hold" };
  DS.component("roadmap", ctx => {
    const items = ctx.list().map(it => {
      const s = splitItem(it.text);
      const flag = [...s.flags].map(f => PHASE_ALIAS[f] || f).find(f => PHASE[f]) || "todo";
      const [name, ...detail] = s.desc.split(/\s+[—–]\s+/);
      const [label, ic] = PHASE[flag];
      return `<li class="ds-roadmap__item" data-status="${flag}"><span class="ds-roadmap__marker" aria-hidden="true">${icon(ic)}</span>` +
        `<div class="ds-roadmap__text"><span class="ds-roadmap__period">${ctx.inline(s.title)}</span><span class="ds-roadmap__status">${label}${flag === "doing" ? "（現在）" : ""}</span>` +
        `<p class="ds-roadmap__name">${mdInline(name || "")}</p>${detail.length ? `<p class="ds-roadmap__detail">${mdInline(detail.join(" — "))}</p>` : ""}</div></li>`;
    }).join("");
    return bleed(`<ol class="ds-roadmap">${items}</ol>`, "wide");
  });

  // 進み具合
  DS.component("progress", ctx => {
    const items = ctx.list().map(it => {
      const ta = trailingAttrs(it.text.split("\n")[0]);
      const [label = "", value = "0", note = ""] = ta.text.split("|").map(x => x.trim());
      const v = Math.max(0, Math.min(100, Number.parseFloat(value) || 0));
      const tone = v >= 100 ? "done" : ta.flags.has("warn") || ta.flags.has("遅れ") ? "warn" : "doing";
      return { label, v, note, tone };
    });
    const avg = items.length ? Math.round(items.reduce((a, x) => a + x.v, 0) / items.length) : 0;
    return `<section class="ds-meter"><header class="ds-meter__head"><p>${ctx.inline(ctx.label || "進み具合")}</p><span>全体 <b>${avg}%</b></span></header><ul>` +
      items.map(x => `<li data-tone="${x.tone}"><span class="ds-meter__label">${mdInline(x.label)}${x.tone === "done" ? `<span class="ds-badge" data-tone="note">${icon("check")}完了</span>` : x.tone === "warn" ? `<span class="ds-badge" data-tone="warning">${icon("alert")}遅れ</span>` : ""}</span>` +
        `<span class="ds-meter__bar" role="progressbar" aria-valuenow="${x.v}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(x.label)}"><span style="width:${x.v}%"></span></span><span class="ds-meter__value">${x.v}%</span>` +
        `${x.note ? `<span class="ds-meter__note">${mdInline(x.note)}</span>` : ""}</li>`).join("") + "</ul></section>";
  });

  // 判断ガイド：入れ子の箇条書きを、質問に答えて進む対話形式にする
  DS.component("guide", ctx => {
    const list = ctx.lex(ctx.body).find(t => t.type === "list");
    if (!list) return ctx.md(ctx.body);
    const toNode = item => {
      const sub = item.tokens.find(t => t.type === "list");
      const text = item.tokens.filter(t => t.type !== "list").map(t => t.raw).join("").trim();
      return { text, children: sub ? sub.items.map(toNode) : [] };
    };
    const roots = list.items.map(toNode);
    const tree = roots.length === 1 ? roots[0] : { text: ctx.label || "どれに当てはまりますか？", children: roots };
    const serialize = (node, isAnswer) => ({ html: isAnswer ? mdAuto(node.text) : mdInline(node.text), children: node.children.map(opt => ({ html: mdInline(opt.text), next: opt.children[0] ? serialize(opt.children[0], opt.children[0].children.length === 0) : null })) });
    const data = serialize(tree, tree.children.length === 0);
    return `<section class="ds-guide" data-ds-hydrate="guide"><header class="ds-guide__head"><p class="ds-guide__title">${icon("branch")}${ctx.inline(ctx.label || "判断ガイド")}</p>` +
      `<button type="button" class="ds-btn" data-restart>${icon("history")}<span>最初から</span></button><button type="button" class="ds-btn" data-outline aria-pressed="false">${icon("list")}<span>全体を表示</span></button></header>` +
      `<ol class="ds-guide__trail" aria-label="これまでの回答"></ol><div class="ds-guide__stage" aria-live="polite"></div>` +
      `<div class="ds-guide__outline ds-flow" hidden>${ctx.md(ctx.body)}</div>` +
      `<script type="application/json" class="ds-guide__data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script></section>`;
  });

  // 項目と値の一覧
  DS.component("keyvalue", ctx => `<dl class="ds-kv" data-cols="${esc(ctx.attrs.cols || "")}">${ctx.list().map(it => {
    const [k, ...v] = it.text.split("|");
    return `<div class="ds-kv__row"><dt>${mdInline(k.trim())}</dt><dd>${mdInline(v.join("|").trim())}</dd></div>`;
  }).join("")}</dl>`);

  // 画面の枠（ブラウザー・スマホ）
  DS.component("frame", ctx => {
    const phone = ctx.words.includes("phone");
    const caption = ctx.attrs.caption || ctx.attrs.title || "";
    const screen = `<div class="ds-frame__screen ds-flow">${ctx.md(ctx.body)}</div>`;
    const cap = caption ? `<figcaption class="ds-figure__caption">${ctx.inline(caption)}</figcaption>` : "";
    if (phone) return `<figure class="ds-frame" data-kind="phone"><div class="ds-frame__device"><span class="ds-frame__notch" aria-hidden="true"></span>${screen}</div>${cap}</figure>`;
    return `<div class="ds-bleed"><figure class="ds-frame ds-bleed__inner" data-kind="browser"><div class="ds-frame__window"><div class="ds-frame__bar"><span class="ds-dots" aria-hidden="true"><i></i><i></i><i></i></span>` +
      `<span class="ds-frame__url">${icon("shield")}${esc(ctx.attrs.url || "")}</span></div>${screen}</div>${cap}</figure></div>`;
  });

  /* 行内の部品 */
  DS.inline("badge", ({ text, attrs, words }) => `<span class="ds-badge" data-tone="${esc(attrs.tone || words[0] || "")}">${attrs.icon ? icon(attrs.icon) : ""}${esc(text)}</span>`);
  DS.inline("kbd", ({ text }) => text.split(/\s*\+\s*/).map(k => `<kbd>${esc(k)}</kbd>`).join("<span aria-hidden=\"true\"> + </span>"));
  DS.inline("term", ({ text }) => `<button type="button" class="ds-term" data-term="${esc(text)}">${esc(text)}</button>`);
  DS.inline("ref", ({ text }) => `<a class="ds-ref" href="#fig-${esc(text)}" data-ref="fig-${esc(text)}">図</a>`);
  DS.inline("fact", ({ text }) => `<span class="ds-evidence" data-kind="fact" title="根拠を確認済みの事実">${icon("checkCircle")}${esc(text || "確認済み")}</span>`);
  DS.inline("guess", ({ text }) => `<span class="ds-evidence" data-kind="guess" title="根拠が未確認の推測">${icon("question")}${esc(text || "推測")}</span>`);
  DS.inline("icon", ({ text }) => icon(text, "ds-inline-icon"));
  DS.inline("mark", ({ text }) => `<mark>${mdInline(text)}</mark>`);
  const STATUS_CHIPS = {
    完了: ["done", "checkCircle"], 済み: ["done", "checkCircle"], 進行中: ["doing", "clock"], 対応中: ["doing", "clock"],
    未着手: ["todo", "circle"], 予定: ["todo", "calendar"], 保留: ["hold", "pause"], 中止: ["stop", "x"], 要確認: ["check", "alert"], 確認待ち: ["check", "alert"]
  };
  DS.inline("status", ({ text }) => {
    const [kind, ic] = STATUS_CHIPS[text] || ["", "dot"];
    return `<span class="ds-status-chip" data-kind="${kind}">${icon(ic)}${esc(text)}</span>`;
  });
  DS.inline("copy", ({ text }) => `<button type="button" class="ds-copyable" data-copy="${esc(text)}" title="クリックしてコピー"><code>${esc(text)}</code>${icon("copy")}</button>`);
  DS.inline("abbr", ({ text, attrs }) => `<button type="button" class="ds-term ds-abbr" data-term="${esc(text)}" data-abbr="${esc(attrs.title || attrs.full || "")}">${esc(text)}</button>`);
  DS.inline("progress", ({ text }) => {
    const v = Math.max(0, Math.min(100, Number.parseFloat(text) || 0));
    return `<span class="ds-minibar" role="progressbar" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100"><span style="width:${v}%"></span></span><b class="ds-minibar__value">${v}%</b>`;
  });
  DS.inline("btn", ({ text, flags }) => `<span class="ds-uibtn${flags.has("primary") ? " is-primary" : flags.has("danger") ? " is-danger" : ""}">${esc(text)}</span>`);

  /* ------------------------------------------------------------
     描画後の処理
     ------------------------------------------------------------ */
  const terms = new Map();
  function postProcess(article) {
    for (const h of article.querySelectorAll(":scope > h2, :scope > h3, :scope > h4")) {
      const text = h.textContent.trim();
      if (!h.id) h.id = slugify(text);
      const anchor = fromHTML(`<a class="ds-anchor" href="#${h.id}" aria-label="「${esc(text)}」へのリンク">${icon("hash")}</a>`);
      h.prepend(anchor);
    }
    for (const p of article.querySelectorAll(":scope > p")) {
      const img = p.querySelector(":scope > img:only-child");
      if (!img || p.textContent.trim()) continue;
      const caption = img.getAttribute("title") || img.getAttribute("alt") || "";
      const fig = fromHTML(`<div class="ds-bleed"><figure class="ds-figure ds-bleed__inner" id="${slugify(caption || "image", "fig-")}" data-kind="image" data-caption="${esc(caption)}"><div class="ds-figure__frame"></div><figcaption><span class="ds-figure__num"></span><span>${esc(caption)}</span></figcaption></figure></div>`);
      fig.querySelector(".ds-figure__frame").append(img);
      p.replaceWith(fig);
    }
    const figures = [...article.querySelectorAll(".ds-figure")].map((fig, i) => {
      const num = `図${i + 1}`;
      for (const n of fig.querySelectorAll(".ds-figure__num")) n.textContent = num;
      fig.dataset.num = num;
      return { id: fig.id, num, caption: fig.dataset.caption || "", kind: fig.dataset.kind };
    });
    for (const ref of article.querySelectorAll(".ds-ref")) {
      const target = figures.find(f => f.id === ref.dataset.ref);
      ref.textContent = target ? target.num : "（参照先の図がありません）";
      if (!target) ref.classList.add("ds-ref--missing");
    }
    terms.clear();
    for (const dt of article.querySelectorAll(".ds-glossary dt[data-term]")) {
      terms.set(dt.dataset.term, { id: dt.id, html: dt.nextElementSibling?.innerHTML ?? "" });
    }
    for (const a of article.querySelectorAll('a[href^="http"]')) {
      try {
        if (new URL(a.href).host === location.host) continue;
      } catch { continue; }
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      if (!a.classList.contains("ds-card")) a.classList.add("ds-external");
    }
    if (footnotes.order.length) {
      const list = footnotes.order.map(key => `<li id="fn-${esc(key)}">${mdInline(footnotes.notes.get(key))} <a href="#fnref-${esc(key)}" aria-label="本文へ戻る">↩</a></li>`).join("");
      article.append(fromHTML(`<section class="ds-footnotes" aria-label="脚注"><ol>${list}</ol></section>`));
    }
    return figures;
  }

  function collectToc(article) {
    const toc = [];
    for (const h of article.querySelectorAll(":scope > h2, :scope > h3")) {
      const item = { id: h.id, text: h.textContent.trim(), level: Number(h.tagName[1]), children: [] };
      if (item.level === 2 || !toc.length) toc.push(item);
      else toc.at(-1).children.push(item);
    }
    return toc;
  }
  const tocHTML = toc => `<ol>${toc.map(t => `<li><a href="#${esc(t.id)}" data-toc="${esc(t.id)}">${esc(t.text)}</a>${t.children.length ? tocHTML(t.children) : ""}</li>`).join("")}</ol>`;

  /* ------------------------------------------------------------
     対話する部品
     ------------------------------------------------------------ */
  DS.hydrate("tabs", box => {
    const tabs = [...box.querySelectorAll(":scope > .ds-tabs__list > .ds-tabs__tab")];
    const select = (tab, focus = false) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      }
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(tab));
      tab.addEventListener("keydown", e => {
        const move = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
        if (move === undefined) return;
        e.preventDefault();
        e.stopPropagation();
        select(tabs[(i + move + tabs.length) % tabs.length], true);
      });
    });
  });

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  }
  function flashCopied(button) {
    const label = button.querySelector("span");
    const before = label?.textContent;
    button.dataset.copied = "true";
    if (label) label.textContent = "コピーしました";
    setTimeout(() => { button.dataset.copied = "false"; if (label) label.textContent = before; }, 1600);
  }
  DS.hydrate("code", fig => {
    fig.querySelector(".ds-code__copy")?.addEventListener("click", async e => {
      const raw = fig.querySelector(".ds-code__raw").content.textContent;
      if (await copyText(raw)) flashCopied(e.currentTarget);
    });
  });

  DS.hydrate("checklist", box => {
    const inputs = [...box.querySelectorAll("input[type=checkbox]")];
    const key = `ds:check:${location.pathname}:${box.dataset.key}`;
    let saved = null;
    try { saved = JSON.parse(storage.get(key) || "null"); } catch { saved = null; }
    if (Array.isArray(saved)) inputs.forEach((input, i) => { input.checked = Boolean(saved[i]); });
    const update = () => {
      const done = inputs.filter(i => i.checked).length;
      box.querySelector(".ds-checklist__count").textContent = `${done} / ${inputs.length}`;
      box.querySelector(".ds-checklist__meter span").style.setProperty("--done", `${inputs.length ? (done / inputs.length) * 100 : 0}%`);
      storage.set(key, JSON.stringify(inputs.map(i => i.checked)));
    };
    for (const input of inputs) input.addEventListener("change", update);
    box.querySelector("[data-reset]").addEventListener("click", () => { for (const input of inputs) input.checked = false; update(); });
    update();
  });

  DS.hydrate("quiz", box => {
    const options = [...box.querySelectorAll(".ds-quiz__opt")];
    const result = box.querySelector(".ds-quiz__result");
    const explain = box.querySelector(".ds-quiz__explain").innerHTML;
    for (const opt of options) {
      opt.addEventListener("click", () => {
        const ok = opt.dataset.correct === "true";
        for (const o of options) {
          o.disabled = true;
          if (o.dataset.correct === "true") o.classList.add("is-correct");
        }
        if (!ok) opt.classList.add("is-wrong");
        result.hidden = false;
        result.dataset.ok = String(ok);
        result.innerHTML = `<b>${ok ? "正解です。" : "残念、違います。"}</b>${explain}<button type="button" class="ds-btn ds-quiz__retry">${icon("history")}<span>もう一度</span></button>`;
        result.querySelector(".ds-quiz__retry").addEventListener("click", () => {
          for (const o of options) { o.disabled = false; o.classList.remove("is-correct", "is-wrong"); }
          result.hidden = true;
        });
      });
    }
  });

  DS.hydrate("chart", box => {
    const plot = box.querySelector(".ds-chart__plot");
    const data = JSON.parse(box.querySelector(".ds-chart__data").textContent);
    const toggle = box.querySelector("[data-toggle-table]");
    const table = box.querySelector(".ds-chart__table");
    toggle.addEventListener("click", () => {
      table.hidden = !table.hidden;
      toggle.setAttribute("aria-expanded", String(!table.hidden));
      toggle.querySelector("span").textContent = table.hidden ? "表で見る" : "表を閉じる";
    });
    const draw = () => {
      const width = Math.round(plot.clientWidth);
      if (width < 60 || Number(plot.dataset.width) === width) return;
      plot.dataset.width = String(width);
      (data.type === "line" ? drawLineChart : drawBarChart)(plot, data, width);
    };
    new ResizeObserver(draw).observe(plot);
    draw();
  });

  const fmt = v => Number(v).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
  const textWidth = (s, size = 12.5) => [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e7f ? size : size * 0.6), 0);
  function niceTicks(max, count = 4) {
    if (!(max > 0)) return [0, 1];
    const raw = max / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const ticks = [];
    for (let v = 0; v <= Math.ceil(max / step) * step + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
    return ticks;
  }
  const seriesColor = i => `var(--ds-series-${(i % 4) + 1})`;
  function chartTip(plot) {
    let tip = plot.querySelector(".ds-chart__tip");
    if (!tip) { tip = document.createElement("div"); tip.className = "ds-chart__tip"; tip.hidden = true; plot.append(tip); }
    return tip;
  }
  function barPath(x, y, w, h, r) {
    const rr = Math.min(r, w, h / 2);
    if (w <= 0) return "";
    return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
  }
  function drawBarChart(plot, data, W) {
    const n = data.categories.length;
    const S = data.series.length;
    const labelW = Math.min(W * 0.36, Math.max(...data.categories.map(c => textWidth(c))) + 14);
    const valueW = Math.max(...data.series.flatMap(s => s.values).map(v => textWidth(fmt(v) + data.unit, 12))) + 14;
    const left = labelW;
    const plotW = Math.max(40, W - left - valueW);
    const barH = 18;
    const gap = 3;
    const pad = 11;
    const rowH = S * barH + (S - 1) * gap + pad * 2;
    const top = 2;
    const H = top + n * rowH + 24;
    const max = Math.max(...data.series.flatMap(s => s.values), data.target ?? 0);
    const ticks = niceTicks(max);
    const xMax = ticks.at(-1);
    const x = v => left + (v / xMax) * plotW;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`;
    for (const t of ticks) {
      svg += `<line class="ds-grid" x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${top + n * rowH}"/><text class="ds-axis-label" x="${x(t)}" y="${H - 6}" text-anchor="middle">${fmt(t)}</text>`;
    }
    svg += `<line class="ds-baseline" x1="${left}" x2="${left}" y1="${top}" y2="${top + n * rowH}"/>`;
    data.categories.forEach((c, i) => {
      const y0 = top + i * rowH;
      svg += `<text class="ds-cat-label" x="${left - 10}" y="${y0 + rowH / 2}" text-anchor="end" dominant-baseline="central">${esc(c)}</text>`;
      data.series.forEach((s, j) => {
        const v = s.values[i];
        const y = y0 + pad + j * (barH + gap);
        const w = Math.max(0, x(v) - left);
        svg += `<path d="${barPath(left, y, w, barH, 4)}" style="fill:${seriesColor(j)}"/>`;
        svg += `<text class="ds-value-label" x="${left + w + 6}" y="${y + barH / 2}" dominant-baseline="central">${fmt(v)}${esc(data.unit)}</text>`;
      });
      svg += `<rect class="ds-hit" data-i="${i}" x="0" y="${y0}" width="${W}" height="${rowH}" fill="transparent"/>`;
    });
    if (data.target != null) {
      svg += `<line class="ds-target" x1="${x(data.target)}" x2="${x(data.target)}" y1="${top}" y2="${top + n * rowH}"/>`;
    }
    svg += "</svg>";
    plot.innerHTML = svg;
    const tip = chartTip(plot);
    for (const hit of plot.querySelectorAll(".ds-hit")) {
      const i = Number(hit.dataset.i);
      const show = () => {
        tip.hidden = false;
        tip.innerHTML = `<b>${esc(data.categories[i])}</b>${data.series.map((s, j) => `<span><span style="display:inline-flex;align-items:center;gap:6px"><i style="--c:${seriesColor(j)}"></i>${esc(s.name)}</span><em>${fmt(s.values[i])}${esc(data.unit)}</em></span>`).join("")}`;
        const maxV = Math.max(...data.series.map(s => s.values[i]));
        tip.style.left = `${Math.min(W - 70, Math.max(70, x(maxV)))}px`;
        tip.style.top = `${top + i * rowH + 6}px`;
        hit.setAttribute("fill", "color-mix(in srgb, var(--ds-accent) 5%, transparent)");
      };
      const hide = () => { tip.hidden = true; hit.setAttribute("fill", "transparent"); };
      hit.addEventListener("pointerenter", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", hide);
    }
  }
  function drawLineChart(plot, data, W) {
    const n = data.categories.length;
    const S = data.series.length;
    const H = Math.round(Math.min(340, Math.max(220, W * 0.4)));
    const all = data.series.flatMap(s => s.values).concat(data.target ?? []);
    const ticks = niceTicks(Math.max(...all));
    const yMax = ticks.at(-1);
    const left = Math.max(...ticks.map(t => textWidth(fmt(t), 11.5))) + 12;
    const direct = S > 1 && S <= 4 && W > 520;
    const right = direct ? Math.min(130, Math.max(...data.series.map(s => textWidth(s.name, 12))) + 22) : 14;
    const top = 12;
    const bottom = 28;
    const pw = W - left - right;
    const ph = H - top - bottom;
    const x = i => left + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
    const y = v => top + ph - (v / yMax) * ph;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`;
    for (const t of ticks) {
      svg += `<line class="${t === 0 ? "ds-baseline" : "ds-grid"}" x1="${left}" x2="${left + pw}" y1="${y(t)}" y2="${y(t)}"/><text class="ds-axis-label" x="${left - 8}" y="${y(t)}" text-anchor="end" dominant-baseline="central">${fmt(t)}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 64))));
    data.categories.forEach((c, i) => {
      if (i % every === 0 || i === n - 1) svg += `<text class="ds-axis-label" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(c)}</text>`;
    });
    if (data.target != null) {
      svg += `<line class="ds-target" x1="${left}" x2="${left + pw}" y1="${y(data.target)}" y2="${y(data.target)}"/>`;
      if (data.targetLabel) svg += `<text class="ds-target-label" x="${left + 6}" y="${y(data.target) - 7}">${esc(data.targetLabel)}</text>`;
    }
    data.series.forEach((s, j) => {
      const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
      svg += `<path d="${d}" fill="none" style="stroke:${seriesColor(j)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      svg += `<circle cx="${x(n - 1)}" cy="${y(s.values[n - 1])}" r="4" style="fill:${seriesColor(j)};stroke:var(--ds-surface)" stroke-width="2"/>`;
    });
    if (direct) {
      const labels = data.series.map((s, j) => ({ j, name: s.name, y: y(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
      for (let k = 1; k < labels.length; k += 1) labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 15);
      for (const l of labels) svg += `<text class="ds-cat-label" x="${x(n - 1) + 10}" y="${l.y}" dominant-baseline="central">${esc(l.name)}</text>`;
    }
    svg += `<g class="ds-hover" visibility="hidden"><line class="ds-crosshair" y1="${top}" y2="${top + ph}"/>${data.series.map((_, j) => `<circle r="4.5" style="fill:${seriesColor(j)};stroke:var(--ds-surface)" stroke-width="2"/>`).join("")}</g>`;
    svg += `<rect class="ds-overlay" x="${left}" y="${top}" width="${pw}" height="${ph}" fill="transparent"/>`;
    svg += "</svg>";
    plot.innerHTML = svg;
    const tip = chartTip(plot);
    const hover = plot.querySelector(".ds-hover");
    const overlay = plot.querySelector(".ds-overlay");
    const move = e => {
      const r = overlay.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
      hover.setAttribute("visibility", "visible");
      const line = hover.querySelector("line");
      line.setAttribute("x1", x(i));
      line.setAttribute("x2", x(i));
      hover.querySelectorAll("circle").forEach((c, j) => { c.setAttribute("cx", x(i)); c.setAttribute("cy", y(data.series[j].values[i])); });
      tip.hidden = false;
      tip.innerHTML = `<b>${esc(data.categories[i])}</b>${data.series.map((s, j) => `<span><span style="display:inline-flex;align-items:center;gap:6px"><i style="--c:${seriesColor(j)}"></i>${esc(s.name)}</span><em>${fmt(s.values[i])}${esc(data.unit)}</em></span>`).join("")}`;
      const scaleX = plot.clientWidth / W;
      tip.style.left = `${Math.min(plot.clientWidth - 80, Math.max(80, x(i) * scaleX))}px`;
      tip.style.top = `${Math.min(...data.series.map(s => y(s.values[i]))) * scaleX}px`;
    };
    overlay.addEventListener("pointermove", move);
    overlay.addEventListener("pointerdown", move);
    overlay.addEventListener("pointerleave", () => { hover.setAttribute("visibility", "hidden"); tip.hidden = true; });
  }

  /* 用語の吹き出し */
  let popover = null;
  let popoverFor = null;
  let popoverTimer = 0;
  function hidePopover() {
    clearTimeout(popoverTimer);
    popover?.remove();
    popover = null;
    popoverFor = null;
  }
  function showPopover(button) {
    if (popoverFor === button) return;
    hidePopover();
    const term = button.dataset.term;
    const abbr = button.dataset.abbr;
    const entry = abbr ? null : terms.get(term);
    const body = abbr ? esc(abbr) : entry ? `${entry.html}<br><a href="#${entry.id}">用語集で見る</a>` : "用語集に定義がありません。";
    popover = fromHTML(`<div class="ds-popover" role="tooltip"><span class="ds-popover__term">${esc(term)}</span>${body}</div>`);
    document.body.append(popover);
    popoverFor = button;
    const r = button.getBoundingClientRect();
    const pw = popover.offsetWidth;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), innerWidth - pw - 12);
    let top = r.bottom + 8;
    if (top + popover.offsetHeight > innerHeight - 12) top = r.top - popover.offsetHeight - 8;
    popover.style.left = `${left + scrollX}px`;
    popover.style.top = `${top + scrollY}px`;
    popover.addEventListener("pointerenter", () => clearTimeout(popoverTimer));
    popover.addEventListener("pointerleave", () => { popoverTimer = setTimeout(hidePopover, 200); });
  }
  function bindTerms() {
    document.addEventListener("pointerover", e => {
      const b = e.target.closest?.(".ds-term");
      if (b && e.pointerType === "mouse") { clearTimeout(popoverTimer); popoverTimer = setTimeout(() => showPopover(b), 120); }
    });
    document.addEventListener("pointerout", e => {
      const b = e.target.closest?.(".ds-term");
      if (b && e.pointerType === "mouse") { clearTimeout(popoverTimer); popoverTimer = setTimeout(hidePopover, 220); }
    });
    document.addEventListener("click", e => {
      const b = e.target.closest?.(".ds-term");
      if (b) { if (popoverFor === b) hidePopover(); else showPopover(b); return; }
      if (popover && !e.target.closest(".ds-popover")) hidePopover();
    });
    document.addEventListener("focusin", e => { const b = e.target.closest?.(".ds-term"); if (b) showPopover(b); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") hidePopover(); });
  }

  DS.hydrate("annotate", box => {
    const activate = n => {
      for (const el of box.querySelectorAll(".is-active")) el.classList.remove("is-active");
      if (!n) return;
      for (const el of box.querySelectorAll(`[data-pin="${n}"], [data-note="${n}"], [data-line-pin="${n}"]`)) el.classList.add("is-active");
    };
    const pick = e => e.target.closest?.("[data-pin], [data-note], [data-line-pin]");
    const key = el => el.dataset.pin || el.dataset.note || el.dataset.linePin;
    box.addEventListener("pointerover", e => { const t = pick(e); if (t) activate(key(t)); });
    box.addEventListener("pointerleave", () => activate(null));
    box.addEventListener("focusin", e => { const t = pick(e); if (t) activate(key(t)); });
    box.addEventListener("click", e => {
      const pin = e.target.closest("[data-pin]");
      if (!pin) return;
      const note = box.querySelector(`[data-note="${pin.dataset.pin}"]`);
      note?.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
      note?.focus({ preventScroll: true });
      activate(pin.dataset.pin);
    });
  });

  DS.hydrate("walkthrough", box => {
    const steps = [...box.querySelectorAll(":scope > .ds-walk__body > .ds-walk__step")];
    const dots = [...box.querySelectorAll(".ds-walk__dot")];
    const all = box.querySelector(".ds-walk__all");
    let index = 0;
    const go = i => {
      index = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach((s, k) => { s.hidden = box.dataset.all !== "true" && k !== index; });
      dots.forEach((d, k) => { if (k === index) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current"); d.dataset.done = String(k < index); });
      box.querySelector(".ds-walk__count").textContent = `${index + 1} / ${steps.length}`;
      box.querySelector(".ds-walk__bar span").style.width = `${((index + 1) / steps.length) * 100}%`;
      box.querySelector('[data-move="-1"]').disabled = index === 0;
      box.querySelector('[data-move="1"]').disabled = index === steps.length - 1;
    };
    box.dsGoTo = go;
    box.addEventListener("click", e => {
      const move = e.target.closest("[data-move]");
      if (move) { go(index + Number(move.dataset.move)); return; }
      const dot = e.target.closest("[data-go]");
      if (dot) go(Number(dot.dataset.go));
    });
    all.addEventListener("click", () => {
      const on = box.dataset.all !== "true";
      box.dataset.all = String(on);
      all.setAttribute("aria-pressed", String(on));
      all.querySelector("span").textContent = on ? "1つずつ表示" : "すべて表示";
      go(index);
    });
    box.addEventListener("keydown", e => {
      if (e.target.closest("input, textarea, [role=tab]")) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      go(index + (e.key === "ArrowRight" ? 1 : -1));
    });
    go(0);
  });

  const normalizeText = s => String(s).normalize("NFKC").toLowerCase();
  DS.hydrate("datatable", box => {
    const tbody = box.querySelector("tbody");
    const rows = [...tbody.rows];
    const input = box.querySelector("input[type=search]");
    const count = box.querySelector(".ds-datatable__count");
    const empty = fromHTML(`<tr class="ds-datatable__empty"><td colspan="${rows[0]?.cells.length || 1}">条件に合う行がありません。</td></tr>`);
    const numeric = col => rows.every(r => { const t = r.cells[col]?.textContent.trim() ?? ""; return t === "" || /^[-+−]?[\d,.]+\s*[%％]?[^\d]{0,3}$/.test(t); });
    const value = (r, col, num) => { const t = r.cells[col]?.textContent.trim() ?? ""; return num ? Number.parseFloat(t.replace(/[^\d.\-]/g, "")) || 0 : t; };
    const apply = () => {
      const terms = normalizeText(input.value).split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const r of rows) {
        const hit = terms.every(t => normalizeText(r.textContent).includes(t));
        r.hidden = !hit;
        if (hit) shown += 1;
      }
      if (!shown) tbody.append(empty); else empty.remove();
      count.textContent = terms.length ? `${rows.length}件中 ${shown}件を表示` : `全${rows.length}件`;
    };
    input.addEventListener("input", apply);
    box.querySelectorAll(".ds-sort").forEach(button => {
      button.addEventListener("click", () => {
        const th = button.closest("th");
        const col = Number(button.dataset.col);
        const next = { none: "ascending", ascending: "descending", descending: "none" }[th.getAttribute("aria-sort") || "none"];
        box.querySelectorAll("th[aria-sort]").forEach(h => h.setAttribute("aria-sort", "none"));
        th.setAttribute("aria-sort", next);
        const num = numeric(col);
        const sorted = next === "none" ? rows : [...rows].sort((a, b) => {
          const x = value(a, col, num);
          const y = value(b, col, num);
          const c = num ? x - y : String(x).localeCompare(String(y), "ja");
          return next === "ascending" ? c : -c;
        });
        tbody.append(...sorted);
        if (empty.isConnected) tbody.append(empty);
      });
    });
    apply();
  });

  DS.hydrate("faq", box => {
    const items = [...box.querySelectorAll(".ds-faq__item")];
    const button = box.querySelector("[data-toggle-all]");
    const paint = () => { button.textContent = items.every(d => d.open) ? "すべて閉じる" : "すべて開く"; };
    button.addEventListener("click", () => { const open = !items.every(d => d.open); for (const d of items) d.open = open; paint(); });
    for (const d of items) d.addEventListener("toggle", paint);
  });

  DS.hydrate("guide", box => {
    const data = JSON.parse(box.querySelector(".ds-guide__data").textContent);
    const trail = box.querySelector(".ds-guide__trail");
    const stage = box.querySelector(".ds-guide__stage");
    const outline = box.querySelector(".ds-guide__outline");
    const outlineButton = box.querySelector("[data-outline]");
    const path = [];
    const render = () => {
      let node = data;
      for (const choice of path) node = node.children[choice]?.next ?? null;
      trail.innerHTML = path.map((choice, i) => {
        let q = data;
        for (const c of path.slice(0, i)) q = q.children[c].next;
        return `<li><span class="ds-guide__q">${q.html}</span><button type="button" class="ds-guide__a" data-back="${i}" title="この質問からやり直す">${q.children[choice].html}</button></li>`;
      }).join("");
      if (!node) {
        stage.innerHTML = '<div class="ds-guide__result" data-kind="missing">この選択肢の先が書かれていません。</div>';
      } else if (!node.children.length) {
        stage.innerHTML = `<div class="ds-guide__result"><p class="ds-guide__result-label">${icon("flag")}こうしてください</p><div class="ds-flow">${node.html}</div></div>`;
      } else {
        stage.innerHTML = `<p class="ds-guide__question"><span>質問${path.length + 1}</span>${node.html}</p><div class="ds-guide__options">${node.children.map((c, i) => `<button type="button" class="ds-guide__option" data-choice="${i}">${c.html}${icon("chevronRight")}</button>`).join("")}</div>`;
      }
    };
    box.addEventListener("click", e => {
      const choice = e.target.closest("[data-choice]");
      if (choice) { path.push(Number(choice.dataset.choice)); render(); stage.querySelector("button, .ds-guide__result")?.focus?.(); return; }
      const back = e.target.closest("[data-back]");
      if (back) { path.length = Number(back.dataset.back); render(); return; }
      if (e.target.closest("[data-restart]")) { path.length = 0; render(); }
    });
    const setOutline = on => {
      outline.hidden = !on;
      outlineButton.setAttribute("aria-pressed", String(on));
      outlineButton.querySelector("span").textContent = on ? "全体を隠す" : "全体を表示";
    };
    outlineButton.addEventListener("click", () => setOutline(outline.hidden));
    box.dsShowOutline = () => setOutline(true);
    render();
  });

  /* ------------------------------------------------------------
     資料全体の機能：コピー、略語と用語の自動リンク、図の参照プレビュー
     ------------------------------------------------------------ */
  function bindCopy() {
    document.addEventListener("click", async e => {
      const el = e.target.closest?.("[data-copy]");
      if (!el) return;
      if (await copyText(el.dataset.copy)) toast(el.dataset.copy.includes("\n") ? "コマンドをすべてコピーしました" : `コピーしました：${el.dataset.copy.slice(0, 40)}`);
    });
  }

  // 用語集の言葉を、各章で最初に出てきた1か所だけ自動で吹き出し付きにする
  function autoLinkTerms(article) {
    if (String(doc.meta.autoterms) === "false" || !terms.size) return;
    const names = [...terms.keys()].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
    const skip = "code, pre, a, button, .ds-term, h1, h2, h3, h4, th, summary, .ds-figure, .ds-example__source, .ds-glossary, .ds-terminal, .ds-chart, .ds-guide__data, kbd, script, template";
    let linked = new Set();
    for (const child of [...article.children]) {
      if (child.tagName === "H2") { linked = new Set(); continue; }
      for (const b of child.querySelectorAll?.(".ds-term[data-term]") ?? []) linked.add(b.dataset.term);
      const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement?.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const text = node.nodeValue;
        const parts = [];
        let last = 0;
        pattern.lastIndex = 0;
        for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
          if (linked.has(m[0])) continue;
          linked.add(m[0]);
          parts.push([text.slice(last, m.index), m[0]]);
          last = m.index + m[0].length;
        }
        if (!parts.length) continue;
        const frag = document.createDocumentFragment();
        for (const [before, term] of parts) frag.append(before, fromHTML(`<button type="button" class="ds-term ds-term--auto" data-term="${esc(term)}">${esc(term)}</button>`));
        frag.append(text.slice(last));
        node.replaceWith(frag);
      }
    }
  }

  // 「図2」などの参照にポインターを合わせると、図の縮小版を出す
  let refPopover = null;
  let refTimer = 0;
  function hideRefPreview() { clearTimeout(refTimer); refPopover?.remove(); refPopover = null; }
  function showRefPreview(link) {
    hideRefPreview();
    const fig = document.getElementById(link.dataset.ref);
    if (!fig) return;
    const visual = fig.querySelector(".ds-diagram__canvas svg, .ds-chart__plot > svg, .ds-figure__frame img");
    refPopover = fromHTML(`<div class="ds-popover ds-popover--figure" role="tooltip"><span class="ds-popover__term">${esc(fig.dataset.num || "")}　${esc(fig.dataset.caption || "")}</span><div class="ds-popover__figure"></div><span class="ds-popover__hint">クリックで図へ移動</span></div>`);
    if (visual) {
      const clone = visual.cloneNode(true);
      clone.removeAttribute("width");
      clone.removeAttribute("height");
      clone.removeAttribute("id");
      refPopover.querySelector(".ds-popover__figure").append(clone);
    } else {
      refPopover.querySelector(".ds-popover__figure").textContent = "図を描画しています…";
    }
    document.body.append(refPopover);
    const r = link.getBoundingClientRect();
    const pw = refPopover.offsetWidth;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - pw / 2), innerWidth - pw - 12);
    let top = r.bottom + 8;
    if (top + refPopover.offsetHeight > innerHeight - 12) top = r.top - refPopover.offsetHeight - 8;
    refPopover.style.left = `${left + scrollX}px`;
    refPopover.style.top = `${top + scrollY}px`;
  }
  function bindRefPreview() {
    document.addEventListener("pointerover", e => {
      const a = e.target.closest?.(".ds-ref[data-ref]");
      if (a && e.pointerType === "mouse") { clearTimeout(refTimer); refTimer = setTimeout(() => showRefPreview(a), 160); }
    });
    document.addEventListener("pointerout", e => { if (e.target.closest?.(".ds-ref")) hideRefPreview(); });
    document.addEventListener("focusin", e => { const a = e.target.closest?.(".ds-ref[data-ref]"); if (a) showRefPreview(a); });
    document.addEventListener("focusout", e => { if (e.target.closest?.(".ds-ref")) hideRefPreview(); });
    addEventListener("scroll", hideRefPreview, { passive: true });
  }

  /* ------------------------------------------------------------
     資料内の検索（⌘K / Ctrl+K / ／）
     ------------------------------------------------------------ */
  let searchIndex = null;
  let searchDialog = null;
  const SEARCH_SELECTOR = "h2, h3, h4, p, li, td, th, dt, dd, figcaption, summary, .ds-callout__title, .ds-step__title, .ds-card__title, .ds-walk__step-title, .ds-tline, .ds-chart__title, .ds-guide__outline li, .ds-roadmap__name, .ds-meter__label";
  const SEARCH_SKIP = ".ds-example__source, .ds-figure__source, .ds-guide__stage, .ds-guide__trail, .ds-walk__dots, template, script";
  function sectionLabels() {
    const map = new Map();
    let h2 = 0;
    let h3 = 0;
    let current = { id: "top", label: doc.meta.title || "表紙" };
    for (const child of doc.article.children) {
      if (child.tagName === "H2") { h2 += 1; h3 = 0; current = { id: child.id, label: `${h2} ${child.textContent.trim()}` }; }
      else if (child.tagName === "H3") { h3 += 1; current = { id: child.id, label: `${h2}.${h3} ${child.textContent.trim()}` }; }
      map.set(child, current);
    }
    return map;
  }
  function buildSearchIndex() {
    const labels = sectionLabels();
    const topOf = el => { let n = el; while (n.parentElement && n.parentElement !== doc.article) n = n.parentElement; return n; };
    searchIndex = [];
    for (const el of doc.article.querySelectorAll(SEARCH_SELECTOR)) {
      if (el.closest(SEARCH_SKIP) || el.querySelector(SEARCH_SELECTOR)) continue;
      const text = el.textContent.replace(/\s+/g, " ").trim();
      if (!text) continue;
      searchIndex.push({ el, text, norm: normalizeText(text), section: labels.get(topOf(el)) || { label: doc.meta.title }, heading: /^H[2-4]$/.test(el.tagName) });
    }
    for (const fig of doc.article.querySelectorAll(".ds-code")) {
      const raw = fig.querySelector(".ds-code__raw")?.content.textContent ?? "";
      if (raw) searchIndex.push({ el: fig, text: raw.replace(/\s+/g, " "), norm: normalizeText(raw.replace(/\s+/g, " ")), section: labels.get(topOf(fig)) || { label: doc.meta.title }, heading: false, code: true });
    }
  }
  const markTerms = (text, terms) => {
    let html = esc(text);
    for (const t of terms) html = html.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`);
    return html;
  };
  function snippet(item, terms) {
    const i = item.norm.indexOf(terms[0]);
    const start = Math.max(0, i - 28);
    const text = (start ? "…" : "") + item.text.slice(start, start + 110) + (item.text.length > start + 110 ? "…" : "");
    return markTerms(text, terms);
  }
  function reveal(el) {
    for (let n = el; n && n !== doc.article; n = n.parentElement) {
      if (n.tagName === "DETAILS" && !n.open) n.open = true;
      if (n.classList?.contains("ds-tabs__panel") && n.hidden) document.getElementById(n.getAttribute("aria-labelledby"))?.click();
      if (n.classList?.contains("ds-walk__step") && n.hidden) n.closest(".ds-walk")?.dsGoTo?.(Number(n.dataset.step));
      if (n.classList?.contains("ds-guide__outline") && n.hidden) n.closest(".ds-guide")?.dsShowOutline?.();
      if (n.tagName === "TR" && n.hidden) { const box = n.closest(".ds-datatable"); const input = box?.querySelector("input"); if (input) { input.value = ""; input.dispatchEvent(new Event("input")); } }
    }
  }
  function flash(el, terms) {
    el.classList.remove("ds-flash");
    void el.offsetWidth;
    el.classList.add("ds-flash");
    setTimeout(() => el.classList.remove("ds-flash"), 2400);
    if (!window.CSS?.highlights || !window.Highlight) return;
    const ranges = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const norm = normalizeText(node.nodeValue);
      for (const t of terms) {
        for (let i = norm.indexOf(t); i >= 0 && node.nodeValue.length === norm.length; i = norm.indexOf(t, i + t.length)) {
          const r = new Range();
          r.setStart(node, i);
          r.setEnd(node, i + t.length);
          ranges.push(r);
        }
      }
    }
    CSS.highlights.set("ds-search", new Highlight(...ranges));
    setTimeout(() => CSS.highlights.delete("ds-search"), 4000);
  }
  function openSearch() {
    if (!searchIndex) buildSearchIndex();
    if (!searchDialog) {
      searchDialog = fromHTML(`<dialog class="ds-search" aria-label="資料内を検索">
        <div class="ds-search__field">${icon("search")}<input type="search" placeholder="この資料の中を検索（例：冪等性 再試行）" aria-label="検索する言葉" autocomplete="off" aria-controls="ds-search-results"><kbd>Esc</kbd></div>
        <p class="ds-search__meta" aria-live="polite"></p>
        <ul class="ds-search__results" id="ds-search-results" role="listbox" aria-label="検索結果"></ul>
        <p class="ds-search__help"><span><kbd>↑</kbd><kbd>↓</kbd> 選ぶ</span><span><kbd>Enter</kbd> 移動</span><span>スペースで区切ると、すべての言葉を含む箇所を探します</span></p>
      </dialog>`);
      document.body.append(searchDialog);
      const input = searchDialog.querySelector("input");
      const list = searchDialog.querySelector(".ds-search__results");
      const meta = searchDialog.querySelector(".ds-search__meta");
      let results = [];
      let active = 0;
      let terms = [];
      const paintActive = () => {
        list.querySelectorAll("[role=option]").forEach((o, i) => o.setAttribute("aria-selected", String(i === active)));
        list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
      };
      const run = () => {
        terms = normalizeText(input.value).split(/\s+/).filter(Boolean);
        if (!terms.length) { list.innerHTML = ""; meta.textContent = `見出し・本文・表・コードから探せます（${searchIndex.length}か所）`; results = []; return; }
        results = searchIndex.filter(it => terms.every(t => it.norm.includes(t))).sort((a, b) => Number(b.heading) - Number(a.heading)).slice(0, 60);
        meta.textContent = results.length ? `${results.length}${results.length === 60 ? "件以上" : "件"}見つかりました` : "見つかりませんでした。別の言葉で試してください。";
        list.innerHTML = results.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === 0}"><span class="ds-search__sec">${r.code ? icon("code") : r.heading ? icon("hash") : icon("file")}${esc(r.section.label)}</span><span class="ds-search__snip">${snippet(r, terms)}</span></li>`).join("");
        active = 0;
      };
      const go = i => {
        const r = results[i];
        if (!r) return;
        searchDialog.close();
        reveal(r.el);
        requestAnimationFrame(() => {
          r.el.scrollIntoView({ block: "center", behavior: reduceMotion.matches ? "auto" : "smooth" });
          flash(r.el, terms);
        });
      };
      input.addEventListener("input", run);
      input.addEventListener("keydown", e => {
        if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(results.length - 1, active + 1); paintActive(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(0, active - 1); paintActive(); }
        else if (e.key === "Enter") { e.preventDefault(); go(active); }
      });
      list.addEventListener("click", e => { const o = e.target.closest("[data-i]"); if (o) go(Number(o.dataset.i)); });
      searchDialog.addEventListener("click", e => { if (e.target === searchDialog) searchDialog.close(); });
      run();
    }
    searchDialog.showModal();
    const input = searchDialog.querySelector("input");
    input.select();
    input.focus();
  }
  DS.openSearch = openSearch;
  function bindSearchKeys() {
    document.addEventListener("keydown", e => {
      const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSearch(); return; }
      if (e.key === "/" && !typing && !document.querySelector("dialog[open]")) { e.preventDefault(); openSearch(); }
    });
  }

  /* 文字の大きさ（標準・大・特大）：ユニバーサルデザイン */
  const FONT_KEY = "ds:fontsize";
  const FONT_SIZES = [["standard", "標準", ""], ["large", "大", "18px"], ["xlarge", "特大", "20px"]];
  const fontPref = () => { const v = storage.get(FONT_KEY); return FONT_SIZES.some(f => f[0] === v) ? v : "standard"; };
  function applyFontSize(pref = fontPref()) {
    const [, label, size] = FONT_SIZES.find(f => f[0] === pref);
    if (size) root.style.setProperty("--ds-body-size", size); else root.style.removeProperty("--ds-body-size");
    root.dataset.fontsize = pref;
    for (const b of document.querySelectorAll(".ds-fontsize")) {
      b.innerHTML = `${icon("type")}<span class="ds-fontsize__label">${label}</span>`;
      b.setAttribute("aria-label", `文字の大きさを切り替える（現在：${label}）`);
      b.title = `文字の大きさ：${label}`;
    }
  }
  function fontSizeButton() {
    const button = fromHTML('<button type="button" class="ds-iconbtn ds-fontsize"></button>');
    button.addEventListener("click", () => {
      const i = FONT_SIZES.findIndex(f => f[0] === fontPref());
      const next = FONT_SIZES[(i + 1) % FONT_SIZES.length];
      storage.set(FONT_KEY, next[0]);
      applyFontSize(next[0]);
      toast(`文字の大きさ：${next[1]}`);
    });
    return button;
  }
  function searchButton() {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const button = fromHTML(`<button type="button" class="ds-searchbtn" aria-label="資料内を検索（${mac ? "⌘K" : "Ctrl+K"}）">${icon("search")}<span class="ds-searchbtn__label">検索</span><kbd>${mac ? "⌘K" : "Ctrl K"}</kbd></button>`);
    button.addEventListener("click", openSearch);
    return button;
  }

  /* トースト */
  let toastEl = null;
  let toastTimer = 0;
  function toast(message) {
    if (!toastEl) { toastEl = fromHTML('<div class="ds-toast" role="status" aria-live="polite"></div>'); document.body.append(toastEl); }
    toastEl.textContent = message;
    toastEl.dataset.show = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.dataset.show = "false"; }, 1800);
  }
  DS.toast = toast;

  /* ------------------------------------------------------------
     コードの色分け（CDNから任意で読み込む）
     ------------------------------------------------------------ */
  const loadScript = src => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`${src} を読み込めませんでした。`));
    document.head.append(s);
  });
  function splitHighlighted(markup) {
    const lines = [];
    const open = [];
    let current = "";
    for (const m of markup.matchAll(/(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+)|(<)/g)) {
      if (m[1]) { open.push(m[1]); current += m[1]; }
      else if (m[2]) { open.pop(); current += m[2]; }
      else if (m[3]) { current += "</span>".repeat(open.length); lines.push(current); current = open.join(""); }
      else current += m[0];
    }
    lines.push(current);
    return lines;
  }
  /* 図の部品の候補：meta が示す手元の場所、CDN の順（meta は読み込む時に読む） */
  function vendorCandidates(kind) {
    const candidates = [];
    const meta = document.querySelector('meta[name="ds-vendor-base"]');
    const content = meta?.getAttribute("content")?.trim();
    if (content) {
      try {
        const base = new URL(content.endsWith("/") ? content : `${content}/`, document.baseURI);
        candidates.push({ source: "local", base: new URL(VENDOR[kind].local, base).href });
      } catch (error) {
        console.warn(`ds-vendor-base を解釈できませんでした。${error.message}`);
      }
    }
    candidates.push({ source: "cdn", base: VENDOR[kind].cdn });
    return candidates;
  }
  async function loadFromCandidates(kind, load) {
    const failures = [];
    for (const candidate of vendorCandidates(kind)) {
      try {
        const result = await load(candidate.base);
        state.vendor[kind] = candidate.source;
        return result;
      } catch (error) {
        failures.push(`${candidate.base}: ${error.message}`);
      }
    }
    throw new Error(failures.join(" / "));
  }
  async function highlightCode(article) {
    const blocks = [...article.querySelectorAll(".ds-code[data-lang]")].filter(b => b.dataset.lang && !["text", "txt", "diff"].includes(b.dataset.lang));
    if (!blocks.length) return;
    try {
      if (!window.hljs) await loadFromCandidates("hljs", base => loadScript(`${base}highlight.min.js`));
    } catch (error) {
      console.warn(`コードの色分けを読み込めませんでした。色なしで表示します。${error.message}`);
      return;
    }
    for (const block of blocks) {
      const language = block.dataset.lang;
      if (!window.hljs.getLanguage(language)) continue;
      const raw = block.querySelector(".ds-code__raw").content.textContent;
      const lines = splitHighlighted(window.hljs.highlight(raw, { language, ignoreIllegals: true }).value);
      block.querySelector("code").innerHTML = lineSpans(lines, raw.split("\n"), language, parseRanges(block.dataset.hl), parsePins(block.dataset.pins));
    }
  }

  /* ------------------------------------------------------------
     PlantUML（ブラウザ内で描画。外部の描画サービスへ送らない）
     ------------------------------------------------------------ */
  const PLANTUML_SKIN = { text: "#1c2230", line: "#4f5b6e", fill: "#ffffff", border: "#6d8fd6", group: "#f3f6fc", note: "#fff7e0", noteBorder: "#d1a64a", bar: "#c6d6f6", lane: "#d3d9e2", font: "BIZ UDPGothic" };
  const SKIN_ELEMENTS = ["participant", "actor", "boundary", "control", "entity", "database", "collections", "queue", "component", "interface", "rectangle", "node", "cloud", "frame", "folder", "card", "agent", "artifact", "storage", "usecase", "class", "object", "state", "activity", "file", "stack", "hexagon"];
  function skinLines() {
    const s = PLANTUML_SKIN;
    return [
      "skinparam backgroundColor transparent",
      "skinparam shadowing false",
      `skinparam defaultFontName "${s.font}"`,
      "skinparam defaultFontSize 14",
      `skinparam defaultFontColor ${s.text}`,
      "skinparam roundCorner 10",
      `skinparam ArrowColor ${s.line}`,
      `skinparam ArrowFontColor ${s.text}`,
      "skinparam ArrowFontSize 13",
      ...SKIN_ELEMENTS.flatMap(e => [`skinparam ${e}BackgroundColor ${s.fill}`, `skinparam ${e}BorderColor ${s.border}`]),
      `skinparam packageBackgroundColor ${s.group}`,
      `skinparam packageBorderColor ${s.border}`,
      `skinparam sequenceLifeLineBorderColor ${s.line}`,
      `skinparam sequenceGroupBorderColor ${s.border}`,
      `skinparam sequenceGroupBackgroundColor ${s.group}`,
      `skinparam sequenceBoxBackgroundColor ${s.group}`,
      `skinparam noteBackgroundColor ${s.note}`,
      `skinparam noteBorderColor ${s.noteBorder}`,
      `skinparam activityDiamondBackgroundColor ${s.fill}`,
      `skinparam activityDiamondBorderColor ${s.border}`,
      `skinparam stateStartColor ${s.line}`,
      `skinparam stateEndColor ${s.line}`,
      `skinparam swimlaneBorderColor ${s.lane}`,
      "skinparam swimlaneBorderThickness 1",
      `skinparam swimlaneTitleFontColor ${s.text}`
    ];
  }
  // @startuml 以外の図は、図の種類ごとの <style> で配色を合わせる
  const STYLE_BLOCKS = {
    mindmap: s => ["mindmapDiagram {", `  node {`, `    BackgroundColor ${s.fill}`, `    LineColor ${s.border}`, `    FontColor ${s.text}`, "    RoundCorner 12", "  }", `  arrow {`, `    LineColor ${s.line}`, "  }", "  :depth(0) {", `    BackgroundColor ${s.bar}`, "  }", "}"],
    wbs: s => ["wbsDiagram {", `  node {`, `    BackgroundColor ${s.fill}`, `    LineColor ${s.border}`, `    FontColor ${s.text}`, "    RoundCorner 8", "  }", `  arrow {`, `    LineColor ${s.line}`, "  }", "  :depth(0) {", `    BackgroundColor ${s.bar}`, "  }", "}"],
    gantt: s => ["ganttDiagram {", "  task {", `    BackgroundColor ${s.bar}`, `    LineColor ${s.border}`, `    FontColor ${s.text}`, "  }", "  arrow {", `    LineColor ${s.line}`, "  }", "  timeline {", `    LineColor ${s.lane}`, "  }", "}"],
    json: s => ["jsonDiagram {", "  node {", `    BackgroundColor ${s.fill}`, `    LineColor ${s.border}`, `    FontColor ${s.text}`, "    RoundCorner 8", "  }", "  arrow {", `    LineColor ${s.line}`, "  }", "}"]
  };
  function styleLines(kind) {
    const s = PLANTUML_SKIN;
    return STYLE_BLOCKS[kind] ? ["<style>", ...STYLE_BLOCKS[kind](s), "</style>"] : [];
  }
  function themedSource(d) {
    let lines = d.source.trim().split(/\r?\n/);
    if (d.stripTitle) lines = lines.filter(l => !/^\s*title\s+/i.test(l));
    // @startuml には skinparam、それ以外の図には図の種類に合わせた <style> を入れる
    const start = lines.findIndex(l => /^\s*@start\w+/i.test(l));
    if (start < 0) return lines;
    const kind = /^\s*@start(\w+)/i.exec(lines[start])[1].toLowerCase();
    const theme = kind === "uml" ? skinLines() : styleLines(kind);
    return [...lines.slice(0, start + 1), ...theme, ...lines.slice(start + 1)];
  }
  function rejectRemoteIncludes(source) {
    if (/^\s*!(includeurl|include|import)\b.*https?:/im.test(source)) throw new Error("外部URLを読み込むPlantUML命令は使えません。");
  }
  let plantumlModule = null;
  async function loadPlantUML() {
    if (plantumlModule) return plantumlModule;
    plantumlModule = await loadFromCandidates("plantuml", async base => {
      await loadScript(`${base}viz-global.js`);
      return import(`${base}plantuml.js`);
    });
    return plantumlModule;
  }
  const normalize = v => String(v ?? "").replace(/\s+/g, " ").trim();
  function inspectRenderedSvg(svgMarkup) {
    const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
    const svgRoot = parsed.documentElement;
    if (!svgRoot || svgRoot.localName.toLowerCase() === "parsererror" || parsed.querySelector("parsererror")) throw new Error("PlantUMLが不正なSVGを返しました。");
    if (svgRoot.localName.toLowerCase() !== "svg") throw new Error("PlantUMLの描画結果がSVGではありません。");
    const fullText = normalize(svgRoot.textContent);
    const diagramType = svgRoot.getAttribute("data-diagram-type")?.toLowerCase() ?? "";
    const knownError = /Syntax Error\?|An error has occurred/i.test(fullText);
    const diagnostic = /PlantUML version\b/i.test(fullText) && /\[From [^\]]*\(line \d+\)\s*\]/i.test(fullText) && /@startuml/i.test(fullText);
    if (diagramType === "error" || knownError || diagnostic) {
      const reasons = [...svgRoot.querySelectorAll("text")].filter(t => {
        const p = [t.getAttribute("fill"), t.getAttribute("style"), t.getAttribute("text-decoration")].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, "");
        return /(?:fill:)?(?:#ff0000|#f00|red|rgb\(255,0,0\))/.test(p) || p.includes("wavy");
      }).map(t => normalize(t.textContent)).filter(Boolean);
      throw new Error(`PlantUMLの記述に誤りがあります: ${[...new Set(reasons)].join(" / ").slice(0, 400) || "診断画面が返されました。"}`);
    }
    return svgRoot;
  }
  function updateStatus() {
    const st = window.__plantumlDocumentState;
    const state = !st.expected ? "success" : !st.completed ? "running" : st.errors.length ? "error" : "success";
    root.dataset.plantumlStatus = state;
    const text = !st.expected ? "図なし" : !st.completed ? `図を描画中 ${st.rendered}/${st.expected}` : st.errors.length ? `図のエラー ${st.errors.length}件` : `図 ${st.rendered}/${st.expected} 描画済み`;
    for (const el of document.querySelectorAll(".ds-status")) {
      el.hidden = !st.expected;
      el.dataset.state = state;
      el.textContent = text;
      el.title = st.errors.join("\n");
    }
  }
  let renderGeneration = 0;
  async function renderDiagrams() {
    const generation = ++renderGeneration;
    const st = window.__plantumlDocumentState;
    Object.assign(st, { expected: diagrams.length, rendered: 0, errors: [], completed: false });
    updateStatus();
    if (!diagrams.length) { st.completed = true; state.completed = true; updateStatus(); return; }
    // 図の文字幅を正しく測るため、UDフォントの読み込みを待ってから描画する
    if (document.fonts?.load) {
      await Promise.race([document.fonts.load(`14px "${PLANTUML_SKIN.font}"`), new Promise(r => setTimeout(r, 3000))]).catch(() => {});
    }
    let mod;
    try {
      mod = await loadPlantUML();
    } catch (error) {
      for (const d of diagrams) showDiagramError(document.getElementById(d.id), "PlantUMLの描画部品を読み込めませんでした。インターネット接続を確認してください。");
      st.errors.push(error.message);
      st.completed = true;
      updateStatus();
      return;
    }
    for (const d of diagrams) {
      if (generation !== renderGeneration) return;
      const fig = document.getElementById(d.id);
      if (!fig) continue;
      try {
        rejectRemoteIncludes(d.source);
        const markup = await new Promise((resolve, reject) => {
          mod.renderToString(themedSource(d), svg => resolve(svg), message => reject(new Error(message)));
        });
        if (generation !== renderGeneration) return;
        mountDiagram(fig, inspectRenderedSvg(markup), d);
        st.rendered += 1;
      } catch (error) {
        st.errors.push(`${d.id}: ${error.message}`);
        showDiagramError(fig, error.message);
      }
      updateStatus();
    }
    st.completed = true;
    updateStatus();
    state.completed = true;
  }
  function showDiagramError(fig, message) {
    if (!fig) return;
    fig.dataset.status = "error";
    fig.querySelector(".ds-diagram__canvas").innerHTML = `<div class="ds-diagram__error"><b>この図を描画できませんでした。</b><br>${esc(message)}</div>`;
    const source = fig.querySelector(".ds-figure__source");
    source.hidden = false;
    fig.querySelector(".ds-figure__srcbtn").setAttribute("aria-expanded", "true");
  }
  function mountDiagram(fig, parsed, d) {
    const svg = document.importNode(parsed, true);
    const vb = svg.viewBox?.baseVal;
    const w = (vb && vb.width) || Number.parseFloat(svg.getAttribute("width")) || 600;
    const h = (vb && vb.height) || Number.parseFloat(svg.getAttribute("height")) || 400;
    svg.removeAttribute("style");
    svg.setAttribute("width", String(Math.round(w)));
    svg.setAttribute("height", String(Math.round(h)));
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", d.caption || "図");
    const canvas = fig.querySelector(".ds-diagram__canvas");
    canvas.replaceChildren(svg);
    fig.dataset.status = "success";
    fig.dataset.width = String(w);
    fig.dataset.height = String(h);
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "button");
    canvas.setAttribute("aria-label", `${fig.dataset.num || "図"}「${d.caption || "図"}」を拡大表示する`);
    fig.querySelector('[data-action="zoom"]').disabled = false;
  }
  function bindFigures(article) {
    article.addEventListener("click", e => {
      const srcBtn = e.target.closest(".ds-figure__srcbtn");
      if (srcBtn) {
        const pre = srcBtn.closest(".ds-figure").querySelector(".ds-figure__source");
        pre.hidden = !pre.hidden;
        srcBtn.setAttribute("aria-expanded", String(!pre.hidden));
        return;
      }
      const fig = e.target.closest('.ds-diagram[data-status="success"]');
      if (fig && (e.target.closest(".ds-diagram__canvas") || e.target.closest('[data-action="zoom"]'))) openViewer(fig, e.target.closest("button, .ds-diagram__canvas"));
      const copy = e.target.closest("[data-copy-source]");
      if (copy) copyText(copy.closest(".ds-example__source").querySelector("code").textContent).then(ok => ok && flashCopied(copy));
    });
    article.addEventListener("keydown", e => {
      const canvas = e.target.closest?.(".ds-diagram__canvas[role=button]");
      if (canvas && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openViewer(canvas.closest(".ds-figure"), canvas);
      }
    });
  }

  /* ------------------------------------------------------------
     拡大ビューア
     ------------------------------------------------------------ */
  const viewer = { dlg: null, scale: 1, tx: 0, ty: 0, w: 0, h: 0, svg: null, anim: 0, mode: "fit", opener: null, fig: null };
  const MAX_SCALE = 8;
  const FILL_MAX = 2;
  const VIEW_MODE_KEY = "ds:viewer-mode";
  const stageEl = () => viewer.dlg.querySelector(".ds-viewer__stage");
  // 浮かせた操作バーに隠れない表示領域（ステージ内の座標）
  function usableBox() {
    const stage = stageEl().getBoundingClientRect();
    const bar = viewer.dlg.querySelector(".ds-viewer__bar").getBoundingClientRect();
    const tools = viewer.dlg.querySelector(".ds-viewer__tools").getBoundingClientRect();
    const side = innerWidth <= 720 ? 8 : 24;
    const top = Math.max(16, bar.bottom - stage.top + 10);
    const toolsAtBottom = tools.height > 0 && tools.top > stage.top + stage.height / 2;
    const bottom = toolsAtBottom ? stage.bottom - tools.top + 10 : 20;
    return { x: side, y: top, w: Math.max(40, stage.width - side * 2), h: Math.max(40, stage.height - top - bottom) };
  }
  // 全体：図全体が収まる倍率。画面いっぱい：縦横の空きがなくなる倍率（拡大しすぎないよう上限あり）
  const containScale = () => { const b = usableBox(); return Math.min(b.w / viewer.w, b.h / viewer.h, 2); };
  const fillScale = () => { const b = usableBox(); return Math.max(containScale(), Math.min(FILL_MAX, Math.max(b.w / viewer.w, b.h / viewer.h))); };
  const minScale = () => Math.max(0.05, Math.min(containScale(), 1) * 0.5);
  function clampView(scale, tx, ty) {
    const b = usableBox();
    const cw = viewer.w * scale;
    const ch = viewer.h * scale;
    const m = 40;
    const nx = cw <= b.w ? b.x + (b.w - cw) / 2 : Math.min(b.x + m, Math.max(b.x + b.w - cw - m, tx));
    const ny = ch <= b.h ? b.y + (b.h - ch) / 2 : Math.min(b.y + m, Math.max(b.y + b.h - ch - m, ty));
    return [nx, ny];
  }
  function applyView() {
    const { dlg, svg } = viewer;
    const canvas = dlg.querySelector(".ds-viewer__canvas");
    canvas.style.transform = `translate(${viewer.tx}px, ${viewer.ty}px)`;
    svg.setAttribute("width", String(viewer.w * viewer.scale));
    svg.setAttribute("height", String(viewer.h * viewer.scale));
    dlg.querySelector(".ds-viewer__level").textContent = `${Math.round(viewer.scale * 100)}%`;
    dlg.querySelector('[data-act="out"]').disabled = viewer.scale <= minScale() + 1e-6;
    dlg.querySelector('[data-act="in"]').disabled = viewer.scale >= MAX_SCALE - 1e-6;
    for (const b of dlg.querySelectorAll(".ds-viewer__mode")) b.setAttribute("aria-pressed", String(b.dataset.act === viewer.mode));
    updateMinimap();
  }
  function updateMinimap() {
    const map = viewer.dlg.querySelector(".ds-viewer__minimap");
    const stage = stageEl();
    const b = usableBox();
    const big = viewer.w * viewer.scale > b.w + 2 || viewer.h * viewer.scale > b.h + 2;
    map.hidden = !big;
    if (!big) return;
    const k = map.clientWidth / viewer.w;
    const rect = map.querySelector("i");
    const x0 = Math.max(0, -viewer.tx / viewer.scale);
    const y0 = Math.max(0, -viewer.ty / viewer.scale);
    const vw = Math.min(viewer.w - x0, stage.clientWidth / viewer.scale);
    const vh = Math.min(viewer.h - y0, stage.clientHeight / viewer.scale);
    Object.assign(rect.style, { left: `${x0 * k}px`, top: `${y0 * k}px`, width: `${Math.max(6, vw * k)}px`, height: `${Math.max(6, vh * k)}px` });
  }
  function setView(scale, tx, ty) {
    viewer.scale = Math.min(MAX_SCALE, Math.max(minScale(), scale));
    [viewer.tx, viewer.ty] = clampView(viewer.scale, tx, ty);
    applyView();
  }
  function zoomAround(scale, cx, cy, animate = false) {
    const s1 = Math.min(MAX_SCALE, Math.max(minScale(), scale));
    const wx = (cx - viewer.tx) / viewer.scale;
    const wy = (cy - viewer.ty) / viewer.scale;
    const [x1, y1] = clampView(s1, cx - wx * s1, cy - wy * s1);
    viewer.mode = null;
    if (animate) animateView(s1, x1, y1); else { viewer.scale = s1; viewer.tx = x1; viewer.ty = y1; applyView(); }
  }
  function animateView(s1, x1, y1) {
    cancelAnimationFrame(viewer.anim);
    const s0 = viewer.scale;
    const x0 = viewer.tx;
    const y0 = viewer.ty;
    const t0 = performance.now();
    const duration = reduceMotion.matches ? 0 : 220;
    const step = now => {
      const k = duration ? Math.min(1, (now - t0) / duration) : 1;
      const e = 1 - (1 - k) ** 3;
      viewer.scale = s0 + (s1 - s0) * e;
      viewer.tx = x0 + (x1 - x0) * e;
      viewer.ty = y0 + (y1 - y0) * e;
      applyView();
      if (k < 1) viewer.anim = requestAnimationFrame(step);
    };
    viewer.anim = requestAnimationFrame(step);
  }
  // 「画面いっぱい」で図がはみ出す方向は、図の先頭（左端・上端）から表示する
  function setMode(mode, { animate = true, remember = false } = {}) {
    viewer.mode = mode;
    if (remember) storage.set(VIEW_MODE_KEY, mode);
    const b = usableBox();
    const s = mode === "fill" ? fillScale() : containScale();
    const [x, y] = clampView(s, viewer.w * s > b.w ? b.x : 0, viewer.h * s > b.h ? b.y : 0);
    if (animate) animateView(s, x, y); else { viewer.scale = s; viewer.tx = x; viewer.ty = y; applyView(); }
  }
  const stageCenter = () => {
    const b = usableBox();
    return [b.x + b.w / 2, b.y + b.h / 2];
  };
  let hintTimer = 0;
  const hideHint = () => { const hint = viewer.dlg?.querySelector(".ds-viewer__hint"); if (hint) hint.dataset.hidden = "true"; };
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function toggleFullscreen() {
    const panel = viewer.dlg.querySelector(".ds-viewer__panel");
    if (fullscreenElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      return;
    }
    const request = panel.requestFullscreen || panel.webkitRequestFullscreen;
    Promise.resolve(request?.call(panel)).catch(() => toast("全画面表示にできませんでした。"));
  }
  function paintFullscreenButton() {
    const button = viewer.dlg?.querySelector('[data-act="fullscreen"]');
    if (!button) return;
    const on = Boolean(fullscreenElement());
    button.innerHTML = icon(on ? "fullscreenExit" : "fullscreen");
    button.setAttribute("aria-label", on ? "全画面表示を終了する" : "ブラウザーの全画面表示にする");
    button.title = on ? "全画面表示を終了" : "全画面表示（ブラウザーの枠も隠す）";
  }

  function createViewer() {
    const touch = matchMedia("(pointer: coarse)").matches;
    const dlg = fromHTML(`<dialog class="ds-viewer" aria-labelledby="ds-viewer-title">
      <div class="ds-viewer__panel">
        <div class="ds-viewer__stage" tabindex="0" aria-label="図の表示領域。ドラッグで移動し、${touch ? "ピンチ" : "ホイール"}で拡大・縮小します。">
          <div class="ds-viewer__canvas"></div>
        </div>
        <header class="ds-viewer__bar">
          <p class="ds-viewer__title" id="ds-viewer-title"></p>
          <div class="ds-viewer__tools" role="toolbar" aria-label="拡大表示の操作">
            <button type="button" class="ds-iconbtn" data-act="out" aria-label="縮小する" title="縮小（−）">${icon("minus")}</button>
            <button type="button" class="ds-viewer__level" data-act="actual" aria-label="等倍（100%）にする" title="等倍にする（0）">100%</button>
            <button type="button" class="ds-iconbtn" data-act="in" aria-label="拡大する" title="拡大（＋）">${icon("plus")}</button>
            <span class="ds-viewer__sep" aria-hidden="true"></span>
            <div class="ds-viewer__modes" role="group" aria-label="図の合わせ方">
              <button type="button" class="ds-viewer__mode" data-act="fit" aria-pressed="false" aria-label="図の全体を表示する" title="全体を表示（F）">${icon("fit")}<span>全体</span></button>
              <button type="button" class="ds-viewer__mode" data-act="fill" aria-pressed="false" aria-label="画面いっぱいに表示する" title="画面いっぱいに表示（Shift＋F）">${icon("fillScreen")}<span>画面いっぱい</span></button>
            </div>
            <span class="ds-viewer__sep" aria-hidden="true"></span>
            <button type="button" class="ds-iconbtn" data-act="fullscreen"></button>
            <button type="button" class="ds-iconbtn" data-act="download" aria-label="SVGファイルとして保存する" title="SVGとして保存">${icon("download")}</button>
            <button type="button" class="ds-iconbtn" data-act="close" aria-label="拡大表示を閉じる" title="閉じる（Esc）">${icon("x")}</button>
          </div>
          <button type="button" class="ds-iconbtn ds-viewer__close-top" data-act="close" aria-label="拡大表示を閉じる">${icon("x")}</button>
        </header>
        <div class="ds-viewer__hint">${touch
          ? "<span>ピンチで拡大・縮小</span><span>ドラッグで移動</span><span>ダブルタップで拡大</span>"
          : "<span>ホイールで拡大・縮小</span><span>ドラッグで移動</span><span><kbd>F</kbd> 全体</span><span><kbd>Shift</kbd>＋<kbd>F</kbd> 画面いっぱい</span><span><kbd>Esc</kbd> 閉じる</span>"}</div>
        <div class="ds-viewer__minimap" hidden aria-hidden="true"><i></i></div>
      </div>
    </dialog>`);
    document.body.append(dlg);
    viewer.dlg = dlg;
    const stage = dlg.querySelector(".ds-viewer__stage");
    if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) dlg.querySelector('[data-act="fullscreen"]').hidden = true;
    paintFullscreenButton();
    document.addEventListener("fullscreenchange", paintFullscreenButton);
    document.addEventListener("webkitfullscreenchange", paintFullscreenButton);

    dlg.addEventListener("click", e => {
      if (e.target === dlg) { dlg.close(); return; }
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      const [cx, cy] = stageCenter();
      if (act === "in") zoomAround(viewer.scale * 1.25, cx, cy, true);
      else if (act === "out") zoomAround(viewer.scale / 1.25, cx, cy, true);
      else if (act === "actual") zoomAround(1, cx, cy, true);
      else if (act === "fit" || act === "fill") setMode(act, { remember: true });
      else if (act === "fullscreen") toggleFullscreen();
      else if (act === "close") dlg.close();
      else if (act === "download") downloadSvg();
    });
    dlg.addEventListener("close", () => {
      cancelAnimationFrame(viewer.anim);
      if (fullscreenElement()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      dlg.querySelector(".ds-viewer__canvas").replaceChildren();
      viewer.svg = null;
      viewer.opener?.focus({ preventScroll: true });
    });
    dlg.addEventListener("keydown", e => {
      if (e.target.closest("button") && (e.key === "Enter" || e.key === " ")) return;
      const [cx, cy] = stageCenter();
      const stepPan = e.shiftKey ? 200 : 60;
      const keys = {
        "+": () => zoomAround(viewer.scale * 1.25, cx, cy, true),
        "=": () => zoomAround(viewer.scale * 1.25, cx, cy, true),
        "-": () => zoomAround(viewer.scale / 1.25, cx, cy, true),
        _: () => zoomAround(viewer.scale / 1.25, cx, cy, true),
        0: () => zoomAround(1, cx, cy, true),
        f: () => setMode("fit", { remember: true }),
        F: () => setMode(e.shiftKey ? "fill" : "fit", { remember: true }),
        ArrowLeft: () => setView(viewer.scale, viewer.tx + stepPan, viewer.ty),
        ArrowRight: () => setView(viewer.scale, viewer.tx - stepPan, viewer.ty),
        ArrowUp: () => setView(viewer.scale, viewer.tx, viewer.ty + stepPan),
        ArrowDown: () => setView(viewer.scale, viewer.tx, viewer.ty - stepPan)
      };
      const run = keys[e.key];
      if (!run) return;
      e.preventDefault();
      e.stopPropagation();
      hideHint();
      run();
    });

    stage.addEventListener("wheel", e => {
      e.preventDefault();
      hideHint();
      cancelAnimationFrame(viewer.anim);
      const r = stage.getBoundingClientRect();
      let dx = e.deltaX;
      let dy = e.deltaY;
      if (e.deltaMode === 1) { dx *= 16; dy *= 16; } else if (e.deltaMode === 2) { dx *= r.width; dy *= r.height; }
      if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy) * 1.2) {
        setView(viewer.scale, viewer.tx - dx, viewer.ty);
        return;
      }
      const k = e.ctrlKey ? 0.012 : 0.0022;
      zoomAround(viewer.scale * Math.exp(-dy * k), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    const pointers = new Map();
    let drag = null;
    let pinch = null;
    let lastTap = { t: 0, x: 0, y: 0 };
    let lastType = "mouse";
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    stage.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      lastType = e.pointerType;
      try { stage.setPointerCapture(e.pointerId); } catch { /* 捕捉できなくても操作は続ける */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cancelAnimationFrame(viewer.anim);
      hideHint();
      if (pointers.size === 1) {
        drag = { x: e.clientX, y: e.clientY, tx: viewer.tx, ty: viewer.ty, moved: false };
        stage.classList.add("is-dragging");
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: dist(a, b), m: mid(a, b), scale: viewer.scale, tx: viewer.tx, ty: viewer.ty };
        drag = null;
      }
    });
    stage.addEventListener("pointermove", e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = stage.getBoundingClientRect();
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const m = mid(a, b);
        const s1 = Math.min(MAX_SCALE, Math.max(minScale(), pinch.scale * dist(a, b) / pinch.d));
        const wx = (pinch.m.x - r.left - pinch.tx) / pinch.scale;
        const wy = (pinch.m.y - r.top - pinch.ty) / pinch.scale;
        viewer.mode = null;
        setView(s1, m.x - r.left - wx * s1, m.y - r.top - wy * s1);
      } else if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) setView(viewer.scale, drag.tx + dx, drag.ty + dy);
      }
    });
    const end = e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) {
        const p = [...pointers.values()][0];
        drag = { x: p.x, y: p.y, tx: viewer.tx, ty: viewer.ty, moved: true };
        return;
      }
      if (pointers.size === 0) {
        stage.classList.remove("is-dragging");
        if (e.type === "pointerup" && e.pointerType !== "mouse" && drag && !drag.moved) {
          const now = performance.now();
          if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
            const r = stage.getBoundingClientRect();
            zoomAround(viewer.scale * 2, e.clientX - r.left, e.clientY - r.top, true);
            lastTap = { t: 0, x: 0, y: 0 };
          } else {
            lastTap = { t: now, x: e.clientX, y: e.clientY };
          }
        }
        drag = null;
      }
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    stage.addEventListener("dblclick", e => {
      if (lastType !== "mouse") return;
      const r = stage.getBoundingClientRect();
      zoomAround(e.shiftKey || e.altKey ? viewer.scale / 2 : viewer.scale * 2, e.clientX - r.left, e.clientY - r.top, true);
    });
    addEventListener("resize", () => {
      if (!dlg.open) return;
      if (viewer.mode) setMode(viewer.mode, { animate: false }); else setView(viewer.scale, viewer.tx, viewer.ty);
    });
    return dlg;
  }
  function openViewer(fig, opener) {
    const source = fig.querySelector(".ds-diagram__canvas svg");
    if (!source) return;
    const dlg = viewer.dlg || createViewer();
    viewer.fig = fig;
    viewer.opener = opener || fig.querySelector(".ds-diagram__canvas");
    viewer.w = Number(fig.dataset.width) || source.viewBox.baseVal.width;
    viewer.h = Number(fig.dataset.height) || source.viewBox.baseVal.height;
    viewer.svg = source.cloneNode(true);
    viewer.svg.removeAttribute("role");
    dlg.querySelector(".ds-viewer__canvas").replaceChildren(viewer.svg);
    const map = dlg.querySelector(".ds-viewer__minimap");
    map.querySelector("svg")?.remove();
    const mini = source.cloneNode(true);
    mini.removeAttribute("width");
    mini.removeAttribute("height");
    map.prepend(mini);
    dlg.querySelector(".ds-viewer__title").innerHTML = `<span>${esc(fig.dataset.num || "")}</span>${esc(fig.dataset.caption || "図")}`;
    const hint = dlg.querySelector(".ds-viewer__hint");
    hint.dataset.hidden = "false";
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 4200);
    dlg.showModal();
    const saved = storage.get(VIEW_MODE_KEY);
    setMode(saved === "fit" || saved === "fill" ? saved : containScale() < 1 ? "fill" : "fit", { animate: false });
    dlg.querySelector(".ds-viewer__stage").focus({ preventScroll: true });
  }
  function downloadSvg() {
    const clone = viewer.svg.cloneNode(true);
    clone.setAttribute("width", String(viewer.w));
    clone.setAttribute("height", String(viewer.h));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("style", "background:#ffffff");
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(viewer.fig.dataset.caption || "diagram").replace(/[\\/:*?"<>|]/g, "_")}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ------------------------------------------------------------
     テーマ（自動・ライト・ダーク）
     ------------------------------------------------------------ */
  const THEME_KEY = "ds:theme";
  const THEMES = ["auto", "light", "dark"];
  const THEME_INFO = {
    auto: { label: "自動", icon: "monitor", desc: "OSの設定に合わせる" },
    light: { label: "ライト", icon: "sun", desc: "常に明るい表示" },
    dark: { label: "ダーク", icon: "moon", desc: "常に暗い表示" }
  };
  const urlTheme = new URLSearchParams(location.search).get("theme");
  if (THEMES.includes(urlTheme)) storage.set(THEME_KEY, urlTheme);
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  const themePref = () => { const v = storage.get(THEME_KEY); return THEMES.includes(v) ? v : "auto"; };
  function applyTheme(pref = themePref()) {
    const dark = pref === "dark" || (pref === "auto" && darkQuery.matches);
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.themePref = pref;
    for (const b of document.querySelectorAll(".ds-theme-toggle")) paintThemeButton(b, pref);
  }
  function paintThemeButton(button, pref) {
    const info = THEME_INFO[pref];
    button.innerHTML = `${icon(info.icon)}<span class="ds-theme-toggle__label">${info.label}</span>`;
    button.setAttribute("aria-label", `表示テーマを切り替える（現在：${info.label}。${info.desc}）`);
    button.title = `表示テーマ：${info.label}（${info.desc}）`;
  }
  function themeButton() {
    const button = fromHTML('<button type="button" class="ds-iconbtn ds-theme-toggle"></button>');
    button.addEventListener("click", () => {
      const next = THEMES[(THEMES.indexOf(themePref()) + 1) % THEMES.length];
      storage.set(THEME_KEY, next);
      applyTheme(next);
      toast(`表示テーマ：${THEME_INFO[next].label}（${THEME_INFO[next].desc}）`);
    });
    paintThemeButton(button, themePref());
    return button;
  }
  darkQuery.addEventListener("change", () => { if (themePref() === "auto") applyTheme("auto"); });

  /* ------------------------------------------------------------
     骨格（パターンごとに構成が異なる）
     ------------------------------------------------------------ */
  const doc = { meta: {}, toc: [], figures: [], article: null, readMinutes: 1 };
  const metaRows = () => [
    ["対象読者", doc.meta.audience],
    ["読了目安", `約${doc.readMinutes}分`],
    ["更新日", doc.meta.updated],
    ["状態", doc.meta.status],
    ["版", doc.meta.version]
  ].filter(([, v]) => v && String(v).length);
  const footerHTML = () => `<footer class="ds-footer"><span>${esc(doc.meta.title || "")}${doc.meta.updated ? ` ・ 更新日 ${esc(doc.meta.updated)}` : ""}</span><span>説明資料デザインシステム ${VERSION} ・ <a href="#top">ページの先頭へ</a></span></footer>`;
  const tagsHTML = () => (Array.isArray(doc.meta.tags) ? doc.meta.tags.map(t => `<span class="ds-badge">${esc(t)}</span>`).join(" ") : "");
  const tocButton = () => `<button class="ds-iconbtn ds-toc-button" type="button" data-open-toc aria-label="目次を開く">${icon("menu")}</button>`;
  const actionsSlot = '<div class="ds-topbar__actions" data-slot="actions"></div>';

  const shellHTML = () => `<div class="ds-app">
      <a class="ds-skip" href="#ds-main">本文へ移動</a>
      <header class="ds-topbar">${tocButton()}
        ${doc.meta.docid ? `<span class="ds-docid">${esc(doc.meta.docid)}</span>` : ""}<span class="ds-topbar__title">${esc(doc.meta.title || "")}</span>
        <div class="ds-chips">${doc.meta.status ? `<span class="ds-chip"><b>状態</b>${esc(doc.meta.status)}</span>` : ""}${doc.meta.version ? `<span class="ds-chip"><b>版</b>${esc(doc.meta.version)}</span>` : ""}${doc.meta.updated ? `<span class="ds-chip"><b>更新</b>${esc(doc.meta.updated)}</span>` : ""}</div>
        ${actionsSlot}<div class="ds-progress" aria-hidden="true"><span></span></div></header>
      <div class="ds-layout">
        <aside class="ds-sidebar" aria-label="目次"><div class="ds-sidebar__inner">
          <section class="ds-sidesection"><p class="ds-sidelabel"><span>目次</span><span>全${doc.toc.length}章</span></p><nav class="ds-toc">${tocHTML(doc.toc)}</nav></section>
          ${doc.figures.length ? `<section class="ds-sidesection"><p class="ds-sidelabel"><span>図の一覧</span><span>${doc.figures.length}点</span></p><ul class="ds-figlist">${doc.figures.map(f => `<li><a href="#${esc(f.id)}"><span>${esc(f.num)}</span>${esc(f.caption || "（題名なし）")}</a></li>`).join("")}</ul></section>` : ""}
        </div></aside>
        <main class="ds-main" id="ds-main">
          <header class="ds-hero" id="top"><div class="ds-hero__inner"><section class="ds-cover">
            <div class="ds-cover__main"><p class="ds-cover__kicker">${[doc.meta.docid, doc.meta.category].filter(Boolean).map(esc).join("　｜　") || "説明資料"}</p>
              <h1 class="ds-cover__title">${mdInline(doc.meta.title || "")}</h1>
              ${doc.meta.lead ? `<p class="ds-cover__lead">${mdInline(doc.meta.lead)}</p>` : ""}${tagsHTML() ? `<div class="ds-cover__tags">${tagsHTML()}</div>` : ""}</div>
            <div class="ds-cover__side"><dl>${metaRows().map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}${doc.figures.length ? `<dt>図</dt><dd>${doc.figures.length}点</dd>` : ""}</dl></div>
          </section></div></header>
          <div data-slot="content"></div>${footerHTML()}
        </main>
      </div></div>`;

  let shellRoot = null;
  let drawer = null;
  function mountShell() {
    if (!shellRoot) {
      shellRoot = document.createElement("div");
      shellRoot.id = "ds-root";
      document.body.prepend(shellRoot);
    }
    shellRoot.innerHTML = shellHTML();
    shellRoot.querySelector('[data-slot="content"]').replaceWith(doc.article);
    const actions = shellRoot.querySelector('[data-slot="actions"]');
    actions.append(searchButton(), fontSizeButton(), fromHTML('<span class="ds-status" role="status" aria-live="polite"></span>'), themeButton());
    applyFontSize();
    updateStatus();
    if (!drawer) {
      drawer = fromHTML(`<dialog class="ds-drawer" aria-label="目次"><div class="ds-drawer__head"><span>目次</span><button type="button" class="ds-iconbtn" data-close aria-label="目次を閉じる">${icon("x")}</button></div><div class="ds-drawer__body"><nav class="ds-toc"></nav></div></dialog>`);
      document.body.append(drawer);
      drawer.addEventListener("click", e => {
        if (e.target === drawer || e.target.closest("[data-close]") || e.target.closest("a")) drawer.close();
      });
    }
    drawer.querySelector(".ds-toc").innerHTML = tocHTML(doc.toc);
    for (const b of shellRoot.querySelectorAll("[data-open-toc]")) b.addEventListener("click", () => drawer.showModal());
    onScroll();
  }

  /* スクロール位置の追跡 */
  let headings = [];
  let ticking = false;
  function onScroll() {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    root.style.setProperty("--ds-progress", String(max > 0 ? Math.min(1, scrollY / max) : 0));
    const offset = (Number.parseFloat(getComputedStyle(root).getPropertyValue("--ds-topbar-h")) || 56) + 36;
    let current = null;
    for (const h of headings) {
      if (h.getBoundingClientRect().top - offset <= 0) current = h; else break;
    }
    for (const a of document.querySelectorAll("[data-toc]")) {
      a.setAttribute("aria-current", String(Boolean(current) && a.dataset.toc === current.id));
    }
  }

  /* ------------------------------------------------------------
     起動
     ------------------------------------------------------------ */
  const state = window.__dsState = { version: VERSION, ready: false, completed: false, error: null, vendor: { plantuml: null, hljs: null } };
  window.__plantumlDocumentState = { expected: 0, rendered: 0, errors: [], completed: false };

  function boot() {
    applyTheme();
    const sourceEl = document.getElementById("ds-source");
    const raw = (sourceEl?.textContent ?? "").replace(/<\\\/script/gi, "</script").replace(/^\s*\n/, "");
    const { meta, body } = parseFrontmatter(raw);
    doc.meta = meta;
    if (meta.title) document.title = meta.title;
    engine = createEngine();
    footnotes = { notes: collectFootnotes(body), order: [] };
    diagrams = [];
    const article = document.createElement("article");
    article.className = "ds-content";
    article.innerHTML = engine.parse(body);
    doc.figures = postProcess(article);
    doc.article = article;
    doc.toc = collectToc(article);
    doc.readMinutes = Math.max(1, Math.round(article.textContent.replace(/\s+/g, "").length / 550));
    autoLinkTerms(article);
    for (const el of article.querySelectorAll("[data-ds-hydrate]")) {
      const fn = hydrators.get(el.dataset.dsHydrate);
      if (fn) {
        try { fn(el); } catch (error) { console.error(error); }
      }
    }
    bindFigures(article);
    bindTerms();
    bindCopy();
    bindRefPreview();
    bindSearchKeys();
    mountShell();
    headings = [...article.querySelectorAll(":scope > h2, :scope > h3")];
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    addEventListener("resize", () => requestAnimationFrame(onScroll));
    document.addEventListener("click", e => {
      const anchor = e.target.closest(".ds-anchor");
      if (!anchor) return;
      copyText(new URL(anchor.getAttribute("href"), location.href).href).then(ok => ok && toast("見出しへのリンクをコピーしました"));
    });
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    }
    state.ready = true;
    highlightCode(article);
    renderDiagrams();
  }

  /* marked はこのファイルと同じ場所の vendor/ から読む */
  function loadMarked() {
    if (window.marked) return Promise.resolve();
    return loadScript(new URL("vendor/marked.umd.js", SELF_URL).href);
  }
  function showFatal(message) {
    state.error = message;
    const box = document.createElement("main");
    box.className = "ds-fatal";
    box.setAttribute("role", "alert");
    box.style.cssText = "max-width:40rem;margin:3rem auto;padding:1rem 1.25rem;border:2px solid #b42318;border-radius:8px;font:16px/1.7 sans-serif";
    box.innerHTML = `<b>説明資料を表示できませんでした。</b><br>${esc(message)}<br>リポジトリで <code>spec-dock installation update</code> を実行し、デザインシステム（spec-dock/design-system/）を入れてください。`;
    document.body.append(box);
  }
  const markedReady = loadMarked();
  async function start() {
    try {
      await markedReady;
      if (!window.marked) throw new Error("vendor/marked.umd.js に marked がありません。");
    } catch (error) {
      showFatal(`デザインシステムの部品（vendor/marked.umd.js）を読み込めませんでした。${error.message}`);
      return;
    }
    boot();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
