# 全体ガイド（guide）

## Current

通常packageの外部CLIを使い、仕様は各Scopeのcanonical filesから読みます。SpecDock 0.5.0 は `spec-dock/workspace.json` の `schema_version` が 4 のリポジトリ（canonical モード）だけを扱い、Scope の構造は GitHub Issue に、中身は `spec-dock/initiatives/<区切り>/<ID>/`（`spec-dock/canonical` ブランチのカタログへのリンク）にあり、保存と共有は自動です。詳しくは[canonical モードの使い方](canonical.md)を見てください。

- [導入・移行・保全](migration.md)
- [CLI参照](reference_cli.md)
- [canonical モードの使い方](canonical.md)
- [人のタスク（`spec-dock todo`）の使い方](todo.md)
- [人間向け説明HTML](cli-redesign-guide.html)
- [命名参照](reference_naming.md)
- [依存関係管理参照](reference_deps.md)
- [状態の観測](reference_sync.md)
- [GitHub連携参照](reference_github.md)
- [worktree参照](reference_worktree.md)
- [Authoring Kit概要](authoring/overview.md)

新規ScopeはGitHubの番号を使います。Startにはbranch作成・checkoutと直接記録、FinishにはGitHub完了確認と捕捉記録の解除があります。仕様の編集や作業の引継ぎをIssue完了と混同しません。

複数worktreeの状態は `workspace sync` で都度観測します。成果物を生成し直して保存するコマンドではなく、複数の予約・論理active・祖先をまとめて返します。Codex processの実行状況は推定しません。

## Historical

[Historical authoring](authoring/historical.md)と[過去版の位置づけ](historical/README.md)は既存証跡の確認用です。Current の新規作成手順ではありません。
