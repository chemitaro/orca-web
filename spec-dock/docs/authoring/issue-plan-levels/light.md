# light Completion Guide

[Issue Plan Guide](../issue-plan.md) の共通構造に加えて、局所的な変更で、失敗時の影響が小さく即時 revert できると説明できる場合の完成基準です。選択理由、risk factor、再評価条件は canonical `plan.md` 本文に記録します。

## 完成時の状態

- 対象の acceptance と変更境界が一意である。
- 局所的であることと、revert 可能な手順が Plan から分かる。
- 未解決の作業を完了扱いにせず、残るものは exit / handoff に記録する。

## 検証とnegative test

- 直接の acceptance を確認する targeted verification を示す。
- 代表的な失敗入力または失敗経路を一つ以上確認する。
- 影響範囲の近い regression を確認する。該当なしなら理由を `N/A` と明記する。

## rollback / migration

- revert 手順、または変更を無効化する手順を記録する。
- migration が不要なら `N/A` と理由を記録する。

## security / privacy / operability

- security、privacy、operability への影響を確認する。
- 影響がない場合は `N/A` と根拠を記録する。

## escalation trigger

public contract、共有 data、migration、または回復困難な failure が見つかった場合は、同じ `plan.md` で `standard`、`strict`、または `critical` への再評価を行います。
