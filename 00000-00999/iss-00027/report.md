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

## Residual Risks / Follow-ups

- 本人の確かめ：試しの画面（`http://127.0.0.1:47900/`、`/phone.html`、`http://127.0.0.1:47901/forbidden.html`）で、アイコン・色・経過の見え方を見てもらう。実物の iPhone の Safari は見ていない（Mac の上の 390px）。
- 経過の起点 `worktree-activity` は worktree ごとの時刻なので、同じ worktree の複数のスリープは同じ経過になる（読み上げの名前で起点の違いを示す）。
- ロゴは各社の商標（本人の判断で使う）。外すときは `AGENT_ICONS` の表だけを変える。
- ロゴの path の完全一致のテストは、`.workbench/orca-icons.tsx` がない CI では先頭と末尾の照合だけ。
- SpecDock 側の組み込み（epic-00471・epic-00526）は範囲外。
