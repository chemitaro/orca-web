import type { OrcaRun, OrcaWorker } from '../orca/read-state.ts';
import type { StateDocument } from '../state/model.ts';
import { isoFromText, needsLaunch } from '../state/normalize.ts';

export function selectMailRuns(input: {
  runs: OrcaRun[];
  workers: OrcaWorker[];
  state: StateDocument;
  now: number;
  limit?: number;
}): OrcaRun[] {
  const active = new Set(input.workers.filter(needsLaunch).map((worker) => worker.runId));
  for (const run of input.state.runs) {
    if (run.coordinatorResolvedBy !== null) active.add(run.id);
  }
  const recent = (value: string | null): boolean =>
    value !== null && input.now - Date.parse(isoFromText(value) ?? '') <= 7 * 86_400_000;
  const taskRuns = new Set(
    input.state.tasks
      .filter((task) => recent(task.createdAt.value) || recent(task.completedAt.value))
      .map((task) => task.runId),
  );
  return input.runs
    .filter((run) => active.has(run.id) || taskRuns.has(run.id) || run.updatedAt === null || recent(run.updatedAt))
    .sort((a, b) => {
      const priority = Number(active.has(b.id)) - Number(active.has(a.id));
      if (priority !== 0) return priority;
      if (a.updatedAt === null) return b.updatedAt === null ? a.id.localeCompare(b.id) : 1;
      if (b.updatedAt === null) return -1;
      return (
        Date.parse(isoFromText(b.updatedAt) ?? '') - Date.parse(isoFromText(a.updatedAt) ?? '') ||
        a.id.localeCompare(b.id)
      );
    })
    .slice(0, input.limit ?? 50);
}
