package spec

goal: "チームの節が文書に出て、右のペインのチームの帯で階層と結果が見えることがテストで確かめられている。"

steps: {
	"S-01": {title: "チームの節（D-01）", text: "対象：新しい `src/apex/team.ts`、`src/apex/build.ts`・`model.ts`、テスト。確かめ：T-01", realizes: ["R-01"], session: "impl"}
	"S-02": {title: "チームの帯（D-02）", text: "対象：新しい `web/apexes-team-view.js`・`web/apexes-team-dom.js`、`web/apexes.js`・`web/apexes-dom.js`・`web/style.css`、STATIC_FILES、テスト、README の追記。確かめ：T-02・T-03。実装担当の最後の手順", realizes: ["R-02"], after: ["S-01"], session: "impl"}
}

tests: {
	"T-01": {title: "節：タブのある作業者と同じ Dispatch は1節、閉じた子の Dispatch は親の task の節の下、深さと並び、題名は 200 字まで", verifies: ["R-01"]}
	"T-02": {title: "帯の選び：working・waiting・24 時間以内の failed とその祖先は出し、ほかは親ごとに「完了 n」。120 節の束で出す節が上限（例 30）を超えない。履歴の帯は全 Dispatch を createdAt の順", verifies: ["R-02"]}
	"T-03": {title: "dom：innerHTML を使わず、チームのない頂点では帯がない。エージェントの節のリンクは _blank・noopener noreferrer", verifies: ["R-02"]}
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
