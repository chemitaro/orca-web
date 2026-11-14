package spec

// 計画（Issue）。型 specdock/v1。

goal: "リンクを作る1つの関数と印の表とテストを先に作り、実物の画面で新しいタブで開くことを写しで残し、文書を直す。"

// 開始のコミット：3d547c1（main、PR #36 のマージ）。worktree は iss-00037、ブランチ chemitaro/iss-00037。
// 実装担当は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない。
// 実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。読み方に迷ったら直さずにタスク担当に問う。送信と Orca で開く操作を実物で呼ばない。

steps: {
	"S-01": {
		title:    "新しいタブのリンクの関数、印の表、CSS、テスト（D-01〜D-04）"
		text:     "対象：`web/embed/agent-dom.js`、`web/embed/agent-marks-icons.js`（LINK_ICONS と出どころの1行だけを足す）、`web/embed/agent-marks.js`（再輸出に LINK_ICONS を足すだけ）、`web/embed/agent.css`（.vh と a.newtab .newtab-icon だけ）、`test/web/` のテスト。確かめ：T-01、T-02、T-03、T-04。完了：`npm run lint`、`npm test`、`npm run build` が通る。ほかのファイルは触らない。終えたらコミットして止まり HEAD を報告する"
		realizes: ["R-01", "R-02", "R-03", "F-01"]
		status:   "done"
		session:  "impl"
	}
	"S-02": {
		title:    "実物の画面の写し、README.md と AGENTS.md、記録"
		text:     "タスク担当が行う。この worktree の orca-web を一時の port（`npm run trial` か一時の起動）で読むだけで動かし、ヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じる）で、試しの画面の iframe の中の `/embed/agent` の詳細を開き、親か子のリンクの target・rel・印を数え、押して新しい target が開き元の iframe の URL が変わらないことを確かめ、明暗の写しを Scope の artifacts に置き report.md に書く。送らない、Orca で開くを押さない。README.md の『エージェントの詳細とチャット』の節と AGENTS.md の web/embed/agent の説明に1行足す。確かめ：T-05、T-06。完了：report.md に写しと結論があり、`npm run lint`、`npm test`、`npm run build` が通る"
		realizes: ["R-01", "R-02"]
		after:    ["S-01"]
		status:   "done"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "renderDetail が、親・子2つ・PR のある詳細で、すべての a を target _blank・rel noopener noreferrer・title「新しいタブで開く」で描き、href が与えたまま、印の svg（aria-hidden、LINK_ICONS の d）と目に見えない「（新しいタブで開く）」を持ち、危ない文字を文字のまま入れる（偽の document）", verifies: ["R-01", "R-02", "F-01"]}
	"T-02": {title: "`/embed/agent` が読むスクリプトに _self・_parent・_top・location への代入・location.assign・location.replace・window.open がなく、agent-dom.js で a を作る場所が newTabLink の1か所だけ（ソースを読む）", verifies: ["R-01"]}
	"T-03": {title: "LINK_ICONS.external の d・viewBox・線の属性が SpecDock の ICONS.external と同じで、出どころの1行があり、agent.css に .vh と .newtab-icon があり新しい色（# の色や rgb）を足していない（ファイルを読む）", verifies: ["R-02"]}
	"T-04": {title: "既存のテスト（受け箱、Run、状態、送る欄、開く部品、サーバー）が変えずに通る（npm test）", verifies: ["R-03"]}
	"T-05": {title: "実物の画面で、親と子のリンクが _blank・noopener noreferrer・印つきで、押すと新しい target が開き元の iframe の URL が変わらない。明暗の写し（タスク担当、読むだけ）", verifies: ["R-01", "R-02"]}
	"T-06": {title: "README.md と AGENTS.md に、/embed/agent の中のリンクは新しいタブで開くことが書いてある（rg）", verifies: ["R-01"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門：
	- merge：owner（統括が行う。タスク担当はマージしない）
	- 区切りのレビュー：なし
	- final-quality-gate：S-02 の後、範囲 `3d547c1..HEAD`。レビュアー quality-gate-reviewer（Claude Opus 5.5 / medium）。観点 functional-correctness、requirements-closure、test-adequacy、security-baseline（textContent、noopener、CSP と CORS を広げない）。second_opinion none。test_commands：`npm run lint`、`npm test`、`npm run build`。record_paths：`spec-dock/initiatives/00000-00999/iss-00037/`（Git の外）
	"""

exit: "PR を開き、CI が通り、統括に PR と合格のコミットと closure.md を報告した状態。"

execution: {
	sessions: {
		spec: {task: "仕様化とタスク担当", model: "claude-opus-5-5", effort: "medium", rationale: "統括が方針の『タスク担当 × standard』から選んだ（事実の記録）"}
		impl: {task: "S-01 リンクの関数・印・CSS・テスト", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（テストで確かめられるので Codex GPT-6.1 Sol / medium）。provider codex"}
		doc:  {task: "S-02 写しと文書", model: "claude-opus-5-5", effort: "medium", rationale: "実物の画面の確かめと文書はタスク担当が行う（文書の手順の同じセッションの例外）"}
	}
	// 仕様レビュー（spec-reviewer、Claude Opus 5.5 / medium）は実装の前に行う。
	reviews: final: {role: "final-quality-gate", after: "S-02", model: "claude-opus-5-5", effort: "medium"}
}
