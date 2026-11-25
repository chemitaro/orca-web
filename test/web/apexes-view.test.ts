import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApexList } from '../../src/apex/build.ts';
import type { ApexListDocument } from '../../src/apex/model.ts';
import type { AgentState, StateDocument } from '../../src/state/model.ts';
import {
  apexesApiPath,
  apexesTitle,
  buildPane as buildPaneView,
  buildApexesView as buildView,
  frameSrc,
  initialSelection,
  pickSelection,
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

test('T-04：広い幅で ?apex= なしに開くと、最初の文書で対応が必要の先頭を1回だけ選ぶ', () => {
  let sel: Selection = initialSelection('', { wide: true });
  assert.equal(sel.id, null);
  sel = reduceSelection(sel, { type: 'document', doc: needsDoc() });
  const picked = sel.id;
  assert.ok(picked === 'n1' || picked === 'n2');
  sel = reduceSelection(sel, { type: 'select', id: 'w' });
  sel = reduceSelection(sel, { type: 'document', doc: needsDoc() });
  assert.equal(sel.id, 'w', '以後は利用者が選んだときだけ変わる');
  sel = reduceSelection(sel, { type: 'clear' });
  sel = reduceSelection(sel, { type: 'document', doc: needsDoc() });
  assert.equal(sel.id, null, '「← 一覧」の後の描き直しで選び直さない');
  const none = reduceSelection(initialSelection('', { wide: true }), {
    type: 'document',
    doc: documentOf([agent('w')]),
  });
  assert.equal(none.id, null);
  assert.equal(reduceSelection(none, { type: 'document', doc: needsDoc() }).id, null, '自動の選びは1回だけ');
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
  assert.equal(frameSrc('a b/&'), '/embed/agent?id=a%20b%2F%26');
});

test('T-06：切り替えの確かめの文', () => {
  assert.equal(SWITCH_CONFIRM_TEXT, '送信の処理中か結果不明の表示があります。切り替えると表示を失います');
});
