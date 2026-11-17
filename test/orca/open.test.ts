import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CapabilityReport, FeatureReport } from '../../src/orca/capabilities.ts';
import type { CliRunner } from '../../src/orca/cli.ts';
import { OpenService } from '../../src/orca/open.ts';
import { OpenOrcaCli, OpenRpc } from '../../src/orca/open-gates.ts';
import { OrcaCli } from '../../src/orca/orca-cli.ts';
import type { CliEntry, RpcExchangeRecord } from '../../src/orca/replay/recording.ts';
import { ReplayCliRunner, ReplayRpcTransport } from '../../src/orca/replay/replay.ts';
import type { RpcTransport } from '../../src/orca/rpc.ts';

const RT = 'uuid-1';
const WT = 'uuid-2::/p-1/p-2';
const WT_PATH = '/p-1/p-2';

const feature = (available: boolean, missing: string[] = []): FeatureReport => ({
  available,
  satisfied: [],
  missing,
  deferred: [],
});

function report(open = feature(true)): CapabilityReport {
  return {
    checkedAt: '2026-11-06T00:00:00.000Z',
    cliVersion: '1.4.251',
    appVersion: '1.4.251',
    runtimeId: RT,
    runtimeIdConsistent: true,
    connection: { state: 'connected' },
    features: {
      readState: feature(true),
      readTabs: feature(true),
      openExistingTab: open,
      readTranscript: feature(true),
      sendTerminal: feature(false),
      sendChat: feature(false),
      answerChat: feature(false),
      answerKeys: feature(false),
    },
  };
}

const cliOk = (argv: string[], result: unknown): CliEntry => ({
  argv,
  exitCode: 0,
  stdout: JSON.stringify({ ok: true, result }),
  stderr: '',
  delayMs: 0,
});

const worktreeList = (rows = [{ id: WT, path: WT_PATH }], extra: Record<string, unknown> = {}) =>
  cliOk(['worktree', 'list', '--json'], {
    worktrees: rows.map((r) => ({ ...r, branch: 'refs/heads/text-1', displayName: 'text-2' })),
    totalCount: rows.length,
    truncated: false,
    ...extra,
  });

const frame = (result: unknown, runtimeId = RT) =>
  `${JSON.stringify({ id: '$ID', ok: true, result, _meta: { runtimeId } })}\n`;
const errorFrame = (code: string, message: string) =>
  `${JSON.stringify({ id: '$ID', ok: false, error: { code, message }, _meta: { runtimeId: RT } })}\n`;

const tabsList = (tabs: unknown[], extra: Record<string, unknown> = {}, runtimeId = RT): RpcExchangeRecord => ({
  method: 'session.tabs.list',
  params: { worktree: `id:${WT}` },
  chunks: [frame({ worktree: WT, activeTabId: null, tabs, ...extra }, runtimeId)],
  end: 'close',
});

const agentTab = {
  type: 'terminal',
  id: 'uuid-3::uuid-4',
  parentTabId: 'uuid-3',
  leafId: 'uuid-4',
  isActive: false,
  status: 'ready',
  terminal: 'term_uuid-5',
  agentStatus: { state: 'working', updatedAt: 1762400000000, agentType: 'claude', prompt: 'text-3' },
};
const sleepingTab = {
  type: 'terminal',
  id: 'uuid-6::uuid-7',
  parentTabId: 'uuid-6',
  leafId: 'uuid-7',
  isActive: true,
  status: 'pending-handle',
  terminal: null,
  launchAgent: 'claude',
};
const fileTab = { type: 'file', id: 'uuid-8', isActive: true };
const chatTab = { type: 'agent-session', id: 'uuid-13', isActive: true };

/** 1 の worktree.activate の録画。 */
const activate = (
  navigation: 'host' | 'clients' = 'host',
  chunks: string[] = [frame({ repoId: 'uuid-9', worktreeId: WT, activated: true })],
  end: 'close' | 'hold' = 'close',
): RpcExchangeRecord => ({
  method: 'worktree.activate',
  params: { worktree: `id:${WT}`, navigation },
  chunks,
  end,
});

const ON_HOST = { device: 'host', screen: 'unverified' } as const;

function setup(
  entries: CliEntry[],
  exchanges: RpcExchangeRecord[],
  cap = report(),
  extra: { raise?: () => Promise<boolean> } = {},
) {
  const runner = new ReplayCliRunner({ version: 1, kind: 'cli', entries });
  const transport = new ReplayRpcTransport({ version: 1, kind: 'rpc', exchanges });
  // 書き込みを、CLI と RPC をまたいで送った順に記録する（門を通ったものだけ）。
  const order: string[] = [];
  const orderedRunner: CliRunner = {
    run: (argv) => {
      if (argv[0] === 'terminal') order.push(argv.join(' '));
      return runner.run(argv);
    },
  };
  const orderedTransport: RpcTransport = {
    call: (method, params) => {
      if (method !== 'session.tabs.list') order.push(method);
      return transport.call(method, params);
    },
  };
  const service = new OpenService({
    cli: new OpenOrcaCli(new OrcaCli(orderedRunner)),
    rpc: new OpenRpc(orderedTransport),
    capabilities: async () => cap,
    ...extra,
  });
  const writes = () => [...order];
  return { service, runner, transport, writes };
}

test('host：最後に動いたエージェントの動いている端末は、worktree.activate の後に terminal switch で開く（worktree はパスで解決）', async () => {
  const { service, runner, writes } = setup(
    [worktreeList(), cliOk(['terminal', 'switch', '--terminal', 'term_uuid-5', '--json'], { focus: {} })],
    [tabsList([sleepingTab, agentTab]), activate()],
  );
  const outcome = await service.open({ worktree: WT_PATH });
  assert.deepEqual(outcome, {
    ok: true,
    status: 'opened',
    route: 'terminal-switch',
    reason: 'last-agent',
    worktreeId: WT,
    ...ON_HOST,
  });
  assert.deepEqual(writes(), ['worktree.activate', 'terminal switch --terminal term_uuid-5 --json']);
  assert.equal(runner.calls.length, 2);
});

test('指定のスリープ中のエージェントを、worktree.activate の後に session.tabs.activate（host、user、tabId、leafId）で開く（worktree は ID で解決）', async () => {
  const { service, transport } = setup(
    [worktreeList()],
    [
      tabsList([agentTab, sleepingTab]),
      activate(),
      {
        method: 'session.tabs.activate',
        params: { worktree: `id:${WT}`, tabId: 'uuid-6::uuid-7', navigation: 'host', intent: 'user', leafId: 'uuid-7' },
        chunks: [frame({ worktree: WT, tabs: [] })],
        end: 'close',
      },
    ],
  );
  const outcome = await service.open({ worktree: WT, agent: 'uuid-6:uuid-7' });
  assert.deepEqual(outcome, {
    ok: true,
    status: 'opened',
    route: 'tab-activate',
    reason: 'requested-agent',
    worktreeId: WT,
    requestedAgentFound: true,
    ...ON_HOST,
  });
  assert.deepEqual(
    transport.calls.map((c) => c.method),
    ['session.tabs.list', 'worktree.activate', 'session.tabs.activate'],
  );
});

test('エージェントのない worktree は、最後に見ていたファイルのタブを session.tabs.activate で開く', async () => {
  const { service } = setup(
    [worktreeList()],
    [
      tabsList([fileTab]),
      activate(),
      {
        method: 'session.tabs.activate',
        params: { worktree: `id:${WT}`, tabId: 'uuid-8', navigation: 'host', intent: 'user' },
        chunks: [frame({})],
        end: 'close',
      },
    ],
  );
  const outcome = await service.open({ worktree: WT });
  assert.equal(outcome.ok && outcome.reason, 'last-tab');
});

test('タブのない worktree は worktree.activate（host）だけで開き、Orca が最初の端末を作りうることを返す', async () => {
  const { service, writes } = setup(
    [worktreeList()],
    [
      tabsList([]),
      activate('host', [
        frame({ repoId: 'uuid-9', worktreeId: WT, activated: true, sleepingAgentWake: 'not-applicable' }),
      ]),
    ],
  );
  assert.deepEqual(await service.open({ worktree: WT }), {
    ok: true,
    status: 'opened',
    route: 'worktree-activate',
    reason: 'worktree-only',
    worktreeId: WT,
    mayCreateInitialTerminal: true,
    ...ON_HOST,
  });
  assert.deepEqual(writes(), ['worktree.activate']);
});

test('worktree list が途中で切れていれば --limit <totalCount> で読み直し、それでも切れていれば何も送らない', async () => {
  const other = { id: 'uuid-10::/p-3', path: '/p-3' };
  const first = worktreeList([other], { totalCount: 2, truncated: true });
  const full = cliOk(['worktree', 'list', '--limit', '2', '--json'], {
    worktrees: [other, { id: WT, path: WT_PATH }],
    totalCount: 2,
    truncated: false,
  });
  const ok = setup(
    [first, full, cliOk(['terminal', 'switch', '--terminal', 'term_uuid-5', '--json'], {})],
    [tabsList([agentTab]), activate()],
  );
  assert.equal((await ok.service.open({ worktree: WT_PATH })).ok, true);

  const still = cliOk(['worktree', 'list', '--limit', '2', '--json'], {
    worktrees: [other],
    totalCount: 2,
    truncated: true,
  });
  const cut = setup([first, still], []);
  const outcome = await cut.service.open({ worktree: WT_PATH });
  assert.equal(!outcome.ok && outcome.error, 'unknown_shape');
  assert.deepEqual(cut.writes(), []);
});

test('書き込みの後の RPC の時間切れ・接続断と CLI の時間切れは unconfirmed で、2回目の書き込みを送らない', async () => {
  for (const chunks of [[], ['{"id":"$ID","ok":tr']]) {
    const end = chunks.length === 0 ? 'hold' : 'close';
    const { service, writes } = setup(
      [worktreeList()],
      [tabsList([fileTab]), activate(), { method: 'session.tabs.activate', chunks, end }],
    );
    const outcome = await service.open({ worktree: WT });
    assert.equal(!outcome.ok && outcome.error, 'unconfirmed');
    assert.equal(!outcome.ok && outcome.route, 'tab-activate');
    assert.equal(!outcome.ok && outcome.worktreeShown, true);
    assert.deepEqual(writes(), ['worktree.activate', 'session.tabs.activate']);
  }
  const timedOut: CliEntry = {
    argv: ['terminal', 'switch', '--terminal', 'term_uuid-5', '--json'],
    exitCode: null,
    stdout: '',
    stderr: '',
    delayMs: 0,
    timedOut: true,
  };
  const { service, writes } = setup([worktreeList(), timedOut], [tabsList([agentTab, fileTab]), activate()]);
  const outcome = await service.open({ worktree: WT });
  assert.equal(!outcome.ok && outcome.error, 'unconfirmed');
  assert.deepEqual(writes(), ['worktree.activate', 'terminal switch --terminal term_uuid-5 --json']);
});

test('terminal switch が封筒のない出力で非ゼロ終了したとき（シグナルでの終了を含む）は、届いた可能性があるので unconfirmed（FQG-002）', async () => {
  const entries: CliEntry[] = [
    {
      argv: ['terminal', 'switch', '--terminal', 'term_uuid-5', '--json'],
      exitCode: 1,
      stdout: '',
      stderr: 'text-9',
      delayMs: 0,
    },
    {
      argv: ['terminal', 'switch', '--terminal', 'term_uuid-5', '--json'],
      exitCode: null,
      stdout: '',
      stderr: '',
      delayMs: 0,
    },
  ];
  for (const exit of entries) {
    const { service, writes } = setup([worktreeList(), exit], [tabsList([agentTab]), activate()]);
    const outcome = await service.open({ worktree: WT });
    assert.equal(!outcome.ok && outcome.error, 'unconfirmed', String(exit.exitCode));
    assert.equal(!outcome.ok && outcome.route, 'terminal-switch');
    assert.deepEqual(writes(), ['worktree.activate', 'terminal switch --terminal term_uuid-5 --json']);
  }
  const notStarted: CliEntry = {
    argv: ['terminal', 'switch', '--terminal', 'term_uuid-5', '--json'],
    exitCode: null,
    stdout: '',
    stderr: '',
    delayMs: 0,
    spawnError: 'ENOENT',
  };
  const { service } = setup([worktreeList(), notStarted], [tabsList([agentTab]), activate()]);
  const outcome = await service.open({ worktree: WT });
  assert.equal(!outcome.ok && outcome.error, 'unavailable', '起動できなかったときは届いていない');
});

test('method_not_found は unsupported、tab_not_found や terminal_exited は target_gone で、ほかのタブへ切り替えない', async () => {
  const cases: [string, string, string][] = [
    ['method_not_found', 'Unknown method: session.tabs.activate', 'unsupported'],
    ['runtime_error', 'tab_not_found', 'target_gone'],
    ['runtime_error', 'something broke', 'orca_error'],
  ];
  for (const [code, message, error] of cases) {
    const { service, writes } = setup(
      [worktreeList()],
      [
        tabsList([fileTab]),
        activate(),
        { method: 'session.tabs.activate', chunks: [errorFrame(code, message)], end: 'close' },
      ],
    );
    const outcome = await service.open({ worktree: WT });
    assert.equal(!outcome.ok && outcome.error, error, message);
    assert.deepEqual(writes(), ['worktree.activate', 'session.tabs.activate']);
  }
  const exited: CliEntry = {
    argv: ['terminal', 'switch', '--terminal', 'term_uuid-5', '--json'],
    exitCode: 1,
    stdout: JSON.stringify({ ok: false, error: { code: 'runtime_error', message: 'terminal_exited' } }),
    stderr: '',
    delayMs: 0,
  };
  const { service, writes } = setup([worktreeList(), exited], [tabsList([agentTab, sleepingTab]), activate()]);
  const outcome = await service.open({ worktree: WT });
  assert.equal(!outcome.ok && outcome.error, 'target_gone');
  assert.deepEqual(writes(), ['worktree.activate', 'terminal switch --terminal term_uuid-5 --json']);
});

test('機能が使えない、worktree の不在と重複、一覧の形の違い、runtime の ID の変化では、何も送らずに理由を返す', async () => {
  const cases: {
    name: string;
    error: string;
    entries: CliEntry[];
    exchanges: RpcExchangeRecord[];
    cap?: CapabilityReport;
  }[] = [
    {
      name: 'unavailable',
      error: 'unavailable',
      entries: [],
      exchanges: [],
      cap: report(feature(false, ['runtime-id:consistent'])),
    },
    {
      name: 'not found',
      error: 'worktree_not_found',
      entries: [worktreeList([{ id: 'uuid-11::/p-9', path: '/p-9' }])],
      exchanges: [],
    },
    {
      name: 'duplicate',
      error: 'worktree_not_found',
      entries: [
        worktreeList([
          { id: WT, path: WT_PATH },
          { id: 'uuid-12::/p-8', path: WT },
        ]),
      ],
      exchanges: [],
    },
    {
      name: 'list shape',
      error: 'unknown_shape',
      entries: [cliOk(['worktree', 'list', '--json'], { rows: [] })],
      exchanges: [],
    },
    {
      name: 'tabs shape',
      error: 'unknown_shape',
      entries: [worktreeList()],
      exchanges: [tabsList([{ type: 'terminal', id: 'x' }])],
    },
    {
      name: 'tabs worktree mismatch',
      error: 'unknown_shape',
      entries: [worktreeList()],
      exchanges: [{ method: 'session.tabs.list', chunks: [frame({ worktree: 'other', tabs: [] })], end: 'close' }],
    },
    {
      name: 'runtime changed',
      error: 'runtime_changed',
      entries: [worktreeList()],
      exchanges: [tabsList([agentTab], {}, 'uuid-99')],
    },
    {
      name: 'tabs failed',
      error: 'orca_error',
      entries: [worktreeList()],
      exchanges: [{ method: 'session.tabs.list', chunks: [], end: 'close' }],
    },
  ];
  for (const c of cases) {
    const { service, writes } = setup(c.entries, c.exchanges, c.cap);
    const outcome = await service.open({ worktree: WT });
    assert.equal(!outcome.ok && outcome.error, c.error, c.name);
    assert.deepEqual(writes(), [], c.name);
  }
  const { service } = setup([], [], report(feature(false, ['runtime:reachable'])));
  const outcome = await service.open({ worktree: WT });
  assert.deepEqual(!outcome.ok && outcome.missing, ['runtime:reachable']);
});

test('処理中に来た開く要求は busy で断り、Orca に送らない', async () => {
  const slowSwitch: CliEntry = {
    ...cliOk(['terminal', 'switch', '--terminal', 'term_uuid-5', '--json'], {}),
    delayMs: 50,
  };
  const { service, writes } = setup([worktreeList(), slowSwitch], [tabsList([agentTab]), activate()]);
  const [a, b] = await Promise.all([service.open({ worktree: WT }), service.open({ worktree: WT })]);
  assert.equal(a.ok, true);
  assert.equal(!b.ok && b.error, 'busy');
  assert.deepEqual(writes(), ['worktree.activate', 'terminal switch --terminal term_uuid-5 --json']);
});

test('worktree list の JSON でない stdout は、開く口の応答の文に出ない（FQG-001）', async () => {
  const leak = 'PRIVATE raw orca output';
  const { service, writes } = setup(
    [{ argv: ['worktree', 'list', '--json'], exitCode: 0, stdout: leak, stderr: '', delayMs: 0 }],
    [],
  );
  const outcome = await service.open({ worktree: WT_PATH });
  assert.equal(outcome.ok, false);
  assert.ok(!JSON.stringify(outcome).includes('PRIVATE'), JSON.stringify(outcome));
  assert.deepEqual(writes(), []);
});

test('host：別の worktree の agent-session のタブは、worktree.activate → session.tabs.activate の順に、どちらも navigation host で送る（T-01）', async () => {
  const { service, transport, writes } = setup(
    [worktreeList()],
    [
      tabsList([chatTab]),
      activate(),
      {
        method: 'session.tabs.activate',
        params: { worktree: `id:${WT}`, tabId: 'uuid-13', navigation: 'host', intent: 'user' },
        chunks: [frame({})],
        end: 'close',
      },
    ],
  );
  const outcome = await service.open({ worktree: WT }, 'host');
  assert.deepEqual(outcome, {
    ok: true,
    status: 'opened',
    route: 'tab-activate',
    reason: 'last-tab',
    worktreeId: WT,
    ...ON_HOST,
  });
  assert.deepEqual(writes(), ['worktree.activate', 'session.tabs.activate']);
  assert.deepEqual(
    transport.calls
      .filter((c) => c.method !== 'session.tabs.list')
      .map((c) => (c.params as { navigation: string }).navigation),
    ['host', 'host'],
  );
});

test('client：worktree.activate と session.tabs.activate を navigation clients で送り、端末のタブも tabId・leafId で選び、terminal switch を呼ばない（T-02）', async () => {
  const { service, runner, transport, writes } = setup(
    [worktreeList()],
    [
      tabsList([sleepingTab, agentTab]),
      activate('clients'),
      {
        method: 'session.tabs.activate',
        params: {
          worktree: `id:${WT}`,
          tabId: 'uuid-3::uuid-4',
          leafId: 'uuid-4',
          navigation: 'clients',
          intent: 'user',
        },
        chunks: [frame({})],
        end: 'close',
      },
    ],
  );
  const outcome = await service.open({ worktree: WT }, 'client');
  assert.deepEqual(outcome, {
    ok: true,
    status: 'opened',
    route: 'tab-activate',
    reason: 'last-agent',
    worktreeId: WT,
    device: 'client',
    screen: 'unverified',
  });
  assert.deepEqual(writes(), ['worktree.activate', 'session.tabs.activate']);
  assert.equal(runner.calls.filter((a) => a[0] === 'terminal').length, 0);
  assert.deepEqual(
    transport.calls
      .filter((c) => c.method !== 'session.tabs.list')
      .map((c) => (c.params as { navigation: string }).navigation),
    ['clients', 'clients'],
  );

  const only = setup([worktreeList()], [tabsList([]), activate('clients')]);
  const shown = await only.service.open({ worktree: WT }, 'client');
  assert.equal(shown.ok && shown.route, 'worktree-activate');
  assert.equal(shown.ok && shown.device, 'client');
  assert.deepEqual(only.writes(), ['worktree.activate']);
});

test('1 の worktree.activate が失敗・時間切れ・接続断なら 2 を送らずその誤りを返す（route は worktree-activate、worktreeShown なし）（T-03）', async () => {
  const cases: { chunks: string[]; end: 'close' | 'hold'; error: string }[] = [
    { chunks: [errorFrame('runtime_error', 'something broke')], end: 'close', error: 'orca_error' },
    { chunks: [errorFrame('runtime_error', 'worktree_not_found')], end: 'close', error: 'target_gone' },
    { chunks: [], end: 'hold', error: 'unconfirmed' },
    { chunks: ['{"id":"$ID","ok":tr'], end: 'close', error: 'unconfirmed' },
  ];
  for (const c of cases) {
    for (const tabs of [[agentTab], [chatTab]]) {
      const { service, runner, writes } = setup([worktreeList()], [tabsList(tabs), activate('host', c.chunks, c.end)]);
      const outcome = await service.open({ worktree: WT });
      assert.equal(outcome.ok, false);
      assert.equal(!outcome.ok && outcome.error, c.error, c.error);
      assert.equal(!outcome.ok && outcome.route, 'worktree-activate');
      assert.equal(!outcome.ok && outcome.worktreeShown, undefined);
      assert.deepEqual(writes(), ['worktree.activate']);
      assert.equal(runner.calls.filter((a) => a[0] === 'terminal').length, 0);
    }
  }
});

test('2 の失敗は ok:false と worktreeShown:true を返し、route は 2 の経路（クライアントの端末のタブは tab-activate）（T-03）', async () => {
  const { service } = setup(
    [worktreeList()],
    [
      tabsList([agentTab]),
      activate('clients'),
      { method: 'session.tabs.activate', chunks: [errorFrame('runtime_error', 'tab_not_found')], end: 'close' },
    ],
  );
  const outcome = await service.open({ worktree: WT }, 'client');
  assert.deepEqual(
    !outcome.ok && { error: outcome.error, route: outcome.route, worktreeShown: outcome.worktreeShown },
    { error: 'target_gone', route: 'tab-activate', worktreeShown: true },
  );
});

test('host の成功で1回だけ raise を呼び raised を入れ、false や例外でも ok のまま。client と失敗では呼ばない（T-06）', async () => {
  for (const [result, raised] of [
    [async () => true, true],
    [async () => false, false],
    [
      async () => {
        throw new Error('x');
      },
      false,
    ],
  ] as const) {
    let calls = 0;
    const raise = () => {
      calls += 1;
      return result();
    };
    const { service } = setup([worktreeList()], [tabsList([]), activate()], report(), { raise });
    const outcome = await service.open({ worktree: WT }, 'host');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.ok && outcome.raised, raised);
    assert.equal(calls, 1);
  }

  let calls = 0;
  const raise = async () => {
    calls += 1;
    return true;
  };
  const client = setup([worktreeList()], [tabsList([]), activate('clients')], report(), { raise });
  const ok = await client.service.open({ worktree: WT }, 'client');
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && 'raised' in ok, false);
  const failed = setup(
    [worktreeList()],
    [tabsList([]), activate('host', [errorFrame('runtime_error', 'x')])],
    report(),
    { raise },
  );
  assert.equal((await failed.service.open({ worktree: WT }, 'host')).ok, false);
  const second = setup(
    [worktreeList()],
    [
      tabsList([fileTab]),
      activate(),
      { method: 'session.tabs.activate', chunks: [errorFrame('runtime_error', 'x')], end: 'close' },
    ],
    report(),
    { raise },
  );
  assert.equal((await second.service.open({ worktree: WT }, 'host')).ok, false);
  assert.equal(calls, 0);
});
