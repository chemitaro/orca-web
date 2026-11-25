// 対応のカードと下書きの文（web/apexes-cards-view.js、iss-00080 D-01・D-02・D-04、T-03・T-05）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildApexCards,
  buildDraftText,
  DRAFT_RESULT_TEXTS,
  draftNotice,
  paneFrameTarget,
} from '../../web/apexes-cards-view.js';
import { frameSrc } from '../../web/apexes-view.js';

const item = (patch: Record<string, unknown> = {}) => ({
  id: 'apex',
  reasons: [],
  waitingMembers: [],
  questions: [],
  ...patch,
});

test('T-03：対応がなければカードは空', () => {
  assert.deepEqual(buildApexCards(item({ reasons: ['working'] })), []);
  assert.deepEqual(buildApexCards(null), []);
  assert.deepEqual(buildApexCards({ id: 'old' }), [], '古い文書（項目なし）でも空');
});

test('T-03：頂点、メンバーの許可待ち、質問・判断の順で、決めた文と操作', () => {
  const cards = buildApexCards(
    item({
      reasons: ['apex_waiting', 'member_blocked', 'question', 'decision'],
      waitingMembers: [
        { id: 'm1', title: '子', mark: 'blocked' },
        { id: 'm2', title: null, mark: 'waiting' },
      ],
      questions: [
        { dispatchId: 'd1', taskTitle: '調べる', kind: 'ask' },
        { dispatchId: 'd2', taskTitle: '決める', kind: 'gate' },
      ],
    }),
  );
  assert.deepEqual(
    cards.map((card) => [card.kind, card.text, 'action' in card ? card.action.label : card.note]),
    [
      ['apex', '頂点が入力待ち', '会話のカードで答えてください'],
      ['member', '子が許可待ち', '見て答える'],
      ['member', '題名なしが入力待ち', '見て答える'],
      ['question', '調べるの質問（ask）', '頂点に伝える'],
      ['question', '決めるの判断（gate）', '頂点に伝える'],
    ],
  );
  const member = cards[1];
  assert.ok(member?.kind === 'member');
  assert.equal(member.memberId, 'm1');
  assert.equal(member.action.type, 'answer');
  assert.equal(cards[3]?.kind === 'question' && cards[3].action.type, 'tell');
  assert.equal(new Set(cards.map((card) => card.key)).size, cards.length, 'key は重ならない');
});

test('T-03：apex_blocked は頂点が許可待ち。知らない印や種類の行は出さない', () => {
  const cards = buildApexCards(
    item({
      reasons: ['apex_blocked'],
      waitingMembers: [
        { id: 'm', title: 't', mark: 'working' },
        { title: 'no id', mark: 'blocked' },
      ],
      questions: [{ dispatchId: 'd', taskTitle: 't', kind: 'other' }],
    }),
  );
  assert.deepEqual(
    cards.map((card) => card.text),
    ['頂点が許可待ち'],
  );
});

test('T-05：buildDraftText は決めた型の文と Dispatch の id', () => {
  assert.equal(
    buildDraftText({ taskTitle: '調べる', questionKind: 'ask', dispatchId: 'ctx_1' }),
    'メンバー「調べる」の質問（ask）に答えてください。\n（Dispatch ctx_1）',
  );
  assert.equal(
    buildDraftText({ taskTitle: '決める', questionKind: 'gate', dispatchId: 'ctx_2' }),
    'メンバー「決める」の判断（gate）を決めてください。\n（Dispatch ctx_2）',
  );
});

test('R-03：下書きの結果の帯。timeout は「下書きを入れられませんでした」、知らない理由も同じ', () => {
  assert.deepEqual(draftNotice({ ok: true, reason: null }), { kind: 'info', text: DRAFT_RESULT_TEXTS.ok });
  assert.deepEqual(draftNotice({ ok: false, reason: 'timeout' }), {
    kind: 'bad',
    text: '下書きを入れられませんでした',
  });
  assert.match(draftNotice({ ok: false, reason: 'not_empty' }).text, /書きかけ/);
  for (const reason of ['busy', 'disabled', 'compose_off', 'too_long']) {
    assert.match(draftNotice({ ok: false, reason }).text, /^下書きを入れられませんでした：/, reason);
  }
  assert.deepEqual(draftNotice({ ok: false, reason: 'strange' }), {
    kind: 'bad',
    text: '下書きを入れられませんでした',
  });
});

test('T-04：メンバーの枠は compose=off と帯、頂点の枠は帯なし', () => {
  assert.deepEqual(paneFrameTarget('apex', null), { id: 'apex', compose: true, band: null });
  assert.deepEqual(paneFrameTarget('apex', { id: 'm 1', title: '子' }), {
    id: 'm 1',
    compose: false,
    band: { text: 'メンバー「子」（答えるだけ）', back: '頂点に戻る' },
  });
  assert.equal(frameSrc('m 1', { compose: false }), '/embed/agent?id=m%201&compose=off');
  assert.equal(frameSrc('m 1'), '/embed/agent?id=m%201');
});

test('T-08：/apexes-cards-view.js を STATIC_FILES に登録する', () => {
  const app = readFileSync(new URL('../../src/server/app.ts', import.meta.url), 'utf8');
  assert.match(
    app,
    /'\/apexes-cards-view\.js': \{ file: 'apexes-cards-view\.js', type: 'text\/javascript; charset=utf-8' \}/,
  );
});
