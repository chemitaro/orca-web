import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CapabilityCache } from '../../src/orca/capabilities.ts';
import { OrcaCli, ReadOnlyOrcaCli } from '../../src/orca/orca-cli.ts';
import { createTranscriptReader } from '../../src/orca/read-transcript.ts';
import { ReplayCliRunner } from '../../src/orca/replay/replay.ts';
import { ReadOnlyRpc } from '../../src/orca/rpc.ts';
import { collectTranscripts } from '../../src/tools/live-transcript.ts';
import { probeTranscripts } from '../../src/tools/transcript-live.ts';
import { cliRecording, PRIVATE_TEXTS, tabsAll } from '../state/fixture.ts';
import {
  CHAT_TAB,
  capabilities,
  fakeOrca,
  ok,
  PANE_CLAUDE,
  PANE_CODEX,
  PANE_SLEEPING,
  SESSION_CLAUDE,
  TRANSCRIPT_PATH,
} from '../transcript/fixture.ts';

test('実機の確かめは、取得元と種類ごとに件数と結論だけを数え、本文、パス、セッションの識別子を出さない', async () => {
  const rpc = fakeOrca();
  const reader = createTranscriptReader({ rpc: new ReadOnlyRpc(rpc), capabilities: async () => capabilities() });
  const summary = await collectTranscripts(reader, [
    { id: PANE_CLAUDE },
    { id: PANE_CODEX },
    { id: CHAT_TAB },
    { id: PANE_SLEEPING },
  ]);
  assert.deepEqual(Object.keys(summary), [
    'agentSession:claude',
    'nativeChat:claude',
    'nativeChat:codex',
    'unresolved',
  ]);
  const claude = summary['nativeChat:claude'];
  assert.ok(claude);
  assert.equal(claude.agents, 1);
  assert.equal(claude.read, 1);
  assert.equal(claude.messages, 5);
  assert.equal(claude.droppedReasoning, 1);
  assert.equal(claude.orderNonDecreasing, 1);
  assert.deepEqual(claude.secondRead, { none: 1 });
  assert.equal(claude.olderPages, 1);
  assert.equal(claude.olderOverlap, 1, '偽の Orca は同じページを返すので重なりを数える');
  assert.deepEqual(claude.roles, { user: 2, assistant: 1, tool: 1, system: 1 });
  assert.equal(summary['agentSession:claude']?.droppedReasoning, 1);
  assert.deepEqual(summary.unresolved?.errors, { no_session: 1 });
  const text = JSON.stringify(summary);
  for (const secret of ['仮の指示', TRANSCRIPT_PATH, SESSION_CLAUDE, PANE_CLAUDE])
    assert.ok(!text.includes(secret), secret);
});

test('2回目の読みが失敗したら、差分の error だけでなく誤りの code ごとにも数える', async () => {
  const rpc = fakeOrca();
  let reads = 0;
  rpc.handlers['nativeChat.readSession'] = () =>
    ++reads === 1 ? ok({ messages: [], hasMore: false }) : ok({ error: '仮の非公開の失敗の詳細' });
  const reader = createTranscriptReader({ rpc: new ReadOnlyRpc(rpc), capabilities: async () => capabilities() });
  const summary = await collectTranscripts(reader, [{ id: PANE_CLAUDE }]);
  assert.deepEqual(summary['nativeChat:claude']?.secondRead, { error: 1 });
  assert.deepEqual(summary['nativeChat:claude']?.errors, { read_failed: 1 });
  assert.ok(!JSON.stringify(summary).includes('仮の非公開の失敗の詳細'));
});

test('前のページの失敗も、段階を混ぜた名前でなく誤りの code ごとに数える', async () => {
  const rpc = fakeOrca();
  rpc.handlers['nativeChat.readSession'] = (params) =>
    (params as { beforeOffset?: number }).beforeOffset === undefined
      ? ok({ messages: [], hasMore: true, beforeOffset: 10 })
      : ok({ error: '仮の非公開の失敗の詳細', notFound: true });
  const reader = createTranscriptReader({ rpc: new ReadOnlyRpc(rpc), capabilities: async () => capabilities() });
  const summary = await collectTranscripts(reader, [{ id: PANE_CLAUDE }]);
  assert.deepEqual(summary['nativeChat:claude']?.errors, { transcript_not_found: 1 });
  assert.equal(summary['nativeChat:claude']?.olderPages, 0);
});

test('道具の出力全体でも、状態と同じ全エージェントを数え、untabbed を黙って除かない', async () => {
  const rpc = fakeOrca();
  rpc.handlers['session.tabs.listAll'] = () => ok(tabsAll);
  const summary = await probeTranscripts({
    readCli: new ReadOnlyOrcaCli(new OrcaCli(new ReplayCliRunner(cliRecording()))),
    readRpc: new ReadOnlyRpc(rpc),
    capabilities: new CapabilityCache(
      async () => capabilities(),
      async () => 'rt-1',
    ),
  });
  assert.ok(summary.transcripts);
  assert.equal(summary.agentsByKind?.untabbed, 1);
  const counted = Object.values(summary.transcripts).reduce((n, b) => n + b.agents, 0);
  assert.equal(
    counted,
    Object.values(summary.agentsByKind ?? {}).reduce((n, count) => n + count, 0),
  );
  assert.ok((summary.transcripts.unresolved?.errors.no_session ?? 0) >= 1);
  assert.equal(summary.transcripts.unresolved?.errors.agent_not_found, undefined);
  const output = JSON.stringify(summary);
  for (const value of PRIVATE_TEXTS) assert.ok(!output.includes(value));
  for (const value of ['text-4', 'text-12', '/p-5/p-6', 'uuid-13', 'uuid-23', 'uuid-10:uuid-11']) {
    assert.ok(!output.includes(value));
  }
  assert.ok(!rpc.calls.some((c) => c.method.includes('subscribe') || c.method.includes('activate')));
});

test('接続できない道具の出力には、接続の状態だけを残して詳細の文やパスを出さない', async () => {
  const caps = capabilities({ connected: false });
  caps.connection = { state: 'unreachable', reason: '仮の非公開のパス /private/example.jsonl' };
  const rpc = fakeOrca();
  const cli = new ReplayCliRunner({ version: 1, kind: 'cli', entries: [] });
  const summary = await probeTranscripts({
    readCli: new ReadOnlyOrcaCli(new OrcaCli(cli)),
    readRpc: new ReadOnlyRpc(rpc),
    capabilities: new CapabilityCache(
      async () => caps,
      async () => null,
    ),
  });
  assert.deepEqual(summary, {
    probedAt: '2026-11-13T00:00:00.000Z',
    orca: { cliVersion: '1.4.256', appVersion: '1.4.256', connection: 'unreachable', readTranscript: false },
    transcripts: null,
  });
  assert.equal(cli.calls.length, 0);
  assert.equal(rpc.calls.length, 0);
});

test('2回目の未知の形と前ページの非重複、下降する順を集計し、仮の本文とツール値を出さない', async () => {
  const rpc = fakeOrca();
  let tails = 0;
  rpc.handlers['nativeChat.readSession'] = (params) => {
    if ((params as { beforeOffset?: number }).beforeOffset !== undefined) {
      return ok({
        messages: [{ id: 'older-private-id', role: 'user', blocks: [{ type: 'text', text: '前の仮の本文' }] }],
        hasMore: false,
      });
    }
    if (++tails === 2) return ok({ messages: [{ unexpected: '仮の非公開の詳細' }], hasMore: false });
    return ok({
      messages: [
        {
          id: 'one-private-id',
          role: 'assistant',
          transcriptOrder: 2,
          blocks: [{ type: 'tool-call', name: '仮のツール名', input: '仮の入力', callId: 'private-call-id' }],
        },
        {
          id: 'two-private-id',
          role: 'tool',
          transcriptOrder: 1,
          blocks: [{ type: 'tool-result', output: '仮の出力', callId: 'private-call-id' }],
        },
      ],
      hasMore: true,
      beforeOffset: 10,
    });
  };
  const reader = createTranscriptReader({ rpc: new ReadOnlyRpc(rpc), capabilities: async () => capabilities() });
  const summary = await collectTranscripts(reader, [{ id: PANE_CLAUDE }]);
  const b = summary['nativeChat:claude'];
  assert.ok(b);
  assert.equal(b.orderDecreasing, 1);
  assert.equal(b.orderNonDecreasing, 0);
  assert.deepEqual(b.errors, { unknown_shape: 1 });
  assert.deepEqual(b.secondRead, { error: 1 });
  assert.equal(b.olderPages, 1);
  assert.equal(b.olderOverlap, 0);
  assert.deepEqual(b.parts, { 'tool-call': 1, 'tool-result': 1 });
  const output = JSON.stringify(summary);
  for (const value of [
    '前の仮の本文',
    '仮のツール名',
    '仮の入力',
    '仮の出力',
    'private-id',
    'private-call-id',
    '仮の非公開の詳細',
  ]) {
    assert.ok(!output.includes(value));
  }
});
