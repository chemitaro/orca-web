import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AGENT_ICONS, iconKey } from '../../web/embed/agent-marks-icons.js';
import { buildMarks, findWorktree, formatElapsed, MARK_LABELS, MARKS } from '../../web/embed/agent-marks-view.js';

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

test('formatElapsed：境目で今・分・時間・日に切り捨てる', () => {
  assert.equal(formatElapsed(ago(0), NOW), '今');
  assert.equal(formatElapsed(ago(59 * SEC), NOW), '今');
  assert.equal(formatElapsed(ago(60 * SEC), NOW), '1分');
  assert.equal(formatElapsed(ago(59 * MIN + 59 * SEC), NOW), '59分');
  assert.equal(formatElapsed(ago(60 * MIN), NOW), '1時間');
  assert.equal(formatElapsed(ago(23 * HOUR + 59 * MIN), NOW), '23時間');
  assert.equal(formatElapsed(ago(24 * HOUR), NOW), '1日');
  assert.equal(formatElapsed(ago(73 * HOUR), NOW), '3日');
});

test('formatElapsed：未来、解けない文字、文字でない値、now が数でないときは null', () => {
  assert.equal(formatElapsed(ago(-1 * SEC), NOW), null);
  assert.equal(formatElapsed('not a time', NOW), null);
  assert.equal(formatElapsed('', NOW), null);
  assert.equal(formatElapsed(null, NOW), null);
  assert.equal(formatElapsed(NOW - MIN, NOW), null);
  assert.equal(formatElapsed(ago(MIN), String(NOW)), null);
  assert.equal(formatElapsed(ago(MIN), Number.NaN), null);
  assert.equal(formatElapsed(ago(MIN), undefined), null);
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
      icon: 'claude',
      typeLabel: 'Claude',
      elapsed: '5分',
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
    ],
  };
  const byId = Object.fromEntries(buildMarks(wt, { now: NOW, max: 10 }).marks.map((m) => [m.id, m]));
  assert.deepEqual(byId.s, {
    id: 's',
    mark: 'sleeping',
    icon: 'codex',
    typeLabel: 'Codex',
    elapsed: '2時間',
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
  assert.equal(byId.now.elapsed, '今');
  assert.equal(byId.now.label, 'Codex、完了、この状態になったばかり');
});

test('buildMarks：agents が配列でない、worktree がないときは空', () => {
  assert.deepEqual(buildMarks({ agents: 'x' }, { now: NOW }), { marks: [], overflow: null });
  assert.deepEqual(buildMarks(null, { now: NOW }), { marks: [], overflow: null });
  assert.deepEqual(buildMarks({}, { now: NOW }), { marks: [], overflow: null });
});

test('buildMarks：いつも要対応・working・unknown・done・sleeping の順に安定に並べる', () => {
  const wt = {
    agents: [
      agent({ id: 's1', mark: 'sleeping' }),
      agent({ id: 'd1', mark: 'done' }),
      agent({ id: 'w1', mark: 'working' }),
      agent({ id: 'q1', mark: 'waiting' }),
      agent({ id: 'u1', mark: 'unknown' }),
      agent({ id: 'b1', mark: 'blocked' }),
      agent({ id: 'w2', mark: 'working' }),
      agent({ id: 'q2', mark: 'waiting' }),
    ],
  };
  const ids = buildMarks(wt, { now: NOW, max: 20 }).marks.map((m) => m.id);
  assert.deepEqual(ids, ['q1', 'b1', 'q2', 'w1', 'w2', 'u1', 'd1', 's1']);
  // max 以下でも並べ替える
  const two = buildMarks(
    { agents: [agent({ id: 's', mark: 'sleeping' }), agent({ id: 'b', mark: 'blocked' })] },
    { now: NOW },
  );
  assert.deepEqual(
    two.marks.map((m) => m.id),
    ['b', 's'],
  );
});

test('buildMarks：max を超えたら並べ替えた後に先頭の max−1 個と overflow', () => {
  const agents = ['sleeping', 'sleeping', 'done', 'working', 'blocked', 'sleeping'].map((mark, i) =>
    agent({ id: `a${i}`, mark }),
  );
  const { marks, overflow } = buildMarks({ agents }, { now: NOW });
  assert.deepEqual(
    marks.map((m) => m.id),
    ['a4', 'a3', 'a2'],
  );
  assert.deepEqual(overflow, { count: 3, label: 'ほか 3 件' });

  const exact = buildMarks({ agents: agents.slice(0, 4) }, { now: NOW });
  assert.equal(exact.marks.length, 4);
  assert.equal(exact.overflow, null);

  const custom = buildMarks({ agents }, { now: NOW, max: 2 });
  assert.equal(custom.marks.length, 1);
  assert.deepEqual(custom.overflow, { count: 5, label: 'ほか 5 件' });
});
