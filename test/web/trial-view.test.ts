import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorktreeSummary, WorktreeSummaryDocument } from '../../src/summary/model.ts';
import { buildTrialView as build, detailUrl, orcaBase } from '../../web/trial/trial-view.js';

// biome-ignore lint/suspicious/noExplicitAny: the view is an untyped JS object
const buildTrialView = (doc: unknown, options: Parameters<typeof build>[1]): any => build(doc, options);

const NOW = Date.parse('2026-11-14T10:00:00.000Z');

function counts(partial: Partial<WorktreeSummary['counts']> = {}): WorktreeSummary['counts'] {
  const base = { working: 0, blocked: 0, waiting: 0, done: 0, sleeping: 0, unknown: 0, ...partial };
  const total = base.working + base.blocked + base.waiting + base.done + base.sleeping + base.unknown;
  return { ...base, total };
}

function worktree(overrides: Partial<WorktreeSummary> = {}): WorktreeSummary {
  return {
    id: 'repo-a::/work/repo-a/iss-1',
    path: '/work/repo-a/iss-1',
    branch: 'iss-1',
    project: { id: 'repo-a', name: 'プロジェクトA' },
    issue: 'iss-1',
    counts: counts({ working: 1 }),
    agents: [
      {
        id: 'tab-1:leaf-1',
        mark: 'working',
        agentType: 'claude',
        since: '2026-11-14T09:48:00.000Z',
        detail: '/embed/agent?id=tab-1%3Aleaf-1',
      },
    ],
    ...overrides,
  };
}

function summary(
  worktrees: WorktreeSummary[],
  overrides: Partial<WorktreeSummaryDocument> = {},
): WorktreeSummaryDocument {
  return {
    schema: 'orca-web.worktree-summary/v1',
    generatedAt: '2026-11-14T10:00:00.000Z',
    stale: false,
    connection: { state: 'connected', checkedAt: '2026-11-14T10:00:00.000Z' },
    worktrees,
    ...overrides,
  };
}

test('send-test の節が先頭に来て、ほかは要約の順のまま', () => {
  const doc = summary([
    worktree({ id: 'a', path: '/work/x/alpha' }),
    worktree({ id: 'b', path: '/work/x/beta' }),
    worktree({ id: 'c', path: '/work/x/send-test' }),
    worktree({ id: 'd', path: '/work/x/delta' }),
  ]);
  const view = buildTrialView(doc, { highlight: 'send-test', now: NOW });
  assert.deepEqual(
    view.sections.map((s: { name: string }) => s.name),
    ['send-test', 'alpha', 'beta', 'delta'],
  );
  assert.equal(view.sections[0].highlight, true);
  assert.equal(view.sections[1].highlight, false);
});

test('節の名前はパスの末尾、ブランチ、プロジェクト名、数は counts から', () => {
  const doc = summary([
    worktree({
      path: '/work/repo-a/iss-1/',
      counts: counts({ working: 2, waiting: 1, sleeping: 1 }),
    }),
  ]);
  const [section] = buildTrialView(doc, { highlight: 'send-test', now: NOW }).sections;
  assert.equal(section.name, 'iss-1');
  assert.equal(section.branch, 'iss-1');
  assert.equal(section.project, 'プロジェクトA');
  assert.equal(section.total, 4);
  assert.deepEqual(
    section.counts.map((c: { mark: string; count: number }) => [c.mark, c.count]),
    [
      ['working', 2],
      ['waiting', 1],
      ['sleeping', 1],
    ],
  );
  assert.ok(section.counts.every((c: { label: string }) => typeof c.label === 'string' && c.label !== ''));
});

test('パスがなければ名前は id、ブランチとプロジェクトがなければ null', () => {
  const doc = summary([worktree({ path: null, branch: null, project: null })]);
  const [section] = buildTrialView(doc, { highlight: 'send-test', now: NOW }).sections;
  assert.equal(section.name, 'repo-a::/work/repo-a/iss-1');
  assert.equal(section.branch, null);
  assert.equal(section.project, null);
});

test('丸は id・mark・種類・経過・detail を持ち、知らない mark は unknown', () => {
  const doc = summary([
    worktree({
      agents: [
        {
          id: 'tab-1:leaf-1',
          mark: 'working',
          agentType: 'codex',
          since: '2026-11-14T09:48:00.000Z',
          detail: '/embed/agent?id=tab-1%3Aleaf-1',
        },
        // biome-ignore lint/suspicious/noExplicitAny: an unknown mark from a newer server
        { id: 'chat:t2', mark: 'flying' as any, agentType: null, since: null, detail: '/embed/agent?id=chat%3At2' },
      ],
    }),
  ]);
  const [section] = buildTrialView(doc, { highlight: 'send-test', now: NOW }).sections;
  const [first, second] = section.agents;
  assert.equal(first.id, 'tab-1:leaf-1');
  assert.equal(first.mark, 'working');
  assert.equal(first.agentType, 'codex');
  assert.equal(first.elapsed, '12分');
  assert.equal(first.detail, '/embed/agent?id=tab-1%3Aleaf-1');
  assert.ok(first.markLabel);
  assert.equal(second.mark, 'unknown');
  assert.equal(second.elapsed, null);
  assert.equal(second.agentType, null);
});

test('detail が /embed/agent?id= で始まらなければ丸の detail は null', () => {
  const doc = summary([
    worktree({
      agents: [
        { id: 'x', mark: 'done', agentType: null, since: null, detail: 'https://evil.example/embed/agent?id=x' },
      ],
    }),
  ]);
  const [section] = buildTrialView(doc, { highlight: 'send-test', now: NOW }).sections;
  assert.equal(section.agents[0].detail, null);
});

test('開くボタンには worktree の id、なければパスを使う', () => {
  const doc = summary([
    worktree({ id: 'wt-1', path: '/work/a' }),
    // biome-ignore lint/suspicious/noExplicitAny: the id may be missing in a malformed document
    worktree({ id: '' as any, path: '/work/b' }),
    // biome-ignore lint/suspicious/noExplicitAny: both missing
    worktree({ id: null as any, path: null }),
  ]);
  const view = buildTrialView(doc, { highlight: 'send-test', now: NOW });
  assert.deepEqual(
    view.sections.map((s: { openTarget: string | null }) => s.openTarget),
    ['wt-1', '/work/b', null],
  );
});

test('stale と connection が connected でないときは帯の文を返し、そうでなければ null', () => {
  assert.equal(buildTrialView(summary([]), { highlight: 'send-test', now: NOW }).banner, null);
  const stale = buildTrialView(summary([], { stale: true }), { highlight: 'send-test', now: NOW });
  assert.equal(typeof stale.banner, 'string');
  const unreachable = buildTrialView(summary([], { connection: { state: 'unreachable', checkedAt: null } }), {
    highlight: 'send-test',
    now: NOW,
  });
  assert.equal(typeof unreachable.banner, 'string');
  assert.notEqual(unreachable.banner, stale.banner);
  const starting = buildTrialView(summary([], { connection: { state: 'starting', checkedAt: null } }), {
    highlight: 'send-test',
    now: NOW,
  });
  assert.equal(typeof starting.banner, 'string');
});

test('形の違う文書は空の節と帯の文にする', () => {
  const view = buildTrialView({ schema: 'other' }, { highlight: 'send-test', now: NOW });
  assert.deepEqual(view.sections, []);
  assert.equal(typeof view.banner, 'string');
  assert.equal(typeof buildTrialView(null, { highlight: 'send-test', now: NOW }).banner, 'string');
});

test('題名や本文の項目を返さない', () => {
  const doc = summary([
    {
      ...worktree(),
      // biome-ignore lint/suspicious/noExplicitAny: extra fields that a summary must not leak
      ...({ title: 'SECRET-TITLE', displayName: 'SECRET-NAME' } as any),
      agents: [
        {
          ...worktree().agents[0],
          // biome-ignore lint/suspicious/noExplicitAny: extra fields that a summary must not leak
          ...({ title: 'SECRET-TAB', lastAssistantMessage: 'SECRET-BODY', prompt: 'SECRET-PROMPT' } as any),
        },
      ],
    },
  ]);
  const json = JSON.stringify(buildTrialView(doc, { highlight: 'send-test', now: NOW }));
  assert.doesNotMatch(json, /SECRET/);
});

test('orcaBase は開いた名前と orcaPort から基の URL を作る', () => {
  assert.equal(orcaBase('127.0.0.1', 8792), 'http://127.0.0.1:8792');
  assert.equal(orcaBase('100.64.0.1', 8792), 'http://100.64.0.1:8792');
});

test('detailUrl は基の URL に detail と theme を付ける', () => {
  assert.equal(
    detailUrl('http://127.0.0.1:8792', '/embed/agent?id=tab-1%3Aleaf-1', 'dark'),
    'http://127.0.0.1:8792/embed/agent?id=tab-1%3Aleaf-1&theme=dark',
  );
  assert.equal(
    detailUrl('http://127.0.0.1:8792', '/embed/agent?id=a', 'other'),
    'http://127.0.0.1:8792/embed/agent?id=a',
  );
});
