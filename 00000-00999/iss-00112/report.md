---
種別: レポート（Issue）
ID: "iss-00112"
関連GitHub: ["#112"]
最終更新: "2026-11-27"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

## Verification

## Residual Risks / Follow-ups

## レビュー記録

- 仕様のレビュー（spec-reviewer、Opus 5.5 / high、standard）：round-1 で合格（2026-11-27）。P0・P1 0、P2 1・P3 1。P2（判定の変更で test/server/apexes-api.test.ts も落ちる）は S-01 の試験の直しに含める。P3（excludes の「カード・木の印は status が needs_action の頂点だけを数える」は事実と違い、カードと木の印は status に関わらず出る）は、それらを変えないという対象外の意図は同じなので文書は直さない。結果 `.workbench/spec-review/iss-00112/round-1.json`。sha256：requirement.cue `3a7d1762247417c97e681d1582933900ed5d92c256c845c9c9afbce65d748c68`、design.cue `66144801cb1dbf31937d1b6b4c3e9569c68d96ae14658f98a3b9a721deabe5c3`、plan.cue `ab78bf1d456889a65bd6df7162627d5b13c347c84b0fb25e63d8a542d0a07e96`
