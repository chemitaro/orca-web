# アクティブイニシアチブ（Active Initiative: なし）

このworktreeに、Current writerが選択したInitiativeの直接対象はありません。このディレクトリは静的fallbackであり、直接対象の保存場所や通常編集のpermission gateではありません。

新しいbranchを作って対象を取得する例:

```sh
spec-dock work start init-00123 --base main --json
spec-dock active show --json
```

既存branchを再利用する場合は、現物を確認したうえで `--branch NAME` を明示し、`--base` は付けません。`active set init-00123` は空のworktreeで対象を取得したり、別対象へ切り替えたりできません。取得はStart、解除だけなら `active clear`、完了とGitHub Closeなら `work finish` を使います。
