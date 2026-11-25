package spec

goal: "`/apexes` で、対応が必要の favicon と、条件を満たしたときだけの1回の通知がテストで確かめられている。"

steps: {
	"S-01": {title: "favicon（D-01）", text: "対象：`web/favicon.svg`・`web/favicon-alert.svg`、`src/server/app.ts` の STATIC_FILES、`web/apexes.html`・`web/apexes.js`・`web/apexes-view.js`（href を選ぶ純粋な関数）、テスト。確かめ：T-01", realizes: ["R-01"], session: "impl"}
	"S-02": {title: "通知の判断と出す口（D-02、D-03）", text: "対象：新しい `web/apexes-notify.js` とテスト、`web/apexes.js`・`web/apexes-dom.js`、STATIC_FILES、README の追記。確かめ：T-02〜T-04。実装担当の最後の手順", realizes: ["R-02", "R-03", "F-01"], after: ["S-01"], session: "impl"}
}

tests: {
	"T-01": {title: "favicon の href：needs_action 0 → /favicon.svg、1以上 → /favicon-alert.svg。2つの SVG が配られ、型が image/svg+xml", verifies: ["R-01"]}
	"T-02": {title: "tracker：同じ頂点・同じ理由の needs_action が2回続くと1回返し、3回目は返さない。1回だけでは返さない。開いて最初の2回の読みでは返さない。理由の集合が変わると新しい key で返す", verifies: ["R-02"]}
	"T-03": {title: "tracker：stale の文書の後の2回の読みでは返さない", verifies: ["F-01"]}
	"T-04": {title: "出す口：isSecureContext 偽・Notification なし・denied ではボタンも通知もない。granted でも document.hidden が偽なら出さない。本文に最後の一言の文字列が入らない（注入した Notification で確かめる）", verifies: ["R-03", "R-02"]}
}

verification: """
	最後に `npm run lint`、`npm test`、`npm run build`（Node 24）。
	関門：
	- merge：agent
	- merge_permission：本人「ユーザーの許可なくマージする権限を付与します」（2026-11-25、利用者との Claude Code の会話。orca-web の PR を、最終品質ゲートと CI の合格を条件にエージェントがマージしてよいという許し。全文は公開しない）
	- 区切りのレビュー：なし（light、2手順）
	- 最終品質ゲート：範囲 `<開始のコミット>..HEAD`。second_opinion：none
	- test_commands：`npm run lint`、`npm test`、`npm run build`
	- record_paths：なし
	"""
exit: "最終品質ゲートが合格し、PR の CI が通り、merge.md の条件でエージェントがマージした状態。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録"}
		impl: {task: "実装（S-01・S-02。Claude の実装担当、Orca の worker）", model: "opus", effort: "medium", rationale: "provider: claude。本人の指示（Codex を使わず Opus 5.5）。方針 §2 フロントエンドの実装担当 light"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-02", model: "opus", effort: "medium"}
	}
}
