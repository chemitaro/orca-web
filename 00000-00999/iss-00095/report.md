---
種別: レポート（Issue）
ID: "iss-00095"
関連GitHub: ["#95"]
最終更新: "2026-11-25"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

## Verification

## Residual Risks / Follow-ups

## レビュー記録

- 仕様のレビュー（spec-reviewer、Opus 5.5 / high）：round-2 で合格（2026-11-26）。P0〜P3 0。sha256：requirement.cue `22885cc6fe2aaa2033dfe76587602ceb5f0a00a590e89d61ce979551c2bf72bb`、design.cue `c3a33c198a2a2333578f37caf7258bd81d4d0b8a4234a3b3d53a4107ad1826e6`、plan.cue `d86c39b3eb8f5484fb0da7024c9825dd960ca13fac21a738771551d6397470bf`

## Outcome

- S-01 095464a：processAbsent（取得元が新しいときだけ判定）と asleep、段 unknown、unverified の 24 時間で眠っているの決まりを削除、画面の段（眠っているの後に不明、畳む）、README・AGENTS.md。実装担当：Claude（ctx_52211f557962、claude-opus-5-5、medium）。terminal が null の端末のタブは判定できない（不明）と読んだ。
- 最終品質ゲート：合格（2026-11-26）。095464a、レビュー pass（P3 1、記録のみ：tabs が古い間に awaiting-restore で知らない state の端末のタブが眠っているに入る稀な場合）、テスト lint・test（1374）・build すべて 0。
- マージ：PR #96（2026-11-26、a91d01e、head 095464a、CI OBSERVED_CI_PASS・READY）。常駐の orca-web をタスク担当が入れ替えた（利用者の依頼）。
