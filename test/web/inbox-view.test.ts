import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildInbox } from '../../src/inbox/classify.ts';
import type { InboxDocument } from '../../src/inbox/model.ts';
import {
  buildInboxView as buildView,
  inboxApiPath,
  projectFromSearch,
  searchForProject,
} from '../../web/inbox-view.js';
import { agent, ci, fact, input, mail, message, NOW, pr, repo, STARTED, worker, worktree } from '../inbox/fixture.ts';

const iso = (s: string): string => s;
/** 画面の内容は JS の推論の型なので、テストでは添字を確かめずに読む。 */
// biome-ignore lint/suspicious/noExplicitAny: the view is an untyped JS object
const buildInboxView = (doc: InboxDocument, options: Parameters<typeof buildView>[1]): any => buildView(doc, options);
const MIN = 60_000;

/** 5つの段にそれぞれ項目がある文書。 */
function fullDocument(): InboxDocument {
  const base = input({
    repos: [repo('repo-a', 'プロジェクトA'), repo('repo-b', 'プロジェクトB')],
    worktrees: [
      worktree(),
      worktree({ id: 'wt-b', repoId: 'repo-b', branch: fact('feature'), pr: pr('open'), ci: ci('failure') }),
    ],
    agents: [
      agent('agent-blocked', { state: fact('blocked') }),
      agent('agent-working', { lastOutputAt: fact(new Date(NOW - 5 * MIN).toISOString()) }),
      agent('agent-done', { state: fact('done'), kind: 'chat-tab' }),
      agent('agent-odd', { state: fact('confused'), stateStartedAt: fact(null) }),
    ],
  });
  base.lastWords = new Map([['agent-done', '作業を終えました']]);
  return buildInbox(base);
}

test('段は 要対応・止まっている・動いている・不明・終わった の順で、件数と見出しを持ち、終わった段だけ畳む', () => {
  const view = buildInboxView(fullDocument(), { now: NOW, formatTime: iso });
  assert.deepEqual(
    view.stages.map((s: { stage: string; title: string; count: number; collapsed: boolean }) => [
      s.stage,
      s.title,
      s.count,
      s.collapsed,
    ]),
    [
      ['needs_action', '要対応', 1, false],
      ['stalled', '止まっている', 1, false],
      ['running', '動いている', 1, false],
      ['unknown', '不明', 1, false],
      ['finished', '終わった', 1, true],
    ],
  );
  assert.equal(view.total, 5);
});

test('文書の段の並びが違っても、画面の段の順は決まっていて、欠けた段は 0 件で出る', () => {
  const doc = fullDocument();
  doc.stages = [...doc.stages].reverse().filter((s) => s.stage !== 'running');
  const view = buildInboxView(doc, { now: NOW, formatTime: iso });
  assert.deepEqual(
    view.stages.map((s: { stage: string; count: number }) => [s.stage, s.count]),
    [
      ['needs_action', 1],
      ['stalled', 1],
      ['running', 0],
      ['unknown', 1],
      ['finished', 1],
    ],
  );
});

test('項目の行は、プロジェクト、Issue、エージェントの種類、経過、最後の一言、理由の文、リンクを持つ', () => {
  const view = buildInboxView(fullDocument(), { now: NOW, formatTime: iso });
  const [blocked] = view.stages[0].items;
  assert.equal(blocked.project, 'プロジェクトA');
  assert.equal(blocked.issue, 'iss-00017');
  assert.equal(blocked.agentType, 'codex');
  assert.equal(blocked.elapsed, '1h');
  assert.equal(blocked.reason, '許可待ち');
  assert.equal(blocked.hint, 'Orca で開いて答える');
  assert.equal(blocked.detailHref, '/embed/agent?id=agent-blocked');
  assert.deepEqual(blocked.open, { worktreeId: 'wt-a', agentId: 'agent-blocked' });
  assert.equal(blocked.prHref, null);

  const [ciFailed] = view.stages[1].items;
  assert.equal(ciFailed.kindLabel, 'PR');
  assert.equal(ciFailed.project, 'プロジェクトB');
  assert.equal(ciFailed.issue, null);
  assert.equal(ciFailed.reason, 'CI の失敗');
  assert.equal(ciFailed.prHref, 'https://github.com/example/demo/pull/17');
  assert.equal(ciFailed.lastWords, '仮の PR');
  assert.equal(ciFailed.elapsed, null);

  const [running] = view.stages[2].items;
  assert.equal(running.reason, '動いている');
  assert.equal(running.hint, null);

  const [odd] = view.stages[3].items;
  assert.equal(odd.reason, '');
  assert.equal(odd.missing, '知らない状態の値');
  assert.equal(odd.elapsed, null);

  const [done] = view.stages[4].items;
  assert.equal(done.lastWords, '作業を終えました');
  assert.equal(done.reason, '終わった');
});

test('理由は段を決めた順に「・」でつなぎ、結び付かない質問にも種類と文が付く', () => {
  const base = input({
    agents: [
      agent('agent-a', {
        state: fact('waiting'),
        worker: { dispatchId: 'dispatch-a', taskId: 'task-a', runId: 'run-a' },
      }),
    ],
    workers: [worker()],
  });
  base.mail = mail({ messages: [message({ type: 'decision_gate' })] });
  const doc = buildInbox(base);
  const view = buildInboxView(doc, { now: NOW, formatTime: iso });
  const [item] = view.stages[0].items;
  assert.equal(item.reason, '入力待ち・判断の連絡');

  const unlinked = input({});
  unlinked.mail = mail({ messages: [message({ dispatchId: 'nobody', subject: '仮の質問' })] });
  const q = buildInboxView(buildInbox(unlinked), { now: NOW, formatTime: iso }).stages[0].items[0];
  assert.equal(q.kindLabel, '質問');
  assert.equal(q.reason, '統括あての質問');
  assert.equal(q.lastWords, '仮の質問');
  assert.equal(q.detailHref, null);
  assert.equal(q.open, null);
});

test('https でない PR の URL と、決めた形でない詳細のリンクは、リンクにしない', () => {
  const doc = fullDocument();
  const ciItem = doc.stages.find((s) => s.stage === 'stalled')?.items[0];
  assert.ok(ciItem);
  for (const bad of ['http://github.com/x/y/pull/1', 'javascript:alert(1)', 'data:text/html,x', '//evil.example/x']) {
    ciItem.links.pr = bad;
    ciItem.links.detail = bad;
    const item = buildInboxView(doc, { now: NOW, formatTime: iso }).stages[1].items[0];
    assert.equal(item.prHref, null, bad);
    assert.equal(item.detailHref, null, bad);
  }
});

test('経過は elapsed.js の短い形で、未来の時刻（時計のずれ）は now、読めない時刻は null', async () => {
  const source = await readFile(new URL('../../web/inbox-view.js', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/embed\/elapsed\.js'/);
  assert.match(source, /clampFuture: true/);
  assert.ok(!/export function formatElapsed/.test(source));
  const at = (ms: number) => new Date(NOW - ms).toISOString();
  const elapsedFor = (since: unknown) => {
    const doc = fullDocument();
    const [item] = doc.stages[0]?.items ?? [];
    assert.ok(item);
    item.since = since as string;
    return buildInboxView(doc, { now: NOW, formatTime: iso }).stages[0].items[0].elapsed;
  };
  assert.equal(elapsedFor(at(30_000)), 'now');
  assert.equal(elapsedFor(at(12 * MIN)), '12m');
  assert.equal(elapsedFor(at(3 * 60 * MIN + 5 * MIN)), '3h');
  assert.equal(elapsedFor(at(50 * 60 * MIN)), '2d');
  assert.equal(elapsedFor(at(-5 * MIN)), 'now');
  assert.equal(elapsedFor('not-a-date'), null);
  assert.equal(elapsedFor(null), null);
});

test('鮮度の文は、接続と最後に読めた時刻を示し、読めない取得元と連絡を示す', () => {
  const fine = buildInboxView(fullDocument(), { now: NOW, formatTime: iso });
  assert.deepEqual(fine.freshness, [
    { text: 'Orca に接続', kind: 'ok' },
    { text: `最後に読めた時刻 ${STARTED}`, kind: 'info' },
  ]);
  assert.equal(fine.mailUnread, false);

  const base = input({ connection: { state: 'unreachable', reason: 'runtime-missing', checkedAt: STARTED } });
  base.state.stale = true;
  base.state.sources.worktrees = {
    fetchedAt: STARTED,
    lastSuccessAt: '2026-01-02T10:00:00.000Z',
    stale: true,
    truncated: false,
    error: { kind: 'unreachable', message: 'x' },
  };
  base.mail = mail({ lastSuccessAt: null, stale: true, error: { kind: 'runs-unavailable' }, runsRead: 0 });
  const view = buildInboxView(buildInbox(base), { now: NOW, formatTime: iso });
  assert.deepEqual(view.freshness, [
    { text: 'Orca に接続できない（runtime-missing）', kind: 'bad' },
    { text: `最後に読めた時刻 ${STARTED}`, kind: 'info' },
    { text: '古い値を含む', kind: 'warn' },
    { text: '状態の読めない部分：worktrees（unreachable）', kind: 'warn' },
    { text: '連絡：読めない（runs-unavailable）。統括あての質問と門は示せません', kind: 'warn' },
  ]);
  assert.equal(view.mailUnread, true);
  assert.equal(view.stages[0].note, '統括あての質問と門は読めていません（空ではありません）');
});

test('一部の Run の連絡が読めないときと、読み込みに失敗したときの文', () => {
  const base = input({});
  base.mail = mail({ runsFailed: 2, error: null });
  const view = buildInboxView(buildInbox(base), { now: NOW, formatTime: iso, error: 'boom' });
  assert.deepEqual(view.freshness.slice(-2), [
    { text: '連絡：2 件の Run を読めない', kind: 'warn' },
    { text: '更新できない（boom）。前の内容を示しています', kind: 'bad' },
  ]);
  assert.equal(view.mailUnread, false);
  assert.equal(view.stages[0].note, null);
});

test('プロジェクトの選択肢は「すべて」と文書の projects で、今の選択を持つ', () => {
  const doc = fullDocument();
  const view = buildInboxView(doc, { now: NOW, formatTime: iso, project: 'repo-b' });
  assert.deepEqual(view.projects, [
    { value: '', label: 'すべてのプロジェクト', selected: false },
    { value: 'repo-a', label: 'プロジェクトA（4）', selected: false },
    { value: 'repo-b', label: 'プロジェクトB（1）', selected: true },
  ]);
  const gone = buildInboxView(doc, { now: NOW, formatTime: iso, project: 'repo-x' });
  assert.deepEqual(gone.projects.at(-1), { value: 'repo-x', label: 'repo-x（0）', selected: true });
});

test('?project= を作り、URL から選択を読み戻し、ほかの引数を保つ', () => {
  assert.equal(projectFromSearch(''), null);
  assert.equal(projectFromSearch('?project='), null);
  assert.equal(projectFromSearch('?project=repo%20a&x=1'), 'repo a');
  assert.equal(searchForProject('', 'repo a'), '?project=repo+a');
  assert.equal(searchForProject('?x=1', 'repo-b'), '?x=1&project=repo-b');
  assert.equal(searchForProject('?project=repo-b&x=1', null), '?x=1');
  assert.equal(searchForProject('?project=repo-b', ''), '');
  assert.equal(projectFromSearch(searchForProject('', 'リポ/1&2')), 'リポ/1&2');
  assert.equal(inboxApiPath(null), '/api/inbox');
  assert.equal(inboxApiPath('リポ/1&2'), `/api/inbox?project=${encodeURIComponent('リポ/1&2')}`);
});
