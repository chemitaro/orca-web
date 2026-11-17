package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"Orca の列と間をそのまま写し、端末のエージェントの質問への答えを、Orca が送るのと同じバイトで1組ずつ送る",
	"送る前の確かめ（答えられていない、画面がその質問を出している、前面がエージェント、前に送っていない）と、途中で止めること、二度と送らないことで、途中まで届く危険を抑える",
	"iss-00048 の守りの層（票、記録、処理中の印、照会、sendEnabled、書き込みの守り）と、カードの部品を共有し、答える手段だけを差し替える",
]

current: """
	会話の正規化（`src/transcript/normalize.ts`）は、構造化 Chat の journal の question と、端末の AskUserQuestion・request_user_input を `{type: 'question', source, prompt, callId, questions, state, answers}` にする。端末の問いは allowOther が偽で、`request_user_input_async` はツールの呼び出しのまま。
	答えは `POST /api/answer/intent`・`confirm`（`{agent, prompt: {itemId, revision}, answers}`）で、`SendService.answerIntent`・`answerConfirm` が構造化 Chat だけに `agentSession.respondToQuestion` を1回送る。端末の宛先は `not_sendable`（`terminal_route`）。
	画面（`web/embed/question-view.js`）は `answererFor(part)` が source で手段を選び、端末の手段 `terminalAnswerer` は答えず理由と「Orca で開く」を出す。`agent-view.js` の buildChat は端末の question と同じ callId の tool-result を結びつけて答え済みにする（isError でも答え済み。iss-00048 の P2-d）。
	"""

target: """
	質問の部分は `answerVia`（rpc・keys・message）と問いごとの `preview` を持つ。`/api/answer/intent` は `{agent, callId, answers}` も受け、サーバーは会話の記録から callId の質問を読み、keys なら確かめの後に Orca と同じ組の列を1組ずつ `terminal.send` で送り、message なら Orca と同じ形の発言を今の送信の経路で1回送る。
	画面は answerVia で手段を選び、keys・message の手段は同じ意図と確定の流れを使い、途中まで送った結果は送り直せない帯にする。
	"""

design: {
	"D-01": {
		title: "会話の正規化の答え方と後の発言の質問（`src/transcript/normalize.ts`）"
		text: """
			`QuestionPart` に `answerVia: 'rpc' | 'keys' | 'message'` を、`QuestionView` に `preview: boolean` を足す（どちらも必ず付ける）。
			- 構造化 Chat の journal の question：answerVia `rpc`、各問いの preview は偽（今は preview を出さない。形は今のまま）。
			- 端末の tool-call の AskUserQuestion・request_user_input（今の判定のまま）：answerVia `keys`。問いの preview は、問いが単一選択で、入力の選択肢のどれかが空白だけでない文字（/\\S/ に当たる）の `preview` を持つとき真（Orca の parseCanonicalQuestionsInput の `!multiSelect && askOptionsHavePreview` と同じ。複数選択の問いはいつも偽）。allowOther は preview が偽のとき真、真のとき偽。otherAllowsEmpty は偽。
			- `request_user_input_async` の tool-call（名前の英数字だけを小文字にしたものが `requestuserinputasync`、state が failed でない。端末の件と、構造化 Chat の journal の tool-call の両方）：入力（物、または JSON の文字）を Orca の parseCodexAsyncQuestionsInput と同じ規則（`questions` の配列の各要素の `title` が文字なら問い、`options` の文字だけを選択肢）で読み、1問以上あれば `{type: 'question', source: 端末なら 'terminal'・構造化 Chat なら 'chat', answerVia: 'message', prompt: null, callId, questions, state: 'pending', answers: null}` にする。各問いは id が番号の文字、header は null、multiSelect は偽、allowOther は真、otherAllowsEmpty は偽、preview は偽。問いの文かラベルを上限で切った（truncated の）async の質問は、Orca と同じ文を作れないので、サービスは `not_sendable`（`prompt_unsupported`）で送らず、画面も押せない形にする。読めなければ今のままツールの呼び出し。構造化 Chat の journal の tool-call に output があれば、今のとおり tool-result の部分を続けて出す（同じ callId）。
			- 上限と切り方は今のまま（問いの文 4,000 字など）。
			端末の件（nativeChat）の role user のうち、届いていない発言（D-03 の条件に当たるもの）には、件に `undelivered: true` を付ける（後の発言の質問の答え済みの判定から除くため。画面の buildChat も除く）。会話の API の schema は `orca-web.transcript/v1` のまま。
			"""
		satisfies: ["R-01"]
	}
	"D-02": {
		title: "キーの列と答えの発言（`src/send/keys.ts`、新。純な関数）"
		text: """
			Orca v1.4.261 の `native-chat-ask-answer.ts`、`native-chat-paste-bytes.ts`、`terminal-bracketed-paste-text.ts`、`native-chat-answer-stepping.ts` を写す（値も同じ。写した元の名前を注に書く）。
			- `ANSWER_STEP_MS = 1000`（NATIVE_CHAT_QUESTION_STEP_MS）、`MAX_KEY_GROUPS = 64`。
			- `KeyGroup = {raw: string} | {text: string}`。
			- `selectionsOf(questions: QuestionView[], answers: QuestionAnswer[]): {indices: number[], other?: string}[]`：答え（checkAnswers の決めた形）を、問いの順に、選択肢の id（番号の文字）を数にした `indices`（小さい順）と、数えた other（Orca と同じく trim した文）にする。
			- `buildClaudeKeys(questions, selections)`：buildAskAnswerKeys と同じ。問いの `preview` を hasPreviews に使う。
			- `buildCodexKeys(questions, selections)`：buildCodexAskAnswerKeys と同じ。
			- `pasteBytes(text)`：buildNativeChatPasteBytes と同じ（ESC を ␛ に替え、改行を含むか UTF-8 で 512 バイトを超えるなら、改行を CR にして ESC [200~ と ESC [201~ で包む）。`groupBytes(group)` は raw をそのまま、text を pasteBytes にする。
			- その他の文の検査（keys）：checkAnswers を通った答えのうち、other に Tab・LF・CR を含む C0、DEL、C1 があれば `invalid_answer`（`control_character`）。1行の文だけを送る（F-04）。
			- `planKeys(agentType, questions, answers): {ok: true, groups: string[]} | {ok: false, reason}`：agentType が claude なら buildClaudeKeys、codex なら buildCodexKeys（codex で multiSelect か preview の問いがあれば `prompt_unsupported`）、ほかは `agent_keys_unknown`。Claude で選択肢の数＋1 が 9 を超える問い（数字が2桁になる）と、codex で選択肢の数が 9 を超える問いは `prompt_unsupported`。組が 0 か MAX_KEY_GROUPS を超えれば `invalid_answer`（F-05）。返す groups は groupBytes を当てたバイトの列。
			- `formatAsyncAnswer(questions, answers)`：formatAskAnswer の replyAsMessage と同じ（答えた問いごとに `> ` と、改行の続きを空白1つにした問いの文、空行、選んだラベルとその他の文を `, ` で並べた答え。問いの間は空行）。
			- `quoteOf(question)`：askAnswerQuote と同じ（`> ` と問いの文と空行）。
			"""
		satisfies: ["R-02", "R-05", "F-04", "F-05"]
	}
	"D-03": {
		title: "会話の中の質問の今の状態（`src/send/question-state.ts`、新。純な関数）"
		text: """
			`findCallQuestion(messages: TranscriptMessage[], callId): CallQuestion | null`：会話の件から、callId の質問の部分（answerVia keys か message）を探し、状態を決める。
			- keys：同じ callId の tool-result の部分が後にあれば `answered`（isError なら `failed`）、なければ `pending`。
			- message：後の role user の件のうち、届いた発言（Orca の isDeliveredNativeChatUserMessage と同じく、unsent・stoppedBeforeStart・awaitsRetry・sentWhileStopping・queued・pendingSend・deliveryState のどれも持たないもの）の text の部分のどれかが、どれかの問いの `quoteOf` で始まるか、空行（2つの改行）の後にそれを含めば `answered`、なければ `pending`。
			- 返す物は `{part, state}`。見つからなければ null。同じ callId が2つあれば後の物。
			`promptMatches(agentStatus, questions): 'match' | 'mismatch' | 'unverified'`：タブの agentStatus の `state` が waiting か blocked で、`toolName` が質問のツール（isAskUserQuestionTool）で、`interactivePrompt`（JSON の文字）を D-01 の端末の規則で読んだ問いが、問いの数、各問いの文・header・multiSelect・preview、選択肢のラベルと説明の列で同じなら match。interactivePrompt がないか、state が違うか、読んだ問いのどれかが上限で切られている（truncated）なら unverified、読めて違えば mismatch。
			`terminalPromptOf(listAll, tabId)`（`src/send/target.ts` に足す）：session.tabs.listAll の結果から、その tab の agentStatus の `{state, toolName, interactivePrompt}` を読む（文字でなければ null）。状態の文書には出さない。
			"""
		satisfies: ["R-03", "R-05", "F-02"]
	}
	"D-04": {
		title: "キーの組の門とアダプター（`src/orca/send-gates.ts`、`src/orca/send.ts`、`src/orca/capabilities.ts`）"
		text: """
			門 `SendRpc` の `terminal.send` に、今の形（agentPrompt）に加えて、キーの組の形だけを通す：鍵がちょうど `terminal`・`text`・`enter`・`requireWriteSettlement`・`client` で、terminal は `term_` で始まり、enter は偽、requireWriteSettlement は真、client は `{id: 'orca-web', type: 'desktop'}`、text は次のどれか：決めたキー（`1`〜`9`、CR、ESC [ C、ESC [ A、ESC [ B、Tab、`n`、DEL）、C0（Tab・CR・LF を含む）・DEL・C1 を含まない 1〜512 バイトの文、または ESC [200~ で始まり ESC [201~ で終わり、間に C0・DEL・C1 を含まない 1〜70,000 バイトの文。envelope は付けない。
			アダプターに `sendKeyGroup(target: TerminalSendTarget, bytes): Promise<'accepted' | 'refused' | 'unknown'>` を足す：params は上の形、timeoutMs 10000。結果は Orca の readTerminalSendAcknowledgment を、キーの組では厳しくした規則で分ける：`send.writeSettlement.outcome` が refused なら refused、accepted で `send.accepted` が真なら accepted、writeSettlement がなく `send.accepted` が偽なら refused、writeSettlement がなく `send.accepted` が真なら unknown（書き込みの完了を確かめられないので次の組を送らない。requireWriteSettlement を知らない古い Orca では、keys の答えは1組目で unconfirmed として止まる）、ほかは unknown。RPC の失敗は、unavailable は refused、method_not_found・invalid_argument は refused、ほかは unknown。
			`answerKeys(target, groups: string[], sleep: (ms) => Promise<void>): Promise<SendResult>`：1組目をすぐ送り、前の組が accepted のときだけ ANSWER_STEP_MS を待って次を送る。受けられない組で止め、結果は R-04 の分け方（全部 accepted は `input_accepted` と code `keys_sent`、1組目 refused は refused と code `not_sent`、1組目 unknown は unknown と code `unconfirmed`、受けた組の後で止まれば unknown と code `partial_sent`）。detail に `sentGroups`（accepted の組の数）と `totalGroups` を付ける（SendDetail に足す）。method_not_found なら detail.method に `terminal.send`。
			能力 `answerKeys`（FeatureName に足す）：`runtime-id:consistent`、`feature:readTabs`、`feature:readTranscript` を要し、`rpc:terminal.send`・`rpc:terminal.agentStatus`・`rpc:terminal.inspectProcess` を defer にする（今の sendTerminal と同じ書き方）。answerVia message は今の sendTerminal・sendChat と `feature:readTranscript` を使う。
			"""
		satisfies: ["R-02", "R-04", "F-03", "F-04"]
	}
	"D-05": {
		title: "端末と後の発言の答えのサービス（`src/send/service.ts`、`src/send/ticket.ts`、`src/send/journal.ts`）"
		text: """
			依存 `SendDeps` に `readTranscript(agentId): Promise<{ok: true, messages: TranscriptMessage[]} | {ok: false, error}>`（会話の読みの末尾のページ、limit 200。サーバーの組み立てで今の TranscriptReader と正規化をつなぐ）と、任意の `sleep` を足す。
			`answerIntent` は `{agent, callId, answers, target?}` も受ける（prompt と callId はちょうど片方）。callId の流れ：
			1. sendEnabled（偽なら send_disabled）。
			2. readTranscript と findCallQuestion。読めなければその誤り（unreachable、unknown_shape など）、質問がなければ `target_changed`（`question_gone`）、answered・failed なら `target_changed`（`question_answered`）。
			3. 記録に、同じ agentId と callId の答えの before の行があれば `not_sendable`（`already_sent`）。サービスの中の送り始めた callId の集まり（記録を書いた直後に足す）も見る。
			4. keys：preflight の mode `keys`（route が terminal でなければ `not_sendable`（`chat_route`）、能力 answerKeys、端末の確かめは今と同じだが status の permission を拒まない、前面がエージェント）。agentType が claude・codex でなければ `not_sendable`（`agent_keys_unknown`）。preflight が読んだ listAll の結果から terminalPromptOf と promptMatches（unverified なら `not_sendable`（`prompt_unverified`）、mismatch なら `target_changed`（`prompt_mismatch`））。checkAnswers（問いは会話の記録の物）、planKeys（誤りは `not_sendable`（その reason）か invalid_answer）。
			   message：今の preflight（mode send）と checkAnswers、formatAsyncAnswer、今の checkText（誤りは invalid_answer）。
			5. 票を出す。`TicketInput` に任意の `call: {callId, mode: 'keys' | 'message'}` を足す。票は target、digest、operationId、call、questions を持つ（キーの列や文は持たず、確定で作り直す）。
			`answerConfirm` は票が call を持てば callId の流れにする（busy と処理中の印、票の取り出し、答えの digest の比べ、preflight と宛先の比べは今と同じ順）。続けて 2・3・4 を確かめ直し（票の問いと読み直した問いが、文・header・multiSelect・preview・allowOther、選択肢の id・ラベル・説明で同じでなければ `target_changed`（`question_changed`）。読んだ会話のセッションが宛先のセッションと違えば `target_changed`（`session_changed`））、作り直した groups（または文）で、送る前の記録を書き、送り始めた集まりに callId を足してから、keys は adapter.answerKeys を1回、message は今の adapter.sendTerminal か sendChat を1回呼び、後の記録を書く。票の種類を取り違えない（prompt の票は call の流れで、call の票は prompt の流れや今の confirm で受けない）。
			記録：before の行に `action: 'answer'`、`mode`（`rpc`・`keys`・`message`。今の rpc の行は mode がなくても読む）、`callId`（keys・message）、`questionCount`、`digest`、`totalGroups`（keys）を書き、text・キー・ラベルを書かない。`SendJournal.hasAnswer(agentId, callId): Promise<boolean>`（記録の before の行を読む。読めなければ投げ、サービスは `record_unreadable` で送らない）を足す。after の行の detail に sentGroups・totalGroups が入る。
			照会 `check`：before が answer で mode keys なら、readTranscript と findCallQuestion で、answered なら unknown（`resolved_unverified`）、failed なら refused（`cancelled`）、pending なら unknown（`prompt_pending`）、ないなら unknown（`question_not_found`）。送り直さない。mode message は今の checkTerminal・checkChat（操作の ID）。
			status：応答に `answerKeys` と `answerMessage`（`{available, reason}`）を足す。answerKeys は route が terminal で能力 answerKeys があり、agentType が claude・codex で、端末の確かめ（permission を拒まない）が通れば available。answerMessage は今の送信の preflight が通り能力 readTranscript があれば available。読みの RPC は今の status より増やさない（端末の確かめの結果を permission の違いだけで使い回す）。送信の preflight が permission で通らなくても、keys の確かめが通れば、status の `agentType` と `route` は keys の宛先の値を返す（画面が codex の判定に使う）。
			"""
		satisfies: ["R-02", "R-03", "R-04", "R-05", "R-06", "F-01", "F-02", "F-03", "F-04", "F-05"]
	}
	"D-06": {
		title: "答えの HTTP の口の広げ（`src/server/app.ts`）"
		text: """
			`POST /api/answer/intent`：物は `{agent, prompt, answers, target?}` か `{agent, callId, answers, target?}` の鍵だけ（prompt と callId の両方か、どちらもないのは 400 invalid_request）。callId は 1〜1024 字の文字。confirm は今のまま `{ticket, answers}`。守り（同じオリジンの JSON、トークン、本文の上限、CORS なし）と誤りの HTTP の状態は今のまま。
			サーバーの組み立て（`src/server/main.ts` か wiring）で、SendService の readTranscript を今の TranscriptReader（resolve と read）と normalizePage でつなぐ。
			"""
		satisfies: ["R-02", "R-05", "R-06"]
	}
	"D-07": {
		title: "カードの答える手段の差し替えと答え済みの判定（`web/embed/question-view.js`、`question-dom.js`、`agent-view.js`、`agent-frame.js`、`agent.css`）"
		text: """
			`answererFor(part, answerers)` を answerVia で選ぶ：rpc は今の chat、keys は `answerers.keys`、message は `answerers.message`（answerVia がない古い物は今の source の規則）。`terminalAnswerer` は残し、answerers の表で keys に `createCallAnswerer({agentId, writer, read?, mode: 'keys'})`、message に `createCallAnswerer({…, mode: 'message'})` を入れる。
			`createCallAnswerer`：availability は status の `answerKeys`・`answerMessage`（enabled が偽なら send_disabled、項目がなければ unknown_shape、available が偽ならその reason）。mode keys で status.agentType が codex のとき、multiSelect か preview の問いがあれば `{ok: false, reason: prompt_unsupported の言葉, open: true}`。keys で答えられないときは `open: true`（「Orca で開く」を出す）。submit は `/api/answer/intent` に `{agent, callId, answers}` を送り、続けて confirm を1回（今の chat の流れと同じ）。確定の結果：DELIVERED（submitted・accepted・input_accepted）は done、refused は理由、mode keys の unknown（unconfirmed・partial_sent・応答の欠け）は `{kind: 'partial', operationId, note}`、mode message の unknown は今の unknown（照会できる）。check は今の chat と同じ。
			流れ：意図か確定の拒みの理由が already_sent・question_answered・prompt_mismatch・prompt_unsupported・agent_keys_unknown なら、結果を `{kind: 'blocked', reason}` にし、phase `blocked`（押し直し・選択の変更を受けず、理由と「Orca で開く」を出し、送るボタンを出さない）にする。prompt_unverified ほかは今の refused（押し直せる）。callId の手段（keys・message）の確定の 200 の応答が refused のときは、送る前の記録を書いた後なので同じ callId には二度と送れない（R-04）。結果を `{kind: 'blocked', reason}`（理由は「送っていません。この質問には、ここからはもう送れません。Orca で答えてください」）にする。`partial` の結果は phase `partial` にし、押し直し・閉じる・照会を受けない（送り直さない）。カードは「途中まで送りました。Orca で確かめてください」（sentGroups が 0 か分からなければ「届いたか分かりません。Orca で確かめてください」）と「Orca で開く」を出し、送るボタンを出さない。keys の done は「答えを送りました。エージェントの返事を待っています」。
			message の質問の buildAnswers は、formatAsyncAnswer と同じ文を作り、その UTF-8 の長さが今の送信の本文の上限（checkText の 16,384 バイト）を超えれば送れない（`{ok: false}`）とし、理由 too_large（「答えが長すぎます（引用を含めて 16KB まで）」）を示す。
			keys の質問の buildAnswers は、その他の文に Tab・改行を含む C0・DEL・C1 があれば送れない（`{ok: false}`）とし、カードに理由 control_character（「その他の文は1行で、制御文字を含めないでください」）を示す（R-02、F-04）。
			理由の言葉の表に、control_character、already_sent（「この質問には一度答えを送りました。Orca で確かめてください」）、question_answered（「ほかの画面で答え済みです」）、prompt_unverified（「端末がこの質問を出しているか確かめられません」）、prompt_mismatch（「端末の質問が変わりました」）、prompt_unsupported（「この形の質問は、ここからは答えられません」）、agent_keys_unknown（「このエージェントの質問は、ここからは答えられません」）、chat_route、partial_sent、unconfirmed、keys_sent を足す。
			答え済みの判定（`agent-view.js` の buildChat）：同じ callId の tool-result と結びつけるのは answerVia keys の質問だけにする（message の質問の受付の tool-result では答え済みにしない。answerVia のない古い物は今の source の規則）。keys の質問は、同じ callId の tool-result が isError なら state を `declined` にし（閉じた形、題は「答えずに閉じられた質問」、要約は結果の文）、isError でなければ今のとおり answered。message の質問は、後の role user の件（`undelivered` の件を除く）の text が、どれかの問いの引用（`> ` と、改行の続きを空白1つにした問いの文と空行）で始まるか空行の後に含めば answered にし、answerText はその文。`buildQuestionCard` は declined を閉じた形として扱う。
			keys の未回答のカードには、送るボタンの近くに1行の注「Orca の画面で途中まで答えた質問は、Orca で続けてください」を出す（F-02）。truncated の message の質問は `{ok: false, reason: prompt_unsupported の言葉, open: true}`。
			`question-dom.js` は partial の帯と「Orca で開く」（今の `createOpenControl`）を描く。`agent.css` は帯の見た目（`--ds-*` を先に、明暗、390px で折り返す）。
			"""
		satisfies: ["R-02", "R-04", "R-05", "R-06", "R-07", "R-08"]
	}
	"D-08": {
		title: "文書と実機の確かめ"
		text: """
			README.md と AGENTS.md に、答え方（rpc・keys・message）、キーの組の門、確かめ、途中で止めること、二度と送らないこと、承認が後の Issue であることを書く。
			実機：端末のキーの組の実機の確かめは本人の確かめに残す（統括の判断 2026-11-18。試しのエージェントを端末で立てる道が決まらないため）。README と report.md に、interactivePrompt・toolName が listAll に出なければ keys の答えはいつも prompt_unverified で送らず止まる（安全側）という残る危険と、本人の確かめの手順を書く。タスク担当は、試しの orca-web（別のポート、専用の settings で sendEnabled を真）と `npm run trial` の試しの画面で、試しのエージェント（構造化 Chat の Codex）に無害な後の発言の質問を出させ、小窓から答え、エージェントが答えを受け取ったことを会話の状態で確かめる。sendEnabled 偽でカードが読めて押せないことも見る。Mac の幅と 390px、明暗の写しを Scope の artifacts に置く（会話の中身は写さない）。試しのエージェントは止める。
			"""
		satisfies: ["R-02", "R-06", "R-08"]
	}
}

compatibility: """
	会話の文書は schema `orca-web.transcript/v1` のまま、質問の部分に answerVia と preview が増え、request_user_input_async が質問の部分になる。画面は同じサーバーが配る。
	`/api/answer/intent` は今の物（prompt）をそのまま受ける。送信の記録は before の行に mode・callId・totalGroups が増える。今の行の形は変えない。戻した版は callId の答えの行を今の rpc の行として読まないよう、parseRow が mode keys・message の before を読まないかを確かめる（読めば照会が誤る。戻すときは答えの照会を信じず、Orca の画面で確かめる）。
	"""

risks: [
	"タブの agentStatus に interactivePrompt と toolName が出ない Orca では、keys の答えはいつも prompt_unverified で送れない（安全側。実機の確かめは本人の確かめに残す）",
	"送る前に利用者が Orca の画面で同じ質問を途中まで進めていると（複数問の1問目だけ答えた、行を矢印で動かした、文を書きかけた）、ツールの結果も interactivePrompt も変わらないので確かめで見分けられず、列が先頭からの前提でずれて届きうる。Orca 自身のカードも同じ前提で送る。カードに注を出して知らせる（F-02）",
	"組の間に利用者が Orca の画面でも操作すると、列が途中から食い違う。送る前の確かめは最初の組の前だけ（Orca と同じ）。途中の失敗は止めて知らせる",
	"keys の答えは数秒（組の数×1秒）かかり、その間は SendService の busy でほかの送信を受けない",
	"orca-web が desktop のクライアントとして送るので、Orca は答えたことを入力から推さない（observeQuestionAnswerSend）。状態の印は次のフックまで待つことがある。カードはツールの結果で閉じる",
	"会話の末尾 200 件より前の質問は見つからず、答えられない（question_gone）",
]
