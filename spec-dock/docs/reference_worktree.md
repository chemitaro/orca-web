# Git worktree（Current）

同じphysical cloneのmain/linked worktreeをnative `git worktree list --porcelain -z` から都度取得します。独自registry・alias・stable worktree IDは作りません。対象は絶対pathで指定します。

```sh
spec-dock worktree create feature-a --base main --root /absolute/worktrees
spec-dock worktree list --json
spec-dock worktree show /absolute/worktrees/feature-a --json
spec-dock worktree bootstrap /absolute/worktrees/feature-a --yes --json
# この作業場の削除が許可されている場合だけ
spec-dock worktree remove /absolute/worktrees/feature-a --yes --json
```

createは既存physical rootの直下 `root/NAME` にnative worktreeを置き、`worktree/NAME` branchを固定baseから作ります。NAMEは必須で、小文字英数字とhyphenを使い、既存branch/pathとの衝突を拒否します。bootstrapとtool導入は別操作です。Gitエラー原文、作成済みbranch/path、不確かな効果を返し、自動reset/stash/rollbackをしません。

bootstrapはproject-owned makefileを確認して `make init` を一回実行します。対象と任意projectの副作用を確認して許可してください。hook本文は出力せず、失敗・timeout・結果不明ではeffectsと現物を確認します。共通Git内に実行履歴を保存しません。

removeはmain/current/bare、dirty等を拒否し、branchを残します。lockedには--unlock、ignored payloadには--discard-ignoredの明示許可が必要です。直接記録がignored領域にあることも削除前に確認します。Scope の `.workbench/` はカタログの中にあり、同じcloneのどのworktreeからも同じものが見えるので、worktree間で写す必要はありません。カタログのworktree（`spec-dock/canonical`）を対象にすると `CANONICAL_CATALOG_PROTECTED` で止まります（取り外しは `canonical remove`）。
