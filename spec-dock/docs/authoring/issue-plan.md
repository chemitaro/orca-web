# Issue Plan Guide

`plan.md` は、承認された Requirement と Design を、実装と検証へつなぐ文書です。Issue では一つの canonical `plan.md` を使い、実装者が何をどの順序で確かめるかを共有します。特定の agent、provider、review 手順を前提にしません。

この Guide は、Markdown の Scope の `plan.md` の書き方です。CUE の Scope の `plan.cue` は、下の「保証レベル（CUE の Scope）」と [CUE Authoring Guide](cue.md) に従います。

## この文書が扱うこと

- 選んだ Planning Level と、その選択理由
- end-to-end の implementation sequence
- dependency、並行に進められる作業、統合の順序
- verification strategy と regression の確認方法
- migration、rollback、forward recovery
- completion / exit criteria、handoff、residual risk

## この文書に置かないこと

- problem、scope、acceptance の再定義
- architecture、責務境界、interface の設計判断を隠して確定すること
- 実装中の進捗日誌、実行ログ、日ごとの作業記録

問題、利用者の成果、受け入れ条件は [Requirement Guide](requirement.md) を正本にします。構造、interface、長く残る設計判断は [Design Guide](design.md) または accepted ADR に戻します。実装後に観測した結果は [Report Guide](report.md) に要約します。

## 保証レベル（CUE の Scope）

CUE の Scope では、Planning Level が保証レベル（Assurance Level）になりました。値は同じ `light`、`standard`、`strict`、`critical` で、失敗した場合の影響と回復の難しさで選ぶことも同じです。違いは次のとおりです。

- 正本は `requirement.cue` の `assurance`（`level` と `reason`）だけで、`plan.cue` には書きません。`scope create` と `scope import github` で必須です。
- 値が、型の必須の項目と、`spec-dock scope check` のつながりの規則を変えます。完成基準の Guide を読む代わりに、検査が抜けを示します。
- 途中で書き換えてよく、`spec-dock scope show <ID> --json` の `assurance` で読めます。
- 計画は `plan.cue` の手順（`steps`）とテスト（`tests`）で、作業しながら `status` を更新する台帳です。

詳しくは [CUE Authoring Guide](cue.md) にあり、人向けの説明資料（`explanation.html`）の書き方は [Explanation Guide](explanation.md) にあります。Markdown の Scope では、下の Planning Level の書き方が残ります。

## Planning Levelの選び方

Planning Level は、失敗した場合の影響と回復の難しさに応じて Plan の完成基準を選ぶための文書上の選択です。Priority、Severity、工数、dependency readiness、handoff status、文書量だけでは決めません。未指定なら、執筆を始める目安として `standard` を選べますが、Runtime の default や metadata にはしません。

同じ canonical `plan.md` の `## Planning Level` に、selected level、理由、risk factor、再評価条件を記録します。Runtime の状態、実行可否、GitHub の構造、active manifest、`.assurance.json` には複製しません。level 別の `plan-light.md` などは作りません。

| Example ID | 状態 | 結論 |
|---|---|---|
| `LEVEL-EX-POS-01` | 影響が局所的で即時 revert 可能 | `light` 候補 |
| `LEVEL-EX-POS-02` | public contract / migration で影響が広く、回復が難しい | `strict` 候補 |
| `LEVEL-EX-POS-03` | security / privacy または不可逆で incident recovery が必要 | `critical` 候補 |
| `LEVEL-EX-NEG-01` | Priority だけが高い | level を上げる根拠にしない |
| `LEVEL-EX-NEG-02` | 工数または dependency blocker だけが大きい | level を上げる根拠にしない |
| `LEVEL-EX-NEG-03` | Severity label だけが高く、実際の impact / recovery 根拠がない | label だけでは決めない |

選んだ完成基準は、次の一つを参照します。各 Guide は Base Guide への追加条件を単独で説明しており、別 level の Guide を順に読む必要はありません。

- [light Completion Guide](issue-plan-levels/light.md)
- [standard Completion Guide](issue-plan-levels/standard.md)
- [strict Completion Guide](issue-plan-levels/strict.md)
- [critical Completion Guide](issue-plan-levels/critical.md)
