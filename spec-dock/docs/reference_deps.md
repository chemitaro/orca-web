# 依存関係（Current）

依存edgeの正本はGitHub Issueのblocked-by（Scope Issueどうし）です。fromがtoを前提とし、親から継承する制約もeffective viewで確認します。追加・削除はCLIを通してGitHubに書き、循環、曖昧ID、不存在を書く前に拒否します。

```sh
spec-dock dependency list iss-00123 --view declared --json
spec-dock dependency list iss-00123 --view effective --json
spec-dock dependency check iss-00123 --source github --json
spec-dock dependency add --from iss-00123 --to iss-00122
spec-dock dependency remove --from iss-00123 --to iss-00122
```

checkのsource省略は構造のスナップショット（GitHubの構造の写し）を読み、`--source github`は取り直してから判定します（`--source`が受け付けるのは`github`だけです）。stale許容flagは使いません。Startのreadinessはlive観測し、取得不能・不明なら開始を拒否します。readinessだけでは作業開始の許可や直接記録取得を意味しません。複数worktreeはSyncで観測します。
