package spec

// 計画（Issue）。型 specdock/v1。

goal: "端末の Antigravity に前面の照合で送れ、構造化 Chat の Antigravity の質問に RPC で答えられ、確かめられない端末のキーでは送らないことが、テストと実物の記録で示されている。"

// 開始のコミット：58275ea（main、PR #64 のマージ）。worktree は iss-00067、ブランチ chemitaro/iss-00067。
// 各手順は tdd で、まず失敗するテストを書いてから作る（D-02・D-03 はコードを変えないので、テストは今のコードで通ることを確かめる固定のテスト）。
// テストは Orca を起動しない（偽の口と仮名の fixture）。実装担当は実物の Orca に書き込みの RPC を送らない。
// 実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。仕様の読み方に迷ったら、直さずにタスク担当に問う。
// 並行の iss-00066 は `web/embed/agent-marks-icons.js`・`send-view.js`・`web/trial/`・README を、iss-00068 は `src/state/normalize.ts`・`test/state/` を触る。この Issue はそれらを変えない（README はタスク担当が S-02 で、PR の直前に origin/main を取り込み直して書く）。

steps: {
	"S-01": {
		title:    "前面の照合の表と、Antigravity の送信・答えの固定のテスト（D-01、D-02、D-03）"
		text:     "対象：`src/orca/send.ts`（`readForeground` の照合を表にする。D-01）と、`test/orca/send.test.ts`、`test/send/service.test.ts`（または `test/send/terminal-approval-service.test.ts`）、`test/send/keys.test.ts`、`test/transcript/normalize.test.ts`、`test/web/question-view.test.ts`。ほかの `src/`・`web/` のファイルは変えない（D-02・D-03 はテストだけ。テストで今のコードの不足が見つかったら、直さずにタスク担当に問う）。fixture は仮名（セッション、itemId の UUID、ラベル）で、実物の値を写さない。確かめ：T-01〜T-06。完了：`npm run lint`、`npm test`、`npm run build` が通り、T-01〜T-06 のテストがあり、今のテストの振る舞いの主張を変えずに通す。実装担当 impl の最後の手順。止まって HEAD を報告する。区切りのレビュー：あり（cp1、`58275ea..HEAD`）"
		realizes: ["R-01", "R-02", "F-01", "F-02", "F-03"]
		status:   "done"
		session:  "impl"
	}
	"S-02": {
		title:    "README の送信と質問の節、実物の確かめの記録（タスク担当。D-04、D-05）"
		text:     "タスク担当が行う。README.md の送信・質問・端末の許可の確認の節に Antigravity の扱いを書く（D-04）。PR の直前に origin/main を取り込み直す。試しの orca-web（別のポート、専用の settings）と統括の試しの送り先だけで、D-05 の確かめを行い、report.md に記録する（会話の中身、id、パス、アカウントを書かない）。確かめ：T-07。完了：report.md の Verification に結論があり、`npm run lint`、`npm test`、`npm run build` が通る"
		realizes: ["R-01", "R-02", "F-02"]
		after:    ["S-01"]
		status:   "done"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "readForeground：agentType antigravity で、前面 `antigravity`・`/opt/x/antigravity`・`\"antigravity\"`・`Antigravity` は matchesAgent 真、`agy`・`zsh`・`bash`・`node`・`gemini`・`claude`・`codex`・`antigravity-helper`・`antigravity2` は偽（シェルは isShell 真）。claude・codex の今の照合のテストはそのまま通り、claude で `antigravity`、codex で `antigravity` は偽", verifies: ["R-01", "F-01"]}
	"T-02": {title: "SendService：端末の Antigravity（agentType antigravity、providerSession あり）の状態と送信の意図が、前面 `antigravity` で available・票を出し、前面 `zsh` で shell_foreground、`agy` で foreground_mismatch、読めない前面で foreground_unknown を返し、拒みでは terminal.send を0回", verifies: ["R-01", "F-01"]}
	"T-03": {title: "端末の Antigravity のキーの組と承認：状態の answerKeys が agent_keys_unknown（前面が antigravity でも）、callId の答えの意図（mode keys）が agent_keys_unknown で terminal.send 0回、planKeys('antigravity') が agent_keys_unknown、approvalKey('antigravity', 'allow_once'・'reject_once') が null、端末の承認の意図（promptId）が agent_keys_unknown でキーを送らない", verifies: ["F-02"]}
	"T-04": {title: "画面：createCallAnswerer({mode: 'keys'}).availability が、状態の agentType antigravity・answerKeys {available: false, reason: 'agent_keys_unknown'} の keys の問いで ok 偽・理由あり・open 真を返し、submit を呼ばせない（writer.send 0回）", verifies: ["F-02"]}
	"T-05": {title: "構造化 Chat の Antigravity の journal の質問（仮名の fixture。D-03 の形）：正規化が source chat・answerVia rpc・prompt{itemId, revision} の question を作り（単一選択、複数選択、allowOther 真）、答えた件は state answered と answers になる。answerIntent・answerConfirm が agentSession.respondToQuestion を1回、決めた形の answers（単一選択、複数選択＋その他）で送り、resolved を submitted にする", verifies: ["R-02"]}
	"T-06": {title: "読めない形の Antigravity の journal の質問（questions の要素が問いの形でない等）で、正規化が question を作らず、answerIntent が unknown_shape で respondToQuestion を0回。問いに合わない answers（知らない optionId、単一選択に2つ）は今の invalid_answer で0回", verifies: ["F-03"]}
	"T-07": {title: "実物（タスク担当）：試しの orca-web で、構造化 Chat の Antigravity に送信と選択の問いの答えが届き、作業が続く。端末の Antigravity の前面の名前が antigravity。providerSession の付く端末の試しの送り先があれば、送信の状態が available で短い文が届く（なければ未確認として記録）", verifies: ["R-01", "R-02"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う。タスク担当はマージしない）
	- 区切りのレビュー：cp1。最後の手順 S-01、範囲 `58275ea..<S-01 の HEAD>`、レビュアー code-reviewer（Opus 5.5 / medium、方針の strict）。理由：strict で、端末に送る照合を変える唯一のコードの変更なので、文書と実物の確かめの前に見る
	- 最終品質ゲート：範囲 `58275ea..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy、security-baseline（照合を緩めない、推測で送らない、記録に id や中身を出さない）、reliability-recovery（拒みで送らない、二重に送らない）。second_opinion：chatgpt（統括の補足『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ方針どおり GPT-6.2 Astra / high、それも取れなければ記録して主のレビュアーで続ける）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する）
	"""
rollback: "PR を戻せば今の振る舞いに戻る（端末の Antigravity は foreground_mismatch で送れなくなる）。記録や設定の形は変えない。"
exit:     "最終品質ゲート（`58275ea..HEAD`、または取り込み後の HEAD）が合格し、実物の確かめが report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "high", rationale: "統括の依頼書（2026-11-20）：Opus 5.5 / high（方針の「タスク担当 × strict」）"}
		impl: {task: "実装（S-01。サーバーの照合とテスト。Codex の実装担当、Orca の worker）", model: "gpt-6.2-sol", effort: "medium", rationale: "本人の指示（2026-11-13、方針の表は 2026-11-19 から GPT-6.2 Sol）と統括の依頼書：テストで確かめられるコードは Codex GPT-6.2 Sol / medium。Sol で失敗や見落としが記録されたときだけ GPT-6.2 Astra / high に上げる。Codex が確認の画面や chat-scratch の symlink の拒否で止まったら、待たずに worker-stop して Claude Opus 5.5 / high に切り替える（統括の了承済み）。provider: codex"}
		doc: {task: "文書と実物の確かめ（S-02。タスク担当が自分で行う）", model: "opus", effort: "high", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実物の確かめは統括の試しの送り先を使うタスク担当の役"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。strict なので2人目に ChatGPT）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー（code-reviewer）", after: "S-01", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-02", model: "opus", effort: "high"}
	}
}
