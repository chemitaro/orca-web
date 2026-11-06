// この Mac の Orca で、開く口を実機で確かめる。Orca の画面の前面を切り替える（書き込み）。
// 使い方: npm run open:live -- --worktree <ID かパス> [--agent <paneKey>] [--route tab-activate|worktree-activate]
//   既定は OpenService.open（POST /api/open と同じ処理）。--route は、最後に見ていた既存のタブ（か worktree）に、指定の経路で送る。
// 対象は、作業の場所と同じ repo の worktree だけ。押す前と後の session.tabs.listAll を比べ、数だけを JSON で出す。
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { isTerminal, parseTabsSnapshot } from '../orca/open-target.ts';
import { wireOrca } from '../orca/wiring.ts';
import { DEFAULT_ORCA_CLI } from '../server/config.ts';
import { diffTabs, pickSameRepoTarget, tabKeys } from './live-open.ts';

const SETTLE_MS = 2_000;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { worktree: { type: 'string' }, agent: { type: 'string' }, route: { type: 'string' } },
  });
  const selector = values.worktree;
  if (!selector) throw new Error('--worktree is required');
  if (values.route !== undefined && values.route !== 'tab-activate' && values.route !== 'worktree-activate') {
    throw new Error('--route must be tab-activate or worktree-activate');
  }
  const orca = wireOrca({ executable: process.env.ORCA_WEB_ORCA_CLI || DEFAULT_ORCA_CLI });
  const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const picked = pickSameRepoTarget(await orca.readCli.json(['worktree', 'list']), toplevel, selector);
  if (!picked.ok) throw new Error(`refused: ${picked.reason}`);

  const report = await orca.capabilities.get();
  if (!report.features.openExistingTab.available) {
    throw new Error(`openExistingTab is not available: ${report.features.openExistingTab.missing.join(', ')}`);
  }
  const readAll = async () => {
    const r = await orca.readRpc.call('session.tabs.listAll', null);
    const keys = r.ok ? tabKeys(r.result) : null;
    if (!keys) throw new Error('session.tabs.listAll is not readable');
    return keys;
  };
  const before = await readAll();

  let outcome: unknown;
  if (values.route === undefined) {
    const request = values.agent ? { worktree: selector, agent: values.agent } : { worktree: selector };
    const result = await orca.open.open(request);
    // worktreeId（パスを含む）と Orca の誤りの文は出さず、決まった項目だけを出す。
    outcome = result.ok
      ? {
          ok: true,
          route: result.route,
          reason: result.reason,
          requestedAgentFound: result.requestedAgentFound ?? null,
          mayCreateInitialTerminal: result.mayCreateInitialTerminal ?? null,
        }
      : { ok: false, error: result.error, route: result.route ?? null, missing: result.missing ?? null };
  } else {
    const worktree = `id:${picked.worktreeId}`;
    const listed = await orca.readRpc.call('session.tabs.list', { worktree });
    const snapshot = listed.ok ? parseTabsSnapshot(listed.result, picked.worktreeId) : null;
    const tab = snapshot?.tabs.find((t) => t.isActive) ?? snapshot?.tabs[0];
    // タブのない worktree では、Orca が最初の端末を作りうるので、経路の指定では送らない。
    if (!snapshot || !tab) throw new Error('refused: the worktree has no existing tab');
    const sent =
      values.route === 'worktree-activate'
        ? await orca.openRpc.call('worktree.activate', { worktree, navigation: 'host' })
        : await orca.openRpc.call('session.tabs.activate', {
            worktree,
            tabId: tab.id,
            navigation: 'host',
            intent: 'user',
            ...(isTerminal(tab) ? { leafId: tab.leafId } : {}),
          });
    outcome = sent.ok
      ? { ok: true, route: values.route, tabType: tab.type }
      : { ok: false, route: values.route, kind: sent.kind, code: sent.code ?? null };
  }

  const prefix = `${picked.worktreeId}\u0000`;
  const only = (keys: Set<string>) => new Set([...keys].filter((k) => k.startsWith(prefix)));
  await delay(SETTLE_MS);
  const after = await readAll();
  const summary = {
    checkedAt: new Date().toISOString(),
    orca: { cliVersion: report.cliVersion, appVersion: report.appVersion },
    target: { sameRepo: true, isMainWorktree: picked.isMain, agentGiven: values.agent !== undefined },
    outcome,
    tabs: diffTabs(before, after),
    targetTabs: diffTabs(only(before), only(after)),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`open-live failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
