# strict Completion Guide

[Issue Plan Guide](../issue-plan.md) の共通構造に加えて、public contract、Runtime、data、migration、または compatibility により影響が広く、回復が難しい変更の完成基準です。選択理由、risk factor、再評価条件は canonical `plan.md` 本文に記録します。

## 完成時の状態

- As-Is / To-Be と、変更する責務・interface・data boundary が明確である。
- compatibility と migration の対象、失敗時の影響、forward recovery が説明されている。
- rollout の順序と、残余リスクを受け取る handoff が明確である。

## 検証とnegative test

- end-to-end verification、互換性確認、対象 regression を示す。
- failure mode ごとの negative test、または同等の失敗確認を示す。
- migration failure と rollback / forward recovery を検証する。該当なしなら `N/A` と理由を記録する。

## rollback / migration

- migration 前提、rollback 条件、forward recovery の担当と順序を記録する。
- migration が不要なら `N/A` と理由を記録する。

## security / privacy / operability

- security、privacy、operability、observability への影響と確認方法を記録する。
- 影響がない場合は `N/A` と根拠を記録する。

## escalation trigger

security / privacy incident、不可逆な data loss、高い blast radius、または復旧時に incident response が必要な条件を含む場合は、同じ `plan.md` で `critical` への再評価を行います。
