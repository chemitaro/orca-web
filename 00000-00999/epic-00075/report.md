---
種別: レポート（Epic）
ID: "epic-00075"
関連GitHub: ["#75"]
最終更新: "2026-11-25"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Residual Risks / Follow-ups

## Outcome

- 7つの Issue をすべて完了し、PR をマージした（2026-11-25、マージはどれも merge.md の条件でタスク担当が行った。利用者の許し「ユーザーの許可なくマージする権限を付与します」2026-11-25）。
  - iss-00076 頂点の一覧（PR #83、1da3c6c）
  - iss-00077 会話を同じ画面で開く（PR #84、4cffba8）
  - iss-00078 束の結びと対応が必要の判定（PR #85、89279d9）
  - iss-00081 気づかせ方（PR #86、9fe1c2c）
  - iss-00079 チームの帯と履歴の帯（PR #87、5225292）
  - iss-00080 対応のカード（PR #88、d650200）
  - iss-00082 `/` の差し替えと Run の木の根（PR #89、157b634）
- 進め方：各 Issue を coding-task で、仕様（Opus 5.5 / high の spec-reviewer が P0・P1 なしまで）→ 実装（Orca の worker の Claude Opus 5.5 / medium）→ 区切りのレビュー（standard、code-reviewer Opus 5.5 / medium の規約と仕様の2人）→ 最終品質ゲート（quality-gate-reviewer Opus 5.5 / medium と、Node 24 の lint・test・build）→ PR → CI → マージ。Codex の GPT-6.2 Sol・Astra は使っていない（利用者の指示）。
- 分析：Fable 5.2（3本）と Opus 5.5 のレビュアー（2本）。ChatGPT と Gemini は、この Mac の負荷で Chrome の DevTools がつながらず、どれも送る前に止まった（送っていない）。

## Verification

- 各 Issue の report.md に、仕様のレビュー、区切りのレビュー、最終品質ゲート、試しの orca-web での実データの確かめ、マージを記録した。
- main 157b634 のテストは 1354 件以上が合格（iss-00082 の最終品質ゲート、Node 24.14.0）。

## Residual Risks / Follow-ups

- 常駐の orca-web（launchd、8791）は古いビルドのまま。新しい画面を使うには、利用者が main のチェックアウトで `npm run service:restart`（ビルドと起動し直し）を行う（AGENTS.md によりエージェントは実行しない）。
- 構造化 Chat の統括は、子のタブが閉じた後に orca-web を起動し直すと結べない（受け入れた制約）。Orca 本体への要望の下書きは iss-00082 の report.md にある（送るのは利用者の了承の後）。
- Epic の問い「構造化 Chat の /clear で paneKey が変わるか」は未確認（読むだけでは起こせない。対応表は頂点の id で持つので影響しない）。
- この Mac の Homebrew の Node 26 が libsimdjson の不足で起動しない（作業中に起きた。リポジトリの .node-version は 24 で、nodenv の 24.14.0 で確かめた）。
