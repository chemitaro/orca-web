// 頂点の一覧だけが使う、Orca の読みの内部の値。状態の文書（`orca-web.state/v1`）には出さない。
import type { OrcaRun, OrcaTask, OrcaWorker } from '../orca/read-state.ts';

export interface OrchestrationExtras {
  /** Run の id → 今の世代（`consumer_generation`）。 */
  runs: Map<string, { generation: number | null }>;
  /** task の id → 作成者の paneKey と、作成の時の Run の世代。 */
  tasks: Map<string, { paneKey: string | null; generation: number | null }>;
  /** Dispatch の id → workerState と attention の種類と、作業者が作業を続けているか（`projection.stage.activity`）。 */
  workers: Map<string, { workerState: string | null; attention: string[]; activity: string | null }>;
}

export interface RawOrchestration {
  runs: readonly OrcaRun[] | null;
  tasks: readonly OrcaTask[] | null;
  workers: readonly OrcaWorker[] | null;
}

export function emptyExtras(): OrchestrationExtras {
  return { runs: new Map(), tasks: new Map(), workers: new Map() };
}

export function buildOrchestrationExtras(raw: RawOrchestration): OrchestrationExtras {
  const extras = emptyExtras();
  for (const run of raw.runs ?? []) extras.runs.set(run.id, { generation: run.consumerGeneration });
  for (const task of raw.tasks ?? [])
    extras.tasks.set(task.id, { paneKey: task.createdByPaneKey, generation: task.createdByRunGeneration });
  for (const worker of raw.workers ?? [])
    extras.workers.set(worker.dispatchId, {
      workerState: worker.workerState,
      attention: [...worker.attentionCategories],
      activity: worker.activity,
    });
  return extras;
}
