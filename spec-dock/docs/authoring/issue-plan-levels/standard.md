# standard Completion Guide

[Issue Plan Guide](../issue-plan.md) の共通構造に加えて、通常の feature または bug fix の完成基準です。選択理由、risk factor、再評価条件は canonical `plan.md` 本文に記録します。これは執筆を始める目安であり、Runtime default ではありません。

## 完成時の状態

- end-to-end の実装順序、依存、主要な統合点が明確である。
- acceptance と主要な error path を確認できる。
- residual risk と handoff が exit 条件に記録されている。

## 検証とnegative test

- 通常経路の end-to-end verification と、主要な regression を示す。
- 主要な error path または不正入力の negative test を示す。
- 外部依存を使えない場合の確認方法を記録する。該当なしなら `N/A` と理由を記録する。

## rollback / migration

- 基本的な rollback または forward recovery を記録する。
- data migration が不要なら `N/A` と理由を記録する。

## security / privacy / operability

- security、privacy、operability への主要な影響を確認する。
- 影響がない場合は `N/A` と根拠を記録する。

## escalation trigger

public contract、data migration、互換性、または recovery が難しい failure を含む場合は、同じ `plan.md` で `strict` または `critical` への再評価を行います。
