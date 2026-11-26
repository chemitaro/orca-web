---
種別: レポート（Issue）
ID: "iss-00102"
関連GitHub: ["#102"]
最終更新: "2026-11-26"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

## Verification

## Residual Risks / Follow-ups

- 仕様のレビュー（spec-reviewer、Opus 5.5 / high、standard）：round-1 で合格（2026-11-26）。P0・P1 0、P2 2（D-03 の送る口は既存の試験で1か所に固定されている：行と見出しの送る関数を1つにまとめる。apexes.js の配線を確かめる試験がない：ソースの配線の試験を S-01 に足す。どちらも実装で取り込む）。結果 `.workbench/spec-review/iss-00102/round-1.json`。sha256：requirement.cue `d92b65f68dde35a0a5662a59bdc636c0b8cdef72e4d506d258c28bae18cdec82`、design.cue `1f89464f4f77ef4139bc77eacbefb7ed8f43731d3ae3772d92590d5c221f5bed`、plan.cue `2032ad67eac0234ddde38f529b90fd8cb02cb216eeaa376168e239b01449ede7`

## 実装と確かめ（2026-11-26、Opus 5.5 / high、同じセッション）

- S-01・S-02 は style.css を共に変えるため1つのコミット 10e2886 にまとめた（逸脱と判断）。仕様レビューの P2 2件を取り込んだ：見出しと行の送る口を1つの `sendOpen` にまとめ（`writer.send(` は1か所のまま）、apexes.js の配線をソースの試験で確かめる。
- S-03（T-06）実物の画面（試しの orca-web 8793、送信は無効）：幅 1920×936 で文書の scrollHeight 936＝窓（前は 1,682）。一覧は scrollHeight 1671 > clientHeight 871 で一覧の中で巻け、スクロールバーは一覧の右の縁（画面の左側）。右のペインの下の縁 920 は窓の中。選べる頂点 72 行すべてに Open、選ぶボタンの中には 0。幅 700 では今の1列で横に流れない。幅 390 は Chrome の窓が 960 より狭くならず、画面は枠に入れられない（frame-ancestors）ため実物では確かめず、CSS の試験（T-03）で確かめた。試しの orca-web は止めた。
- 最終品質ゲート：合格（campaign iss-00102-fqg-1、10e2886、レビュー P0〜P3 0、lint・test 1414・build 合格）
- マージ：PR #103（2026-11-26、eced2de、head 10e2886、CI OBSERVED_CI_PASS・READY）。本体の main を取り込み、常駐の orca-web（web/ をディスクから配る。src は変えていない）が新しい画面を配ることを確かめた（文書の高さ＝窓、行の Open 72）。
