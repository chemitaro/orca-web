# 状態の観測と検証（Current）

`workspace sync` は、その時点のScopeの完了状態と、同じphysical cloneのmain/linked worktreeの直接対象を観測して返します。index/tree、generation、cache、登録台帳を保存せず、別cloneは集計しません。依存のreadinessは `dependency check` で別に確認します。

```sh
spec-dock workspace sync --json
spec-dock workspace sync --source github --json
spec-dock workspace validate --json
spec-dock workspace doctor --json
```

source省略は構造のスナップショット（GitHub の構造の写し）を読みます。`--source github` は、変わったかの確かめを待たずに GitHub から構造を取り直してから読みます。複数worktreeの予約と論理activeをまとめ、選択対象の現在の祖先からEpic/Initiativeを導出します。process_stateはnot_observedで、Codexが実行中だとは断定しません。

別branchへ移った予約も保持します。対象消失・破損・複数記録・アクセス不能を「未選択」と扱わず、不完全ならcomplete=falseと診断を返します。`--allow-invalid` も実体を修復しません。

validateは、構造のスナップショットとカタログ（`spec-dock/initiatives/` の先）を照らし、Scope ごとに `spec-dock/initiatives/<区切り>/<ID>/` と文書があるか、種類と階層、依存の循環、置き場の外れを検査します。CI では、既定のブランチのコミットを `canonical check` で検査します（`workspace validate` に CI 用の引数はありません）。doctorはread-only診断です。--rawは宣言を読めないときに宣言のファイルだけを観測し、--legacyは撤去済みの記録のファイルを分類します。旧engine実行やjournal再開はしません。

Markdown の Scope の `requirement.md`、`design.md`、`plan.md`、`report.md`、CUE の Scope（`requirement.cue` があるもの）の `requirement.cue`、`design.cue`、`plan.cue`、`report.md` を必須の通常ファイルとして検査します。欠落やsymlink・directoryへの置換は不完全な構造です。本文の内容、承認表記、計画レベルは判定しません（CUE の Scope の中身は `scope check` で検査します）。
