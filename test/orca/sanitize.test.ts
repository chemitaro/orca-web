import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { CliRecording, Recording, RpcRecording } from '../../src/orca/replay/recording.ts';
import { assertRecordingSafe, isSafeString, Pseudonymizer, sanitizeRecording } from '../../src/orca/replay/sanitize.ts';

const HOME = '/Users/someone';
const U1 = '0b9c1f2e-1111-4a2b-8c3d-aaaaaaaaaaaa';
const U2 = '7f00aa11-2222-4b3c-9d4e-bbbbbbbbbbbb';
const WT = `${U1}::${HOME}/workspace/repo/worktrees/feature`;

test('Pseudonymizer は同じ ID を同じ仮名にし、合成の ID の中の対応も保つ', () => {
  const p = new Pseudonymizer();
  const tab = p.value(U1, 'tabId') as string;
  const leaf = p.value(U2, 'leafId') as string;
  assert.notEqual(tab, U1);
  assert.notEqual(tab, leaf);
  assert.equal(p.value(U1, 'id'), tab);
  assert.equal(p.value(`${U1}:${U2}`, 'paneKey'), `${tab}:${leaf}`);
  assert.equal(p.value(`term_${U2}`, 'handle'), `term_${leaf}`);
  assert.equal(p.value('task_a7d0530fc996', 'taskId'), p.value('task_a7d0530fc996', 'id'));
  assert.notEqual(p.value('task_a7d0530fc996', 'taskId'), 'task_a7d0530fc996');
});

test('Pseudonymizer はパスを区切りごとに置き換え、親子（前方一致）を保つ', () => {
  const p = new Pseudonymizer();
  const parent = p.value(`${HOME}/workspace/repo`, 'path') as string;
  const child = p.value(`${HOME}/workspace/repo/worktrees/feature`, 'path') as string;
  const other = p.value(`${HOME}/workspace/other`, 'path') as string;
  assert.ok(!parent.includes('someone') && !child.includes('workspace'));
  assert.ok(child.startsWith(`${parent}/`));
  assert.ok(!other.startsWith(`${parent}/`));
  assert.equal(p.value(WT, 'worktreeId'), `${p.value(U1, 'repoId')}::${child}`);
});

test('Pseudonymizer は自由な文を text-N にし、同じ文は同じ仮名、短い列挙の値は残す', () => {
  const p = new Pseudonymizer();
  const a = p.value('please fix the login bug', 'prompt');
  assert.match(String(a), /^text-\d+$/);
  assert.equal(p.value('please fix the login bug', 'title'), a);
  assert.match(String(p.value('fix', 'prompt')), /^text-\d+$/);
  assert.equal(p.value('working', 'state'), 'working');
  assert.equal(p.value('claude-opus-5-5', 'model'), 'claude-opus-5-5');
  assert.equal(p.value('agent-session.saved-resume-origin.v1', 'capability'), 'agent-session.saved-resume-origin.v1');
  assert.match(String(p.value('a sentence with spaces in a non text key', 'state')), /^text-\d+$/);
  assert.equal(p.value(1730000000000, 'updatedAt'), 1730000000000);
});

test('Pseudonymizer は Orca の時刻の文字列（SQLite と ISO 8601）を残し、時刻に似た文は残さない', () => {
  const p = new Pseudonymizer();
  assert.equal(p.value('2026-11-06 09:00:00', 'created_at'), '2026-11-06 09:00:00');
  assert.equal(p.value('2026-11-06T09:00:00.123Z', 'observedAt'), '2026-11-06T09:00:00.123Z');
  assert.match(String(p.value('2026-11-06 09:00:00 meeting notes', 'created_at')), /^text-\d+$/);
});

test('Pseudonymizer は、仮名にした値だけの JSON の配列の文字列（Task の deps）を残す', () => {
  const p = new Pseudonymizer();
  assert.equal(p.value('[]', 'deps'), '[]');
  assert.equal(p.value('["task_6ab3c4d5e6f7"]', 'deps'), '["task_hex-1"]');
  assert.match(String(p.value('["please fix the bug"]', 'deps')), /^text-\d+$/);
});

test('sanitizeRecording は秘密の項目を消し、stdout の JSON の中を仮名化し、stderr を自由な文にする', () => {
  const raw: CliRecording = {
    version: 1,
    kind: 'cli',
    entries: [
      {
        argv: ['worktree', 'show', '--worktree', WT, '--json'],
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          result: {
            worktree: { id: WT, path: `${HOME}/workspace/repo/worktrees/feature`, branch: 'feat/x' },
            authToken: 'tok-123',
            agents: [{ paneKey: `${U1}:${U2}`, prompt: 'secret plan for the user', state: 'working' }],
            link: 'orca://pair?code=abcdef',
          },
        }),
        stderr: `warning at ${HOME}/x`,
        delayMs: 3,
      },
    ],
  };
  const clean = sanitizeRecording(raw) as CliRecording;
  const entry = clean.entries[0];
  assert.ok(entry);
  const text = JSON.stringify(clean);
  for (const leaked of ['someone', 'tok-123', 'secret plan', 'orca://pair', 'authToken', U1, U2]) {
    assert.ok(!text.includes(leaked), `leaked ${leaked}`);
  }
  const out = JSON.parse(entry.stdout);
  assert.equal(out.result.worktree.id, entry.argv[3]);
  assert.equal(out.result.worktree.branch, 'feat/x');
  assert.equal(out.result.agents[0].state, 'working');
  assert.match(entry.stderr, /^text-\d+$/);
  assert.doesNotThrow(() => assertRecordingSafe(clean, { homeDir: HOME, authToken: 'tok-123' }));
});

test('sanitizeRecording は RPC の chunk の JSON の行と params を仮名化し、$ID を残す', () => {
  const raw: RpcRecording = {
    version: 1,
    kind: 'rpc',
    exchanges: [
      {
        method: 'session.tabs.list',
        params: { worktree: WT },
        chunks: [
          `${JSON.stringify({ id: '$ID', ok: true, result: { worktree: WT, tabs: [{ id: U2, title: 'my private tab' }] } })}\n`,
        ],
        end: 'close',
      },
    ],
  };
  const clean = sanitizeRecording(raw) as RpcRecording;
  const ex = clean.exchanges[0];
  assert.ok(ex);
  const line = JSON.parse(ex.chunks[0] ?? '');
  assert.equal(line.id, '$ID');
  assert.equal(line.result.worktree, (ex.params as { worktree: string }).worktree);
  assert.match(line.result.tabs[0].title, /^text-\d+$/);
  assert.ok(ex.chunks[0]?.endsWith('\n'));
  assert.doesNotThrow(() => assertRecordingSafe(clean, { homeDir: HOME }));
});

function cli(stdout: string, extra: Partial<CliRecording['entries'][number]> = {}): CliRecording {
  return {
    version: 1,
    kind: 'cli',
    entries: [{ argv: ['status', '--json'], exitCode: 0, stdout, stderr: '', delayMs: 0, ...extra }],
  };
}

test('assertRecordingSafe は秘密、家のパス、orca://pair、本文、仮名にしていない文の残る録画を拒む', () => {
  const unsafe: [string, Recording, { authToken?: string }?][] = [
    ['token value', cli('{"ok":true,"result":{"x":"tok-xyz"}}'), { authToken: 'tok-xyz' }],
    ['secret key', cli('{"ok":true,"result":{"authToken":"text-1"}}')],
    ['home path', cli(`{"ok":true,"result":{"path":"${HOME}/a"}}`)],
    ['pairing', cli('{"ok":true,"result":{"x":"orca://pair?code=1"}}')],
    ['free text body', cli('{"ok":true,"result":{"prompt":"fix"}}')],
    ['sentence elsewhere', cli('{"ok":true,"result":{"state":"please read my notes"}}')],
    ['raw uuid', cli(`{"ok":true,"result":{"id":"${U1}"}}`)],
    ['raw path', cli('{"ok":true,"result":{"path":"/opt/private/place"}}')],
    ['stderr text', cli('{"ok":true,"result":{}}', { stderr: 'something went wrong' })],
    ['argv path', cli('{"ok":true,"result":{}}', { argv: ['worktree', 'show', '--worktree', '/opt/x/y'] })],
    ['non json stdout', cli('hello there friend')],
    [
      'invalid chunk',
      {
        version: 1,
        kind: 'rpc',
        exchanges: [{ method: 'm', chunks: ['{"id":"$ID","result":{"prompt":"my secret'], end: 'close' }],
      },
    ],
    [
      'invalid chunk text',
      {
        version: 1,
        kind: 'rpc',
        exchanges: [{ method: 'm', chunks: ['{"x":"a long sentence about my work"'], end: 'close' }],
      },
    ],
  ];
  for (const [name, recording, options] of unsafe) {
    assert.throws(() => assertRecordingSafe(recording, { homeDir: HOME, ...options }), /unsafe recording/, name);
  }
});

test('assertRecordingSafe の誤りの文は、残っていた値そのものを含まない', () => {
  try {
    assertRecordingSafe(cli('{"ok":true,"result":{"prompt":"very private words"}}'), { homeDir: HOME });
    assert.fail('should throw');
  } catch (error) {
    assert.ok(!(error as Error).message.includes('very private words'));
  }
});

test('手で書いた fixture の録画は、すべて assertRecordingSafe を通る', async () => {
  const dir = new URL('../fixtures/recordings/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const recording = JSON.parse(await readFile(new URL(file, dir), 'utf8')) as Recording;
    assert.doesNotThrow(() => assertRecordingSafe(recording), file);
  }
});

test('JSON の配列の規則は、仮名を含む要素だけを安全とし、短い語の並びを安全としない（FQG-002）', () => {
  for (const words of ['["fix","the","bug"]', '["deploy","prod"]', '["a"]', '["task_","x"]']) {
    assert.equal(isSafeString(words), false, words);
    assert.match(String(new Pseudonymizer().value(words, 'deps')), /^text-\d+$/, words);
  }
  for (const safe of ['[]', '["task_hex-1"]', '["task_hex-1","task_hex-2"]', '["uuid-3"]']) {
    assert.equal(isSafeString(safe), true, safe);
  }
});
