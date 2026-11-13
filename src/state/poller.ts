// 共有のポーリング。Orca を読むのはここだけで、要求（/api/state）はキャッシュから正規化して返す。
// 取得元を3つの組に分け、組ごとに間隔と次の時刻を持つ。見る人がいなければ間隔を遅くする。
// 失敗しても、取得元ごとに最後に成功した値を残す。
import type { InboxGate, InboxInputs, InboxMessage, MailSnapshot } from '../inbox/model.ts';
import { selectMailRuns } from '../inbox/select-runs.ts';
import type { CapabilityReport } from '../orca/capabilities.ts';
import type { MailReader } from '../orca/read-mail.ts';
import type {
  OrcaLaunch,
  OrcaRun,
  OrcaTabSnapshot,
  OrcaTask,
  OrcaWorker,
  SourceError,
  SourceName,
  SourceRead,
  StateReader,
} from '../orca/read-state.ts';
import { SOURCE_NAMES } from '../orca/read-state.ts';
import type { Connection, StateDocument } from './model.ts';
import {
  type NormalizeSources,
  needsLaunch,
  normalizeState,
  type SourceSnapshot,
  STALE_FACTOR,
  terminalTabIdentity,
} from './normalize.ts';

export type PollGroup = 'fast' | 'orchestration' | 'slow';
export type Intervals = Record<PollGroup, number>;

export const ACTIVE_INTERVALS: Intervals = { fast: 5_000, orchestration: 10_000, slow: 60_000 };
export const IDLE_INTERVALS: Intervals = { fast: 30_000, orchestration: 30_000, slow: 120_000 };
/** 最後の要求からこの時間を過ぎたら、見る人がいないとみなす。 */
export const VIEWER_WINDOW_MS = 60_000;
const TICK_MS = 1_000;
const CONCURRENCY = 4;
const MAX_LAUNCH_READS_PER_CYCLE = 30;
const MAX_LAUNCH_CACHE = 2_000;
const SETTLED_TASK_STATES = new Set(['completed', 'failed', 'cancelled']);

const GROUPS: readonly PollGroup[] = ['fast', 'orchestration', 'slow'];
const GROUP_OF: Record<SourceName, PollGroup> = {
  tabs: 'fast',
  worktreePs: 'fast',
  terminals: 'fast',
  runs: 'orchestration',
  tasks: 'orchestration',
  workers: 'orchestration',
  workerLaunch: 'orchestration',
  repos: 'slow',
  worktrees: 'slow',
};

export interface StatePollerOptions {
  reader: StateReader;
  mailReader?: MailReader;
  /** 機能の確かめ（CapabilityCache.get など）。1回の読みの間に1回だけ呼ぶ。 */
  capabilities: () => Promise<CapabilityReport>;
  now?: () => number;
  activeIntervals?: Intervals;
  idleIntervals?: Intervals;
  viewerWindowMs?: number;
}

interface Snap {
  data: unknown;
  fetchedAt: number | null;
  lastSuccessAt: number | null;
  error: SourceError | null;
  truncated: boolean;
}

interface RunTasks {
  tasks: OrcaTask[];
  fetchedAt: number;
  settled: boolean;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/** 読み手の例外を、取得元の誤りに変える。 */
async function guard<T>(read: () => Promise<SourceRead<T>>): Promise<SourceRead<T>> {
  try {
    return await read();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: 'exception', message: message.slice(0, 300) } };
  }
}

export class StatePoller {
  readonly #reader: StateReader;
  readonly #mailReader: MailReader | undefined;
  #lastInboxViewerAt: number | null = null;
  readonly #runMail = new Map<string, { messages: InboxMessage[]; gates: InboxGate[] }>();
  #mail: MailSnapshot = {
    messages: [],
    gates: [],
    fetchedAt: null,
    lastSuccessAt: null,
    stale: true,
    error: null,
    runsRead: 0,
    runsFailed: 0,
  };
  readonly #capabilities: () => Promise<CapabilityReport>;
  readonly #now: () => number;
  readonly #active: Intervals;
  readonly #idle: Intervals;
  readonly #viewerWindowMs: number;

  readonly #sources = {} as Record<SourceName, Snap>;
  readonly #next: Record<PollGroup, number> = { fast: 0, orchestration: 0, slow: 0 };
  readonly #last: Record<PollGroup, number | null> = { fast: null, orchestration: null, slow: null };
  readonly #inflight: Record<PollGroup, Promise<void> | null> = { fast: null, orchestration: null, slow: null };
  readonly #runTasks = new Map<string, RunTasks>();
  readonly #launches = new Map<string, OrcaLaunch>();
  #lastViewerAt: number | null = null;
  #connection: Connection = { state: 'starting', reason: null, checkedAt: null };
  #orca: StateDocument['orca'] = null;
  /** 一度でも読み終えた組。 */
  readonly #completed = new Set<PollGroup>();
  #timer: NodeJS.Timeout | null = null;

  constructor(options: StatePollerOptions) {
    this.#reader = options.reader;
    this.#mailReader = options.mailReader;
    this.#capabilities = options.capabilities;
    this.#now = options.now ?? Date.now;
    this.#active = options.activeIntervals ?? ACTIVE_INTERVALS;
    this.#idle = options.idleIntervals ?? IDLE_INTERVALS;
    this.#viewerWindowMs = options.viewerWindowMs ?? VIEWER_WINDOW_MS;
    for (const name of SOURCE_NAMES) {
      this.#sources[name] = { data: null, fetchedAt: null, lastSuccessAt: null, error: null, truncated: false };
    }
  }

  /** 1秒ごとに tick() を呼ぶ。 */
  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      this.tick().catch(() => {});
    }, TICK_MS);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  /** 見る人がいることを知らせる（/api/state の要求ごと）。見る人が戻ったら、間隔をすぐ元に戻す。 */
  noteViewer(): void {
    const wasViewing = this.#viewing();
    this.#lastViewerAt = this.#now();
    if (wasViewing) return;
    for (const g of GROUPS) {
      const last = this.#last[g];
      if (last !== null) this.#next[g] = Math.min(this.#next[g], last + this.#active[g]);
    }
  }

  /** 期限の来た組を読む。 */
  async tick(): Promise<void> {
    const now = this.#now();
    const due = GROUPS.filter((g) => now >= this.#next[g]);
    if (due.length === 0) return;
    const capabilities = this.#capabilityOnce();
    await Promise.all(due.map((g) => this.#refresh(g, capabilities)));
  }

  /** 正規化した文書。まだ読み終えていない組があれば、その最初の読み（途中なら、その読み）を待つ。 */
  async snapshot(): Promise<StateDocument> {
    const pending = GROUPS.filter((g) => !this.#completed.has(g));
    if (pending.length > 0) {
      const capabilities = this.#capabilityOnce();
      await Promise.all(pending.map((g) => this.#refresh(g, capabilities)));
    }
    return this.snapshotSync();
  }

  noteInboxViewer(): void {
    const wasViewing = this.#inboxViewing();
    this.#lastInboxViewerAt = this.#now();
    this.noteViewer();
    if (!wasViewing) this.#next.orchestration = Math.min(this.#next.orchestration, this.#now());
  }

  async inboxSnapshot(): Promise<InboxInputs> {
    await this.snapshot();
    if (this.#inboxViewing() && this.#now() >= this.#next.orchestration) {
      await this.#refresh('orchestration', this.#capabilityOnce());
    }
    const lastWords = new Map<string, string>();
    const tabs = (this.#sources.tabs.data as OrcaTabSnapshot[] | null) ?? [];
    for (const snapshot of tabs)
      for (const tab of snapshot.tabs) {
        if (tab.type !== 'terminal') continue;
        const { id } = terminalTabIdentity(tab);
        const message = tab.agentStatus?.lastAssistantMessage;
        if (id && message) lastWords.set(id, message);
      }
    const last = this.#mail.lastSuccessAt === null ? null : Date.parse(this.#mail.lastSuccessAt);
    return {
      state: this.snapshotSync(),
      mail: {
        ...this.#mail,
        stale:
          last === null ||
          this.#mail.error !== null ||
          this.#now() - last > this.#interval('orchestration') * STALE_FACTOR,
      },
      lastWords,
    };
  }

  /** 待たずに、今のキャッシュから正規化する。 */
  snapshotSync(): StateDocument {
    const snap = <T>(name: SourceName): SourceSnapshot<T> => {
      const s = this.#sources[name];
      return {
        data: s.data as T | null,
        fetchedAt: s.fetchedAt,
        lastSuccessAt: s.lastSuccessAt,
        error: s.error,
        truncated: s.truncated,
        intervalMs: this.#interval(GROUP_OF[name]),
      };
    };
    const sources = {} as Record<SourceName, SourceSnapshot<unknown>>;
    for (const name of SOURCE_NAMES) sources[name] = snap(name);
    return normalizeState({
      now: this.#now(),
      connection: this.#connection,
      orca: this.#orca,
      sources: sources as unknown as NormalizeSources,
    });
  }

  #inboxViewing(): boolean {
    return this.#lastInboxViewerAt !== null && this.#now() - this.#lastInboxViewerAt <= this.#viewerWindowMs;
  }

  #viewing(): boolean {
    return this.#lastViewerAt !== null && this.#now() - this.#lastViewerAt <= this.#viewerWindowMs;
  }

  #interval(g: PollGroup): number {
    return this.#viewing() ? this.#active[g] : this.#idle[g];
  }

  #capabilityOnce(): () => Promise<CapabilityReport | null> {
    let promise: Promise<CapabilityReport | null> | null = null;
    return () => {
      promise ??= this.#capabilities().catch(() => null);
      return promise;
    };
  }

  #refresh(g: PollGroup, capabilities: () => Promise<CapabilityReport | null>): Promise<void> {
    const inflight = this.#inflight[g];
    if (inflight) return inflight;
    const started = this.#now();
    this.#last[g] = started;
    const run = (async () => {
      try {
        await this.#read(g, started, capabilities);
        if (g === 'orchestration' && this.#inboxViewing()) await this.#readMail(started);
      } finally {
        this.#completed.add(g);
        this.#next[g] = started + this.#interval(g);
        this.#inflight[g] = null;
      }
    })();
    this.#inflight[g] = run;
    return run;
  }

  #record<T>(name: SourceName, at: number, result: SourceRead<T>): void {
    const s = this.#sources[name];
    s.fetchedAt = at;
    if (result.ok) {
      s.data = result.data;
      s.lastSuccessAt = at;
      s.error = null;
      s.truncated = result.truncated;
    } else {
      s.error = result.error;
    }
  }

  #fail(names: readonly SourceName[], at: number, error: SourceError): void {
    for (const name of names) this.#record(name, at, { ok: false, error });
  }

  async #read(g: PollGroup, at: number, capabilities: () => Promise<CapabilityReport | null>): Promise<void> {
    const names = SOURCE_NAMES.filter((n) => GROUP_OF[n] === g);
    const report = await capabilities();
    const checkedAt = new Date(at).toISOString();
    if (!report) {
      this.#connection = { state: 'unreachable', reason: 'capability check failed', checkedAt };
      this.#fail(names, at, { kind: 'unreachable', message: 'capability check failed' });
      return;
    }
    this.#orca = {
      appVersion: report.appVersion,
      cliVersion: report.cliVersion,
      features: { readState: report.features.readState.available, readTabs: report.features.readTabs.available },
    };
    if (report.connection.state !== 'connected') {
      this.#connection = { state: 'unreachable', reason: report.connection.reason, checkedAt };
      this.#fail(names, at, { kind: 'unreachable', message: report.connection.reason });
      return;
    }
    const readState = report.features.readState;
    const cliNames = names.filter((n) => n !== 'tabs');
    const unavailable = (feature: string, missing: string[]): SourceError => ({
      kind: 'unavailable',
      message: `${feature} is not available (${missing.join(', ') || 'unknown'})`,
    });
    if (!readState.available) this.#fail(cliNames, at, unavailable('readState', readState.missing));

    if (g === 'fast') {
      const readTabs = report.features.readTabs;
      const jobs: Promise<void>[] = [];
      if (readTabs.available) jobs.push(guard(() => this.#reader.tabs()).then((r) => this.#record('tabs', at, r)));
      else this.#fail(['tabs'], at, unavailable('readTabs', readTabs.missing));
      if (readState.available) {
        jobs.push(guard(() => this.#reader.worktreePs()).then((r) => this.#record('worktreePs', at, r)));
        jobs.push(guard(() => this.#reader.terminals()).then((r) => this.#record('terminals', at, r)));
      }
      await Promise.all(jobs);
    } else if (readState.available && g === 'slow') {
      await Promise.all([
        guard(() => this.#reader.repos()).then((r) => this.#record('repos', at, r)),
        guard(() => this.#reader.worktrees()).then((r) => this.#record('worktrees', at, r)),
      ]);
    } else if (readState.available && g === 'orchestration') {
      await this.#readOrchestration(at);
    }

    // 機能の欠け（unavailable）は接続の失敗に数えない。
    const failed = names
      .map((n) => this.#sources[n])
      .filter((s) => s.fetchedAt === at && s.error !== null && s.error.kind !== 'unavailable');
    const allFailed = failed.length === names.length;
    const firstError = failed[0]?.error;
    this.#connection =
      allFailed && firstError
        ? { state: 'unreachable', reason: `${firstError.kind}: ${firstError.message}`, checkedAt }
        : { state: 'connected', reason: null, checkedAt };
  }

  async #readOrchestration(at: number): Promise<void> {
    const [runs, workers] = await Promise.all([guard(() => this.#reader.runs()), guard(() => this.#reader.workers())]);
    this.#record('runs', at, runs);
    this.#record('workers', at, workers);
    await Promise.all([this.#readTasks(at), this.#readLaunches(at)]);
  }

  async #readMail(at: number): Promise<void> {
    if (this.#sources.runs.data === null) {
      this.#mail = {
        ...this.#mail,
        fetchedAt: new Date(at).toISOString(),
        error: { kind: 'runs-unavailable' },
        runsRead: 0,
        runsFailed: 0,
      };
      return;
    }
    const runs = selectMailRuns({
      runs: this.#sources.runs.data as OrcaRun[],
      workers: (this.#sources.workers.data as OrcaWorker[] | null) ?? [],
      state: this.snapshotSync(),
      now: at,
    });
    const sourceError = this.#sources.runs.error;
    if (!this.#mailReader || sourceError?.kind === 'unreachable' || sourceError?.kind === 'unavailable') {
      this.#mail = {
        ...this.#mail,
        fetchedAt: new Date(at).toISOString(),
        error: sourceError ?? { kind: 'unavailable', message: 'mail reader not configured' },
        runsRead: 0,
        runsFailed: runs.length,
      };
      return;
    }
    const reader = this.#mailReader;
    const results = await mapLimit(runs, CONCURRENCY, async (run) => {
      const m = await guard(() => reader.readRunMail(run.id));
      const g = await guard(() => reader.readGates(run.id));
      return { run, m, g };
    });
    let error: SourceError | null = null;
    let runsRead = 0;
    for (const { run, m, g } of results) {
      if (m.ok && g.ok) {
        this.#runMail.set(run.id, { messages: m.data, gates: g.data });
        runsRead++;
      } else {
        error ??= !m.ok ? m.error : !g.ok ? g.error : null;
      }
    }
    const selected = new Set(runs.map((r) => r.id));
    for (const id of this.#runMail.keys()) if (!selected.has(id)) this.#runMail.delete(id);
    const time = new Date(at).toISOString();
    const success = runs.length === 0 || runsRead > 0;
    this.#mail = {
      messages: runs.flatMap((r) => this.#runMail.get(r.id)?.messages ?? []),
      gates: runs.flatMap((r) => this.#runMail.get(r.id)?.gates ?? []),
      fetchedAt: time,
      lastSuccessAt: success ? time : this.#mail.lastSuccessAt,
      error: success ? null : error,
      stale: !success,
      runsRead,
      runsFailed: runs.length - runsRead,
    };
  }

  async #readTasks(at: number): Promise<void> {
    const runs = this.#sources.runs.data as { id: string }[] | null;
    if (runs === null) {
      this.#fail(['tasks'], at, this.#sources.runs.error ?? { kind: 'unavailable', message: 'runs not read' });
      return;
    }
    const workers = (this.#sources.workers.data as OrcaWorker[] | null) ?? [];
    const activeRuns = new Set(workers.filter((w) => needsLaunch(w) && w.runId).map((w) => w.runId));
    const due = runs.filter((run) => {
      const entry = this.#runTasks.get(run.id);
      if (!entry) return true;
      const active = !entry.settled || activeRuns.has(run.id);
      const interval = active ? this.#interval('orchestration') : this.#interval('slow');
      return at - entry.fetchedAt >= interval;
    });
    const results = await mapLimit(due, CONCURRENCY, (run) => guard(() => this.#reader.tasks(run.id)));
    let error: SourceError | null = null;
    results.forEach((result, i) => {
      const run = due[i];
      if (!run) return;
      if (result.ok) {
        const settled = result.data.every((t) => t.status !== null && SETTLED_TASK_STATES.has(t.status));
        this.#runTasks.set(run.id, { tasks: result.data, fetchedAt: at, settled });
      } else {
        error ??= { kind: result.error.kind, message: `${run.id}: ${result.error.message}` };
      }
    });
    const listed = new Set(runs.map((r) => r.id));
    for (const id of this.#runTasks.keys()) if (!listed.has(id)) this.#runTasks.delete(id);
    const s = this.#sources.tasks;
    s.fetchedAt = at;
    s.error = error;
    if (this.#runTasks.size > 0 || error === null) {
      s.data = runs.flatMap((r) => this.#runTasks.get(r.id)?.tasks ?? []);
    }
    if (error === null) s.lastSuccessAt = at;
  }

  async #readLaunches(at: number): Promise<void> {
    const workers = this.#sources.workers.data as OrcaWorker[] | null;
    if (workers === null) {
      this.#fail(
        ['workerLaunch'],
        at,
        this.#sources.workers.error ?? { kind: 'unavailable', message: 'workers not read' },
      );
      return;
    }
    const due = workers
      .filter((w) => needsLaunch(w) && !this.#launches.has(w.dispatchId))
      .slice(0, MAX_LAUNCH_READS_PER_CYCLE);
    const results = await mapLimit(due, CONCURRENCY, (w) => guard(() => this.#reader.workerLaunch(w.dispatchId)));
    let error: SourceError | null = null;
    results.forEach((result, i) => {
      const worker = due[i];
      if (!worker) return;
      if (result.ok) this.#launches.set(worker.dispatchId, result.data);
      else error ??= { kind: result.error.kind, message: `${worker.dispatchId}: ${result.error.message}` };
    });
    while (this.#launches.size > MAX_LAUNCH_CACHE) {
      const oldest = this.#launches.keys().next().value;
      if (oldest === undefined) break;
      this.#launches.delete(oldest);
    }
    const s = this.#sources.workerLaunch;
    s.fetchedAt = at;
    s.error = error;
    s.data = this.#launches;
    if (error === null) s.lastSuccessAt = at;
  }
}
