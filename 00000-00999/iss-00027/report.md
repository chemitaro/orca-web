---
種別: レポート（Issue）
ID: "iss-00027"
関連GitHub: ["#27"]
最終更新: "2026-11-14"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

## レビュー記録

- 仕様レビュー：合格（round-2、2026-11-14）。レビュアー spec-reviewer（Opus 5.5 / high）。P0/P1 0、P2 0、P3 0。round-1 は P1 1（試しの画面の CSP が部品の CSS を拒む）、P2 1（47901 で import を試す道がない）、P3 1（並びの食い違い）で不合格。直して再レビュー。
  - 合格した文書の sha256：requirement.cue `9a72fc33f0c8acdc1144a37cffa188d485750ad79a49d3e239ac8f83b1bf10bb`、design.cue `2478be7c45c46025ab9df0491b160f88871e88732f7a3ec052adaeecf06773b3`、plan.cue `c8baf1a4251b0db5d8de0bac79f110244108e294b26bd1062a563dd9152e6bd1`
  - 結果：`.workbench/spec-review/iss-00027/round-2.json`（対応の記録は `review-response.md`）。照合のコミット `68d8c88b880abbdbbe91b8123aa38b7bb51658ea`
- 区切りのレビュー：なし（計画どおり）。
- 最終品質ゲート：合格（fqg-iss-00027-1、attempt 1、2026-11-14）。合格のコミット `3c6c24d0052be6aa76ec55a47dfd528afb5768b5`、範囲 `68d8c88..3c6c24d`。quality-gate-reviewer（Opus 5.5 / medium）は P0〜P3 すべて 0、coverage 完全（functional-correctness、requirements-closure、test-adequacy、security-baseline）。テスト `npm run lint`・`npm test`（568 pass）・`npm run build` すべて exit 0。closure：`.workbench/final-quality-gate/fqg-iss-00027-1/closure.md`。記録だけのコミットはなし。
- PR：https://github.com/chemitaro/orca-web/pull/29（head `3c6c24d`）。CI：observable_ci PASS、merge_readiness READY（2026-11-14）。
- PR #29 は統括がマージした（main `10ab4e9`）。
- 追記（2026-11-14、本人の要望：色とスタイルを SpecDock に合わせる、作業中に回る動き。統括の依頼 task_719d89144ea2）の仕様レビュー：合格（round-3）。レビュアー spec-reviewer（Opus 5.5 / high、同じレビュアー）。P0/P1 0、P2 0、P3 2（R-02・D-04 に改める前の見た目の記述が残る。計画の手順の status と exit・rollback が追記と済んだ手順を映していない。直さずに記録。今の約束は R-05・R-06・D-08・D-09 と decisions が優先する）。
  - 合格した文書の sha256：requirement.cue `6e5c8d1da4f812878e47d3e36093d57bf614ed1c1b42702879887b7037ead583`、design.cue `43102a2d5238866a6361511176f531caca28694b660f455dadee29dc4734fa16`、plan.cue `01d996b22d30f2bdcd11cb98d133b1ae98c7a0dab7ab96f810f194d5ce146c54`
  - 結果：`.workbench/spec-review/iss-00027/round-3.json`。照合のコミット `10ab4e9a64223d6b295f56d6f90c8cde5afe1343`
- 追記の最終品質ゲート：合格（fqg-iss-00027-2、attempt 1、2026-11-14）。合格のコミット `99ba358c80140adc074cf80df71fbce71c630be8`、範囲 `10ab4e9..99ba358`。quality-gate-reviewer（Opus 5.5 / medium）は P0〜P3 すべて 0、coverage 完全。D-08 の表の値は SpecDock の app.css の明暗の値とすべて一致。テスト `npm run lint`・`npm test`（576 pass）・`npm run build` すべて exit 0。closure：`.workbench/final-quality-gate/fqg-iss-00027-2/closure.md`。記録だけのコミットはなし。
- 追記の PR：https://github.com/chemitaro/orca-web/pull/30（head `99ba358`）。CI：observable_ci PASS、merge_readiness READY（2026-11-14）。
- PR #30 は統括がマージした（main `fc654c0`）。
- 経過の表記の追記（2026-11-14、本人の指摘・統括の決定 task_27eff0d07653：now・5m・3h・2d）の仕様レビュー：合格（round-5）。round-4 は P1 1（受け箱の formatElapsed が同じ規則を持つのに1か所にする作業がない）、P2 1（置き換えた前の約束が残る）、P3 1（計画の状態と exit・rollback）で不合格。直して round-5 は P0/P1 0、P2 0、P3 1（受け箱と Run の木で短い形がそのまま読み上げられる。直さずに記録）。
  - 合格した文書の sha256：requirement.cue `4eb1dc3fd3d5310f27469e4b6260c8541e8fb8c4854c70d131a9e6330b8ed9bc`、design.cue `4523a6026bef4cfce34c3c4b764f2aea8ef8d0e564372bf0efaa4d88bc700cfb`、plan.cue `effa788929f14814fa6657a7ee3f39cc7805d47065a5126f37c91d5d8cd9d1d2`
  - 結果：`.workbench/spec-review/iss-00027/round-5.json`（対応は `review-response-4.md`）。照合のコミット `fc654c0f9c2838db2ca7d3b69de14adde1c0f3da`
- 経過の表記の実装担当（elapsed、S-08）：claude / claude-opus-5-5 / medium（dispatch ctx_00db1c828ac7、`launch.effective` は計画どおり）。コミット `c0fafd9`。S-09（README・AGENTS）はタスク担当、`40e5081`。
- 経過の表記の最終品質ゲート：合格（fqg-iss-00027-3、attempt 1、2026-11-14）。合格のコミット `40e5081ad9fd059c23f262573c07b200bd743fe4`、範囲 `fc654c0..40e5081`。P0/P1/P2 0、P3 2（文書がチャットの利用を現在形で書く。Run の木の未来の時刻のテストがない）。coverage 完全。テスト `npm run lint`・`npm test`（581 pass）・`npm run build` すべて exit 0。closure：`.workbench/final-quality-gate/fqg-iss-00027-3/closure.md`。記録だけのコミットはなし。
- 経過の表記の PR：https://github.com/chemitaro/orca-web/pull/31（head `40e5081`）。CI：observable_ci PASS、merge_readiness READY（2026-11-14）。
- 経過の表記の確かめ：試しの画面（tailnet の URL、ヘッドレスの Chrome）で印の経過が `now`・`Nm`・`Nh`・`Nd` に見える（写し `.workbench/trial-evidence/iss-00027/elapsed/`：`trial-light.png`、`trial-dark.png`、`phone-light.png`。コミットしない）。実装担当の確かめで、印 181 個の aria-label に『今』と短い形がない。試しのサーバーは新しい配る表のため起動し直した（tailnet でも待ち受けたまま）。

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 要約の API（`orca-web.worktree-summary/v1`、版はそのまま）に、エージェントごとの経過の起点 `elapsedFrom` とその種類 `elapsedBasis`（`state`：状態の始まり。スリープと不明で状態の始まりがなければ `worktree-activity`：worktree の最後の活動。どちらもなければ null）を足した。
- 稼働の印の部品（`web/embed/agent-marks.js`・`agent-marks-view.js`・`agent-marks-icons.js`・`agent-marks.css`）。SpecDock が別のオリジンから import する ES Module。種類はアイコン（Claude・Codex は stablyai/orca のコミット 80a514c から写した実物のロゴ、ほかは中立の丸、種類なしは破線の丸）、状態は色（作業中 緑、許可待ち 赤、入力待ち 琥珀、完了 青、スリープ 灰と月の印、不明 灰の破線）、経過は「今・N分・N時間・N日」。読み上げの名前と title に種類・状態・経過と起点を持つ。要約の読みの輪 `watchWorktreeSummary` で1回読んで多くの箱や行に描ける。アイコンの表は `AGENT_ICONS` の1か所。
- 部品の4つのファイルにだけ、要約と同じ読み取りの CORS（許さないオリジンは 403）。
- 試しの画面を部品で描き直した（構造の図の箱の見本、Issue の一覧の行の見本、節の一覧。数の札は色の点と数だけ）。試しの静的なサーバーの CSP の style-src に試しの orca-web を足し、許さないオリジンの画面に部品の import の確かめを足した。
- コミット：`f0c55cd`（S-01）、`9375f07`（S-02）、`4598562`（S-03）、`7986ef4`（S-04）、`3c6c24d`（S-05 の README・AGENTS）。
- 実装担当（`launch.effective`）：ui（S-01）claude / claude-opus-5-5 / medium（dispatch ctx_bea19ebb8d3a）、impl（S-02〜S-03）codex / gpt-6.1-sol / medium（ctx_cce222fefa2c）、trial（S-04）claude / claude-opus-5-5 / medium（ctx_37145c363df6）。S-05 はタスク担当（Opus 5.5 / medium）。

### 逸脱と判断

- アイコン：仕様化の途中で統括の答えが案A（自前の図形、msg_8fb42dcb5148）から案B（実物のロゴ、本人の決定、msg_59c9286c72c4）に変わった。仕様は案B で書き、レビューに通した。
- S-02：型の検査を通すため、統括（タスク担当）の許可で `test/web/trial-view.test.ts` の既存の fixture に2項目を足した（計画の対象の外。期待値は変えない）。
- 実装の裁量（S-01）：経過が「今」のときの読み上げの文、知らない basis の文、max と size の既定、ロゴの完全一致のテストは `.workbench/orca-icons.tsx` があるときだけ（CI では先頭と末尾の照合）、JSDoc の型。
- S-04 の画面の確かめは、Chrome の拡張が複数つながって選べなかったので、ヘッドレスの Chrome を CDP で起動して行った（実装担当の報告）。

## Verification

- テスト：開始のコミット `68d8c88` で `npm test` 534 件 pass、`3c6c24d` で 568 件 pass。`npm run lint` と `npm run build` は成功。
- 実機（2026-11-14、`orca --version` 1.4.258、一時の port の `npm start`、読むだけ。件数と結論だけ）：
  - 要約：エージェント 60。スリープ 43 のうち 42 が `worktree-activity`（1 は worktree に時刻がなく null）、不明 3 のうち 2 が `worktree-activity`、1 が null。working 6・done 8 は `state`。`since` のある 14 件はすべて `elapsedFrom` = `since`。`stale: false`。
  - 部品の CORS：4つのファイルとも `Origin: http://127.0.0.1:47800` で 200 と `Access-Control-Allow-Origin`、`http://127.0.0.1:47801` で 403。
- 試しの画面（`npm run trial`、ヘッドレスの Chrome、写しは `.workbench/trial-evidence/iss-00027/`、コミットしない）：
  - `mac.png`（幅 1440px）：構造の図の箱の見本に、印（アイコン、色、経過）が箱の中に1行で収まる。スリープは灰と月、不明は破線、作業中は緑、完了は青。
  - `phone.png`（幅 390px）：箱が2列になり、印は収まる。
  - `forbidden.png`（47901）：(1)〜(6) すべて拒まれ、(6) 部品の import も失敗した。
  - 実装担当の確かめ（S-04）：幅 1440px と 390px で箱・行・節それぞれ 55 の印が枠に収まり、横のスクロールなし。印を選ぶと詳細とチャットの iframe が開いた。送信と「Orca で開く」はしていない。

## 追記：SpecDock のデザインシステムとの突き合わせ（2026-11-14、R-05・R-06）

正本：spec-dock の main `928460f48` の `src/spec_dock/assets/dashboard/app.css`（`--ds-*`、`--sd-*`、`.chip`、`.st-ico`、`sd-next`）と `core/ui.js`（`STATES`、`stateIcon`、`progressRing`）。読むだけで、SpecDock のリポジトリは変えていない。

### 状態ごとの色（主・背景・線・文字）

| orca-web の状態 | SpecDock の状態（変数） | 明るい | 暗い | 理由 |
|---|---|---|---|---|
| working（作業中） | doing「作業中」（`--sd-doing*`） | #0b8a4a・#e7f6ee・#b3e0c6・#0a6b3a | #3ddc84・rgb(61 220 132 / 10%)・28%・#7ce8ab | 同じ意味 |
| blocked（許可待ち） | blocked「止められている」（`--sd-blocked*`） | #a86e00・#fff6dc・#efd595・#7a5000 | #ffc93c・rgb(255 201 60 / 10%)・28%・#ffd978 | 同じ意味（進むのに許可が要る） |
| waiting（入力待ち） | ready「着手できる」（`--sd-ready*`） | #2457c5・#edf2fc・#c3d3f3・#1d469f | #6f9dff・rgb(111 157 255 / 10%)・28%・#a8c3ff | SpecDock に同じ意味はない。利用者が動けば進む「こちらの番」で、SpecDock の『着手できる』と同じ意味の向きを持ち、blocked の琥珀と見分けられる |
| done（完了） | done「終わった」（`--sd-done*` = `--ds-faint`・`--ds-tip-*`） | #7d8696・#f3f5f8・#d6dbe3・#343c4a | #7f889a・rgb(163 172 187 / 9%)・26%・#d0d6df | 同じ意味 |
| unknown（不明） | unknown「不明」（`--sd-unknown*`） | #7048c0・#f3effc・#d6c8f2・#5b37a6 | #b79bff・rgb(183 155 255 / 10%)・28%・#d2c0ff | 同じ意味 |
| sleeping（スリープ） | なし（`--sd-track` = `--ds-border-2`、文字 `--ds-muted`） | 線 #848d9c、背景なし、文字 #5a6372 | 線 #6f7889、背景なし、文字 #98a1b2 | SpecDock に同じ意味はない。SpecDock が「まだ進んでいない分」に使う track の灰で、背景を塗らず、終わった（塗りの灰）より控えめにし、休んでいることを示す。月の印を足す |
| +N（ほか N 件） | done の組 | done と同じ | done と同じ | 中立の数の札 |

### 形・太さ・角丸・字体

| 項目 | SpecDock（`.chip`、`.st-ico`） | orca-web の印（前、PR #29） | orca-web の印（今） |
|---|---|---|---|
| 形 | 薄い背景・1px の線・濃い文字の札 | 状態の色で塗った丸い札、白い文字 | SpecDock の `.chip` と同じ（薄い背景・1px の線・濃い文字） |
| 角丸 | 4px（`.chip`、`--ds-radius-s`） | 高さの半分（丸い札） | `var(--ds-radius-s, 4px)` |
| 太さ | 700 | 600 | 700 |
| 字体 | `--ds-font-sans`（BIZ UDPGothic ほか） | system-ui | `var(--ds-font-sans, "BIZ UDPGothic", …)`、数字は tabular-nums |
| 大きさ | 札 12.5px、印 15px | 高さ 16px（中 20px）、字 10px（12px） | 変えない（狭い枠のため） |
| アイコン | 状態の印（輪、塗りの丸） | 白い丸の台にロゴ | 台をやめ、薄い背景にロゴを直接置く（OpenAI のロゴは状態の文字の色） |
| 不明の区別 | 紫と「?」の印 | 灰の破線 | 紫（破線はやめた） |
| フォーカス | `--ds-focus` の 3px | 濃い色の 2px | `--ds-focus` の 2px（狭い枠のため細く） |
| 作業中の動き | 次の区切りの点滅（`sd-next`、opacity、2 秒）。回る動きはない | なし | 本人の要望で、アイコンのまわりの静かな輪の上の 1/4 の弧が回る（transform の rotate、1.2 秒の等速）。動きを減らす設定で止まる |

SpecDock の中では、印の色の変数が SpecDock の `--sd-*`・`--ds-*` を先に使うので、SpecDock の明暗の切り替えにそのまま従う。

### 確かめ（追記）

- 実装担当（style、S-06）：claude / claude-opus-5-5 / medium（dispatch ctx_47a2a0b67dd7、`launch.effective` は計画どおり）。コミット `6e101ad`。`npm test` 568 → 576 件 pass（CSS の文字のテスト 8 件）。
- 並べた写し（`.workbench/trial-evidence/iss-00027/style/`、コミットしない）：`side-light.png`、`side-dark.png`（左 SpecDock のダッシュボード 127.0.0.1:47800、右 試しの画面 47900）。作業中の緑、止められている・許可待ちの琥珀、完了の灰、不明の紫が同じ系統に見える。単体の写し `specdock-{light,dark}.png`、`trial-{light,dark}.png`、`phone-{light,dark}.png`（幅 430px の窓の中の 390px の枠）。
- 動き（ヘッドレスの Chrome、CDP、試しの画面の実データ）：working の印 12 個の弧の animation-name は `orca-mark-spin`、300ms で transform が変わる。ほかの印 168 個に動くものはない。`Emulation.setEmulatedMedia` で `prefers-reduced-motion: reduce` にすると、弧の animation-name は `none` で、transform は変わらない。
- 実データに blocked・waiting・+N の印はなかった（CSS のテストで値を確かめた）。
- 試しの画面は tailnet の IP でも待ち受けたまま（スマホ用）。

## 追記：working の中の monitoring（バックグラウンドタスクを監視中）（2026-11-14、R-08〜R-10）

依頼 task_17e9d7936edf（ctx_64badd5d3909）。ブランチ `chemitaro/iss-00027-background`（開始 `4e1995b`）。

### 根拠（Orca に合わせたところ）

stablyai/orca タグ v1.4.258（コミット `c91a7a6e`）。手元の Orca も 1.4.258。

| 合わせたこと | Orca のファイル | orca-web |
|---|---|---|
| 意味とタイミング：主エージェントの番が done で、生きている子がエージェントでないもの（シェルのコマンド、Monitor、workflow）だけのとき `state: working`・`workingMode: monitoring` | `src/shared/agent-status/lifecycle/agent-lead-status-fold.ts`（`foldAgentLeadStatus`）、`src/shared/agent-status/child-work/agent-status-child-work-liveness.ts` | 判定をしない。状態と同じ取得元の `workingMode` を読み、`agentWorkingMode` で state working かつ値 monitoring のときだけ |
| `orca orchestration check --wait` の待ちは monitoring でない（エージェントの作業） | `src/shared/orca-cli-invocations.ts`、liveness の `isAgentChildWork` | ただの working（回る印） |
| 値の場所 | `src/shared/agent-status/contracts/agent-status-types.ts`、`src/shared/runtime-worktree-contracts.ts`（ps）、`src/shared/runtime-mobile-session-tab-contracts.ts`（chatStatus） | タブの agentStatus・chatStatus、ps の agents |
| 印の絵：lucide の `Activity`（lucide-react 0.577.0、ISC）、回る印は出さない | `src/renderer/src/components/AgentStateDot.tsx` | `STATE_ICONS.monitoring`、作業中の輪を出さない |
| 置き場：状態の印を種類のロゴの左に並べ、重ねない | `src/renderer/src/components/sidebar/workspace-card/activity/worktree-card-compact-agent-row.tsx` | ロゴの左 |
| ラベル：ja「バックグラウンドタスクを監視中」（en `Monitoring background tasks`） | `src/renderer/src/i18n/locales/ja.json` | 同じ言葉 |
| 経過：この印だけの時計はない（行の時刻はどの状態でも同じ `getCompactAgentTime`） | 上の compact row | 足さない。working と同じ規則 |
| 数：working の一つの形 | `src/shared/worktree-status-rollup.ts` | mark working・counts.working、種類として `workingMode` |
| 色：Orca は黄（`--agent-working`） | `src/renderer/src/assets/main.css` | 統括の決定で SpecDock の doing の緑（ここだけ Orca と違う） |

方針の経緯：はじめの依頼は「新しい状態（例 background）、経過は待ちの始まりから」。統括の答え（msg_1ca07b651357）と本人の確認（msg_92bbf57b6a40）で「Orca 本体に合わせ、working の一つの形、Orca が出さないものは足さない」に改めた。仕様はその形で書いた。

### 実機（読むだけ、2026-11-14 05:31Z）

- Orca のタブの agentStatus：working・monitoring 3件、working 1件、done 7件（ps では working・monitoring 2件。ps はタブのある端末の一部しか持たない）。
- orca-web（試しの orca-web、要約）：working・monitoring 3件、working 1件。Orca と一致。3件とも worker の端末が背後の Bash を待つもの。統括は構造化 Chat で、そのときは done。
- 写しは項目と値だけ（`.workbench/monitoring-probe-1.json`、`-2.json`。会話・プロンプトなし、コミットしない）。

### 試しの画面（tailnet）

- `http://<tailnet の IP>:47900/` をヘッドレスの Chrome で開いて写した（`.workbench/trial-evidence/iss-00027/monitoring/`）：`tailnet-states-light.png`、`tailnet-states-dark.png`（状態の見本：working は回る輪、monitoring は緑の脈の線がロゴの左で回らない、done は灰）、`tailnet-full-{light,dark}.png`（実機の値の印。監視中の印 9 個＝3人×3つの置き場）。
- 監視中の印の弧：`::after` の content none、animation none、印の色 rgb(61,220,132)（暗い背景の doing）、幅 11px。

### 実装

- S-10（codex / gpt-6.1-sol / medium、ctx_884b6dce03ad）：`f36598c`。618 → 627 件。
- S-11（claude / claude-opus-5-5 / medium、ctx_ac6b586ad5c0）：`6199f60`。627 → 640 件。
- S-12（タスク担当）：README・AGENTS.md `231c30c`、この節。
- 最終品質ゲート fqg-iss-00027-4：`4e1995b..231c30c` で合格（P0〜P3 0件、coverage complete、lint・640 tests・build 0）。PR #33 https://github.com/chemitaro/orca-web/pull/33（CI pass、MERGEABLE）。
- 仕様のレビュー：round-6b pass（P2 2・P3 1。輪の `::before` が残る、受け箱の stalled の見せ方、`src/runs/model.ts` の対象漏れを直した）、round-7 pass（0件）。

## Residual Risks / Follow-ups

- 本人の確かめ：試しの画面（`http://127.0.0.1:47900/`、`/phone.html`、`http://127.0.0.1:47901/forbidden.html`）で、アイコン・色・経過の見え方を見てもらう。実物の iPhone の Safari は見ていない（Mac の上の 390px）。
- 経過の起点 `worktree-activity` は worktree ごとの時刻なので、同じ worktree の複数のスリープは同じ経過になる（読み上げの名前で起点の違いを示す）。
- ロゴは各社の商標（本人の判断で使う）。外すときは `AGENT_ICONS` の表だけを変える。
- ロゴの path の完全一致のテストは、`.workbench/orca-icons.tsx` がない CI では先頭と末尾の照合だけ。
- SpecDock 側の組み込み（epic-00471・epic-00526）は範囲外。
- 監視中の経過は Orca の時刻の規則（最後に終えた時刻かセッションの始まり）と違い、orca-web の今の working の規則（状態の始まり）のまま。Orca に合わせるなら全状態の経過の規則を変える別の判断になる。
- 監視中の印は ps にないタブ（タブの agentStatus）でも読むので、Orca の ps の数とは違いうる（画面の印はタブに合う）。
