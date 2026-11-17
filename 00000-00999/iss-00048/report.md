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

## レビュー記録

- 仕様レビュー（spec-reviewer、Opus 5.5 / high、standard なので1人）：合格。round-3 で P0・P1・P2・P3 がすべて0（`.workbench/spec-review/iss-00048/round-3.json`、検査 `round-3.check.json`）。
  - 合格した文書の sha256：requirement.cue `e216df2871b4b48e22b2d6c69b39f878f3c826fa1dc72a1e1154682d8d2faf4e`、design.cue `6ee95cbca9955e2e97699b89022fda1088353dc254b4a3c7b5f5ecd2661e2f42`、plan.cue `977cb707c3f52860c3458cdaef25c6c966f561c8b78a076ad82ec23376bb8a49`（コードの HEAD は 27b01fe）。
  - round-1：合格（P2 3件、P3 3件）。P2 は直す価値があるので直して確かめ直した（request_user_input_async を除く、照会で他の画面の答えを自分の成功にしない、otherAllowsEmpty の空の答え。P3：390px の「Orca で開く」、F-03 の unknown_shape、互換の節）。
  - round-2：合格（P2 1件：照会の digest に表示用に切った答えを使う誤り）。直した。
  - round-3：合格、指摘なし。

- 区切りのレビュー CP-1（code-reviewer、Opus 5.5 / medium、standards と spec の両方）：範囲 `27b01fe..8567b3b`、合格（P0〜P3 すべて0、`.workbench/code-review/iss-00048-cp1/round-1.json`）。手順の実装担当の報告で lint 0、test 767/767、build 0 を、タスク担当が同じコミットで再び確かめた。

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
