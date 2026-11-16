package spec

// 計画（Issue）。型 specdock/v1。

goal: "正規化の1か所で構造化 Chat の1人をまとめ、古い id の埋め込みを転送で受け、実物の要約の件数で直す前と後を残す。"

// 開始のコミット：373a2c7（main、PR #38 のマージ）。worktree は iss-00039、ブランチ chemitaro/iss-00039。
// 実装担当は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない。
// 実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。読み方に迷ったら直さずにタスク担当に問う。送信と Orca で開く操作を実物で呼ばない。
// 変えてよいファイル：S-01 は src/orca/read-state.ts、src/state/normalize.ts、test/ の下。S-02 は src/server/app.ts、test/ の下。ほかの src/ と web/ は変えない。

steps: {
	"S-01": {
		title:    "タブの sessionId、Orca の式の paneKey、正規化のまとめ、テスト（D-01〜D-03）"
		text:     "対象：`src/orca/read-state.ts`（OrcaTab の sessionId と pickTab だけ）、`src/state/normalize.ts`、`test/` の下（状態の正規化、要約、受け箱のテスト。既存の fixture に構造化 Chat のタブと一致する ps の行を足すか、新しいテストの中で取得元を組む）。確かめ：T-01、T-02、T-03、T-04、T-05。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットする"
		realizes: ["R-01", "R-02", "R-03", "F-01", "F-02"]
		status:   "todo"
		session:  "impl"
	}
	"S-02": {
		title:    "古い id の埋め込みの転送と、古い id の送信の意図のテスト（D-04、D-05）"
		text:     "対象：`src/server/app.ts`（/embed/agent の転送だけ）、`test/` の下。確かめ：T-06、T-07。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットして止まり HEAD を報告する"
		realizes: ["R-04", "F-02"]
		after:    ["S-01"]
		status:   "todo"
		session:  "impl"
	}
	"S-03": {
		title:    "実物の件数（直す前と後）、README.md と AGENTS.md、記録"
		text:     "タスク担当が行う。常駐の orca-web（127.0.0.1:8791、直す前）と、この worktree の orca-web を一時の port（127.0.0.1 だけ、`ORCA_WEB_TAILSCALE_IP` なし、設定と送信の記録は .workbench の下）で起動したもの（直した後）の `GET /api/worktrees/summary` を続けて読み、worktree ごとの total と `structured-agent-session-` の id の数を比べる。古い id の `/embed/agent` が 302 で正の id に移ることも一時の orca-web で確かめる。送らない、Orca で開くを押さない。識別子、パス、IP、ユーザー名は記録に出さず、worktree は伏せた名前か件数で書く。一時の orca-web は確かめの後に止める。README.md と AGENTS.md を D-06 のとおり直す。確かめ：T-08、T-09。完了：report.md に件数の表と結論があり、`npm run lint`、`npm test`、`npm run build` が通る"
		realizes: ["R-03", "R-04"]
		after:    ["S-02"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "structuredPaneKey が、固定の sessionId（例 `9bb05770-52fd-4fdf-80f7-020aca01d9b4` と `claude_4d9cd46a_9d3d_4595_b792_dfabe6a80299` のような形の2つ）で、Orca の式を手で計算して書いた期待の文字列と一致する（normalize を通して、まとめが起きることで確かめてよい）", verifies: ["R-01", "F-01"]}
	"T-02": {title: "構造化 Chat のタブ1つと一致する ps の行1つで、エージェントが1つ（id `chat:<タブの id>`、kind chat-tab、paneKey は ps の paneKey、parentPaneKey は ps の値で取得元 worktreePs）。タブの id が `agent-chat-tab-v1-…` の形でも sessionId でまとまる", verifies: ["R-01", "R-02"]}
	"T-03": {title: "まとめない場合：ps の行が別の worktree、leaf が1文字違う、タブに sessionId がない、同じ sessionId のタブが2つ（最初だけまとまり、2つ目は paneKey null の chat-tab、untabbed なし）、tabs の取得元の失敗（untabbed のまま）、ps の取得元の失敗（chat-tab のまま）", verifies: ["R-01", "F-01", "F-02"]}
	"T-04": {title: "値の補い：タブに chatStatus がないとき state・workingMode・stateStartedAt が ps の値（取得元 worktreePs）、あるときタブの値。タブに題名がないとき ps の taskTitle", verifies: ["R-02"]}
	"T-05": {title: "まとめた状態の文書から、buildWorktreeSummary の worktree の counts.total が 1・agents が1つ、buildInbox のそのエージェントの行が1つ、端末の worker の詳細（web/embed/agent-view.js の buildDetail）の親のリンクが `chat:` の id。既存のテスト（端末だけの状態の文書の期待値）が変えずに通る", verifies: ["R-01", "R-02", "R-03"]}
	"T-06": {title: "createApp に偽の poller を与え、`/embed/agent?id=<まとめた paneKey>&theme=dark` が 302・location `/embed/agent?id=chat%3A…&theme=dark`・cache-control no-store。一致しない古い形の id、ほかの id、snapshot の例外、poller なしは 200 の画面。HEAD も同じ。Host の守りの拒否は今のまま", verifies: ["R-04", "F-02"]}
	"T-07": {title: "まとめた状態の写しで、古い id（ps の paneKey）の送信の意図が送らずに `agent_not_found` を返す（RPC の書き込みが呼ばれない）", verifies: ["R-04"]}
	"T-08": {title: "実物：常駐（直す前）と一時の orca-web（直した後）の要約で、重複していた worktree の total が 2→1、`structured-agent-session-` の id が n→0、ほかの worktree の total が同じ。古い id の /embed/agent が 302（タスク担当、読むだけ）", verifies: ["R-03", "R-04"]}
	"T-09": {title: "README.md と AGENTS.md に、構造化 Chat のまとめと古い id の転送が書いてある（rg）", verifies: ["R-01", "R-04"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門：
	- merge：owner（統括が行う。タスク担当はマージしない）
	- 区切りのレビュー：なし（S-01・S-02 は同じ実装担当が続けて行い、final-quality-gate で全体を見る）
	- final-quality-gate：S-03 の後、範囲 `373a2c7..HEAD`。レビュアー quality-gate-reviewer（Claude Opus 5.5 / medium）。観点 functional-correctness、requirements-closure、test-adequacy、security-baseline（転送が開いたリダイレクトにならない：location は同じオリジンの `/embed/agent?` だけ。CORS・CSP を広げない。送信の宛先を別の相手に解かない）。second_opinion none。test_commands：`npm run lint`、`npm test`、`npm run build`。record_paths：`spec-dock/initiatives/00000-00999/iss-00039/`（Git の外）
	"""

rollback: "PR を戻す（状態の文書の版は同じなので、戻しても読む側は壊れない）。"

exit: "PR を開き、CI が通り、統括に PR と合格のコミットと closure.md を報告した状態。"

execution: {
	sessions: {
		spec: {task: "仕様化とタスク担当", model: "claude-opus-5-5", effort: "medium", rationale: "統括が方針の『タスク担当 × standard』から選んだ（事実の記録）"}
		impl: {task: "S-01・S-02 正規化のまとめ・転送・テスト", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（テストで確かめられるので Codex GPT-6.1 Sol / medium）。provider codex。chat-scratch の symlink の拒否で止まったら worker-stop し Claude Opus 5.5 / medium に切り替える（統括が了承済み。逸脱として記録）"}
		doc:  {task: "S-03 実物の件数と文書", model: "claude-opus-5-5", effort: "medium", rationale: "実物の確かめと文書はタスク担当が行う（文書の手順の同じセッションの例外）"}
	}
	// 仕様レビュー（spec-reviewer、Claude Opus 5.5 / medium）は実装の前に行う。
	reviews: final: {role: "final-quality-gate", after: "S-03", model: "claude-opus-5-5", effort: "medium"}
}
