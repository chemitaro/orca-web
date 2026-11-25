package spec

goal: "プロセスのない Chat のタブが眠っているに、プロセスがあって状態の分からない頂点が不明の段に入り、作業中の段には動いているものだけが並ぶことがテストと常駐の画面で確かめられている。"

steps: {
	"S-01": {status: "done", title: "眠っている・不明の判定と段、画面（D-01〜D-03）", text: "対象：`src/apex/build.ts`・`model.ts`、`web/apexes-view.js`、テスト（既存の unverified と sleeping のテストを新しい決まりに合わせる）、README・AGENTS.md の該当の文。確かめ：T-01〜T-04。完了：`npm run lint`、`npm test`、`npm run build`。実装担当の最後の手順", realizes: ["R-01", "R-02", "R-03"], session: "impl"}
}

tests: {
	"T-01": {title: "state null・paneKey null の chat-tab（worktreePs が新しい）→ status done・理由 sleeping・段 sleeping（最後の活動が 1 時間前でも）・札なし・新着の点の対象外。terminal-tab で terminal が null でも attached でもない（tabs が新しい）→ 同じ。worktreePs が stale か lastSuccessAt なし → 段 unknown・札 unverified。untabbed → unknown", verifies: ["R-01"]}
	"T-02": {title: "state null・paneKey ありの chat-tab → 段 unknown・札 unverified、30 時間後も unknown。メンバーが working → working の段", verifies: ["R-02"]}
	"T-03": {title: "画面の段の順と畳み、見出しの作業中の数に unknown が入らない", verifies: ["R-03"]}
	"T-04": {title: "完了の判定の既存のテスト（done の 7 日、awaiting-restore）が今のまま通る", verifies: ["R-01", "R-02"]}
}

verification: """
	最後に `npm run lint`、`npm test`、`npm run build`（Node 24）。
	関門：
	- merge：agent
	- merge_permission：本人「ユーザーの許可なくマージする権限を付与します」（2026-11-25、利用者との Claude Code の会話。orca-web の PR を、最終品質ゲートと CI の合格を条件にエージェントがマージしてよいという許し。全文は公開しない）
	- 区切りのレビュー：なし（1手順）
	- 最終品質ゲート：範囲 `<開始のコミット>..HEAD`。second_opinion：none
	- test_commands：`npm run lint`、`npm test`、`npm run build`
	- record_paths：なし
	- マージの後、タスク担当が常駐の orca-web を入れ替える（利用者の依頼 2026-11-25）
	"""
exit: "最終品質ゲートと CI が合格してマージされ、常駐の orca-web に入っている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録"}
		impl: {task: "実装（S-01。Claude の実装担当、Orca の worker）", model: "opus", effort: "medium", rationale: "provider: claude。本人の指示（Codex を使わず Opus 5.5）。方針 §2 の実装担当 standard"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-01", model: "opus", effort: "medium"}
	}
}
