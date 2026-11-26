// 指揮の画面（/apexes）の段と行を DOM の要素にする。文字はすべて textContent で入れ、HTML として解かない
// （innerHTML を使わない）。SVG は部品（agent-marks.js）の createElementNS だけ。document を受けるので、
// テストは小さな偽の document で確かめる。見えない間は読まないポーリングの輪 startApexPolling もここに置く。
// 右のペイン（iss-00077 D-03）：枠は頂点を替えるたびに iframe の要素を作り直し（mountAgentFrame）、既にある枠の src を書き換えない。
// 外す前に、枠の中の送信の処理中の印を読んで確かめる（mayLeaveFrame、印は embed/unsettled.js）。
// メンバーの枠（iss-00080 D-02）：compose が偽なら送る欄のない答えるだけの枠（&compose=off）。id か compose が違えば作り直す。
// 対応のカード（D-01）・メンバーの帯・下書きの結果の帯もここで描く（renderApexCards、renderMemberBand、renderDraftNotice）。
// 新着の点（D-06）：見た時刻の保存（createSeenStore、localStorage の読み書きはみな try/catch）と、
// 選んだ頂点を続けて出した時間を数える口（createSeenTracker）。
import { frameSrc, SEEN_STORAGE_KEY, SEEN_VERSION, SWITCH_CONFIRM_TEXT, UNSEEN_LABEL } from './apexes-view.js';
import { AGENT_ICONS, appIcon, stateIcon } from './embed/agent-marks.js';
import { createOpenControl } from './embed/open-control.js';
import { frameUnsettled } from './embed/unsettled.js';
import { createPollLoop } from './poll-loop.js';

function make(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** 見出しの数（対応が必要・作業中・完了・新着）。emphasis の数だけ強調の class を付ける。 */
export function renderHeadline(doc, headline) {
  const box = make(doc, 'p', null, 'apex-counts');
  for (const part of headline) {
    const span = make(doc, 'span', part.text, part.emphasis ? 'count count--alert' : 'count');
    span.dataset.key = part.key;
    box.append(span);
  }
  return box;
}

/** 新しいタブで開くリンク（_blank、noopener noreferrer）。チームの帯（apexes-team-dom.js）も使う。 */
export function newTabLink(doc, href, text, className) {
  const a = make(doc, 'a', text, className);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/**
 * 対応が必要の印の札（iss-00097 D-02）。状態の言葉の横に置く。対応が必要は urgent、控えめは quiet の class。
 * チームの帯（apexes-team-dom.js）も使う。
 */
export function attentionMarks(doc, marks) {
  return (Array.isArray(marks) ? marks : []).map((mark) =>
    make(doc, 'span', mark.label, `member-attention member-attention--${mark.urgent ? 'urgent' : 'quiet'}`),
  );
}

/** 稼働中の内訳の木（iss-00092 D-02）。選ぶボタンの中に置くので span だけで組む。字下げは --depth。 */
export function renderLiveTeam(doc, live) {
  const box = make(doc, 'span', null, 'apex-live');
  for (const row of live.rows) {
    const node = make(doc, 'span', null, row.dim ? 'apex-live-node apex-live-node--dim' : 'apex-live-node');
    node.dataset.liveKey = row.key;
    node.style.setProperty('--depth', String(row.depth));
    const kind = make(doc, 'span', null, 'apex-live-kind');
    if (row.kind === 'agent') kind.append(appIcon(doc, row.icon, undefined, AGENT_ICONS));
    else kind.append(make(doc, 'span', null, 'apex-live-dot'));
    node.append(
      kind,
      make(doc, 'span', row.title, 'apex-live-title'),
      make(doc, 'span', row.statusLabel, `apex-live-mark apex-live-mark--${row.status}`),
      ...attentionMarks(doc, row.marks),
    );
    if (row.elapsed) node.append(make(doc, 'span', row.elapsed, 'apex-live-elapsed'));
    box.append(node);
  }
  if (live.moreLabel) box.append(make(doc, 'span', live.moreLabel, 'apex-live-more'));
  return box;
}

/**
 * 1つの行。頂点の行は、押すと右のペインに出す選ぶボタン（data-apex）と、行の操作の箱（小さな「新しいタブで開く」のリンクと、
 * 開く先が分かり options.onOpen があるときの「Orca で開く」の共有の部品。iss-00102）。部品は選ぶボタンの外に置く。
 * 結べない行は、行の全体が /embed/agent?id=（結べない束は /runs/<id>）を新しいタブで開くリンク。
 * @param {any} doc
 * @param {any} row
 * @param {{ onOpen?: (target: any, control: any) => void, onOpenMount?: (target: any, control: any) => void }} [options]
 */
export function renderRow(doc, row, options = {}) {
  const li = make(doc, 'li', null, row.selected ? 'item apex apex--selected' : 'item apex');
  li.dataset.key = row.key;
  if (row.selected) li.dataset.selected = 'true';
  let a;
  if (row.selectable) {
    a = make(doc, 'button', null, 'apex-link apex-select');
    a.type = 'button';
    a.dataset.apex = row.key;
  } else {
    a = newTabLink(doc, row.href, null, 'apex-link');
  }

  const head = make(doc, 'span', null, 'apex-head');
  const icon = make(doc, 'span', null, 'apex-icon');
  icon.append(appIcon(doc, row.icon, undefined, AGENT_ICONS));
  head.append(icon);
  const mark = make(doc, 'span', null, `apex-mark apex-mark--${row.mark}`);
  if (row.monitoring) mark.append(stateIcon(doc, 'monitoring', 'state-icon'));
  mark.append(make(doc, 'span', row.markLabel));
  if (row.unseen) {
    const dot = make(doc, 'span', null, 'apex-unseen');
    dot.setAttribute('aria-label', UNSEEN_LABEL);
    dot.title = UNSEEN_LABEL;
    head.append(dot);
  }
  head.append(mark, make(doc, 'span', row.title, 'apex-title'));
  a.append(head);

  const meta = make(doc, 'span', null, 'meta');
  meta.append(make(doc, 'span', row.project ?? 'プロジェクト不明', row.project ? 'project' : 'project missing'));
  if (row.issue) meta.append(make(doc, 'span', row.issue, 'issue'));
  if (row.agentType) meta.append(make(doc, 'span', row.agentType, 'agent'));
  if (row.members) {
    const members = make(doc, 'span', `配下 ${row.members}`, 'members');
    members.title = row.membersLabel ?? '';
    meta.append(members);
  }
  if (row.elapsed) meta.append(make(doc, 'span', row.elapsed, 'elapsed'));
  a.append(meta);

  const badges = row.badges ?? [];
  if (row.reasons.length > 0 || row.tags.length > 0 || badges.length > 0) {
    const chips = make(doc, 'span', null, 'reason');
    for (const text of row.reasons) chips.append(make(doc, 'span', text, 'chip'));
    for (const text of row.tags) chips.append(make(doc, 'span', text, 'chip tag'));
    for (const text of badges) chips.append(make(doc, 'span', text, 'chip badge'));
    a.append(chips);
  }
  if (row.live) a.append(renderLiveTeam(doc, row.live));
  li.append(a);
  if (row.selectable) {
    const actions = make(doc, 'span', null, 'apex-actions');
    actions.append(newTabLink(doc, row.href, '新しいタブで開く', 'apex-newtab'));
    if (row.open && typeof options.onOpen === 'function') {
      const control = createOpenControl(doc, { size: 'sm' });
      const target = row.open;
      options.onOpenMount?.(target, control);
      control.button.addEventListener('click', () => options.onOpen?.(target, control));
      actions.append(control.root);
    }
    li.append(actions);
  }
  return li;
}

/**
 * 1つの段。collapsed の段は details で畳み、expanded なら開いて描く。onOpen・onOpenMount は行に渡す。
 * @param {any} doc
 * @param {any} section
 * @param {{ expanded?: boolean, onOpen?: (target: any, control: any) => void,
 *   onOpenMount?: (target: any, control: any) => void }} [options]
 */
export function renderSection(doc, section, { expanded = false, onOpen, onOpenMount } = {}) {
  const node = make(doc, 'section', null, 'stage');
  node.dataset.stage = section.key;
  const heading = `${section.title}（${section.count}）`;
  const body = [];
  if (section.rows.length === 0) body.push(make(doc, 'p', 'なし', 'empty'));
  else {
    const ul = make(doc, 'ul', null, 'items');
    for (const row of section.rows) ul.append(renderRow(doc, row, { onOpen, onOpenMount }));
    body.push(ul);
  }
  if (section.collapsed) {
    const details = make(doc, 'details');
    details.open = expanded === true;
    details.append(make(doc, 'summary', heading), ...body);
    node.append(details);
  } else {
    node.append(make(doc, 'h2', heading), ...body);
  }
  return node;
}

/**
 * 右のペインの見出し（「← 一覧」、状態の印、題名、「一覧にありません」の札、「Orca で開く」の部品の置き場）。
 * openRoot は呼び手が持つ共有の部品（web/embed/open-control.js）の root で、描き直しても同じ要素を移して使う。
 * @param {any} doc
 * @param {any} header buildPane の header
 * @param {{ openRoot?: any }} [options]
 */
export function renderPaneHead(doc, header, { openRoot = null } = {}) {
  const box = make(doc, 'div', null, 'apex-pane-bar');
  const back = make(doc, 'button', '← 一覧', 'apex-back');
  back.type = 'button';
  back.dataset.action = 'back';
  box.append(back);
  const mark = make(doc, 'span', null, `apex-mark apex-mark--${header.mark}`);
  if (header.monitoring) mark.append(stateIcon(doc, 'monitoring', 'state-icon'));
  mark.append(make(doc, 'span', header.markLabel));
  box.append(mark, make(doc, 'span', header.title, 'apex-title apex-pane-title'));
  if (header.missingLabel) box.append(make(doc, 'span', header.missingLabel, 'chip tag apex-missing'));
  if (openRoot) {
    const slot = make(doc, 'span', null, 'apex-pane-open');
    slot.append(openRoot);
    box.append(slot);
  }
  return box;
}

const FRAME_TITLE = '選んだ頂点の会話';

/** 置き場の今の枠（なければ null）。 */
function currentFrame(slot) {
  return [...slot.children].find((child) => child.tagName === 'IFRAME') ?? null;
}

/**
 * 置き場に、頂点 id の /embed/agent の枠を出す。前と同じ id なら今の枠をそのまま返し、違えば子をすべて外して、
 * 新しい iframe の要素に src などを決めてから入れる。既にある枠の src を書き換えない（iframe の中のページを移さない）。
 */
export function mountAgentFrame(slot, id, { compose = true } = {}) {
  const current = currentFrame(slot);
  const mode = compose ? 'on' : 'off';
  if (current && current.dataset.agentId === id && current.dataset.compose === mode) return current;
  const frame = slot.ownerDocument.createElement('iframe');
  frame.dataset.agentId = id;
  frame.dataset.compose = mode;
  frame.className = 'apex-frame';
  frame.title = FRAME_TITLE;
  frame.referrerPolicy = 'same-origin';
  frame.src = frameSrc(id, { compose });
  slot.replaceChildren();
  slot.append(frame);
  return frame;
}

/**
 * 対応のカードの欄（apexes-cards-view.js の buildApexCards）。カードがなければ null（欄を出さない）。
 * 押すボタンは data-card-action（answer・tell）と data-card-key を持つ。
 */
export function renderApexCards(doc, cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const box = make(doc, 'section', null, 'apex-cards');
  box.setAttribute('aria-label', '対応');
  for (const card of cards) {
    const row = make(doc, 'div', null, `apex-card apex-card--${card.kind}`);
    row.dataset.cardKey = card.key;
    row.append(make(doc, 'span', card.text, 'apex-card-text'));
    if (card.note) row.append(make(doc, 'span', card.note, 'apex-card-note'));
    if (card.action) {
      const button = make(doc, 'button', card.action.label, 'apex-card-action');
      button.type = 'button';
      button.dataset.cardAction = card.action.type;
      button.dataset.cardKey = card.key;
      row.append(button);
    }
    box.append(row);
  }
  return box;
}

/** メンバーの枠の帯（「メンバー〈題名〉（答えるだけ）」と［頂点に戻る］、data-action="to-apex"）。band がなければ null。 */
export function renderMemberBand(doc, band) {
  if (!band) return null;
  const box = make(doc, 'div', null, 'apex-member-band');
  box.append(make(doc, 'span', band.text, 'apex-member-band-text'));
  const back = make(doc, 'button', band.back, 'apex-member-back');
  back.type = 'button';
  back.dataset.action = 'to-apex';
  box.append(back);
  return box;
}

/** 下書きの結果の帯（apexes-cards-view.js の draftNotice）。なければ null。 */
export function renderDraftNotice(doc, notice) {
  if (!notice) return null;
  const box = make(doc, 'p', notice.text, `apex-draft-notice apex-draft-notice--${notice.kind}`);
  box.role = 'status';
  return box;
}

/** 置き場の枠を外し、案内の文を出す。 */
export function clearAgentFrame(slot, guide) {
  slot.replaceChildren(make(slot.ownerDocument, 'p', guide, 'apex-guide'));
}

/**
 * 今の枠を外してよいか。枠の中に処理中か結果不明の表示があれば confirm で聞き、選んだときだけ真。
 * 枠がない、印がない、読めない（例外）なら聞かずに真。
 */
export function mayLeaveFrame(slot, confirm) {
  const frame = currentFrame(slot);
  if (!frame || !frameUnsettled(frame)) return true;
  return confirm(SWITCH_CONFIRM_TEXT) === true;
}

/**
 * 見た時刻の保存（localStorage の鍵 SEEN_STORAGE_KEY、形 { v: 1, seen: { [id]: ISO 時刻 } }）。
 * 読み書きは try/catch で包む。使えなければ load は null（点を出さない）、save は偽を返す。壊れた値は空として読む。
 * @param {() => { getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} getStorage
 */
export function createSeenStore(getStorage) {
  return {
    load() {
      let text;
      try {
        text = getStorage().getItem(SEEN_STORAGE_KEY);
      } catch {
        return null;
      }
      if (text === null || text === undefined) return {};
      try {
        const parsed = JSON.parse(text);
        if (parsed?.v !== SEEN_VERSION || !parsed.seen || typeof parsed.seen !== 'object') return {};
        const seen = {};
        for (const [id, at] of Object.entries(parsed.seen)) if (typeof at === 'string') seen[id] = at;
        return seen;
      } catch {
        return {};
      }
    },
    save(seen) {
      try {
        getStorage().setItem(SEEN_STORAGE_KEY, JSON.stringify({ v: SEEN_VERSION, seen }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * 選んだ頂点を、別の頂点を選ばず、タブが見えたまま dwellMs 続けて出したら、onSeen(id, ISO 時刻) を1回呼ぶ。
 * show は描くたびに（同じ id でも）、その頂点の最後の活動（version）と一緒に呼ぶ。出し続けている間に version が
 * 変われば（また動いた）、もう一度 dwellMs 数えて書き直す。visibility は visibilitychange で呼ぶ。隠れたら数え直す。
 * @param {{ dwellMs: number, now: () => number, isVisible: () => boolean,
 *   schedule: (fn: () => void, ms: number) => any, cancel: (timer: any) => void,
 *   onSeen: (id: string, at: string) => void }} options
 */
export function createSeenTracker({ dwellMs, now, isVisible, schedule, cancel, onSeen }) {
  let current = null;
  let version = null;
  let timer = null;
  let done = false;
  const clear = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const arm = () => {
    clear();
    if (current === null || done || !isVisible()) return;
    const id = current;
    timer = schedule(() => {
      timer = null;
      if (current !== id || done || !isVisible()) return;
      done = true;
      onSeen(id, new Date(now()).toISOString());
    }, dwellMs);
  };
  return {
    /**
     * @param {string | null} id
     * @param {string | null} [nextVersion]
     */
    show(id, nextVersion = null) {
      if (id === current && nextVersion === version) return;
      current = id;
      version = nextVersion;
      done = false;
      arm();
    },
    visibility() {
      if (isVisible()) {
        if (timer === null) arm();
      } else clear();
    },
  };
}

/**
 * 間隔ごとに load を呼ぶ輪（poll-loop.js）。画面が隠れたら予約を取り消し、隠れている間は次を予約しない。
 * ただし keepAliveWhenHidden()（呼ぶたびに読む。通知の許可が granted か）が真なら、隠れている間も
 * hiddenDelayMs ごとに読む（iss-00081 D-04）。見えたらすぐ読み直し、今の間隔に戻る。予約はいつも1つだけ。
 * 最初から隠れていれば、見えるまで（keepAliveWhenHidden が真なら hiddenDelayMs の後まで）読まない。
 * @param {{ doc: any, load: (isCurrent: () => boolean) => Promise<void>, delayMs: number,
 *   keepAliveWhenHidden?: () => boolean, hiddenDelayMs?: number,
 *   setTimer?: (fn: () => void, ms: number) => any, clearTimer?: (id: any) => void }} options
 * @returns {{ restart: () => void, stop: () => void }}
 */
export function startApexPolling({
  doc,
  load,
  delayMs,
  keepAliveWhenHidden = () => false,
  hiddenDelayMs = delayMs,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}) {
  let timer = null;
  let stopped = false;
  const clear = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const keepAlive = () => {
    try {
      return keepAliveWhenHidden() === true;
    } catch {
      return false;
    }
  };
  /** 予約を1つにして fn を ms の後に呼ぶ。 */
  const arm = (fn, ms) => {
    clear();
    timer = setTimer(() => {
      timer = null;
      fn();
    }, ms);
    return timer;
  };
  const loop = createPollLoop({
    load,
    schedule: (fn, ms) => {
      if (stopped) return null;
      if (!doc.hidden) return arm(fn, ms);
      return keepAlive() ? arm(fn, hiddenDelayMs) : null;
    },
    cancel: clear,
    delayMs,
  });
  /** 隠れたとき：予約を取り消し、読み続けるなら hiddenDelayMs の後に読み直す。 */
  const hide = () => {
    clear();
    if (!stopped && keepAlive()) arm(() => loop.restart(), hiddenDelayMs);
  };
  const onVisibility = () => {
    if (doc.hidden) hide();
    else if (!stopped) loop.restart();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  if (doc.hidden) hide();
  else loop.restart();
  return {
    restart() {
      if (!stopped) loop.restart();
    },
    stop() {
      stopped = true;
      clear();
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

export const NOTIFY_BUTTON_TEXT = '通知を許可';
const REASON_SEPARATOR = '・';

/**
 * デスクトップの通知の口（iss-00081 D-03）。Notification があり、isSecureContext が真のときだけ使う
 * （Tailscale の http などでは使わず、題名と favicon だけで知らせる）。どの呼び出しも try/catch で包む。
 * - renderControl(onChange)：permission が default のときだけ「通知を許可」のボタン（なければ null）。
 *   押したときだけ requestPermission を呼び、済んだら onChange。
 * - keepAliveWhenHidden()：permission が granted か（隠れている間も読み続けるか）。
 * - deliver(candidates, markShown)：granted で doc.hidden が真のときだけ、候補ごとに題名と理由の言葉だけで出し、
 *   出せたものを markShown(key)。押すと窓を前に出し、onOpen(頂点の id)。
 * @param {{ doc: any, env: { Notification?: any, isSecureContext?: boolean, focus?: () => void },
 *   onOpen: (id: string) => void }} options
 */
export function createApexNotifier({ doc, env, onOpen }) {
  const permission = () => {
    try {
      if (typeof env.Notification !== 'function' || env.isSecureContext !== true) return 'unsupported';
      return String(env.Notification.permission);
    } catch {
      return 'unsupported';
    }
  };
  return {
    keepAliveWhenHidden: () => permission() === 'granted',
    renderControl(onChange) {
      if (permission() !== 'default') return null;
      const button = make(doc, 'button', NOTIFY_BUTTON_TEXT, 'apex-notify');
      button.type = 'button';
      button.addEventListener('click', () => {
        let asked;
        try {
          asked = Promise.resolve(env.Notification.requestPermission());
        } catch {
          asked = Promise.resolve();
        }
        asked.then(
          () => onChange(),
          () => onChange(),
        );
      });
      return button;
    },
    deliver(candidates, markShown) {
      if (permission() !== 'granted' || doc.hidden !== true) return;
      for (const candidate of candidates) {
        try {
          const shown = new env.Notification(candidate.title, {
            body: candidate.reasons.join(REASON_SEPARATOR),
            tag: candidate.key,
          });
          shown.onclick = () => {
            try {
              env.focus?.();
            } catch {
              // 前に出せなくても、選びは移す。
            }
            onOpen(candidate.id);
          };
          markShown(candidate.key);
        } catch {
          // 出せなければ K に入れない（次の読みで出せれば出す）。
        }
      }
    },
  };
}
