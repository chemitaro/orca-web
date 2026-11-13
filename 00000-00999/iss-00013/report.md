---
種別: レポート（Issue）
ID: "iss-00013"
関連GitHub: ["#13"]
最終更新: "2026-11-13"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

（実装の後に書く）

### 逸脱と判断（タスク担当）

- 統括の判断（2026-11-13）：端末の送る経路は Epic D-03 の守りの2段ではなく、耐久の agent prompt の経路（`orchestrationRequestId` つき）。Epic の D-03・D-04 の書き換えをこの件に限り任され、書き換えた（epic-00004/design.cue）。
- 仕様のレビューで、`terminal.agentStatus` は Orca が保護つきで書くかの判定と別物と分かり、`terminal.inspectProcess` の前面のプロセスの確かめを足した。統括が了承した（msg_0d4cef153a1c）。
- 実装担当の report.md の書き込みは sandbox で拒まれうるので、実装担当は `.workbench/implement/iss-00013/report-implementation.md` に書き、タスク担当が下に写す。

## レビュー記録

### 仕様のレビュー（spec-review、保証レベル strict）：合格

- 合格の固定（sha256）：requirement.cue `da03e08b096a6adeb60dbc25cb356a4761cddf8c7a7ebd521931c7a40349e40a`、design.cue `b4b2d0bbc2eb393a76ca943381d670a99d59aba7b3dcf72fe10a4a59f115349e`、plan.cue `1e4b512ef29e9901850a07437a5db5b5f19f97e12053b1cfcaaa63c86e8353f7`、epic-00004/design.cue `c0e4e8621c8b477643ea05fac5486fcb6075cc4b4aab34b445c10e81a5be47dd`（D-03・D-04 だけが対象）
- 結果：`.workbench/spec-review/iss-00013/round-5.json`（Claude spec-reviewer Opus 5.5 / high。P0〜P3 0）。応答の記録は同じ場所の `review-response.md`
- 経過：
  - round 1：Claude fail（P1 2、P2 4、P3 2）、ChatGPT GPT-6 / Extra High（選択の証拠 verified=yes）fail（P1 6、P2 3）。直した
  - round 2：Claude fail（P1 1、P2 1、P3 1）、ChatGPT fail（P1 5、P2 3。続きの会話で選択の証拠が verified=no のため、有効な2人目としては受けず、中身を確かめて採った）。直した
  - round 3：Claude pass、ChatGPT fail（P1 4、P2 1。verified=no）。直した
  - round 4：Claude pass、ChatGPT fail（P1 1、P2 1。verified=no）。P1 は反証した（保存の読み直しと rename の間の隙。risks に書いた）。P2 は直した
  - round 5：Claude pass（0）。ChatGPT には送っていない（round 4 の後の変更は P2 の直しだけ）
- P2/P3 の残り：0（Claude）。ChatGPT の P2 で採らなかったもの：実機の確かめの道具の宛先を、統括が許した2つの handle の値に製品のコードで限ること（宛先は実行のたびに渡す。実行の記録で確かめる）

### 仕様の変更の再レビュー（round 6〜7、2026-11-14）：合格

- 変更の理由：最終品質ゲート attempt 01 の2人目（ChatGPT、verified=yes）の P1（宛先と無関係の非シェルの前面にも送れる）。前面のプロセスが宛先のエージェントそのもの（Orca の `recognizeAgentProcess` と同じ規則）であることを要する形に変え、直しの手順 S-11（session fix1、Codex GPT-6 Astra / high）を足した。
- 合格の固定（sha256）：requirement.cue `c6519f006337a30631107f9235d5e808367cd63c9106d7b65d53f0db6183471f`、design.cue `01210f095b741f3a45edc9eca88de3d4af3b5042d508118200035c8fa87fb808`、plan.cue `e0a2e374daab2684035d0c091cf4599a1c9c38d73f302c16c216b29cc31340a9`、epic-00004/design.cue `96907b22b5e819ff4b8f84545f39a09350fab2320a763f6fe7a7fefd5f12cab6`（canonical `54ce31434c6f448ea9a0d9c4595ca01ef30ba821`）
- 結果：`.workbench/spec-review/iss-00013/round-7.json`（Claude、P0〜P3 0）。round 6：Claude pass（P2 1、P3 1）、ChatGPT 新しい会話（verified=yes）fail（P1 2、P2 2、P3 1）。直した。round 7：Claude pass（0）、ChatGPT pass（P3 1、verified=no）
- P2/P3 の残り：ChatGPT P3 1（decisions の 2026-11-14 の「残る隙は競合だけになった」が、risks の Orca の居る証の場合を含まない。risks と Epic D-03 が正。文書は合格の版のまま変えない）

## Verification

### 実機の確かめ（2026-11-13、S-10、タスク担当）

この Mac の Orca 1.4.258（CLI も app も）。宛先は、統括が用意した検証用の worktree send-test の端末のエージェント2つ（Claude と Codex）だけ。業務中のエージェントには送っていない。送った文と返答の中身は記録していない。

`send-live` の集計（`.workbench/coding-task/iss-00013/send-live-run.ts` で実行。製品の道具と同じ組み立てで、失敗のときに場面の固定のコードだけを出す包み）：

| 場面 | 件数 | 結果 | 送る RPC |
|---|---|---|---|
| (1) 意図→確定で送る（Claude 1、Codex 1） | 2 | submitted 2 | 2 |
| (2) 照会（query なし）で記録が残る | 2 | recorded 2 | 0 |
| (3) 応答の消失（応答を捨てて時間切れにする） | 1 | unknown 1 → 照会で input_accepted | 1（requestShow 1） |
| (4) 宛先の変化（票の中の provider のセッション、ptyId を書き換え） | 2 | target_changed（session_changed 1、terminal_changed 1） | 0 |
| (5) 送らない場合（使い済みの票、本文の違い、送信の停止、期限切れ） | 4 | ticket_invalid 2、target_changed（text_changed）1、send_disabled 1 | 0 |

- 送る RPC は合わせて 3 回だけ。(3) の照会で、`orchestration.requestShow` が orca-web の Unix ソケットの呼び出しと同じ呼び手の鍵で receipt を引けることを確かめた（requirement の risks の確かめ）。
- 二重に届いていないこと：検証用の宛先の会話の記録で、確かめの文の利用者の件を数えた（中身は出さない）。Claude は 1 番目と 3 番目が 1 件ずつ、Codex は 2 番目が 1 件。重なりなし。
- 権限の確認待ちの端末を拒むことは、検証用の宛先で安全に作れないので、録画と再生のテストだけで確かめた。
- 構造化 Chat：検証用のセッションは届いていない（統括が本人に依頼中）。構造化 Chat の送信は録画と再生のテストだけで確かめた。
- 画面：一時の port（8798）、一時の設定（`sendEnabled: true`）、一時の記録の置き場で起動し、headless の Chrome（CDP、`Browser.close` で閉じた）で、send-test の Claude の `/embed/agent` を開いた。幅 390px と 1024px のどちらも、書く欄と確認の画面のはみ出し 0、送る欄の中の `script`・`img` 0、「確かめる」で確認の画面が出て「やめる」で本文を残して戻る、確定は送っていない（送信の記録のファイルは作られなかった）。Orca で開くは 390px で出ず、1024px で出る。
- 検証：`npm run lint` 0、`npm test` 472 件合格、`npm run build` 0（HEAD `5ee4be1`）。

## Residual Risks / Follow-ups

（実装の後に書く）

## 実装の記録（実装担当の記録を写す）
