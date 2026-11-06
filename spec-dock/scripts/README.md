# SpecDock scripts

`spec-dock/scripts/spec-dock` は、PATH上の外部`spec-dock`へ引数をそのまま渡す互換shimです。標準の入口は、package managerで導入した外部`spec-dock`コマンドです。shimはGitのcontrolやrepository内のPython runtimeを必要としません。

外部consoleが見つからない場合は、packageの導入とPATHを確認してください。委譲先が自身・同じshimのコピー・既知の旧shimなら再帰を防いで停止します。旧branchのshimへ戻った場合も、外部`spec-dock`を直接実行できます。

CLIの仕様と全コマンドは[CLI参照](../docs/reference_cli.md)を確認してください。正確な引数は`spec-dock help COMMAND`で確認します。

```sh
spec-dock --help
spec-dock help work start
spec-dock active show
spec-dock workspace validate
spec-dock workspace sync
```

`work start TARGET` はInitiative、Epic、Issueを受け付け、依存と他worktreeの選択を確認し、branchを作成またはcheckoutして、そのworktreeの直接対象一件を選択します。既存branchは`--branch`で明示し、新規branchの作成では`--base`を指定します。初回選択と対象切替には`work start`を使い、現在の選択は`active show`で読み、解除は`active clear`で行います。

`work finish TARGET --yes` はGitHub IssueをcompletedとしてCloseし、該当する直接選択を解除します。現在branchに留まり、commit、push、mergeやbranch削除は行いません。

package本体の更新には通常のpackage managerを使います。`installation init/update` は、対象worktreeの静的資産だけを扱います。SpecDock 0.5.0 は宣言の版4（canonical モード）だけを扱い、版3の宣言のリポジトリでは、どのコマンドも`CANONICAL_NOT_MIGRATED`で止まります。移し方は[移行手順](../docs/migration.md)を参照してください。`spec-dock/.agent/` はGit管理外のworktree-local状態であり、一次仕様はScope内の文書です。
