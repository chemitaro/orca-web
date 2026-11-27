package spec

goal: "plist に ProcessType Interactive が入り、利用者の install の後に常駐が高い負荷でも Orca を読めることが確かめられている。"

steps: {
	"S-01": {title: "plist に ProcessType（D-01）。対象：src/service/launchd.ts、test/service/launchd.test.ts、AGENTS.md の launchd の文。確かめ：T-01・T-02", realizes: ["R-01"], status: "todo", session: "impl"}
	"S-02": {title: "入れ替えの後の確かめ（タスク担当、利用者の install の後）。常駐の PRI、/api/state の workers の新しさ、指先の頂点の質問の answered を見て report.md に書く", realizes: ["R-01"], status: "todo", after: ["S-01"], session: "impl"}
}

tests: {
	"T-01": {title: "renderPlist の出力の全文に ProcessType Interactive が ThrottleInterval の後にある", verifies: ["R-01"]}
	"T-02": {title: "install --dry-run の出力に ProcessType Interactive", verifies: ["R-01"]}
	"T-03": {title: "実物（S-02）：常駐の PRI、workers の新しさ、answered 真", verifies: ["R-01"]}
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
	- マージの後：本体の main を取り込み、利用者に `npm run service:install` を頼む（定義の入れ替え）
	"""
exit: "最終品質ゲートと CI が合格してマージされ、利用者の install の後の確かめが report.md にある。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録"}
		impl: {task: "実装（S-01・S-02。同じセッション）", model: "opus", effort: "high", rationale: "provider: claude。本人の指示（Opus 5.5）。2手順以下で同じ Opus のため、同じセッションの例外"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-01", model: "opus", effort: "medium"}
	}
}
