package spec

// 計画（Issue）。型 specdock/v1。

goal: "chat-tab の model・effort を起動の記録から出す直しと単体のテストを1つの手順で作り、実物の Antigravity の worker で状態の文書を確かめて出す。"

// 開始のコミット：58275ea（main、PR #64 のマージ）。worktree は iss-00068、ブランチ chemitaro/iss-00068。
// 手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない。
// 実装担当は実物の Orca に何も送らない（読むことも要らない）。仕様の読み方に迷ったら、直さずにタスク担当に問う。
// 実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。

steps: {
	"S-01": {
		title:    "chat-tab の model・effort を、結んだ worker の起動の記録から作る（D-01）"
		text:     "対象：`src/state/normalize.ts` の `chatTab` だけと、`test/state/structured-worker.test.ts`（T-02 の no-source の期待を新しい振る舞いに直し、T-01〜T-03 のテストを足す。新しいテストのファイルを足してもよい）。端末のタブ、`workers` の行、`launchReadings`・`launchMissing`・`readingFact`、ポーリング、型、`web/`、README は変えない。確かめ：T-01〜T-03。完了：T-01〜T-03 のテストがあり、端末のタブの今のテストの期待を変えずに `npm run lint`、`npm test`、`npm run build` が通る。終えたら clean なコミットで止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-01", "R-02", "R-03", "F-01", "F-02"]
		status:   "done"
		session:  "impl"
	}
	"S-02": {
		title:    "実物の Antigravity の worker で状態の文書を確かめる"
		text:     "タスク担当が行う。試しの orca-web（`npm run trial -- --state-dir .workbench/trial-68 --orca-port <空いた port> ...`、専用の settings、sendEnabled は偽のまま。常駐の 8791 は変えない）の `/api/state` で、統括の試しの送り先（ctx_972dbcac8726、Antigravity、gemini-3.8-flash-low / low）の chat-tab の model・effort の値・出どころ・meaning を読み、report.md の Verification に件数と値だけを書く（会話の中身、パス、IP は書かない）。送り先には何も送らない。確かめ：T-04。完了：report.md に実物の値があり、試しの orca-web を止めた"
		realizes: ["R-01"]
		after:    ["S-01"]
		status:   "done"
		session:  "owner"
	}
}

tests: {
	"T-01": {title: "結んだ chat-tab（agent antigravity）で、起動の記録に effective と requested があれば model・effort の値が effective、source workerLaunch、field `startOptions.launch.effective.<key>`、meaning launch-resolved、readings が launch-resolved・launch-requested の2つ。effective がなく requested だけなら meaning launch-requested の requested の値。agent claude の chat-tab でも同じで、タブに agentStatus（model・providerSession.effort）を与えても値と出どころは起動の記録のまま（F-02）", verifies: ["R-01", "F-02"]}
	"T-02": {title: "結んだ chat-tab（agent gemini など）で起動の記録に model・effort がなければ not-provided、settled で放された worker は not-fetched、起動の記録の Map にない生きた worker は source-failed（どれも source workerLaunch、readings 空）。worker のない antigravity・gemini の chat-tab と、同じセッションの worker が2行の chat-tab は no-source（F-01）", verifies: ["R-02", "F-01"]}
	"T-03": {title: "端末のタブ（Claude・Codex）の model・effort の今のテスト（`test/state/` の期待の expected.ts などを含む）が、期待を変えずにそのまま通る", verifies: ["R-03"]}
	"T-04": {title: "実物の Orca 1.4.263 の Antigravity の worker で、試しの orca-web の /api/state の chat-tab に model gemini-3.8-flash-low・effort low（source workerLaunch、meaning launch-resolved）が出たことを report.md に書く（タスク担当）", verifies: ["R-01"]}
}

verification: """
	S-01 で T-01〜T-03 を通す。S-02 で T-04 を確かめる。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う）
	- 区切りのレビュー：なし（1手順の小さな直しで、最終品質ゲートで見る）
	- 最終品質ゲート：範囲 `58275ea..HEAD` の全体（`src/state/normalize.ts`、`test/state/`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy、compatibility（端末のタブの読み取りが変わらない）。second_opinion：chatgpt（統括の依頼書『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ記録して主のレビュアーで続ける）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（report.md は Git の外で SpecDock が保存する）
	"""
rollback: "PR を戻せば、chat-tab の model・effort は no-source に戻る。状態の文書の形は変わらない。"
exit:     "最終品質ゲート（`58275ea..HEAD`、または取り込み後の HEAD）が合格し、実物の値が report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		owner: {task: "仕様化と実物の確かめ（タスク担当。統括が選んだ値の記録）、S-02", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-20）：Opus 5.5 / medium（方針の「タスク担当 × standard」）。実機の確かめは試しのエージェントを扱うのでタスク担当が行う"}
		impl: {task: "実装（S-01。normalize の純な関数と単体のテスト。Codex の実装担当、Orca の worker）", model: "gpt-6.2-sol", effort: "medium", rationale: "本人の指示（2026-11-13、方針の表は 2026-11-19 から GPT-6.2 Sol）と統括の依頼書：テストで確かめられるサーバー側のコードは Codex GPT-6.2 Sol / medium（方針の「実装担当（テストで確かめられる実装）× standard」）。Sol で失敗や見落としが記録されたときだけ GPT-6.2 Astra / high に上げる。Codex が確認の画面や chat-scratch の symlink の拒否で止まったら worker-stop して Claude Opus 5.5 / medium に切り替える（統括が了承済み）。provider: codex"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-02", model: "opus", effort: "medium"}
	}
}
