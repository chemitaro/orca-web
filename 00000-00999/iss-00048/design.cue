package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"質問を、構造化 Chat と端末のエージェントで同じ形の部分にし、画面は1つのカードの部品で描く",
	"答える手段を差し替えられる形にし、この Issue は構造化 Chat の RPC だけを足す（iss-00049 が端末の手段を足す）",
	"答えの送信は、今の送信の守り（票、記録、処理中の印、照会、sendEnabled、書き込みの守り）を共有し、Orca の revision の比較に任せて二重に答えない",
]

current: """
	`src/transcript/normalize.ts` は journal の question・approval・diff・status・plan を `{type: 'unsupported', what}` にする。端末のエージェントの AskUserQuestion はツールの呼び出し（入力は JSON の文字）。
	画面（`web/embed/agent-view.js` の buildChat）は unsupported を「表示できない（質問）」の行にする。
	送信は `SendService`（`src/send/service.ts`）の intent・confirm・check・status、門 `SendRpc`（`src/orca/send-gates.ts`）、アダプター（`src/orca/send.ts`）、記録 `SendJournal`（`orca-web.send-record/v1`、before の行は本文 text を持つ）。
	"""

target: """
	会話の API は質問を `{type: 'question', …}` の部分で返す。画面は質問の行をカードで描き、答える手段（answerer）を注入で受ける。
	サーバーは `POST /api/answer/intent`・`/api/answer/confirm` を持ち、SendService の answerIntent・answerConfirm が、今の票と記録と処理中の印を使って `agentSession.respondToQuestion` を1回だけ送る。照会は今の `GET /api/send/{操作の ID}` が答えの記録も扱う。
	"""

design: {
	"D-01": {
		title: "会話の正規化の質問の部分（`src/transcript/normalize.ts`）"
		text: """
			`TranscriptPart` に次を足す：
			```
			{ type: 'question'; source: 'chat' | 'terminal';
			  prompt: { itemId: string; revision: number } | null;   // chat だけ
			  callId: string | null;                                // terminal だけ
			  questions: QuestionView[];                            // 1〜4件（Orca の上限）。0件なら作らない
			  state: 'pending' | 'answered' | 'cancelled';
			  answers: { questionId: string; optionIds: string[]; other: string | null }[] | null;
			  truncated?: true }
			QuestionView = { id: string; header: string | null; question: string; multiSelect: boolean;
			  options: { id: string; label: string; description: string | null }[];   // 64件まで
			  allowOther: boolean; otherAllowsEmpty: boolean }
			```
			構造化 Chat（normalizeJournalItems の kind 'question'）：Orca の agentSessionPromptQuestions と同じ規則で問いを作る（`questions` があればそれ、なければ項目を1問にして id は `freeTextQuestionId ?? 'q1'`、multiSelect は偽）。`allowOther` は問いの `freeTextQuestionId` があるとき、`otherAllowsEmpty` は `freeTextInput.allowEmpty === true`。`prompt` は項目の `itemId` と `revision`（正の整数でなければ形の誤り）。`answers` は resolution の `answers`（形を確かめる）、なければ `selectedOptionId` を Orca の legacyAgentSessionQuestionAnswers と同じ規則で解く（選択肢の id、`question-group:` の JSON、`<id>:<文>` の自由入力）。答え済みの文とラベルも上限で切る。
			端末（normalizeNativeMessages の tool-call の block）：名前の英数字だけを小文字にしたものが `askuserquestion`・`requestuserinput` で（`request_user_input_async` は含めない。結果がすぐ返る受付で、答えではないため）、`state` が 'failed' でない呼び出し。入力（物、または JSON の文字）を Orca の parseCanonicalQuestionsInput（`question` か `title`、`header`、`multiSelect`（なければ `multiple`・`multi`）、`options` はラベルの文字か `{label, description}`）と同じ規則で読む。選択肢の id は `String(番号)`、問いの id は `String(番号)`、allowOther は偽（端末は答えないので画面の印に使わない）。1問も読めなければ今のままツールの呼び出しにする。state は 'pending'、answers は null。
			上限：問いの文 4,000 字、見出し・ラベル 500 字、説明 2,000 字、その他の文 4,000 字。切ったら部分に `truncated: true`。message の shortened も今と同じく truncated にする。
			知らない形（questions が配列でない、選択肢に id がない、resolution の state が3つのどれでもない）は今のまま `{type: 'unsupported', what: 'question'}` にする（F-03）。
			approval・diff・status・plan は変えない。
			"""
		satisfies: ["R-01", "F-03"]
	}
	"D-02": {
		title: "答えの送る門とアダプター（`src/orca/send-gates.ts`、`src/orca/send.ts`、`src/orca/capabilities.ts`）"
		text: """
			門 `SendRpc` に、決めた形の `agentSession.respondToQuestion` だけを足す：鍵がちょうど `envelope`、`itemId`、`expectedRevision`、`answers`。envelope は今の chatSend と同じ4つの鍵と検査。`itemId` は空でない文字、`expectedRevision` は正の整数、`answers` は1〜4件で、各件は鍵が `questionId`・`optionIds`（と任意の `other`）だけ、questionId は空でない 1024 字以下、optionIds は 64 件以下の空でない文字、other は文字で 64KiB 以下。`optionId`（古い詰めた形）は通さない。
			アダプターに `answerChat(target: ChatSendTarget, prompt: {itemId, revision}, answers, operationId, fence): Promise<SendResult>` を足す。params は `{envelope: {sessionId, clientOperationId: operationId, expectedRuntimeFence: fence, payloadFingerprint}, itemId, expectedRevision: revision, answers}`、指紋は `sha256(canonicalize({method: 'agentSession.respondTo:question', sessionId, fields: {itemId, expectedRevision, answers}}))`（今の canonicalize を使う）。timeoutMs 15000。
			結果の分け方 `classifyAnswer(outcome)`：RPC の失敗は今の failure と同じ（method_not_found・invalid_argument は refused、unavailable は refused not_sent、ほかは unknown）。`{ok: false, refusal: {code}}` は refused とその code（`agent_session_already_resolved` など）。`{ok: true, value: {resolution: {state}}}` の state が resolved なら submitted（detail.code 'resolved'）、cancelled なら refused（code 'cancelled'）、pending なら unknown。`replayed: true` は今と同じく detail に写す。ほかの形は unknown（unknown_shape）。
			読み `readQuestion(sessionId, itemId): Promise<SendRead<{fence, revision, state, questions}>>`：`agentSession.history`（tail、limit 200）を1回読み、page.fence と、itemId の項目を D-01 と同じ規則で読む（normalize.ts の関数を使う）。項目がなければ `{ok: false, error: 'question_not_found'}`（SendReadFailure の error に足す）、項目はあるが D-01 の規則で読めない（unsupported になる）か history の形が違えば `{ok: false, error: 'unknown_shape'}`。answerIntent と answerConfirm は unknown_shape をそのまま返し（今の送信と同じ HTTP の状態）、送らない。
			照会 `checkAnswer(target, prompt, digest, operationId)`：readQuestion で今の状態を読み、answered で resolution の answers（D-01 で解いたもの）の digest（D-03 と同じ求め方）が記録の digest と同じなら submitted（code 'resolved'）、違えば refused（code 'resolved_by_other'。Orca は revision の比較で後の答えを拒むので、自分の答えは付いていない）、answered で答えが解けなければ unknown（code 'resolved_unverified'）、cancelled なら refused（code 'cancelled'）、pending で revision が同じなら unknown（code 'prompt_pending'）、項目がなければ unknown（code 'question_not_found'）。送り直さない。
			能力 `answerChat`（FeatureName に足す）：`capability:agent-session.structured.v1`、`capability:agent-session.question-answers.v1`、`runtime-id:consistent`、`feature:readTabs`、`feature:readTranscript` を要し、`rpc:agentSession.respondToQuestion` を defer にする。
			"""
		satisfies: ["R-03", "R-04", "F-01", "F-02", "F-03"]
	}
	"D-03": {
		title: "答えの送信のサービス（`src/send/service.ts`、`src/send/ticket.ts`、`src/send/journal.ts`）"
		text: """
			答えの検査 `checkAnswers(questions: QuestionView[], answers: unknown): AnswerCheck`（`src/send/answer.ts` を足す。純な関数）：形（配列、各件の鍵と型）と、Orca の isValidAgentSessionQuestionAnswers と同じ条件（全部の問いに1件ずつ、id の重なりなし、出された選択肢だけ、other は allowOther の問いだけ、other の鍵があり otherAllowsEmpty か空白でない文のときだけ答えに数える（Orca と同じ）、単一選択はちょうど1つ、複数選択は1つ以上）を確かめる。other は今の checkText と同じ制御文字の検査（タブと改行は許す）と 64KiB の上限。答えを決めた形（鍵の順を決めた物。other は答えに数えたときだけ付け、文は変えない）にして返す。digest は `sha256(canonicalize(answers))`。
			票 `TicketInput` に任意の `prompt: {itemId, revision}` を足す（答えの票だけが持つ）。答えの票で今の confirm は受けない（ticket_invalid）、送信の票で answerConfirm は受けない。
			`SendService.answerIntent({agent, target?, prompt, answers})`：sendEnabled（偽なら send_disabled）、今の preflight（route が chat でなければ `{error: 'not_sendable', reason: 'terminal_route'}`、能力 answerChat がなければ unsupported と missing）、指紋の比べ（今の intent と同じ）、readQuestion（state が pending でないか revision が違えば `{error: 'target_changed', reason: 'question_changed'}`、なければ `question_changed` と同じ扱いで reason 'question_gone'）、checkAnswers（誤りは `{error: 'invalid_answer', reason}`、HTTP 400）の順。通れば票を出し、`{ticket, expiresAt, operationId, preview, digest}` を返す。
			`SendService.answerConfirm({ticket, answers})`：今の confirm と同じ順（busy、sendEnabled、票の取り出しと処理中の印を同じ同期の処理で、答えの digest の比べ、preflight と宛先の比べ）に加えて、readQuestion で同じ itemId が pending で revision が票と同じことと、答えがその問いに対して checkAnswers を通ることを確かめ、送る前の記録を書いてから answerChat を1回だけ呼び、後の記録を書く。拒みは今の #refuse で記録する。
			記録：before の行に `action: 'answer'` と `prompt: {itemId, revision}`、`questionCount`、`digest` を書き、`text` を書かない（答えの中身を残さない）。parseRow は、action が 'answer' の before は text がなくても読む。今の送信の行の形は変えない。`check(operationId)` は before の action が answer なら checkAnswer で照会する。
			status：`SendService.status` の応答に `answer: {available: boolean, reason: string | null}` を足す。preflight が通り route が chat で能力 answerChat があれば available、route が terminal なら reason 'terminal_route'、能力がなければ 'unsupported'、preflight が通らなければその理由。enabled はこれまでどおり別の項目。
			"""
		satisfies: ["R-03", "R-04", "R-05", "F-01", "F-02", "F-04"]
	}
	"D-04": {
		title: "答えの HTTP の口（`src/server/app.ts`）"
		text: """
			`POST /api/answer/intent`：物は `{agent, prompt: {itemId, revision}, answers, target?}` の鍵だけ（ほかの鍵、形の誤りは 400 invalid_request。agent と target の検査は今の送信と同じ、itemId は 1〜1024 字、revision は正の整数、answers は配列）。
			`POST /api/answer/confirm`：物は `{ticket, answers}` の鍵だけ。
			どちらも今の送信の書き込みと同じ守り（checkSameOriginWrite の POST、checkToken、本文 128KiB、拒みの数の記録）を通し、誤りの HTTP の状態は今の SEND_ERROR_STATUS（invalid_answer を 400 で足す）。成功は 200 で `ok` を除いた物。
			照会は今の `GET /api/send/{操作の ID}`、送れるかは今の `GET /api/send/status`（answer の項目が増える）。
			"""
		satisfies: ["R-04", "R-05"]
	}
	"D-05": {
		title: "質問のカードの部品（`web/embed/question-view.js`、`question-dom.js`）と、答える手段の差し替え"
		text: """
			`question-view.js`（純な関数）：
			- `initialSelection(part)`：各問いに `{optionIds: [], other: null}`（null はその他を選んでいない）。
			- `toggleOption(selection, part, questionIndex, optionId)`：単一選択はその1つにして other を null に、複数選択は入れ外し。`toggleOther(selection, part, questionIndex)`：その他の欄を選ぶ（other を '' に）か外す（null に）。単一選択で選ぶと optionIds を空に。`setOther(selection, part, questionIndex, text)`：選んだその他の文を変える。
			- `buildAnswers` は、other が null でない問いにだけ other を付ける（otherAllowsEmpty の問いは '' も答え、そうでなければ空白だけの文は付けない）。
			- `buildAnswers(part, selection)`：サーバーの checkAnswers と同じ条件で `{ok: true, answers}` か `{ok: false}`（送るボタンを押せるかに使う）。
			- `buildQuestionCard(part, {selection, flow, availability, result})`：描く物 `{key, closed, state, title, questions: [{id, header, question, multiSelect, options: [{id, label, description, selected, disabled}], other: {shown, value, disabled} }], answerSummary: string[], notice, reason, button: {shown, disabled, busy, label}, open: boolean}`。state が answered・cancelled なら closed（answerSummary に、問いごとに選んだラベルとその他の文を「、」で並べた文。端末は結びついたツールの結果の文）。
			- 答える手段（answerer）の契約：`{ availability(part, status): {ok: true} | {ok: false, reason: string, open?: true}, submit(part, answers): Promise<FlowResult> }`。この Issue は `createChatAnswerer({agentId, writer})`（構造化 Chat：意図と確定を続けて送る）と、端末の `terminalAnswerer`（いつも `{ok: false, reason: '端末のエージェントの質問は、いまは Orca で答えてください', open: true}`）を作り、`answererFor(part)` が source で選ぶ。iss-00049 は terminalAnswerer を差し替えるだけでよい。
			- 送る流れ（カードごと）：`idle → sending → done | refused | unknown`。sending の間の押しは捨てる。done は「答えました」、refused は理由（already_resolved は「ほかの画面で答え済みです」、question_changed は「質問が変わりました」）、unknown は「届いたか分かりません。自動では送り直しません」と「確かめる」（`GET /api/send/{操作の ID}?check=1`）と「閉じる」。自動で送り直さない。理由の言葉の表は1か所に置く（send_disabled は「送信が無効です（設定の sendEnabled が偽）」）。
			`question-dom.js`：textContent と createElement だけで描く。カードは `section.question-card`、選択肢は `button.question-option`（`aria-pressed`、単一選択は role radio の印でなく文字の印でよい）、その他は `input`（または textarea）、送るボタン、閉じた形は `details`（summary に問いと答え）。押しは data 属性（`data-question`、`data-option`、`data-action`）で親が受ける。open の操作は `createOpenControl` を使う（新しく作らない）。端末の質問のカードの「Orca で開く」は、見出しの置き場と違い、390px 以下でも出す（カードでは答える唯一の道なので）。
			`agent-view.js` の buildChat：question の部分を `{kind: 'question', key, at, part}` の行にし、端末の question は同じ callId の tool-result を結びつけて `state: 'answered'`、`answerText`（結果の文）にする（結果が先か後かによらない）。`agent-dom.js` の renderChatRow は question の行を question-dom.js に任せる。`agent-frame.js` はカードの選択と流れの状態をカードの key ごとに持ち、5 秒の描き直しや追記でも保つ。送れるかは今の `/api/send/status` の読みの結果（enabled と answer）を使う。
			`agent.css`：カードの見た目（`--ds-*` を先に、明暗）。選択肢は縦に並ぶ全幅、min-height 44px、長い語は折り返す（overflow-wrap: anywhere）。
			`src/server/app.ts` の STATIC_FILES に2つのファイルを足す。
			"""
		satisfies: ["R-02", "R-03", "R-05", "R-06", "F-01", "F-04"]
	}
	"D-06": {
		title: "文書と実機の確かめ"
		text: """
			README.md と AGENTS.md に、質問の部分、答えの口、答える手段の差し替え、端末と承認が後の Issue であることを書く。
			実機：試しの orca-web（別のポート、専用の settings で sendEnabled を真）と `npm run trial` の試しの画面で、試しのエージェント（構造化 Chat の Claude haiku、出来れば Codex も）に質問を1つ出させ、小窓から答え、エージェントが答えを受け取ったことを会話の状態で確かめる。答えた後、試しのエージェントを止める。sendEnabled を偽にした試しの orca-web で、カードが読めて押せないことも見る。Mac の幅と 390px、明暗の写しを Scope の artifacts に置く（会話の中身は写さない。試しの質問の文は決めた無害な文にする）。
			"""
		satisfies: ["R-03", "R-05", "R-06"]
	}
}

compatibility: """
	会話の文書の schema は `orca-web.transcript/v1` のまま、部分の種類が1つ増える。知らない部分を描けない古い画面はないので（画面は同じサーバーが配る）、互換の問題はない。
	送信の記録は before の行に action が付くものが増える。今の行の形は変えない。戻した版は action のある before の行を読まない（parseRow が text のない before を捨てる）ので、after の行のない答えの操作（送る途中で落ちたもの）は、戻した版の照会で not_sent と誤って示されうる。戻すときは答えの操作の照会を信じず、Orca の画面で質問の状態を見る。
	"""

risks: [
	"Orca の journal の question の形が後の版で変わると、unsupported に戻る（F-03）。answers の形の検査が Orca と食い違うと、送るボタンが押せない（安全側）",
	"history の tail 200 件より前の質問は readQuestion で見つからず、答えられない（question_gone）。未回答の質問はふつう末尾にあるので許す",
]
