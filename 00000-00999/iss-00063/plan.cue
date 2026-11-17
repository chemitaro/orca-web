package spec

// 計画（Issue）。型 specdock/v1。

goal: "2つの直しと単体のテストを1つの手順で作り、文書と試しの画面の写しを残して出す。"

// 開始のコミット：5d1353f（main、PR #62 のマージ）。worktree は iss-00063、ブランチ chemitaro/iss-00063。
// 手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない。
// 実装担当は実物の Orca に書き込みの RPC を送らない。仕様の読み方に迷ったら、直さずにタスク担当に問う。
// 実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。

steps: {
	"S-01": {
		title:    "表のセルの `\\|` と、道具の出力を文字のままにする直し（D-01、D-02）"
		text:     "対象：`web/embed/markdown.js`（parseTable の fit だけ）、`web/embed/agent-view.js`（buildChat の bubble の行と型の注記）、`web/embed/agent-dom.js`（renderChatRow の分かれ目と注記）と、`test/web/markdown.test.ts`、`test/web/agent-view.test.ts`、`test/web/agent-dom.test.ts`。ほかのファイル（CSS、agent-frame.js、markdown-dom.js、src/）は変えない。確かめ：T-01〜T-03。完了：T-01〜T-03 のテストがあり、`npm run lint`、`npm test`、`npm run build` が通る。終えたら止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-01", "R-02", "F-01", "F-02"]
		status:   "todo"
		session:  "impl"
	}
	"S-02": {
		title:    "README.md の補いと、試しの画面の写し"
		text:     "タスク担当が行う。README.md の Markdown の説明に『道具の出力は文字のまま』と『表のセルの `\\|` は `|`』を足す（AGENTS.md は役割の説明が変わらなければ変えない）。試しの orca-web（`npm run trial`、別の port と専用の settings。sendEnabled は偽のまま）の小窓で、試しのエージェント（業務中のエージェントは使わない）に `\\|` を含む表を書かせ、Mac の幅と 390px の写しを撮り、試しのエージェントを止める。確かめ：T-04。完了：report.md の Verification に写しの場所があり、`npm run lint`、`npm test`、`npm run build` が通る"
		realizes: ["R-01", "R-02"]
		after:    ["S-01"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "parseMarkdown の表：R-01 の acceptance の4つ（文字・行内のコード・強調・逆斜線2つ・見出し）が GitHub の GFM の出力と同じ木になる。表でない段落の `\\|` は今のまま `|`。今の T-01 の表のテストがそのまま通る", verifies: ["R-01"]}
	"T-02": {title: "今の XSS の表のテスト（T-02・T-05）と病的な入力のテスト（T-03）がそのまま通り、表のセルの行内のコードの中の `<script>` と `[a](javascript:…)` が `\\|` を含んでも文字のまま", verifies: ["F-01", "F-02"]}
	"T-03": {title: "buildChat が role assistant の bubble に markdown 真、role user と role tool の bubble に偽を付ける。renderChatRow が role tool の件の `**x**` を div.bubble（md でない）の文字で描き strong を作らず、options.markdown を呼ばない。assistant の件は今のまま div.bubble.md", verifies: ["R-02", "F-01"]}
	"T-04": {title: "試しの画面の写し（Mac の幅・390px）を report.md に挙げる（タスク担当）", verifies: ["R-01", "R-02"]}
}

verification: """
	S-01 で T-01〜T-03 を通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う）
	- 区切りのレビュー：なし（1手順の小さな直しで、最終品質ゲートで見る）
	- 最終品質ゲート：範囲 `5d1353f..HEAD` の全体（`web/`、`test/`、`README.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy、security-baseline（HTML を解かない、リンクの scheme）。second_opinion：chatgpt（統括の補足『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ記録して主のレビュアーで続ける）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（report.md は Git の外で SpecDock が保存する）
	"""
rollback: "PR を戻せば、今の描き方に戻る。会話の API と送信は変わらない。"
exit:     "最終品質ゲート（`5d1353f..HEAD`、または取り込み後の HEAD）が合格し、試しの画面の写しが report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-18）：Opus 5.5 / medium（方針の「タスク担当 × standard」）"}
		impl: {task: "実装（S-01。純な関数と、偽の document で確かめる分かれ目1つ。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコードは Codex GPT-6.1 Sol / medium。S-01 は解き方の純な関数と行の組み立ての純な関数と、偽の document のテストで確かめる分かれ目1つで、見た目（HTML・CSS）を変えない。方針の「実装担当（テストで確かめられる実装）× light」。Sol で失敗や見落としが記録されたときだけ GPT-6 Astra / high に上げる。Codex が chat-scratch の symlink の拒否で止まったら worker-stop して Claude Opus 5.5 / medium に切り替える（統括が了承済み）。provider: codex"}
		doc: {task: "文書と試しの画面の写し（S-02。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。試しのエージェントを立てる実機の写しもタスク担当が行う"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。light なので1人）", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-02", model: "opus", effort: "medium"}
	}
}
