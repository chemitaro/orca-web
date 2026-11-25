---
種別: レポート（Issue）
ID: "iss-00079"
関連GitHub: ["#79"]
最終更新: "2026-11-25"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

## Verification

## Residual Risks / Follow-ups

## レビュー記録

- 仕様のレビュー（spec-reviewer、Opus 5.5 / medium、light）：round-3 で合格（2026-11-25）。P0〜P3 0。
  - 合格した文書の sha256：requirement.cue `0aef21c48f3c576f3eebb694b8a994513ea83ab4ab9092ef88ca86ee42be5555`、design.cue `8712611c44eb4039ff460894736e0c4c0cea669a3aa5bd9262e68f5b7864ed3b`、plan.cue `7a0593e84404c2609a4573ad8f9ba8329968e4d72e360e6e4bec3dc5c10a71b6`

## Outcome（実装）

- S-01 613e5cc（src/apex/team.ts の buildTeam と ApexItem.team）、S-02 2384d89（チームの帯 apexes-team-view.js・apexes-team-dom.js、README・AGENTS.md）、FQG-01 の直し eb840e6（束で昇格したメンバーの親を親の task の最後の Dispatch の節に）。実装担当：Claude（dispatch ctx_23f39b9a1bd9・ctx_b2f89e4360ca、claude-opus-5-5、--effort medium）。
- 逸脱と判断：エージェントの節の題名は task の題名を先に使う。輪になる親は頂点の直下。まとめの「完了 n」は子孫を含む。履歴の帯は dispatchId を持つ節。帯の開閉は同じ頂点の間だけ保つ。T-02 の上限 30 はテストの目安で画面では切らない。
- 試しの orca-web（実物の Orca を読むだけ）：配下 95 の統括で、畳んだ帯に「チーム 95（作業中 2・待ち 0・完了 89・失敗 4）」が出た（ヘッドレスの Chrome、1280×1000）。
- 最終品質ゲート：合格（2026-11-25）。eb840e6、キャンペーン iss-00079-fqg-1 の attempt 02。レビュー pass（P0〜P3 0）、テスト lint・test（1308）・build すべて 0（Node 24.14.0）。
