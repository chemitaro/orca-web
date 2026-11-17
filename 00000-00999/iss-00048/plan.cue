package spec

// 計画（Issue）。型 specdock/v1。

goal: "会話の正規化に質問の部分を足し、構造化 Chat の質問に答えるサーバーの口を作って区切りのレビューを通し、その上に質問のカードを作り、試しのエージェントで確かめて出す。"

// 開始のコミット：27b01fe（main、PR #46 のマージ）。worktree は iss-00048、ブランチ chemitaro/iss-00048。
// 各手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない（録画と、呼ばれた回数を数える偽の口）。
// 実装担当は実物の Orca に書き込みの RPC を送らない。実物への答えは S-04 のタスク担当だけ、試しのエージェントだけ。
// 仕様の読み方に迷ったら、直さずにタスク担当に問う。実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。
// Orca v1.4.261 のソースは `.workbench/orca-src/src/`（Git の外）にある。形の根拠として読んでよい（写してコミットしない）。

steps: {
	"S-01": {
		title:    "会話の正規化の質問の部分（D-01）"
		text:     "対象：`src/transcript/normalize.ts` と `test/transcript/normalize.test.ts`（必要なら `test/transcript/fixture.ts`）。確かめ：T-01、T-02、T-03。完了：`node --test test/transcript/*.test.ts` と `npm run lint` が通り、T-01〜T-03 のテストがある。区切りのレビュー：なし"
		realizes: ["R-01", "F-03"]
		status:   "done"
		session:  "impl"
	}
	"S-02": {
		title:    "答えの送る門・アダプター・サービス・HTTP の口（D-02、D-03、D-04）"
		text:     "対象：`src/orca/send-gates.ts`、`src/orca/send.ts`、`src/orca/capabilities.ts`、`src/send/answer.ts`（新）、`src/send/ticket.ts`、`src/send/journal.ts`、`src/send/service.ts`、`src/send/model.ts`、`src/server/app.ts` と、`test/orca/send-gates.test.ts`、`test/orca/send.test.ts`、`test/orca/capabilities.test.ts`、`test/send/answer.test.ts`（新）、`test/send/service.test.ts`、`test/send/journal.test.ts`、`test/server/send-api.test.ts`（または `test/server/answer-api.test.ts`）。確かめ：T-04〜T-10。完了：`npm run lint`、`npm test`、`npm run build` が通り、T-04〜T-10 のテストがあり、今の送信のテストが変えずに通る。実装担当 impl の最後の手順で、区切りのレビュー CP-1 の最後の手順。止まって HEAD を報告する"
		realizes: ["R-03", "R-04", "R-05", "F-01", "F-02", "F-03", "F-04"]
		after:    ["S-01"]
		status:   "done"
		session:  "impl"
	}
	"S-03": {
		title:    "質問のカードの部品と小窓への組み込み（D-05）"
		text:     "対象：`web/embed/question-view.js`（新）、`web/embed/question-dom.js`（新）、`web/embed/agent-view.js`、`web/embed/agent-dom.js`、`web/embed/agent-frame.js`、`web/embed/agent.css`、`src/server/app.ts` の STATIC_FILES と、`test/web/question-view.test.ts`（新）、`test/web/question-dom.test.ts`（新）、`test/web/agent-view.test.ts`、`test/web/agent-css.test.ts`。`web/embed/agent-marks*.js`、`open-control*.js` は使うだけで変えない。確かめ：T-11〜T-15。完了：`node --test test/web/*.test.ts`、`npm run lint`、`npm test`、`npm run build` が通り、T-11〜T-15 のテストがある。描画の確かめは、実装担当が自分で起動した orca-web（一時の port、一時の settings で sendEnabled は偽のまま）とヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じる）で、幅 1280px と 390px、明暗で、録画か偽の会話のカードが横にはみ出さないことを見る（答えを送らない）。終えたら止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-02", "R-03", "R-05", "R-06", "F-01", "F-04"]
		after:    ["S-02"]
		status:   "done"
		session:  "ui"
	}
	"S-04": {
		title:    "README.md と AGENTS.md、試しのエージェントでの実機の確かめと写し（D-06）"
		text:     "タスク担当が行う。D-06 のとおり。確かめ：T-16、T-17。完了：report.md の Verification に実機の結論と写しがあり、`npm run lint`、`npm test`、`npm run build` が通る。試しのエージェントは止め、試しの画面は本人が見られるように動かしたまま報告する"
		realizes: ["R-03", "R-05", "R-06"]
		after:    ["S-03"]
		status:   "done"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "構造化 Chat の question（1問で freeTextQuestionId あり・なし、questions の複数問、複数選択、answers のある答え済み、answers がなく selectedOptionId が選択肢の id・question-group: の JSON・`<id>:<文>` の答え済み、取り消し）が D-01 の形になり、prompt に itemId と revision が入る", verifies: ["R-01"]}
	"T-02": {title: "端末の tool-call の AskUserQuestion（入力が物と JSON の文字）、request_user_input が question の部分になり、id が番号の文字、state が pending。入力が読めない・failed の呼び出し・request_user_input_async・ほかの名前はツールの呼び出しのまま。上限を超える文字は切られ truncated が付く", verifies: ["R-01"]}
	"T-03": {title: "知らない形の question（questions が配列でない、選択肢に id がない、resolution の state が知らない値、revision が正の整数でない）は unsupported（question）になり、approval は今のまま unsupported（approval）", verifies: ["R-01", "F-03"]}
	"T-04": {title: "SendRpc が、決めた形の agentSession.respondToQuestion だけを通し、余分な鍵・optionId・空の answers・5件以上・65件以上の optionIds・64KiB を超える other・形の違う envelope を送らずに拒む。今の terminal.send・agentSession.send の門は変わらない", verifies: ["R-04"]}
	"T-05": {title: "answerChat が D-02 の params と指紋（決めた値）を送り、classifyAnswer が resolved を submitted、cancelled と refusal を refused とその code、pending と知らない形を unknown、method_not_found を refused に分け、replayed を写す。readQuestion と checkAnswer が history の項目から状態を返し（answered で記録の digest と同じ答え（4,000 字を超えるその他の文と、数えない other を含む答えでも）は submitted、違う答えは refused resolved_by_other、解けない答えは unknown resolved_unverified）、送らない", verifies: ["R-03", "R-04", "F-01", "F-02"]}
	"T-06": {title: "checkAnswers が、Orca の isValidAgentSessionQuestionAnswers と同じ条件（全部の問い、重なり、出された選択肢、allowOther、otherAllowsEmpty、単一はちょうど1つ、複数は1つ以上）と、other の制御文字と 64KiB の上限を確かめ、digest が鍵の順によらず決まる", verifies: ["R-03", "F-04"]}
	"T-07": {title: "answerIntent が、sendEnabled 偽で send_disabled、端末の宛先で not_sendable（terminal_route）、能力なしで unsupported、指紋違いで target_changed、答え済み・revision 違い・項目なしで target_changed（question_changed・question_gone）、答えの誤りで invalid_answer、項目が読めない形で unknown_shape（F-03）を返し、どれも書き込みの RPC を0回。通れば票を返す", verifies: ["R-04", "R-05", "F-02", "F-03"]}
	"T-08": {title: "answerConfirm が、同じ票の2回目と送っている間の2回目を送らず、答えの digest 違い・確定の前に答え済みになった質問・revision 違いで送らず、通れば before の記録の後に respondToQuestion を1回だけ送り、送信の票と答えの票を取り違えない。before の記録を書けなければ送らない", verifies: ["R-04", "F-02"]}
	"T-09": {title: "答えの記録の行（before・after・refused）に、選択肢の id・ラベル・その他の文が入らず、digest・questionCount・itemId・revision が入る。check が答えの記録で checkAnswer を呼び、unknown の後も送り直さない。今の送信の記録の行は変わらない", verifies: ["R-04", "F-01"]}
	"T-10": {title: "HTTP：`/api/answer/intent`・`confirm` が、同じオリジンの JSON とトークンのない書き込み、余分な鍵、形の誤りを拒み、CORS を付けず、status が answer の項目（available、reason）を返す", verifies: ["R-04", "R-05"]}
	"T-11": {title: "question-view.js の選択（単一の入れ替えと other の排他、複数の入れ外し、その他を選ぶ・外す、otherAllowsEmpty の問いの空の答えは、その他を選んだときだけ数える）と buildAnswers が、サーバーの checkAnswers と同じ条件で送れるかを決める", verifies: ["R-03"]}
	"T-12": {title: "buildQuestionCard が、未回答のカード（見出し、問い、選択肢と説明、複数の印、その他の欄、送るボタン）と、答え済み・取り消しの閉じた形（answerSummary）を作り、端末の question は結びついたツールの結果で答え済みになる。buildChat が question の行を作り、結果が先でも後でも結びつく", verifies: ["R-02"]}
	"T-13": {title: "答える手段：chat の answerer が意図と確定を1回ずつ送り、sending の間の押しを捨て、unknown で帯と「確かめる」（操作の ID の照会）と「閉じる」を出して自動で送り直さない。sendEnabled 偽・answer.available 偽・端末で、選択肢と送るボタンが押せず理由が出て、端末は Orca で開くの印を持つ。answererFor の差し替えで別の手段を使える", verifies: ["R-03", "R-05", "F-01"]}
	"T-14": {title: "question-dom.js が、`<script>` や `<img onerror>` を含む問い・ラベル・理由を文字のまま描き、innerHTML を使わず、作る要素が決めた種類だけ", verifies: ["R-02", "F-04"]}
	"T-15": {title: "agent.css のカードの規則が `var(--ds-…, 既定)` を使い、選択肢の min-height が 44px 以上で、折り返しの規則がある（CSS を読むテスト）", verifies: ["R-06"]}
	"T-16": {title: "試しのエージェント（構造化 Chat）に質問を出させ、小窓から答え、エージェントが答えを受け取って続けたことと、カードが答え済みの閉じた形になったことを確かめる。sendEnabled 偽でカードが読めて押せないことを見る（タスク担当、実機）", verifies: ["R-03", "R-05"]}
	"T-17": {title: "試しの画面で、Mac の幅と 390px、明暗の写しを撮り、カードが横にはみ出さないことを DOM で数える（タスク担当、実機）", verifies: ["R-06"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実物の Orca への答えは S-04 のタスク担当だけ、試しのエージェントだけ。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う。タスク担当はマージしない）
	- 区切りのレビュー CP-1：最後の手順 S-02、範囲 `27b01fe..<S-02 の後の HEAD>`、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）を1人（standards と spec を1人で）。理由：画面（S-03）が依る会話の部分の形と答えの口の契約、二重に送らないことが S-02 までで決まる
	- 最終品質ゲート：範囲 `27b01fe..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy に、security-baseline（同じオリジン、トークン、識別子と答えの中身を記録に出さない、textContent）と、concurrency-idempotency（二重の答え、結果不明の後に送らないこと）と、ui-interaction（選択と排他、390px、明暗、押せない理由）を足す。second_opinion：chatgpt（統括の補足『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ記録して主のレビュアーで続ける）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "settings.json の `sendEnabled` を偽にすれば、答えの口も拒み、カードは読むだけになる。PR を戻せば、質問は今の「表示できない（質問）」に戻る。"
exit:     "CP-1 と最終品質ゲート（`27b01fe..HEAD`、または取り込み後の HEAD）が合格し、試しのエージェントでの答えの確かめと写しが report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-18）：Opus 5.5 / medium（方針の「タスク担当 × standard」）"}
		impl: {task: "実装（S-01〜S-02。会話の質問の部分と答えのサーバーの口。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコード（API、サーバー、データの形）は Codex GPT-6.1 Sol / medium。Sol で失敗や見落としが記録されたときだけ GPT-6 Astra / high に上げる。provider: codex"}
		ui: {task: "画面の実装（S-03。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分は Claude Opus 5.5、standard なので medium（方針の「実装担当（フロントエンド）× standard」）。provider: claude"}
		doc: {task: "文書と実機の確かめ（S-04。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実物の Orca に答える確かめは、試しのエージェントだけを、タスク担当が自分で行う"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。standard なので1人）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー CP-1（code-reviewer ×1：standards と spec）", after: "S-02", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-04", model: "opus", effort: "medium"}
	}
}
