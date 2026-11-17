package spec

// 計画（Issue）。型 specdock/v1。

goal: "サーバーの4件（a、e のサーバー、f、g）を Codex が、画面の4件（b、c、d、e の画面、h）を Claude が直し、試しの画面で写して出す。"

// 開始のコミット：253a1a6（main、PR #56 のマージ）。worktree は iss-00055、ブランチ chemitaro/iss-00055。
// 各手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない（録画と、呼ばれた回数を数える偽の口）。
// 実装担当は実物の Orca に書き込みの RPC を送らない。仕様の読み方に迷ったら、直さずにタスク担当に問う。
// 実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。
// 並行の iss-00054 が `web/embed/approval-view.js` と `src/send/` を触る。関数の名前と契約を変えず、変更を小さく保つ。

steps: {
	"S-01": {
		title:    "サーバー：端末の承認の付け先、答えの口の本文の上限、1組目の前の前面の読み直し、キーの組の門の止める集合（D-01、D-04 のサーバー、D-05、D-06）"
		text:     "対象：`src/orca/read-transcript.ts`、`src/server/app.ts`（answering の道の本文の上限だけ）、`src/orca/send.ts`（answerKeys だけ）、`src/send/service.ts`（#blockedFor と answerKeys の門の3か所だけ）と、`test/orca/read-transcript.test.ts`、`test/server/` の答えの API のテスト、`test/orca/send.test.ts`、`test/send/service.test.ts`。確かめ：T-01、T-02、T-03、T-04。完了：`npm run lint`、`npm test`、`npm run build` が通り、T-01〜T-04 のテストがあり、今のテストの振る舞いの主張を変えずに通す（1組目の前の前面の読みが1回増えることに合わせた、偽の口の応答の列と呼ばれた回数の期待の追加だけは許す）。実装担当 impl の最後の手順。止まって HEAD を報告する。区切りのレビュー：なし"
		realizes: ["R-01", "R-05", "R-06", "R-07", "F-01"]
		status:   "todo"
		session:  "impl"
	}
	"S-02": {
		title:    "画面：確かめの段の押せない形、確定の 5xx と時間切れ、長い答えの確かめ、カードの「Orca で開く」の高さ（D-02、D-03、D-04 の画面、D-07）"
		text:     "対象：`web/embed/approval-view.js`、`web/embed/approval-dom.js`、`web/embed/question-view.js`、`web/embed/agent.css` と、`test/web/approval-view.test.ts`、`test/web/approval-dom.test.ts`、`test/web/question-view.test.ts`（または今の質問の答えの手段のテスト）、`test/web/agent-css.test.ts`。`open-control.*`、`send-view.js` は変えない。確かめ：T-05〜T-09。完了：`node --test test/web/*.test.ts`、`npm run lint`、`npm test`、`npm run build` が通り、T-05〜T-09 のテストがあり、今のテストの振る舞いの主張を変えずに通す。描画の確かめは、実装担当が自分で起動した orca-web（一時の port、一時の settings で sendEnabled は偽のまま）とヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じる）で、幅 1280px と 390px で、カードの「Orca で開く」の高さが 44px 以上で横にはみ出さないことを見る（答えを送らない）。終えたら止まって HEAD を報告する。区切りのレビュー：なし"
		realizes: ["R-02", "R-03", "R-04", "R-05", "R-08", "F-01", "F-02"]
		after:    ["S-01"]
		status:   "todo"
		session:  "ui"
	}
	"S-03": {
		title:    "README.md と AGENTS.md の更新、試しの画面での写し（タスク担当）"
		text:     "タスク担当が行う。README.md・AGENTS.md の、変わった振る舞い（端末の承認は今のセッションだけ、確かめの段、確定の 5xx と時間切れ、答えの口の上限、キーの組の前面の読み、門）の記述を足すか直す。`npm run trial` の試しの画面（試しの orca-web と専用の settings。sendEnabled を真にするのは試しの orca-web だけ）で、カードの「Orca で開く」の高さと確かめの段の押せない形を、Mac の幅と 390px で写す（業務中のエージェントに送らない。写しに個人の情報や会話の中身を出さない）。確かめ：T-10。完了：report.md の Verification に結論と写しがあり、`npm run lint`、`npm test`、`npm run build` が通る"
		realizes: ["R-02", "R-08"]
		after:    ["S-02"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "terminalPromptFromTabs が、タブの providerSession.id が sessionId と同じときだけ3つの項目を返し、違う・ない・文字でないときは null。read の最新のページが target.sessionId で添え、違うセッションのタブでは terminalPrompt が null", verifies: ["R-01"]}
	"T-02": {title: "`/api/answer/intent`・`confirm` が、64KiB のその他を4つ持つ本文（JSON で 128KiB を超え 640KiB 以下）を 413 にせずサービスに渡し、640KiB を超える本文を 413 にする。`/api/send/*`・`/api/approval/*` は 128KiB を超える本文を今のとおり 413 にする", verifies: ["R-05"]}
	"T-03": {title: "answerKeys が、1組目の直前に前面を読み、シェルかエージェントと合わなければ terminal.send を0回で refused（not_sent、sentGroups 0）を返す。合えば今のとおり送り、組の間の sleep の回数は組の数 − 1 のまま", verifies: ["R-06", "F-01"]}
	"T-04": {title: "orchestration.requestShow の method_not_found（今の送信の照会）の後、status の answerKeys が available で、keys の意図が通る。terminal.send の method_not_found の後は answerKeys が unsupported。今の送信の門は requestShow の後も unsupported", verifies: ["R-07"]}
	"T-05": {title: "buildApprovalCard の confirm が、availability が ok でないか answerable が偽のとき disabled 真で reasonText を持ち、ok のとき disabled 偽。renderApprovalCard が「<ラベル>で答える」を disabled に、「やめる」を押せる形に描く", verifies: ["R-02"]}
	"T-06": {title: "sendIntentConfirm・createCallAnswerer：確定が 500 internal_error（と知らない識別子の 5xx）で結果不明（承認と構造化 Chat と message は unknown と operationId、keys は partial）、503 record_failed・501 unsupported・409 target_changed で今のとおり refused（keys は callRefusal の形）。意図の 5xx は今のとおり refused", verifies: ["R-03", "F-02"]}
	"T-07": {title: "注入した時計で、意図の時間切れが refused（network）、確定の時間切れが結果不明（keys は partial）になり、時間切れの後に届いた応答で結果が変わらず、writer.send がそれぞれ1回だけ呼ばれる。keys の確定の時間切れは 300 秒、ほかは 60 秒、意図は 30 秒", verifies: ["R-04", "F-01"]}
	"T-08": {title: "buildAnswers が、answers の JSON が 512KiB を超える選択（64KiB に近いその他を4つ、`\"` を多く含む）で reason answers_too_large を返し（カードがその言葉を出す）、64KiB のその他を2つ持つ選択では ok", verifies: ["R-05"]}
	"T-09": {title: "agent.css に `.question-foot .orca-open[data-size]` の `--orca-open-height: 44px` があり、open-control.css の大きさの表は変わらない（CSS を読むテスト）", verifies: ["R-08"]}
	"T-10": {title: "試しの画面で、Mac の幅と 390px、明暗で、カードの「Orca で開く」の高さが 44px 以上で横にはみ出さないこと、確かめの段で sendEnabled を偽にすると「<ラベル>で答える」が押せず理由が出ることを DOM で数え、写す（タスク担当、実機。承認のカードと確かめの段は、iss-00050 と同じく偽の会話の写し（実装担当の描画の確かめの仕組み）で出してよい。実機で出せないものは記録する）", verifies: ["R-02", "R-08"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う。タスク担当はマージしない）
	- 区切りのレビュー：なし（8件はそれぞれ小さく独立し、画面は S-01 の契約に依らない。最終品質ゲートで全体を見る）
	- 最終品質ゲート：範囲 `253a1a6..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy、security-baseline（書き込みの口の上限、同じオリジン、識別子と答えの中身を記録に出さない）、reliability-recovery（結果不明と送る前の拒みの取り違え、時間切れ、二重に送らない）、e2e-user-flow（確かめの段、390px、44px）。second_opinion：chatgpt（統括の補足『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ記録して主のレビュアーで続ける）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する）
	"""
rollback: "PR を戻せば今の振る舞いに戻る。どの変更も記録や設定の形を変えない。"
exit:     "最終品質ゲート（`253a1a6..HEAD`、または取り込み後の HEAD）が合格し、写しが report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-18）：Opus 5.5 / medium（方針の「タスク担当 × standard」）"}
		impl: {task: "実装（S-01。サーバーの直し。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコードは Codex GPT-6.1 Sol / medium。Sol で失敗や見落としが記録されたときだけ GPT-6 Astra / high に上げる。Codex が chat-scratch の symlink の拒否や確認の画面で止まったら、待たずに worker-stop して Claude Opus 5.5 / medium に切り替える（統括の了承済み）。provider: codex"}
		ui: {task: "画面の実装（S-02。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分は Claude Opus 5.5、standard なので medium（方針の「実装担当（フロントエンド）× standard」）。provider: claude"}
		doc: {task: "文書と試しの画面の写し（S-03。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。standard なので1人）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-03", model: "opus", effort: "medium"}
	}
}
