package spec

goal: "頂点の行に稼働中のメンバーの内訳が多段の木で出ることがテストで確かめられ、常駐の orca-web に入っている。"

steps: {
	"S-01": {status: "done", title: "稼働中の内訳の木（D-01、D-02）", text: "対象：`web/apexes-view.js`（または新しい `web/apexes-live-view.js` と STATIC_FILES）、`web/apexes-dom.js`、`web/style.css`、テスト、README。確かめ：T-01〜T-03。完了：`npm run lint`、`npm test`、`npm run build`。実装担当の最後の手順", realizes: ["R-01", "R-02"], session: "impl"}
}

tests: {
	"T-01": {title: "選び：統括 → タスク担当（done）→ 実装担当（working）で、タスク担当（薄く）と実装担当が depth 1・2 で出る。done・failed だけの枝は出ない。稼働中がなければ空", verifies: ["R-01"]}
	"T-02": {title: "抑え：稼働中 12 で 8 節と「ほか 4」、浅い順・新しい順", verifies: ["R-02"]}
	"T-03": {title: "dom：innerHTML を使わず、行の下に木が出て、行の選択の動きが変わらない", verifies: ["R-01"]}
}

verification: """
	最後に `npm run lint`、`npm test`、`npm run build`（Node 24）。
	関門：
	- merge：agent
	- merge_permission：本人「ユーザーの許可なくマージする権限を付与します」（2026-11-25、利用者との Claude Code の会話。orca-web の PR を、最終品質ゲートと CI の合格を条件にエージェントがマージしてよいという許し。全文は公開しない）
	- 区切りのレビュー：なし（light、1手順）
	- 最終品質ゲート：範囲 `<開始のコミット>..HEAD`。second_opinion：none
	- test_commands：`npm run lint`、`npm test`、`npm run build`
	- record_paths：なし
	- マージの後、常駐の orca-web を `npm run service:restart` で入れ替える（利用者の依頼）
	"""
exit: "最終品質ゲートと CI が合格してマージされ、常駐の orca-web に入っている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録"}
		impl: {task: "実装（S-01。Claude の実装担当、Orca の worker）", model: "opus", effort: "medium", rationale: "provider: claude。本人の指示（Codex を使わず Opus 5.5）。方針 §2 フロントエンドの実装担当 light"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-01", model: "opus", effort: "medium"}
	}
}
