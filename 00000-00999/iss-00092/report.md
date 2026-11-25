---
種別: レポート（Issue）
ID: "iss-00092"
関連GitHub: ["#92"]
最終更新: "2026-11-25"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

## Verification

## Residual Risks / Follow-ups

## レビュー記録

- 仕様のレビュー（spec-reviewer、Opus 5.5）：round-1 で合格（2026-11-26）。sha256：requirement.cue `60e8917c5ce3f9264dcff5217795c2c832f7a1506374d1a53390b104305398ec`、design.cue `ffe36c003832e3245eee201b9c3132759f97a85832c49b8b0bdcb5d1ce3ebaaf`、plan.cue `51a91697da9d54f3f129cbbb311a3cf75607d7396cbedcb905a05bd771172eff`。P2 は実装の依頼書でタスク担当が読み方を決めた（下の逸脱と判断）。
  - P2（アイコン）：members の agentType を agentId で引く。
  - P2（並び）：浅い順・新しい順（エージェントは stateStartedAt、Dispatch は createdAt）は出す節を選ぶ優先だけで、出す並びは木の順。8 と「ほか n」は稼働中の節だけを数え、祖先は数えずに足す。
  - P2（常駐の入れ替え）：マージの後にタスク担当が行う（利用者の依頼 2026-11-25）。

## Outcome

- S-01 97cf4fc：`web/apexes-live-view.js` の buildLiveTeam（稼働中の節と薄い祖先、浅い順・新しい順に 8 まで選び「ほか n」、出す順は木の順、agentType は members を agentId で引く）、`apexes-dom.js` の renderLiveTeam（行のボタンの中に span と textContent・--depth だけで描く）、style.css・README・AGENTS.md。実装担当：Claude（ctx_b10782fb94d6、claude-opus-5-5、medium）。題名は 39 字＋「…」。
- #91 の main（54dbf7a）を取り込み、README の衝突を両方の文を生かして直した（7336df4）。
- 最終品質ゲート：合格（2026-11-26）。7336df4、レビュー pass（P0〜P3 0）、テスト lint・test（1370）・build すべて 0。
- マージ：PR #94（2026-11-26、5abb670、head 7336df4、CI OBSERVED_CI_PASS・READY）。常駐の orca-web をタスク担当が入れ替えた（利用者の依頼）。
