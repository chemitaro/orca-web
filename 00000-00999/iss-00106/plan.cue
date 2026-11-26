package spec

goal: "選んでいない広い画面が3列で、選ぶと2ペイン、閉じると3列に戻り、狭い画面は今のままであることが、テストと実物の画面で確かめられている。"

steps: {
	"S-01": {title: "列の組み立て・描き方・選び・CSS（D-01〜D-04）。対象：web/apexes-view.js・apexes-dom.js・apexes.js・style.css、test/web/apexes-view.test.ts・apexes-dom.test.ts・apexes-navigation.test.ts、AGENTS.md の web/ の節", realizes: ["R-01", "R-02", "R-03", "R-04"], status: "todo", session: "impl"}
	"S-02": {title: "実物の画面での確かめ（タスク担当）。試しの orca-web（8793、送信は無効）で T-05 を確かめ、件数と結論だけ report.md に書く。試しの orca-web は止める", realizes: ["R-01", "R-02"], status: "todo", after: ["S-01"], session: "impl"}
}

tests: {
	"T-01": {title: "boardColumns：3列で、完了の列は done_recent・done_older・sleeping・unknown・unlinked の順。知らない段は最後の列", verifies: ["R-01"]}
	"T-02": {title: "renderBoard：列ごとの div.apex-column（data-column）、段の expanded は opened に従う、行に onOpen を渡す", verifies: ["R-01"]}
	"T-03": {title: "initialSelection と reduceSelection：?apex= がなければ最初の文書の後も null。?apex= があれば今のとおり", verifies: ["R-03"]}
	"T-04": {title: "style.css：900px 以上・選んでいないときの3列の宣言と右のペインを隠す規則、.apex-column の overflow-y auto、.apex-back を隠す規則がない。900px 未満の既存の試験が通る", verifies: ["R-01", "R-02", "R-04"]}
	"T-05": {title: "実物：幅 1400 程度で選んでいないとき3列で文書が巻かれない、完了の列の下に閉じた4つの段、行を選ぶと2ペイン、「← 一覧」で3列に戻る", verifies: ["R-01", "R-02"]}
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
		impl: {task: "実装（S-01・S-02。同じセッション）", model: "opus", effort: "high", rationale: "provider: claude。本人の指示（Opus 5.5、2026-11-26）。2手順以下で実装担当がタスク担当と同じ Opus のため、同じセッションの例外で続ける"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-02", model: "opus", effort: "medium"}
	}
}
