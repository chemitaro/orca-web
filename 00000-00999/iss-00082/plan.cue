package spec

goal: "`/` が指揮の画面になり、受け箱が `/inbox` で動き、Run の木の根が頂点の結びで決まり、要望の下書きがあることが、テストと試しの orca-web で確かめられている。"

steps: {
	"S-01": {status: "done", title: "道とリンク（D-01、D-02）", text: "対象：`src/server/app.ts`、`web/*.html` の見出し、`web/runs-view.js`・`web/apexes-view.js`、`test/server/`・`test/web/` の道とリンクのテスト。確かめ：T-01〜T-03。コミットして次へ", realizes: ["R-01", "R-02", "F-01"], session: "impl"}
	"S-02": {status: "done", title: "Run の木の根（D-03）", text: "対象：`src/runs/links.ts`・`src/runs/tree.ts`（`buildRunTree`・`buildRunList` の引数）、`src/server/app.ts`（`/api/runs/<id>/tree` と `/api/runs` に内部の値と対応表を渡す）、`test/runs/`・`test/server/`。確かめ：T-04・T-05・T-07。実装担当の最後の手順。区切りのレビュー：あり（cp1）", realizes: ["R-03"], after: ["S-01"], session: "impl"}
	"S-03": {status: "done", title: "README・AGENTS.md、要望の下書き、試しの orca-web（タスク担当。D-04）", text: "タスク担当が行う。README・AGENTS.md の道と画面の節を直す。要望の下書きを report.md に書く。試しの orca-web で `/`・`/inbox`・`/apexes`・`/runs/<id>` を開き、木の根が結べた Run の数を前後で比べて report.md に記録する。確かめ：T-06", realizes: ["R-04"], after: ["S-02"], session: "doc"}
}

tests: {
	"T-01": {title: "道：`/`・`/index.html`・`/apexes` が指揮の画面、`/inbox` が受け箱。CSP は今の index の画面の値", verifies: ["R-01"]}
	"T-02": {title: "`/embed/agent`・`/embed/open-button`・`/api/state`・`/api/worktrees/summary` の応答の形と見出しが今のまま", verifies: ["F-01"]}
	"T-03": {title: "リンク：各画面の HTML の見出しで、受け箱は `/inbox`、指揮は `/` を指す。受け箱へのリンクが `/` を指していない（HTML を読んで確かめる）", verifies: ["R-02"]}
	"T-04": {title: "木の根：activeCoordinatorHandle もなく生きた作業者もいない Run で、根の task の createdByPaneKey が頂点の paneKey と一致すれば、根がその頂点のエージェントに結ばれる", verifies: ["R-03"]}
	"T-07": {title: "古い handle と世代と一覧：activeCoordinatorHandle の端末がない Run で、生きた作業者の parentPaneKey か束の頂点で根が結ばれる。consumerGeneration が 2 の Run では世代 2 の束の頂点を選ぶ。buildRunList の coordinatorProject と fromOtherProject と ?project= の絞り込みが、新しい根の結びで決まる", verifies: ["R-03"]}
	"T-05": {title: "今の coordinatorAgent で結べる Run（handle あり、生きた作業者の parentPaneKey）の結果が変わらない", verifies: ["R-03"]}
	"T-06": {title: "試しの orca-web：4つの画面が開き、木の根が結べた Run の数が今以上。要望の下書きに私的な値がない", verifies: ["R-04", "R-03"]}
}

verification: """
	最後に `npm run lint`、`npm test`、`npm run build`（Node 24）。
	関門：
	- merge：agent
	- merge_permission：本人「ユーザーの許可なくマージする権限を付与します」（2026-11-25、利用者との Claude Code の会話。orca-web の PR を、最終品質ゲートと CI の合格を条件にエージェントがマージしてよいという許し。全文は公開しない）
	- 区切りのレビュー：cp1。最後の手順 S-02、code-reviewer（Opus 5.5 / medium）
	- 最終品質ゲート：範囲 `<開始のコミット>..HEAD`。追加の観点：compatibility-regression（SpecDock の契約と受け箱の道）。second_opinion：none
	- test_commands：`npm run lint`、`npm test`、`npm run build`
	- record_paths：なし
	"""
exit: "最終品質ゲートが合格し、PR の CI が通り、merge.md の条件でエージェントがマージした状態。Orca への要望は下書きのまま利用者に渡す。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録"}
		impl: {task: "実装（S-01・S-02。Claude の実装担当、Orca の worker）", model: "opus", effort: "medium", rationale: "provider: claude。本人の指示（Codex を使わず Opus 5.5）。方針 §2 の実装担当 standard"}
		doc: {task: "文書・下書き・試し（S-03。タスク担当）", model: "opus", effort: "high", rationale: "方針 §2 の注記"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー（code-reviewer）", after: "S-02", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-03", model: "opus", effort: "medium"}
	}
}
