---
種別: レポート（Issue）
ID: "iss-00035"
関連GitHub: ["#35"]
最終更新: "2026-11-14"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 「Orca で開く」のボタンを、Orca のロゴと `Open` の小さなボタン1つ（共有の部品）にそろえた。埋め込みのボタン（`/embed/open-button.js`、試しの画面もこれを使う）、`/embed/agent` の見出し（md）、受け箱の項目（sm）が同じ部品を使う。
  - 部品：`web/embed/open-control.js`（`createOpenControl`、`runOpen`、受け箱の描き直しのための `createOpenBoard`）、`open-control.css`、純粋な組み立て `open-control-view.js`（表示の値と、結果の言葉の表。前は3か所に別々にあった）。ロゴは `agent-marks-icons.js` の `APP_ICONS.orca`（stablyai/orca `resources/logo.svg`、v1.4.258、`c91a7a6`、MIT。ロゴは Orca（Lovecast Inc.）の商標。README にも1行）。
  - 読み上げの名前は「Open（Orca で開く）」、アイコンだけの形は「Orca で開く」。title は「Orca で開く」。
  - 見た目は SpecDock の `.chip` の仲間（1px の線 `--ds-border`、hover で `--ds-border-2`、角丸 `--ds-radius-s`、字の太さ 700、`--ds-font-sans`、背景は透明、フォーカスは `--ds-focus` を内側に）。新しい色はない。
  - 大きさ：sm 高さ 24px・ロゴ 14×22px、md 高さ 28px・ロゴ 16×25px。アイコンだけ（`data-label="none"`）は正方形 24px・28px でロゴ 12×19・14×22。
  - iframe の既定の大きさ：文字あり sm 72×24・md 82×28（前は幅 260）、アイコンだけ sm 24×24・md 28×28。`data-width` の上書きは残した。
  - 状態：途中は回る印（押せない、aria-busy）、開けたらチェックの印（2秒でロゴに戻る）、開けなかったら線とロゴが琥珀（`--ds-warn`）で title に理由（次に押すまで残る）。横の結果の文字はなくし、読み上げには目に見えない status の領域で同じ言葉を伝える。回る動きは prefers-reduced-motion で止まる。
- 変えていないもの：開く口（`POST /api/open` と送る本体）、短期のトークン、Host・同じオリジン・frame-ancestors・CSP・CORS、幅 390px 以下で出さない決まり。Run の木とプロジェクトの画面には開く操作を置かない（前の Issue の決定）。
- 統括の決定と答え（2026-11-14）：置き換えは今ある3か所と試しの画面だけ（Run の木とプロジェクトには足さない）。WCAG 2.5.3 のため aria-label を「Open（Orca で開く）」に。ロゴの箱は正方形でなくロゴの比の横長（見本の C。正方形の 14px では高さ約 9px で Orca の形と読めなかった）。
- 仕様の扱い：実装の前は、タスク担当が正本を承認して実装に渡した（S-01 の実装担当の問いへの答え）。統括の指示（2026-11-14）で、後から spec-review を通した（下の「レビュー記録」）。

## Verification

- コミット（ブランチ `chemitaro/iss-00035`、開始 `1a2afed`）：
  - `90b37dc` S-01 ロゴの表と純粋な組み立て（impl）
  - `ea99a0d` S-02 部品と3か所の置き換え（ui）
  - `2c1d1ac` ロゴの比の箱と iframe の幅（統括の答え C。タスク担当）
  - `f782e20` README.md と AGENTS.md（タスク担当）
  - `e6816b8` レビューの指摘の直し（タスク担当）
  - `fa3530d` 再レビューの P3-a（状態を読めない間の title を見出しと合わせる。タスク担当）
- PR：https://github.com/chemitaro/orca-web/pull/36（Refs #35）。CI（lint、テスト、ビルド）は `fa3530d` で pass。
- 実装担当（`launch.effective`、起動の受け取りの値）：
  - impl（S-01）codex / gpt-6.1-sol / medium（dispatch `ctx_0ed611c63b6c`）
  - ui（S-02）claude / claude-opus-5-5 / medium（dispatch `ctx_8b5daf0295f0`）
  - S-03 と小さな直しはタスク担当（claude-opus-5-5 / medium）
- `npm test` 682 件 pass、`npm run lint`（biome と tsc）と `npm run build` は exit 0（`fa3530d`）。
- レビュー（独立した読むだけのレビュアー、Claude Opus 5.5 / medium、範囲 `1a2afed..f782e20`）：P0・P1 なし。P2-1 受け箱で、描き直しをまたいで古い部品の done の時計が新しい要求の途中の部品を idle に戻し、二重に送れる → 鍵ごとの板 `createOpenBoard`（最後の要求の結果だけを写す）で直し、テストを足した。P2-2 report.md が空 → この記録。P3-1 詳細の見出しが状態を読む前に押せて何も起きない → 読むまで押せなくし、要求の後に開く先を確かめ直す。P3-2 エージェントが見つからないときの title → 「エージェントが見つかりません」。再レビュー（範囲 `f782e20..e6816b8`）：3件とも閉じ、新しい P0〜P2 なし。新しい P3-a（状態を読めない間、ボタンの title が「読んでいます」のまま）は `fa3530d` で直した。P3-b は残り（下）。
- 描画（試しの画面、`npm run trial`、orca-web 8797・試しの画面 47950、tailnet でも。直す前は `1a2afed` の取り出しを 8795・47930 で。ヘッドレスの Chrome を `--disable-features=MacAppCodeSignClone` で起動し CDP で動かし、Browser.close で閉じた。会話の欄と最後の一言は隠して写した）：
  - 3か所 × 明暗、1280px：直した後の高さは、試しの画面の iframe 72×24（sm）、詳細の見出し 81×28（md）、受け箱 72×24（sm）。ロゴの箱 22×14・25×16。切れ 0、横のはみ出し 0。
  - 390px：直す前も後も、3か所ともボタンが出ない（埋め込みの iframe は display none で読み込まない）。はみ出し 0。
  - 形と大きさ：文字あり sm 71.95×24・md 81.31×28、アイコンだけ sm 24×24（ロゴ 19×12）・md 28×28（ロゴ 22×14）。
  - 状態：fetch を偽物に替えて押し（Orca に送らない）、途中＝回る印・押せない・title「開いています…」、開けた＝チェック・title「開きました」、開けなかった＝琥珀の線とロゴ・title「Orca につながりません」・status の領域に同じ言葉。
  - 実物で1回：試しの送り先の worktree（send-test）だけで1回押し、ロゴ → 回る印「開いています…」 → チェック「開きました」 → 約2秒でロゴに戻る、を確かめた。業務中のエージェントの worktree では押していない。
  - 写し（左が直す前、右が直した後。明暗、3か所、形と大きさ、状態）：
    - [1280px の前後と形・状態](artifacts/20261114t113534z--open-button-sheet-1280.png)
    - [390px の前後（ボタンが出ない）](artifacts/20261114t113534z-01--open-button-sheet-390.png)
    - [ロゴの大きさの見本（統括が C を選んだ）](artifacts/20261114t113534z-02--open-button-logo-size-options.png)
- 本人が見る URL（試しの orca-web と画面は動かしたまま）：
  - 試しの画面（埋め込みのボタン。worktree の節）：`http://127.0.0.1:47950/`、tailnet は `http://<この Mac の Tailscale の IP>:47950/`（幅 390px の枠は `/phone.html`）
  - 受け箱：`http://127.0.0.1:8797/`（tailnet も同じ port）
  - 詳細の見出しは、試しの画面で印を選ぶと右の欄に開く。
  - 止めるのは `kill -TERM $(cat .workbench/trial/trial.pid)`（worktree iss-00035 の中で）。

## レビュー記録

- spec-review：合格（round 1）。spec-reviewer（Claude Opus 5.5 / medium、standard）。統括の決定と答えを authority として渡した。対象の sha256 は requirement.cue `e99494b0…ff4d7e`、design.cue `e2f613b0…28fa1`、plan.cue `c4a1156f…88ea`。結果は P0 0・P1 0・P2 2・P3 0（`.workbench/spec-review/iss-00035/round-1.json`、検査 `round-1.check.json` は valid・pass）。
  - P2 の2件は、design.cue の D-03 にまだ書いていない点の指摘。1つは受け箱の描き直しで途中の状態を戻す決まり、もう1つは詳細の見出しで状態を読む前とエージェントが見つからないときの押せない状態。実装はすでに `e6816b8`・`fa3530d` で扱っている（`createOpenBoard`、`syncOpenTarget`）。P2 なので記録だけにした。
- final-quality-gate：合格（campaign `iss-00035-c1`、attempt 1、合格のコミット `fa3530d`、base `1a2afed`）。
  - レビューのレーン：quality-gate-reviewer（Claude Opus 5.5 / medium）。P0〜P3 すべて 0、coverage_complete true。観点は functional-correctness・requirements-closure・test-adequacy・security-baseline。
  - テストのレーン：`npm run lint`・`npm test`（682 件）・`npm run build` はすべて exit 0。
  - second_opinion：none。
  - PR #36 の head は合格のコミット `fa3530d` と同じ。記録は [closure.md](closure.md)。

## Residual Risks / Follow-ups

- Orca のロゴは細い横長の形で、24px のボタンの中では小さい。ロゴの比の箱で読める大きさにしたが、本人の確かめで小さければ、Orca のアプリのアイコン（四角い形）への差し替えを別に考える。
- 詳細の見出しは、状態を読むまでの短い間、押せない形（琥珀の線）で始まる。読めない間はそのまま残る。
- SpecDock の横の欄（spec-dock の iss-00592）に置くときは、幅を部品に任せる（統括が先方に伝え済み）。
- 受け箱の板（`createOpenBoard`）は、受け箱から消えた項目の切り離された部品を鍵ごとに1つ持ち続ける（再レビューの P3-b。見た目と送信に害はなく、増え方は鍵の数まで）。
- `spec-dock work finish` は GitHub の #35 を閉じるので、マージと本人の確かめの後に統括か利用者が行う（タスク担当は走らせていない）。explanation.html は雛形のまま（前の Issue と同じ）。
- 本人の確かめは、この下に残す。

## 本人の確かめ

（未）
