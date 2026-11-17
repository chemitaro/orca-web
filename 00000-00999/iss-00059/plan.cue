package spec

// 計画（Issue）。型 specdock/v1。

goal: "端末の承認の手段を、質問の答えと同じ時間切れと確定の 5xx の結果不明に載せ、テストと文書と描画の写しを揃えて出す。"

// 開始のコミット：3ddeb95（main、PR #58 のマージ）。worktree は iss-00059、ブランチ chemitaro/iss-00059。
// 手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない。実物の Orca に書き込みの RPC を送らない。
// 仕様の読み方に迷ったら、直さずにタスク担当に問う。実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。

steps: {
	"S-01": {
		title:    "端末の承認の手段の時間切れと確定の 5xx（D-01・D-02）とテスト"
		text:     "対象：`web/embed/question-view.js`（export を足すだけ）、`web/embed/approval-view.js`、`test/web/approval-view.test.ts`。確かめ：T-01〜T-04。完了：`node --test test/web/approval-view.test.ts test/web/question-view.test.ts`、`npm run lint`、`npm test`、`npm run build` が通り、T-01〜T-04 のテストがあり、iss-00054 の今のテストは変えずに通る。コミットする"
		realizes: ["R-01", "R-02", "R-03", "F-01"]
		status:   "done"
		session:  "ui"
	}
	"S-02": {
		title:    "AGENTS.md と描画の写し（D-03）"
		text:     "対象：`AGENTS.md`（承認のカードの説明の1か所）、README.md（端末の承認の結果不明の説明があるときだけ）。描画の確かめは、実装担当が自分で起動した orca-web（一時の port、一時の settings、偽の Orca の会話と、確定に `500 {ok: false, error: 'internal_error'}` を返す偽の口。実物の Orca には書き込まない）とヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じる）で、端末の承認のカードの結果不明の帯を幅 1280px と 390px で写し、はみ出し 0 と「Orca で開く」を DOM で数え、写しを `.workbench/implement/iss-00059/render/` に置く。確かめ：T-05。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットして止まり、HEAD を報告する"
		realizes: ["R-01", "R-03"]
		after:    ["S-01"]
		status:   "done"
		session:  "ui"
	}
}

tests: {
	"T-01": {title: "確定の `500 {ok:false, error:'internal_error'}` と `503 {ok:false, error:'something_new'}` で submit が partial（operationId、note unconfirmed）を返し、送った回数が2回。板では partial の帯で、押し直しで送らない", verifies: ["R-01"]}
	"T-02": {title: "確定の `503 unreachable`・`500 record_failed` は押し直せる refused（表の言葉）、`409 question_gone` は blocked、`409 busy` は refused、200 の outcome の分け方と `502 body null` の partial は今のまま（iss-00054 の T-10 のテストが変わらず通る）", verifies: ["R-02"]}
	"T-03": {title: "注入した時計で、意図が返らないまま intentMs が過ぎると確定を送らず refused（network）、確定が返らないまま confirmMs が過ぎると partial（送った回数2回）。既定の長さが 30000 と 60000 ミリ秒で、板が sending から抜ける", verifies: ["R-03"]}
	"T-04": {title: "確定の時間切れの後に応答（input_accepted）が遅れて届いても、submit の結果は partial のままで、送り直さない", verifies: ["F-01"]}
	"T-05": {title: "S-02 の描画の写し（1280px・390px、結果不明の帯、はみ出し 0、「Orca で開く」あり）。タスク担当が report.md に挙げ、試しの画面（`npm run trial`）を Mac の幅と 390px で開いて例外がないことを見る", verifies: ["R-01", "R-03"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実物の Orca への書き込みはしない（端末の実機の答えは iss-00054 の本人の確かめの手順のまま）。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う。タスク担当はマージしない）
	- 区切りのレビュー：なし（2手順で小さく、最終品質ゲートで全体を見る）
	- 最終品質ゲート：範囲 `3ddeb95..HEAD` の全体（`web/`、`test/`、`AGENTS.md`、要れば `README.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy、reliability-recovery（結果不明の後に送らない、時間切れ）、e2e-user-flow（結果不明の帯、390px）。second_opinion：chatgpt（統括の補足『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ記録して主のレビュアーで続ける）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "PR を戻せば、端末の承認の手段は iss-00054 の振る舞いに戻る。サーバーの守りは変えていない。"
exit:     "最終品質ゲート（`3ddeb95..HEAD`、または取り込み後の HEAD）が合格し、描画の写しが report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-18）：Opus 5.5 / medium（方針の「タスク担当 × standard」）"}
		ui: {task: "実装（S-01・S-02。画面の JavaScript とテスト、文書の1行、描画の写し。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分（画面の JavaScript）は Claude Opus 5.5、standard なので medium（方針の「実装担当（フロントエンド）× standard」）。変えるのは web/embed の画面の JavaScript だけで、サーバーの API・データの形は変えないので Codex の手順はない。provider: claude"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。standard なので1人）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-02", model: "opus", effort: "medium"}
	}
}
