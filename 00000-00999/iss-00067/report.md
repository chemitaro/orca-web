---
種別: レポート（Issue）
ID: "iss-00067"
関連GitHub: ["#67"]
最終更新: "2026-11-20"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 端末の Antigravity：前面のプロセスの照合を `src/orca/send.ts` の1か所の表（`FOREGROUND_MATCHERS`）にし、`antigravity` との完全一致だけを足した（R-01、F-01）。claude・codex の規則は同値のまま。`agy` などは合わせない。
- 構造化 Chat の Antigravity の質問：今のコードのまま RPC（`agentSession.respondToQuestion`）で答えられることを、実物で確かめた形の仮名の fixture のテストで固定した（R-02、F-03）。
- 端末の Antigravity の質問と承認：Orca 1.4.263 自身もキーの列を持たないので、キーの組を作らず、`agent_keys_unknown` で送らないことをテストで固定した（F-02）。`KEY_AGENTS`・`planKeys`・`approvalKey`・`keysUnsupported` は変えていない。
- README の送る経路・質問・承認の節に Antigravity の扱いを書いた。
- 実装担当：impl（Codex、`launch.effective` は agent codex・model gpt-6.2-sol・effort medium、dispatch ctx_7d897667abef）が S-01 を cb648d1 で実装。S-02（README と実物の確かめ）はタスク担当（Opus 5.5 / high）。
- コミット：cb648d1（S-01）、e3ada41（origin/main 9ad58fa の取り込み、iss-00068）、9194661（README）、8e9ec0c（origin/main 4ad7471 の取り込み、iss-00066）、c9b2173（README の直し：最終品質ゲート fqg1 の P3 の字下げと、端末の送信の受け取りの事実）。

## Verification

### 仕様を書く前の実物の確かめ（タスク担当、2026-11-20）

環境：orca-web main 58275ea、Orca 1.4.263、agy 1.5.12（モデル gemini-3.8-flash-low）。試しの orca-web は別のポート・専用の settings（`sendEnabled` 真）で起動し、常駐の orca-web（8791）と業務中のエージェントには触れていない。送り先は統括が用意した試しの送り先だけ。会話の中身、id、パス、アカウントは記録しない。

- 構造化 Chat の Antigravity（統括の worker、`kind: chat-tab`、`agentType: antigravity`）
  - `GET /api/send/status`：`route: chat`、送信・答え・承認 available、answerKeys は `chat_route`。
  - 送信（短い依頼文）：`accepted`（`dispatchState: pending`）。エージェントが答えた。
  - 質問：Antigravity の質問の道具（tool-call `ask_question`）が journal の `body.kind: question`（itemId `legacy:antigravity:…elicitation…`、`freeTextQuestionId` あり）として出て、会話の部分は `question`（`answerVia: rpc`）。
  - 答え（`/api/answer/intent`・`confirm` → `agentSession.respondToQuestion`）：単一選択（3択から1つ）、複数選択（4択から2つ）＋自由記述（その他）の2回とも `submitted`（`code: resolved`）、journal の件が `resolved` と送った answers になり、エージェントは選んだ答えで続けた（返事が答えの内容と一致）。
- 端末の Antigravity（統括が `orca terminal create --command` で agy を直接起動）
  - `terminal.inspectProcess` の `foregroundProcess`：`antigravity`（`agy` は本体を `exec` する bash の wrapper）。
  - タブの `agentStatus.agentType`：`antigravity`、`terminal.agentStatus` の `isRunningAgent` 真。
  - タブに `providerSession` がなく（agent launch の経路でない）、orca-web は `no_session` で送らない（今の規則による正しい拒み）。前面の照合を足す前は、セッションがあっても `foreground_mismatch` で送れない形。
  - Orca 1.4.263 の native chat は Antigravity の会話を読まない（`nativeChat.readSession` は `Transcript unavailable`、`NATIVE_CHAT_SUPPORTED_AGENT_LIST` に antigravity なし）。Orca も端末の Antigravity の待っている問いを `unsupported` にする（`readAgentPromptAnswers`）。
### 実装の後の実物の確かめ（タスク担当、2026-11-20、試しの orca-web は c9b2173 の前の 9194661 のコード）

- 構造化 Chat の Antigravity：単一選択（4択から1つ）の問いに答え、`submitted`（`code: resolved`）、journal の件が `answered` と送った answers、エージェントが選んだ答えで続けた。送れるかの口は `route: chat`、送信・答え・承認 available。
- 端末の Antigravity（統括が Orca の agent launch で起動した端末。本人の了承で今回だけ起動の止めのフックを外した）：
  - `launchAttested` 真、`foregroundProcess` は `antigravity`。
  - 起動の直後はタブに `providerSession` がなく `no_session`。統括の許した最初の指示を `orca terminal send` で1回送った後（accepted）、`providerSession` が付いた。
  - その送信の受け取りは `provider: unsupported`、`observation: unsupported`：Orca 1.4.263 は端末の Antigravity への送信をエージェントとして確かめない。orca-web はこの形を今の分け方どおり結果不明（`agent_not_verified`、要確認。送り直さない）にする（既存のテスト `test/orca/send.test.ts` の unsupported の受け取り）。
  - このタブには `ptyId` がなく（`parentLayout` にも `ptyIdsByLeafId` がない。直接起動の端末にはあった）、orca-web は `identity_unavailable` で送らない（宛先の同一性の今の規則どおり）。Orca の画面でタブが描かれた後に `ptyId` が付くかは未確認（統括が本人に表示を頼んだ。msg_522d268eae2a）。
  - よって、orca-web から端末の Antigravity へ文が届くところは未確認。照合は単体テスト（T-01・T-02）と前面の名前の実物の確かめだけ。
- Gemini CLI：この PC に `gemini` の CLI がなく、未確認（CLI 未導入。統括の了承、msg_6e61a42ec388）。Orca 1.4.263 の起動の表には `gemini`（`detectCmd: gemini`）があり、native chat の対応の表にはない（同梱のコードの読み）。

## Residual Risks / Follow-ups

- 端末の Antigravity への送信が届くところは未確認（上記）。本人がタブを表示して `ptyId` が付けば、試しの orca-web で1回送って追記する。届いても結果はいつも要確認（Orca が `provider: unsupported` を返すため）。
- 端末の Antigravity の質問と承認には答えない。Orca がキーの列を持ち、native chat が Antigravity の会話を読むようになったら、その版で確かめて別の Issue で写す。
- Gemini CLI は未確認（CLI 未導入）。Orca 1.4.263 の起動の表には `gemini` があるが native chat の対応にはない。導入された後に確かめ、送信の対象になるなら別の Issue にする。
- 逸脱：S-01 のコミットの件名（git-autocommit の生成）は「feat(send): Antigravity の質問応答を追加」だが、実際の本番の変更は前面の照合だけで、質問応答はテストの固定（履歴は書き換えない。PR の本文で正す）。git-autocommit のコミットに `Co-Authored-By` の行が付いていない。
- 仕様のレビューの ChatGPT の2人目は、Strict の束縛で仕様のブランチにないコードを読めなかった（下記）。

## レビュー記録

### 仕様のレビュー（spec-review、保証レベル strict）：合格（round 1、2026-11-20）

- 合格の固定（sha256）：requirement.cue `63b2d4d063343731fa7b4f2675d7c0b639dd9a8d5610f0765ce237473dc97b81`、design.cue `2e6903355d5a2eb5ac2609f9d15b301f79391c289fd8854f463bb60ecb0769ff`、plan.cue `674df9b0e538939b94b5ccbbf855bb6b3ff4a9aab425fc71ffe083e738b5420b`。仕様の版は `spec-dock/canonical@47957968e90e910e2b5502027be1771bcd2e5d59`、コードの固定は `58275ea68287d4ce663786e37c78f81885228d12`
- 結果：`.workbench/spec-review/iss-00067/round-1.json`（Claude spec-reviewer Opus 5.5 / high。validate exit 0、P0/P1 0、P2 1）。応答は同じ場所の `review-response.md`
- P2/P3 の残り：P2 1（Gemini CLI の未確認を D-05・S-02・T-07 の記録の項目に書いていない。この report.md の Verification に書いた）
- ChatGPT の2人目（chatgpt-spec-review-strict、GPT-6 / Extra High、選択の証拠 verified）：findings 0、review_status fail。欠陥の指摘ではなく、Strict の束縛で `spec-dock/canonical` のブランチにないコードを読めなかったため。仕様の文書だけを見た2人目で、コードとの照合は Claude だけなので、2人のレビューとは呼ばない

### 区切りのレビュー cp1（code-review、2026-11-20）：合格

- 範囲 `58275ea..cb648d1`（S-01）、Claude code-reviewer（Opus 5.5 / medium、axis both）。validate exit 0、P0〜P3 なし
- 結果：`.workbench/code-review/iss-00067-cp1/round-1.json`、`round-1.check.json`
- タスク担当の実行でも lint・test（1,131 合格）・build が exit 0

### 最終品質ゲート（final-quality-gate、2026-11-20）：合格

- 合格のコミット：`c9b217310ef5d7eeff40436c800641a35d520703`（キャンペーン `iss-00067-fqg2`、base `58275ea`、attempt 01）
- closure：`.workbench/final-quality-gate/iss-00067-fqg2/closure.md`
- レビュー（quality-gate-reviewer、Opus 5.5 / high）：pass、P0〜P3 なし。2人目（chatgpt-code-review-strict、GPT-6 / Extra High、選択の証拠 verified）：pass、findings 0。テスト：lint・test（1,138 合格）・build がすべて exit 0
- 前のキャンペーン `iss-00067-fqg1`（9194661）は3つのレーンとも合格したが、main の iss-00066 の取り込みでやり直した。その P3 1件（README の字下げ）は c9b2173 で直した
- 記録だけのコミット：なし（record_paths は空）
