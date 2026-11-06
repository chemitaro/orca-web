# Requirement Guide

`requirement.md` は、解く問題と達成したい利用者・関係者の成果を固定する文書です。実装方法を決める前に、何を観測できれば成功かを共有できる状態にします。

## この文書が扱うこと

- problem と、今取り組む理由
- stakeholder / user outcome
- 対象範囲と非対象範囲
- 観測可能な behavior と受け入れ条件
- 制約、互換性、前提、リスク
- 人間の判断が必要な未解決事項

## この文書に置かないこと

- class、module、data structure などの設計詳細
- 実装順序、task 分解、テストの実装手順
- 実装後に観測した結果の記録

構造や interface は [Design Guide](design.md) に置きます。Issue の実装と検証の順序は [Issue Plan Guide](issue-plan.md) に、Initiative / Epic の Plan 責務は [Scope Layering Guide](scope-layering.md) に従って各 scope の `plan.md` に置きます。要件を変える必要が生じた場合は、Plan 内で黙って決めず、この文書を更新して受け入れ条件との整合を確認します。
