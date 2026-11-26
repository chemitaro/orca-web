---
種別: レポート（Issue）
ID: "iss-00104"
関連GitHub: ["#104"]
最終更新: "2026-11-26"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

## Verification

## Residual Risks / Follow-ups

- 仕様のレビュー（spec-reviewer、Opus 5.5 / high、standard）：round-1 で合格（2026-11-26）。P0・P1 0、P2 2・P3 1。P2（切り替えでフォーカスが外れる）は実装で取り込む：描き直しの前に切り替えにフォーカスがあれば、新しいボタンへ戻す。P2（入力が長い・帯があるときは header と送る欄が枠を超えうる）は、通常の状態の不具合（読み上げの文字のはみ出し）を直す範囲とし、残りの危険として記す。P3（matchMedia がなければ既存の起動処理が先に止まる）は既存のふるまいで、この Issue の外。結果 `.workbench/spec-review/iss-00104/round-1.json`。sha256：requirement.cue `6117ec7ee93e83e1aa0cec2b8838d1bd49cf1361c80db50de09b1e1fb372d1d8`、design.cue `eef023aa33bcba695b5eb78b13512ab9378c0d57299086e927840b4650ccc612`、plan.cue `d4a0342e8b78f0b289341280bc4ca538ef00abc7da41872700bed92e6508faa4`

## 実装と確かめ（2026-11-26、Opus 5.5 / high、同じセッション）

- S-01・S-02 は1つのコミット f5fb5bb にまとめた（テストの期待値の書き換えが両方にまたがるため）。仕様レビューの P2（フォーカス）を取り込んだ。
- S-03（T-07）実物（試しの orca-web 8793、送信は無効、窓 607×975）：選んだとき見出しの帯 37px、会話の枠 938px（窓の 96%。前は会話が下の半分ほど）。詳細は畳んで始まり、ボタンは「詳細」と「対応 1」。押すと開いて aria-expanded true、フォーカスは新しいボタンに戻る。もう一度押すと畳む。高さ 200px の /embed/agent の文書は scrollHeight 200＝clientHeight（head=compact と単独の両方。前は 430）。単独では題名の行が今のまま出る。試しの orca-web は止めた。
- 残りの危険：入力欄に長い文があるときや送る欄の帯があるとき、とても低い枠では header と送る欄が枠を超えうる（仕様レビューの P2。この Issue の外）。
- 最終品質ゲート：合格（campaign iss-00104-fqg-1、f5fb5bb、レビュー P0〜P3 0、lint・test 1421・build 合格）。途中で Orca の再起動によりレビュアーが止まり、同じレビュアーを再開して結果を得た。
- マージ：PR #105（2026-11-26、ed96d82、head f5fb5bb、CI OBSERVED_CI_PASS・READY）。本体の main を取り込み、常駐の orca-web が新しい画面（詳細の切り替え・head-compact）を配ることを確かめた。
