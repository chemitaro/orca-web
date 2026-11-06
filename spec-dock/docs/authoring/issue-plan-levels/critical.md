# critical Completion Guide

[Issue Plan Guide](../issue-plan.md) の共通構造に加えて、security / privacy、高い blast radius、不可逆な変更、または回復困難な failure を含む変更の完成基準です。選択理由、risk factor、再評価条件は canonical `plan.md` 本文に記録します。

## 完成時の状態

- 守る data、threat、影響範囲、失敗時の利用者・運用への影響が明確である。
- staged rollout、停止条件、kill switch、backup / restore、incident response が実行可能な粒度で説明されている。
- 実装前に残る人間の判断と、完了後の ownership / handoff が明確である。

## 検証とnegative test

- 正常経路、境界、権限・data 保護、rollout の end-to-end verification を示す。
- threat に対応する negative test、failure injection、または同等の失敗確認を示す。
- backup / restore、kill switch、incident response の検証方法を示す。該当なしなら `N/A` と理由を記録する。

## rollback / migration

- migration の前提、停止条件、rollback、backup / restore、forward recovery の順序を記録する。
- migration が不要な場合に限り、migration を `N/A` と理由付きで記録する。不可逆性、backup / restore、kill switch、incident response を含む復旧手段とその評価は必ず記録し、省略しない。

## security / privacy / operability

- security、privacy、auditability、operability、monitoring と incident communication の確認方法を記録する。
- 影響がない項目は `N/A` と根拠を記録する。

## escalation trigger

threat、影響範囲、復旧手段、または人間の承認条件に未解決事項が残る場合は、実装を進めず、same `plan.md` に再評価条件と未決事項を記録して判断を求めます。
