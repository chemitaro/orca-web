# ルートの成果物ルール（root / artifacts/rules.md）

ルートのgeneric Artifactは、リポジトリrootから次のCurrent CLIで一件の明示regular fileをopaque evidenceとして保存します。

```sh
./spec-dock/scripts/spec-dock artifact import file <path> --scope @root --json
```

PATH上の外部consoleを直接使う場合は、先頭を `spec-dock` に置き換えます。`@root` はルートArtifact置き場を選ぶ予約selectorであり、GitHub番号に対応するScope ID、work-targetのfile token、UUIDではありません。Workbenchは入力要件ではありません。

- sourceはsingle-link regular fileとして読み、source自体を変更・削除しません。読んだbytesを `spec-dock/artifacts/` の一件のgeneric fileとしてno-replace公開します。
- 保存したgeneric Artifactはcanonical specification、review済み内容、承認済み内容、採用済み判断ではありません。filename、拡張子、本文からtypeやauthorityを推測せず、採用する主張だけをRequirement、Design、Planまたはaccepted ADRへ明示的に反映します。
- CLIが返す `data.result.artifact` のID、repository-relative path、typeを正本にします。Current v2 envelopeの `status`、`effects`、exit codeで成功、部分結果、不明、未実行を区別し、退役済みの `committed` / `publication_state` / `retry_disposition` fieldを前提にしません。
- 作成時刻slot、normalized basename、collisionの契約は [reference_naming.md](../../reference_naming.md) を参照してください。保存済みArtifactのauthority flowは [Artifact Guide](../../authoring/artifacts.md) を参照してください。
- Artifact公開はStartの同clone排他を取得せず、通常編集をSpecDockの権限制御下へ置きません。入力・owner・catalogの再確認と安全なno-replace公開はCurrent CLIが行います。

root Artifact storageを初期化すると、`spec-dock/artifacts/rules.md` はこのprovider-managed rules sourceへのrelative symlinkになります。この `rules.md` は入口だけであり、本文の正本をnodeごとに複製しません。
