// 送信の処理中か結果不明の印（iss-00077 D-04、F-01）。/embed/agent の body に付け、同じオリジンの外の画面（指揮の画面）が読む。
// 印の名前と、どの段を処理中とみなすかはここの1か所だけに置く。各部品の状態を読むだけで、送信の流れは変えない。

/** body に付ける属性の名前。値は "true" だけ。 */
export const UNSETTLED_ATTRIBUTE = 'data-unsettled';

/** 送る欄（send-view.js）の段のうち、送っている・照会している・結果不明の段。 */
const SEND_PHASES = new Set(['sending', 'checking', 'unknown']);
/** 質問と承認のカードの流れの段のうち、送っている・照会している・結果不明・途中まで（partial）の段。 */
const CARD_PHASES = new Set(['sending', 'checking', 'unknown', 'partial']);

/**
 * 処理中か結果不明の表示があるか。
 * @param {{ sendPhase?: string | null, questionPhases?: Iterable<string>, approvalPhases?: Iterable<string> }} phases
 * @returns {boolean}
 */
export function isUnsettled({ sendPhase = null, questionPhases = [], approvalPhases = [] }) {
  if (sendPhase !== null && SEND_PHASES.has(sendPhase)) return true;
  for (const phase of questionPhases) if (CARD_PHASES.has(phase)) return true;
  for (const phase of approvalPhases) if (CARD_PHASES.has(phase)) return true;
  return false;
}

/**
 * 開いている（part.state が pending の）カードの段だけを返す。答え済み・取り消しで閉じたカードは、帯を出さないので数えない。
 * @param {Map<string, { part?: any }>} rows key ごとのカードの行
 * @param {(key: string) => string} phaseOf その key の流れの段
 * @returns {string[]}
 */
export function pendingPhases(rows, phaseOf) {
  const phases = [];
  for (const [key, row] of rows) if (row?.part?.state === 'pending') phases.push(phaseOf(key));
  return phases;
}

/**
 * 印を付けるか外す。
 * @param {{ setAttribute: (name: string, value: string) => void, removeAttribute: (name: string) => void }} body
 * @param {boolean} unsettled
 */
export function markUnsettled(body, unsettled) {
  if (unsettled) body.setAttribute(UNSETTLED_ATTRIBUTE, 'true');
  else body.removeAttribute(UNSETTLED_ATTRIBUTE);
}

/**
 * 枠の中の /embed/agent が印を付けているか（外の画面が使う）。読めないとき（例外、まだ文書がない）は偽。
 * @param {any} frame iframe の要素
 * @returns {boolean}
 */
export function frameUnsettled(frame) {
  try {
    return frame?.contentDocument?.body?.getAttribute(UNSETTLED_ATTRIBUTE) === 'true';
  } catch {
    return false;
  }
}
