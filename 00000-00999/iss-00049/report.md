---
種別: レポート（Issue）
ID: "iss-00049"
関連GitHub: ["#49"]
最終更新: "2026-11-18"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

## レビュー記録

- 仕様レビュー（spec-reviewer、Opus 5.5 / high、standard なので1人）：合格。round-2 で P0・P1・P2 が0、P3 1件（`.workbench/spec-review/iss-00049/round-2.json`、検査 `round-2.check.json`）。
  - 合格した文書の sha256：requirement.cue `4fc503ef5afe96f1ffb30c2f4c0d6894f9ae42ad62f1a8ddaea77080e86ea386`、design.cue `214047d0c04f0b43579dfc176fe4442a538e236eb6b826c7ed7b5200ac243ebb`、plan.cue `d107b1893a134e13881b77efd0c3e2dfca83a895a835223c030421eb5a136917`（コードの HEAD は 3b7aece）。
  - round-1：合格（P2 7件、P3 1件）。直す価値があるので全部直して確かめ直した（status の agentType、async の受付の結果で閉じる誤り、preview の判定、キーの文の制御文字、Orca の画面で途中まで進めた質問の残る危険、確かめの拒みの押し直せない形、S-02 の完了条件、切った async の問い）。応答は `review-response.md`。
  - round-2：合格（P3 1件：画面の buildAnswers が keys のその他の文の Tab・改行を許し、サーバーだけが拒む）。文書は変えず、F-04 の読みとして S-03 の実装担当に画面でも同じ条件と理由の言葉を入れるよう伝える（逸脱と判断に記録）。

## Verification

## 逸脱と判断

- 逸脱（実装担当の切り替え）：Codex GPT-6.1 Sol / medium の実装担当（dispatch ctx_6a5fea160dad）が、最初の読みのコマンドで、書き込みの許された根の Orca の Application Support の symlink を拒まれ（symlinked writable roots are not supported）、何もせずに止まった（変更なし）。統括の依頼書の補足に従い worker-stop し、Claude Opus 5.5 / medium（dispatch ctx_0b314dede454）で S-01〜S-02 を始め直した。

- 仕様レビュー round-2 の P3（keys のその他の文の制御文字を画面でも拒む）：F-04 の意味を変えない読みとして、S-03 で画面の条件と理由の言葉（control_character）を足す（タスク担当の判断、2026-11-18）。

## Residual Risks / Follow-ups

## 実装の記録

- 基準（開始のコミット 3b7aece、`npm ci` の後）：`npm run lint` 成功、`npm test` 820 pass・0 fail、`npm run build` 成功。既存の失敗なし（`.workbench/implement/iss-00049/start.md`）。
- S-01（コミット 4f9bff1）：会話の正規化に answerVia・preview と request_user_input_async の質問の部分（D-01）、`src/send/keys.ts`（D-02）、`src/send/question-state.ts` と `terminalPromptOf`（D-03）。テストを先に書いて失敗を確かめてから作った（T-01〜T-05）。
  - `node --test test/transcript/*.test.ts test/send/*.test.ts`：174 pass・0 fail。`npm run lint`：成功。`npm test`：849 pass・0 fail。
  - QuestionView に必ず付く preview を足したので、`test/send/answer.test.ts` の仮の問いに `preview: false` を足した（期待値は変えていない）。
  - 途中の状態：画面（S-03 の前）は、端末の async の質問を、同じ callId の受付の tool-result で答え済みに見せる（D-07 で直す）。
- S-02（コミット f40c8ee）：キーの組の門・アダプター・能力 answerKeys（D-04）、SendService の callId の意図と確定・照会・status の answerKeys・answerMessage と、記録の keys・message の行と hasAnswer（D-05）、`/api/answer/intent` の callId の物と readTranscript のつなぎ（D-06）。テストを先に書いて失敗を確かめてから作った（T-06〜T-12）。
  - `npm run lint`：成功。`npm test`：896 pass・0 fail。`npm run build`：成功。
  - 今の送信と構造化 Chat の答えのテストは、status の期待値に answerKeys・answerMessage を足したほかは変えずに通る（`test/server/send-api.test.ts` の偽の status にも同じ2つの項目を足した）。
  - FeatureName に answerKeys を足したので、能力の表を手で組む `test/orca/open.test.ts`、`test/state/helpers.ts`、`test/transcript/fixture.ts` に `answerKeys: feature(false)` を1行ずつ足した（計画の対象の外。型の検査のため）。
  - 読み方：`SendDeps.readTranscript` は任意にした（ないときは callId の答えは unreachable）。サーバーの組み立ては `src/server/main.ts` で `transcriptTail(transcriptReader)` をつなぐ。status は端末の確かめを1回だけ読み、permission の違いだけで送信とキーの組を使い分ける（端末の失敗のときの rpc の answer は2回目の preflight を読まずに terminal_route）。keys の invalid_answer の reason は、64組を超えると too_large、組が0なら no_choice。
