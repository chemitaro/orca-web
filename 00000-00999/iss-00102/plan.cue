package spec

goal: "頂点の行から Orca で開け、広い幅で一覧と会話のスクロールが左右に分かれていることが、テストと実物の画面で確かめられている。"

steps: {
	"S-01": {title: "行の「Orca で開く」（D-01〜D-03、D-04 の行の部分）。対象：web/apexes-view.js・apexes-dom.js・apexes.js・style.css、test/web/apexes-view.test.ts・apexes-dom.test.ts、AGENTS.md の web/ の節（行の Open）。確かめ：T-01〜T-03。完了：npm test の該当とlint", realizes: ["R-01", "R-02", "F-01"], status: "todo", session: "impl"}
	"S-02": {title: "広い幅のスクロールの分け方（D-04 の配置の部分）。対象：web/style.css、test/web/apexes-navigation.test.ts。確かめ：T-04・T-05。完了：lint・test・build", realizes: ["R-03", "R-04"], status: "todo", after: ["S-01"], session: "impl"}
	"S-03": {title: "実物の画面での確かめ（タスク担当）。実装の worktree から試しの orca-web（8793、送信は無効）を起動し、Chrome で幅 1920 程度と 390 で /apexes を開き、T-06 を確かめる。行の Open は押して前面が切り替わることまでは試さない（開く口は既存）。結果は件数と結論だけ report.md に書く。試しの orca-web は止める", realizes: ["R-01", "R-03"], status: "todo", after: ["S-02"], session: "impl"}
}

tests: {
	"T-01": {title: "apexes-view：worktreeId のある頂点の行は open {worktree, agent}、ない行・結べない行・束は null。buildPane の header.open も同じ", verifies: ["R-01"]}
	"T-02": {title: "apexes-dom：onOpen を渡すと open のある選べる行に .orca-open が1つ、選ぶボタンの外。押すと onOpen(open, control)、選ぶボタンの click は起きない。onOpenMount が呼ばれる。open のない行・onOpen なしでは部品なし", verifies: ["R-01", "F-01"]}
	"T-03": {title: "style.css：390px 以下で行の Open が display none、.apex-actions が折り返す", verifies: ["R-02"]}
	"T-04": {title: "style.css：900px 以上の media で body・.apex-layout・.apex-list・.apex-pane・.apex-pane-head の宣言（D-04）。.apex-pane に position: sticky がない", verifies: ["R-03"]}
	"T-05": {title: "900px 未満の既存の規則の試験がそのまま通る", verifies: ["R-04"]}
	"T-06": {title: "実物の画面：幅 1920 で文書の scrollHeight ≤ 窓の高さ、一覧が自分で巻ける、ペインの下の縁が窓の中。行に Open が並ぶ。幅 390 で行の Open が見えず横に流れない", verifies: ["R-01", "R-02", "R-03"]}
}

verification: """
	最後に `npm run lint`、`npm test`、`npm run build`（Node 24）。
	関門：
	- merge：agent
	- merge_permission：本人「ユーザーの許可なくマージする権限を付与します」（2026-11-25、利用者との Claude Code の会話。orca-web の PR を、最終品質ゲートと CI の合格を条件にエージェントがマージしてよい。全文は公開しない）
	- 区切りのレビュー：なし（小さな画面の変更）
	- 最終品質ゲート：範囲 `<開始のコミット>..HEAD`。second_opinion：none
	- test_commands：`npm run lint`、`npm test`、`npm run build`
	- record_paths：なし
	- マージの後、タスク担当が常駐の orca-web を入れ替える（利用者の依頼 2026-11-25）
	"""
exit: "実物の画面の確かめが report.md にあり、最終品質ゲートと CI が合格してマージされ、常駐の orca-web に入っている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録"}
		impl: {task: "実装（S-01〜S-03。同じセッション）", model: "opus", effort: "high", rationale: "provider: claude。本人の指示（Codex を使わず Opus 5.5、2026-11-26）。実装担当がタスク担当と同じ Opus になるため、同じセッションの例外（coding-task §5）で続ける"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-03", model: "opus", effort: "medium"}
	}
}
