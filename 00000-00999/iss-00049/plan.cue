package spec

// 計画（Issue）。型 specdock/v1。

goal: "会話の正規化に答え方と後の発言の質問を足し、Orca と同じキーの列を作る純な関数と、確かめてから1組ずつ送るサーバーの口を作って区切りのレビューを通し、その上にカードの手段を差し替え、試しのエージェントで確かめて出す。"

// 開始のコミット：3b7aece（main、PR #52 のマージ）。worktree は iss-00049、ブランチ chemitaro/iss-00049。
// 各手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない（録画と、呼ばれた回数を数える偽の口、偽の sleep）。
// 実装担当は実物の Orca に書き込みの RPC を送らない。実物への答えは S-04 のタスク担当だけ、試しのエージェントだけ。
// 仕様の読み方に迷ったら、直さずにタスク担当に問う。実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。
// Orca v1.4.261 のソースは `.workbench/orca-src/`（Git の外。worktree の根の .workbench）にある。列と値の根拠として読んでよい（写すのは関数の考え方と値だけで、ファイルをコミットしない）。
// Orca のテスト `src/shared/native-chat/input/questions/native-chat-ask-answer.test.ts` などの例を、同じ値のテストとして写してよい。

steps: {
	"S-01": {
		title:    "会話の正規化の答え方と後の発言の質問、キーの列と答えの発言、会話の中の質問の状態（D-01、D-02、D-03）"
		text:     "対象：`src/transcript/normalize.ts`、`src/send/keys.ts`（新）、`src/send/question-state.ts`（新）、`src/send/target.ts`（terminalPromptOf）と、`test/transcript/normalize.test.ts`、`test/send/keys.test.ts`（新）、`test/send/question-state.test.ts`（新）、`test/send/target.test.ts`。確かめ：T-01〜T-05。完了：`node --test test/transcript/*.test.ts test/send/*.test.ts` と `npm run lint` が通り、T-01〜T-05 のテストがある。区切りのレビュー：なし"
		realizes: ["R-01", "R-02", "R-05", "F-04", "F-05"]
		status:   "done"
		session:  "impl"
	}
	"S-02": {
		title:    "キーの組の門・アダプター・サービス・記録・HTTP の口（D-04、D-05、D-06）"
		text:     "対象：`src/orca/send-gates.ts`、`src/orca/send.ts`、`src/orca/capabilities.ts`、`src/send/service.ts`、`src/send/ticket.ts`、`src/send/journal.ts`、`src/send/model.ts`、`src/server/app.ts`、`src/server/main.ts`（または `src/orca/wiring.ts`）と、`test/orca/send-gates.test.ts`、`test/orca/send.test.ts`、`test/orca/capabilities.test.ts`、`test/send/service.test.ts`、`test/send/journal.test.ts`、`test/server/answer-api.test.ts`（または今の送信の HTTP のテスト）。確かめ：T-06〜T-12。完了：`npm run lint`、`npm test`、`npm run build` が通り、T-06〜T-12 のテストがあり、今の送信と構造化 Chat の答えのテストが、status の応答に増える項目（answerKeys・answerMessage）の期待値を足すほかは変えずに通る。実装担当 impl の最後の手順で、区切りのレビュー CP-1 の最後の手順。止まって HEAD を報告する"
		realizes: ["R-02", "R-03", "R-04", "R-05", "R-06", "F-01", "F-02", "F-03", "F-04", "F-05"]
		after:    ["S-01"]
		status:   "done"
		session:  "impl"
	}
	"S-03": {
		title:    "カードの答える手段の差し替えと答え済みの判定（D-07）"
		text:     "対象：`web/embed/question-view.js`、`web/embed/question-dom.js`、`web/embed/agent-view.js`、`web/embed/agent-dom.js`、`web/embed/agent-frame.js`、`web/embed/agent.css` と、`test/web/question-view.test.ts`、`test/web/question-dom.test.ts`、`test/web/agent-view.test.ts`、`test/web/agent-css.test.ts`。`web/embed/agent-marks*.js`、`open-control*.js` は使うだけで変えない。確かめ：T-13〜T-17。完了：`node --test test/web/*.test.ts`、`npm run lint`、`npm test`、`npm run build` が通り、T-13〜T-17 のテストがある。描画の確かめは、実装担当が自分で起動した orca-web（一時の port、一時の settings で sendEnabled は偽のまま）とヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じる）で、幅 1280px と 390px、明暗で、偽の会話の端末の質問のカード（未回答、途中まで送った帯、答えずに閉じた形、後の発言の質問の答え済み）が横にはみ出さないことを見る（答えを送らない）。終えたら止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-02", "R-04", "R-05", "R-06", "R-07", "R-08"]
		after:    ["S-02"]
		status:   "done"
		session:  "ui"
	}
	"S-04": {
		title:    "README.md と AGENTS.md、試しのエージェントでの実機の確かめと写し（D-08）"
		text:     "タスク担当が行う。D-08 のとおり（端末のキーの組の実機は本人の確かめに残す。統括の判断 2026-11-18）。確かめ：T-18、T-19。完了：report.md の Verification に実機の結論と写しと、本人の確かめの手順と残る危険があり、README に残る危険があり、`npm run lint`、`npm test`、`npm run build` が通る。試しのエージェントは止め、試しの画面は本人が見られるように動かしたまま報告する"
		realizes: ["R-02", "R-06", "R-08"]
		after:    ["S-03"]
		status:   "done"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "正規化：構造化 Chat の question が answerVia rpc・preview 偽、端末の AskUserQuestion・request_user_input が answerVia keys で、preview のある問いは preview 真・allowOther 偽、ない問いは preview 偽・allowOther 真、request_user_input_async（端末の件と構造化 Chat の tool-call の両方）が answerVia message の部分（title の問い、文字の選択肢、単一選択、allowOther 真）になり、構造化 Chat の output の tool-result が続く。読めない async の入力と failed の呼び出しはツールの呼び出しのまま", verifies: ["R-01"]}
	"T-02": {title: "キーの列：buildClaudeKeys と buildCodexKeys が、Orca の buildAskAnswerKeys・buildCodexAskAnswerKeys と同じ組を返す（Claude の単一選択、その他の文、複数選択とその他、複数問、1問の複数選択の Submit、preview の問い。Codex の単一選択、メモつき、複数問）。selectionsOf が番号の文字を小さい順の数にし、other を trim する", verifies: ["R-02"]}
	"T-03": {title: "planKeys：claude・codex で組のバイトの列を返し、ほかの種類は agent_keys_unknown、codex の複数選択・preview は prompt_unsupported、番号が2桁になる問いは prompt_unsupported、64組を超える答えと、その他の文に Tab・改行などの制御文字がある答えは invalid_answer。pasteBytes が ESC を ␛ に替え、改行を含むか 512 バイトを超える文を、改行を CR にして括弧付きの貼り付けで包み、ほかはそのまま", verifies: ["R-02", "F-04", "F-05"]}
	"T-04": {title: "formatAsyncAnswer と quoteOf が、Orca の formatAskAnswer（replyAsMessage）と askAnswerQuote と同じ文を返す（1問、複数問、その他の文、問いの文の改行）", verifies: ["R-05"]}
	"T-05": {title: "findCallQuestion が、keys の質問を後の tool-result で answered（isError で failed）、なければ pending にし、message の質問を後の利用者の発言の引用（先頭か空行の後）で answered にし、引用でない発言では pending のまま。promptMatches が、waiting・blocked と質問のツールの名前と同じ問いで match、問いの文・header・preview・ラベル・説明・数が違えば mismatch、interactivePrompt がないか state が違うか切られていれば unverified。terminalPromptOf がタブの agentStatus から3つの値を読む", verifies: ["R-03", "R-05", "F-02"]}
	"T-06": {title: "門：SendRpc の terminal.send が、決めたキーの組の形（決めたキー、ESC・改行のない 512 バイト以下の文、括弧付きの貼り付けで 70,000 バイト以下）だけを通し、enter 真、requireWriteSettlement なし、requireAgentStatus・agentPrompt・envelope の付いた組、決めていない ESC の列（例：ESC [ 2 0 1 ~ を中に含む文、ESC [ D）、Tab や ETX などの制御文字を含む文、空の文を送らずに拒む。今の agentPrompt の形は変わらない", verifies: ["R-02", "F-04"]}
	"T-07": {title: "アダプター：sendKeyGroup が writeSettlement の accepted・refused・なし（accepted 偽は refused、accepted 真は unknown）・知らない形と、RPC の unavailable・method_not_found・timeout を、accepted・refused・unknown に分ける。answerKeys が組の間に 1000ms の sleep を呼び、前の組の結果の後に次を送り、全部で input_accepted（keys_sent）、1組目 refused で refused（not_sent）、1組目 unknown で unknown（unconfirmed）、2組目以降で止まれば unknown（partial_sent）と sentGroups・totalGroups を返し、止まった後の組を送らない", verifies: ["R-02", "R-04", "F-03"]}
	"T-08": {title: "answerIntent（callId）：sendEnabled 偽、会話にない、ツールの結果がある、引用の発言がある、前に送った記録がある（新しい SendService でも記録から）、構造化 Chat の宛先に keys、知らない種類のエージェント、codex の複数選択、truncated の async の質問、interactivePrompt がない・違う、前面がシェル、答えの誤りで、それぞれ決めた error と reason を返し、書き込みの RPC を0回。端末の status が permission でも keys は通り、票を返す", verifies: ["R-03", "R-06", "F-02"]}
	"T-09": {title: "answerConfirm（callId）：同じ票の2回目と送っている間の2回目を送らず、確定の前にツールの結果が現れた・interactivePrompt が変わった・答えの digest が違うときは送らず、通れば before の記録の後に組を送り（keys）か発言を1回送り（message）、送り始めた後の同じ callId の意図と確定を already_sent で拒む。prompt の票と call の票と今の送信の票を取り違えない。before の記録を書けないか記録が読めなければ送らない", verifies: ["R-02", "R-04", "R-05", "F-01"]}
	"T-10": {title: "記録：keys・message の答えの before・after・refused の行に、ラベル、番号の列、その他の文、キーの文字、発言の文が入らず、mode・callId・questionCount・digest・totalGroups・sentGroups が入る。hasAnswer が before の行から答えを見つける。今の送信と rpc の答えの行は変わらない", verifies: ["R-04"]}
	"T-11": {title: "照会：mode keys の結果不明の記録で、check が会話の今の状態から unknown（resolved_unverified・prompt_pending・question_not_found）か refused（cancelled）を返し、送り直さない。after の行のない keys の記録は no_after_record。mode message は今の照会を使う", verifies: ["R-04", "F-01"]}
	"T-12": {title: "HTTP と status：`/api/answer/intent` が callId の物を受け、prompt と callId の両方・どちらもない・余分な鍵・長すぎる callId を 400 で拒み、守りは今のまま。status が answerKeys・answerMessage を返し、端末の Claude で answerKeys が available、status.agentType が質問を待つ（permission の）端末でも宛先の種類を返し、構造化 Chat で answerKeys が chat_route になり、読みの RPC の回数が今の status より増えない", verifies: ["R-06"]}
	"T-13": {title: "answererFor が answerVia で rpc・keys・message の手段を選び、answerVia のない物は今の規則。createCallAnswerer が意図と確定を1回ずつ送り、callId の物を送る。availability が status の answerKeys・answerMessage と、codex の複数選択・preview・truncated の async で押せない理由と open を返し、keys の未回答のカードに途中まで答えた質問の注が出る。keys のその他の文に Tab か改行があると送るボタンを押せず control_character の理由が出る。message の答えの文（引用を含む）が 16,384 バイトを超えると送るボタンを押せず too_large の理由が出る（message と rpc は今の条件のまま）", verifies: ["R-02", "R-05", "R-06"]}
	"T-14": {title: "流れ：keys の partial_sent・unconfirmed・応答の欠けで phase partial になり、押し直し・閉じる・照会を受けず、カードが途中まで送った知らせと「Orca で開く」を出し、送るボタンを出さない。keys の done が「答えを送りました…」。message の unknown は今の照会の帯。keys・message の確定の 200 の refused は phase blocked。意図の拒みが already_sent・question_answered・prompt_mismatch・prompt_unsupported・agent_keys_unknown なら phase blocked で、選択と押し直しを受けず、理由と「Orca で開く」を出す。prompt_unverified の拒みは押し直せる", verifies: ["R-04", "R-06"]}
	"T-15": {title: "buildChat：keys の質問が isError の tool-result で declined（答えずに閉じた形、結果の文）、そうでなければ answered。message の質問（端末）が、すぐ続く同じ callId の受付の tool-result と、届いていない（undelivered の）引用の発言では pending のままで、後の利用者の発言の引用で answered（答えはその文）、引用でない発言では pending", verifies: ["R-05", "R-07"]}
	"T-16": {title: "question-dom.js が partial の帯と declined の閉じた形を textContent だけで描き、`<script>` や `<img onerror>` を含む文を文字のまま描く", verifies: ["R-04", "R-07"]}
	"T-17": {title: "agent.css の帯の規則が `var(--ds-…, 既定)` を使い、折り返しの規則がある（CSS を読むテスト）", verifies: ["R-08"]}
	"T-18": {title: "試しのエージェント（構造化 Chat の Codex）の request_user_input_async に小窓から答え、エージェントが答えを受け取ったことと、カードが答え済みの閉じた形になったことを確かめる（タスク担当、実機）。端末の Claude へのキーの組の答えとタブの agentStatus の interactivePrompt・toolName の鍵の確かめは本人の確かめに残し、report.md に手順を書く。interactivePrompt・toolName がないとき1組も送らず prompt_unverified で止まることは T-08 のテストで確かめる", verifies: ["R-02", "R-05", "R-06"]}
	"T-19": {title: "試しの画面で、後の発言の質問のカードの Mac の幅と 390px、明暗の写しを撮り、横にはみ出さないことを DOM で数える（タスク担当、実機）。端末の質問のカードの写しは S-03 の描画の確かめ（偽の会話）のものを report.md に挙げる", verifies: ["R-08"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実物の Orca への答えは S-04 のタスク担当だけ、試しのエージェントだけ。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う。タスク担当はマージしない）
	- 区切りのレビュー CP-1：最後の手順 S-02、範囲 `3b7aece..<S-02 の後の HEAD>`、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）を1人（standards と spec を1人で）。理由：画面（S-03）が依る部分の形と答えの口の契約、端末に書き込む門と、途中で止めること・二度と送らないことが S-02 までで決まる
	- 最終品質ゲート：範囲 `3b7aece..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy、security-baseline（端末に書き込む門、同じオリジン、トークン、答えの中身を記録に出さない、textContent）、reliability-recovery（途中で止めること、二度と送らないこと、結果不明の後に送らないこと）、e2e-user-flow（選択、390px、明暗、押せない理由、途中まで送った帯）。second_opinion：chatgpt（統括の補足『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ記録して主のレビュアーで続ける）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "settings.json の `sendEnabled` を偽にすれば、答えの口はすべて拒み、カードは読むだけになる。PR を戻せば、端末の質問は今の読むだけ（理由と「Orca で開く」）に戻る。"
exit:     "CP-1 と最終品質ゲート（`3b7aece..HEAD`、または取り込み後の HEAD）が合格し、試しのエージェント（構造化 Chat の後の発言の質問）での答えの確かめと写し、端末のキーの組の本人の確かめの手順と残る危険が report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-18）：Opus 5.5 / medium（方針の「タスク担当 × standard」）"}
		impl: {task: "実装（S-01〜S-02。正規化、キーの列の純な関数、門・アダプター・サービス・HTTP の口。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコード（API、サーバー、データの形）は Codex GPT-6.1 Sol / medium。方針の「実装担当（バックエンド）× standard」。Sol で失敗や見落としが記録されたときだけ GPT-6 Astra / high に上げる。Codex が chat-scratch の symlink の拒否で止まったら worker-stop して Claude Opus 5.5 / medium に切り替える（統括が了承済み）。provider: codex"}
		ui: {task: "画面の実装（S-03。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分は Claude Opus 5.5、standard なので medium（方針の「実装担当（フロントエンド）× standard」）。provider: claude"}
		doc: {task: "文書と実機の確かめ（S-04。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実物の Orca に答える確かめは、試しのエージェントだけを、タスク担当が自分で行う"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。standard なので1人）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー CP-1（code-reviewer ×1：standards と spec）", after: "S-02", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-04", model: "opus", effort: "medium"}
	}
}
