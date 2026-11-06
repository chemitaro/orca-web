# Workbench

このディレクトリは、一時的で worktree-local、破棄可能、non-canonical な作業領域です。下書き、調査メモ、model の中間成果など、まだ正本へ採用していないファイルを置けます。Workbench がなくても SpecDock workspace は valid であり、worktree を破棄すると内容も失われ得ます。

## Git と安全上の境界

- Git tracking を意図する Workbench path は、この direct child の `README.md` だけです。
- `.workbench/README.md` 以外の Workbench entry は Git に ignore されます。
- Git ignore は security boundary ではありません。secret、credential、private customer data、その他保存を禁止された情報を置かないでください。
- 人間、model、tool は、この README を含む Workbench content を canonical specification、ADR、metadata、dependency、authoring source として扱ってはいけません。

## 残す価値があるファイル

残す価値がある一つのファイルは、repository root から repo-local runtime を使い、対象の root、Initiative、Epic、Issue scope の `artifacts/` へ Artifact として明示的に import します。

`./spec-dock/scripts/spec-dock artifact import file ...`

ファイルの明示指定は、そのファイルを read / import する許可に限られます。import 結果は evidence-only であり、canonical adoption を意味しません。正本へ反映するには、別の reviewed workflow が必要です。

## linked worktree 間の扱い

- Initiative、Epic、Issue の `.workbench/` は、カタログ（`spec-dock/initiatives/` の先）の Scope の中にあり、同じ clone のどの worktree からも同じものが見えます。写す必要はありません。
- root `.workbench/` は worktree ごとです。tracked `README.md` は通常の Git checkout で別 worktree に現れますが、その他の ignored file は自動 copy / sync されません。root で durable に残す一 file は generic Artifact import を使ってください。
- automatic hook、watch、sync、copy-back はありません。
