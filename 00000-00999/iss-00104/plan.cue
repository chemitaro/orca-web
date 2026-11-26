package spec

goal: "会話の枠の外枠が巻かれず、スマホで会話が画面の大半を占め、詳細は切り替えで出せることが、テストと実物の画面で確かめられている。"

steps: {
	"S-01": {title: "はみ出しの修正と head=compact（D-01・D-02）。対象：web/embed/agent.css・agent-frame.js・draft-receiver.js、web/apexes-view.js、テスト（agent-css・draft-receiver・apexes-cards-view・apexes-navigation）", realizes: ["R-01", "R-02"], status: "todo", session: "impl"}
	"S-02": {title: "詳細の切り替えと狭い幅の見出し（D-03・D-04）。対象：web/apexes-view.js・apexes-dom.js・apexes.js・style.css、テスト（apexes-view・apexes-dom・apexes-navigation）、AGENTS.md の web/ の節", realizes: ["R-03", "R-04", "F-01"], status: "todo", after: ["S-01"], session: "impl"}
	"S-03": {title: "実物の画面での確かめ（タスク担当）。試しの orca-web（8793、送信は無効）で、T-07 を確かめ、件数と結論だけ report.md に書く。試しの orca-web は止める", realizes: ["R-01", "R-04"], status: "todo", after: ["S-02"], session: "impl"}
}

tests: {
	"T-01": {title: "agent.css：header・main・#send が position: relative。body.head-compact の .title-row が display none", verifies: ["R-01", "R-02"]}
	"T-02": {title: "isHeadCompact：head=compact だけ真。agent-frame が真で body に head-compact を付ける（ソース）", verifies: ["R-02"]}
	"T-03": {title: "frameSrc が head=compact を含み、compose=off の形も保つ", verifies: ["R-02"]}
	"T-04": {title: "paneExtrasToggle と initialExtrasOpen：畳んでカード n>0 で '対応 n'・alert、開いていれば badge null、カードなしで null", verifies: ["R-03", "F-01"]}
	"T-05": {title: "renderPaneHead：extras を渡すと button.apex-extras-toggle（aria-expanded・aria-controls・data-action）を描く。apexes.js：チームの帯と対応のカードを #pane-extras に入れ、畳むと hidden、押すと反転、matchMedia の例外で開く（ソース）", verifies: ["R-03", "F-01"]}
	"T-06": {title: "style.css：900px 未満の選んだときの余白 0・100dvh・枠線なし、見出しの帯 nowrap、題名の ellipsis", verifies: ["R-04"]}
	"T-07": {title: "実物：枠の高さ 200px の /embed/agent の文書が巻かれない。狭い窓（選んだとき、畳んだ始め）で会話の枠が窓の高さの半分より大きい。切り替えで詳細が出る", verifies: ["R-01", "R-03", "R-04"]}
}

verification: """
	最後に `npm run lint`、`npm test`、`npm run build`（Node 24）。
	関門：
	- merge：agent
	- merge_permission：本人「ユーザーの許可なくマージする権限を付与します」（2026-11-25、利用者との Claude Code の会話。orca-web の PR を、最終品質ゲートと CI の合格を条件にエージェントがマージしてよい。全文は公開しない）
	- 区切りのレビュー：なし
	- 最終品質ゲート：範囲 `<開始のコミット>..HEAD`。second_opinion：none
	- test_commands：`npm run lint`、`npm test`、`npm run build`
	- record_paths：なし
	- マージの後、本体の main を取り込み、常駐の orca-web が新しい画面を配ることを確かめる（web/ だけの変更）
	"""
exit: "実物の確かめが report.md にあり、最終品質ゲートと CI が合格してマージされ、常駐の orca-web が新しい画面を配っている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録"}
		impl: {task: "実装（S-01〜S-03。同じセッション）", model: "opus", effort: "high", rationale: "provider: claude。本人の指示（Codex を使わず Opus 5.5、2026-11-26）。実装担当がタスク担当と同じ Opus になるため、同じセッションの例外で続ける"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-03", model: "opus", effort: "medium"}
	}
}
