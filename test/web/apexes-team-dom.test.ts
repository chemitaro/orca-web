import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ApexTeamNode } from '../../src/apex/model.ts';
import { readTeamState, renderTeamBand, revealTeamNode } from '../../web/apexes-team-dom.js';
import { buildTeamBand } from '../../web/apexes-team-view.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NOW = Date.parse('2026-01-02T12:00:00.000Z');
const DANGER = '<script>alert(1)</script><img src=x onerror=alert(2)>';

/** 小さな偽の要素。textContent だけを文字として持ち、HTML を解く口を使うと失敗する。 */
class FakeElement {
  readonly tagName: string;
  readonly namespaceURI: string | null;
  readonly attrs: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  className = '';
  title = '';
  href = '';
  rel = '';
  target = '';
  open = false;
  type = '';
  #text = '';

  constructor(tag: string, ns: string | null = null) {
    this.namespaceURI = ns;
    this.tagName = ns === SVG_NS ? tag : tag.toUpperCase();
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

  setAttribute(name: string, value: string): void {
    if (this.namespaceURI !== SVG_NS && name !== 'aria-label') throw new Error('setAttribute is not expected');
    this.attrs[name] = String(value);
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
  createElementNS: (ns: string, tag: string) => new FakeElement(tag, ns),
};

function node(key: string, patch: Partial<ApexTeamNode> = {}): ApexTeamNode {
  const kind = key.startsWith('agent:') ? 'agent' : 'dispatch';
  return {
    key,
    kind,
    agentId: kind === 'agent' ? key.slice(6) : null,
    dispatchId: kind === 'dispatch' ? key.slice(9) : 'd-of-agent',
    parentKey: null,
    depth: 1,
    title: DANGER,
    status: 'done',
    createdAt: '2026-01-02T10:00:00.000Z',
    completedAt: null,
    stateStartedAt: kind === 'agent' ? '2026-01-02T11:00:00.000Z' : null,
    ...patch,
  };
}

function band() {
  const team = [
    node('agent:lead', { status: 'working' }),
    node('dispatch:ok', { parentKey: 'agent:lead', depth: 2 }),
    node('dispatch:old', {}),
  ];
  return buildTeamBand({ team }, NOW);
}

test('T-03: 帯は details で、innerHTML を使わず文字のまま描き、決めた要素だけを作る', () => {
  const root = renderTeamBand(fakeDocument, band()) as FakeElement;
  assert.equal(root.tagName, 'DETAILS');
  assert.equal(root.open, false);
  const allowed = new Set(['DETAILS', 'SUMMARY', 'DIV', 'UL', 'LI', 'SPAN', 'A', 'BUTTON']);
  for (const el of root.all()) assert.ok(allowed.has(el.tagName), `unexpected ${el.tagName}`);
  assert.equal(root.children[0]?.tagName, 'SUMMARY');
  assert.equal(root.children[0]?.textContent, 'チーム 3（作業中 1・待ち 0・完了 2・失敗 0）');
  assert.ok(root.textContent.includes(DANGER));
});

test('T-03: チームのない頂点では帯がない', () => {
  assert.equal(renderTeamBand(fakeDocument, null), null);
  assert.equal(renderTeamBand(fakeDocument, buildTeamBand({ team: [] }, NOW)), null);
});

test('T-03: エージェントの節は /embed/agent?id= を _blank・noopener noreferrer で開くリンク', () => {
  const root = renderTeamBand(fakeDocument, band()) as FakeElement;
  const links = root.all().filter((el) => el.tagName === 'A');
  assert.deepEqual(
    links.map((a) => a.href),
    ['/embed/agent?id=lead'],
  );
  for (const a of links) {
    assert.equal(a.target, '_blank');
    assert.equal(a.rel, 'noopener noreferrer');
  }
});

test('T-03: 履歴の帯は Dispatch ごとに1つの四角のボタンで、押す先の節の鍵を持つ', () => {
  const root = renderTeamBand(fakeDocument, band()) as FakeElement;
  const cells = root.all().filter((el) => el.dataset.teamTarget !== undefined);
  assert.deepEqual(
    cells.map((cell) => [cell.tagName, cell.dataset.teamTarget]),
    [
      ['BUTTON', 'agent:lead'],
      ['BUTTON', 'dispatch:ok'],
      ['BUTTON', 'dispatch:old'],
    ],
  );
  assert.ok(cells[0]?.className.includes('team-cell--working'));
  assert.equal(cells[0]?.attrs['aria-label'], `${DANGER}（作業中）`);
});

test('T-03: 開いた帯とまとめは描き直しても開いたまま。履歴から押すと、まとめを開いてその節を返す', () => {
  const first = renderTeamBand(fakeDocument, band()) as FakeElement;
  assert.deepEqual(readTeamState(first), { open: false, groups: [] });
  const target = revealTeamNode(first, 'dispatch:ok') as FakeElement;
  assert.equal(target.dataset.teamKey, 'dispatch:ok');
  assert.equal(first.open, true);
  const state = readTeamState(first);
  assert.deepEqual(state, { open: true, groups: ['done:agent:lead'] });
  const second = renderTeamBand(fakeDocument, band(), state) as FakeElement;
  assert.equal(second.open, true);
  const groups = second.all().filter((el) => el.dataset.teamGroup !== undefined);
  assert.deepEqual(
    groups.map((g) => [g.dataset.teamGroup, g.open]),
    [
      ['done:agent:lead', true],
      ['done:apex', false],
    ],
  );
  assert.equal(revealTeamNode(second, 'dispatch:none'), null);
});
