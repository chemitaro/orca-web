package spec

goal: "返事の付いた質問と解決した門では対応が必要にならず、読めないときは今のとおりで、読みが既読にせず本文を拾わないことがテストと常駐の実データで確かめられている。"

steps: {
	"S-01": {title: "読む口・置き場・判定・画面（D-01〜D-04）", text: "対象：`src/orca/orca-cli.ts`、新しい `src/orca/read-threads.ts`、`src/orca/read-mail.ts`（門の読みを使い回すなら）、`src/state/poller.ts`、`src/apex/extras.ts`・`build.ts`・`model.ts`、`web/apexes-view.js`・`apexes-cards-view.js`、テスト（録画か仮の CLI）、README・AGENTS.md の該当の文（read-mail と ReadOnlyOrcaCli の節に inbox を足す）。確かめ：T-01〜T-06。完了：lint・test・build。実装担当の最後の手順", realizes: ["R-01", "R-02", "R-03", "R-04", "F-01"], session: "impl"}
}

tests: {
	"T-01": {title: "ReadOnlyOrcaCli：inbox の --run・--limit・--json は通り、--terminal・--full・ほかの引数は拒む。check の決まりは今のまま", verifies: ["R-03"]}
	"T-02": {title: "readThreads：拾う値が id・type・from_handle・to_handle・thread_id・created_at だけで、body・subject・payload がない。最新の質問に別の送り手の後の返事があれば answered 真、なければ偽、質問がなければ記録なし", verifies: ["R-03", "R-01"]}
	"T-03": {title: "A3：attention input で answered 真 → 90 秒後も対応が必要にならず question_answered。answered 偽 → question。threads が読めない・その Dispatch がない → question", verifies: ["R-01", "F-01"]}
	"T-04": {title: "A3：attention approval で pending の門なし → decision_resolved、あり → decision、読めない → decision", verifies: ["R-02", "F-01"]}
	"T-05": {title: "読む Run は attention input・approval のある worker の Run だけ。同じ世代で読み直さない。状態の文書に新しい鍵がない", verifies: ["R-03"]}
	"T-06": {title: "カードの answered の添え書きと理由の言葉", verifies: ["R-04"]}
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
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-01", model: "opus", effort: "medium"}
	}
}
