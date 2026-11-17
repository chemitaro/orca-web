---
種別: レポート（Issue）
ID: "iss-00048"
関連GitHub: ["#48"]
最終更新: "2026-11-18"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 小窓（`/embed/agent`）が、エージェントの質問をカード（見出し、問い、選択肢と説明、複数選択、その他の自由入力、答える）で出す。答え済みは選んだ答えを示して閉じ、取り消しは「取り消されました」で閉じる。
- 構造化 Chat（Orca のチャットのタブ）の質問に、Orca のチャットと同じ RPC `agentSession.respondToQuestion`（itemId と revision の比較つき）で答えられる。新しい口 `POST /api/answer/intent`・`/api/answer/confirm` は今の送信と同じ守り（同じオリジンの JSON、短期のトークン、sendEnabled、使い捨ての票、送る前の記録、処理中の印、照会、自動で送り直さない）で、記録に答えの中身を残さない。
- 端末のエージェントの質問は読むだけ（理由と「Orca で開く」）。答える手段（answerer）は差し替えられる形で、iss-00049 が端末の手段を足す。承認は今のまま（iss-00050）。
- コミット：4965d7c（会話の質問の部分）、8567b3b（答えの門・アダプター・サービス・HTTP の口）、5e3a1c7（質問のカード）、ecca212（README.md・AGENTS.md）、43a4762（origin/main の取り込み。iss-00047 の PR #51）。

## レビュー記録

- 仕様レビュー（spec-reviewer、Opus 5.5 / high、standard なので1人）：合格。round-3 で P0・P1・P2・P3 がすべて0（`.workbench/spec-review/iss-00048/round-3.json`、検査 `round-3.check.json`）。
  - 合格した文書の sha256：requirement.cue `e216df2871b4b48e22b2d6c69b39f878f3c826fa1dc72a1e1154682d8d2faf4e`、design.cue `6ee95cbca9955e2e97699b89022fda1088353dc254b4a3c7b5f5ecd2661e2f42`、plan.cue `977cb707c3f52860c3458cdaef25c6c966f561c8b78a076ad82ec23376bb8a49`（コードの HEAD は 27b01fe）。
  - round-1：合格（P2 3件、P3 3件）。P2 は直す価値があるので直して確かめ直した（request_user_input_async を除く、照会で他の画面の答えを自分の成功にしない、otherAllowsEmpty の空の答え。P3：390px の「Orca で開く」、F-03 の unknown_shape、互換の節）。
  - round-2：合格（P2 1件：照会の digest に表示用に切った答えを使う誤り）。直した。
  - round-3：合格、指摘なし。

- 区切りのレビュー CP-1（code-reviewer、Opus 5.5 / medium、standards と spec の両方）：範囲 `27b01fe..8567b3b`、合格（P0〜P3 すべて0、`.workbench/code-review/iss-00048-cp1/round-1.json`）。手順の実装担当の報告で lint 0、test 767/767、build 0 を、タスク担当が同じコミットで再び確かめた。

- 最終品質ゲート（キャンペーン `.workbench/final-quality-gate/iss-00048-fqg/`、範囲 `27b01fe..43a4762`）：attempt 1 で合格。合格のコミット `43a47629a5bba5702b968c455526ff2051396e14`。主のレビュー（quality-gate-reviewer、Opus 5.5 / medium、観点 functional-correctness・requirements-closure・test-adequacy・security-baseline・reliability-recovery・e2e-user-flow）pass、P0/P1 0、P3 1。2人目 ChatGPT GPT-6 / Extra High（chatgpt-code-review-strict、GitHub の SHA の一致を確かめた）pass、P0/P1 0、P2 4。テスト lint 0・test 820/820・build 0。closure：`.workbench/final-quality-gate/iss-00048-fqg/closure.md`（写し `artifacts/closure.md`）。記録だけのコミットはない。
  - 計画の観点 concurrency-idempotency と ui-interaction は契約の観点の一覧にないので、reliability-recovery と e2e-user-flow で見た（キャンペーンの additional_instructions に記録）。

## Verification

### 実機の確かめ（S-04、2026-11-18、タスク担当）

- 試しの orca-web：`npm run trial -- --state-dir .workbench/trial-48 --orca-port 8794 --page-port 47920 --forbidden-port 47921`（8792・47900 は別の試しが使っていたので避けた）。専用の settings（`.workbench/trial-48/settings.json`）だけで `sendEnabled` を真にし、確かめた後に偽へ戻した。常駐の orca-web（8791）の設定は変えていない。
- 試しのエージェント（Claude haiku 5.5 / low、構造化 Chat。`orca orchestration worker-start` で起動。`orca agent launch` は Run の外の起動としてフックが止めたため）に、無害な質問（見出し『試し』、問い『試し：好きな色はどれですか？』、選択肢『赤』『青』）を AskUserQuestion で出させた。
  - 会話の API が `question` の部分（source chat、prompt の itemId と revision 1、問い1つ、選択肢2つと説明、allowOther 真、state pending）を返し、`GET /api/send/status` が `answer: {available: true}` を返した。
  - `sendEnabled` 偽：カードの問いと選択肢が読め、選択肢3つ（赤・青・その他）と「答える」が押せず、理由『送信が無効です（設定の sendEnabled が偽）』が出た。幅 1280px と 390px、明暗の4通りで、カードのはみ出し 0、文書の横スクロールなし、選択肢と送るボタンの高さ 44px 以上。
  - `sendEnabled` 真、390px：『青』を押すと「答える」が押せるようになり、押すと「答えました」、約1秒で答え済みの閉じた形（『答え済み 試し：好きな色はどれですか？ 青』）になった。エージェントは worker_done で『受け取った答え：青』と返した。
  - 送信の記録（試しの `sends/sends.jsonl`）：before の行は `action: answer`、prompt、questionCount、digest などで、選んだ id・ラベルを含まない（『青』と option id の出現 0）。after の行は submitted（code resolved）。
  - 試しのエージェントは worker-release で閉じた。
- Codex（GPT-6.1 Sol / low、構造化 Chat）の試し：Codex は Orca の構造化 Chat では質問を `request_user_input_async`（すぐ受付を返し、答えは後の発言で受ける）で出した。この Issue の決めたとおりツールの行のまま（カードにしない）なので、Codex の答えの確かめはできなかった。worker-stop で止めた。引き継ぎは Residual Risks に書く。
- 写し（Scope の `artifacts/`。カードの範囲だけで、会話のほかの中身は写していない）：`live-view-{1280,390}-{light,dark}.png`（sendEnabled 偽）、`live-answer-390-light.png`・`live-answer-selected-390-light.png`・`live-answer-done-390-light.png`（答える前・選んだ後・答え済み）、`fixture-card-*.png`（画面の実装担当の偽の会話による、複数問・複数選択・その他・長い語・HTML の文字・答え済み・取り消し・端末の未回答と答え済みのカード）。

## 逸脱と判断

- 逸脱（実装担当の切り替え）：Codex GPT-6.1 Sol / medium の実装担当（dispatch ctx_a4e2e572c73b）が、実行の前に `exec_command` が書き込みの許された根の中の Orca の Application Support の symlink を拒んだため何もできずに止まった（変更なし）。統括の依頼書の補足（『Codex が chat-scratch の symlink の拒否で止まったら、待たずに worker-stop して Claude Opus 5.5 / medium に切り替える』）に従い、worker-stop して Claude Opus 5.5 / medium（dispatch ctx_498915367a33）で S-01〜S-02 を始め直した。
- 範囲（統括、2026-11-18、msg_fd0230f65b01）：端末のエージェントの質問は読むだけ（答えは iss-00049）、承認はこの Issue では今のまま（iss-00050）。

## Residual Risks / Follow-ups

### 引き継ぎ：iss-00049（端末のエージェントの質問への答え）

- 調べた事実（Orca v1.4.261）：端末のエージェントの質問は、会話（nativeChat）のツールの呼び出し AskUserQuestion・request_user_input（Orca の `isAskUserQuestionTool`）で、答え済みは同じ callId のツールの結果の有無で分かる。答える RPC はない。Orca 自身（デスクトップ `sendNativeChatAskAnswer`、モバイル `use-mobile-native-chat-answer-send.ts`）は `terminal.send` でキーの列を間を空けて（`NATIVE_CHAT_QUESTION_STEP_MS`）打ち込む。列は `src/shared/native-chat/input/questions/native-chat-ask-answer.ts`：Claude は `buildAskAnswerKeys`（単一選択は選択肢の番号の数字で確定と次へ、自由入力は「Type something」の番号＋貼り付け＋Enter、複数選択は数字で入れ外しして右矢印 `\x1b[C` で次のタブ、複数問と複数選択は最後に Submit の Enter、preview の付く問いは数字で移り `n` でメモ、Enter で確定）、Codex は `buildCodexAskAnswerKeys`（数字で確定、メモは上下の矢印で行を移り Tab、未回答は `\x7f` と次へ、飛ばしたら確認で Enter）。モバイルは `requireWriteSettlement: true` で1つずつ届いたかを見て、途中で失敗したら「Answer partly sent — check chat before retrying」と示す。
- 危険：キーの列は途中まで届いた状態があり得る（選択が進んだまま止まる）。送った後に結果不明なら自動で送り直さず、会話の記録（ツールの結果）で確かめる。前面のプロセスと画面の状態（質問の選択が出ていること。`terminal.agentStatus` の `interactivePrompt`）を送る前に確かめる。
- 部品：`web/embed/question-view.js` の `answererFor` が source terminal に返す端末の手段を差し替える。サーバーには `/api/answer/*` に端末の経路を足す（今は `not_sendable`／`terminal_route`）。
- Codex の構造化 Chat の質問：実機で、Codex は構造化 Chat でも `request_user_input_async`（すぐ受付を返し、答えは後の利用者の発言で受ける）を使った。この Issue ではツールの行のまま。Orca は `formatAskAnswer`（`replyAsMessage` のとき『> 問い』と答えの引用の形）で普通の発言として答える。カードにして、今の送信（`agentSession.send`／`terminal.send`）で答えを発言として送るのが自然。iss-00049 の範囲に入れるかを決める。
- 最終品質ゲートの P2-d（端末の質問の失敗したツールの結果を答え済みと示す）も iss-00049 で直すのがよい。

### 引き継ぎ：iss-00050（承認）

- 構造化 Chat の承認は journal の `{kind: 'approval', title, description?, detail, options: [{id, label, description?, intent?: allow_once|allow_always|reject_once|reject_always}], resolution}` で、答えは `agentSession.respondToApproval`（`{envelope, itemId, expectedRevision, optionId}`、指紋の method は `agentSession.respondTo:approval`）。この Issue の答えの道（票、記録、照会、revision の比較）をそのまま使える。allow_always のような重い選択の見せ方を決める。

### 残る P2/P3（最終品質ゲートの情報。直していない）

- P2-a：確定の 5xx 応答を、画面が refused（押し直せる）と示す。Orca の revision の比較で二重の答えにはならないが、結果不明（照会できる形）にするのが正確。
- P2-b：応答のない通信で、カードが「送っています」のまま止まる（送信の欄にある期限が答えの流れにない）。
- P2-c：64KiB のその他の文を2つ以上書くと、本文の上限 128KiB を超えて 413 になる。
- P3（FQG-01）：空を許すその他に空の文で答えた質問の要約が「（答えなし）」と出る。
