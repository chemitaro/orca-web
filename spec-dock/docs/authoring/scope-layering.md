# Scope Layering Guide

Initiative / Epic / Issue は、同じ内容を三回書くための階層ではありません。上位は広い目的と境界を、下位はその範囲で実現する具体的な価値を扱います。

## スコープごとの責務

| Scope | 主に扱うこと | 下位へ渡すもの |
|---|---|---|
| Initiative | 複数 Epic にまたがる戦略的な problem / outcome、投資境界、portfolio dependency、広い risk | 目標、投資範囲、全体の制約 |
| Epic | 一貫した product / architecture outcome、vertical Issue slice、cross-Issue contract、rollout / integration | Issue 分割、依存方向、横断契約 |
| Issue | 一つの end-to-end で観測できる価値、具体的 acceptance、implementation / tests / docs / migration、rollback / handoff | 実装結果、検証、残るリスク |

## Plan の責務

- Initiative Plan は、Epic を進める順序、投資上の依存、全体としての検証と見直しを扱います。Issue の implementation step は扱いません。
- Epic Plan は、Issue 分割、統合する順序、cross-Issue contract の確認、横断的な verification を扱います。個別 Issue の実装 task を再掲しません。
- Issue Plan は、implementation steps、tests、docs、migration、rollback、handoff を扱います。親の目的、Issue 分割、依存方向を変更しません。

## 親 scope を再定義しない

- Initiative と Epic に、Issue の実装 micro-step や Issue の Planning Level を要求しません。
- Epic は Issue の目的、分割、依存方向を定めます。Issue はそれらを言い換えず、担当する acceptance と実装上の具体化に集中します。
- Issue で親の目的、成功条件、横断契約を変える必要が見つかったときは、親 scope に戻して更新します。Issue の Plan 内だけで変更を確定しません。
- 親の未解決事項を下位 scope が推測で埋めないでください。実装を左右する場合は判断を依頼し、必要な正本へ明記します。

## 保証レベル（CUE の Scope）

CUE の Scope では、保証レベル（`requirement.cue` の `assurance`）を一段上で決めます。

- Issue の保証レベルは、Epic の計画で Issue に切り分けるときに決めます。Epic の保証レベルは Initiative の計画で、Initiative は作るときに決めます。
- 親の `plan.cue` は、子の Scope への切り分け（`slices`）に子の ID と任せる要件（`covers`）を書き、子の保証レベルは書きません。値は子の `requirement.cue` だけにあります。
- Epic と Initiative の `plan.cue` は、実装の手順とテストを持たず、`slices` を持ちます。つながりの規則は、その要件を任せた子への切り分けで満たします。

詳しくは [CUE Authoring Guide](cue.md) にあり、人向けの説明資料（`explanation.html`）の書き方は [Explanation Guide](explanation.md) にあります。Markdown の Scope では、上の「親 scope を再定義しない」のとおり、Issue の Planning Level を親に求めません。

## 文書との対応

各 scope でも文書の役割は同じです。

- [Requirement Guide](requirement.md): problem、outcome、scope、acceptance を扱う。
- [Design Guide](design.md): Requirement を実現する構造と責務境界を扱う。
- [Issue Plan Guide](issue-plan.md): Issue での実装順序と verification を扱う。
- [Report Guide](report.md): 実装後の outcome と残るリスクを扱う。

調査、会話、下書きは判断の材料です。長く参照される結論は Requirement、Design、Plan、または accepted ADR に反映します。
