// 窓の差分。前の窓と今の窓（同じセッションの鍵の、正規化した件の並び）を比べ、追記と、同じ位置の更新と、置き換えに分ける。
// 前の窓の後ろの部分（offset o から）の id の並びが今の窓の先頭と一致する最小の o を探す（窓が前に進むと先頭が外れる）。
// 見つからなければ（件が消えた、並びが変わった、窓より多い追記）置き換え。
import type { TranscriptMessage } from './normalize.ts';

export type WindowDiff =
  | { type: 'none' }
  | { type: 'appended'; items: TranscriptMessage[]; updated: TranscriptMessage[] }
  | { type: 'replacement' };

const same = (a: TranscriptMessage, b: TranscriptMessage): boolean => JSON.stringify(a) === JSON.stringify(b);

export function diffWindow(
  prev: readonly TranscriptMessage[],
  next: readonly TranscriptMessage[],
  { full }: { full: boolean },
): WindowDiff {
  if (prev.length === 0) return next.length ? { type: 'appended', items: [...next], updated: [] } : { type: 'none' };
  for (let o = 0; o < prev.length; o++) {
    if (o > 0 && !full) break;
    const overlap = prev.length - o;
    if (overlap > next.length) continue;
    let aligned = true;
    for (let i = 0; i < overlap; i++) {
      if (prev[o + i]?.id !== next[i]?.id) {
        aligned = false;
        break;
      }
    }
    if (!aligned) continue;
    const updated: TranscriptMessage[] = [];
    for (let i = 0; i < overlap; i++) {
      const a = prev[o + i] as TranscriptMessage;
      const b = next[i] as TranscriptMessage;
      if (!same(a, b)) updated.push(b);
    }
    const items = next.slice(overlap);
    // 足された件に、前の窓の件が混ざっていれば（並びが変わった）、追記ではない。
    const known = new Set(prev.map((m) => m.id));
    if (items.some((m) => known.has(m.id))) return { type: 'replacement' };
    return items.length || updated.length ? { type: 'appended', items, updated } : { type: 'none' };
  }
  return { type: 'replacement' };
}
