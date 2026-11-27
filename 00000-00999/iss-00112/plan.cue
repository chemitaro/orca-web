package spec

goal: "配下の待ち・問いで頂点が対応が必要にならず、3列の板に縦の線がある。"

steps: {
	"S-01": {title: "status の振り分け（D-01）と AGENTS.md（D-03 の判定の文）。対象：src/apex/build.ts、test/apex/*.test.ts、AGENTS.md。確かめ：T-01〜T-03。区切りのレビューなし", realizes: ["R-01"], status: "todo", session: "impl"}
	"S-02": {title: "列の間の線（D-02）と AGENTS.md（D-03 の web の文）。対象：web/style.css、test/web/apexes-navigation.test.ts、AGENTS.md。確かめ：T-04・T-05。区切りのレビューなし", realizes: ["R-02"], status: "todo", after: ["S-01"], session: "impl"}
}

tests: {
	"T-01": {title: "頂点の blocked・waiting と apex_closed は needs_action（今の試験のまま通る）", verifies: ["R-01"]}
	"T-02": {title: "頂点 done で配下の member_blocked・member_waiting、question・decision、stalled だけのとき status working で reasons は今のまま。counts.needs_action は 0", verifies: ["R-01"]}
	"T-03": {title: "頂点 done で failed だけのとき status done、group done_recent", verifies: ["R-01"]}
	"T-04": {title: "style.css の 900px 以上の塊に、選んでいないときの `.apex-column + .apex-column` の border-left と padding-left", verifies: ["R-02"]}
	"T-05": {title: "実物：試しの orca-web（npm run trial の 8792 か、PORT を変えた npm start）を 1280px で開き、3列の線を目で確かめ、指先の頂点が作業中の列にあることを /api/apexes で見る", verifies: ["R-01", "R-02"]}
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
	- マージの後：本体の main を取り込み、利用者に常駐の入れ替え（`npm run service:restart` の前のビルド）を頼む
	"""
exit: "最終品質ゲートと CI が合格してマージされている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録（Opus 5.5）"}
		impl: {task: "実装（S-01・S-02。同じセッション）", model: "opus", effort: "high", rationale: "provider: claude。本人の指示（Opus 5.5、2026-11-26）。2手順以下で同じ Opus のため、同じセッションの例外"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-02", model: "opus", effort: "medium"}
	}
}
