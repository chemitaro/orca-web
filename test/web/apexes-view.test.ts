import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApexList } from '../../src/apex/build.ts';
import type { ApexListDocument } from '../../src/apex/model.ts';
import type { AgentState, StateDocument } from '../../src/state/model.ts';
import { apexesApiPath, apexesTitle, buildApexesView as buildView } from '../../web/apexes-view.js';
import { agent, fact, input, NOW } from '../inbox/fixture.ts';

// biome-ignore lint/suspicious/noExplicitAny: the view is an untyped JS object
const buildApexesView = (doc: ApexListDocument, options: Parameters<typeof buildView>[1]): any =>
  buildView(doc, options);
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function documentOf(agents: AgentState[], patch: Partial<StateDocument> = {}): ApexListDocument {
  return buildApexList({ state: input({ agents, ...patch }).state, now: NOW, project: null });
}

function fullDocument(): ApexListDocument {
  return documentOf([
    agent('needs', { state: fact('waiting'), title: fact('待つ頂点') }),
    agent('busy', { state: fact('done'), title: fact('統括') }),
    agent('kid', { parentPaneKey: fact('busy') }),
    agent('kid2', { parentPaneKey: fact('busy'), state: fact('done') }),
    agent('recent', { state: fact('done'), stateStartedAt: fact(ago(HOUR)) }),
    agent('older', { state: fact('done'), stateStartedAt: fact(ago(25 * HOUR)) }),
    agent('asleep', { state: fact('done'), terminal: fact('awaiting-restore') }),
    agent('lost', { parentPaneKey: fact('gone') }),
  ]);
}

test('T-08: 段は開く3つと畳む3つの順で、見出しの数を持つ', () => {
  const view = buildApexesView(fullDocument(), { now: NOW });
  assert.deepEqual(
    view.sections.map((s: { key: string; title: string; count: number; collapsed: boolean }) => [
      s.key,
      s.title,
      s.count,
      s.collapsed,
    ]),
    [
      ['needs_action', '対応が必要', 1, false],
      ['working', '作業中', 1, false],
      ['done_recent', '完了', 1, false],
      ['done_older', '以前の完了', 1, true],
      ['sleeping', '眠っている', 1, true],
      ['unlinked', '結べない仕事', 1, true],
    ],
  );
  assert.deepEqual(
    view.headline.map((h: { text: string }) => h.text),
    ['対応が必要 1', '作業中 1', '完了 3'],
  );
});

test('T-08: 行の題名・理由の札・配下の数・経過・リンク先。配下 0 なら数を出さない', () => {
  const view = buildApexesView(fullDocument(), { now: NOW });
  // biome-ignore lint/suspicious/noExplicitAny: the rows are untyped JS objects
  const rows = new Map<string, any>(
    view.sections.flatMap((s: { rows: { key: string }[] }) => s.rows).map((r: { key: string }) => [r.key, r]),
  );
  const busy = rows.get('busy');
  assert.equal(busy.title, '統括');
  assert.equal(busy.project, '仮のプロジェクト');
  assert.equal(busy.issue, 'iss-00017');
  assert.deepEqual(busy.reasons, ['配下が作業中']);
  assert.equal(busy.members, '1/2');
  assert.equal(busy.elapsed, '1h');
  assert.equal(busy.href, '/embed/agent?id=busy');
  assert.equal(busy.icon, 'codex');
  assert.equal(busy.markLabel, '完了');
  const needs = rows.get('needs');
  assert.deepEqual(needs.reasons, ['入力待ち']);
  assert.equal(needs.members, null);
  assert.deepEqual(rows.get('lost').reasons, ['親が見つからない']);
  assert.equal(rows.get('lost').href, '/embed/agent?id=lost');
  const odd = buildApexesView(documentOf([agent('a b/&', { state: fact(null) })]), { now: NOW });
  const row = odd.sections[1].rows[0];
  assert.equal(row.href, '/embed/agent?id=a%20b%2F%26');
  assert.deepEqual(row.tags, ['確かめられない']);
  const monitoring = buildApexesView(documentOf([agent('m', { workingMode: fact('monitoring') })]), { now: NOW });
  assert.equal(monitoring.sections[1].rows[0].monitoring, true);
  assert.deepEqual(monitoring.sections[1].rows[0].reasons, ['バックグラウンドタスクを監視中']);
});

test('T-08: stale の帯と、読めないときの帯', () => {
  assert.deepEqual(buildApexesView(fullDocument(), { now: NOW }).freshness, []);
  const stale = buildApexesView(documentOf([agent('a')], { stale: true }), { now: NOW, error: '502' });
  assert.deepEqual(stale.freshness, [
    { text: 'Orca を読めていません。最後に読めた値を示しています', kind: 'warn' },
    { text: '更新できない（502）。前の内容を示しています', kind: 'bad' },
  ]);
});

test('T-09: 題名は対応が必要の数を先頭に出す', () => {
  assert.equal(apexesTitle(2), '(2) 指揮 — orca-web');
  assert.equal(apexesTitle(0), '指揮 — orca-web');
  const two = documentOf([agent('a', { state: fact('waiting') }), agent('b', { state: fact('blocked') })]);
  assert.equal(buildApexesView(two, { now: NOW }).title, '(2) 指揮 — orca-web');
  assert.equal(buildApexesView(documentOf([agent('a')]), { now: NOW }).title, '指揮 — orca-web');
});

test('API の道は project を符号にして付ける', () => {
  assert.equal(apexesApiPath(null), '/api/apexes');
  assert.equal(apexesApiPath('repo a'), '/api/apexes?project=repo%20a');
});
