---
種別: レポート（Issue）
ID: "iss-00012"
関連GitHub: ["#12"]
最終更新: "2026-11-13"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

会話のログの API と、エージェントの詳細とチャットの画面（読むだけ）を出した。送信の欄は置いていない（iss-00013）。

- 会話の読み手（`src/orca/read-transcript.ts`）、正規化（`src/transcript/normalize.ts`、`orca-web.transcript/v1`）、窓の差分と共有の見張り（`src/transcript/diff.ts`、`hub.ts`）、HTTP（`GET /api/transcript`、SSE の `GET /api/transcript/events`、`/embed/agent`）、画面（`web/embed/agent.*`）、状態の画面からのリンク、実機の確かめの道具（`npm run transcript:live`）。
- 前の作業者の下書きに対して、仕様と照らして直したこと：窓の差分が先頭の件の消失を前進と取り違える穴（hasMore で判定）、untabbed のエージェントを `no_session` に、構造化 Chat の plan を `what: plan` に、見張りの close の後と解決中の解除の穴、道具の誤りの集計と untabbed を含む数え方、画面の欠けた値の理由を文字で示す・前を読むの 200/409 の扱いを純な関数に・reasoning を画面でも描かない守り・390px での Orca で開くの隠し方。
- 実装担当：S-01〜S-05 は Codex GPT-6.1 Sol / medium（dispatch `ctx_73ba72f0d103`、launch の受領で codex・gpt-6.1-sol・medium）、S-06 は Claude Opus 5.5 / medium（`ctx_9180fc25e8be`、本人の補足による）、S-07 はタスク担当。

### 逸脱と判断（タスク担当）

- report.md は実装担当の sandbox から書けなかった（canonical の writable=false）。設定は変えず、実装担当は `.workbench/implement/iss-00012/report-implementation.md` に書き、タスク担当が下の「実装の記録」に写した。
- 仕様の ChatGPT の2人目は round 2 で選択の証拠が verified=no、round 3 で送信の失敗、round 4 は送らなかった（レビュー記録を参照）。

### 前の作業者の下書きの扱い

ブランチには、前の作業者（Claude、旧い進め方）のコミット `f902243`、`4fd39db`、`18e9697`（`373d026..18e9697`、29ファイル、約3300行）がある。レビューは受けていない。
タスク担当は、これを**下書きとして残し、作り直さない**と決めた（2026-11-13、requirement の decisions）。設計の D-01〜D-08 の各単位に対応するファイルとテストがあり、`npm test`（241件）と `npm run lint` が通るため。
実装担当が、仕様と1単位ずつ照らして食い違いと足りないテストを直す（plan の S-01〜S-06）。区切りのレビューと最終品質ゲートの範囲は `373d026` から始め、前の作業者の分を含める。

## レビュー記録

### 仕様のレビュー（spec-review、保証レベル strict）：合格

- 合格の固定（sha256）：requirement.cue `0931f609abdccbd1499967f35854399ad3698f41515480e643ac85d67c9a4fa8`、design.cue `808181800c9502a54d4a3a5bbe6c96b78a60d8107e284fb07b57f6699b179253`、plan.cue `e23d1ae2aaa6a866812e254cc3126c67dd5e14964212b19f549aec2e64ceffba`（canonical の `20fb7235d3a589ddb46257e52aceb0d46586bc4b`）
- 結果：`.workbench/spec-review/iss-00012-v2/round-3.json`（Claude spec-reviewer Opus 5.5 / high。P0〜P3 0）。応答の記録は同じ場所の `review-response.md`
- 経過：round 1 Claude pass（P2 1、P3 3）、ChatGPT GPT-6 / Extra High fail（P1 2、P2 1：窓の先頭の削除、計画の範囲と完了条件の食い違い、untabbed）。直した。round 2 Claude pass（P3 1）、ChatGPT fail（P1 1：満ちた窓での削除と追記。モデルの選択の証拠が verified=no のため有効な結果としては受けず、中身を手元で確かめて採った）。直した。round 3 Claude pass（0）、ChatGPT は送信が2回とも失敗して取れなかった
- P2/P3 の残り：0（すべて直した）

### 仕様の変更の再レビュー（round 4、2026-11-13）：合格

- 本人の補足で、画面の手順を Claude Opus 5.5 / medium の別のセッションに分けた（S-05 と S-06 の中身を入れ替え）。
- 合格の固定（sha256）：requirement.cue `e6c3306274f6a3b2b2c66e6d5b4ecfe3d1d6e0e12155c51c4c6ebd9907bb7ac9`、design.cue `808181800c9502a54d4a3a5bbe6c96b78a60d8107e284fb07b57f6699b179253`、plan.cue `5f53439f2695c118c4b47abbc922e6bb65ddb30869df3cc690370ee648d99137`
- 結果：`.workbench/spec-review/iss-00012-v2/round-4.json`（Claude、P0〜P3 0）。ChatGPT は送っていない（理由は review-response.md）

### 区切りのレビュー CP-1（code-review）：合格

- 範囲 `373d026..d6aa5fbb7ea53cea485b1f7c097ca030a3065f1c`（前の作業者の分を含む）。Claude `code-reviewer` Opus 5.5 / medium を2人（standards、spec）並べた。どちらも P0〜P3 0。
- 結果：`.workbench/code-review/iss-00012-cp1/round-1-{standards,spec}.json` と `.check.json`。計画は CP-1 に ChatGPT を置いていない。

## Verification

### 実機の確かめ（読むだけ、2026-11-13、S-07）

この Mac の Orca 1.4.256（CLI も app も 1.4.256、`orca --version`）。`npm run transcript:live` の集計（件数だけ）。送信の RPC、開く口、購読の口は呼んでいない。会話の中身は記録していない。エージェントは状態の API と同じく 57（端末のタブ 54、構造化 Chat 2、untabbed 1）。

| 取得元：種類 | エージェント | 解けた | 読めた | 誤り | 件数（落とした思考） | 返る順で位置が減らない | 2回目の読みの差分 | 前のページ（重なり） |
|---|---|---|---|---|---|---|---|---|
| nativeChat：claude | 17 | 17 | 17 | なし | 664（16） | 17/17 | none 17 | 17（0） |
| nativeChat：codex | 2 | 2 | 2 | なし | 80（0） | 2/2 | none 2 | 2（0） |
| agentSession：claude（構造化 Chat） | 2 | 2 | 2 | なし | 40（0） | 1/2（1 は位置なし） | none 2 | 1（0） |
| 解けない | 36 | 0 | 0 | no_session 36 | ― | ― | ― | ― |

- 部品は本文、ツールの呼び出しと結果だけで、「表示できない」の印は出なかった。
- **並び**：端末は Orca の画面と同じ読み方（`transcriptSourceOrder: 1`）で、返る順のまま。返る順で位置が減った会話は 0。
- **購読の口**：Orca v1.4.256 のソース（`.workbench/orca-src`）で、Unix ソケットの要求は `runtime-rpc-request-admission.ts` が `dispatcher.dispatch` だけを呼び、`rpc-request-admission-prologue.ts` が streaming の method を `method_not_supported`（requires a streaming transport）で拒む。subscribe は実機で送っていない。
- **画面**：一時の port（8799）で起動し、headless の Chrome（CDP、`Browser.close` で閉じた）で、このリポジトリの worktree のエージェントの `/embed/agent` を開いた。幅 390px：横のはみ出し 0、Orca で開くは出ない。幅 1024px：はみ出し 0、Orca で開くが出る。どちらも詳細 10 行、会話 24 行、会話と詳細の中の `script`・`img` の要素 0、送信の欄（textarea、入力、form）0。Orca で開くは押していない。
- 検証：`npm run lint` 0、`npm test` 267 件合格、`npm run build` 0（HEAD `5950ebb`）。

### 最終品質ゲート（final-quality-gate、strict）：合格

- 合格のコミット `5950ebb8b2fe03d7aed3d0b35539ee48adaaf52c`、範囲 `373d026..5950ebb`（前の作業者の分を含む）、試行 1 回。`closure.md`：`.workbench/final-quality-gate/iss-00012-v2/closure.md`
- 主：quality-gate-reviewer Opus 5.5 / high、pass（P0/P1 0、P3 1、coverage_complete）。観点に security-baseline を足した。
- 2人目：ChatGPT GPT-6 / Extra High（選択の証拠 verified）、pass（P0/P1 0、P2 2）。
- テスト：`npm run lint` 0、`npm test` 0（267 件）、`npm run build` 0。
- P2/P3（直していない）：plan の印の画面の表示名（P3）、`agentSession.history` の返ったページの sessionId を照らしていない（P2）、hasMore が真で位置が欠けるとき最後のページとして扱う（P2）。
- 記録だけのコミットはない（report.md は Git の外）。

### PR と CI

- PR #20 https://github.com/chemitaro/orca-web/pull/20（head `5950ebb`、`Refs #12`、`Refs #4`）。CI（GitHub Actions）pass、マージの準備は READY（`github-pr-checks` の observer、2026-11-13）。マージは本人が行う。

## Residual Risks / Follow-ups

- `nativeChat.readSession` と `agentSession.history` は非公開の口。Orca の版が変わったら `npm run transcript:live` で確かめ直す。
- 読み直しの間隔（1.5 秒）の分だけ、Orca の画面より遅れる。40 件より多い件が1回の間隔で足されると置き換えになる。
- hasMore が真のとき、窓の外へ出た件が書き換えで消えたのか前進で外れたのかは区別できない（design D-03）。
- 構造化 Chat の会話は手元に2つだけで、approval・question・plan の件は実機で見ていない（「表示できない」の印になる）。
- SpecDock のオリジンの試しの画面での受け入れは iss-00014。

## 実装の記録（実装担当の記録を写した）

### S-01：会話の取得元のアダプター

- D-01 を照合し、読み手に最新の共有状態の untabbed の判定関数を追加。タブにない既知の id を no_session にする（起動側の接続は S-04）。reset の古い説明を修正。
- T-01/T-03/T-04/T-07：untabbed の追加と消失、タブ id と launchAgent のフォールバック、種類とセッションの欠け、鍵の各要素、構造化 Chat の誤りのテストを追加。
- Red：node --test --test-name-pattern='最新の状態の untabbed' test/orca/read-transcript.test.ts は期待 no_session、実際 agent_not_found で失敗。
- Green：node --test test/orca/read-transcript.test.ts test/orca/rpc.test.ts は24件合格。npx biome check --write src/orca/read-transcript.ts test/orca/read-transcript.test.ts、npm run lint は成功。
- コミット：b7e1466（fix(orca): タブ外エージェントの状態とセッション解決を改善）。

### 逸脱と判断（実装担当）

- baseline は指定の開始コミットで lint・241件のテスト・build がすべて成功。既存失敗なし（.workbench/implement/iss-00012/start.md）。
- 読み手の判定関数は任意とし、状態の文書を持たない既存の利用者は従来どおりにする。S-04 で共有 poller を接続する。
- 鍵の固定値テストの期待値の転記誤りを Python hashlib で検証して訂正。製品の不具合の Red には数えない。
- report.md の書き込みは sandbox に拒否された。canonical status の writable は false。正本を変えず、ここに追記候補を保持してタスク担当に反映を依頼する。

### S-02：会話の正規化

- D-02 を照合し、構造化 Chat の plan を what: plan の unsupported に修正。
- Red：node --test --test-name-pattern='plan は本文' test/transcript/normalize.test.ts は期待 plan、実際 unknown で失敗。修正後は成功。
- node --test test/transcript/normalize.test.ts は12件合格。許可した what の名前、sequenceIndex の順、空の部品と agent-handoff の除外、構造化 Chat の本文と入出力の長さ・bounded output の truncated を補強。
- npx biome check --write src/transcript/normalize.ts test/transcript/normalize.test.ts と npm run lint は成功。
- 仕様の変更なし。fixture は既存の仮の会話を維持し、追加のケースも自作の値だけ。
- S-02 コミット：4cd5290。node --test test/server/transcript-api.test.ts は9件合格。初回に test/server/transcript.test.ts と誤記した呼び出しはファイルなしで失敗し、正しいファイル名で実行し直した。

### S-03：窓の差分と共有の見張り

- D-03/D-04 を照合。diffWindow の必須引数 full を追加し、o>0 の一致は full のときだけ認める。hub は今の読みの hasMore を渡す。全呼び出しを検索し、実機集計の呼び出しも同じ条件を渡すだけ更新した（実機は起動していない）。
- Red→Green：node --test --test-name-pattern='満ちていない窓' test/transcript/diff.test.ts で none と replacement の食い違いを再現後に修正。40件でも hasMore=false なら replacement、true なら appended を差分と hub の両方で確認。
- Red→Green：node --test --test-name-pattern='close の後' test/transcript/hub.test.ts で購読者数 -1 を再現後に修正。node --test --test-name-pattern='セッションの解決中' test/transcript/hub.test.ts で最後の解除後の追加の読みを再現後に修正。
- node --test test/transcript/diff.test.ts test/transcript/hub.test.ts test/server/transcript-api.test.ts test/tools/live-transcript.test.ts は28件合格。npm run lint は成功。npx biome check --write で対象5ファイルを整形。
- 追加の検証：初回の読みを複数の購読と tick が共有し、同じ snapshot が1回ずつ届く。仕様の変更なし。
- S-03 コミット：cba04d6。

### S-04：HTTP と起動

- D-05 を下書きの app.ts と照合し、既存の HTTP 状態表・same-origin/Host の拒否・SSE の形・CSP は仕様どおりであることをテストで補強。main.ts の読み手に poller.snapshotSync() の untabbed 判定を接続。
- T-07〜T-10：共有状態の API で取得した untabbed の id が404 no_sessionで記録を読まないこと、read_failed/unknown_shape/unreachable/unsupported の厳密な本文と状態、両方の道で HEAD/POST/PUT/DELETE/OPTIONS が405、Origin が異なれば403・Host が違えば421で読みを行わないことを検証。
- SSE は snapshot/appended(updated含む)/replacement(rewritten・recovered・session-changed)/unavailable の名前と data、retry: 5000、見張りと購読者の各上限の busy と終了を検証。前ページの鍵の不一致の409・読みの抑止、CSPのinline不許可とframe-ancestorsの許可先・noneも確認。
- node --test test/server/*.test.ts は61件合格。npm run lint、npm run build は成功。npx biome check --write src/server/main.ts test/server/transcript-api.test.ts（追加後に test のみ再整形）も成功。
- S-04では、S-01でRed→Green済みのuntabbed判定を起動に接続し、それ以外は既存の振る舞いの検証を補った。仕様の変更なし。S-05には進まずCP-1を待つ。
- S-04 コミット：d6aa5fb。CP-1 HEAD：d6aa5fb（親 cba04d6）。S-01〜S-04 完了、作業ツリー clean で停止。

### 2026-11-13 CP-1 後の担当変更

- タスク担当から CP-1 合格（373d026..d6aa5fbb7ea53cea485b1f7c097ca030a3065f1c、2人とも P0〜P3 0、直しなし）を受領。
- 本人の補足による計画変更を確認。新しい合格ハッシュは requirement e6c3306274f6a3b2b2c66e6d5b4ecfe3d1d6e0e12155c51c4c6ebd9907bb7ac9、design 808181800c9502a54d4a3a5bbe6c96b78a60d8107e284fb07b57f6699b179253、plan 5f53439f2695c118c4b47abbc922e6bb65ddb30869df3cc690370ee648d99137。正本とレビュー記録が一致。
- Codex の担当は S-01〜S-05。新しい S-05 は D-08 の道具のみで、画面は S-06 の別担当へ移る。仕様は変更していない。

### S-05：実機の確かめの道具（改訂後の計画）

- D-08 と live-transcript.ts、transcript-live.ts、package.json の transcript:live を照合。既存のスクリプト定義は node src/tools/transcript-live.ts で正しく、package.json の変更は不要。
- Red→Green：node --test --test-name-pattern='2回目の読みが失敗' test/tools/live-transcript.test.ts で2回目の誤りの code が集計されない失敗を再現して修正。同 --test-name-pattern='前のページの失敗も' で older:transcript_not_found と code の食い違いを再現して修正。2回目と前のページの失敗も errors で code ごとに数える。
- 実機を使わず出力全体を確かめるため、入口の処理を読み口を受け取る probeTranscripts にし、直接実行のときだけ標準出力へ JSON を書く（import.meta.main）。CLI 定義と出力の形は維持。
- Red→Green：node --test --test-name-pattern='道具の出力全体でも' test/tools/live-transcript.test.ts で、状態のエージェント6件に対して集計5件の不一致を再現。untabbed の除外をやめ、共有 poller の最新状態の判定を読み手に渡して no_session として集計するよう修正。
- T-17：出力全体の件数一致、untabbed、接続失敗時の理由の除外、2回目の未知の形、前ページの非重複、下降する並び、本文・ツール名/入出力・題名・パス・セッション識別子の不出力を、自作の値と既存の再生 fixture で確認。subscribe と activate を呼ばないことも検証。
- node --test test/tools/*.test.ts は13件合格。npx biome check --write src/tools/live-transcript.ts src/tools/transcript-live.ts test/tools/live-transcript.test.ts は成功。
- 最終確認：npm run lint、npm test（265件合格、失敗0）、npm run build はすべて終了コード0。ログは同じディレクトリの final-lint.log、final-test.log、final-build.log。baseline の既存失敗はなし。
- web/ と S-06/S-07 は未着手。実機の道具、service、push は実行していない。正本 report.md への反映は承認どおりタスク担当に依頼する。
- S-05 コミット：2ca2f170109b382732c7d2524f3fd74b9f5339a0（親 d6aa5fbb7ea53cea485b1f7c097ca030a3065f1c）。作業ツリー clean、upstream より1コミット ahead、pushなし。
- 最終 HEAD：2ca2f170109b382732c7d2524f3fd74b9f5339a0。担当完了は S-01 b7e1466 / S-02 4cd5290 / S-03 cba04d6 / S-04 d6aa5fb / S-05 2ca2f17。新しい仕様ハッシュ3つは最終時点でも一致。

### S-06

- 担当：Claude Opus 5.5 / medium（plan の execution.sessions.ui）。開始 HEAD 2ca2f17（clean）。仕様の sha256 3件は合格の値に一致。
- D-06・D-07 を1文ずつ下書きと照らした。合っていたもの：純粋な組み立て（buildDetail・buildChat・reduceChat・prependOlder）、textContent だけの描画、https だけの PR リンク、snapshot／replacement で前のページを含めて捨てる、鍵の違う appended を足さない、要求の後に置き換えを受けた／鍵の違う古いページを足さない（generation と鍵の照合）、unavailable で理由と「Orca の画面で確かめて」、送信の欄なし、明暗の配色（prefers-color-scheme と data-theme）、inline の script と style なし、エージェントの行のリンク（新しいタブ、rel=noopener）。
- 直したもの：
  - 取れない値の理由がツールチップ（title）だけで、iPhone では読めなかった → 「（取れない：理由）」を文字でも出す（R-03「取れなければ取れないと理由」）。
  - 「前を読む」の応答の扱い（200 で足す／409 で置き換えを待つ／ほかは理由）を純粋な関数 `olderResult` に移し、テストした（T-14、409 の扱い）。
  - 思考を画面でも描かない守り：role `reasoning` の件を飛ばす（正規化で既に落とすが、画面のテストで確かめる。T-12）。
  - 「Orca で開く」：開く先がない（エージェントが見つからない）ときは押せなくした。id がないときに幅の変化で隠しが外れる穴を塞いだ。CSS でも 390px 以下で隠す（スクリプトの前でも出さない）。
- 問い：なし（src/ の契約と画面の間の食い違いは見つからなかった）。
- 確かめ：`node --test test/web/*.test.ts` 25 件合格（Red：olderResult の import 不在と理由の文字なしで2件失敗を確認後に Green）。`npm run lint` 0、`npm test` 267 件合格・失敗 0、`npm run build` 0。baseline に既存の失敗なし。
- 残り：実機の 390px の確かめ（S-07、タスク担当）。
