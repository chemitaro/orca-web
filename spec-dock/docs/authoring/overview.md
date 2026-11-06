# Authoring Kit 概要

このガイドは、Initiative / Epic / Issue の仕様を書くための入口です。新しい Scope は CUE の Scope で、下の「CUE の Scope と保証レベル」から始めます。0.4.0 より前に作った Markdown の Scope は、下の Guide で直します。特定の agent、model、provider、review 手順を前提にしません。必要な支援や手順は、利用するプロジェクトの状況に合わせて選んでください。

各 scope は `requirement.md`、`design.md`、`plan.md`、`report.md` を一組として持ちます。文書は役割ごとに分け、長く残る判断は適切な正本へ記録します。

## 何をどこに書くか

- [Requirement Guide](requirement.md): 問題、利用者の成果、対象範囲、受け入れ条件を明確にする。
- [Design Guide](design.md): Requirement を満たす構造、責務境界、interface、失敗時の扱いを決める。
- [Issue Plan Guide](issue-plan.md): Issue の実装順序、検証、移行、残るリスクを実行可能な形にする。
- [Report Guide](report.md): 実装後の結果、検証、残るリスクを短く残す。
- [Scope Layering Guide](scope-layering.md): Initiative / Epic / Issue の責務と、親子間で再定義しない境界を確認する。
- [Artifact Guide](artifacts.md): Current の evidence と、durable な内容の反映先を確認する。

## CUE の Scope と保証レベル

SpecDock 0.4.0 から、新しく作る Scope は CUE の Scope です。要件・設計・計画を `requirement.cue`、`design.cue`、`plan.cue` に書き、人向けの説明を `explanation.html` に書きます。CUE の Scope では、Planning Level が保証レベル（`requirement.cue` の `assurance`）になりました。保証レベルは作るときに必須で、型の必須の項目と、`spec-dock scope check` の検査を変えます。

- [CUE Authoring Guide](cue.md): 型、番号、つながりの規則、保証レベル、計画の台帳、実行の割り当て、検査のしかた。
- [Explanation Guide](explanation.md): 説明資料の置き場、薄い形、検査。

既存の Markdown の Scope は、そのまま残り、下の Guide と Planning Level の書き方で扱います。保証レベルは、過去の Assurance（`.assurance.json`）とは別のものです。

## Planning Level

Markdown の Scope の Planning Level です（CUE の Scope は上の保証レベル）。Issue の canonical `plan.md` は一つです。完成基準は選んだ一つの Guide を参照します。

- [light Completion Guide](issue-plan-levels/light.md)
- [standard Completion Guide](issue-plan-levels/standard.md)
- [strict Completion Guide](issue-plan-levels/strict.md)
- [critical Completion Guide](issue-plan-levels/critical.md)

## Agent assistance

provider側の正本は `src/spec_dock/assets/install_root/.agents/skills/` にある次の二つです。導入時に、明示したconsumer worktreeのroot `.agents/skills/` へ静的資産として投影されます。Claude Codeでは `.claude/skills/<name>` → `../../.agents/skills/<name>` の相対リンクで取り込みます（リンクはClaude Code側で作り、installationは管理しません）。consumer側のskillは実行runtimeではなく、installed external `spec-dock` の利用手順です。package更新は利用者のtool環境、skill更新はworktree単位であり、source編集や別worktreeの更新から自動伝播しません。

- `spec-dock`（`.agents/skills/spec-dock/SKILL.md`）: SpecDock の scope、文書、Artifact、依存、lifecycle、worktree、managed installation をcurrent CLIで操作・執筆します。
- `spec-dock-grill-with-docs`（`.agents/skills/spec-dock-grill-with-docs/SKILL.md`）: read-only grilling と domain clarification の後にscope-local evidence Artifactを作成します。

installationが管理するのは二つのskill slot内の既知のfileだけで、`.claude/settings.json` などのhost設定や他のskillは変更・削除しません。同じpathに同じbytesのfileがあると、利用者のコピーと配布物を区別できないため、uninstallの削除対象になります。以前の版が `.claude/skills/` に置いたコピーは、updateが既知のfileだけを除去します。

これらは支援手順であり、canonical文書を自動採用したり、通常編集に新しい許可gateを加えたりするものではありません。

## 基本原則

- Requirement は「なぜ・何を満たすか」、Design は「どの構造で満たすか」、Plan は「どの順序で確かめながら実装するか」を扱います。
- Report は結果の要約です。将来も参照される判断は Requirement、Design、Plan、または accepted ADR に反映します。
- まず親 scope の目的、分割、依存方向を読みます。下位 scope はそれらを言い換えず、担当する具体的な価値と受け入れ条件を追加します。
- 調査メモや会話などの evidence は、内容を検討してから正本へ反映します。ファイルが存在するだけで採用済みにはなりません。

## Scope ごとの使い分け

Initiative は複数 Epic にまたがる投資と成果を、Epic は一貫した product / architecture outcome と Issue 分割を、Issue は一つの end-to-end で観測できる価値を扱います。詳細は [Scope Layering Guide](scope-layering.md) を参照してください。
