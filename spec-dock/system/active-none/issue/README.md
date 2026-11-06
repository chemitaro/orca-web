# アクティブ課題（Active Issue: なし）

このworktreeに、Current writerが選択したIssueの直接対象はありません。このディレクトリは静的fallbackであり、直接対象の保存場所や通常編集のpermission gateではありません。

新しいbranchを作って対象を取得する例:

```sh
spec-dock work start iss-00123 --base main --json
spec-dock active show --json
```

既存branchを再利用する場合は、現物を確認したうえで `--branch NAME` を明示し、`--base` は付けません。`active set iss-00123` は空のworktreeで対象を取得したり、別対象へ切り替えたりできません。取得はStart、解除だけなら `active clear`、完了とGitHub Closeなら `work finish` を使います。

親EpicやInitiativeが表示文脈にあっても、Issueの直接対象が無ければこのfallbackの意味は変わりません。親を暗黙に取得したことにはなりません。
