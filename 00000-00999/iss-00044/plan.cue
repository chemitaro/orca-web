package spec

goal: "読み取りと正規化と探し方の1か所で構造化 Chat の作業者と統括を結び、テストで端末の結び付けを固め、実物の数で直す前と後を残す。"

steps: {
	"S-01": {title: "構造化のセッションの読み取りと、chat-tab の担当（D-01、D-02）", realizes: ["R-01", "R-04", "F-01", "F-02"], status: "done", session: "impl"
		text: "対象：`src/orca/read-state.ts`（OrcaWorker と pickWorker だけ）、`src/state/normalize.ts`（chatTab の worker と、そのための Map）、`test/` の下（read-state の読み取りのテスト、正規化のテスト。新しいファイルは `test/state/structured-worker.test.ts`）。確かめ：T-01、T-02、T-05。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットする"
	}
	"S-02": {title: "探し方の1か所と、統括の結び付け（D-03）", realizes: ["R-01", "R-02", "R-03", "F-01"], status: "done", after: ["S-01"], session: "impl"
		text: "対象：`src/runs/links.ts`（新規）、`src/runs/tree.ts`（探し方を links.ts に置き換えるだけ）、`test/runs/` の下（新しいファイル `test/runs/links.test.ts`）。確かめ：T-03、T-04。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットして止まり HEAD を報告する"
	}
	"S-03": {title: "文書と実物の数（D-04、D-05）", realizes: ["R-05", "R-02", "R-04"], status: "done", after: ["S-02"], session: "doc"
		text: "タスク担当が行う。README.md と AGENTS.md を D-04 のとおり直す。D-05 のとおり直す前と後を読み、report.md に表を書く。送らない、Orca で開くを押さない。確かめ：T-06、T-07。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットする"
	}
}

tests: {
	"T-01": {title: "read-state：worker-list の行の `resource.endpointIncarnation` が `structured:abc` で structuredSessionId が `abc`、端末の形・`structured:`・resource なし・文字列でない値で null", verifies: ["R-01", "F-01"]}
	"T-02": {title: "正規化：structured のセッション S の worker 1行と、sessionId が S の agent-session のタブ（id が `agent-session:S` と、開き直した別の形の2通り）で chat-tab の worker が `{dispatchId, taskId, runId}`。S の worker が2行、S と違う sessionId、タブに sessionId がない、のときは null。端末のタブの worker は今のまま", verifies: ["R-01", "F-01", "F-02"]}
	"T-03": {title: "links/tree：作業者の chat-tab（worker 付き）で木の worker の節の agentId が `chat:…`。統括の chat-tab（paneKey P）と根の task の作業者（parentPaneKey P）で根の agentId と project。新しい根の task を先に見る。一致なし・作業者にエージェントなし・子の task だけ一致で null", verifies: ["R-01", "R-02", "F-01"]}
	"T-04": {title: "links/tree：activeCoordinatorHandle があるときは handle のエージェントだけ（parentPaneKey の候補を無視し、handle のエージェントがなければ null）。既存の test/runs/tree.test.ts が期待値を変えずに通る", verifies: ["R-03"]}
	"T-05": {title: "受け箱と文書：結んだ chat-tab の Dispatch の question が `agent:chat:…` の行の mail に付き `question:…` の行がない。状態の文書を JSON にして `structured:` と endpointIncarnation が出ない", verifies: ["R-04"]}
	"T-06": {title: "実物：直す前（常駐）と後（一時の orca-web）の Run の木の agentId の数の表が report.md にある（タスク担当、読むだけ）", verifies: ["R-05"]}
	"T-07": {title: "README.md と AGENTS.md に構造化 Chat の結び方が書いてある（rg `parentPaneKey`、`endpointIncarnation`）", verifies: ["R-02", "R-04"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門：
	- merge：owner（統括が行う。タスク担当はマージしない）
	- 区切りのレビュー：なし（S-01・S-02 は同じ実装担当が続けて行い、final-quality-gate で全体を見る）
	- final-quality-gate：S-03 の後、範囲 `775226a..HEAD`。レビュアー quality-gate-reviewer（Claude Opus 5.5 / medium）。観点 functional-correctness、requirements-closure、test-adequacy、security-baseline（セッションの識別子や endpointIncarnation を文書に出さない。Orca への読む命令を増やさない。送信の宛先の解き方を変えない）。second_opinion none。test_commands：`npm run lint`、`npm test`、`npm run build`。record_paths：`spec-dock/initiatives/00000-00999/iss-00044/`（Git の外）
	"""

rollback: "PR を戻す（文書の版と項目は同じなので、戻しても読む側は壊れない）。"

exit: "PR を開き、CI が通り、統括に PR と合格のコミットと closure.md を報告した状態。"

execution: {
	sessions: {
		spec: {task: "仕様化とタスク担当", model: "claude-opus-5-5", effort: "medium", rationale: "統括が依頼書で選んだ（事実の記録）"}
		impl: {task: "S-01・S-02 読み取り・正規化・探し方・テスト", model: "gpt-6.1-sol", effort: "medium", rationale: "依頼書の指示（テストで確かめられるので Codex GPT-6.1 Sol / medium）。provider codex。chat-scratch の symlink の拒否で止まったら worker-stop し Claude Opus 5.5 / medium に切り替える（統括が了承済み。逸脱として記録）"}
		doc:  {task: "S-03 文書と実物の数", model: "claude-opus-5-5", effort: "medium", rationale: "実物の確かめと文書はタスク担当が行う（文書の手順の同じセッションの例外）"}
	}
	reviews: final: {role: "final-quality-gate", after: "S-03", model: "claude-opus-5-5", effort: "medium"}
}
