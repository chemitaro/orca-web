# アクティブ未設定のfallback（active-none）

ここは、worktreeにCurrent writerの直接対象が無い場合に読む静的fallback文書です。現在の選択状態を保存する場所ではありません。

- 現在の直接対象は `spec-dock/.agent/work-target/target-<32桁token>.json` に0件または1件だけ保存されます。保存先はworktree自身のignored領域です。
- file tokenは一件の記録実体を識別するための値で、Scope ID、GitHub番号、UUIDではありません。
- 対象の取得は `spec-dock work start TARGET ...` を使います。`active set` は空または別対象を取得できません。
- 現在状態は `spec-dock active show --json` で確認します。未選択のとき、`spec-dock/active/{initiative,epic,issue}` の閲覧用linkはこの配下を指します。linkは選択の正本ではありません。
- この配下はtool-managedな静的文書ですが、Current runtimeがbest-effort read-only permissionや通常編集の権限制御を設定する契約ではありません。

Initiative / Epic / IssueごとのREADMEは、対象が無いときの入口とCurrent CLIの案内だけを提供します。
