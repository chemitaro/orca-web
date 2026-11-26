package spec

goal: "返事の付いた質問と解決した門では対応が必要にならず、読めないときは今のとおりで、読みが既読にせず本文を拾わないことがテストと常駐の実データで確かめられている。"

steps: {
	"S-01": {title: "読む口・置き場・判定・画面（D-01〜D-04）", text: "対象：`src/orca/orca-cli.ts`、新しい `src/orca/read-threads.ts`、`src/orca/read-mail.ts`（門の読みを使い回すなら）、`src/state/poller.ts`、`src/apex/extras.ts`・`build.ts`・`model.ts`、`web/apexes-view.js`・`apexes-cards-view.js`、テスト（録画か仮の CLI）、README・AGENTS.md の該当の文（read-mail と ReadOnlyOrcaCli の節に inbox を足す）。確かめ：T-01〜T-07。完了：lint・test・build。実装担当の最後の手順。止まって HEAD を報告する", realizes: ["R-01", "R-02", "R-03", "R-04", "R-05", "F-01"], session: "impl"}
	"S-02": {title: "試しの orca-web での実データの確かめ（タスク担当）", text: "タスク担当が行う。実装の worktree から別のポート（8793）で試しの orca-web を起動し（送信は無効の既定）、`/api/apexes` を読む。あわせて同じ時刻に、印（attention input）のある Dispatch ごとに `orchestration inbox --run <id> --limit 1000 --full --json` を読むだけで読み、R-01 の条件（最新の質問の3条件と古い質問の条件の両方）で手で数えた返事済みの有無と、questions の answered を突き合わせる。合格の基準：(1) 手で数えた結果と answered が全件一致する、(2) 本当の返事のある質問だけの頂点が needs_action の理由 question を持たない、(3) Orca の自動の知らせだけの質問が answered 真にならない（その時点に該当がなければ「該当なし」と書く）。結果は件数と結論だけを report.md に書く（題名・本文・パス・handle を書かない）。試しの orca-web は止める。確かめ：T-08", realizes: ["R-01", "R-05"], after: ["S-01"], session: "spec"}
}

tests: {
	"T-01": {title: "ReadOnlyOrcaCli：inbox の --run・--limit・--full・--json は通り、--terminal・--ack・ほかの引数は拒む。check の決まりは今のまま", verifies: ["R-03"]}
	"T-02": {title: "readThreads：結果の値に body・subject・payload がない。最新の質問の後に、本人あてで自動の知らせでない返事があれば answered 真。返事が古い質問のスレッドだけ・質問より前・宛先が Run（本人の追いの発言）だけなら偽。最新の質問に返事があっても、返事も自動の知らせもない古い質問があれば偽、古い質問に本人あての自動の知らせがあれば真のまま。質問がなければ記録なし。形が違えば ok 偽", verifies: ["R-03", "R-01"]}
	"T-07": {title: "自動の知らせ：Orca の4つの文（Run の id・質問の id を差し込んだ形。peer は空白を含む理由の文「The pairing with My Server was re-made.」と「My Server was removed from this Orca's paired servers.」を前に付けた形）は auto、少し違う文と普通の答えは auto でない。本文が文字列でない返事は数えない。自動の知らせだけのスレッドは answered 偽", verifies: ["R-05"]}
	"T-08": {title: "試しの orca-web（実物の Orca を読むだけ）：S-02 の合格の基準の3つが report.md にある", verifies: ["R-01", "R-05"]}
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
exit: "試しの orca-web での確かめが report.md にあり、最終品質ゲートと CI が合格してマージされ、常駐の orca-web に入っている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録"}
		impl: {task: "実装（S-01。Claude の実装担当、Orca の worker）", model: "opus", effort: "medium", rationale: "provider: claude。本人の指示（Codex を使わず Opus 5.5）。方針 §2 の実装担当"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-02", model: "opus", effort: "medium"}
	}
}
