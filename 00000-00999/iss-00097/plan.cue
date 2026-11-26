package spec

goal: "配下のどのメンバーに対応が必要かが、内訳の木とチームの帯のその節に出ることがテストと常駐の画面で確かめられている。"

steps: {
	"S-01": {status: "done", title: "印の決め方と、木と帯の表示（D-01、D-02）", text: "対象：新しい `web/apexes-attention-view.js`（STATIC_FILES）、`web/apexes-live-view.js`・`apexes-team-view.js`・`apexes-dom.js`・`apexes-team-dom.js`・`style.css`・`apexes.js`、テスト、README・AGENTS.md の該当の文。questions の answered（iss-00098）はなければ null として扱う。確かめ：T-01〜T-04。完了：lint・test・build。実装担当の最後の手順", realizes: ["R-01", "R-02"], session: "impl"}
}

tests: {
	"T-01": {title: "印の表：ask・working 偽・answered 偽か null → question、working 真 → question_working、answered 真 → question_answered、gate も同じ、waitingMembers → waiting。agent の節は dispatchId でも引ける", verifies: ["R-01"]}
	"T-02": {title: "内訳の木：status done で question の節が出て、稼働中 12 でも最初に選ばれ、祖先も出る", verifies: ["R-02"]}
	"T-03": {title: "チームの帯：question の done の節がいつも出す節に入り、「完了 n」にまとめられない", verifies: ["R-02"]}
	"T-04": {title: "dom：印の札が textContent で出て、innerHTML を使わない", verifies: ["R-01"]}
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
		impl: {task: "実装（S-01。Claude の実装担当、Orca の worker）", model: "opus", effort: "medium", rationale: "provider: claude。本人の指示（Codex を使わず Opus 5.5）。方針 §2 の実装担当"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-01", model: "opus", effort: "medium"}
	}
}
