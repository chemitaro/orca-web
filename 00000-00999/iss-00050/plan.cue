package spec

// 計画（Issue）。型 specdock/v1。

goal: "会話の正規化に承認の部分を足し、構造化 Chat の承認に答えるサーバーの口を作って区切りのレビューを通し、その上に承認のカードを作り、試しのエージェントで確かめて出す。"

// 開始のコミット：3b7aece（main、PR #52 のマージ）。worktree は iss-00050、ブランチ chemitaro/iss-00050。
// 各手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない（録画と、呼ばれた回数を数える偽の口）。
// 実装担当は実物の Orca に書き込みの RPC を送らない。実物への答えは S-04 のタスク担当だけ、試しのエージェントだけ。
// 仕様の読み方に迷ったら、直さずにタスク担当に問う。実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。
// Orca v1.4.261 のソースは `.workbench/orca-src/src/`（Git の外）にある。形の根拠として読んでよい（写してコミットしない）。
// 並行の iss-00049 が `web/embed/question-view.js` の端末の手段と `src/send/` を触る。質問の契約（answerer、answererFor、/api/answer/* の意味）は変えない。

steps: {
	"S-01": {
		title:    "会話の正規化の承認の部分と、端末の待っている許可の確認の読み（D-01、D-02）"
		text:     "対象：`src/transcript/normalize.ts`、`src/orca/read-transcript.ts` と `test/transcript/normalize.test.ts`、`test/orca/read-transcript.test.ts`（必要なら `test/transcript/fixture.ts`、`test/transcript/hub.test.ts`）。確かめ：T-01、T-02、T-03。完了：`node --test test/transcript/*.test.ts test/orca/read-transcript.test.ts` と `npm run lint` が通り、T-01〜T-03 のテストがある。区切りのレビュー：なし"
		realizes: ["R-01", "F-03", "F-05"]
		status:   "todo"
		session:  "impl"
	}
	"S-02": {
		title:    "承認の答えの送る門・アダプター・サービス・HTTP の口（D-03、D-04、D-05）"
		text:     "対象：`src/orca/send-gates.ts`、`src/orca/send.ts`、`src/orca/capabilities.ts`、`src/send/approval.ts`（新）、`src/send/ticket.ts`、`src/send/journal.ts`、`src/send/service.ts`、`src/server/app.ts` と、`test/orca/send-gates.test.ts`、`test/orca/send.test.ts`、`test/orca/capabilities.test.ts`、`test/send/approval.test.ts`（新）、`test/send/service.test.ts`、`test/send/journal.test.ts`、`test/server/approval-api.test.ts`（新。または今の答えの API のテストに足す）。確かめ：T-04〜T-10。完了：`npm run lint`、`npm test`、`npm run build` が通り、T-04〜T-10 のテストがあり、今の送信と質問の答えのテストが変えずに通る。実装担当 impl の最後の手順で、区切りのレビュー CP-1 の最後の手順。止まって HEAD を報告する"
		realizes: ["R-03", "R-04", "R-05", "R-06", "F-01", "F-02", "F-03"]
		after:    ["S-01"]
		status:   "todo"
		session:  "impl"
	}
	"S-03": {
		title:    "承認のカードの部品と小窓への組み込み（D-06）"
		text:     "対象：`web/embed/approval-view.js`（新）、`web/embed/approval-dom.js`（新）、`web/embed/question-view.js`（共有の関数と言葉の表だけ。質問の契約は変えない）、`web/embed/agent-view.js`、`web/embed/agent-dom.js`、`web/embed/agent-frame.js`、`web/embed/agent.css`、`src/server/app.ts` の STATIC_FILES と、`test/web/approval-view.test.ts`（新）、`test/web/approval-dom.test.ts`（新）、`test/web/agent-view.test.ts`、`test/web/agent-css.test.ts`、今の `test/web/question-*.test.ts`（変えずに通す）。`web/embed/agent-marks*.js`、`open-control*.js` は使うだけで変えない。確かめ：T-11〜T-15。完了：`node --test test/web/*.test.ts`、`npm run lint`、`npm test`、`npm run build` が通り、T-11〜T-15 のテストがある。描画の確かめは、実装担当が自分で起動した orca-web（一時の port、一時の settings で sendEnabled は偽のまま）とヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じる）で、幅 1280px と 390px、明暗で、偽の会話の承認のカード（道具、計画、長い detail、HTML の文字、常に許可の確かめの段、答え済み、取り消し、端末）が横にはみ出さないことを見る（答えを送らない）。終えたら止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-02", "R-03", "R-04", "R-06", "R-07", "F-01", "F-04"]
		after:    ["S-02"]
		status:   "todo"
		session:  "ui"
	}
	"S-04": {
		title:    "README.md と AGENTS.md、試しのエージェントでの実機の確かめと写し、次の Issue の案（D-07）"
		text:     "タスク担当が行う。D-07 のとおり。確かめ：T-16、T-17。完了：report.md の Verification に実機の結論と写しがあり、Residual Risks に端末の許可への答えの案があり、`npm run lint`、`npm test`、`npm run build` が通る。試しのエージェントは止め、試しの画面は本人が見られるように動かしたまま報告する"
		realizes: ["R-03", "R-06", "R-07"]
		after:    ["S-03"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "構造化 Chat の approval（道具の承認で displayName・description・decisionReason・blockedPath・detail あり、計画の承認、url の subject、知らない subject、選択肢0件、答え済み（selectedOptionId が選択肢にある・ない）、取り消し、intent のない・知らない値の選択肢）が D-01 の形になり、prompt に itemId と revision、answerable と unanswerableReason が決めたとおりになる。blockedPath が detail か description に出ていれば null", verifies: ["R-01"]}
	"T-02": {title: "nativeChat の最新のページで、タブの agentStatus が blocked・waiting で interactivePrompt が approval の JSON のときだけ最後に端末の approval の件が足され、working・done・interactivePrompt が AskUserQuestion の JSON・JSON でない・tool が空・タブがない・古いページ・agentSession では足されない。応答に interactivePrompt のほかの項目が出ない。上限を超える文字は切られ truncated が付く", verifies: ["R-01", "F-05"]}
	"T-03": {title: "知らない形の approval（options が配列でない、選択肢に id・label がない、resolution の state が知らない値、revision が正の整数でない、17件以上の選択肢、detail が文字でも null でもない）は unsupported（approval）になる。question は今のまま", verifies: ["R-01", "F-03"]}
	"T-04": {title: "SendRpc が、決めた形の agentSession.respondToApproval だけを通し、余分な鍵・answers・空や 1025 字以上の optionId・形の違う envelope・正でない revision を送らずに拒む。今の terminal.send・agentSession.send・respondToQuestion の門は変わらない", verifies: ["R-05"]}
	"T-05": {title: "answerApproval が D-03 の params と指紋（決めた値。method は agentSession.respondTo:approval）を送り、resolved を submitted、cancelled と refusal を refused とその code、pending と知らない形を unknown、method_not_found を refused に分け、replayed を写す。readApproval と checkApproval が history の項目から状態を返し（answered で同じ選択肢は submitted、別の選択肢は refused resolved_by_other、selectedOptionId なしは unknown resolved_unverified、cancelled は refused、pending は unknown、項目なしは unknown question_not_found）、送らない", verifies: ["R-03", "R-05", "F-01", "F-02"]}
	"T-06": {title: "checkOption が、answerable 偽、形の誤り、選択肢にない id、allow_always・reject_always で confirmPersistent が真でないときに invalid_answer とその reason を返し、confirmPersistent 真か一度きりの選択肢で通る。digestOption が決まる", verifies: ["R-04", "R-05"]}
	"T-07": {title: "approvalIntent が、sendEnabled 偽で send_disabled、端末の宛先で not_sendable（terminal_route）、能力なしで unsupported、指紋違いで target_changed、答え済み・revision 違い・項目なしで target_changed（question_changed・question_gone）、選択肢の誤りと常に許可の未確認で invalid_answer、項目が読めない形で unknown_shape を返し、どれも書き込みの RPC を0回。通れば票と intent を返す", verifies: ["R-04", "R-05", "R-06", "F-02", "F-03"]}
	"T-08": {title: "approvalConfirm が、同じ票の2回目と送っている間の2回目を送らず、optionId 違い・確定の前に答え済みになった承認・revision 違い・選択肢の intent が変わった承認で送らず、通れば before の記録の後に respondToApproval を1回だけ送る。送信の票・質問の票・承認の票を取り違えない。before の記録を書けなければ送らない", verifies: ["R-05", "F-02"]}
	"T-09": {title: "承認の記録の行（before・after・refused）に、選択肢の id・ラベル・題・detail が入らず、digest・intent・itemId・revision が入る。check が承認の記録で checkApproval を呼び、unknown の後も送り直さない。今の送信と質問の記録の行は変わらない", verifies: ["R-05", "F-01"]}
	"T-10": {title: "HTTP：`/api/approval/intent`・`confirm` が、同じオリジンの JSON とトークンのない書き込み、余分な鍵、形の誤り（confirmPersistent が真偽でない、optionId が長すぎる）を拒み、CORS を付けず、status が approval の項目（available、reason）を返す", verifies: ["R-05", "R-06"]}
	"T-11": {title: "approval-view.js の choose が、一度きりの選択肢では送る印を、allow_always・reject_always では確かめの段（pending と persistentNote の1行）を返し、cancelPending で何も送らずに戻る。板の confirm が confirmPersistent 真で submit を1回だけ呼び、sending の間の押しを捨てる", verifies: ["R-04"]}
	"T-12": {title: "buildApprovalCard が、未回答のカード（題、道具、説明、理由、要るパス、計画、detail の下見と詳しく、選択肢と主の印）と、答え済み（intent による言葉とラベル、選択肢にない id は「答え済み」）・取り消しの閉じた形を作る。buildChat が approval の行を作る", verifies: ["R-02"]}
	"T-13": {title: "答える手段：chat の approver が意図と確定を1回ずつ送り（optionId と confirmPersistent）、unknown で帯と「確かめる」と「閉じる」を出して自動で送り直さない。sendEnabled 偽・approval.available 偽・answerable 偽・端末で、選択肢が押せず理由が出て、端末と答えられない承認は Orca で開くの印を持つ。今の質問の answerer のテストが変えずに通る", verifies: ["R-03", "R-06", "F-01"]}
	"T-14": {title: "approval-dom.js が、`<script>` や `<img onerror>` を含む題・detail・計画・ラベル・理由を文字のまま描き、innerHTML を使わず、作る要素が決めた種類だけ", verifies: ["R-02", "F-04"]}
	"T-15": {title: "agent.css の承認のカードの規則が `var(--ds-…, 既定)` を使い、detail の塊が折り返すか枠の中で送られ、確かめの段のボタンの min-height が 44px 以上（CSS を読むテスト）", verifies: ["R-07"]}
	"T-16": {title: "試しのエージェント（構造化 Chat）の承認に小窓から許可と拒否で答え、エージェントが続け（許せば操作が進み、拒めば止まる）、カードが答え済みの閉じた形になったことを確かめる。常に許可の「やめる」で何も送らないこと、sendEnabled 偽でカードが読めて押せないこと、端末の試しのエージェントの permission prompt がカードで読め答えるボタンがないこと（載らなければ記録）を見る（タスク担当、実機）", verifies: ["R-03", "R-04", "R-06"]}
	"T-17": {title: "試しの画面で、Mac の幅と 390px、明暗の写しを撮り、カードが横にはみ出さないことを DOM で数える（タスク担当、実機）", verifies: ["R-07"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実物の Orca への答えは S-04 のタスク担当だけ、試しのエージェントだけ。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う。タスク担当はマージしない）
	- 区切りのレビュー CP-1：最後の手順 S-02、範囲 `3b7aece..<S-02 の後の HEAD>`、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）を1人（standards と spec を1人で）。理由：画面（S-03）が依る会話の部分の形と承認の答えの口の契約、二重に送らないこと、常に許可のサーバーの守りが S-02 までで決まる
	- 最終品質ゲート：範囲 `3b7aece..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy、security-baseline（同じオリジン、トークン、識別子と答えの中身を記録に出さない、textContent、常に許可の守り）、reliability-recovery（二重の答え、結果不明の後に送らないこと）、e2e-user-flow（選ぶ・確かめる・やめる、390px、明暗、押せない理由）。second_opinion：chatgpt（統括の補足『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ記録して主のレビュアーで続ける）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "settings.json の `sendEnabled` を偽にすれば、承認の答えの口も拒み、カードは読むだけになる。PR を戻せば、承認は今の「表示できない（許可の確認）」に戻る。"
exit:     "CP-1 と最終品質ゲート（`3b7aece..HEAD`、または取り込み後の HEAD）が合格し、試しのエージェントでの答えの確かめと写しと次の Issue の案が report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-18）：Opus 5.5 / medium（方針の「タスク担当 × standard」）"}
		impl: {task: "実装（S-01〜S-02。会話の承認の部分と承認の答えのサーバーの口。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコード（API、サーバー、データの形）は Codex GPT-6.1 Sol / medium。Sol で失敗や見落としが記録されたときだけ GPT-6 Astra / high に上げる。Codex が chat-scratch の symlink の拒否で止まったら、待たずに worker-stop して Claude Opus 5.5 / medium に切り替える（統括の了承済み）。provider: codex"}
		ui: {task: "画面の実装（S-03。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分は Claude Opus 5.5、standard なので medium（方針の「実装担当（フロントエンド）× standard」）。provider: claude"}
		doc: {task: "文書と実機の確かめ（S-04。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実物の Orca に答える確かめは、試しのエージェントだけを、タスク担当が自分で行う"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。standard なので1人）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー CP-1（code-reviewer ×1：standards と spec）", after: "S-02", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-04", model: "opus", effort: "medium"}
	}
}
