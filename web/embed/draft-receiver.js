// 親の画面（指揮の画面 /apexes）から /embed/agent の入力欄へ下書きを入れる口（iss-00080 D-03・D-04）。
// 知らせの種類と条件はここの1か所に置く。受け手（agent-frame.js）と送り手（apexes.js）が同じファイルを使う。
// 下書きは入力欄に入れるだけで、送らない（F-01）。送るのは利用者が送る欄で押したときだけ。
// 知らせ：親へ { type: 'orca-web:ready' }（1回）、親から { type: 'orca-web:draft', text }、親へ { type: 'orca-web:draft-result', ok, reason }。
// 宛先のオリジンはいつも自分のオリジン（同じオリジンの親だけが受け、送る）。

export const READY_TYPE = 'orca-web:ready';
export const DRAFT_TYPE = 'orca-web:draft';
export const RESULT_TYPE = 'orca-web:draft-result';
/** 下書きの長さの上限（字）。 */
export const DRAFT_MAX_LENGTH = 1000;
/** 準備の知らせを待つ上限（ミリ秒）。 */
export const READY_TIMEOUT_MS = 10_000;

/** 送る欄を出さない（答えるだけの）枠か。`compose=off` のときだけ。 */
export function isComposeOff(params) {
  return params.get('compose') === 'off';
}

/** 見出しを詰める枠か（題名の行を隠す）。`head=compact` のときだけ（iss-00104 D-02）。 */
export function isHeadCompact(params) {
  return params.get('head') === 'compact';
}

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** 改行（\n）のほかの制御文字を除く。 */
function clean(text) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字を除くための式
  return text.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '');
}

/**
 * 親からの知らせを入力欄に入れてよいか。ignored は返事もしない（別のオリジン・親でない窓・別の種類・形の違い）。
 * @param {{ origin: string, source: unknown, data: unknown }} event
 * @param {{ selfOrigin: string, parent: unknown, composeOn: boolean, sendPhase: string, currentText: string }} ctx
 * @returns {{ ok: true, text: string } | { ok: false, reason: 'ignored' | 'compose_off' | 'too_long' | 'disabled' | 'busy' | 'not_empty' }}
 */
export function acceptDraft(event, ctx) {
  if (event.origin !== ctx.selfOrigin || !ctx.parent || event.source !== ctx.parent) return refuse('ignored');
  const data = event.data;
  if (!isRecord(data) || data.type !== DRAFT_TYPE || typeof data.text !== 'string') return refuse('ignored');
  if (!ctx.composeOn) return refuse('compose_off');
  const text = clean(data.text);
  if (text.length > DRAFT_MAX_LENGTH) return refuse('too_long');
  if (ctx.sendPhase === 'disabled') return refuse('disabled');
  if (ctx.sendPhase !== 'compose' && ctx.sendPhase !== 'changed') return refuse('busy');
  if (ctx.currentText !== '') return refuse('not_empty');
  return { ok: true, text };
}

function refuse(reason) {
  return { ok: false, reason };
}

/**
 * 受け手（/embed/agent）。作った時に受け口を登録する。ok のときだけ input を呼び、受けた下書きごとに親へ結果を返す。
 * ready() は送る欄の状態を読んだ後に呼ぶ。何度呼んでも親へは1回だけ知らせる。
 * @param {{
 *   win: { addEventListener: (type: 'message', fn: (event: any) => void) => void },
 *   parent: { postMessage: (message: unknown, origin: string) => void } | null,
 *   selfOrigin: string,
 *   composeOn: boolean,
 *   sendPhase: () => string,
 *   currentText: () => string,
 *   input: (text: string) => void,
 * }} deps
 */
export function createDraftReceiver(deps) {
  let announced = false;
  deps.win.addEventListener('message', (event) => {
    const result = acceptDraft(
      { origin: event.origin, source: event.source, data: event.data },
      {
        selfOrigin: deps.selfOrigin,
        parent: deps.parent,
        composeOn: deps.composeOn,
        sendPhase: deps.sendPhase(),
        currentText: deps.currentText(),
      },
    );
    if (!result.ok && result.reason === 'ignored') return;
    if (result.ok) deps.input(result.text);
    deps.parent?.postMessage(
      { type: RESULT_TYPE, ok: result.ok, reason: result.ok ? null : result.reason },
      deps.selfOrigin,
    );
  });
  return {
    ready() {
      if (announced || !deps.parent) return;
      announced = true;
      deps.parent.postMessage({ type: READY_TYPE }, deps.selfOrigin);
    },
  };
}

/**
 * 送り手（親の画面）。枠を作るたびに frameCreated(frame) を呼ぶ。今の枠から来た ready だけを覚え、
 * send(text) は準備できていればすぐ、まだなら ready を待って1回だけ送る。上限までに来なければ送らず timeout を返す。
 * 枠が作り直されたら、前の枠あての下書きは捨てる。結果は送った後の今の枠からだけ受ける。
 * @param {{
 *   selfOrigin: string,
 *   onResult: (result: { ok: boolean, reason: string | null }) => void,
 *   timeoutMs?: number,
 *   setTimer?: (fn: () => void, ms: number) => unknown,
 *   clearTimer?: (id: unknown) => void,
 * }} deps
 */
export function createDraftSender(deps) {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id));
  const timeoutMs = deps.timeoutMs ?? READY_TIMEOUT_MS;
  /** @type {{ contentWindow: { postMessage: (message: unknown, origin: string) => void } | null } | null} */
  let frame = null;
  let ready = false;
  /** 送る前の下書き。 */
  let pending = null;
  let timer = null;
  /** 送った後で、結果を待っているか。 */
  let awaiting = false;

  function stopTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function post() {
    const text = pending;
    pending = null;
    stopTimer();
    awaiting = true;
    frame?.contentWindow?.postMessage({ type: DRAFT_TYPE, text }, deps.selfOrigin);
  }

  return {
    frameCreated(next) {
      frame = next;
      ready = false;
      pending = null;
      awaiting = false;
      stopTimer();
    },
    send(text) {
      pending = text;
      awaiting = false;
      stopTimer();
      if (ready) {
        post();
        return;
      }
      timer = setTimer(() => {
        timer = null;
        if (pending === null) return;
        pending = null;
        deps.onResult({ ok: false, reason: 'timeout' });
      }, timeoutMs);
    },
    handleMessage(event) {
      if (event.origin !== deps.selfOrigin || !frame?.contentWindow || event.source !== frame.contentWindow) return;
      const data = event.data;
      if (!isRecord(data)) return;
      if (data.type === READY_TYPE) {
        ready = true;
        if (pending !== null) post();
      } else if (data.type === RESULT_TYPE && awaiting) {
        awaiting = false;
        deps.onResult({ ok: data.ok === true, reason: typeof data.reason === 'string' ? data.reason : null });
      }
    },
  };
}
