---
種別: レポート（Issue）
ID: "iss-00077"
関連GitHub: ["#77"]
最終更新: "2026-11-25"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- S-01 9719e31：/embed/agent だけ frame-ancestors に 'self'。S-02 ded8e00：visibility-gate.js・unsettled.js、poll-loop の stop()、agent-frame の SSE と状態の読みの停止と data-unsettled。S-03 4e1e6a3：2ペイン、選択、mountAgentFrame、切り替えの確かめ、幅。S-04 3c53726：新着の点、見出しの数を段から。
- cp1（1da3c6c..3c53726、code-reviewer Opus 5.5 / medium の規約と仕様の2人）：合格（規約 P2 1・P3 1、仕様 0）。P2（見続けている頂点に新着の点）と P3（閉じたカードの data-unsettled）は使い勝手に直結するので直した（81c4156）。
- S-05 74cdb90：AGENTS.md の iframe の規則の文言（利用者の許し 2026-11-25）と地図、README。
- 28c198c：900px 未満の折り返しの CSS とソースの確かめ（タスク担当の確かめで出た見かけのはみ出しへの対応。実装担当が CDP の 390px で、直す前も scrollWidth=390 だったと確かめた）。
- 実装担当：impl（Claude、dispatch ctx_af99b201c8d4 と follow-up ctx_a7c87721877d・ctx_4d38c620729e、claude-opus-5-5、--effort medium）。

### 逸脱と判断（実装担当の解釈）
- 結べない行は選ばず新しいタブのリンクのまま。承認のカードの partial も処理中の印に含めた。「← 一覧」も切り替えと同じ確かめ。確かめは window.confirm。狭い幅で選ぶと header も隠す。新着 n は 0 のとき出さない。localStorage が読めないときは書かない。見出しの完了は done_recent の件数。

## Verification

- 試しの orca-web（この worktree のコード、127.0.0.1:8794、送信は無効の別の設定、実物の Orca を読むだけ）とヘッドレスの Chrome：
  - 1280×900 で `?apex=<作業中の頂点>` を開くと、左に一覧、右に頂点の見出しと `/embed/agent` の会話と送る欄（送信は設定で無効と出る）が出た。
  - 狭い幅で `?apex=` を開くと会話が全面に出て「← 一覧」が出た。`--window-size=390` は窓が 500px に丸められるため、横のはみ出しの判定には使えない（実装担当が CDP の 390×844 で scrollWidth=390 を確かめた）。
  - 頂点を3回替えて iframe が1つのままであることは、ブラウザでは確かめていない（T-05 のテストで確かめた）。
- `npm run lint` 0、`npm test` 1219 合格、`npm run build` 0（Node 24.14.0、実装担当の報告と、タスク担当の 3c53726 での再実行 1216 合格）。

## Residual Risks / Follow-ups

## レビュー記録

- 仕様のレビュー（spec-reviewer、Opus 5.5 / high、standard）：round-4 で合格（2026-11-25）。P0〜P3 0。
  - 合格した文書の sha256：requirement.cue `de75b13128f6040a2d7e4aa3705477003f4f2bdae7eef051f579d92d581bde69`、design.cue `5274729493f0c1cf941664850269184ece01c7eed6cc83e7106025b4cfc9cdec`、plan.cue `c4c358675b5ac297dbb1d44da9fceec7dde430bc8788e1d2514165a4036d4dc7`
  - レビューの基準のコード：iss-00076 のブランチ e7d857c（iss-00077 はこの上に作る）
  - 結果：タスク担当の Workbench `.workbench/spec-review/iss-00077/round-1〜4.json`、応答 `review-response.md`
