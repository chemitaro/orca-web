package spec

goal: "作業を続けている作業者の問いでは対応が必要にならず、答えを待つ作業者の問いでは今のとおり対応が必要になることがテストで確かめられ、常駐の orca-web に入っている。"

steps: {
	"S-01": {status: "done", title: "activity を読み、A3 と理由・カードを直す（D-01〜D-03）", text: "対象：`src/orca/read-state.ts`、`src/apex/extras.ts`・`build.ts`・`model.ts`、`web/apexes-view.js`・`web/apexes-cards-view.js`、テスト、README・AGENTS.md の該当の文。確かめ：T-01〜T-04。完了：`npm run lint`、`npm test`、`npm run build`。実装担当の最後の手順", realizes: ["R-01", "R-02", "F-01"], session: "impl"}
}

tests: {
	"T-01": {title: "pick：projection.stage.activity を拾う。ない・形が違えば null", verifies: ["F-01"]}
	"T-02": {title: "A3：input で activity working の Dispatch だけ → 90 秒を過ぎても needs_action にならず reasons に question_working。activity done → 90 秒で question。activity null → 今のとおり question。gate も同じ", verifies: ["R-01", "F-01"]}
	"T-03": {title: "memo：鮮度が古い間も question_working は対応が必要にならない", verifies: ["R-01"]}
	"T-04": {title: "questions の working と、カードの添え書き、理由の言葉", verifies: ["R-02"]}
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
	- マージの後、利用者の依頼（2026-11-25「画面が見えるように」）に合わせて、常駐の orca-web を `npm run service:restart` で入れ替える
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
