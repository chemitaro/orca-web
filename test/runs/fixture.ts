import type { ReadingFact, RunState, StateDocument } from '../../src/state/model.ts';
import { agent, fact, input, repo, task, worker, worktree } from '../inbox/fixture.ts';

export { agent, fact, repo, task, worker, worktree };
export const EARLY = '2026-01-02T10:00:00.000Z';
export const LATE = '2026-01-02T11:00:00.000Z';

export function reading(value: string | null): ReadingFact {
  return { ...fact(value), meaning: null, readings: [] };
}

export function run(patch: Partial<RunState> = {}): RunState {
  return {
    id: 'run-a',
    title: fact('仮の iss-18 統括'),
    coordinatorHandle: 'term-root',
    coordinatorWorktreeId: fact('wt-a'),
    ...patch,
  };
}

export function state(patch: Partial<StateDocument> = {}): StateDocument {
  return input({
    runs: [run()],
    agents: [agent('root', { terminalHandle: 'term-root' })],
    tasks: [task({ createdAt: fact(EARLY) })],
    workers: [worker()],
    ...patch,
  }).state;
}
