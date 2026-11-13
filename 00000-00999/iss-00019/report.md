---
種別: レポート（Issue）
ID: "iss-00019"
関連GitHub: ["#19"]
最終更新: "2026-11-14"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

## レビュー記録

- 仕様レビュー：合格（round-2、2026-11-14）。レビュアー spec-reviewer（Opus 5.5 / high）。P0/P1 0、P2 0、P3 1（計画の goal の言い方が、改めた R-03 の実機の受入より強い。直さずに記録）。round-1 は P0/P1 0 で合格だったが、P2 1・P3 1 を直して再レビュー。
  - 合格した文書の sha256：requirement.cue `c1927526c72932c6bcf51ae02755e79be44ef5b0a428b2a5b44cdf0bd2b1a161`、design.cue `ced0324c0ee766a972a3b7f77aeea9bb5bed21a78f3148906020f64c70ac56f8`、plan.cue `8c7b2acb0a5a7c457d8d6bc8bfbe239b10164b3a41a1341c5d68ea69bdb6e91d`
  - 結果：`.workbench/spec-review/iss-00019/round-2.json`（対応の記録は `review-response.md`）。照合のコミット `4efd9cbd956316e356ba703f4f8713f56f561f49`
- 最終品質ゲート：合格（fqg-iss-00019-1、attempt 1、2026-11-14）。合格のコミット `16bce01ace99e2952c7318032638804fa0492d0b`、範囲 `4efd9cb..16bce01`。quality-gate-reviewer（Opus 5.5 / medium）は P0〜P3 すべて 0、coverage 完全。テスト `npm run lint`・`npm test`（515 pass）・`npm run build` すべて exit 0。closure：`.workbench/final-quality-gate/fqg-iss-00019-1/closure.md`。記録だけのコミットはなし。
- PR：https://github.com/chemitaro/orca-web/pull/25（head `16bce01`）。CI：observable_ci PASS、merge_readiness READY（2026-11-14）。

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 稼働の印の要約の API `GET /api/worktrees/summary`（`orca-web.worktree-summary/v1`）。エージェントのいる worktree ごとに id、パス、ブランチ、プロジェクト、Issue、状態ごとの数（working・blocked・waiting・done・sleeping・unknown・total）、エージェント（id、mark、種類、since、詳細の道）を返す。読み取りの CORS は `/api/state` と同じ `ORCA_WEB_READ_ORIGINS`（既定 `http://127.0.0.1:47800`、Tailscale の IP があればその `:47800`）。
- エージェントの状態の決め方 `agentMark` を受け箱と要約で共有した（受け箱の段は変わらない）。
- 受け箱の連絡を読む Run を `selectMailRuns` で選ぶ：`updated_at` が7日以内に加え、生きている worker、今ある統括の端末、7日以内の task のある Run。動いている Run を先に、上限 50。読みは `--peek` のまま。
- 連絡と判断の関門の `createdAt` を ISO 8601 の UTC にした（解けない値は null）。
- Run の一覧の画面のポーリングを `web/poll-loop.js`（世代つきの輪）で1本にした。
- コミット：`8237039`（S-01）、`7a5b368`（S-02）、`07ef7a3`（S-03）、`100e674`（S-04）、`16bce01`（S-05 の README・AGENTS）。
- 実装担当（`launch.effective`）：impl（S-01〜S-03）codex / gpt-6.1-sol / medium、ui（S-04）claude / claude-opus-5-5 / medium。S-05 はタスク担当（Opus 5.5 / medium）。

### 逸脱と判断

- なし（計画どおりのセッションと値。仕様の変更なし）。
- S-04：予約の規則を `web/poll-loop.js` の `createPollLoop` に出した（D-05 が実装担当に任せた名前と形）。古い世代の読みは、成功でも失敗でも描かない。

## Verification

- テスト：開始のコミット `4efd9cb` で `npm test` 498 件 pass、`16bce01` で 515 件 pass。`npm run lint` と `npm run build` は成功。
- 実機（2026-11-14、`orca --version` 1.4.258、一時の port 18796 の `npm start`、読むだけ。件数と結論だけ）：
  - 要約：worktree 54、エージェント 60。同じ時の `/api/state` のエージェント 60、エージェントのいる worktree 54 と一致。状態ごと working 4、blocked 0、waiting 0、done 10、sleeping 43、unknown 3。`stale: false`。項目は決めたものだけ（題名や本文はない）。
  - CORS：`Origin: http://127.0.0.1:47800` の GET は 200 で `Access-Control-Allow-Origin` と `Vary: Origin`、OPTIONS は 204（allow-methods GET）。`http://127.0.0.1:47801` と `https://127.0.0.1:47800` は GET・OPTIONS とも 403。POST は 405。
  - 連絡を読む Run（`.workbench/live/select-runs-live.ts`、読むだけ）：Run 21 本のうち 10 本を選び、`run_b7c4f4c08bbc` が入った。当たった理由は、生きている worker 31、7日以内の task、`updated_at` が7日以内（今は 11-13 に進んでいた）。`coordinatorResolvedBy` は null だった。`updatedAt` を8日前に置き換えた入力でも選ばれ、旧来の7日の絞り込みでは落ちた。この Run の連絡を `--peek` で読んだ件数は 0（統括が受け取り済み。既読にしていない）。
  - 受け箱：`sources.mail` の `runsRead` 10、`runsFailed` 0。項目 61、連絡の項目 0（時刻の ISO 8601 は単体のテストで確かめた。実機には連絡がなく、項目の `since` の非エージェントの 2 件は ISO 8601）。

## Residual Risks / Follow-ups

- 実機の確かめの時点で、統括あての未読の連絡がなく、連絡の時刻の ISO 8601 は実機の値では確かめられなかった（単体のテストで確かめた）。
- 実機の読みで `run_b7c4f4c08bbc` の `coordinatorResolvedBy` が null だった（iss-00018 では `latest-task`）。今の統括の端末が `run-use` の後の端末で、親のない task を作っていないためと推定（未確認）。連絡を読む Run には生きている worker で入るので影響はない。
- 仕様レビューの P3：計画の goal の言い方が、改めた R-03 の実機の受入より強い。
- SpecDock 側の描画（epic-00471）と試しの画面（iss-00014）は範囲外。
