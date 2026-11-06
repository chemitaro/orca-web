# system（ツール管理の静的資産）

このディレクトリは `spec-dock` がconsumer worktreeへ配布する、ツール管理の説明・fallback文書を置く領域です。

- ここにあるファイルはInitiative / Epic / Issueのcanonical仕様書ではありません。
- provider側の正本は `src/spec_dock/assets/spec_dock/system/` です。consumer側のこの投影は、明示したworktreeに対する `spec-dock installation update` で更新される可能性があります。
- Python runtimeはここへ配布されません。実行するのはworktree外に導入した外部 `spec-dock` packageです。

## 現在の直接対象

現在のwriterは、各worktreeのignoredな次の場所に直接対象を0件または1件だけ保存します。

```text
spec-dock/.agent/work-target/target-<32桁の不透明なtoken>.json
```

file tokenは、Finishやclearが捕捉済みの一件だけを安全に解除するための識別子です。GitHub番号から作るScope ID、UUID、operation IDではありません。直接対象の取得は `spec-dock work start TARGET ...` だけが行います。`active set` は同じ妥当な直接対象のunchanged確認に限られ、空または別対象を取得しません。

## active-none（fallback文書）

`system/active-none/` は、直接対象が無い場合、または明示されたrecovery planning packも無い場合に読む静的fallback文書です。ここにあるREADMEや空のR/D/P/Reportは、現在の選択状態そのものではなく、通常編集の許可・禁止をfilesystem permissionで強制するものでもありません。

## active link（閲覧用の派生物）

人間がエディタやファイラーから資料を開けるよう、Current writerは選択を変える操作の後で、worktree自身のGit無視領域に次の相対symlinkを揃えます。

```text
spec-dock/active/initiative -> ../initiatives/<Initiative>
spec-dock/active/epic       -> ../initiatives/<Initiative>/epics/<Epic>
spec-dock/active/issue      -> .../issues/<Issue>
```

- `work start` は直接対象とその祖先を指します。直接対象より下位の役割と、`active clear` / 選択を解除した `work finish` の後は `system/active-none/<role>` を指します。
- linkは選択の正本ではありません。選択の判定、祖先の導出、guardはlinkを読みません。現在状態は `spec-dock active show --json` とworktree自身の直接記録で確認します。
- linkが欠けた・古い場合は、選択中なら `spec-dock active set @current`、未選択なら `spec-dock active clear --all` で揃え直せます。`branch switch` や読み取りcommandはlinkを書きません。
- 書き換えるのは `initiative`、`epic`、`issue` の3つの名前だけです。同名の実体file/directory、`active` 自体のsymlink、Gitに無視されない `active/` には書かず、warning `ACTIVE_LINK_NOT_UPDATED` で報告します。
- 旧writerが生成した `context-pack.md`、`current-runbook.json`、`current-runbook.md`、`{initiative,epic,issue}.path` が残っていることがありますが、現行writerはこれらを更新も削除もしません。内容は古い可能性があるため参照せず、不要なら手で削除してください。3つのlink名以外の名前は変更しません。
