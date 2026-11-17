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
  - 仕様の変更（統括の判断 2026-11-18、案 C：端末のキーの組の実機は本人の確かめに残す。最終品質ゲート attempt 1 の P1 による）の後の再レビュー：round-3（照合の失敗の後の round-3b、HEAD 2e4a9d4）合格（P2 1、P3 2）、round-4 合格（P2 1、P3 1）、round-5 合格（P3 1：R-08 の受け入れが S-03 に求める帯と 44px の確かめが S-03 の手順にない。情報）。どの round の P2・P3 も直して確かめ直した（round-5 の P3 を除く）。
  - 最終品質ゲート fqg2 attempt 1 の2人目の指摘による設計の改め（キーの組の受け取りを厳しく、届いていない発言を除く、記録の後の refused を blocked）の後：round-6 合格（P2 1：送る前の確かめが届いていない引用の発言を数えず、Orca 側の待ちの答えと二重になりうる。P3 2）。round-6 の P2 は、R-05 の文（後の利用者の発言にその引用があれば question_answered）に従い、サーバーの送る前の確かめは届いたかによらず引用の発言があれば拒み、カードの答え済みの判定だけを届いた発言に限る読みで直す（逸脱と判断に記録）。
  - 最終品質ゲート fqg3 attempt 3 の2人目の P1（問いの同一性の比べ方の不足。原因は D-03 の定義）でキャンペーンの上限に達したので、仕様に戻って D-03・D-05・D-07 と T-05・T-13 を改めた：round-7 合格（P2 1：round-6 と同じ。読みは逸脱と判断のとおりで、コードはサーバー側で届いていない引用も数える。P3 3：文書の型とテストの項目の書き漏れで、コードとテストには入っている）。
  - 今の合格（round-7、`.workbench/spec-review/iss-00049/round-7.json`）の sha256：requirement.cue `4826732e7782a86b09830c8a1582494ea217e9d2a30c59cbd67ee6af008b7097`、design.cue `969cefbe2ad841b47fa34d65d5f9950a49e679a2db4f5da0d0e330bbc6101cf8`、plan.cue `d1339daf28699f019e85474b33495243f9f3e663a324d7e49573a7dc5a79e0fe`（コードの HEAD は 31b4b15）。
  - 前の合格（round-6、`.workbench/spec-review/iss-00049/round-6.json`）の sha256：requirement.cue `4826732e7782a86b09830c8a1582494ea217e9d2a30c59cbd67ee6af008b7097`、design.cue `f892809441906b65008d9c90790daa959bb35d63c2ee57b092fd29deb8104ae9`、plan.cue `d8464d03b2ff320b3357ad788c86d441f8b1ad9f5902f1e783695e13a10feb7c`（コードの HEAD は a4b7382）。
  - 前の合格（round-5、`.workbench/spec-review/iss-00049/round-5.json`）の sha256：requirement.cue `4826732e7782a86b09830c8a1582494ea217e9d2a30c59cbd67ee6af008b7097`、design.cue `994554e0b2ec015a68a716e8e082579713b11de4e5a66633da04dad8ffbe504f`、plan.cue `052c0611e3decf77ebfbc80a6d28f02d5aedfba90d440025fa816bb5b4aa00b0`（コードの HEAD は 2e4a9d4）。
  - round-2：合格（P3 1件：画面の buildAnswers が keys のその他の文の Tab・改行を許し、サーバーだけが拒む）。文書は変えず、F-04 の読みとして S-03 の実装担当に画面でも同じ条件と理由の言葉を入れるよう伝える（逸脱と判断に記録）。

- 区切りのレビュー CP-1（code-reviewer、Opus 5.5 / medium、standards と spec の両方）：範囲 `3b7aece..b86a91f`、合格。
  - round-1（`3b7aece..f40c8ee`）：合格（P2 1件：terminalPromptOf が tabId だけで探し、分割した端末で別のペインの agentStatus を確かめる）。安全に関わるので直した（b86a91f）。
  - round-2（`3b7aece..b86a91f`）：合格、指摘なし（`.workbench/code-review/iss-00049-cp1/round-2.json`）。実装担当の報告の lint 0・test 897/897・build 0 を、タスク担当が同じコミットで確かめた。

## Verification

### 実機の確かめ（S-04、2026-11-18、タスク担当）

- 試しの orca-web：`npm run trial -- --state-dir .workbench/trial-49 --orca-port 8796 --page-port 47940 --forbidden-port 47941`（ほかの試しが 8792・8797・47900・47930 を使っていたので避けた）。専用の settings（`.workbench/trial-49/settings.json`）だけで `sendEnabled` を真にした。常駐の orca-web（8791）の設定は変えていない。
- 構造化 Chat の Codex の `request_user_input_async`（Codex GPT-6.1 Sol / low の試しのエージェント、dispatch ctx_f926832264fe。無害な問い『試し：好きな果物はどれですか？』、選択肢『りんご』『みかん』）：
  - 会話の API が `question`（source chat、answerVia message、callId、問い1つ、選択肢2つ、allowOther 真、preview 偽、state pending）を返し、`GET /api/send/status` が `answerMessage: {available: true}`、`answerKeys: {available: false, reason: chat_route}` を返した。
  - 小窓（390px、明）で『みかん』を選んで「答える」を押すと、Orca と同じ形の発言（『> 試し：好きな果物はどれですか？』、空行、『みかん』）が送られ、カードは後の発言の引用で答え済みの閉じた形になった。エージェントは worker_done で『受け取った答え：みかん』と返した。
  - 送信の記録（試しの `sends/sends.jsonl`）：before の行は `action: answer`、`mode: message`、callId、questionCount、digest だけで、『みかん』『りんご』の出現は 0。after は accepted（queuedState waiting）。
  - 幅 1280px と 390px、明暗の4通りで、カードのはみ出し 0、文書の横スクロールなし、選択肢と送るボタンの高さ 44px 以上。
- 写し（Scope の `artifacts/`。試しのエージェントへの依頼の文と無害な質問だけで、業務の会話は写していない）：`live-async-{1280,390}-{light,dark}-before.png`、`live-async-answer-390-light-{before,selected,sent,done}.png`。画面の実装担当の偽の会話による端末の質問のカード（未回答、途中まで送った帯、届いたか分からない帯、答えずに閉じた形）の写しは `.workbench/implement/iss-00049/render/`。
- sendEnabled 偽：画面の実装担当が、一時の orca-web（偽の会話、sendEnabled 偽）とヘッドレスの Chrome で、端末の質問のカードが読めて押せず理由が出ること、1280px・390px・明暗の8通りではみ出し 0 を確かめた（`.workbench/implement/iss-00049/render/`）。
- 端末のエージェント（キーの列）の実機の確かめ：**本人の確かめに残す**（統括の判断、2026-11-18、案 C）。試しのエージェントを端末で立てる道（`worker-start` は本人の設定で構造化 Chat、`orca terminal create --command` はフックが『Run の外の起動』として止める）を本人が決めていないため。
  - 実機で未確認の前提：`session.tabs.listAll` のタブの agentStatus に、質問を待つ間 `interactivePrompt` と `toolName` が出ること（Orca のソースの型 AgentStatusEntry にはある）。出なければ keys の答えはいつも `prompt_unverified` で1組も送らずに止まり、カードは「端末がこの質問を出しているか確かめられません」と示す（送ったと示さない）。これは `test/send/service.test.ts` の『interactivePrompt がない』『state が working』『interactivePrompt が消えた』の例（書き込みの RPC 0 回）と、`test/web/question-view.test.ts` の T-14 の例で確かめてある。README にも書いた。
  - 本人の確かめの手順：(1) 端末で Claude Code（haiku など）を1つ立てる。(2) 試しの orca-web を `npm run trial -- --state-dir .workbench/trial-49 --orca-port 8796 --page-port 47940 --forbidden-port 47941` で起動し、`.workbench/trial-49/settings.json` の `sendEnabled` を真にする（常駐の 8791 は変えない）。(3) その Claude に無害な AskUserQuestion（選択肢2つ）を出させる。(4) `http://127.0.0.1:8796/embed/agent?id=<エージェントの id>` のカードで選び「答える」を押す。(5) 「答えを送りました」の後、Claude が答えを受け取って続け、カードが答え済みの閉じた形になることを見る。`prompt_unverified` と出たら、上の前提が成り立たない（設計を直す後の Issue が要る）。(6) 終えたら試しのエージェントと試しの orca-web を止める。

## 逸脱と判断

- 最終品質ゲート fqg3 attempt 2 の2人目の指摘（タスク担当の判断、2026-11-18）：(1) 各組を送る直前（1組目は送る前の記録の後）に、宛先のペインのタブの agentStatus を読み直し、promptMatches が match でなければ残りを送らず止める（設計の risks が許した残る危険を、さらに狭める安全側の直し）。(2) 構造化 Chat の journal の body.from.kind agent の発言も fromAgent にして答え済みの判定から除く。(3) callId のない質問のカードは押せない形（理由と「Orca で開く」）にする。

- 最終品質ゲート fqg3 attempt 1 の2人目の指摘（タスク担当の判断、2026-11-18）：(1) キーの組の2組目からは、送る前に前面のプロセスを読み直し、シェル・別のプロセス・読めない・端末がないなら残りを送らず止める（R-03・R-04 の意味の中の直し。D-04 の文と食い違わない）。(2) 別のエージェントが送った role user の件（Orca の from.kind agent）は、R-05 の『利用者の発言』でないので、サーバーとカードの両方で答え済みの判定から除く。

- 仕様レビュー round-6 の P2（タスク担当の判断、2026-11-18）：後の発言の質問の送る前の確かめ（サーバーの findCallQuestion を送る前と照会で使うとき）は、R-05 のとおり、届いたかによらず引用の利用者の発言があれば question_answered で拒む（二重の答えを避ける安全側）。カードを答え済みに閉じるのは届いた発言だけ（D-03・D-07）。

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
- CP-1 の直し（コミット b86a91f）：レビュー（3b7aece..f40c8ee、P0・P1 なし）の P2「terminalPromptOf が tab.id だけで探し、分割した端末で別のペインの agentStatus を読む」を直した。resolveTarget と同じく id と leafId の両方で照合する（宛先の leafId が null なら leafId のない項目）。同じ id で leafId の違う2つのペインのテストを先に足して失敗を確かめた。`npm run lint` 成功、`npm test` 897 pass・0 fail、`npm run build` 成功。
- S-03（コミット f3c50aa、セッション ui：Claude Opus 5.5 / medium）：カードの答える手段の差し替えと答え済みの判定（D-07）。テストを先に書いて失敗を確かめてから作った（T-13〜T-17）。
  - `node --test test/web/*.test.ts`：273 pass・0 fail。`npm run lint`：成功。`npm test`：913 pass・0 fail。`npm run build`：成功。
  - `answererFor` は answerVia（rpc・keys・message）で選び、`createCallAnswerer({mode})` を足した。流れに partial（照会も押し直しもしない帯と「Orca で開く」）と blocked（already_sent・question_answered・prompt_mismatch・prompt_unsupported・agent_keys_unknown）を足した。buildChat は keys だけを tool-result に結び（isError なら declined）、message は後の利用者の発言の引用で答え済みにする。
  - タスク担当の判断（仕様レビュー round-2 の P3）：answerVia keys のその他の文に Tab・改行などの制御文字があれば、画面の buildAnswers でも送れず（reason control_character）、カードに理由「その他の文は1行で、制御文字を含めないでください」を出す。message と rpc の条件は今のまま。
  - 理由の表に permission（送る欄と同じ言葉）も足した（message の answerMessage が permission で止まるとき、識別子ではなく言葉で示すため）。keys の availability は codex に加えて、planKeys と同じく番号が2桁になる問い（Claude は選択肢＋1が9を超える）も prompt_unsupported にした。
  - 描画の確かめ：自分で起動した一時の orca-web（127.0.0.1:47961。偽の Orca の会話の記録と、sendEnabled 偽の status を返す偽の送信の口。実物の Orca には触れていない）とヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じた）で、幅 1280px・390px × 明暗の8通り。`/embed/agent` の偽の会話（keys の未回答〔送信が無効の理由と Open〕、答えずに閉じた形、後の発言の質問の答え済み）と、同じ部品で流れを固定した偽のカード（途中まで送った帯、届いたか分からない帯、blocked、keys の done、制御文字の理由）。どれもページの横スクロールなし、カードとその中の要素のはみ出し 0（DOM で数えた）。答えは送っていない。写しと結果：`.workbench/implement/iss-00049/render/`（`agent-*.png`、`agent-top-*.png`、`fixture-*.png`、`result.json`）。
- 最終品質ゲート attempt 1 の2人目の指摘の直し（コミット a4b7382）：P1 会話の読みのセッションを宛先のセッションと照合（意図・確定は session_changed、keys の照会は question_not_found）、P2 確定で問いの中身を比べる（question_changed）、P2 promptMatches の preview の比べと、切った keys の質問を prompt_unsupported（サーバーと画面）。失敗するテストを先に足した。`npm run lint` 成功（既存の test/web/approval-dom.test.ts の info 1件は触っていない）、`npm test` 985 pass・0 fail、`npm run build` 成功。
- 最終品質ゲート fqg2 attempt 1 の指摘の直し（コミット 58d8dbd、仕様 round-6 の合格の sha256 と一致を確かめてから）：P1 キーの組の受け取りで writeSettlement がなく accepted 真なら unknown（D-04）、P2 端末の届いていない利用者の発言に undelivered を付け、カードは数えず、送る前の確かめは countUndelivered で数えて question_answered（D-01・D-03・D-07）、P2 callId の確定の refused を blocked（D-07。言葉は承認の表に混ぜないよう question-view.js の CALL_REFUSED_REASON に置いた）、P3 README の記録の mode の説明。失敗するテストを先に足した。`npm run lint` 成功、`npm test` 990 pass・0 fail、`npm run build` 成功。
- 最終品質ゲート fqg3 attempt 1 の2人目の指摘の直し（コミット 977189f）：P1 answerKeys が2組目から待ちの後・送る直前に前面（terminal.inspectProcess、宛先の incarnation と種類）を読み直し、シェル・別のプロセス・読めない・端末が消えたならその組から先を送らず partial_sent（受けた組がなければ unconfirmed）、P2 端末の role user で from.kind agent の件に fromAgent を付け、サーバー（countUndelivered によらず）とカードの答え済みの判定から除く。失敗するテストを先に足した。`npm run lint` 成功、`npm test` 996 pass・0 fail、`npm run build` 成功。
- 最終品質ゲート fqg3 attempt 2 の2人目の指摘の直し（コミット 31b4b15）：P1 answerKeys が各組の直前（1組目も、送る前の記録の後）に session.tabs.listAll を読み直し、宛先のペインの agentStatus で promptMatches が match でなければその組から先を送らない（受けた組があれば partial_sent、1組目の前なら refused not_sent。2組目からの前面の読み直しは残す）、P2 構造化 Chat の message の from.kind agent の role user の件にも fromAgent、P2 callId のない keys・message の質問のカードは unknown_shape と「Orca で開く」。失敗するテストを先に足した。`npm run lint` 成功、`npm test` 1001 pass・0 fail、`npm run build` 成功。
- 最終品質ゲート fqg3 attempt 3 の指摘の直し（コミット 9607c93、仕様 round-7 の合格の sha256 と一致を確かめてから）：P1 promptMatches が header と選択肢の説明も比べ、読んだ問いが切られていれば unverified、sameQuestions に選択肢の説明（D-03・D-05）、P2 画面の message の buildAnswers が formatAsyncAnswer と同じ文（question-view.js に写し、サーバーの関数と同じ文になるテストを足した）の 16,384 バイト超を too_large で送れない形に（D-07）。新しいテストが前の HEAD の実装で失敗することを確かめてから通した。`npm run lint` 成功、`npm test` 1007 pass・0 fail、`npm run build` 成功。
