// 状態の API のテストの録画（手で書いた仮名の値だけ）。形は 2026-11-06 の Orca 1.4.251 の読むだけのコマンドの応答に合わせた。
// プロンプトなどの本文の項目には text-9NN を入れ、応答に現れないことを確かめる。
import type { CliEntry, CliRecording, RpcRecording } from '../../src/orca/replay/recording.ts';

export const WT1 = 'uuid-1::/p-1/p-2';
export const WT2 = 'uuid-1::/p-1/p-3';
export const WT3 = 'uuid-1::/p-1/p-4';
/** 応答に出てはいけない本文の仮名。 */
export const PRIVATE_TEXTS = ['text-900', 'text-901', 'text-902', 'text-903', 'text-904', 'text-905', 'text-906'];
export const PRIVATE_PATHS = ['/p-5/p-6'];

const T0 = Date.UTC(2026, 10, 6, 9, 0, 0);
export const ms = (minutes: number): number => T0 + minutes * 60_000;

const ok = (result: unknown): string => JSON.stringify({ ok: true, result });
const entry = (argv: string[], result: unknown): CliEntry => ({
  argv: [...argv, '--json'],
  exitCode: 0,
  stdout: ok(result),
  stderr: '',
  delayMs: 0,
});

export const repoList = {
  repos: [
    {
      id: 'uuid-1',
      path: '/p-1',
      displayName: 'text-20',
      kind: 'git',
      gitUsername: 'user-a',
      hookSettings: { mode: 'auto', scripts: { setup: 'text-907' } },
      gitRemoteIdentity: { canonicalKey: 'github.com/owner-a/repo-a', remoteName: 'origin', remoteUrl: 'text-908' },
    },
  ],
};

export const worktreeList = {
  worktrees: [
    {
      id: WT1,
      repoId: 'uuid-1',
      path: '/p-1/p-2',
      branch: 'refs/heads/feature-a',
      head: 'hex-1',
      displayName: 'text-21',
      comment: 'text-909',
      isMainWorktree: false,
      isArchived: false,
      parentWorktreeId: null,
      childWorktreeIds: [WT3],
      lastActivityAt: ms(30),
    },
    {
      id: WT2,
      repoId: 'uuid-1',
      path: '/p-1/p-3',
      branch: 'refs/heads/main',
      displayName: 'text-22',
      isMainWorktree: true,
      isArchived: false,
      parentWorktreeId: null,
      childWorktreeIds: [],
      lastActivityAt: ms(10),
    },
    {
      id: WT3,
      repoId: 'uuid-1',
      path: '/p-1/p-4',
      branch: 'refs/heads/feature-b',
      displayName: 'text-23',
      isMainWorktree: false,
      isArchived: true,
      parentWorktreeId: WT1,
      childWorktreeIds: [],
      lastActivityAt: ms(5),
    },
  ],
  totalCount: 3,
  truncated: false,
};

export const worktreePs = {
  worktrees: [
    {
      worktreeId: WT1,
      repoId: 'uuid-1',
      path: '/p-1/p-2',
      branch: 'refs/heads/feature-a',
      displayName: 'text-21',
      status: 'working',
      isArchived: false,
      isMainWorktree: false,
      parentWorktreeId: null,
      childWorktreeIds: [WT3],
      lastActivityAt: ms(31),
      lastOutputAt: ms(32),
      preview: 'text-903',
      linkedPR: {
        number: 12,
        state: 'open',
        title: 'text-1',
        url: 'text-2',
        checksStatus: 'success',
        checksSummary: { state: 'success', total: 3, passed: 3, failed: 0, cancelled: 0, pending: 0, neutral: 0 },
      },
      agents: [
        {
          paneKey: 'uuid-10:uuid-11',
          parentPaneKey: null,
          state: 'working',
          agentType: 'claude',
          prompt: 'text-900',
          taskTitle: 'text-3',
          lastAssistantMessage: 'text-902',
          toolName: 'Bash',
          toolInput: 'text-901',
          stateStartedAt: ms(20),
          updatedAt: ms(29),
          hasLivePty: true,
        },
        {
          paneKey: 'uuid-40:uuid-41',
          parentPaneKey: 'uuid-10:uuid-11',
          state: 'done',
          agentType: 'claude',
          prompt: 'text-900',
          taskTitle: null,
          stateStartedAt: ms(15),
          updatedAt: ms(16),
          hasLivePty: false,
        },
      ],
    },
    {
      worktreeId: WT2,
      repoId: 'uuid-1',
      path: '/p-1/p-3',
      branch: 'refs/heads/main',
      displayName: 'text-22',
      status: 'inactive',
      isArchived: false,
      isMainWorktree: true,
      parentWorktreeId: null,
      childWorktreeIds: [],
      lastActivityAt: ms(10),
      lastOutputAt: null,
      linkedPR: null,
      agents: [],
    },
  ],
  totalCount: 2,
  truncated: false,
};

export const terminalList = {
  terminals: [
    // terminal list の tabId と leafId は仮の値（pty:）になりうる。handle で結ぶ。
    {
      handle: 'term_uuid-12',
      worktreeId: WT1,
      tabId: 'pty:uuid-1::/p-1/p-2',
      leafId: 'pty:uuid-1::/p-1/p-2',
      title: 'text-10',
      connected: true,
      writable: true,
      lastOutputAt: ms(33),
      preview: 'text-903',
    },
    {
      handle: 'term_uuid-22',
      worktreeId: WT1,
      tabId: 'uuid-20',
      leafId: 'uuid-21',
      connected: true,
      lastOutputAt: ms(25),
      preview: 'text-903',
    },
    {
      handle: 'term_uuid-52',
      worktreeId: WT1,
      tabId: 'uuid-50',
      leafId: 'uuid-51',
      connected: true,
      lastOutputAt: null,
    },
    {
      handle: 'term_uuid-72',
      worktreeId: WT1,
      tabId: 'uuid-70',
      leafId: 'uuid-71',
      connected: true,
      lastOutputAt: ms(1),
    },
  ],
  totalCount: 4,
  truncated: false,
};

export const tabsAll = {
  snapshots: [
    {
      worktree: WT1,
      activeTabId: 'uuid-10',
      tabs: [
        {
          type: 'terminal',
          id: 'uuid-10::uuid-11',
          parentTabId: 'uuid-10',
          leafId: 'uuid-11',
          ptyId: 'hex-2',
          status: 'ready',
          terminal: 'term_uuid-12',
          title: 'text-4',
          customTitle: null,
          agentStatus: {
            state: 'working',
            agentType: 'claude',
            paneKey: 'uuid-10:uuid-11',
            stateStartedAt: ms(21),
            prompt: 'text-904',
            lastCompletedAssistantMessage: 'text-902',
            providerSession: {
              key: 'claude',
              id: 'uuid-13',
              effort: 'high',
              transcriptPath: '/p-5/p-6',
              cwd: '/p-1/p-2',
            },
          },
        },
        {
          type: 'terminal',
          id: 'uuid-20::uuid-21',
          parentTabId: 'uuid-20',
          leafId: 'uuid-21',
          ptyId: 'hex-3',
          status: 'ready',
          terminal: 'term_uuid-22',
          title: 'text-11',
          customTitle: 'text-12',
          agentStatus: {
            state: 'waiting',
            agentType: 'codex',
            paneKey: 'uuid-20:uuid-21',
            stateStartedAt: ms(24),
            providerSession: { key: 'session_id', id: 'uuid-23' },
          },
        },
        {
          type: 'terminal',
          id: 'uuid-50::uuid-51',
          parentTabId: 'uuid-50',
          leafId: 'uuid-51',
          ptyId: 'hex-4',
          status: 'ready',
          terminal: 'term_uuid-52',
          title: 'text-13',
          agentStatus: {
            state: 'working',
            agentType: 'claude',
            paneKey: 'uuid-50:uuid-51',
            stateStartedAt: ms(26),
            providerSession: { key: 'claude', id: 'uuid-53', effort: 'xhigh' },
            orchestration: {
              dispatchId: 'ctx_hex-1',
              taskId: 'task_hex-2',
              orchestrationRunId: 'run_hex-3',
              parentPaneKey: 'uuid-60:uuid-61',
              coordinatorHandle: 'term_uuid-62',
              taskTitle: 'text-5',
            },
          },
        },
        {
          type: 'terminal',
          id: 'uuid-30::uuid-31',
          parentTabId: 'uuid-30',
          leafId: 'uuid-31',
          ptyId: 'hex-5',
          status: 'pending-handle',
          terminal: null,
          title: 'text-6',
          launchAgent: 'claude',
        },
        {
          type: 'terminal',
          id: 'uuid-70::uuid-71',
          parentTabId: 'uuid-70',
          leafId: 'uuid-71',
          ptyId: 'hex-6',
          status: 'ready',
          terminal: 'term_uuid-72',
          title: 'text-14',
        },
        {
          type: 'agent-session',
          id: 'uuid-80',
          agent: 'claude',
          sessionId: 'uuid-81',
          title: 'text-7',
          chatStatus: { state: 'done', mainAgent: { state: 'done', stateStartedAt: ms(12) }, updatedAt: ms(13) },
        },
        { type: 'browser', id: 'uuid-90', title: 'text-15', url: 'text-16' },
      ],
    },
  ],
};

export const runPage1 = { runs: [{ id: 'run_hex-3', objective: 'text-8' }], nextCursor: 'cursor-1' };
export const runPage2 = { runs: [{ id: 'run_hex-4', objective: 'text-9' }] };

export const tasksRun3 = {
  runId: 'run_hex-3',
  tasks: [
    {
      id: 'task_hex-2',
      run_id: 'run_hex-3',
      parent_id: null,
      task_title: 'text-5',
      display_name: 'text-17',
      spec: 'text-905',
      status: 'dispatched',
      deps: '[]',
      result: 'text-906',
      created_at: '2026-11-06 09:00:00',
      completed_at: null,
    },
    {
      id: 'task_hex-5',
      run_id: 'run_hex-3',
      parent_id: 'task_hex-2',
      task_title: null,
      display_name: 'text-18',
      spec: 'text-905',
      status: 'completed',
      deps: '["task_hex-2"]',
      result: 'text-906',
      created_at: '2026-11-06 09:05:00',
      completed_at: '2026-11-06 09:10:00',
    },
  ],
  count: 2,
};

export const tasksRun4 = {
  runId: 'run_hex-4',
  tasks: [
    {
      id: 'task_hex-7',
      run_id: 'run_hex-4',
      parent_id: null,
      task_title: 'text-19',
      spec: 'text-905',
      status: 'completed',
      deps: 'not-json',
      result: 'text-906',
      created_at: '2026-11-05 08:00:00',
      completed_at: '2026-11-05 08:30:00',
    },
  ],
  count: 1,
};

const worker = (o: {
  dispatchId: string;
  taskId: string;
  runId: string;
  workerState: string;
  dispatchStatus: string;
  terminal: string | null;
  terminalState: string | null;
  liveness: string;
}) => ({
  dispatchId: o.dispatchId,
  taskId: o.taskId,
  runId: o.runId,
  workerState: o.workerState,
  dispatchStatus: o.dispatchStatus,
  agentTerminalHandle: o.terminal,
  terminalState: o.terminalState,
  projection: {
    runId: o.runId,
    role: 'worker',
    workspace: { id: WT1, kind: 'worktree' },
    liveness: { verdict: o.liveness, source: 'terminal', observedAt: ms(30) },
    nextAction: { kind: 'none', argv: ['text-910'] },
  },
});

export const workerPage1 = {
  workers: [
    worker({
      dispatchId: 'ctx_hex-1',
      taskId: 'task_hex-2',
      runId: 'run_hex-3',
      workerState: 'ready',
      dispatchStatus: 'dispatched',
      terminal: 'term_uuid-52',
      terminalState: 'retained',
      liveness: 'live',
    }),
  ],
  page: { limit: 100, total: 2, hasMore: true, nextCursor: 'cursor-2' },
};

export const workerPage2 = {
  workers: [
    worker({
      dispatchId: 'ctx_hex-6',
      taskId: 'task_hex-7',
      runId: 'run_hex-4',
      workerState: 'succeeded',
      dispatchStatus: 'completed',
      terminal: null,
      terminalState: 'released',
      liveness: 'exited',
    }),
  ],
  page: { limit: 100, total: 2, hasMore: false, nextCursor: null },
};

export const workerShow1 = {
  dispatch: { id: 'ctx_hex-1', status: 'dispatched', dispatchedAt: '2026-11-06 09:01:00' },
  worker: {
    dispatchId: 'ctx_hex-1',
    state: 'ready',
    startOptions: {
      agent: 'claude',
      launch: {
        requested: { agent: 'claude', model: 'claude-opus-5-5', effort: 'high' },
        effective: { agent: 'claude', model: 'claude-opus-5-5', effort: 'high' },
      },
    },
  },
  terminal: { handle: 'term_uuid-52', preview: 'text-903' },
};

export function cliRecording(): CliRecording {
  return {
    version: 1,
    kind: 'cli',
    entries: [
      entry(['repo', 'list'], repoList),
      entry(['worktree', 'list', '--limit', '10000'], worktreeList),
      entry(['worktree', 'ps', '--limit', '10000'], worktreePs),
      entry(['terminal', 'list', '--limit', '10000'], terminalList),
      entry(['orchestration', 'run-list', '--limit', '100'], runPage1),
      entry(['orchestration', 'run-list', '--limit', '100', '--cursor', 'cursor-1'], runPage2),
      entry(['orchestration', 'task-list', '--run', 'run_hex-3', '--full'], tasksRun3),
      entry(['orchestration', 'task-list', '--run', 'run_hex-4', '--full'], tasksRun4),
      entry(['orchestration', 'worker-list', '--full', '--limit', '100'], workerPage1),
      entry(['orchestration', 'worker-list', '--full', '--limit', '100', '--cursor', 'cursor-2'], workerPage2),
      entry(['orchestration', 'worker-show', '--dispatch', 'ctx_hex-1', '--full'], workerShow1),
    ],
  };
}

export function rpcRecording(): RpcRecording {
  return {
    version: 1,
    kind: 'rpc',
    exchanges: [
      {
        method: 'session.tabs.listAll',
        chunks: [`${JSON.stringify({ id: '$ID', ok: true, result: tabsAll, _meta: { runtimeId: 'uuid-99' } })}\n`],
        end: 'close',
      },
    ],
  };
}
