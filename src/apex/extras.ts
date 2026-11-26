// 頂点の一覧だけが使う、Orca の読みの内部の値。状態の文書（`orca-web.state/v1`）には出さない。
import type { OrcaRun, OrcaTask, OrcaWorker } from '../orca/read-state.ts';
import type { ThreadQuestion } from '../orca/read-threads.ts';

/** Run のやり取りの読み（iss-00098）。ok が偽なら読めなかった（Orca の印を信じる）。 */
export interface RunThreadsExtra {
  ok: boolean;
  /** Dispatch の id → 最新の質問と返事済みか。本文は持たない。 */
  questions: Map<string, ThreadQuestion>;
}

/** Run の判断の門の読み（iss-00098）。ok が偽なら読めなかった。 */
export interface RunGatesExtra {
  ok: boolean;
  /** status が pending の門のある task の id。 */
  pendingTasks: Set<string>;
}

export interface OrchestrationExtras {
  /** Run の id → 今の世代（`consumer_generation`）。 */
  runs: Map<string, { generation: number | null }>;
  /** task の id → 作成者の paneKey と、作成の時の Run の世代。 */
  tasks: Map<string, { paneKey: string | null; generation: number | null }>;
  /** Dispatch の id → workerState と attention の種類と、作業者が作業を続けているか（`projection.stage.activity`）。 */
  workers: Map<string, { workerState: string | null; attention: string[]; activity: string | null }>;
  /** Run の id → やり取りの読み。attention input の Dispatch のいる Run だけ（iss-00098 D-02）。 */
  threads: Map<string, RunThreadsExtra>;
  /** Run の id → 門の読み。attention approval の Dispatch のいる Run だけ（iss-00098 D-02）。 */
  gates: Map<string, RunGatesExtra>;
}

export interface RawOrchestration {
  runs: readonly OrcaRun[] | null;
  tasks: readonly OrcaTask[] | null;
  workers: readonly OrcaWorker[] | null;
  threads?: ReadonlyMap<string, RunThreadsExtra>;
  gates?: ReadonlyMap<string, RunGatesExtra>;
}

export function emptyExtras(): OrchestrationExtras {
  return { runs: new Map(), tasks: new Map(), workers: new Map(), threads: new Map(), gates: new Map() };
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
  for (const [id, value] of raw.threads ?? []) extras.threads.set(id, value);
  for (const [id, value] of raw.gates ?? []) extras.gates.set(id, value);
  return extras;
}
