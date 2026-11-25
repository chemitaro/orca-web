// 束 → 頂点の対応表。メモリだけに持ち、ファイルに書かない（F-01）。
// 値は頂点のエージェントの id（paneKey ではない）。構造化 Chat の統括のメンバーのタブが閉じた後も束を結ぶのに使う。
import type { StateDocument } from '../state/model.ts';
import type { OrchestrationExtras } from './extras.ts';

export const MAX_OWNERS = 1_000;
/** 束の task がすべて終わってから捨てるまで。 */
export const SETTLED_KEEP_MS = 24 * 3_600_000;
/** 頂点がこの回数の読みの世代で続けて文書になければ捨てる。 */
const MISSING_LIMIT = 2;
export const SETTLED_TASK_STATES: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled']);

export function bundleKey(runId: string, generation: number | null): string {
  return `${runId}#${generation ?? '?'}`;
}

interface Entry {
  apexId: string;
  observedAt: number;
}

export class BundleOwners {
  /** 並びは覚えた順（古いものが先）。 */
  readonly #entries = new Map<string, Entry>();
  readonly #missing = new Map<string, number>();
  #generation: number | null = null;

  get size(): number {
    return this.#entries.size;
  }

  observe(key: string, apexId: string, now: number): void {
    this.#entries.delete(key);
    this.#entries.set(key, { apexId, observedAt: now });
  }

  resolve(key: string): string | null {
    return this.#entries.get(key)?.apexId ?? null;
  }

  /** 読みの世代ごとに1回だけ掃除する。同じ世代で何度呼んでも1回分。 */
  sweep(state: StateDocument, extras: OrchestrationExtras, generation: number, now: number): void {
    if (this.#generation === generation) return;
    this.#generation = generation;
    if (!state.sources.tabs.stale && state.connection.state === 'connected') {
      const present = new Set(state.agents.map((agent) => agent.id));
      const owned = new Set([...this.#entries.values()].map((entry) => entry.apexId));
      for (const apexId of owned) {
        const count = present.has(apexId) ? 0 : (this.#missing.get(apexId) ?? 0) + 1;
        this.#missing.set(apexId, count);
      }
      for (const apexId of this.#missing.keys()) if (!owned.has(apexId)) this.#missing.delete(apexId);
      for (const [key, entry] of this.#entries) {
        if ((this.#missing.get(entry.apexId) ?? 0) >= MISSING_LIMIT) this.#entries.delete(key);
      }
    }
    const settledAt = settledBundles(state, extras);
    for (const key of this.#entries.keys()) {
      const at = settledAt.get(key);
      if (at !== undefined && at !== null && now - at >= SETTLED_KEEP_MS) this.#entries.delete(key);
    }
    while (this.#entries.size > MAX_OWNERS) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }
}

/** 束の鍵 → task がすべて終わっていれば最後の completedAt、終わっていない task があれば null。 */
function settledBundles(state: StateDocument, extras: OrchestrationExtras): Map<string, number | null> {
  const result = new Map<string, number | null>();
  for (const task of state.tasks) {
    if (task.runId === null) continue;
    const key = bundleKey(task.runId, extras.tasks.get(task.id)?.generation ?? null);
    if (result.has(key) && result.get(key) === null) continue;
    const status = task.status.value;
    const completed = task.completedAt.value === null ? Number.NaN : Date.parse(task.completedAt.value);
    if (status === null || !SETTLED_TASK_STATES.has(status) || Number.isNaN(completed)) {
      result.set(key, null);
      continue;
    }
    result.set(key, Math.max(result.get(key) ?? Number.NEGATIVE_INFINITY, completed));
  }
  return result;
}
