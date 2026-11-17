---
種別: レポート（Issue）
ID: "iss-00054"
関連GitHub: ["#54"]
最終更新: "2026-11-18"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 小窓（`/embed/agent`）の承認のカードから、端末のエージェント（Claude Code、Codex）の許可の確認に答えられる。選択肢は Orca v1.4.261 の readAgentPromptAnswers と同じ「Allow once」（allow_once）と「Reject」（reject_once）の2つで、Orca と同じ1キー（許可は `1`、拒否は Escape）を `terminal.send`（enter 偽、requireWriteSettlement 真）で1回だけ送る。常に許可は出さない（Orca も出さない）。確かめの段とサーバーの confirmPersistent の守りは、構造化 Chat と同じ部品を通す。
- 許可の確認の同一性 `promptId`（interactivePrompt と stateStartedAt の digest）を、正規化・送る前・送る直前・照会が同じ純な関数（`src/transcript/terminal-approval.ts`）で決める。送る前（意図と確定）と、送る前の記録の後・キーの直前に、前面のプロセスとタブの agentStatus を読み直し、違えば送らない。送り始めた promptId には二度と送らない（`SendJournal.hasApproval`）。記録は promptId・intent・digest・組の数だけ。
- 確かめられないときは送らずに理由と「Orca で開く」、結果不明は送り直さず帯と「Orca で開く」。
- コミット（マージを除く）：a7a27a2（S-01）、145753b（S-02）、c461e18（origin/main の取り込み、iss-00055）、c454a99（S-03 の文書）。

## レビュー記録

- 仕様レビュー（spec-reviewer、Opus 5.5 / high、standard なので1人）：合格。round-2 で P0・P1 0、P2 1（`.workbench/spec-review/iss-00054/round-2.json`、検査 `round-2.check.json`）。
  - 合格した文書の sha256：requirement.cue `a356dbc0e9dd9268dd60e8ae8a261cc89e7501f9dff10e39860e855620699bc3`、design.cue `d68570b7d267210657424b6bd9d92286e826e6ab74fb386c30cfd2132c5ea5d8`、plan.cue `efda6845fa30d6793cd1c8135400a5073deafae315921d6b7bbfa3f50dd391ca`（コードの HEAD は 253a1a6）。
  - round-1：合格（P2 1、P3 3）。全部を直して確かめ直した（応答は `review-response.md`）。
  - round-2 の P2（タブの agentStatus が物でないときも、preflight の resolveTarget が no_session で先に止まり、意図と確定では prompt_unverified に届かない）：送らない点は同じなので文書は変えず、読み方として扱う（逸脱と判断に記録）。

- 区切りのレビュー CP-1（code-reviewer、Opus 5.5 / medium、standards と spec の両方）：範囲 `253a1a6..a7a27a2`、round-1 で合格、指摘なし（`.workbench/code-review/iss-00054-cp1/round-1.json`）。実装担当の報告の lint 0・test 1040/1040・build 0 を、タスク担当が同じコミットで確かめた。

## Verification

### 描画と試しの画面（S-02・S-03、2026-11-18）

- 画面の実装担当（ui）が、一時の orca-web（偽の会話と偽の承認の口。実物の Orca には送らない）とヘッドレスの Chrome で、端末の承認のカードの5つの場面（押せる、押せない形と理由、送った後、結果不明の帯、押し直せない形）× 幅 1280px・390px × 明暗の20通りを写した。どれもカードのはみ出し 0、文書の横スクロールなし、選択肢の高さ 44px、「Orca で開く」あり。写しは Scope の `artifacts/terminal-approval-<場面>-<幅>-<明暗>.png`、数えた値は `artifacts/terminal-approval-measure.json`（偽の会話だけで、業務の会話は写していない）。
- タスク担当が、origin/main（iss-00055）を取り込んだ後のコミットで、試しの画面（`npm run trial -- --state-dir .workbench/trial-54 --orca-port 8798 --page-port 47950 --forbidden-port 47951`、sendEnabled は偽のまま）をヘッドレスの Chrome で開き、Mac の幅と 390px（phone.html）で、例外と console の誤りがないこと（試しの静的サーバーの favicon の 404 だけで、前からのもの）、横にはみ出さないことを確かめた。承認の部品（approval-view.js・approval-dom.js・agent-frame.js）は 200 で配られる。

### 端末の実機の確かめ（本人の確かめに残す）

- 依頼書の4と iss-00049 と同じ事情（試しのエージェントを端末で立てる道が決まっていない：`worker-start` は本人の設定で構造化 Chat、`orca terminal create --command` はフックが Run の外の起動として止める）で、タスク担当は端末の実機に答えを送っていない。
- 実機で未確認の前提：端末のエージェントが許可を待つ間、`session.tabs.listAll` のタブの agentStatus に `interactivePrompt`（`{"approval": {"tool", "summary"}}`）が出ること（Orca のソースの型にはある。iss-00050 でも未確認）。出なければ端末の承認のカードはそもそも出ない（安全側）。
- 本人の確かめの手順：
  1. 端末で Claude Code（haiku など）を1つ立てる。業務中のエージェントは使わない。
  2. 試しの orca-web を `npm run trial -- --state-dir .workbench/trial-54 --orca-port 8798 --page-port 47950 --forbidden-port 47951` で起動し、`.workbench/trial-54/settings.json` の `sendEnabled` を真にする（常駐の 8791 は変えない）。
  3. その Claude に、許可の要る無害な操作（決めた一時ファイルの作成など）をさせ、permission prompt を出させる。
  4. `http://127.0.0.1:8798/embed/agent?id=<エージェントの id>` の会話の最後に、承認のカード（道具、要約、「Allow once」「Reject」、「Orca で開く」）が出ることを見る。出なければ上の前提が成り立たない。
  5. 「Allow once」を押し、「答えを送りました」の後、端末で操作が進み、カードが消えることを見る。もう一度 permission prompt を出させ、「Reject」で止まることを見る。
  6. 「端末がこの許可の確認を出しているか確かめられません」と出たら、interactivePrompt が読めていない（後の Issue で設計を直す）。
  7. 終えたら `sendEnabled` を偽に戻し、試しのエージェントと試しの orca-web を止める（`kill -TERM $(cat .workbench/trial-54/trial.pid)`）。

## 逸脱と判断

- 逸脱（実装担当の切り替え）：Codex GPT-6.1 Sol / medium の実装担当（dispatch ctx_2333224af556）が、最初のコマンドで、書き込みの根の Orca の Application Support の symlink を拒まれ（sandbox を作れない）、何もせずに止まった（変更なし）。統括の依頼書の補足に従い worker-stop し、Claude Opus 5.5 / medium（dispatch ctx_cec660e181c2）で S-01 を始めた。

- 仕様レビュー round-2 の P2（タスク担当の判断、2026-11-18）：R-04・T-06 の「agentStatus が物でない（prompt_unverified）」は、意図と確定では preflight の resolveTarget が not_sendable（no_session）で先に止める。テストは意図・確定では no_session を、prompt_unverified は「待っているのに interactivePrompt がない」場合と、純な関数（T-01）・アダプターの送る直前の読み（T-05）で確かめる。

## Residual Risks / Follow-ups
