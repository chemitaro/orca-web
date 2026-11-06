# Report Guide

`report.md` は、実装後の結果を短く要約する文書です。Fresh templateは、`# Result Summary` と次の三つのsectionだけを持ちます。

## この文書が扱うこと

- Outcome: 実現したこと、実現しなかったこと
- Verification: 実行した確認と結果
- Residual Risks / Follow-ups: 残るリスク、次に必要な作業

各sectionの本文は空でも有効です。frontmatterと三つの見出しを持つ非空ファイルであればよく、Reportの有無や記入量を実行可否や完了の機械的な判定には使いません。補足が必要なときだけ、利用者が`## Notes`を追加できます。

## この文書に置かないこと

- durable decision の唯一の記録
- Requirement、Design、Planを置き換える仕様本文
- 特定の利用記録を必須にする項目

## Durableな判断の置き場

Reportはdurable decisionの保管場所でも、Requirement、Design、Planを置き換える仕様本文でもありません。将来も効く判断は[Requirement Guide](requirement.md)、[Design Guide](design.md)、Issue では[Issue Plan Guide](issue-plan.md)に従う`plan.md`、Initiative / Epic では[Scope Layering Guide](scope-layering.md)に従う各 scope の `plan.md`、またはaccepted ADRに反映します。Reportには、その判断が実装でどうなったかを要約します。
