# Design Guide

`design.md` は、Requirement を満たすための構造と責務境界を説明する文書です。利用者に約束する behavior を再定義せず、その実現方法を検討します。

## この文書が扱うこと

- Current と Target architecture
- component、責務境界、data と interface の契約
- failure contract と主要な edge case
- migration、compatibility、rollback の方針
- testability、observability、理解を助ける図

## この文書に置かないこと

- business outcome、scope、acceptance の再定義
- 実装 task の順序や担当割り
- 実装後の結果だけを記録する日誌

受け入れ条件と非対象範囲は [Requirement Guide](requirement.md) を正本にします。Issue の実装順序や verification は [Issue Plan Guide](issue-plan.md) に、Initiative / Epic の Plan 責務は [Scope Layering Guide](scope-layering.md) に従って各 scope の `plan.md` に記録します。実装中に長く残る設計判断が必要になった場合は、ここか accepted ADR に戻して明示します。
