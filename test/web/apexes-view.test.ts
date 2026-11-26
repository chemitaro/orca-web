import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApexList } from '../../src/apex/build.ts';
import type { ApexListDocument } from '../../src/apex/model.ts';
import type { AgentState, StateDocument } from '../../src/state/model.ts';
import {
  apexesApiPath,
  apexesFavicon,
  apexesTitle,
  boardColumns,
  buildPane as buildPaneView,
  buildApexesView as buildView,
  frameSrc,
  initialExtrasOpen,
  initialSelection,
  isUnseen,
  paneExtrasToggle,
  pickSelection,
  pruneSeen,
  reduceSelection,
  SWITCH_CONFIRM_TEXT,
  selectionUrl,
} from '../../web/apexes-view.js';
import { agent, fact, input, NOW } from '../inbox/fixture.ts';

// biome-ignore lint/suspicious/noExplicitAny: the view is an untyped JS object
const buildApexesView = (doc: ApexListDocument, options: Parameters<typeof buildView>[1]): any =>
  buildView(doc, options);
// biome-ignore lint/suspicious/noExplicitAny: the pane is an untyped JS object
const buildPane = (...args: Parameters<typeof buildPaneView>): any => buildPaneView(...args);
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
    agent('unsure', { state: fact(null) }),
  ]);
}

test('T-08: 段は開く3つと畳む4つの順で、見出しの数を持つ。不明は作業中に数えない', () => {
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
      ['unknown', '不明', 1, true],
      ['unlinked', '結べない仕事', 1, true],
    ],
  );
  assert.deepEqual(
    view.headline.map((h: { text: string }) => h.text),
    ['対応が必要 1', '作業中 1', '完了 1'],
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
  const row = odd.sections.find((s: { key: string }) => s.key === 'unknown').rows[0];
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

test('T-01: favicon の href は対応が必要が0なら普通、1以上なら印付き。描く内容にも同じ値が入る', () => {
  assert.equal(apexesFavicon(0), '/favicon.svg');
  assert.equal(apexesFavicon(1), '/favicon-alert.svg');
  assert.equal(apexesFavicon(3), '/favicon-alert.svg');
  assert.equal(apexesFavicon(undefined), '/favicon.svg');
  const two = documentOf([agent('a', { state: fact('waiting') }), agent('b', { state: fact('blocked') })]);
  assert.equal(buildApexesView(two, { now: NOW }).favicon, '/favicon-alert.svg');
  assert.equal(buildApexesView(documentOf([agent('a')]), { now: NOW }).favicon, '/favicon.svg');
});

test('API の道は project を符号にして付ける', () => {
  assert.equal(apexesApiPath(null), '/api/apexes');
  assert.equal(apexesApiPath('repo a'), '/api/apexes?project=repo%20a');
});

// biome-ignore lint/suspicious/noExplicitAny: the selection state is an untyped JS object
type Selection = any;
const needsDoc = () =>
  documentOf([agent('w', {}), agent('n1', { state: fact('waiting') }), agent('n2', { state: fact('blocked') })]);

test('T-04：pickSelection は要求の id（一覧になければ missing 付き）、autoPick なら対応が必要の先頭、なければ null', () => {
  const doc = needsDoc();
  assert.deepEqual([pickSelection(doc, 'w')?.id, pickSelection(doc, 'w')?.missing], ['w', false]);
  const gone = pickSelection(doc, 'gone', { autoPick: true });
  assert.equal(gone?.id, 'gone');
  assert.equal(gone?.missing, true);
  assert.equal(gone?.item, null);
  const first = pickSelection(doc, null, { autoPick: true });
  assert.equal(first?.id, doc.items.find((i) => i.group === 'needs_action')?.id);
  assert.equal(pickSelection(doc, null, { autoPick: false }), null);
  assert.equal(pickSelection(documentOf([agent('w')]), null, { autoPick: true }), null, '対応が必要がなければ選ばない');
});

test('iss-00106 T-03：広い幅でも ?apex= なしに開くと自動で選ばない（3列が標準）。選ぶ・「← 一覧」は今のとおり', () => {
  let sel: Selection = initialSelection('', { wide: true });
  assert.equal(sel.id, null);
  assert.equal(sel.autoPick, false);
  sel = reduceSelection(sel, { type: 'document', doc: needsDoc() });
  assert.equal(sel.id, null, '対応が必要があっても選ばない');
  sel = reduceSelection(sel, { type: 'select', id: 'w' });
  sel = reduceSelection(sel, { type: 'document', doc: needsDoc() });
  assert.equal(sel.id, 'w', '以後は利用者が選んだときだけ変わる');
  sel = reduceSelection(sel, { type: 'clear' });
  sel = reduceSelection(sel, { type: 'document', doc: needsDoc() });
  assert.equal(sel.id, null, '「← 一覧」の後の描き直しで選び直さない');
  assert.equal(reduceSelection(initialSelection(''), { type: 'document', doc: needsDoc() }).id, null);
});

test('T-04：狭い幅で開くと何も選ばない', () => {
  let sel: Selection = initialSelection('?project=x', { wide: false });
  sel = reduceSelection(sel, { type: 'document', doc: needsDoc() });
  assert.equal(sel.id, null);
});

test('T-04：?apex= の id は選んだまま描き、stale か空の文書では待ち、最初の使える文書になければ外す', () => {
  let sel: Selection = initialSelection('?apex=gone', { wide: true });
  assert.equal(sel.id, 'gone');
  sel = reduceSelection(sel, {
    type: 'document',
    doc: documentOf([agent('n1', { state: fact('waiting') })], { stale: true }),
  });
  assert.equal(sel.id, 'gone', 'stale の文書では外さない');
  sel = reduceSelection(sel, { type: 'document', doc: documentOf([]) });
  assert.equal(sel.id, 'gone', '空の文書では外さない');
  sel = reduceSelection(sel, { type: 'document', doc: needsDoc() });
  assert.equal(sel.id, null, '一覧にない id は選ばない（自動でも選ばない）');
  let kept: Selection = initialSelection('?apex=w', { wide: true });
  kept = reduceSelection(kept, { type: 'document', doc: needsDoc() });
  assert.equal(kept.id, 'w');
  kept = reduceSelection(kept, { type: 'document', doc: documentOf([agent('n1', { state: fact('waiting') })]) });
  assert.equal(kept.id, 'w', '選んだ後に消えても外さない（missing になる）');
});

test('T-04：選んだ頂点の見出しは、一覧から消えても前の題名と「一覧にありません」を出す', () => {
  const doc = needsDoc();
  const sel: Selection = reduceSelection(initialSelection('', { wide: false }), { type: 'select', id: 'w' });
  const shown = buildPane(doc, sel, { now: NOW, remembered: null });
  assert.equal(shown.selected, true);
  assert.equal(shown.header.missing, false);
  assert.equal(shown.header.open.worktree, doc.items.find((i) => i.id === 'w')?.worktreeId);
  assert.equal(shown.header.open.agent, 'w');
  assert.equal(shown.guide, null);
  const gone = buildPane(documentOf([agent('n1', { state: fact('waiting') })]), sel, {
    now: NOW,
    remembered: shown.remember,
  });
  assert.equal(gone.header.missing, true);
  assert.equal(gone.header.missingLabel, '一覧にありません');
  assert.equal(gone.header.title, shown.header.title);
  const empty = buildPane(doc, initialSelection('', { wide: false }), { now: NOW, remembered: null });
  assert.equal(empty.selected, false);
  assert.equal(empty.header, null);
  assert.match(empty.guide ?? '', /選ぶ/);
  const waiting = buildPane(null, initialSelection('?apex=x', { wide: false }), { now: NOW, remembered: null });
  assert.equal(waiting.header.missing, false, 'まだ確かめていない id は missing にしない');
  assert.equal(waiting.header.open, null);
});

test('T-04：selectionUrl は apex を足す・替える・外し、ほかの引数を保つ。frameSrc は id を符号にする', () => {
  assert.equal(selectionUrl('', 'a'), '?apex=a');
  assert.equal(selectionUrl('?project=p', 'a b'), '?project=p&apex=a+b');
  assert.equal(selectionUrl('?apex=a&project=p', 'b'), '?apex=b&project=p');
  assert.equal(selectionUrl('?project=p&apex=a', null), '?project=p');
  assert.equal(selectionUrl('?apex=a', null), '');
  assert.equal(frameSrc('a b/&'), '/embed/agent?id=a%20b%2F%26&head=compact');
});

test('T-06：切り替えの確かめの文', () => {
  assert.equal(SWITCH_CONFIRM_TEXT, '送信の処理中か結果不明の表示があります。切り替えると表示を失います');
});

const DAY = 24 * HOUR;
// biome-ignore lint/suspicious/noExplicitAny: hand-made items for the pure functions
const item = (patch: Record<string, any>): any => ({
  id: 'x',
  group: 'done_recent',
  status: 'done',
  lastActivityAt: ago(HOUR),
  ...patch,
});

test('T-07：isUnseen は完了と以前の完了で、見たことがないか、見た時刻より最後の活動が新しいときだけ真', () => {
  assert.equal(isUnseen(item({}), {}), true, '見たことがない');
  assert.equal(isUnseen(item({ group: 'done_older' }), {}), true);
  assert.equal(isUnseen(item({}), { x: ago(2 * HOUR) }), true, '見た後でまた動いた');
  assert.equal(isUnseen(item({}), { x: ago(HOUR - 1) }), false, '見た後に動いていない');
  assert.equal(isUnseen(item({ group: 'working', status: 'working' }), {}), false);
  assert.equal(isUnseen(item({ group: 'needs_action', status: 'needs_action' }), {}), false);
  assert.equal(isUnseen(item({ group: 'sleeping' }), {}), false, '眠っている段の done には点を出さない');
  assert.equal(isUnseen(item({ lastActivityAt: null }), {}), false, '最後の活動がなければ出さない');
  assert.equal(isUnseen(item({}), null), false, '保存が使えなければ点を出さない');
});

test('T-07：pruneSeen は 14 日より古い記録を落とし、絞っていない・stale でない・空でない文書のときだけ一覧にない id を落とす', () => {
  const doc = documentOf([agent('keep'), agent('fresh')]);
  const seen = { keep: ago(HOUR), fresh: ago(13 * DAY), old: ago(15 * DAY), gone: ago(HOUR), bad: 'x' };
  assert.deepEqual(pruneSeen(seen, doc, NOW), { keep: ago(HOUR), fresh: ago(13 * DAY) });
  const kept = { keep: ago(HOUR), gone: ago(HOUR), old: ago(15 * DAY) };
  assert.deepEqual(pruneSeen(kept, { ...doc, project: 'repo-a' }, NOW), { keep: ago(HOUR), gone: ago(HOUR) });
  assert.deepEqual(pruneSeen(kept, { ...doc, stale: true }, NOW), { keep: ago(HOUR), gone: ago(HOUR) });
  assert.deepEqual(pruneSeen(kept, { ...doc, items: [] }, NOW), { keep: ago(HOUR), gone: ago(HOUR) });
});

test('T-07：行の点と見出しの「新着 n」は完了と以前の完了の点の数。保存が使えなければ点も数も出さない', () => {
  const doc = fullDocument();
  const view = buildApexesView(doc, { now: NOW, seen: {} });
  // biome-ignore lint/suspicious/noExplicitAny: the rows are untyped JS objects
  const rows = new Map<string, any>(
    view.sections.flatMap((s: { rows: { key: string }[] }) => s.rows).map((r: { key: string }) => [r.key, r]),
  );
  assert.equal(rows.get('recent').unseen, true);
  assert.equal(rows.get('older').unseen, true);
  assert.equal(rows.get('asleep').unseen, false);
  assert.equal(rows.get('needs').unseen, false);
  assert.deepEqual(
    view.headline.map((h: { text: string }) => h.text),
    ['対応が必要 1', '作業中 1', '完了 1', '新着 2'],
  );
  const seenRecent = buildApexesView(doc, { now: NOW, seen: { recent: new Date(NOW).toISOString() } });
  assert.deepEqual(
    seenRecent.headline.map((h: { text: string }) => h.text),
    ['対応が必要 1', '作業中 1', '完了 1', '新着 1'],
  );
  const noStorage = buildApexesView(doc, { now: NOW, seen: null });
  assert.equal(
    noStorage.sections
      .flatMap((s: { rows: { unseen: boolean }[] }) => s.rows)
      .some((r: { unseen: boolean }) => r.unseen),
    false,
  );
  assert.deepEqual(
    noStorage.headline.map((h: { text: string }) => h.text),
    ['対応が必要 1', '作業中 1', '完了 1'],
  );
});

test('T-10：見出しの数は段の件数。不明の段の作業中の頂点は作業中に数えない。対応が必要 0 は強調しない', () => {
  // biome-ignore lint/suspicious/noExplicitAny: a hand-made apexes document
  const doc: any = {
    ...documentOf([]),
    counts: { needs_action: 0, working: 3, done: 0 },
    items: [
      item({ id: 'w1', group: 'working', status: 'working' }),
      item({ id: 'w2', group: 'working', status: 'working' }),
      item({ id: 'z', group: 'unknown', status: 'working', tags: ['unverified'] }),
    ],
  };
  const view = buildApexesView(doc, { now: NOW });
  const working = view.sections.find((s: { key: string }) => s.key === 'working');
  const head = new Map(view.headline.map((h: { key: string; text: string; emphasis: boolean }) => [h.key, h]));
  // biome-ignore lint/suspicious/noExplicitAny: the headline parts are untyped JS objects
  const part = (key: string): any => head.get(key);
  assert.equal(part('working').text, `作業中 ${working.count}`);
  assert.equal(part('working').text, '作業中 2');
  assert.equal(part('needs_action').text, '対応が必要 0');
  assert.equal(part('needs_action').emphasis, false);
  const needs = buildApexesView(fullDocument(), { now: NOW });
  assert.equal(needs.headline[0].emphasis, true);
  assert.equal(needs.title, '(1) 指揮 — orca-web', '題名の件数は counts.needs_action のまま');
});

test('T-11: 新しい理由と札に日本語の言葉が付き、配下の数は束の Dispatch を含む', async () => {
  const { BundleOwners } = await import('../../src/apex/owners.ts');
  const { orchestration } = await import('../apex/fixture.ts');
  const { ci, pr, worktree } = await import('../inbox/fixture.ts');
  const o = orchestration({
    tasks: [
      { id: 't-root', paneKey: 'pane-c', status: 'completed' },
      { id: 't-1', parent: 't-root', status: 'blocked' },
      { id: 't-2', parent: 't-root', status: 'failed', completedAt: ago(2 * HOUR) },
    ],
    dispatches: [
      { id: 'd1', task: 't-1', state: 'working' },
      { id: 'd2', task: 't-2', state: 'failed' },
    ],
  });
  const doc = buildApexList({
    state: input({
      agents: [agent('coord', { paneKey: 'pane-c', state: fact('working') })],
      tasks: o.tasks,
      workers: o.workers,
    }).state,
    now: NOW,
    project: null,
    extras: o.extras,
    owners: new BundleOwners(),
  });
  const row = buildApexesView(doc, { now: NOW }).sections[1].rows[0];
  assert.deepEqual(row.reasons, ['作業中', '仕事が残っている']);
  assert.equal(row.members, '1/2');
  assert.equal(row.membersLabel, '配下 2 のうち 1 が作業中');
  const done = buildApexList({
    state: input({
      agents: [agent('coord', { paneKey: 'pane-c', state: fact('done') })],
      tasks: o.tasks,
      workers: o.workers.map((w) => ({ ...w, state: fact('succeeded') })),
      worktrees: [worktree({ pr: pr('open'), ci: ci('failure') })],
    }).state,
    now: NOW,
    project: null,
    extras: o.extras,
    owners: new BundleOwners(),
  });
  const doneRow = buildApexesView(done, { now: NOW }).sections[2].rows[0];
  assert.deepEqual(doneRow.badges, ['CI が失敗', '残りの task 1']);
});

test('T-11: 理由と札の言葉の表は、文書のすべての値に言葉を持つ', async () => {
  const { BADGE_LABELS, REASON_LABELS } = await import('../../web/apexes-view.js');
  const labels: Record<string, unknown> = REASON_LABELS;
  for (const reason of [
    'question',
    'decision',
    'question_working',
    'stalled',
    'apex_closed',
    'failed',
    'live_work',
    'grace',
  ]) {
    assert.equal(typeof labels[reason], 'string', reason);
  }
  assert.deepEqual(Object.keys(BADGE_LABELS).sort(), [
    'ci_failed',
    'failed_members',
    'merge_pending',
    'remaining_tasks',
  ]);
  const view = buildApexesView(
    {
      ...documentOf([agent('coord', { state: fact('done') })]),
      items: [
        {
          ...documentOf([agent('coord', { state: fact('done') })]).items[0],
          badges: [
            { kind: 'merge_pending', count: 1 },
            { kind: 'failed_members', count: 3 },
          ],
        },
      ] as ApexListDocument['items'],
    },
    { now: NOW },
  );
  assert.deepEqual(view.sections[2].rows[0].badges, ['マージ待ち', '失敗した作業者 3']);
});

test('T-11: 結べない束の行は Run の目的と生きた数・問いの数を出し、/runs/<id> にリンクする', () => {
  const doc = documentOf([]);
  const view = buildApexesView(
    {
      ...doc,
      unlinked: [
        {
          id: 'run-b#2',
          kind: 'bundle',
          runId: 'run b/1',
          objective: '仮の目的',
          generation: 2,
          live: 2,
          questions: 1,
        },
        { id: 'run-c#?', kind: 'bundle', runId: 'run-c', objective: null, generation: null, live: 0, questions: 1 },
      ],
    },
    { now: NOW },
  );
  const rows = view.sections.find((s: { key: string }) => s.key === 'unlinked').rows;
  assert.deepEqual(
    rows.map((row: { title: string; href: string; reasons: string[]; selectable: boolean }) => [
      row.title,
      row.href,
      row.reasons,
      row.selectable,
    ]),
    [
      ['仮の目的', '/runs/run%20b%2F1', ['生きた仕事 2', '問い 1'], false],
      ['Run run-c', '/runs/run-c', ['問い 1'], false],
    ],
  );
});

test('iss-00091 T-04: 理由 question_working の言葉は「質問あり（作業は継続中）」', async () => {
  const { REASON_LABELS } = await import('../../web/apexes-view.js');
  assert.equal((REASON_LABELS as Record<string, unknown>).question_working, '質問あり（作業は継続中）');
});

test('iss-00098 T-06: 理由 question_answered・decision_resolved の言葉', async () => {
  const { REASON_LABELS } = await import('../../web/apexes-view.js');
  const labels = REASON_LABELS as Record<string, unknown>;
  assert.equal(labels.question_answered, '質問の印あり（返事済み）');
  assert.equal(labels.decision_resolved, '判断の印あり（門は解決済み）');
});

test('iss-00102 T-01：頂点の行は worktreeId があれば Orca で開く先 {worktree, agent}、なければ null。結べない行と束は null', () => {
  const doc = fullDocument();
  const view = buildApexesView(doc, { now: NOW });
  // biome-ignore lint/suspicious/noExplicitAny: rows are untyped JS objects
  const rows: any[] = view.sections.flatMap((s: { rows: unknown[] }) => s.rows);
  const apexRows = rows.filter((row) => row.selectable);
  assert.ok(apexRows.length > 0);
  for (const row of apexRows) {
    const item = doc.items.find((i) => String(i.id) === row.key);
    assert.deepEqual(row.open, item?.worktreeId ? { worktree: item.worktreeId, agent: row.key } : null);
  }
  for (const row of rows.filter((r) => !r.selectable)) assert.equal(row.open, null, `${row.key} は開く先を持たない`);
  const noTree = buildApexesView(
    { ...doc, items: doc.items.map((i) => ({ ...i, worktreeId: null })) } as unknown as ApexListDocument,
    { now: NOW },
  );
  for (const row of noTree.sections.flatMap((s: { rows: { open: unknown }[] }) => s.rows)) assert.equal(row.open, null);
  const bundles = buildApexesView(
    {
      ...documentOf([]),
      unlinked: [{ id: 'r#1', kind: 'bundle', runId: 'r', objective: null, generation: 1, live: 1, questions: 0 }],
    } as unknown as ApexListDocument,
    { now: NOW },
  );
  assert.equal(bundles.sections.find((s: { key: string }) => s.key === 'unlinked').rows[0].open, null);
});

test('iss-00102 T-01：右のペインの見出しの開く先は、行と同じ決め方', () => {
  const doc = fullDocument();
  const view = buildApexesView(doc, { now: NOW });
  // biome-ignore lint/suspicious/noExplicitAny: rows are untyped JS objects
  const row: any = view.sections.flatMap((s: { rows: unknown[] }) => s.rows).find((r: any) => r.selectable && r.open);
  const pane = buildPane(doc, { id: row.key, checked: true }, { now: NOW, remembered: null });
  assert.deepEqual(pane.header.open, row.open);
});

test('iss-00104 T-04：詳細の切り替えは、畳んで対応のカードがあれば「対応 n」と対応が必要の色。窓の条件で始めの開閉を決める', () => {
  assert.deepEqual(paneExtrasToggle({ open: false, cards: [1, 2] }), {
    expanded: false,
    label: '詳細',
    badge: '対応 2',
    alert: true,
  });
  assert.deepEqual(paneExtrasToggle({ open: true, cards: [1, 2] }), {
    expanded: true,
    label: '詳細',
    badge: null,
    alert: false,
  });
  assert.equal(paneExtrasToggle({ open: false, cards: [] }).badge, null);
  assert.equal(paneExtrasToggle({ open: false, cards: [] }).alert, false);
  assert.equal(initialExtrasOpen(true), false, '狭い窓・低い窓では畳む');
  assert.equal(initialExtrasOpen(false), true);
  assert.equal(initialExtrasOpen(undefined), true, '読めなければ開く');
});

test('iss-00106 T-01：boardColumns は対応が必要・作業中・完了の3列で、完了の列の下に畳む段をこの順に置く', () => {
  const view = buildApexesView(fullDocument(), { now: NOW });
  // biome-ignore lint/suspicious/noExplicitAny: columns are untyped JS objects
  const columns: any[] = boardColumns(view.sections);
  assert.deepEqual(
    columns.map((c: { key: string; sections: { key: string }[] }) => [c.key, c.sections.map((s) => s.key)]),
    [
      ['needs_action', ['needs_action']],
      ['working', ['working']],
      ['done', ['done_recent', 'done_older', 'sleeping', 'unknown', 'unlinked']],
    ],
  );
  const done = columns[2].sections;
  assert.deepEqual(
    done.map((s: { collapsed: boolean }) => s.collapsed),
    [false, true, true, true, true],
    '完了のほかは畳む',
  );
  // biome-ignore lint/suspicious/noExplicitAny: columns are untyped JS objects
  const extra: any[] = boardColumns([...view.sections, { key: 'new_stage', rows: [] }]);
  assert.equal(extra[2].sections.at(-1).key, 'new_stage', '知らない段は最後の列に足す');
  assert.deepEqual(
    boardColumns(null as unknown as { key: string }[]).map((c: { sections: unknown[] }) => c.sections.length),
    [0, 0, 0],
  );
});
