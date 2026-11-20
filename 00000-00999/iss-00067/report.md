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

（実装の後に書く）

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
- Gemini CLI：この PC に `gemini` の CLI がなく、未確認（CLI 未導入。統括の了承、msg_6e61a42ec388）。Orca 1.4.263 の起動の表には `gemini`（`detectCmd: gemini`）があり、native chat の対応の表にはない（同梱のコードの読み）。

## Residual Risks / Follow-ups

（実装の後に書く）

## レビュー記録

### 仕様のレビュー（spec-review、保証レベル strict）：合格（round 1、2026-11-20）

- 合格の固定（sha256）：requirement.cue `63b2d4d063343731fa7b4f2675d7c0b639dd9a8d5610f0765ce237473dc97b81`、design.cue `2e6903355d5a2eb5ac2609f9d15b301f79391c289fd8854f463bb60ecb0769ff`、plan.cue `674df9b0e538939b94b5ccbbf855bb6b3ff4a9aab425fc71ffe083e738b5420b`。仕様の版は `spec-dock/canonical@47957968e90e910e2b5502027be1771bcd2e5d59`、コードの固定は `58275ea68287d4ce663786e37c78f81885228d12`
- 結果：`.workbench/spec-review/iss-00067/round-1.json`（Claude spec-reviewer Opus 5.5 / high。validate exit 0、P0/P1 0、P2 1）。応答は同じ場所の `review-response.md`
- P2/P3 の残り：P2 1（Gemini CLI の未確認を D-05・S-02・T-07 の記録の項目に書いていない。この report.md の Verification に書いた）
- ChatGPT の2人目（chatgpt-spec-review-strict、GPT-6 / Extra High、選択の証拠 verified）：findings 0、review_status fail。欠陥の指摘ではなく、Strict の束縛で `spec-dock/canonical` のブランチにないコードを読めなかったため。仕様の文書だけを見た2人目で、コードとの照合は Claude だけなので、2人のレビューとは呼ばない
