package spec

goal: "構造化 Chat の会話を押すとその会話のタブが選ばれることが、テストとクライアントの端末からの実物の確かめで分かっている。"

steps: {
	"S-01": {title: "選び方と埋め込みの見出し（D-01・D-02）。対象：src/orca/open-target.ts、web/embed/agent-view.js、test/orca/open-target.test.ts、test/web/agent-view.test.ts（あれば）、AGENTS.md の open-target の文", realizes: ["R-01", "R-02"], status: "todo", session: "impl"}
	"S-02": {title: "実物の確かめ（タスク担当）。試しの orca-web（8793、送信は無効）に、クライアントの Chrome から、このリポジトリの worktree の構造化 Chat の頂点で `/api/open` を送り、device client・requestedAgentFound 真・reason requested-agent を確かめる。結果は report.md に件数と結論だけ。試しの orca-web は止める", realizes: ["R-01"], status: "todo", after: ["S-01"], session: "impl"}
}

tests: {
	"T-01": {title: "chooseTarget：chat: の要求で agent-session のタブを tab-activate・requested-agent・found 真で選ぶ。当たらなければ今の選び方で found 偽。端末のタブは chat: の要求で選ばない。paneKey の要求は今のまま", verifies: ["R-01"]}
	"T-02": {title: "buildDetail：chat-tab の open が agent に chat: の id を持ち、terminal-tab は paneKey、untabbed は worktree だけ", verifies: ["R-02"]}
	"T-03": {title: "実物（S-02）：クライアントから requestedAgentFound 真・reason requested-agent・device client", verifies: ["R-01"]}
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
	- マージの後：src/ の変更なので、常駐の orca-web の入れ替え（ビルドと再起動）は AGENTS.md によりエージェントは行わず、利用者に `npm run service:restart` を頼む（本体の main の取り込みと dist のビルドまではタスク担当が行う）
	"""
exit: "実物の確かめが report.md にあり、最終品質ゲートと CI が合格してマージされている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録"}
		impl: {task: "実装（S-01・S-02。同じセッション）", model: "opus", effort: "high", rationale: "provider: claude。本人の指示（Opus 5.5、2026-11-26）。2手順以下で同じ Opus のため、同じセッションの例外"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-02", model: "opus", effort: "medium"}
	}
}
