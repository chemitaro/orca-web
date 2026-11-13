import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTranscriptReader } from '../../src/orca/read-transcript.ts';
import { ReadOnlyRpc } from '../../src/orca/rpc.ts';
import { collectTranscripts } from '../../src/tools/live-transcript.ts';
import {
  CHAT_TAB,
  capabilities,
  fakeOrca,
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
