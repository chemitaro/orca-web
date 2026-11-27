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

## 実装と確かめ（2026-11-27、Opus 5.5 / high、同じセッション）

- S-01 はコミット ef83d2e（status の振り分け、試験、AGENTS.md）。S-02 は fd4cb73（列の間の線と試験）。
- 実物（T-05）：worktree の orca-web を 8793 で起動し、headless Chrome で 1280×820 を撮影。3列の間に縦の線、指先の頂点は作業中の列（理由 未回答の質問・配下が作業中・仕事が残っている）、対応が必要 0。Chrome 拡張のブラウザーは localhost に届かなかった（8791 も同じ）。
- 最終品質ゲート：合格（campaign iss-00112-fqg-1、fd4cb73、レビュー P0〜P3 0、lint・test 1428・build 合格）。
- マージ：PR #113（CI OBSERVED_CI_PASS・READY、head fd4cb73）、マージコミット 828ac3d。本体の main を取り込んだ。
- 残り：常駐への反映は利用者の入れ替え（ビルドと service:restart）を待つ。配下の節の「対応が必要：質問」の印は今のまま（対象外）。S-01・S-02 のコミットは git-autocommit の生成で Co-Authored-By の行がない。
