---
種別: レポート（Issue）
ID: "iss-00078"
関連GitHub: ["#78"]
最終更新: "2026-11-25"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- S-01 4f93cf3（読む項目と内部の値、snapshotWithExtras）、S-02 bcc574c（束と BundleOwners）、S-03 f449064（A3〜A6・memo・札・結べない束）、S-04 a5e1454（/api/apexes の接続と画面）。cp1（4cffba8..a5e1454、code-reviewer Opus 5.5 / medium の2人）：合格、P2 2件（古い世代の失敗で A6 が鳴る、直った失敗が札に残る）を直した（aa4ea9b）。S-05 802e7f4（README・AGENTS.md）。
- 実装担当：impl（Claude、dispatch ctx_39a5a689d7fc と follow-up ctx_2a42f8b6edec、claude-opus-5-5、--effort medium）。

### 逸脱と判断（実装担当の解釈、タスク担当が仕様の意味の内と判断）
- A4 の生きた仕事から ask・gate の attention のある Dispatch を除いた（A3 が扱い、A3 の 90 秒の猶予を成り立たせるため）。
- 束で入れたメンバーの parentId は親の task の最後の Dispatch のエージェント（同じ頂点のメンバーなら）か頂点。構造化 Chat の対応表は生きた辺のメンバーからだけ観測する。読みの世代はどの組の読みが終わっても増える。worker のない子は結べないもののまま。

## Verification

- 試しの orca-web（iss-00078 の a5e1454、127.0.0.1:8794、送信は無効の別の設定、実物の Orca を読むだけ、2026-11-25、connected・stale 偽）：
  - 頂点 74、メンバー 11、結べないもの 1（chat-tab）。counts：対応が必要 3→1（読み直すたびに実データで変わる）、作業中 7、完了 64。
  - 配下を持つ頂点 5、配下（メンバーと束の Dispatch を重ねずに）合計 155、動いている 7。
  - 理由：question（ask の Dispatch があり統括が done のまま 90 秒を超えた頂点）、members_working、live_work、working、done、sleeping。札：merge_pending 1。
  - 対応が必要の頂点の question は、全 Run の worker-list を読んで、attention input を持つ生きた Dispatch（ready・dispatched・live）が1つあることと一致した。
- Epic の問い（世代）：consumer_generation が 2 以上の Run は 7。consumer_generation と task の created_by_run_generation は同じ単位で、今の世代の根の task がある Run は 4（作成者の paneKey は 1 Run だけが持ち、ほかは構造化 Chat の統括で null）。引き継いだがまだ作業を出していない Run 3 では今の世代の根の task がなく、生きた仕事は結べない束になる（仕様どおり）。/clear で paneKey が変わるかは読むだけでは確かめられず、Epic の未決として残す（対応表は頂点の id で持つので影響しない）。

## Residual Risks / Follow-ups

## レビュー記録

- 仕様のレビュー（spec-reviewer、Opus 5.5 / high、standard）：round-3 で合格（2026-11-25）。P0〜P2 0、P3 1（束で結んだメンバーの parentId。実装の裁量として、親の task の Dispatch のエージェントがメンバーならその id、なければ頂点の id とする）。
  - 合格した文書の sha256：requirement.cue `107b0e60d2a3b54050dce3c9145226a8389be75716cdd0f6154d05b253d8ff56`、design.cue `b72d192cce518e2fd618398a01bf4eb0b025685d1968c877cf0ccab7617b6a56`、plan.cue `7a5b1f03aa9e29d89bbf8e0d57f678f0b0bf2d5812a102f0fbb69ae33b103924`
  - 基準のコード：main 1da3c6c。結果：タスク担当の Workbench `.workbench/spec-review/iss-00078/round-1〜3.json`、応答 `review-response.md`
- 最終品質ゲート：合格（2026-11-25）。合格のコミット 802e7f4、キャンペーン iss-00078-fqg-1。レビュー pass（P3 1：A4 の解釈）、テスト lint・test・build すべて 0（Node 24.14.0）。
