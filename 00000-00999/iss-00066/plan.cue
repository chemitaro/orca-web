package spec

// 計画（Issue）。型 specdock/v1。

goal: "種類の表と送信の欄の名前と試しの見本を1つの手順で作り、README と試しの画面の写しを残して出す。"

// 開始のコミット：58275ea（main、PR #64 のマージ）。worktree は iss-00066、ブランチ chemitaro/iss-00066。
// 手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない。
// 実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。仕様の読み方に迷ったら、直さずにタスク担当に問う。

steps: {
	"S-01": {
		title:    "種類の表、送信の欄の名前、試しの見本（D-01、D-02、D-03 の見本）"
		text:     "対象：`web/embed/agent-marks-icons.js`、`web/embed/send-view.js`、`web/trial/trial-view.js` と、`test/web/agent-marks-view.test.ts`、`test/web/send-view.test.ts`、`test/web/trial-view.test.ts`（必要なら `test/web/agent-marks-dom.test.ts`）。ほかのファイル（CSS、README、src/）は変えない。Gemini の d は stablyai/orca の 5e7ceb61eb028e3d62a6664ebfba8adfb60ad8e8 の `src/renderer/src/components/status-bar/accounts/provider-icons.tsx` の `GeminiIcon` の `star` から一字も変えずに写す（`gh api` で取れる）。Antigravity の d は同じコミットの `src/shared/agent-icons/antigravity.png` の輪郭を写し、ブラウザー（素の HTML に PNG と svg を重ねる一時のページ。.workbench に置き、コミットしない）で形を確かめる。確かめ：T-01〜T-04。完了：T-01〜T-04 のテストがあり、`npm run lint`、`npm test`、`npm run build` が通る。終えたら止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-01", "R-02", "F-01"]
		status:   "done"
		session:  "impl"
	}
	"S-02": {
		title:    "README の更新と、試しの画面の写し"
		text:     "タスク担当が行う。README の稼働の印の節の種類のアイコンと出どころの行に Antigravity と Gemini を足す。`npm run trial` の試しの画面（試しの orca-web は別の port と専用の settings、sendEnabled は偽のまま）で、状態の見本の Antigravity と Gemini の印を、幅 1280 と 390、明と暗で写し、report.md に挙げる。確かめ：T-05。完了：report.md の Verification に写しがあり、`npm run lint`、`npm test`、`npm run build` が通る"
		realizes: ["R-01"]
		after:    ["S-01"]
		status:   "done"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "iconKey：`antigravity` → `antigravity`、`gemini` → `gemini`、今の claude・claude-agent-teams・codex・none の振り分けは今のまま、`opencode` と 42 は `other`。AGENT_ICONS の antigravity・gemini に label（Antigravity・Gemini）、viewBox、空でない paths（各 d が文字、fill が単色の値）があり、Gemini の d が Orca の star と同じ文字", verifies: ["R-01", "F-01"]}
	"T-02": {title: "buildMarks（合成の要約）で、Antigravity と Gemini の印の icon が表の値になり、aria-label と title が『Antigravity、』『Gemini、』で始まる。種類 `opencode` の印は今のまま other", verifies: ["R-01", "F-01"]}
	"T-03": {title: "placeholder：antigravity は『Antigravity に送る（Enter で送信、Shift+Enter で改行）』、gemini は touchPrimary で『Gemini に送る』、Claude・Codex は今のまま、`opencode` は『opencode に送る』", verifies: ["R-02", "F-01"]}
	"T-04": {title: "stateSamples が working・monitoring・done・antigravity（waiting）・gemini（working）の5つを返し、詳細を持たず、印がそれぞれの種類のアイコンになる", verifies: ["R-01"]}
	"T-05": {title: "試しの画面の写し（1280・390、明・暗）を report.md に挙げる（タスク担当）", verifies: ["R-01"]}
}

verification: """
	S-01 で T-01〜T-04 を通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う）
	- 区切りのレビュー：なし（1手順の小さな変更で、最終品質ゲートで見る）
	- 最終品質ゲート：範囲 `58275ea..HEAD` の全体（`web/`、`test/`、`README.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy、security-baseline（DOM を createElementNS で作る、出どころとライセンスの注）。second_opinion：chatgpt（統括の依頼書『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ記録して方針どおり）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（report.md は Git の外で SpecDock が保存する）
	"""
rollback: "PR を戻せば、Antigravity と Gemini の印は中立の丸に、送信の欄の名前は agentType の文字に戻る。"
exit:     "最終品質ゲート（`58275ea..HEAD`、または取り込み後の HEAD）が合格し、試しの画面の写しが report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-20）：Opus 5.5 / medium（方針の「タスク担当 × standard」）"}
		impl: {task: "実装（S-01。部品の表と画面の JS、Claude の実装担当、Orca の worker）", model: "opus", effort: "medium", rationale: "統括の依頼書と本人の指示（2026-11-13）：画面と一体の部分（画面の JavaScript、部品の表）は Claude Opus 5.5、standard は medium。方針の「実装担当（フロントエンドの設計と実装）× standard」。PNG の輪郭を写してブラウザーで確かめる見た目の作業を含む。provider: claude"}
		doc: {task: "文書と試しの画面の写し（S-02。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。試しの画面の写しもタスク担当が行う"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-02", model: "opus", effort: "medium"}
	}
}
