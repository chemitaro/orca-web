package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "会話の表示と、エージェントへの答えの送信を足す"
}

purpose: """
	`/embed/agent`（エージェントの詳細とチャットの小窓）で、エージェントが本人に選択肢で問う質問（Claude Code の AskUserQuestion、Codex の request_user_input など）を、問いの文・選択肢と説明・複数選べるか・その他の自由入力・答え済みかどうかの分かるカードとして出す。
	構造化 Chat（Orca のチャットのタブ）の質問には、Orca のチャットの画面で答えたときと同じ RPC（`agentSession.respondToQuestion`）で、小窓から選んで答えられるようにする。
	"""

background: """
	本人の指摘（2026-11-18）：小窓は質問に対応していない。今は `src/transcript/normalize.ts` が構造化 Chat の journal の `question` を `unsupported` にし、画面は「表示できない（質問）」と出すだけ。端末のエージェントの AskUserQuestion は、ただのツールの呼び出し（JSON の入力）として出る。

	Orca v1.4.261 のソース（stablyai/orca のタグ v1.4.261、`.workbench/orca-src/` に取得して読んだ。確かめた事実）：
	- 構造化 Chat（Claude・Codex とも）の質問は journal の項目 `{kind: 'question', question, options, questions?, freeTextQuestionId?, freeTextInput?, resolution}`（`src/shared/agent-session/journal/agent-session-journal-types.ts`）。`questions[]` は `{id, question, header?, multiSelect, options: [{id, label, description?, preview?}], freeTextQuestionId?, freeTextInput?: {allowEmpty?, multiline?, placeholder?}}`。`questions` がなければ項目そのものが1つの問い（id は `freeTextQuestionId` か `q1`、multiSelect は偽）。`resolution` は `{state: 'pending'|'resolved'|'cancelled', selectedOptionId, answers?: [{questionId, optionIds, other?}], resolvedBy, resolvedAt}`。項目には `itemId` と `revision` がある。
	- 答えは RPC `agentSession.respondToQuestion`（`{envelope: {sessionId, clientOperationId, expectedRuntimeFence, payloadFingerprint}, itemId, expectedRevision, answers}`。answers は1〜4件、optionIds は64件まで、other は 64KiB まで）。指紋は `sha256(canonicalize({method: 'agentSession.respondTo:question', sessionId, fields: {itemId, expectedRevision, answers}}))`。Orca は revision の比較（compare-and-set）で二重の答えを拒む（`agent_session_already_resolved`）。答えの形の検査は `isValidAgentSessionQuestionAnswers`（全部の問いに1件ずつ、出された選択肢だけ、other は freeTextQuestionId のある問いだけ、単一選択は答えがちょうど1つ、複数選択は1つ以上）。runtime の能力 `agent-session.question-answers.v1` がなければ answers を受けない（古い Orca は optionId に詰めた形）。
	- 端末のエージェントの質問は、会話（nativeChat）のツールの呼び出し（名前が AskUserQuestion・ask_user_question・askUserQuestion・request_user_input・request_user_input_async）の入力 `{questions: [{question|title, header?, multiSelect?, options: [{label, description?}|string]}]}` で、答え済みかは同じ callId のツールの結果があるかで分かる。答える RPC はなく、Orca 自身（デスクトップとモバイル）は `terminal.send` で数字・矢印・Enter のキーの列を間を空けて打ち込む（途中まで届いた状態があり得る）。
	- 承認（approval）は同じ仕組み（`agentSession.respondToApproval`、optionId）。
	統括の判断（2026-11-18、本人の推奨の案を採用）：端末のエージェントへの答え（キーの列）は orca-web の iss-00049、承認は iss-00050 で、この Issue のマージの後に行う。
	"""

includes: [
	"会話の正規化（`orca-web.transcript/v1`）に質問の部分 `question` を足す：構造化 Chat の journal の question と、端末のエージェントの質問のツールの呼び出し",
	"質問のカード（`web/embed/`）：問いの文、見出し、選択肢と説明、複数選択、その他の自由入力、送る。答え済みは選んだ答えを示して閉じた形。答える手段は差し替えられる形（iss-00049 が端末の手段を足す）",
	"構造化 Chat の質問に答える口（`POST /api/answer/intent`、`POST /api/answer/confirm`）と、送る門・送るアダプター・送信のサービスの追加（`agentSession.respondToQuestion` だけ）",
	"送れるかの口（`GET /api/send/status`）に、質問に答えられるかの項目を足す",
	"README.md と AGENTS.md の説明、試しの画面（`npm run trial`）での写し（Mac の幅と 390px）と、試しのエージェントでの実機の確かめ",
]

excludes: [
	"端末のエージェントの質問への答え（キーの列）。iss-00049 で行う",
	"承認（approval）の表示と答え。今のまま「表示できない（許可の確認）」。iss-00050 で行う",
	"選択肢の preview（見比べる等幅の塊）の表示",
	"質問の取り消し（`agentSession.cancel` の prompt）",
	"今の送信（`/api/send/intent`・`confirm`、`terminal.send`・`agentSession.send`）の意味の変更",
	"SpecDock 側の組み込み（spec-dock の epic-00471・00526）",
]

requirements: {
	"R-01": {
		title: "会話の API が、質問を、問い・選択肢・答えの状態の分かる部分として返す"
		text: """
			構造化 Chat の journal の `question` は、`{type: 'question', source: 'chat', prompt: {itemId, revision}, callId: null, questions, state, answers}` にする。`state` は resolution の `pending`→`pending`、`resolved`→`answered`、`cancelled`→`cancelled`。`answers` は resolution の answers、なければ selectedOptionId を Orca と同じ規則で解いたもの、解けなければ null。
			端末のエージェントの質問のツールの呼び出し（名前は Orca の isAskUserQuestionTool と同じ判定か request_user_input_async、失敗した呼び出しは除く）で、入力から1つ以上の問いを読めたものは `{type: 'question', source: 'terminal', prompt: null, callId, questions, state: 'pending', answers: null}` にする（選択肢の id は 0 から数えた番号の文字）。読めなければ今のままツールの呼び出しにする。同じ callId のツールの結果はこれまでどおり別の部分で返し、画面が結びつけて答え済みにする。
			各問いは `{id, header, question, multiSelect, options: [{id, label, description}], allowOther, otherAllowsEmpty}`。文字は上限で切り、切ったら `truncated: true` を付ける。preview は出さない。承認は今のまま unsupported（approval）。
			"""
		acceptance: [
			"構造化 Chat の question（1問、複数問、複数選択、その他あり、答え済み、取り消し、answers のない古い形）が、決めた形の部分になる",
			"端末のエージェントの AskUserQuestion と request_user_input の呼び出しが question の部分になり、入力が読めない呼び出しはツールの呼び出しのまま",
			"approval は今のまま unsupported になる",
		]
	}
	"R-02": {
		title: "小窓が、質問をカードとして出し、答え済みは選んだ答えを示して閉じる"
		text: """
			質問の部分を、会話の中のカードとして出す：見出し（あれば）、問いの文、選択肢のボタン（ラベルと説明）、複数選択の印、その他の自由入力の欄（allowOther のとき）、送るボタン。複数問は1枚のカードに並べ、送るボタンは1つ。
			答え済みは、問いと選んだ答え（選んだ選択肢のラベルと、その他の文）を短く示して閉じた形にし、押すと開いて選択肢を読める（押せない形で）。端末のエージェントの答え済みは、同じ callId のツールの結果の文を答えとして示す。取り消しは「取り消されました」と示して閉じる。
			"""
		acceptance: [
			"未回答の質問が、問い・選択肢と説明・送るボタンのあるカードで出る",
			"答え済みの質問が、選んだ答えを示して閉じた形で出る",
			"文字は textContent だけで描かれ、HTML として解かれない",
		]
	}
	"R-03": {
		title: "利用者が、構造化 Chat の質問に、選んで（その他の文も）答えられ、Orca のチャットで答えたのと同じ結果になる"
		text: """
			単一選択は1つを選ぶ（その他の文を書くと選択を外し、選ぶとその他の文を空にする）。複数選択は1つ以上を選べ、その他の文も1つに数える。全部の問いに答えがあるときだけ送るボタンを押せる（Orca の isValidAgentSessionQuestionAnswers と同じ条件）。
			送ると、サーバーは答えを `agentSession.respondToQuestion`（itemId、送る前に読んだ revision、answers）で1回だけ送る。Orca が受けて resolved を返せば、カードは「答えました」と示して止め、会話の記録が答え済みに変わったら閉じた形になる。
			"""
		acceptance: [
			"単一選択・複数選択・その他の文・複数問の答えが、Orca の answers の形（questionId、optionIds、other）で送られる",
			"答えの条件を満たさない間は送るボタンが押せない",
			"試しのエージェント（構造化 Chat）に小窓から答え、エージェントが答えを受け取って続ける",
		]
	}
	"R-04": {
		title: "答えの送信が、今の送信と同じ守り方で、二重に送らない"
		text: """
			答えの口は、今の送信と同じ書き込みの守り（Host の完全一致、同じオリジンの JSON、短期のトークン、CORS なし）、`sendEnabled`、宛先の解決と指紋、意図で出す使い捨ての票、送る前の記録、1つの操作の ID、処理中の印を使う。確定は、宛先と質問（同じ itemId が pending で revision が同じ）と答え（意図と同じ digest）を確かめ直してから1回だけ送る。
			結果は今の5つの分け方で返す（Orca が resolved を返せば submitted、拒めば refused とその code、届いたか分からなければ unknown）。unknown は自動で送り直さず、`GET /api/send/{操作の ID}?check=1` の照会で質問の今の状態を読んで確かめられる。
			送信の記録には、答えの中身（選んだラベル、id、その他の文）を書かない（digest、問いの数、itemId と revision だけ）。
			"""
		acceptance: [
			"送っている間の押しと、同じ票の2回目の確定は送らない。Orca に送る RPC は1つの操作で1回だけ",
			"質問が答え済みになったか revision が変わったら、送らずに理由を返す",
			"送信の記録の行に、答えの選択肢の id・ラベル・その他の文が入らない",
			"結果不明の照会が、質問の今の状態（answered、pending、cancelled）から結果を返し、送り直さない",
		]
	}
	"R-05": {
		title: "答えられないときは、質問は読めるが答えるボタンは押せず、理由を出す"
		text: """
			`sendEnabled` が偽、Orca が答えの RPC か能力（`agent-session.question-answers.v1`）を持たない、宛先が送れない状態（タブがない、セッションがないなど）のときは、カードは読めるが選択肢と送るボタンは押せず、理由を1行で示す。
			端末のエージェントの質問は答えるボタンを出さず、「端末のエージェントの質問は、いまは Orca で答えてください」と示し、「Orca で開く」を出す（部品は今の `createOpenControl`）。
			"""
		acceptance: [
			"sendEnabled が偽の設定で、カードの問いと選択肢が読め、送るボタンは押せず、理由が出る",
			"端末のエージェントの質問に、答えるボタンがなく、理由と「Orca で開く」が出る",
		]
	}
	"R-06": {
		title: "狭い枠（SpecDock の欄、390px）でも読めて押せる"
		text:  "カードは枠の幅に合わせて折り返し、横にはみ出さない。選択肢は縦に並ぶ全幅のボタンで、押せる高さを 44px 以上にする。色と字体は `agent.css` と同じ SpecDock のデザインシステムの変数（`--ds-*`）を先に使い、明暗の両方で読める。"
		acceptance: [
			"試しの画面で、Mac の幅と 390px、明暗で、カードが横にはみ出さず、選択肢と送るボタンが押せる（写しを report.md に残す）",
		]
	}
}

failures: {
	"F-01": {
		title: "答えの確定の応答を失ったとき、自動で送り直さず、結果不明として示す"
	}
	"F-02": {
		title: "別の画面（Orca や別の小窓）で先に答えられた質問には送らない（Orca の revision の比較で拒まれれば refused として示す）"
	}
	"F-03": {
		title: "Orca の応答や journal の形が知らない形なら、質問は unsupported（question）に戻し、答えの口は unknown_shape で送らない"
	}
	"F-04": {
		title: "問いの文・ラベル・その他の文に HTML や制御文字があっても、文字のまま描き、制御文字を含むその他の文は送らない"
	}
}

constraints: [
	"実行時の依存を足さない。画面は素の ES Modules で、DOM は textContent と createElement だけで描く",
	"送る経路は `agentSession.respondToQuestion` の決めた形だけを足す。再送の道を足さない。端末へのキーの列を送らない",
	"会話の API は同じオリジンだけ（CORS なし）。答えの口も同じ",
	"実機の確かめは試しのエージェントと試しの orca-web（別のポート、専用の settings）だけ。常駐の orca-web（8791）の設定を変えない",
]

decisions: [
	"端末のエージェントの質問は読むだけにし、答えは iss-00049（統括、2026-11-18、orchestration の返事 msg_fd0230f65b01）",
	"承認はこの Issue では今のまま。iss-00050（同上）",
	"答えの記録に中身を残さない（依頼書の『送った記録に中身を残さない』。今の送信の記録は本文を持つが、答えは digest だけにする）",
	"答えの API は今の送信の口とは別の道（`/api/answer/*`）にし、票・記録・照会・処理中の印は SendService の中で共有する（照会は `GET /api/send/{操作の ID}` のまま）",
]
