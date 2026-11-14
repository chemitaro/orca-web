# iss-00035 の閉じ方の記録

- 状態：実装と検証は済み。PR を開いて CI は pass。マージ（統括）と本人の確かめが残る。
- PR：https://github.com/chemitaro/orca-web/pull/36（Refs #35、ブランチ `chemitaro/iss-00035`、開始 `1a2afed`）
- 合格したコミット：`fa3530d`（`npm test` 682 件 pass、`npm run lint`・`npm run build` 成功、CI pass）
- コミット：`90b37dc`（S-01）、`ea99a0d`（S-02）、`2c1d1ac`（ロゴの比の箱）、`f782e20`（文書）、`e6816b8`・`fa3530d`（レビューの直し）
- 関門：
  - 仕様：standard。統括の決定と答えに依るため、別の仕様レビューはなし（タスク担当が承認）
  - レビュー：独立のレビュアー（Claude Opus 5.5 / medium）が1回と再レビュー1回。P0・P1 なし、P2-1・P3 は直して閉じた。P3-b は残り（report.md）
  - 描画：前後の写しと実物での1回の押し（report.md の Verification）
- 実装担当の `launch.effective`：impl codex / gpt-6.1-sol / medium（`ctx_0ed611c63b6c`）、ui claude / claude-opus-5-5 / medium（`ctx_8b5daf0295f0`）
- 残り：マージ（統括）、本人の確かめ（report.md の「本人の確かめ」に書く）、その後の `spec-dock work finish iss-00035`（#35 を閉じる）、試しのサーバーの停止（`kill -TERM $(cat .workbench/trial/trial.pid)`、worktree iss-00035 で）
