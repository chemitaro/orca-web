// 状態のテストの共通の部品。
import type { CapabilityReport, FeatureReport } from '../../src/orca/capabilities.ts';
import { OrcaCli, ReadOnlyOrcaCli } from '../../src/orca/orca-cli.ts';
import { createStateReader, type StateReader } from '../../src/orca/read-state.ts';
import type { CliRecording, RpcRecording } from '../../src/orca/replay/recording.ts';
import { ReplayCliRunner, ReplayRpcTransport } from '../../src/orca/replay/replay.ts';
import { ReadOnlyRpc } from '../../src/orca/rpc.ts';
import { cliRecording, rpcRecording } from './fixture.ts';

const feature = (available: boolean, missing: string[] = []): FeatureReport => ({
  available,
  satisfied: [],
  missing,
  deferred: [],
});

export function report(
  options: { connected?: boolean; readTabs?: boolean; readState?: boolean } = {},
): CapabilityReport {
  const connected = options.connected ?? true;
  return {
    checkedAt: '2026-11-06T00:00:00.000Z',
    cliVersion: connected ? '1.4.251' : null,
    appVersion: connected ? '1.4.251' : null,
    runtimeId: connected ? 'uuid-99' : null,
    runtimeIdConsistent: connected,
    connection: connected ? { state: 'connected' } : { state: 'unreachable', reason: 'orca status: spawn-failed' },
    features: {
      readState: feature(connected && (options.readState ?? true), options.readState === false ? ['command:x'] : []),
      readTabs: feature(
        connected && (options.readTabs ?? true),
        options.readTabs === false ? ['rpc:session.tabs.listAll'] : [],
      ),
      openExistingTab: feature(false),
      readTranscript: feature(false),
      sendTerminal: feature(false),
      sendChat: feature(false),
    },
  };
}

export function replayReader(cli: CliRecording = cliRecording(), rpc: RpcRecording = rpcRecording()) {
  const runner = new ReplayCliRunner(cli);
  const transport = new ReplayRpcTransport(rpc);
  const reader: StateReader = createStateReader(new ReadOnlyOrcaCli(new OrcaCli(runner)), new ReadOnlyRpc(transport));
  return { reader, runner, transport };
}

/** 呼ばれた回数を数え、取得元ごとの結果を差し替えられる読み手。 */
export class CountingReader implements StateReader {
  readonly calls: string[] = [];
  readonly #inner: StateReader;
  overrides: Partial<{ [K in keyof StateReader]: StateReader[K] }> = {};

  constructor(inner: StateReader) {
    this.#inner = inner;
  }

  #call<K extends keyof StateReader>(name: K, ...args: Parameters<StateReader[K]>): ReturnType<StateReader[K]> {
    this.calls.push(args.length ? `${name}:${args.join(',')}` : name);
    const fn = (this.overrides[name] ?? this.#inner[name].bind(this.#inner)) as (
      ...a: Parameters<StateReader[K]>
    ) => ReturnType<StateReader[K]>;
    return fn(...args);
  }

  repos = () => this.#call('repos');
  worktrees = () => this.#call('worktrees');
  worktreePs = () => this.#call('worktreePs');
  terminals = () => this.#call('terminals');
  tabs = () => this.#call('tabs');
  runs = () => this.#call('runs');
  tasks = (runId: string) => this.#call('tasks', runId);
  workers = () => this.#call('workers');
  workerLaunch = (dispatchId: string) => this.#call('workerLaunch', dispatchId);
}

/** 録画を一度だけ読み、以後は同じ結果を何回でも返す読み手（ポーリングを何度も回すテスト用）。 */
export async function staticReader(): Promise<StateReader> {
  const { reader } = replayReader();
  const [repos, worktrees, worktreePs, terminals, tabs, runs, workers, t3, t4, l1] = await Promise.all([
    reader.repos(),
    reader.worktrees(),
    reader.worktreePs(),
    reader.terminals(),
    reader.tabs(),
    reader.runs(),
    reader.workers(),
    reader.tasks('run_hex-3'),
    reader.tasks('run_hex-4'),
    reader.workerLaunch('ctx_hex-1'),
  ]);
  const tasks: Record<string, typeof t3> = { 'run_hex-3': t3, 'run_hex-4': t4 };
  return {
    repos: async () => repos,
    worktrees: async () => worktrees,
    worktreePs: async () => worktreePs,
    terminals: async () => terminals,
    tabs: async () => tabs,
    runs: async () => runs,
    workers: async () => workers,
    tasks: async (runId) => tasks[runId] ?? { ok: false, error: { kind: 'orca-error', message: 'unknown run' } },
    workerLaunch: async (dispatchId) =>
      dispatchId === 'ctx_hex-1' ? l1 : { ok: false, error: { kind: 'orca-error', message: 'unknown dispatch' } },
  };
}
