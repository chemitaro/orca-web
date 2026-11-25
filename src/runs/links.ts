// Run の作業者と統括の節に結ぶエージェントの探し方の1か所。状態の文書と、束の頂点の対応だけを読む。
import { bundleApexes } from '../apex/build.ts';
import type { OrchestrationExtras } from '../apex/extras.ts';
import type { BundleOwners } from '../apex/owners.ts';
import type { AgentState, RunState, StateDocument, WorkerState } from '../state/model.ts';

/** 作業者のエージェント。`agent.worker.dispatchId` で、なければ同じ `terminalHandle` で探す。 */
export function workerAgent(state: StateDocument, worker: WorkerState): AgentState | undefined {
  return (
    state.agents.find((a) => a.worker?.dispatchId === worker.dispatchId) ??
    (worker.terminalHandle === null ? undefined : state.agents.find((a) => a.terminalHandle === worker.terminalHandle))
  );
}

/**
 * 統括のエージェント。`activeCoordinatorHandle` があれば同じ `terminalHandle` のエージェント。
 * 見つからなければ（handle がない、または古い handle が残っている）、根の task（`parentId` が null）を新しい順に見て、
 * その作業者のエージェントの `parentPaneKey` と `paneKey` が完全に一致するエージェント（構造化 Chat の統括）。
 * それでも結べなければ、束の頂点（`bundleApexes` の結果。頂点の一覧と同じ結び方）を使う。
 */
export function coordinatorAgent(
  state: StateDocument,
  run: RunState,
  bundleApex?: ReadonlyMap<string, AgentState>,
): AgentState | undefined {
  if (run.activeCoordinatorHandle !== null) {
    const handled = state.agents.find((a) => a.terminalHandle === run.activeCoordinatorHandle);
    if (handled) return handled;
  }
  // 状態の文書の tasks は Run・作成の時刻・id の順なので、後ろから見ると新しい順。
  const roots = state.tasks.filter((t) => t.runId === run.id && t.parentId.value === null).reverse();
  for (const task of roots) {
    for (const worker of state.workers) {
      if (worker.runId !== run.id || worker.taskId !== task.id) continue;
      const parentPaneKey = workerAgent(state, worker)?.parentPaneKey.value ?? null;
      if (parentPaneKey === null) continue;
      const coordinator = state.agents.find((a) => a.paneKey === parentPaneKey);
      if (coordinator) return coordinator;
    }
  }
  return bundleApex?.get(run.id);
}

/** 束の頂点の対応（Run の id → 頂点）。結び方は `src/apex/` の1か所を呼ぶ。 */
export function runBundleApexes(state: StateDocument, input: RunBundleInput): Map<string, AgentState> {
  return bundleApexes({ state, ...input });
}

/** 束の頂点を探すための、頂点の一覧と同じ内部の値と対応表。 */
export interface RunBundleInput {
  extras: OrchestrationExtras;
  owners: BundleOwners | null;
  now: number;
}
