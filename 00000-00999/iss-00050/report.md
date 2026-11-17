---
種別: レポート（Issue）
ID: "iss-00050"
関連GitHub: ["#50"]
最終更新: "2026-11-18"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 小窓（`/embed/agent`）が、エージェントの許可の確認（承認）をカード（題、道具、説明、理由、要るパス、計画の本文と計画のファイル、操作の中身の下見と「詳しく」、選択肢のボタン）で出す。答え済みは選んだ選択肢を示して閉じ、取り消しは「取り消されました」で閉じる。
- 構造化 Chat の承認に、Orca のチャットと同じ RPC `agentSession.respondToApproval`（itemId と revision の比較つき、optionId）で答えられる。新しい口 `POST /api/approval/intent`・`/api/approval/confirm` は今の送信と同じ守り（同じオリジンの JSON、短期のトークン、sendEnabled、使い捨ての票、送る前の記録、処理中の印、照会、自動で送り直さない）で、記録は digest・intent・itemId・revision だけ。
- 「常に許可」「常に拒否」（intent が allow_always・reject_always）は、押すと確かめの段（以後何が省かれるかの1行と「<ラベル> で答える」「やめる」）を出し、サーバーも `confirmPersistent: true` のない意図を受けない。
- 端末のエージェントの許可の確認は、タブの agentStatus の `interactivePrompt`（`{approval: {tool, summary}}`）から読んで会話の最後にカードで出し（待っている間だけ）、答えるボタンは出さず「端末のエージェントの許可は、Orca で答えてください」と「Orca で開く」を出す。URL の承認と知らない種類の承認も読むだけ。
- コミット：aea314f（会話の承認の部分）、81fff5b（承認の答えの門・アダプター・サービス・HTTP の口）、9d3d5f5（承認のカード）、1185813（README.md・AGENTS.md）。

## レビュー記録

- 仕様レビュー（spec-reviewer、Opus 5.5 / high、standard なので1人）：合格。round-3 で P0・P1・P2・P3 がすべて0（`.workbench/spec-review/iss-00050/round-3.json`、検査 `round-3.check.json`）。
  - 合格した文書の sha256：requirement.cue `5e2305b9fd0cee91fdde18ea5738cdb11db8f67c1a9ef6b787d5c9203e639e77`、design.cue `d48401670565888b32aa6d4613879b5361e39f59708d9dff90251833e624c433`、plan.cue `fb68e41f19945dc7852babf6124834a49daea8c74eb4f383aaad219c7e9b75e8`（コードの HEAD は 3b7aece）。
  - round-1：合格（P2 2件：既存テストを変えない条件が新しい項目と両立しない、計画の承認で本文が plan と detail に重なる。P3 1件：承認のカードに質問の言葉が出る）。直して確かめ直した。
  - round-2：結果の形式が無効（題が80字超。指摘の中身は P3 1件：照会の code の言葉が質問のまま）。中身を直し、round-3 で評価し直した。
  - round-3：合格、指摘なし。

- 区切りのレビュー CP-1（code-reviewer、Opus 5.5 / medium、standards と spec の両方）：範囲 `3b7aece..81fff5b`、合格（P0〜P3 すべて0、`.workbench/code-review/iss-00050-cp1/round-1.json`）。実装担当の報告の lint 0、test 860/860、build 0 を、タスク担当が同じコミットで再び確かめた。

- 最終品質ゲート（キャンペーン `.workbench/final-quality-gate/iss-00050-fqg/`、範囲 `3b7aece..1185813`）：attempt 1 で合格。合格のコミット `11858131434bb6b1817d6c53df6b8d5bd1fe092b`。主のレビュー（quality-gate-reviewer、Opus 5.5 / medium、観点 functional-correctness・requirements-closure・test-adequacy・security-baseline・reliability-recovery・e2e-user-flow）pass、P0/P1 0、P3 1。2人目 ChatGPT GPT-6 / Extra High（chatgpt-code-review-strict、GitHub の SHA の一致を確かめた）pass、P0/P1 0、P2 2。テスト lint 0・test 886/886・build 0。closure：`.workbench/final-quality-gate/iss-00050-fqg/closure.md`（写し `artifacts/closure.md`）。記録だけのコミットはない。PR の直前に `origin/main` を取り込み直す要はなかった（main に新しいコミットがない）。

- PR：https://github.com/chemitaro/orca-web/pull/53（head 1185813 = 合格のコミット）。CI（GitHub Actions の check）合格。

## Verification

### 実機の確かめ（S-04、2026-11-18、タスク担当）

- 試しの orca-web：`npm run trial -- --state-dir .workbench/trial-50 --orca-port 8797 --page-port 47930 --forbidden-port 47931`。専用の settings（`.workbench/trial-50/settings.json`）だけで `sendEnabled` を真にし、確かめた後に偽へ戻した。常駐の orca-web（8791）の設定は変えていない。
- 試しのエージェント（Claude haiku 5.5 / low、構造化 Chat、`orca orchestration worker-start`）：
  - 道具の許可：/tmp の一時ファイルへの Write を2つさせたが、Orca の構造化 Chat の worker は確認なしで書け、承認は出なかった（Orca の起動の権限の設定による）。道具の承認のカードと「常に許可」の確かめの段は、画面の実装担当の偽の会話の写しとテストで確かめた。
  - 計画の承認（ExitPlanMode）：会話の API が `approval` の部分（source chat、題 Review proposed plan、道具 ExitPlanMode、plan の本文とファイル、選択肢 allow（allow_once）・deny（reject_once）、answerable 真、revision 1）を返し、`GET /api/send/status` が `approval: {available: true}` を返した。
  - `sendEnabled` 偽：幅 1280px と 390px、明暗の4通りで、カードの中身が読め、選択肢2つが押せず、理由『送信が無効です（設定の sendEnabled が偽）』が出た。カードのはみ出し 0、文書の横スクロールなし、ボタンの高さ 44px 以上。
  - `sendEnabled` 真、390px：『Approve plan』を押すと Orca に届き（Orca の知らせ：Allowed in the worker's own chat）、カードが『答え済み … 許可しました：Approve plan』の閉じた形になり、エージェントは計画どおり一時ファイルを書いて worker_done で報告した。2つ目の試しのエージェントで『Keep planning』を押すと拒否が届き（Denied in the worker's own chat）、ファイルは書かれなかった（エージェントは計画を出し直したので worker-stop で止めた）。
  - 送信の記録（試しの `sends/sends.jsonl`）：before の行は `action: approval`、`intent: allow_once`、prompt、digest などで、選択肢の id・ラベル・計画の本文を含まない。after の行は submitted（code resolved）。
  - 試しのエージェントは3つとも worker-stop で止め、一時ファイルは消した。
- 端末のエージェントの permission prompt：Run の外の端末のエージェントの起動はフックで止まり、許可を待つ端末のタブもなかったため、実機で出せなかった。タブの一覧の agentStatus の項目名を読むだけで数えたとき（2026-11-18）、待っていない端末のタブには interactivePrompt がなかった（Orca のソースでは PermissionRequest の間だけ入る）。形はテスト（T-02）で確かめた。Residual Risks に書く。
- 写し（Scope の `artifacts/`）：`approval-disabled-{1280,390}-{light,dark}.png`・`approval-enabled-confirm-{1280,390}-{light,dark}.png`（画面の実装担当の偽の会話：道具、計画、長い detail、HTML の文字、常に許可の確かめの段、答え済み、取り消し、端末）、`live-answer-settled-390-light.png`（実機で答えた後の閉じた形）。実機の未回答のカードの写しは、計画のファイルの欄に利用者の家のパスが出るので `.workbench/trial-50/shots/` にだけ置き、artifacts に入れていない。

## 逸脱と判断

- 逸脱（実装担当の切り替え）：Codex GPT-6.1 Sol / medium の実装担当（dispatch ctx_f499b1217252）が、chat-scratch の symlink を含む書き込みの根の拒否で、何もせずに止まった（変更なし）。統括の依頼書の補足に従い、worker-stop して Claude Opus 5.5 / medium（dispatch ctx_b8259f5f7084）で S-01〜S-02 を行った（deviation: codex-confirmation-takeover に当たる切り替え。統括の了承済み）。
- 実装担当 impl の判断（タスク担当が受け入れた）：偽の能力の報告に answerApproval を足すため範囲外の test/orca/open.test.ts・test/state/helpers.ts・test/transcript/fixture.ts に各1行。T-10 は test/server/send-api.test.ts に追加。送信の confirm も承認の票を wrong_kind で拒む。approvalConfirm は今の選択肢にない id を invalid_answer unknown_option で拒む。status は送信の preflight が通らないとき answer と approval を別々に読む。
- 画面の実装担当 ui の判断（受け入れた）：確かめの段のボタンの data-action を persist-confirm・persist-cancel にした（既存のテストが agent-frame.js に confirm・cancel の字がないことを主張するため）。question-view.js に共有の関数（reasonTextFrom・sendIntentConfirm・checkOperation・readSameOrigin）を export し createChatAnswerer をそれで書き直した（export と振る舞いは不変）。板の状態に送っている選択肢 chosen を足した。主の選択肢は Orca と同じく先頭。buildChat の approval 行のテストは approval-view.test.ts に置いた。
- 依頼書の「Orca で答える」は、理由の言葉（「Orca で答えてください」）として示し、押す操作は「Orca で開く」1つにした（requirement.cue の decisions）。


## Residual Risks / Follow-ups

### 次の Issue の案：端末のエージェントの許可への答え（iss-00049 の仕組みの後）

- 事実（Orca v1.4.261）：端末のエージェントの許可は agentStatus の state が blocked・waiting で `interactivePrompt` が `{"approval": {"tool", "summary"}}`。Orca の `readAgentPromptAnswers` は選択肢を `allow_once`（Allow once）と `reject_once`（Reject）の2つにし、キーは許すが `nativeChatApprovalAcceptKey(agent)`（Claude は Enter など、エージェントごと）、拒むが Escape。答える RPC はなく、Orca 自身も `terminal.send` で打ち込む。
- 案：承認のカードの `approverFor` が source terminal に返す手段を、iss-00049 の端末へのキーの組の口（送る前の状態の確かめ、1回だけの送信、途中まで届いた状態の扱い、照会）に差し替える。サーバーは `/api/approval/*` に端末の経路を足し、送る前に agentStatus の interactivePrompt が同じ（tool と summary の digest）で state が blocked・waiting なことを確かめ、選択肢は allow_once・reject_once の2つだけを受ける（常に許可は出さない）。結果は agentStatus が待ちから抜けたかで照会し、自動で送り直さない。
- 危険：キーは画面の今の状態に効くので、確かめと送信の間に別の確認に変わると、別の操作を許しうる。送る直前の読みと、Orca の terminal.send の前面のプロセスの確かめを必ず入れる。

### 残る P2/P3（最終品質ゲートの情報。直していない）

- P2-a：同じ端末タブでセッションが切り替わった直後（見張りが古い target を使う最大5秒）、新しいセッションの許可の確認が古いセッションの会話の末尾に付きうる。タブの providerSession.id と target.sessionId の一致を確かめてから付けるのがよい。
- P2-b（主の P3 と同じ根）：常に許可の確かめの段にいる間に送れなくなっても、確かめのボタンが押せる形で残る（押しても送らないので安全側）。

### 残る確かめと危険

- 端末のエージェントの permission prompt のカードは実機で出せなかった（上の Verification）。タブの一覧に interactivePrompt が載らない版なら、カードは出ないだけ（安全側）。次に端末のエージェントが許可を待つときに、`/api/transcript` の最後の件で確かめる。
- 道具の承認（allowForSession の「常に許可」を含む）は、Orca の構造化 Chat の worker が確認なしで動くため実機で出せず、偽の会話の写しとテストで確かめた。
