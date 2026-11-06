# SpecDock文書入口

SpecDockは通常のPython packageとしてworktree外へ導入した `spec-dock` を使います。各checkoutへ配布するのは文書・template・skills・PATH委譲shimだけです。Git内部の独自engine、共有control、登録台帳を必要としません。引数は `spec-dock help` と対象leafのhelpで確認してください。

## Current

- [全71 leafのCLI参照](reference_cli.md)
- [canonical モードの使い方（仕様をGitHub Issueと `spec-dock/canonical` ブランチに置く形）](canonical.md)
- [人のタスク（`spec-dock todo`）の使い方](todo.md)
- [日本語の人間向け説明HTML（オフライン）](cli-redesign-guide.html)
- [導入・移行・保全](migration.md)
- [命名](reference_naming.md)・[依存](reference_deps.md)・[GitHub](reference_github.md)・[状態の観測](reference_sync.md)・[worktree](reference_worktree.md)
- [Authoring Kit](authoring/overview.md)

```sh
spec-dock scope list
spec-dock scope show iss-00123
spec-dock dependency check iss-00123 --source github
spec-dock work start iss-00123 --base main
spec-dock active show
spec-dock workspace validate
spec-dock workspace sync --source github
# 成果の検証・deliveryが済み、このGitHub Issueを完了する場合
spec-dock work finish iss-00123 --yes
```

Initiative → Epic → Issueの三階層を維持します。新規Scopeは必ずGitHub Issueを使い、その番号をIDの正本にします。一つのworktreeの直接作業対象は同時に一つです。Startは依存を確認してbranchを作成・checkoutし、直接対象を記録します。FinishはGitHubの完了を確認して捕捉済み直接記録だけを解除し、branchに留まります。

同じcloneのmain/linked worktreeはGitから都度列挙します。Startの重複確認・checkout・記録公開だけに短い排他を使い、通常編集・Sync・Finishの共通ロックやファイル編集権限の制御は行いません。

## 運用と権限

対象を解決し、現在helpを読んで実行後の状態を確認します。`scope delete`、`worktree remove`、`installation uninstall` は、依頼または承認済み計画に正確な対象と削除結果が必要です。`--yes` はCLIの確認を省略するだけで、path・所有権・依存等のguardを迂回しません。PR mergeはrepositoryのhuman gateに従います。

Requirement・Design・Planが仕様の正本です。Artifactは証拠、Workbenchは一時作業、Syncはその時点の観測結果です。CLI失敗後は返されたeffectsと現物を確認し、結果を推測して再実行したりmetadataを直接書き換えたりしません。

## Historical

[過去版の位置づけ](historical/README.md)と[Historical authoring](authoring/historical.md)を参照してください。Current の新規作成手順ではありません。
