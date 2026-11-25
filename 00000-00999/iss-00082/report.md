---
種別: レポート（Issue）
ID: "iss-00082"
関連GitHub: ["#82"]
最終更新: "2026-11-25"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- S-01 a023557（`/`・`/index.html` を指揮の画面に、受け箱を `web/inbox.html` の `/inbox` に、`/apexes` は別名、6画面の見出しのリンク）、S-02 8429ee8（`coordinatorAgent` を handle → parentPaneKey → 束の頂点の順に、`buildRunTree`・`buildRunList` に束の入力、`/api/runs` と `/api/runs/<id>/tree` に頂点の一覧と同じ対応表）、S-03 8966d3b（README・AGENTS.md）。実装担当：Claude（dispatch ctx_8f0cfbc21c7c、claude-opus-5-5、--effort medium）。
- cp1（d650200..8429ee8、code-reviewer Opus 5.5 / medium の2人）：合格、指摘 0。
- 逸脱と判断：今の世代の束に持ち主がなければ古い世代には結ばない（仕様のレビューの P3 への答え）。inbox.html の CSS と JS を絶対パスにした。古い handle が残るとき null を期待していた既存のテストを D-03 に合わせて直した。

## Verification

- 試しの orca-web 2つ（変更前の main d650200 を 8795、この Issue の 8429ee8＋文書を 8794、どちらも実物の Orca を読むだけ）：
  - 道：`/`・`/index.html`・`/apexes` が「指揮 — orca-web」、`/inbox` が「orca-web の受け箱」、`/runs` が Run の一覧（どれも 200）。
  - Run の木の根が結べた数：変更前 18 本中 2、変更後 18 本中 2（今の実データでは増えない）。残りの Run の統括は構造化 Chat で、子のタブがもう閉じており、起動したばかりの対応表が空のため結べない（受け入れた制約。Orca 本体への要望で解く）。端末の統括で子のタブが閉じた場面と古い handle の場面は T-04・T-07 のテストで確かめた。

## Residual Risks / Follow-ups

- Orca 本体への要望は下書きだけで、送っていない（利用者の了承の後に送る）。下書き：

  # Orca（stablyai/orca）への要望の下書き（送っていない。送るのは利用者の了承の後）

  ## 題
  orchestration run-list / run-show: 統括（coordinator）の識別子を出力に含めてほしい

  ## 本文（日本語）

  ### 何がほしいか
  `orca orchestration run-list --full` と `run-show` の出力に、Run の今の統括を指す識別子を含めてほしい。たとえば次のどれか1つ。

  - 統括のペインの鍵（DB の `runs.coordinator_pane_key` に当たるもの）
  - 統括の Orca のセッションの id（`runs.coordinator_orca_session_id` に当たるもの）

  ### なぜ要るか
  外部の道具で、Run の統括と配下の作業者を結んで「誰が誰を指揮しているか」を見せている。構造化 Chat の統括は `coordinator_handle` を持たない。そのため、統括を特定するには、生きている作業者のタブの `parentPaneKey` に頼るしかない。

  作業者は報告を終えると自動で閉じる。そのため、作業者が全員閉じた後に外部の道具を起動し直すと、その Run の統括を特定できない。このときこそ、人が統括をフォローする必要がある。

  task の記録の `created_by_pane_key` は、端末の統括では値を持つ。しかし構造化 Chat の統括では null になる。

  ### 今の観察（Orca v1.4.272）
  - `run-list --full` の項目：`id, objective, coordinator_handle, consumer_generation, legacy, created_at, updated_at`。
  - 構造化 Chat の統括の Run では `coordinator_handle` が null。根の task の `created_by_pane_key`・`created_by_terminal_handle` も null。

  ## Body (English)

  **Request:** Please include an identifier of the run's current coordinator in `orca orchestration run-list --full` and `run-show` output — e.g. the coordinator pane key (as stored in `runs.coordinator_pane_key`) or the coordinator's Orca session id (`runs.coordinator_orca_session_id`).

  **Why:** An external dashboard links each run's coordinator to its workers to show who is directing whom. For structured-chat coordinators, `coordinator_handle` is null, so the only way to find the coordinator is the `parentPaneKey` of a still-open worker tab. Workers close themselves after reporting, so once every worker has closed, a restarted dashboard can no longer identify the run's coordinator — exactly when a human needs to follow up with it. `created_by_pane_key` on tasks is set for terminal coordinators but null for structured-chat coordinators.

  **Observed on Orca v1.4.272:** `run-list --full` returns `id, objective, coordinator_handle, consumer_generation, legacy, created_at, updated_at`; for structured-chat coordinators `coordinator_handle` and the root task's `created_by_pane_key` / `created_by_terminal_handle` are null.

## レビュー記録

- 仕様のレビュー（spec-reviewer、Opus 5.5 / high、standard）：round-2 で合格（2026-11-25）。P0〜P2 0、P3 1（D-03 の「なければ」は consumerGeneration が読めないときだけ。今の世代の束に持ち主がなければ古い世代の頂点には結ばず結べないまま。iss-00078 R-02 の 4 に合わせる。実装の依頼書で伝える）。
  - 合格した文書の sha256：requirement.cue `59d7b83e1e5911d5cc45984817e3899b113f50eb4615462f08d8a1bfab4aa88f`、design.cue `e6a9da45f9e8a0c28ec54d38d54a3329220f79aa5fbfaa8c24f79ceef1e70921`、plan.cue `4d19a441758016e5f8a71b1036c13ee0b1ca60309c3cbe6af2090a4c346201b6`
- 最終品質ゲート：合格（2026-11-25）。c69a8bb、キャンペーン iss-00082-fqg-1 の attempt 02（attempt 01 の P3 の文書を直した）。レビュー pass（P0〜P3 0）、テスト lint・test・build すべて 0（Node 24.14.0）。
