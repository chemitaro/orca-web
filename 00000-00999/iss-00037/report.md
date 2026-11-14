---
種別: レポート（Issue）
ID: "iss-00037"
関連GitHub: ["#37"]
最終更新: "2026-11-14"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- `/embed/agent` の詳細の中のリンク（親、子、PR）を、すべて新しいタブで開くようにした（`target="_blank"`、`rel="noopener noreferrer"`）。前は親が `_self`、子が target なしで、同じ iframe の中で別のエージェントに移った。これで SpecDock が選んだ相手の帯と題名のまま iframe の中が別の相手に変わる道がなくなった。
  - リンクは `web/embed/agent-dom.js` の私的な `newTabLink` だけで作る。title「新しいタブで開く」、目に見えない「（新しいタブで開く）」、印の svg（aria-hidden）を持つ。
  - 印は SpecDock のデザインシステムの `ICONS.external`（spec-dock `67abbe6c1`、`core/ui.js`）を写した `LINK_ICONS.external`（`web/embed/agent-marks-icons.js`、出どころの1行つき）。CSS は `.vh` と `a.newtab .newtab-icon`（0.9em、currentColor。新しい色なし）。
  - 行き先の URL、送信、開く口、CSP・frame-ancestors・CORS、単独の画面（受け箱・状態・Run・プロジェクト）は変えていない。
- 統括の決定（依頼書 2026-11-14）に従った。タスク担当の解釈：iframe の中か外かは見分けず、`/embed/agent` を直接タブで開いたときも中のリンクは新しいタブで開く（見分けの誤りで同じ iframe に移る道を残さないため。requirement.cue の decisions）。

## Verification

- コミット（ブランチ `chemitaro/iss-00037`、開始 `3d547c1`）：
  - `ea1795e` S-01 リンクの関数・印の表・CSS・テスト（impl、Codex）
  - `49b5482` README.md と AGENTS.md（タスク担当）
- 実装担当の `launch.effective`：impl（S-01）codex / gpt-6.1-sol / medium（dispatch `ctx_15842de00e0c`）。S-02 はタスク担当（claude-opus-5-5 / medium）。
- テスト：`test/web/agent-dom.test.ts`（親・子2つ・PR のすべての a が `_blank`・`noopener noreferrer`・title・印・目に見えない文字を持ち、href がそのまま、危ない文字は文字のまま）、`test/web/agent-navigation.test.ts`（`agent.html` の入口から import を推移的にたどった全ファイル（`../write.js`・`../view.js`・`elapsed.js` を含む）に `_self`・`_parent`・`_top`・location の代入・`location.assign`・`location.replace`・`window.open` がなく、agent-dom.js の a は newTabLink の1か所だけ）、`test/web/agent-css.test.ts`（印の表と CSS）。
- `npm run lint`・`npm test`（686 件 pass）・`npm run build` は exit 0（`49b5482`）。
- 実物の画面（読むだけ。試しの orca-web 8798 と試しの画面 47960、127.0.0.1 だけ、`sendEnabled: false`。ヘッドレスの Chrome を `--disable-features=MacAppCodeSignClone` で起動し CDP で動かし、Browser.close で閉じた）：別のオリジン（47960）の画面に `/embed/agent` の iframe を置き、詳細を開いて数えた。
  - 親のリンク（子のエージェントの詳細）と子のリンク（親のエージェントの詳細）：明暗とも target `_blank`、rel `noopener noreferrer`、title「新しいタブで開く」、印の svg（aria-hidden、約 11.7px）、目に見えない文字（幅 1px）。
  - 本当の押下（Input.dispatchMouseEvent）で押すと、親・子とも新しいページ（top）が `/embed/agent?id=<相手>` で開き、そのページの `window.opener` は null、referrer は空。元の iframe の URL は変わらなかった。
  - 送らない、Orca で開くを押さない。写しでは会話と送る欄を隠し、他のプロジェクトの題名・worktree・リンクの文字を伏せた（属性は変えていない）。
  - 写し：[親のリンク・明](artifacts/20261114t121916z--embed-agent-newtab-parent-light.png)、[親のリンク・暗](artifacts/20261114t121916z-01--embed-agent-newtab-parent-dark.png)、[子のリンク・明](artifacts/20261114t121916z-02--embed-agent-newtab-child-light.png)、[子のリンク・暗](artifacts/20261114t121916z-03--embed-agent-newtab-child-dark.png)
  - 試しのサーバーは確かめの後に止めた。

## 逸脱と判断

- 仕様レビューの P2（走査の対象の欠け）に、仕様を変えずに「import を推移的にたどった全ファイル」を走査させる指示で答えた（意味を強める読み）。
- Codex の実装担当は、起動の直後に writable root の symlink で通常の実行が1回失敗したが、自動の承認の経路で続けて完了した（統括の注意 msg_abd48edab1b0 の切り替えは要らなかった）。

## レビュー記録

- spec-review：合格（round 1）。spec-reviewer（Claude Opus 5.5 / medium、standard）。統括の決定（依頼書）を authority として渡した。対象の sha256 は requirement.cue `c6d56ce9…3464e1`、design.cue `61e47860…91618f`、plan.cue `6ef7a76d…94b1`。結果は P0 0・P1 0・P2 1・P3 0（`.workbench/spec-review/iss-00037/round-1.json`、検査 `round-1.check.json` は valid・pass）。
  - P2：T-02 の走査の対象が、`/embed/agent` が読む `web/write.js`・`web/view.js`・`web/embed/elapsed.js` を欠く。仕様は変えず、実装担当に「agent-frame.js から import を推移的にたどった全ファイル（web/ の外の階層も含む）」を走査させる（意味を強める読み。逸脱と判断に記録）。

## Residual Risks / Follow-ups
