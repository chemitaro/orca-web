---
種別: レポート（Issue）
ID: "iss-00027"
関連GitHub: ["#27"]
最終更新: "2026-11-14"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

## レビュー記録

- 仕様レビュー：合格（round-2、2026-11-14）。レビュアー spec-reviewer（Opus 5.5 / high）。P0/P1 0、P2 0、P3 0。round-1 は P1 1（試しの画面の CSP が部品の CSS を拒む）、P2 1（47901 で import を試す道がない）、P3 1（並びの食い違い）で不合格。直して再レビュー。
  - 合格した文書の sha256：requirement.cue `9a72fc33f0c8acdc1144a37cffa188d485750ad79a49d3e239ac8f83b1bf10bb`、design.cue `2478be7c45c46025ab9df0491b160f88871e88732f7a3ec052adaeecf06773b3`、plan.cue `c8baf1a4251b0db5d8de0bac79f110244108e294b26bd1062a563dd9152e6bd1`
  - 結果：`.workbench/spec-review/iss-00027/round-2.json`（対応の記録は `review-response.md`）。照合のコミット `68d8c88b880abbdbbe91b8123aa38b7bb51658ea`
- 区切りのレビュー：なし（計画どおり）。
- 最終品質ゲート：合格（fqg-iss-00027-1、attempt 1、2026-11-14）。合格のコミット `3c6c24d0052be6aa76ec55a47dfd528afb5768b5`、範囲 `68d8c88..3c6c24d`。quality-gate-reviewer（Opus 5.5 / medium）は P0〜P3 すべて 0、coverage 完全（functional-correctness、requirements-closure、test-adequacy、security-baseline）。テスト `npm run lint`・`npm test`（568 pass）・`npm run build` すべて exit 0。closure：`.workbench/final-quality-gate/fqg-iss-00027-1/closure.md`。記録だけのコミットはなし。

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 要約の API（`orca-web.worktree-summary/v1`、版はそのまま）に、エージェントごとの経過の起点 `elapsedFrom` とその種類 `elapsedBasis`（`state`：状態の始まり。スリープと不明で状態の始まりがなければ `worktree-activity`：worktree の最後の活動。どちらもなければ null）を足した。
- 稼働の印の部品（`web/embed/agent-marks.js`・`agent-marks-view.js`・`agent-marks-icons.js`・`agent-marks.css`）。SpecDock が別のオリジンから import する ES Module。種類はアイコン（Claude・Codex は stablyai/orca のコミット 80a514c から写した実物のロゴ、ほかは中立の丸、種類なしは破線の丸）、状態は色（作業中 緑、許可待ち 赤、入力待ち 琥珀、完了 青、スリープ 灰と月の印、不明 灰の破線）、経過は「今・N分・N時間・N日」。読み上げの名前と title に種類・状態・経過と起点を持つ。要約の読みの輪 `watchWorktreeSummary` で1回読んで多くの箱や行に描ける。アイコンの表は `AGENT_ICONS` の1か所。
- 部品の4つのファイルにだけ、要約と同じ読み取りの CORS（許さないオリジンは 403）。
- 試しの画面を部品で描き直した（構造の図の箱の見本、Issue の一覧の行の見本、節の一覧。数の札は色の点と数だけ）。試しの静的なサーバーの CSP の style-src に試しの orca-web を足し、許さないオリジンの画面に部品の import の確かめを足した。
- コミット：`f0c55cd`（S-01）、`9375f07`（S-02）、`4598562`（S-03）、`7986ef4`（S-04）、`3c6c24d`（S-05 の README・AGENTS）。
- 実装担当（`launch.effective`）：ui（S-01）claude / claude-opus-5-5 / medium（dispatch ctx_bea19ebb8d3a）、impl（S-02〜S-03）codex / gpt-6.1-sol / medium（ctx_cce222fefa2c）、trial（S-04）claude / claude-opus-5-5 / medium（ctx_37145c363df6）。S-05 はタスク担当（Opus 5.5 / medium）。

### 逸脱と判断

- アイコン：仕様化の途中で統括の答えが案A（自前の図形、msg_8fb42dcb5148）から案B（実物のロゴ、本人の決定、msg_59c9286c72c4）に変わった。仕様は案B で書き、レビューに通した。
- S-02：型の検査を通すため、統括（タスク担当）の許可で `test/web/trial-view.test.ts` の既存の fixture に2項目を足した（計画の対象の外。期待値は変えない）。
- 実装の裁量（S-01）：経過が「今」のときの読み上げの文、知らない basis の文、max と size の既定、ロゴの完全一致のテストは `.workbench/orca-icons.tsx` があるときだけ（CI では先頭と末尾の照合）、JSDoc の型。
- S-04 の画面の確かめは、Chrome の拡張が複数つながって選べなかったので、ヘッドレスの Chrome を CDP で起動して行った（実装担当の報告）。

## Verification

- テスト：開始のコミット `68d8c88` で `npm test` 534 件 pass、`3c6c24d` で 568 件 pass。`npm run lint` と `npm run build` は成功。
- 実機（2026-11-14、`orca --version` 1.4.258、一時の port の `npm start`、読むだけ。件数と結論だけ）：
  - 要約：エージェント 60。スリープ 43 のうち 42 が `worktree-activity`（1 は worktree に時刻がなく null）、不明 3 のうち 2 が `worktree-activity`、1 が null。working 6・done 8 は `state`。`since` のある 14 件はすべて `elapsedFrom` = `since`。`stale: false`。
  - 部品の CORS：4つのファイルとも `Origin: http://127.0.0.1:47800` で 200 と `Access-Control-Allow-Origin`、`http://127.0.0.1:47801` で 403。
- 試しの画面（`npm run trial`、ヘッドレスの Chrome、写しは `.workbench/trial-evidence/iss-00027/`、コミットしない）：
  - `mac.png`（幅 1440px）：構造の図の箱の見本に、印（アイコン、色、経過）が箱の中に1行で収まる。スリープは灰と月、不明は破線、作業中は緑、完了は青。
  - `phone.png`（幅 390px）：箱が2列になり、印は収まる。
  - `forbidden.png`（47901）：(1)〜(6) すべて拒まれ、(6) 部品の import も失敗した。
  - 実装担当の確かめ（S-04）：幅 1440px と 390px で箱・行・節それぞれ 55 の印が枠に収まり、横のスクロールなし。印を選ぶと詳細とチャットの iframe が開いた。送信と「Orca で開く」はしていない。

## Residual Risks / Follow-ups
