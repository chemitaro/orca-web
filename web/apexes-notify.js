// 指揮の画面（/apexes）のデスクトップの通知を出すかの判断（iss-00081 D-02。純粋な状態の機械）。
// DOM、時計、fetch、Notification に触らない。読んだ文書を順に observe で受け、出すべき候補を返す。
// 同一性は頂点の id と理由の集合。開いた後の stale でない最初の2回の読みに出たもの、出したもの（markShown）は
// 知っている集合 K に入れ、stale でない読みで2回続けて出なければ K から外す。候補は、今と1つ前の stale でない
// 文書の両方で同じ同一性が対応が必要で、その間に stale の文書も読みの失敗も挟まず、K にないもの。
import { REASON_LABELS } from './apexes-view.js';

const WARMUP_READS = 2;
const FORGET_AFTER_MISSES = 2;
const FALLBACK_TITLE = '頂点';

const list = (value) => (Array.isArray(value) ? value : []);

/** 通知の同一性。理由は並べ替えて、順の違いを同じに扱う。 */
export function notifyKey(id, reasons) {
  return `${String(id)}\n${[...list(reasons)].map(String).sort().join(',')}`;
}

/** 文書の対応が必要の同一性（key → 候補）。形が読めなければ null。 */
function needsOf(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.items)) return null;
  const out = new Map();
  for (const item of doc.items) {
    if (item?.group !== 'needs_action' || item.id === undefined || item.id === null) continue;
    const reasons = list(item.reasons);
    const key = notifyKey(item.id, reasons);
    out.set(key, {
      id: String(item.id),
      key,
      title: typeof item.title === 'string' && item.title !== '' ? item.title : FALLBACK_TITLE,
      reasons: reasons.map((r) => REASON_LABELS[r] ?? String(r)),
    });
  }
  return out;
}

/**
 * @returns {{
 *   observe: (doc: any) => { id: string, key: string, title: string, reasons: string[] }[],
 *   observeFailure: () => void,
 *   markShown: (key: string) => void,
 * }}
 */
export function createNotifyTracker() {
  /** 知っている同一性と、stale でない読みで続けて出なかった回数。 */
  const known = new Map();
  let reads = 0;
  /** 1つ前の stale でない文書の同一性。stale か失敗を挟んだら null。 */
  let previous = null;

  return {
    observe(doc) {
      const current = needsOf(doc);
      if (current === null || doc.stale === true) {
        previous = null;
        return [];
      }
      for (const [key, misses] of known) {
        if (current.has(key)) known.set(key, 0);
        else if (misses + 1 >= FORGET_AFTER_MISSES) known.delete(key);
        else known.set(key, misses + 1);
      }
      const before = previous;
      previous = new Set(current.keys());
      if (reads < WARMUP_READS) {
        reads += 1;
        for (const key of current.keys()) known.set(key, 0);
        return [];
      }
      if (before === null) return [];
      return [...current.values()].filter((c) => before.has(c.key) && !known.has(c.key));
    },
    observeFailure() {
      previous = null;
    },
    markShown(key) {
      known.set(key, 0);
    },
  };
}
