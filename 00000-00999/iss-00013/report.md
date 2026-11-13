---
種別: レポート（Issue）
ID: "iss-00013"
関連GitHub: ["#13"]
最終更新: "2026-11-14"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

orca-web から Orca のエージェントへ、確認つきで送れるようになった（意図→確認の画面→確定。確定のときに宛先を確かめ直す）。端末は耐久の agent prompt の経路（`terminal.send`、`agentPrompt`、`orchestrationRequestId`）、構造化 Chat は `agentSession.send` で、1回だけ送り、自分から送り直さない。送る前の記録（`orca-web.send-record/v1`、`sends.jsonl`）を耐久に書けなければ送らず、結果は5つ（refused・unknown・accepted・submitted・input_accepted）に分けて記録し、結果不明は `GET /api/send/{id}`（`?check=1` で読む RPC だけの照会）で確かめる。`sendEnabled`（settings.json、既定は偽、HTTP から変えられない）で止められる。画面は `/embed/agent` の送る欄と確認の画面。

- 合格のコミット：`0c434cb1ad81d1f5c56b0f47a0017f7adacaef45`（記録のコミットなし）。
- 実装のコミット：751646c・6221991・884554d（S-01〜S-03）、32df614・02f5554・2e916ef（S-04〜S-06）、4df75f0・a15b733（S-07・S-08）、5ee4be1（S-09）、c604956（S-10 の文書）、b4a9327（S-11）、0c434cb（最終品質ゲートの P1 の直し）。

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

### コードのレビュー（区切り）：合格

- CP-1（ce5d4e2..2e916ef）：合格（standards P3 1、spec 0）。`.workbench/code-review/iss-00013-cp1/`
- CP-2（2e916ef..a15b733）：合格（P3 2）。`.workbench/code-review/iss-00013-cp2/`

### 最終品質ゲート：合格（0c434cb）

- campaign iss-00013（c604956）：主 pass、テスト pass、ChatGPT（verified=yes）P1 3（1 を採り、仕様の変更 round 6〜7 と S-11。2 は反証）。仕様の根拠が変わったので打ち切り。
- campaign iss-00013-v2：attempt 01（b4a9327）主 pass（P3 2）、テスト pass（496）。ChatGPT は回答の取り込みに失敗（60分超）し、GPT-6 Astra / high が代わりの2人目：P1 1（送信の記録の末尾が途中で切れていると、次の送る前の記録が読めなくなる）を採り、0c434cb で直した。attempt 02（0c434cb）主 pass（P0/P1/P2 0、P3 2）、テスト pass（lint 0、498 件、build 0）、ChatGPT GPT-6 / Extra High（verified=yes）pass（P0/P1 0、P2 2）。
- 記録：`.workbench/final-quality-gate/iss-00013-v2/closure.md`、`review-response.md`。

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
- 検証：`npm run lint` 0、`npm test` 472 件合格、`npm run build` 0（HEAD `5ee4be1`）。合格のコミット 0c434cb では 498 件合格（最終品質ゲートのテストのレーン）。

## Residual Risks / Follow-ups

- 受け入れた残る隙（requirement の risks、統括の了承）：最後の確かめ直しと Orca の書き込みの間の競合（Orca に書き込みの時点の守りを持つ耐久の経路がない）、Orca 自身の居る証の確かめが外れたときの枠のない書き込み、設定の読み直しと rename の間の隙。
- 実機で確かめていないもの：構造化 Chat の送信（検証用のセッションが届いていない。録画と再生のテストだけ）、権限の確認待ちの端末を拒むこと（安全に作れない）。
- 直していない P2/P3（最終品質ゲートの情報）：
  - P3：送る欄に `foreground_mismatch` の言葉がない（識別子のまま出る）。README の前面の説明が「シェルでない」のまま。
  - P2：同じ ID の照会が並ぶと、後着の unknown の check が先の確定の結果を隠す。照会の結果の追記の失敗を応答で示さない。sends の読みが ENOENT 以外で失敗するとメモリーの refused も照会できない。再起動の直後の照会で分かった method_not_found の経路を止めない。構造化 Chat でカードが消え handoff が rejected のとき、照会が accepted と示す（Orca は withdrawn）。
- 次の提案：構造化 Chat の実機の確かめ（セッションが用意されたら）、上の P2/P3 をまとめて直す小さな Issue。

## 実装の記録（実装担当の記録を写す）

### S-01

- 設計 D-11、要件 R-08：journal の sessionId 照合、hasMore/hasOlder が真で位置が不正なら unknown_shape。
- Red：node --test --test-name-pattern='別のセッション' test/orca/read-transcript.test.ts、同 '続きがある nativeChat'、同 '続きがある journal' を各変更前に実行。各1件失敗（空の成功を返していた）。
- Green：上記の各選択が成功。node --test test/orca/read-transcript.test.ts は16件成功。node --test test/transcript/*.test.ts test/server/transcript-api.test.ts は44件成功。
- npx biome check --write（対象2ファイル）、make -s lint-quick FILES="src/orca/read-transcript.ts test/orca/read-transcript.test.ts"、npm run lint は成功。
- 利用者検索：parseJournalPage / parseNativePage は read-transcript.ts 内だけ。仕様の sessionId 照合の対象は agentSession（R-08、D-11）。nativeChat はページ位置の検査の対象。
- 逸脱なし。コミットは次行に記録。
- S-01 commit: 751646c（fix(orca): 不正な会話履歴ページを拒否する）。親は開始コミット、branch 維持、worktree clean。

### S-02

- 設計 D-01：RpcCallOptions の envelope を RuntimeEndpoint.requestLine の最上位 orchestrationRequestId へ通す。他の envelope の鍵は転記しない。Orca の src/cli/runtime/transport.ts:230 と照合。
- Red：node --test --test-name-pattern='要求の行の最上位' test/orca/rpc.test.ts、同 'UnixSocketRpc は options' は各1件失敗（操作の ID が欠落）。修正後各1件成功。
- SendRpc の許可前に node --test test/orca/send-gates.test.ts で terminal.send が拒まれる1件の Red、Chat の許可前に同 --test-name-pattern='構造化 Chat' で1件の Red。Green は5件成功（追加の鍵・画像・複数 block・危険な端末の鍵・ID 欠落・範囲外の待機時間・未許可 RPC を送らずに拒む）。READ_METHODS は既存の4つのまま。
- 設計 D-08：sendGuarded を sendTerminal / sendChat に置換。node --test --test-name-pattern='揃った録画' test/orca/capabilities.test.ts は置換前に1件失敗、置換後1件成功。capability、runtime 一致、readTabs/readTranscript の不足と deferred の表もテスト。
- wiring は SendRpc の用意だけ。test/orca/wiring.test.ts で用意の前に1件失敗、後に成功。
- Green：node --test test/orca/*.test.ts 126件成功（s02-orca.log）。node --test test/state/*.test.ts test/transcript/*.test.ts 64件成功（s02-related.log）。npm run lint と対象12ファイルの make -s lint-quick は成功。
- 途中の整形フックの差分とテストの exactOptionalPropertyTypes の2エラーは、整形とテストの型の修正で解消。
- rg sendGuarded src test は該当なし。ヘルパー3ファイルも追随。実物の Orca への送信はなし、RPC テストは一時ソケットのみ。
- Chat の fence は D-04 の readChatFence が得る正の整数、fingerprint は Orca の structured-agent-session-mutation-envelope.ts の64桁 hex に限定。
- S-02 commit: 6221991（feat(orca): 端末とChatの送信RPCに検証ゲートを追加）。親751646c、branch維持、worktree clean。
- 最後の対象検証：node --test test/orca/send-gates.test.ts test/orca/rpc.test.ts test/orca/capabilities.test.ts test/orca/wiring.test.ts は33件成功（s02-focused.log）。

### S-03 着手前の確認

- D-02 の resolveTarget(listAll, agentId, runtimeId) は状態文書を受け取らないが、状態文書の untabbed を reason: untabbed にする記述がある。listAll だけでは未登録の id と untabbed を区別できない。
- 仕様の解釈をタスク担当に確認するため、S-02 の clean commit で停止。
- 逸脱と判断（担当回答 msg_5ea272caf3b0）：resolveTarget は3引数を維持し、タブにない id は agent_not_found。最新状態に kind=untabbed があるときの読み替えは SendService.preflight（S-06）の責務。S-03 は resolveTarget 側だけをテストする。D-02 の意味は変更しない。

### S-03 実装と検証

- 設計 D-02：経路ごとの SendTarget、resolveTarget、compareTargets、buildPreview。タブの集合は手書きの test/send/fixture.ts。タブのない場合は上記の担当回答に従って agent_not_found。
- Red（各追加前の実装で選択した1件が失敗、その直後の最小実装で同じ選択が成功）：
  - node --test test/send/target.test.ts（最初の端末解決1件）
  - node --test --test-name-pattern='構造化 Chat の id' test/send/target.test.ts
  - node --test --test-name-pattern='宛先の runtime' test/send/target.test.ts
  - node --test --test-name-pattern='worktree の移動' test/send/target.test.ts
  - node --test --test-name-pattern='タブ、leaf' test/send/target.test.ts
  - node --test --test-name-pattern='確認の項目は' test/send/target.test.ts
- 解決の各理由（asleep/no_session/identity_unavailable/agent_not_found/unknown_shape）、paneKey がない場合、複数 worktree、全識別子の比較、状態の宛先と worktree の不一致で null を追加検証。
- 設計 D-03：本文の検査、sha256、操作の ID、TicketStore。票は32バイト base64url、60秒、32個まで、take と cancelByOperation は同期。票の内部は private field（inspect/JSON の非表示を検証）。発行時の入力を写し、後からの呼び出し側の変更で確認先が変わらない。
- Red：node --test test/send/ticket.test.ts の最初の1件、その後は同ファイルで --test-name-pattern='本文の上限'、'CR、C0'、'本文の指紋'、'票は32バイト'、'票の取り出し'、'期限の直前'、'33個目'、'操作の ID で票' を順に追加して各1件の失敗を確認。指紋と操作IDのテストは digest の後に ID でも失敗を確認。各実装後に同じ選択が成功。
- Green：node --test test/send/target.test.ts test/send/ticket.test.ts は19件成功（s03-focused.log）。UTF-8の境界、C0/DEL/C1の全コード、期限直前と同時刻、同時の2つのtake、1回限りの消費、上限、取消し、操作の ID の保持も検証。
- npx biome check --write と make -s lint-quick FILES="src/send/model.ts src/send/target.ts src/send/ticket.ts test/send/fixture.ts test/send/target.test.ts test/send/ticket.test.ts" は成功。途中の整形と非null断言の警告も修正済み。
- 最終の test_commands：npm run lint exit 0（final-lint.log）、npm test exit 0 / 391件成功・失敗0（final-test.log）、npm run build exit 0（final-build.log）。既存のコード由来の失敗はなし。
- 利用箇所の検索：新しい関数群の利用者は今回の src/send/ と test/send/ のみ。後続の SendService などは未着手。
- 実装上の型の形：compareTargets は TargetChange | null、checkText は {ok:true} または {ok:false,error:'invalid_text',reason}、TicketStore.issue は {ticket,expiresAt}（expiresAt はミリ秒の数）、take は {ok:true,value:SendTicket} または {ok:false,reason:'unknown'|'expired'}。SendTicket は target/digest/operationId/expiresAt。newOperationId は時刻の数と任意の乱数関数を受ける。SendPreview の鍵は repoName/worktreePath/branch/agentType/title/state/route/sessionShortId。
- 逸脱：untabbed の責務分離は担当回答のとおり。仕様の変更なし。S-04以降、code-review、最終品質ゲート、PR、push、実物の Orca への書き込みRPCは実行していない。
- S-03 commit / 最終 HEAD: 884554d0eb19277926c500e94a3a270e904b8a5b（feat(send): 送信先解決と確認用チケットを追加）。親62219917ac066ec85f7395919cab37f968adea8e、branch chemitaro/iss-00013 維持、worktree clean。
- 完了のコミット：S-01 751646cc767d46a2d05a947eeb8c678bcaed0745、S-02 62219917ac066ec85f7395919cab37f968adea8e、S-03 884554d0eb19277926c500e94a3a270e904b8a5b。
- 終了時も仕様3ファイルの sha256 は依頼書と一致。S-04以降に進まず、タスク担当の後続実装とレビューを待つ。

### S-04（logic）

- 設計 D-04：結果分類の表を端末・Chat の公開関数で実装。SendRpc を通す adapter は送信を再試行せず、照会は読む RPC のみ。shell-process-detection.ts、agent-session-mutation-envelope.ts、terminal-query-methods.ts、terminal-send-method.ts、structured-agent-session-send-recorded.ts の実物ソースと照合。
- Red → Green：test/orca/send.test.ts に1つずつ挙動を追加し、node --test --test-name-pattern='<各テスト名の先頭>' test/orca/send.test.ts で各1件の失敗と修正後の成功を確認。順：接続前失敗、端末RPC失敗、端末receipt、Chat分類、指紋、端末状態、前面、Chat fence、送信回数・封筒、端末照会、Chat照会。最初は未知分類のstub、後続の公開関数欠落はテスト実行中のTypeErrorで確認（収集失敗なし）。
- Green：node --test test/orca/send.test.ts 11件成功。make -s lint-quick FILES="src/orca/send.ts test/orca/send.test.ts"、npm run lint 成功。整形は npx biome check --write の対象2ファイルのみ。
- 固定指紋は手で並べたcanonical JSONをテストに記載し独立にsha256を算出。Orcaの誤りのmessageを結果へ含めない。D-04の表の各行、provider不一致、カード優先と最大submittedSequence、別sessionId拒否を検証。
- 利用箇所は新規adapterテストのみ。後続SendServiceが公開APIを利用する。送信関数は分類済みSendResult、照会はSendRead<SendResult>を返す。仕様の意味の逸脱なし。実機RPCなし。
- S-04 commit: 32df614（feat(orca): 送信結果の分類と照会アダプターを追加）。親884554d、branch維持。

### S-05（logic）

- 設計 D-05：SendJournal の before/after/check/refused と読み出し。before は 0700/0600 で追記し datasync 後に完了。after/check はメモリーにも保存し、失敗時は偽。ディスクとメモリーの重複を除き古い失敗が新しい結果を上書きしない。
- Red → Green：node --test test/send/journal.test.ts の最初の before 1件、以後 --test-name-pattern で datasync待機、after/check履歴、after/check書込失敗、古い失敗と復旧後の順、refusedと壊れた行を各追加前に失敗確認してから実装、成功確認。datasync はファイルハンドル境界を差し替え、任意の時間待機でなく開始・完了promiseで検証。
- 設計 D-07：readSendEnabled は毎回実ファイルを読む。saveSelected は version=1 かつ真偽値だけ保存し、一時ファイルの後に元のバイト列を再読し、変化なら最大3回やり直す。
- Red → Green：node --test --test-name-pattern='sendEnabled は毎回' test/state/settings.test.ts、同 '項目の保存は正しい'、同 '項目の保存中に' は各1件失敗を確認後、実装して成功。3回連続の変化の拒否、一時ファイル清掃も追加確認。
- Green：node --test test/send/journal.test.ts test/state/settings.test.ts は14件成功。npm run lint、対象4ファイルの make -s lint-quick 成功。型検査で nullable と union の絞り込み4箇所を修正済み。
- SettingsStore の利用者は server/app.ts、main.ts、test/server/api.test.ts。既存のコンストラクターとload/selected契約は維持。node --test test/server/api.test.ts で回帰確認。テストはすべて一時ディレクトリのみ。
- 逸脱なし。仕様の更新・実機RPCなし。
- S-05 commit: 02f55548461ac74f5ab46293cadfc75382569970（feat(send): 送信記録と送信設定を永続化する）。親32df614、branch維持、worktree clean。関連APIの13件も成功。

### S-06（logic、CP-1 の末尾）

- 設計 D-06：SendService の preflight/status/intent/confirm/check。読みの依存は snapshotSync/capabilities/SendRpc/adapter、書く順の依存は TicketStore/SendJournal、設定・時計・操作IDは差替え可能。
- take と inFlight.add の間には await なし。check は await の前に inFlight を判定し、それ以外は cancelByOperation。after/refused の書き込みが終わってから finally で印を外す。confirm 全体の busy は設定の読み前から持つ。
- Red → Green：test/send/service.test.ts に挙動を1件ずつ追加し node --test --test-name-pattern='<テスト名先頭>' test/send/service.test.ts を実行。初回の intent（未実装stub）、設定と本文、能力/runtime、untabbed/前面、status/Chat fence、confirm、同時確定、本文差、宛先変化、before/after失敗、未確定照会、take後の競合、unknown照会、method_not_found、無効票の拒否記録中のbusy、それぞれ失敗→実装→成功を確認。最後のbusyテストでは return に await がないと拒否記録中に次の送信が始まることを再現して修正。
- 追加検証：各読み失敗の意図/確定、同じ票の同時確定、after/refused書込完了前（成功・失敗の両方）の照会、Chatの新しいfenceと同じ操作IDでの照会、Chat session変更、読み取り/照会method_not_foundの経路停止。journalの読みを遅延させ、確定完了まで遅れても処理中の照会がnot_sentに化けないことを確認。
- 前担当回答のとおり、resolveTarget の agent_not_found を最新stateの kind=untabbed で読み替えるのは SendService のみ。
- S-04補正：Orca v1.4.258 `orchestration-mutation-receipt.ts:194` の attachMutationReceipt による端末再生フラグは最上位のreplayedでなくmutation.replayed。手書きfixtureを実物の形に直して `node --test --test-name-pattern='端末の receipt' test/orca/send.test.ts` の1件失敗を確認し、分類の読みを修正して成功。Chatのreplayedは最上位のまま。仕様の意味の変更なし。
- Green：node --test test/send/service.test.ts は22件（全体434件の中でも全件成功）。node --test test/send/service.test.ts test/orca/send.test.ts は最後のbusy追加前に32件成功、追加後は全体で33件成功。対象4ファイルの make -s lint-quick と npm run lint 成功。途中のfixture repo引数と未使用importの型エラーは修正済み。
- 最終 test_commands：npm run lint exit 0、npm test exit 0 / 434件成功・失敗0（logic-test.log）、npm run build exit 0（logic-build.log）。baselineのコード由来の既存失敗なし。
- 利用者検索：SendServiceは新規テストのみ、HTTPへの配線はS-07担当。サービス成功応答は `{ok:true,...}`、失敗は `{ok:false,error,reason?,missing?}`。statusだけは設計どおり `{enabled,available,route,reason}`。API担当はHTTP成功時にokを除いて返せる。
- 記録への書込みを伴う実機RPCなし、push/レビュー/PRなし。仕様3ファイルのSHA-256は依頼書と再一致。S-07以降には進まない。
- S-06 commit / CP-1 提出HEAD: 2e916ef（feat(send): 送信サービスに確認票と操作記録を追加）。親02f5554、branch chemitaro/iss-00013維持。全変更をコミットしworktree clean。
- 完了コミット：S-04 32df61496769f2731038f3e0cdf61ad8e2e81361、S-05 02f55548461ac74f5ab46293cadfc75382569970、S-06 は上記。CP-1 の範囲は ce5d4e23db672cc369cd1cdbcf9f52b9bb6da5fd..2e916ef。

### S-07（api）送信のHTTPの口と起動
- 設計：D-09 の4経路、HTTP状態表、Host→方法→Content-Type→Origin→トークン→128KiBと鍵、同じオリジンの読み、拒否件数だけを1分に1回、D-05の既定記録ディレクトリを実装。SendServiceの内部okを成功応答から除く。
- Red: `node --test test/server/send-api.test.ts` 最初1件失敗（statusがnot_found）、次の縦サイクルは拒否件数ログが0件で失敗。`node --test test/server/config.test.ts` sendsDir未定義で1件失敗。`node --test test/server/main.test.ts` SendService未接続の503で1件失敗。
- Green: 同じ選択が順に1件、2件、6件、4件成功。追加のHTTP状態表・設定の再読込・記録の結合検証を含め `node --test test/server/send-api.test.ts` 4件成功。最終 `node --test test/server/*.test.ts` 78件成功、`make -s lint-quick FILES="src/server/app.ts src/server/main.ts src/server/config.ts test/server/send-api.test.ts test/server/main.test.ts test/server/config.test.ts"` exit0、`npm run lint` exit0。
- 判断：CP-1がすでにSendRpcをwiringで組み立てているのでwiring.tsの重複変更は不要。拒否のログは固定経路と誤りcodeを鍵にした件数のオブジェクトのみ（動的操作IDは固定ラベルにする）。未flush件数は次の拒否で60秒経過時に出す。守りの拒否はSendServiceを呼ばず、設定で拒む確定はSendService経由でrefusedに残る。
- 既存失敗なし。実物のOrcaへの送信なし。コミットは次に記載。
- S-07 commit: `4df75f0a02ebe89c5d6c230327a0da30826cdb90`（parent `2e916ef5d2a68d8ca3a6fdf25780e89e7fc6c637`）。コミット後clean。

### S-08（api）実機の確かめの道具
- 設計：D-12。`src/tools/send-live.ts` はimportで実行しない。`--worktree` と1〜2個の `--handle` を受け、状態の文書から全宛先を検査してから一時の設定と記録でSendServiceを組み立てる。場面(1)通常送信、(2)記録の照会、(3)応答を捨てる包みとrequestShow、(4)票のproviderSessionId/ptyIdの変更、(5)使い済み/本文変更/停止/期限切れを数える。
- Red: `node --test test/tools/send-live.test.ts` で各縦サイクルの未実装を確認。宛先の拒否なし（1件失敗）、通常送信の集計なし（1件失敗）、responseLostなし（1件失敗）、targetChangedなし（1件失敗）、notSentなし（1件失敗）、CLI引数の未実装（1件失敗）、照会に混ぜた送信の件数を見逃す（1件失敗）。テスト補足時の括弧の構文誤りはRedと扱わず修正した。
- Green: `node --test test/tools/*.test.ts` 23件成功（この手順の新規10件）。`make -s lint-quick FILES="src/tools/send-live.ts test/tools/send-live.test.ts package.json"` exit0。`npm run lint` exit0（141files、警告なし）、`npm test` 450件成功・0失敗、`npm run build` exit0。
- 判断：送るRPCの包みは1回だけ委譲し、応答だけtimeoutにする。票の検証専用の派生倉庫がtake時の票の宛先を変更し、本物と同じSendServiceのpreflight比較を使う。期限は票の倉庫の時計だけを進める。正常・失敗ともfinallyで一時ディレクトリを消す。余分なサービスの応答やOrcaの誤りの文を出力へ写さず、件数・outcome・版・照会の結論だけを返す。queryの結論がunknownのときも事実どおりunknownを示す。
- 逸脱なし。既存失敗なし。`npm run send:live`、`node src/tools/send-live.ts` は実行していない。実物のOrcaへの送信なし。S-09以降は担当外。コミットは次に記載。
- S-08 commit: `a15b7333fad9b936cd4a455397d8e63475c14545`（parent `4df75f0a02ebe89c5d6c230327a0da30826cdb90`）。コミット後clean、仕様3ファイルのsha256も不変。CP-2待ち。

### S-09（ui）送る欄と確認の画面
- 担当：Claude Opus 5.5 / high（plan.cue execution.sessions.ui）。開始 HEAD `a15b7333fad9b936cd4a455397d8e63475c14545`（clean）。仕様3ファイルの sha256 は依頼書と一致（requirement da03e08b…、design b4b2d0bb…、plan 1e4b512e…）。
- 照らした設計：D-10（状態 phase disabled/compose/checking/confirm/sending/result、reduceSend、buildConfirm、buildResult、5つの outcome と warning の言葉、確定の応答の消失で意図の operationId の unknown、not_sent／in_progress の言葉、sending と checking の2回目の押しを捨てる、409 と期限で本文を残して compose、unknown で `?check=1`、textContent だけ、pre-wrap、CSP そのまま、390px、見出し「会話」）。D-09 の応答の形（app.ts と SendService を読んで確認）。R-07、F-01、F-03。
- 対象：`web/embed/send-view.js`（新規。純粋な reduceSend/buildConfirm/buildResult/buildSendView/describeError と、注入した口だけで要求を送る createSendFlow）、`web/embed/send-dom.js`（新規。renderSendPanel、textContent と dataset と disabled だけ）、`agent.html`（#send、#send-text、#send-panel、#chat-head）、`agent-frame.js`（流れの配線、status を15秒ごとに書く欄か止まった間で画面が見えるときだけ読む）、`agent.css`、`src/server/app.ts` の STATIC_FILES に2つ、`test/server/transcript-api.test.ts` の配る js の一覧に2つ。
- Red：`node --test test/web/send-view.test.ts`（ERR_MODULE_NOT_FOUND で fail 1）、`node --test test/web/send-dom.test.ts`（同）、`node --test --test-name-pattern="inline を許さない CSP" test/server/transcript-api.test.ts`（`/embed/send-view.js` が 404 で fail 1）。
- Green：send-view 19件、send-dom 3件、CSP の1件が成功。`node --test test/web/*.test.ts` 73件成功。`npm run lint` exit 0（途中で JS から推論された状態の型が狭く tsc が TS2339 を出したので、send-view.js に JSDoc の SendState を足して直した）。`npm test` exit 0 / 472件成功・失敗0（s09-test.log）。`npm run build` exit 0（s09-build.log）。lint は s09-lint.log。
- テストが確かめること：T-18（確認の項目、5つの outcome と warning（要確認・入力欄に残る・送った後の権限・別のエージェント・記録の書けない）の言葉、unknown のときだけ「確かめる」、disabled の理由（send_disabled、shell_foreground、unsupported、status の失敗））。T-19（409 target_changed/not_sendable/ticket_invalid/busy と期限の経過・期限後の「送る」・「やめる」で本文を残して compose、send_disabled は disabled、sending と checking の間の2回目の押しを捨てる（同じ物を返す）、流れで「確かめる」と「送る」を2回ずつ押しても意図と確定は1回ずつ、確定の時間切れ・投げる・JSON でない応答・500・知らない outcome で意図の operationId の unknown になり送り直さない）。T-20（`<script>` と `<img onerror>` を含む本文、題名、リポジトリ、worktree、ブランチ、detail の値が文字のまま、要素は DIV/P/DL/DT/DD/UL/LI/BUTTON/SPAN だけ、innerHTML 等を使うと偽の要素が投げる）。T-24 の画面の側（照会の URL が `/api/send/<意図の ID>?check=1`、not_sent で「送っていません（後から届いても送りません）」と本文を残して戻る、in_progress で「送っている途中です。少し待ってもう一度確かめてください」と「確かめる」を残し自動で繰り返さない、recorded の outcome を示し checkError で知らせる）。
- 判断：(1) createSendFlow を send-view.js に置いた（DOM に触らず、書き込みの送り手・読み・時計を注入。二重押しの捨てと「送らない」を流れの単位で試すため）。要求は reduceSend が checking/sending に進めたときだけ送る。(2) 確定の応答のうち「送る前の拒み」と読むのは、SendService の誤り code（D-09 の表）と HTTP の状態の組か、書き込みの守りの誤り（401/403/405/413/415）だけ。そのほか（500、JSON でない、知らない形）は unknown。(3) 意図・確定の待ちに時間切れ（30 秒・60 秒）を置いた（write.js は変えていない。401 の1回の取り直しは write.js のまま）。(4) 結果から戻るとき、accepted/input_accepted/submitted は本文を消し、refused/not_sent/unknown は本文を残す。(5) 意図の応答の text が書いた本文と違えば確認に進まない。(6) 確認の期限はサーバーの expiresAt で時計を置き、来たら compose に戻す。
- 画面の確かめ（送らない）：`PORT=18797`、`ORCA_BIN` は存在しないパス、`sendEnabled` のない一時の settings、一時の `ORCA_WEB_SENDS_DIR` で `node src/server/main.ts` を起動。`/api/send/status` は `enabled:false`、画面は「会話（読むだけ）」、送る欄は止まり「設定で送信が止まっています（settings.json の sendEnabled）」。headless Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Emulation で 390×844、終わりは `Browser.close`）で、送る欄を長い題名・パス・ブランチ・本文の確認の画面と、warning つき unknown の結果の画面で描き、どちらも `document.documentElement.scrollWidth` = 390 = innerWidth、`#send` の scrollWidth = clientWidth = 390、`#send` 内の script 要素 0。実機の Orca の宛先での 390px の確かめ（T-22）は S-10。一時のサーバーは止め、Chrome のプロファイルは消した。絵は `.workbench/implement/iss-00013/s09-ui/`。
- 逸脱：なし。仕様の変更の要なし。実物の Orca に書き込みの RPC を送っていない。README.md、AGENTS.md、ほかの src/ は変えていない。既存の失敗：なし（baseline も0）。
- S-09 commit: `5ee4be1284ff919ad3354ff59bfddd63689d4925`（parent `a15b7333fad9b936cd4a455397d8e63475c14545`、feat(embed): エージェント画面に確認付き送信機能を追加）。コミット後 clean。


### S-11：前面のエージェントの一致と拒否記録のメモリー（fix1、2026-11-14）

- 開始 HEAD：`c6049569059c1bb70c6e58a87df27c24be765cd7`、branch `chemitaro/iss-00013`、clean。実装単位の開始は `ce5d4e23db672cc369cd1cdbcf9f52b9bb6da5fd`。start.md の baseline（lint/test 360件/build 合格、コード由来の既存失敗なし）を読み、走らせ直していない。
- 仕様の固定：requirement.cue `c6519f006337a30631107f9235d5e808367cd63c9106d7b65d53f0db6183471f`、design.cue `01210f095b741f3a45edc9eca88de3d4af3b5042d508118200035c8fa87fb808`、plan.cue `e0a2e374daab2684035d0c091cf4599a1c9c38d73f302c16c216b29cc31340a9`。開始前の shasum -a 256 がすべて一致。report.md の round 6〜7 の仕様再レビュー合格を確認。
- 照合：D-04 の readForeground(handle, incarnationId, agentType) と matchesAgent、D-06 の preflight（shell_foreground を先に判定し不一致を foreground_mismatch）、D-05 の appendRefused の失敗時の偽とメモリー保持。Orca v1.4.258 の agent-process-recognition.ts の normalizeProcessName と recognizeAgentProcess を読み、claude の完全一致、codex の完全一致または codex- 接頭辞を採用。isExpectedAgentProcess のドット接尾辞許容は採用しない。
- 変更：src/orca/send.ts、src/send/service.ts、src/send/journal.ts と各テストの6ファイル。refused は決めた項目だけをメモリーにも保持し、既存の read の重ね合わせで照会できる。
- Red（s11-red.log）：`node --test --test-name-pattern='前面を Orca' test/orca/send.test.ts` は1件失敗（matchesAgent がない）。`node --test --test-name-pattern='意図と確定は稼働中' test/send/service.test.ts` は非シェル10場面を拒まず票を出して失敗（シェル2場面は既に合格、親を含め fail 11 / pass 2）。`node --test --test-name-pattern='refused は書けなくても' test/send/journal.test.ts` は1件失敗（read が null）。各 Red の直後に対応する最小の実装を直した。
- Green（s11-green.log）：同じ選択でそれぞれ1件・13件（親と12場面）・1件合格。`node --test test/orca/send.test.ts test/send/service.test.ts test/send/journal.test.ts` は最終63件合格。許可8場面（claude、codex、codex-…、引用符とパス、.exe/.cmd/.bat/.ps1）で intent と confirm が通り送信は1回だけ。拒否12場面は両方で0回、refused の理由も一致。保存に失敗した refused を SendService.check(query:true) から読め、Orca の送信も照会も増えない結合テストを追加。
- 途中の検証：編集フックの lint-quick が service.test.ts の整形だけで失敗したため、`node_modules/.bin/biome format --write test/send/service.test.ts` で修正。最初の対象3ファイルの検証は62件合格・1件失敗。既存の agent_changed テストが前面 codex のままで先に foreground_mismatch になったため、仮の前面も変更先 claude に合わせ、preflight を通った後の target_changed 契約を引き続き検証した。既存 baseline の失敗には数えていない。
- 最終検証：`make -s lint-quick FILES="src/orca/send.ts src/send/service.ts src/send/journal.ts test/orca/send.test.ts test/send/service.test.ts test/send/journal.test.ts"` exit 0（6ファイル）、`npm run lint` exit 0（145ファイル、tsc 合格、s11-lint.log）、`npm test` exit 0（496件、失敗0、s11-test.log）、`npm run build` exit 0（s11-build.log）、`git diff --check` exit 0。
- 逸脱：なし。対象以外のファイルと仕様は変更していない。実機の送信・send:live・push は行っていない。pstack の参考を読んだが、依頼書どおり Green の手順単位でコミットする。最終品質ゲートの次の attempt はタスク担当が実施。
- S-11 commit：`b4a93279f6f570ce8300657a50791589677073d9`（parent `c6049569059c1bb70c6e58a87df27c24be765cd7`、`fix(send): 前面プロセスが宛先エージェントと一致する場合のみ送信する`）。git-autocommit exit 0。branch 不変、コミット後 clean（upstream より1 ahead、push なし）。完了後も仕様3ファイルの sha256 は合格の固定と一致。


### 追加修正：FQG v2 attempt 01 の P1（journal の切れた末尾、2026-11-14）

- 依頼：タスク担当の `msg_172ce197c922`。仕様変更なし、D-05 の記録の追記と耐久化、R-05 の not_sent の意味を守る修正。開始 HEAD `b4a93279f6f570ce8300657a50791589677073d9`、branch `chemitaro/iss-00013`、clean。baseline は start.md の既存記録を継続し、再実行していない。既存失敗なし。
- 原因：改行のない不完全な JSON の末尾に次の JSON を連結すると、parseRow が両方を1つの壊れた行として捨て、before だけを書いた操作が記録なしになる。
- 変更：src/send/journal.ts と test/send/journal.test.ts の2ファイル。ファイルは追記の性質を保った `a+` で開き、同じハンドルから stat と最後の1バイトだけを読む。空ならそのまま、末尾が LF でなければ区切りを前置し、区切りと JSON と末尾 LF を1回の writeFile で書く。before はその後に datasync し、失敗は従来どおり投げる。ファイル全体の読み直しや書き換え、既存断片の削除はしない。行の schema と項目、権限は不変。
- Red：`node --test --test-name-pattern='切れた末尾' test/send/journal.test.ts` exit 1、1件失敗。断片の後の appendBefore は成功したのに、新しい SendJournal の read で before が undefined（journal-tail-red.log）。
- Green：同じ選択で1件合格（journal-tail-green.log）。毎回各行の前に切れた断片を足し、before、after、check、refused を新しい SendJournal から読み直すことで、メモリーで隠れない永続化を検証。before だけなら unknown / no_after_record、断片の操作は null。既存 datasync テストも切れた末尾から始め、同期完了を待つことと同期失敗を確認。追加した末尾読み失敗テストは before が失敗し、ファイルを追記せず、成功扱いにしないことを確認。
- 対象と結合の検証：`node --test test/send/journal.test.ts test/send/service.test.ts` exit 0、54件成功。SendService の before 書き込み失敗時に送信0回という既存テストを含む。
- 最終検証：`make -s lint-quick FILES="src/send/journal.ts test/send/journal.test.ts"` exit 0（2ファイル）、`npm run lint` exit 0（145ファイルと型検査、journal-tail-lint.log）、`npm test` exit 0（498件、失敗0、journal-tail-test.log）、`npm run build` exit 0（journal-tail-build.log）、`git diff --check` exit 0。
- 途中の整形：編集フックが JournalIo の長い型の改行だけを指摘し、`node_modules/.bin/biome format --write src/send/journal.ts test/send/journal.test.ts` で修正。未解決の失敗なし。
- 判断と逸脱：タスク担当が認めた末尾1バイト確認の方法を選択。読み取りを加えるため a を a+ にしたが、O_APPEND と before の耐久化は維持。仕様変更、push、実機送信は行っていない。次の品質ゲートはタスク担当が実施し、worker_done は送らず待機する。
- 修正 commit / HEAD：`0c434cb1ad81d1f5c56b0f47a0017f7adacaef45`（parent `b4a93279f6f570ce8300657a50791589677073d9`、`fix(send): 壊れた末尾の後でも記録を読み取れるようにする`）。git-autocommit exit 0。branch 不変、コミット後 clean、upstream より1 ahead（push なし）。
