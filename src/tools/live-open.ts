// 開く口の実機の確かめの部品。対象を作業の場所と同じ repo の worktree に限り、押す前と後のタブの集合を数だけで比べる。
// 題名、本文、パスを出さない。
import type { CliOutcome } from '../orca/orca-cli.ts';

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** `session.tabs.listAll` の結果を、worktree とタブの id の組の集合にする。形が違えば null。 */
export function tabKeys(result: unknown): Set<string> | null {
  if (!isRecord(result) || !Array.isArray(result.snapshots)) return null;
  const keys = new Set<string>();
  for (const snap of result.snapshots) {
    if (!isRecord(snap) || !isText(snap.worktree) || !Array.isArray(snap.tabs)) return null;
    for (const tab of snap.tabs) {
      if (!isRecord(tab) || !isText(tab.id)) return null;
      keys.add(`${snap.worktree}\u0000${tab.id}`);
    }
  }
  return keys;
}

export function diffTabs(before: ReadonlySet<string>, after: ReadonlySet<string>) {
  let added = 0;
  let removed = 0;
  for (const k of after) if (!before.has(k)) added += 1;
  for (const k of before) if (!after.has(k)) removed += 1;
  return { before: before.size, after: after.size, added, removed };
}

export type SameRepoTarget = { ok: true; worktreeId: string; isMain: boolean } | { ok: false; reason: string };

/**
 * `worktree list` の結果から、作業の場所（Git の最上位のパス）の repo を決め、対象（ID かパス）がその repo の worktree のときだけ返す。
 * ほかのリポジトリのタブを前面に出さないための門。
 */
export function pickSameRepoTarget(listed: CliOutcome<unknown>, toplevel: string, selector: string): SameRepoTarget {
  if (!listed.ok || !isRecord(listed.result) || !Array.isArray(listed.result.worktrees)) {
    return { ok: false, reason: 'worktree list is not readable' };
  }
  const rows = listed.result.worktrees.filter(isRecord);
  const self = rows.find((r) => r.path === toplevel);
  if (!self || !isText(self.repoId)) return { ok: false, reason: 'the working directory is not an Orca worktree' };
  const matches = rows.filter((r) => r.id === selector || r.path === selector);
  const target = matches[0];
  if (!target || matches.length > 1 || !isText(target.id))
    return { ok: false, reason: 'the target is not one Orca worktree' };
  if (target.repoId !== self.repoId) return { ok: false, reason: 'the target belongs to another repository' };
  return { ok: true, worktreeId: target.id, isMain: target.isMainWorktree === true };
}
