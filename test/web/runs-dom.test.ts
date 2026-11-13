import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderRunList, renderTree } from '../../web/runs-dom.js';
import { buildRunListView, buildTreeView } from '../../web/runs-view.js';

/** 小さな偽の要素。textContent だけを文字として持ち、HTML を解く口を使うと失敗する。 */
class FakeElement {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly styleProps: Record<string, string> = {};
  readonly style = {
    setProperty: (name: string, value: string) => {
      this.styleProps[name] = value;
    },
  };
  className = '';
  href = '';
  rel = '';
  target = '';
  #text = '';

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  set textContent(value: string) {
    this.#text = String(value);
    this.children.length = 0;
  }

  get textContent(): string {
    return this.#text + this.children.map((c) => c.textContent).join('');
  }

  set innerHTML(_value: string) {
    throw new Error('innerHTML must not be used');
  }

  set outerHTML(_value: string) {
    throw new Error('outerHTML must not be used');
  }

  insertAdjacentHTML(): void {
    throw new Error('insertAdjacentHTML must not be used');
  }

  setAttribute(): void {
    throw new Error('setAttribute is not expected');
  }

  append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') throw new Error('append a string is not expected');
      this.children.push(node);
    }
  }

  all(): FakeElement[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}

const fakeDocument = {
  createElement: (tag: string) => new FakeElement(tag),
  write() {
    throw new Error('document.write must not be used');
  },
};

const DANGER = '<script>alert(1)</script><img src=x onerror=alert(2)>';
const ALLOWED = new Set(['UL', 'LI', 'DIV', 'SPAN', 'P', 'A']);
const fresh = { lastSuccessAt: null, stale: false, error: null };
const sources = { runs: fresh, tasks: fresh, workers: fresh, workerLaunch: fresh, tabs: fresh, terminals: fresh };

function node(patch: Record<string, unknown>) {
  return {
    id: 'n',
    role: 'worker',
    dispatchId: null,
    taskId: null,
    title: DANGER,
    issue: null,
    agentId: null,
    agentType: DANGER,
    model: null,
    effort: null,
    state: DANGER,
    since: null,
    project: { id: 'p', name: DANGER },
    worktreeId: null,
    otherProject: true,
    orphan: true,
    links: { detail: null },
    children: [],
    ...patch,
  };
}

function dangerousTree(coordinatorResolvedBy: 'run' | 'latest-task' | null = null) {
  const doc = {
    schema: 'orca-web.run-tree/v1',
    generatedAt: '2026-01-02T10:00:00.000Z',
    stale: false,
    connection: { state: 'connected', reason: null, checkedAt: null },
    sources,
    run: { id: 'run-a', title: DANGER, coordinatorProject: null, coordinatorResolvedBy },
    root: node({
      id: 'coordinator:run-a',
      role: 'coordinator',
      otherProject: false,
      orphan: false,
      project: null,
      links: { detail: '/embed/agent?id=root' },
      children: [
        node({ id: 'w1', links: { detail: '/embed/agent?id=a%3Cb' }, children: [node({ id: 'w2' })] }),
        node({ id: 'w3', links: { detail: 'javascript:alert(1)' } }),
      ],
    }),
    counts: { nodes: 4, workers: 3, otherProject: 3, orphan: 3 },
  };
  return buildTreeView(doc as never, { now: 0, formatTime: (s: string) => s });
}

test('最近の依頼から決めた統括の根だけに、小さな添え書きを描く', () => {
  for (const resolvedBy of ['latest-task', 'run', null] as const) {
    const ul = renderTree(fakeDocument, dangerousTree(resolvedBy).rows) as unknown as FakeElement;
    const notes = ul.all().filter((el) => el.tagName === 'SMALL');
    assert.equal(notes.length, resolvedBy === 'latest-task' ? 1 : 0);
    if (resolvedBy === 'latest-task') {
      assert.equal(notes[0]?.textContent, '最近の依頼から決めた統括');
      assert.ok(ul.children[0]?.all().includes(notes[0] as FakeElement));
      assert.ok(ul.children.slice(1).every((li) => !li.textContent.includes('最近の依頼から決めた統括')));
    }
  }
});

test('木の行は textContent だけで描き、<script> の題名やプロジェクト名が要素にならず、字下げを --depth で持つ', () => {
  const ul = renderTree(fakeDocument, dangerousTree().rows) as unknown as FakeElement;
  assert.equal(ul.tagName, 'UL');
  const all = ul.all();
  for (const el of all) assert.ok(ALLOWED.has(el.tagName), el.tagName);
  assert.ok(ul.textContent.includes(DANGER));
  const items = ul.children;
  assert.deepEqual(
    items.map((li) => [li.dataset.key, li.styleProps['--depth']]),
    [
      ['coordinator:run-a', '0'],
      ['w1', '1'],
      ['w2', '2'],
      ['w3', '1'],
    ],
  );
  assert.equal(items[0]?.dataset.role, 'coordinator');
  // 札は点線の枠の要素に、名前を文字で出す。統括と札のない節には付けない。
  const badges = (li: FakeElement) => li.all().filter((e) => e.className === 'badge');
  assert.equal(badges(items[0] as FakeElement).length, 0);
  assert.equal(badges(items[1] as FakeElement)[0]?.textContent, DANGER);
  assert.ok(items[1]?.all().some((e) => e.className === 'orphan' && e.textContent === '親が分からない'));
  // 統括の節もプロジェクトの列を持ち、null は「—」。
  assert.ok(items[0]?.all().some((e) => e.className === 'project-name' && e.textContent === '—'));
});

test('リンクの href は /runs/<encodeURIComponent(id)> と /embed/agent?id=… だけ', () => {
  const tree = renderTree(fakeDocument, dangerousTree().rows) as unknown as FakeElement;
  const treeLinks = tree.all().filter((e) => e.tagName === 'A');
  assert.deepEqual(
    treeLinks.map((a) => a.href),
    ['/embed/agent?id=root', '/embed/agent?id=a%3Cb'],
  );
  for (const a of treeLinks) {
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer');
  }

  const listView = buildRunListView(
    {
      schema: 'orca-web.runs/v1',
      generatedAt: '2026-01-02T10:00:00.000Z',
      stale: false,
      connection: { state: 'connected', reason: null, checkedAt: null },
      sources,
      project: { id: 'p', name: DANGER },
      projects: [],
      runs: [
        {
          id: 'run/<x>',
          title: DANGER,
          coordinatorProject: { id: 'q', name: DANGER },
          projects: [{ id: 'p', name: DANGER }],
          workers: 2,
          otherProject: 1,
          active: 1,
          latestTaskAt: null,
          fromOtherProject: { id: 'q', name: DANGER },
        },
      ],
    } as never,
    { project: 'p' },
  );
  const list = renderRunList(fakeDocument, listView.rows, 'なし') as unknown as FakeElement;
  for (const el of list.all()) assert.ok(ALLOWED.has(el.tagName), el.tagName);
  const links = list.all().filter((e) => e.tagName === 'A');
  assert.deepEqual(
    links.map((a) => a.href),
    ['/runs/run%2F%3Cx%3E'],
  );
  assert.equal(links[0]?.textContent, DANGER);
  assert.ok(list.all().some((e) => e.className === 'from' && e.textContent === `${DANGER} の統括から`));
  assert.ok(list.textContent.includes(`統括のプロジェクト：${DANGER}`));

  const empty = renderRunList(fakeDocument, [], 'この条件の Run はありません') as unknown as FakeElement;
  assert.equal(empty.tagName, 'P');
  assert.equal(empty.textContent, 'この条件の Run はありません');
});
