import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AGENT_ICONS, iconKey, STATE_ICONS } from '../../web/embed/agent-marks-icons.js';
import {
  buildMarks,
  findWorktree,
  formatElapsed,
  MARK_LABELS,
  MARKS,
  orderAgents,
} from '../../web/embed/agent-marks-view.js';
import { formatElapsed as sharedFormatElapsed } from '../../web/embed/elapsed.js';

const NOW = Date.parse('2026-01-02T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;

// Orca（stablyai/orca）のコミット 80a514cfb6ac169ef311e70ea2b8a07b961416d8 の
// src/renderer/src/components/status-bar/icons.tsx の ClaudeIcon・OpenAIIcon の path の先頭と末尾。
const CLAUDE_D_HEAD = 'M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048';
const CLAUDE_D_TAIL = '-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z';
const OPENAI_D_HEAD = 'M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616';
const OPENAI_D_TAIL = '.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z';

function first<T>(list: T[]): T {
  const head = list[0];
  assert.ok(head !== undefined);
  return head;
}

function agent(patch: Record<string, unknown>) {
  return {
    id: 'a',
    mark: 'working',
    agentType: 'claude',
    since: null,
    detail: `/embed/agent?id=${String(patch.id ?? 'a')}`,
    elapsedFrom: null,
    elapsedBasis: null,
    ...patch,
  };
}

function summary(worktrees: unknown) {
  return {
    schema: 'orca-web.worktree-summary/v1',
    generatedAt: new Date(NOW).toISOString(),
    stale: false,
    worktrees,
  };
}

test('MARKS と MARK_LABELS は6つの状態とその名前', () => {
  assert.deepEqual(MARKS, ['working', 'blocked', 'waiting', 'done', 'sleeping', 'unknown']);
  assert.deepEqual(MARK_LABELS, {
    working: '作業中',
    blocked: '許可待ち',
    waiting: '入力待ち',
    done: '完了',
    sleeping: 'スリープ',
    unknown: '不明',
  });
});

test('formatElapsed は elapsed.js のものを再び export する（既存の import の口を保つ）', () => {
  assert.equal(formatElapsed, sharedFormatElapsed);
  assert.equal(formatElapsed(ago(59 * SEC), NOW), 'now');
  assert.equal(formatElapsed(ago(5 * MIN), NOW), '5m');
});

test('経過の境目（60_000 など）は web/ の中で elapsed.js にだけある', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  // send-view.js の 60_000 は確認の待ち時間で、経過の規則でない（D-11）。
  const holders = walk('web').filter((p) => {
    if (p === join('web', 'embed', 'send-view.js')) return false;
    return /60_000|60000|\/ 60\b|\/ 24\b/.test(readFileSync(p, 'utf8'));
  });
  assert.deepEqual(holders, [join('web', 'embed', 'elapsed.js')]);
});

test('findWorktree：パスを先に、末尾の / の違いは同じとみなし、なければ id で探す', () => {
  const a = { id: 'wt-a', path: '/repo/a', agents: [] };
  const b = { id: 'wt-b', path: '/repo/b/', agents: [] };
  const doc = summary([a, b]);
  assert.equal(findWorktree(doc, { path: '/repo/a' }), a);
  assert.equal(findWorktree(doc, { path: '/repo/a/' }), a);
  assert.equal(findWorktree(doc, { path: '/repo/b' }), b);
  assert.equal(findWorktree(doc, { id: 'wt-b' }), b);
  assert.equal(findWorktree(doc, { path: '/repo/none', id: 'wt-a' }), a);
  assert.equal(findWorktree(doc, { path: '/repo/b', id: 'wt-a' }), b);
  assert.equal(findWorktree(doc, { path: '/repo/none' }), null);
  assert.equal(findWorktree(doc, { id: 'wt-none' }), null);
  assert.equal(findWorktree(doc, {}), null);
});

test('findWorktree：文書の形が違うときは null', () => {
  const wt = { id: 'wt-a', path: '/repo/a', agents: [] };
  assert.equal(findWorktree({ ...summary([wt]), schema: 'orca-web.state/v1' }, { id: 'wt-a' }), null);
  assert.equal(findWorktree(summary({ 0: wt }), { id: 'wt-a' }), null);
  assert.equal(findWorktree(null, { id: 'wt-a' }), null);
  assert.equal(findWorktree('x', { id: 'wt-a' }), null);
  assert.equal(findWorktree(summary([null, 1, wt]), { id: 'wt-a' }), wt);
});

test('iconKey：種類の値から表の鍵を決める', () => {
  assert.equal(iconKey('claude'), 'claude');
  assert.equal(iconKey('claude-agent-teams'), 'claude');
  assert.equal(iconKey('codex'), 'codex');
  assert.equal(iconKey(null), 'none');
  assert.equal(iconKey(''), 'none');
  assert.equal(iconKey(undefined), 'none');
  assert.equal(iconKey('gemini'), 'other');
  assert.equal(iconKey(42), 'other');
  for (const key of ['claude', 'codex', 'other', 'none']) assert.ok(key in AGENT_ICONS);
});

test('アイコンの表：claude と codex は Orca のロゴの値を写す', () => {
  const claude = AGENT_ICONS.claude;
  assert.equal(claude.label, 'Claude');
  assert.equal(claude.viewBox, '0 0 24 24');
  assert.equal(claude.paths.length, 1);
  const claudePath = first(claude.paths);
  assert.ok(claudePath.d.startsWith(CLAUDE_D_HEAD));
  assert.ok(claudePath.d.endsWith(CLAUDE_D_TAIL));
  assert.equal(claudePath.fill, '#D97757');
  assert.equal(claudePath.fillRule, 'nonzero');

  const codex = AGENT_ICONS.codex;
  assert.equal(codex.label, 'Codex');
  assert.equal(codex.viewBox, '0 0 24 24');
  assert.equal(codex.paths.length, 1);
  const codexPath = first(codex.paths);
  assert.ok(codexPath.d.startsWith(OPENAI_D_HEAD));
  assert.ok(codexPath.d.endsWith(OPENAI_D_TAIL));
  assert.equal(codexPath.fill, 'currentColor');
  assert.equal(codexPath.fillRule, 'evenodd');

  assert.equal(AGENT_ICONS.none.label, 'エージェント');
  for (const key of ['other', 'none'] as const) {
    for (const p of AGENT_ICONS[key].paths) {
      for (const color of [p.fill, p.stroke]) {
        if (color !== undefined) assert.ok(color === 'currentColor' || color === 'none', `${key}: ${color}`);
      }
    }
  }
});

test('アイコンの表：Orca のロゴの path と完全に同じ', () => {
  const source = '.workbench/orca-icons.tsx';
  let text: string;
  try {
    text = readFileSync(source, 'utf8');
  } catch {
    return; // 写しの元がない環境（CI）では、先頭と末尾の照合だけにする。
  }
  const pick = (name: string) => {
    const at = text.indexOf(`export function ${name}(`);
    const m = /<path[\s\S]*?d="([^"]+)"/.exec(text.slice(at));
    return m?.[1];
  };
  assert.equal(first(AGENT_ICONS.claude.paths).d, pick('ClaudeIcon'));
  assert.equal(first(AGENT_ICONS.codex.paths).d, pick('OpenAIIcon'));
});

test('アイコンの表：表のすぐ上に出どころと商標のコメントがあり、ロゴの値は web/ でこのファイルにだけある', () => {
  const iconsFile = 'web/embed/agent-marks-icons.js';
  const lines = readFileSync(iconsFile, 'utf8').split('\n');
  const at = lines.findIndex((l) => l.startsWith('export const AGENT_ICONS'));
  assert.ok(at > 0);
  const comment = lines[at - 1] ?? '';
  assert.match(comment, /^\/\//);
  assert.match(comment, /stablyai\/orca/);
  assert.match(comment, /MIT/);
  assert.match(comment, /80a514cfb6ac169ef311e70ea2b8a07b961416d8/);
  assert.match(comment, /icons\.tsx/);
  assert.match(comment, /Anthropic/);
  assert.match(comment, /OpenAI/);
  assert.match(comment, /商標/);

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const holders = walk('web').filter((p) => {
    const t = readFileSync(p, 'utf8');
    return t.includes(CLAUDE_D_HEAD) || t.includes(OPENAI_D_HEAD);
  });
  assert.deepEqual(holders, [join('web', 'embed', 'agent-marks-icons.js')]);
});

test('buildMarks：決めた項目だけを持つ印にする', () => {
  const wt = {
    id: 'wt',
    path: '/repo/a',
    title: '<script>x</script>',
    agents: [
      agent({
        id: 'a1',
        mark: 'working',
        agentType: 'claude',
        elapsedFrom: ago(5 * MIN),
        elapsedBasis: 'state',
        title: '秘密の題名',
        prompt: '本文',
      }),
    ],
  };
  const { marks, overflow } = buildMarks(wt, { now: NOW });
  assert.equal(overflow, null);
  assert.deepEqual(marks, [
    {
      id: 'a1',
      mark: 'working',
      workingMode: null,
      icon: 'claude',
      typeLabel: 'Claude',
      elapsed: '5m',
      label: 'Claude、作業中、この状態になって 5分',
      detail: '/embed/agent?id=a1',
    },
  ]);
});

test('buildMarks：種類、知らない状態、起点ごとの経過の文、detail の絞り込み', () => {
  const wt = {
    agents: [
      agent({
        id: 's',
        mark: 'sleeping',
        agentType: 'codex',
        elapsedFrom: ago(2 * HOUR),
        elapsedBasis: 'worktree-activity',
      }),
      agent({ id: 'u', mark: 'exploded', agentType: 'gemini', detail: 'javascript:alert(1)' }),
      agent({ id: 'n', mark: 'done', agentType: null, detail: null, elapsedFrom: 'bad', elapsedBasis: 'state' }),
      agent({ id: 'f', mark: 'done', agentType: 'claude-agent-teams', elapsedFrom: ago(-MIN), elapsedBasis: 'state' }),
      agent({ id: 'l', mark: 'done', agentType: 'x'.repeat(60), detail: 'https://example.invalid/embed/agent?id=l' }),
      agent({ id: 'now', mark: 'done', agentType: 'codex', elapsedFrom: ago(10 * SEC), elapsedBasis: 'state' }),
      agent({
        id: 'act',
        mark: 'sleeping',
        agentType: 'claude',
        elapsedFrom: ago(10 * SEC),
        elapsedBasis: 'worktree-activity',
      }),
      agent({ id: 'other', mark: 'done', agentType: 'codex', elapsedFrom: ago(73 * HOUR), elapsedBasis: 'odd' }),
    ],
  };
  const byId = Object.fromEntries(buildMarks(wt, { now: NOW, max: 10 }).marks.map((m) => [m.id, m]));
  assert.deepEqual(byId.s, {
    id: 's',
    mark: 'sleeping',
    workingMode: null,
    icon: 'codex',
    typeLabel: 'Codex',
    elapsed: '2h',
    label: 'Codex、スリープ、最後の活動から 2時間',
    detail: '/embed/agent?id=s',
  });
  assert.equal(byId.u.mark, 'unknown');
  assert.equal(byId.u.icon, 'other');
  assert.equal(byId.u.typeLabel, 'gemini');
  assert.equal(byId.u.label, 'gemini、不明');
  assert.equal(byId.u.detail, null);
  assert.equal(byId.n.icon, 'none');
  assert.equal(byId.n.typeLabel, 'エージェント');
  assert.equal(byId.n.elapsed, null);
  assert.equal(byId.n.label, 'エージェント、完了');
  assert.equal(byId.f.icon, 'claude');
  assert.equal(byId.f.elapsed, null);
  assert.equal(byId.l.typeLabel, 'x'.repeat(40));
  assert.equal(byId.l.detail, null);
  assert.equal(byId.now.elapsed, 'now');
  assert.equal(byId.now.label, 'Codex、完了、この状態になったばかり');
  assert.equal(byId.act.elapsed, 'now');
  assert.equal(byId.act.label, 'Claude、スリープ、最後の活動は1分未満前');
  assert.equal(byId.other.elapsed, '3d');
  assert.equal(byId.other.label, 'Codex、完了、経過 3日');
  // 読み上げの名前は読める形だけ。『今』も短い形（now・Nm・Nh・Nd）も含まない。
  for (const m of buildMarks(wt, { now: NOW, max: 10 }).marks) {
    assert.ok(!m.label.includes('今'), m.label);
    assert.ok(!/\d+[mhd]\b/.test(m.label), m.label);
    assert.ok(!/\bnow\b/.test(m.label), m.label);
  }
});

test('buildMarks：agents が配列でない、worktree がないときは空', () => {
  assert.deepEqual(buildMarks({ agents: 'x' }, { now: NOW }), { marks: [], overflow: null });
  assert.deepEqual(buildMarks(null, { now: NOW }), { marks: [], overflow: null });
  assert.deepEqual(buildMarks({}, { now: NOW }), { marks: [], overflow: null });
});

const at = (minute: number) => `2026-01-02T09:${String(minute).padStart(2, '0')}:00.000Z`;
const child = (id: string, parent: string | null, minute: number | null, patch: Record<string, unknown> = {}) =>
  agent({
    id,
    parent: parent === null ? null : { id: parent, worktreeId: 'wt' },
    startedAt: minute === null ? null : at(minute),
    ...patch,
  });
const order = (agents: unknown[]) => buildMarks({ agents }, { now: NOW, max: 50 }).marks.map((m) => m.id);

test('buildMarks：関係のない2人は startedAt の新しい順、時刻のないものは最後で要約の順', () => {
  assert.deepEqual(
    order([child('old', null, 1), child('none-1', null, null), child('new', null, 9), child('none-2', null, null)]),
    ['new', 'old', 'none-1', 'none-2'],
  );
  // 同じ時刻は要約の順
  assert.deepEqual(order([child('b', null, 5), child('a', null, 5)]), ['b', 'a']);
});

test('buildMarks：親 → 子 → 孫、兄弟は新しい順、別の worktree の親と見えない親の子は関係なし', () => {
  const agents = [
    child('grandchild', 'child-old', 8),
    child('child-old', 'root', 2),
    child('lonely-old', null, 1),
    child('remote-child', null, 30, { parent: { id: 'elsewhere', worktreeId: 'other-wt' } }),
    child('child-new', 'root', 6),
    child('unseen-child', null, 40, { parent: { id: null, worktreeId: null } }),
    child('root', null, 0),
    child('lonely-new', null, 20),
  ];
  assert.deepEqual(order(agents), [
    'unseen-child',
    'remote-child',
    'lonely-new',
    'lonely-old',
    'root',
    'child-new',
    'child-old',
    'grandchild',
  ]);
});

test('buildMarks：関係なしが左、関係ありが右。状態（blocked、sleeping など）は並びを変えない', () => {
  const agents = [
    child('kid', 'boss', 50, { mark: 'blocked' }),
    child('boss', null, 0, { mark: 'sleeping' }),
    child('free', null, 1, { mark: 'done' }),
    child('waiting', null, 2, { mark: 'waiting' }),
  ];
  assert.deepEqual(order(agents), ['waiting', 'free', 'boss', 'kid']);
});

test('buildMarks：輪と自分を指す親で止まらず、各エージェントが1回だけ出る', () => {
  const agents = [
    child('a', 'b', 1),
    child('b', 'a', 5),
    child('self', 'self', 3),
    child('root', null, 0),
    child('leaf', 'root', 2),
    child('c-child', 'a', 9),
  ];
  const ids = order(agents);
  assert.deepEqual(ids, ['self', 'root', 'leaf', 'c-child', 'b', 'a']);
  assert.equal(new Set(ids).size, agents.length);
});

test('buildMarks：parent・startedAt のない古い要約は要約の順', () => {
  const agents = ['z', 'b', 'q', 'a'].map((id, i) => agent({ id, mark: MARKS[i] }));
  assert.deepEqual(order(agents), ['z', 'b', 'q', 'a']);
});

test('buildMarks：形の違う parent・startedAt はないものとして並べる', () => {
  const agents = [
    agent({ id: 'p', startedAt: at(1) }),
    agent({ id: 'str-parent', parent: 'p', startedAt: at(30) }),
    agent({ id: 'num-id', parent: { id: 42 }, startedAt: 'not a date' }),
    agent({ id: 'arr', parent: ['p'], startedAt: 1_767_340_800_000 }),
    agent({ id: 'empty', parent: { id: '' }, startedAt: {} }),
    agent({ id: 'nul', parent: { id: null } }),
    null,
    'text',
  ];
  assert.deepEqual(order(agents), ['str-parent', 'p', 'num-id', 'arr', 'empty', 'nul', null, null]);
});

test('orderAgents：id が null と重複のものは表に入れず関係なし、元の配列を変えない', () => {
  const agents = [
    agent({ id: 'dup', startedAt: at(1) }),
    agent({ id: 'dup', parent: { id: 'p' }, startedAt: at(2) }),
    agent({ id: null, parent: { id: 'p' }, startedAt: at(3) }),
    agent({ id: 'p', startedAt: at(0) }),
    agent({ id: 'kid', parent: { id: 'dup' }, startedAt: at(4) }),
  ];
  const before = structuredClone(agents);
  const sorted = orderAgents(agents);
  assert.deepEqual(agents, before);
  assert.deepEqual(
    sorted.map((a) => [a.id, a.startedAt]),
    [
      [null, at(3)],
      ['dup', at(2)],
      ['p', at(0)],
      ['dup', at(1)],
      ['kid', at(4)],
    ],
  );
  assert.deepEqual(orderAgents('x'), []);
});

test('buildMarks：上限を越えたら新しい並びの先頭から max−1 人と残りの overflow', () => {
  const agents = [
    child('kid', 'boss', 9),
    child('boss', null, 0),
    child('a', null, 1),
    child('b', null, 2),
    child('c', null, 3),
  ];
  const { marks, overflow } = buildMarks({ agents }, { now: NOW, max: 4 });
  assert.deepEqual(
    marks.map((m) => m.id),
    ['c', 'b', 'a'],
  );
  assert.deepEqual(overflow, { count: 2, label: 'ほか 2 件' });
});

test('buildMarks：max を超えたら並べた後に先頭の max−1 個と overflow', () => {
  const agents = ['sleeping', 'sleeping', 'done', 'working', 'blocked', 'sleeping'].map((mark, i) =>
    agent({ id: `a${i}`, mark }),
  );
  const { marks, overflow } = buildMarks({ agents }, { now: NOW });
  assert.deepEqual(
    marks.map((m) => m.id),
    ['a0', 'a1', 'a2'],
  );
  assert.deepEqual(overflow, { count: 3, label: 'ほか 3 件' });

  const exact = buildMarks({ agents: agents.slice(0, 4) }, { now: NOW });
  assert.equal(exact.marks.length, 4);
  assert.equal(exact.overflow, null);

  const custom = buildMarks({ agents }, { now: NOW, max: 2 });
  assert.equal(custom.marks.length, 1);
  assert.deepEqual(custom.overflow, { count: 5, label: 'ほか 5 件' });
});

// lucide-react 0.577.0 の dist/esm/icons/activity.js の Activity の path と、defaultAttributes の線の属性。
const ACTIVITY_D =
  'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2';

test('T-22：状態の印の表の monitoring は lucide の Activity をそのまま写す', () => {
  assert.deepEqual(STATE_ICONS.monitoring, {
    label: 'バックグラウンドタスクを監視中',
    viewBox: '0 0 24 24',
    paths: [
      {
        d: ACTIVITY_D,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
    ],
  });
});

test('T-22：状態の印の表のすぐ上に lucide の出どころとライセンスがあり、d は web/ でこのファイルにだけある', () => {
  const iconsFile = 'web/embed/agent-marks-icons.js';
  const lines = readFileSync(iconsFile, 'utf8').split('\n');
  const at = lines.findIndex((l) => l.startsWith('export const STATE_ICONS'));
  assert.ok(at > 0);
  const comment = lines[at - 1] ?? '';
  assert.match(comment, /^\/\//);
  assert.match(comment, /lucide/);
  assert.match(comment, /ISC/);
  assert.match(comment, /lucide-react 0\.577\.0/);
  assert.match(comment, /AgentStateDot/);

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const holders = walk('web').filter((p) => readFileSync(p, 'utf8').includes('M22 12h-2.48a2 2 0 0 0-1.93'));
  assert.deepEqual(holders, [join('web', 'embed', 'agent-marks-icons.js')]);
});

test('T-22：monitoring は mark working・workingMode monitoring、状態の言葉だけが変わり、経過は working と同じ', () => {
  const wt = {
    agents: [
      agent({ id: 'm', workingMode: 'monitoring', elapsedFrom: ago(5 * MIN), elapsedBasis: 'state' }),
      agent({ id: 'w', workingMode: null, elapsedFrom: ago(5 * MIN), elapsedBasis: 'state' }),
      agent({ id: 'odd', workingMode: 'something-new', elapsedFrom: ago(5 * MIN), elapsedBasis: 'state' }),
      agent({ id: 'd', mark: 'done', workingMode: 'monitoring' }),
      agent({ id: 'missing' }),
    ],
  };
  const byId = Object.fromEntries(buildMarks(wt, { now: NOW, max: 10 }).marks.map((m) => [m.id, m]));
  assert.deepEqual(byId.m, {
    id: 'm',
    mark: 'working',
    workingMode: 'monitoring',
    icon: 'claude',
    typeLabel: 'Claude',
    elapsed: '5m',
    label: 'Claude、バックグラウンドタスクを監視中、この状態になって 5分',
    detail: '/embed/agent?id=m',
  });
  assert.equal(byId.w.workingMode, null);
  assert.equal(byId.w.label, 'Claude、作業中、この状態になって 5分');
  assert.equal(byId.odd.workingMode, null);
  assert.equal(byId.odd.label, 'Claude、作業中、この状態になって 5分');
  assert.equal(byId.d.workingMode, null);
  assert.equal(byId.d.label, 'Claude、完了');
  assert.equal(byId.missing.workingMode, null);
  // 状態は並びを変えない（要約の順）。
  assert.deepEqual(
    buildMarks(wt, { now: NOW, max: 10 }).marks.map((m) => m.id),
    ['m', 'w', 'odd', 'd', 'missing'],
  );
});

// resources/logo.svg（v1.4.258、c91a7a6ee3dc76090cafb33943961ae2235246d6）の d の SHA-256。
test('APP_ICONS.orca は上流の path をそのまま持ち、出どころと商標を記す', async () => {
  const icons = await import('../../web/embed/agent-marks-icons.js');
  const apps = Reflect.get(icons, 'APP_ICONS');
  assert.ok(apps, 'APP_ICONS を export する');
  assert.equal(apps.orca.label, 'Orca');
  assert.equal(apps.orca.viewBox, '6.6666669 70.666669 318.60232 202.66667');
  assert.equal(apps.orca.paths.length, 1);
  const path = first(apps.orca.paths);
  assert.equal(
    createHash('sha256').update(path.d).digest('hex'),
    'cf0ed532d447f68ee1e3296c4e56a5b448266e80dff4ef8cc9e0d6f165ac9b70',
  );
  assert.deepEqual(Object.keys(path).sort(), ['d', 'fill']);
  assert.equal(path.fill, 'currentColor');
  const source = readFileSync('web/embed/agent-marks-icons.js', 'utf8');
  const comment = source.split('export const APP_ICONS')[0]?.trim().split('\n').at(-1) ?? '';
  for (const word of [
    '//',
    'stablyai/orca',
    'resources/logo.svg',
    'v1.4.258',
    'c91a7a6ee3dc76090cafb33943961ae2235246d6',
    'MIT',
    'Orca',
    'Lovecast Inc.',
    '商標',
  ])
    assert.ok(comment.includes(word), word);
});
