import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkSelection, DEFAULT_SELECTED } from '../../src/state/fields.ts';
import { SettingsStore } from '../../src/state/settings.ts';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-web-settings-'));
  try {
    await fn(dir);
  } finally {
    await chmod(dir, 0o700).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}

test('ファイルがなければ既定の選択、保存した選択は作り直した SettingsStore でも残る', async () => {
  await withDir(async (dir) => {
    const file = path.join(dir, 'nested', 'settings.json');
    const a = new SettingsStore(file);
    await a.load();
    assert.deepEqual(a.selected, DEFAULT_SELECTED);
    assert.deepEqual(a.info, { source: 'default', error: null });
    await a.saveSelected(['agent.model', 'worktree.branch']);
    assert.deepEqual(a.selected, ['agent.model', 'worktree.branch']);
    const b = new SettingsStore(file);
    await b.load();
    assert.deepEqual(b.selected, ['agent.model', 'worktree.branch']);
    assert.deepEqual(b.info, { source: 'file', error: null });
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), {
      version: 1,
      fields: ['agent.model', 'worktree.branch'],
    });
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal((await stat(path.dirname(file))).mode & 0o777, 0o700);
  });
});

test('壊れたファイル、形の違うファイルは既定の選択と理由になり、知らない識別子は読み飛ばす', async () => {
  await withDir(async (dir) => {
    const file = path.join(dir, 'settings.json');
    await writeFile(file, '{not json');
    const a = new SettingsStore(file);
    await a.load();
    assert.deepEqual(a.selected, DEFAULT_SELECTED);
    assert.equal(a.info.source, 'default');
    assert.match(a.info.error ?? '', /not valid JSON/);

    await writeFile(file, JSON.stringify({ version: 1, fields: 'x' }));
    await a.load();
    assert.deepEqual(a.selected, DEFAULT_SELECTED);
    assert.match(a.info.error ?? '', /unknown shape/);

    await writeFile(file, JSON.stringify({ version: 1, fields: ['agent.model', 'agent.nope', 3] }));
    await a.load();
    assert.deepEqual(a.selected, ['agent.model']);
    assert.equal(a.info.source, 'file');
  });
});

test('書けない場所では saveSelected が誤りを投げ、メモリーの選択は変わらない', async () => {
  await withDir(async (dir) => {
    const locked = path.join(dir, 'locked');
    await mkdir(locked);
    await chmod(locked, 0o500);
    const store = new SettingsStore(path.join(locked, 'settings.json'));
    await store.load();
    await assert.rejects(store.saveSelected(['agent.model']), /cannot save settings/);
    assert.deepEqual(store.selected, DEFAULT_SELECTED);
  });
});

test('checkSelection は配列でない値、知らない識別子、重複、文字列でない値を拒む', () => {
  assert.deepEqual(checkSelection(['agent.model']), { ok: true, selected: ['agent.model'] });
  assert.deepEqual(checkSelection([]), { ok: true, selected: [] });
  assert.equal(checkSelection('agent.model').ok, false);
  assert.equal(checkSelection(['agent.nope']).ok, false);
  assert.equal(checkSelection(['agent.model', 'agent.model']).ok, false);
  assert.equal(checkSelection([1]).ok, false);
});
