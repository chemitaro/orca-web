// 鮮度が偽の間に使う、最後の鮮度が真の判定で頂点ごとに当たった A3〜A6 の理由（F-02、D-03）。
// メモリだけに持ち、ファイルに書かない。app の生存の間に1つ。
import type { ApexReason } from './model.ts';

export class ApexVerdictMemo {
  #reasons = new Map<string, ApexReason[]>();

  /** 鮮度が真の判定の全部の頂点で上書きする。渡さなかった頂点（文書にない頂点）は捨てる。 */
  replace(reasons: ReadonlyMap<string, readonly ApexReason[]>): void {
    this.#reasons = new Map([...reasons].map(([id, list]) => [id, [...list]]));
  }

  recall(apexId: string): readonly ApexReason[] {
    return this.#reasons.get(apexId) ?? [];
  }

  get size(): number {
    return this.#reasons.size;
  }
}
