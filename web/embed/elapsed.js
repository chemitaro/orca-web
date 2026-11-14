// 経過の表記（純粋な関数）。経過の規則（境目）はこのファイルにだけ置く。DOM、時計、fetch に触らない。
// 印の部品、受け箱、Run の木、SpecDock や iss-00028 のチャットから import する。

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

function parseFrom(from) {
  if (typeof from === 'number') return Number.isFinite(from) ? from : null;
  if (typeof from !== 'string') return null;
  const at = Date.parse(from);
  return Number.isNaN(at) ? null : at;
}

function diffMs(from, now, clampFuture) {
  if (typeof now !== 'number' || !Number.isFinite(now)) return null;
  const at = parseFrom(from);
  if (at === null) return null;
  const diff = now - at;
  if (diff >= 0) return diff;
  return clampFuture ? 0 : null;
}

/** 経過を切り捨てた1つの単位にする。日より上に上げない。 */
function unitOf(ms) {
  const minutes = Math.floor(ms / MINUTE_MS);
  if (minutes < 1) return { unit: 'now', n: 0 };
  if (minutes < MINUTES_PER_HOUR) return { unit: 'm', n: minutes };
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return { unit: 'h', n: hours };
  return { unit: 'd', n: Math.floor(hours / HOURS_PER_DAY) };
}

const LONG = { m: '分', h: '時間', d: '日' };

/**
 * from（ISO 8601 の文字列、またはミリ秒の数）から now（ミリ秒）までの経過のミリ秒。
 * 未来・解けない値・数でない now は null。
 * @param {unknown} from
 * @param {unknown} now
 * @returns {number | null}
 */
export function elapsedMs(from, now) {
  return diffMs(from, now, false);
}

/**
 * 短い形：'now' | '<N>m' | '<N>h' | '<N>d' | null。clampFuture なら未来は 'now'。
 * @param {unknown} from
 * @param {unknown} now
 * @param {{ clampFuture?: boolean }} [options]
 * @returns {string | null}
 */
export function formatElapsed(from, now, { clampFuture = false } = {}) {
  const ms = diffMs(from, now, clampFuture === true);
  if (ms === null) return null;
  const { unit, n } = unitOf(ms);
  return unit === 'now' ? 'now' : `${n}${unit}`;
}

/**
 * 読める形（日本語）：'1分未満' | '<N>分' | '<N>時間' | '<N>日' | null。aria-label と title の文に使う。
 * @param {unknown} from
 * @param {unknown} now
 * @param {{ clampFuture?: boolean }} [options]
 * @returns {string | null}
 */
export function describeElapsed(from, now, { clampFuture = false } = {}) {
  const ms = diffMs(from, now, clampFuture === true);
  if (ms === null) return null;
  const { unit, n } = unitOf(ms);
  return unit === 'now' ? '1分未満' : `${n}${LONG[unit]}`;
}
