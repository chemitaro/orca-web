package spec

goal: "読み取りと状態の文書に Orca の開始の時刻を足し、要約に親・main・開始の時刻を組み、部品の並びと data-agent-id を改め、文書と実物の確かめで閉じる。"

steps: {
	"S-01": {title: "開始の時刻の読み取りと要約の親・main・startedAt（D-01、D-02、D-03）", realizes: ["R-01", "R-02", "R-03", "F-01"], status: "done", session: "impl"
		text: "対象：`src/orca/read-state.ts`（OrcaAgentStatus と pickAgentStatus だけ）、`src/state/model.ts`・`normalize.ts`・`fields.ts`（sessionStartedAt）、`src/summary/model.ts`・`build.ts`・`started.ts`（新規）、`src/server/app.ts`（要約の道だけ）、`test/` の下（read-state、状態の正規化、`test/summary/build.test.ts`、新しい `test/summary/started.test.ts`、要約の道のテスト。手書きの AgentState には sessionStartedAt を足すだけで、既存の期待値を変えない）。確かめ：T-01、T-02、T-03、T-04。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットする"
	}
	"S-02": {title: "部品の並びと data-agent-id（D-04、D-05）", realizes: ["R-04", "R-05", "F-02"], status: "done", after: ["S-01"], session: "impl"
		text: "対象：`web/embed/agent-marks-view.js`（buildMarks と新しい orderAgents）、`web/embed/agent-marks.js`（markElement）、`test/web/agent-marks-view.test.ts`・`agent-marks-dom.test.ts`（ORDER の並びを前提にした既存のテストは、新しい規則の期待に直す）。確かめ：T-05、T-06。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットして止まり HEAD を報告する"
	}
	"S-03": {title: "文書と実物の確かめ（D-06、D-07）", realizes: ["R-06", "R-07"], status: "done", after: ["S-02"], session: "doc"
		text: "タスク担当が行う。README.md と AGENTS.md を D-06 のとおり直す。D-07 のとおり読み、report.md に表と写しを書く。送らない、Orca で開くを押さない、統括の連絡を既読にしない。確かめ：T-07、T-08。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットする"
	}
}

tests: {
	"T-01": {title: "read-state：agentStatus の firstStateStartedAt と stateHistory[0].startedAt を拾い、ないか形が違えば null。正規化：端末のタブの sessionStartedAt が firstStateStartedAt、なければ stateHistory の値、chat-tab と untabbed は null（no-source）", verifies: ["R-03", "F-01"]}
	"T-02": {title: "要約の parent：統括の chat-tab を指す子、別の worktree の親、parentPaneKey null、一致なし・2つ一致・自分だけ一致", verifies: ["R-01", "F-01"]}
	"T-03": {title: "要約の main：true・false・値なし・worktree なし", verifies: ["R-02"]}
	"T-04": {title: "startedAt：sessionStartedAt が先、なければ FirstSeenStartTimes の値。状態が変わっても固定、消えて現れると覚え直す、初めの null は覚えない。要約の道で2回読むと記憶が効く", verifies: ["R-03"]}
	"T-05": {title: "buildMarks の並び：関係なし2人の新しい順、親 → 子 → 孫、兄弟の新しい順、別の worktree の親の子は関係なし、混ざったとき関係なしが左、状態で並びが変わらない、輪と自分を指す親、parent・startedAt のない要約は要約の順、形の違う parent・startedAt、上限を越えた overflow", verifies: ["R-04", "F-02"]}
	"T-06": {title: "renderAgentMarks：各印の data-agent-id が並びの順の id、id null の印と『+N』に data-agent-id がない（span とボタンの両方）", verifies: ["R-05"]}
	"T-07": {title: "README.md と AGENTS.md に parent・main・startedAt・data-agent-id と並びの規則があり、古い並びの記述がない（rg で確かめる）", verifies: ["R-06"]}
	"T-08": {title: "実物：直す前（常駐）と後（一時の orca-web）の要約の数・組・並び・data-agent-id の写しが report.md にある（タスク担当、読むだけ）", verifies: ["R-07"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門：
	- merge：owner（統括が行う。タスク担当はマージしない）
	- 区切りのレビュー：なし（S-01・S-02 は同じ実装担当が続けて行い、final-quality-gate で全体を見る）
	- final-quality-gate：S-03 の後、範囲 `c485804..HEAD`。レビュアー quality-gate-reviewer（Claude Opus 5.5 / medium）。観点 functional-correctness、requirements-closure、test-adequacy、security-baseline（要約に paneKey・会話・題名を出さない。Orca への命令と RPC を増やさない。送信と開く口を変えない）。second_opinion none。test_commands：`npm run lint`、`npm test`、`npm run build`。record_paths：`spec-dock/initiatives/00000-00999/iss-00043/`（Git の外）
	"""

rollback: "PR を戻す（版は同じで項目を足しただけなので、戻しても読む側は壊れない。並びは状態の重さの順に戻る）。"

exit: "PR を開き、CI が通り、統括に PR と合格のコミットと closure.md を報告した状態。"

execution: {
	sessions: {
		spec: {task: "仕様化とタスク担当", model: "claude-opus-5-5", effort: "medium", rationale: "統括が依頼書で選んだ（事実の記録）"}
		impl: {task: "S-01・S-02 読み取り・要約・部品の並び・テスト", model: "gpt-6.1-sol", effort: "medium", rationale: "依頼書の本人の指示（テストで確かめられるので Codex GPT-6.1 Sol / medium）。provider codex。chat-scratch の symlink の拒否で止まったら待たずに worker-stop し Claude Opus 5.5 / medium に切り替える（統括が了承済み。逸脱として記録）"}
		doc:  {task: "S-03 文書と実物の確かめ", model: "claude-opus-5-5", effort: "medium", rationale: "実物の確かめと文書はタスク担当が行う（文書の手順の同じセッションの例外）"}
	}
	reviews: final: {role: "final-quality-gate", after: "S-03", model: "claude-opus-5-5", effort: "medium"}
}
