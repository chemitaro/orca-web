// Run の作業者と統括の節に結ぶエージェントの探し方の1か所。状態の文書だけを読む純粋な関数。
import type { AgentState, RunState, StateDocument, WorkerState } from '../state/model.ts';

/** 作業者のエージェント。`agent.worker.dispatchId` で、なければ同じ `terminalHandle` で探す。 */
export function workerAgent(state: StateDocument, worker: WorkerState): AgentState | undefined {
  return (
    state.agents.find((a) => a.worker?.dispatchId === worker.dispatchId) ??
    (worker.terminalHandle === null ? undefined : state.agents.find((a) => a.terminalHandle === worker.terminalHandle))
  );
}

/**
 * 統括のエージェント。`activeCoordinatorHandle` があれば同じ `terminalHandle` のエージェントだけ。
 * なければ、根の task（`parentId` が null）を新しい順に見て、その作業者のエージェントの `parentPaneKey` と
 * `paneKey` が完全に一致するエージェントを返す（構造化 Chat の統括）。
 */
export function coordinatorAgent(state: StateDocument, run: RunState): AgentState | undefined {
  if (run.activeCoordinatorHandle !== null) {
    return state.agents.find((a) => a.terminalHandle === run.activeCoordinatorHandle);
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
  return undefined;
}
