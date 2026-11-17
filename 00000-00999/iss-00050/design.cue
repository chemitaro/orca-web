package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"承認を、構造化 Chat と端末のエージェントで同じ形の部分にし、画面は1つのカードの部品で描く",
	"答えの送信は、質問の答え（iss-00048）の道（票、記録、処理中の印、照会、sendEnabled、書き込みの守り、revision の比較）を共有し、送る RPC だけを `agentSession.respondToApproval` にする",
	"質問のカードの部品（`question-view.js` の流れ、理由の言葉、送る流れ、見た目）を使い、契約（answerer、answererFor）は変えない（並行の iss-00049 が端末の手段を差し替えるため）",
]

current: """
	`src/transcript/normalize.ts` は journal の approval を `{type: 'unsupported', what: 'approval'}` にする。端末のエージェントの許可の確認は会話に出ない（待っているツールの呼び出しだけが見える）。
	質問の答えは `SendService.answerIntent`・`answerConfirm`（`src/send/service.ts`）、門 `SendRpc` の `chatAnswer`（`src/orca/send-gates.ts`）、アダプターの `answerChat`・`readQuestion`・`checkAnswer`（`src/orca/send.ts`）、記録の before の `action: 'answer'`（`src/send/journal.ts`）、HTTP の `/api/answer/*`（`src/server/app.ts`）、画面の `question-view.js`・`question-dom.js`。
	"""

target: """
	会話の API は承認を `{type: 'approval', …}` の部分で返し、端末のエージェントが許可を待つ間は会話の最後に端末の承認の件を足す。画面は承認の行を承認のカードで描く。
	サーバーは `POST /api/approval/intent`・`/api/approval/confirm` を持ち、SendService の approvalIntent・approvalConfirm が、今の票と記録と処理中の印を使って `agentSession.respondToApproval` を1回だけ送る。照会は今の `GET /api/send/{操作の ID}` が承認の記録も扱う。
	"""

design: {
	"D-01": {
		title: "会話の正規化の承認の部分（`src/transcript/normalize.ts`）"
		text: """
			`TranscriptPart` に `ApprovalPart` を足す：
			```
			{ type: 'approval'; source: 'chat' | 'terminal';
			  prompt: { itemId: string; revision: number } | null;   // chat だけ
			  title: string | null;          // chat の title。terminal は null
			  tool: string | null;           // chat の displayName、terminal の approval.tool
			  description: string | null;    // chat の description、terminal の approval.summary
			  reason: string | null;         // decisionReason
			  blockedPath: string | null;
			  plan: { text: string; filePath: string | null } | null;   // subject.kind が plan のとき
			  detail: string | null;
			  options: { id: string; label: string; description: string | null;
			             intent: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always' | null }[];   // 16件まで
			  answerable: boolean;
			  unanswerableReason: 'url' | 'newer_subject' | 'terminal' | null;
			  state: 'pending' | 'answered' | 'cancelled';
			  selectedOptionId: string | null;   // answered のときの resolution.selectedOptionId（選択肢にあるときだけ。なければ null）
			  truncated?: true }
			```
			構造化 Chat（normalizeJournalItems の kind 'approval'）：`parseJournalApproval(item)`（export。送るアダプターの読みも使う）が読む。`itemId` は文字、`revision` は正の整数、`title` は文字、`detail` は文字か null、`options` は配列で各件の `id`・`label` は文字（空でない）、`description` は任意の文字、`intent` は任意で4つのどれか（知らない値は null にする。Orca の isAgentJournalPromptIntent と同じ）、`resolution.state` は3つのどれか。違えば今のまま unsupported（approval）にする（F-03）。`subject` がなければ answerable 真、`{kind: 'plan', text: 文字}` なら plan を作り answerable 真、`{kind: 'url'}` なら answerable 偽で unanswerableReason 'url'（url の文字は部分に出さない）、ほかの種類（または形の違う plan）は answerable 偽で 'newer_subject'。選択肢が0件なら answerable 偽で 'newer_subject'。
			blockedPath は、Orca の approvalBlockedPathToShow と同じく、description・decisionReason・（plan なら plan の本文とファイル、なければ detail の先頭）に同じパスが出ていれば null にする（同じパスを2回描かない）。簡単な部分一致（前後の文字の判定は Orca の containsWholePath と同じ）でよい。
			端末（D-02 が読みに添える `terminalPrompt`）：`normalizePage(page)` は、`page.terminalPrompt` があり、その `state` が 'blocked' か 'waiting' で、`interactivePrompt` が JSON の物で `approval` の鍵が物、`approval.tool` が空でない文字のときだけ、会話の最後に件 `{id: 'pending-approval', role: 'assistant', at: stateStartedAt の ISO（なければ null）, parts: [ApprovalPart（source terminal、prompt null、tool、description は summary か null、options []、answerable 偽、unanswerableReason 'terminal'、state 'pending'）]}` を足す。読めなければ足さない（F-05）。
			上限：題・道具・ラベル 500 字、説明・理由 2,000 字、要るパス・計画のファイル 1,000 字、detail 8,000 字、計画の本文 16,000 字、選択肢 16 件（超えれば unsupported）。切ったら `truncated: true`。message の shortened も今と同じく truncated にする。
			UnsupportedWhat の 'approval' は残す（知らない形のため）。question・diff・status・plan は変えない。
			"""
		satisfies: ["R-01", "F-03", "F-05"]
	}
	"D-02": {
		title: "会話の読みに、端末のエージェントの待っている許可の確認を添える（`src/orca/read-transcript.ts`）"
		text: """
			`RawPage` に任意の `terminalPrompt?: { state: unknown; interactivePrompt: unknown; stateStartedAt: unknown } | null` を足す。`read(target, options)` は、source が nativeChat で `options.before` がない（最新のページの）読みのときだけ、今の `listAll()`（1秒の間は共有）を読み、`resolveFromTabs` と同じ規則で agentId のタブを探し、その `agentStatus` の `state`・`interactivePrompt`・`stateStartedAt` の3つだけを `terminalPrompt` に入れる（ほかの項目は写さない）。タブがない・一覧が読めないときは null（会話の読みは失敗にしない）。agentSession と古いページは添えない。
			見張り（`hub.ts`）と `GET /api/transcript` は今のまま `normalizePage(read.page)` を呼ぶので、端末の承認の件は最新の窓の最後に出入りする。消えたときは今の差分（`diffWindow`）が置き換えにする。
			interactivePrompt は応答には D-01 の決めた項目（tool と summary）だけが出る。録画の仮名化は今の FREE_TEXT_KEYS（interactivePrompt を含む）のまま。
			"""
		satisfies: ["R-01", "F-05"]
	}
	"D-03": {
		title: "承認の答えの送る門とアダプター（`src/orca/send-gates.ts`、`src/orca/send.ts`、`src/orca/capabilities.ts`）"
		text: """
			門 `SendRpc` に、決めた形の `agentSession.respondToApproval` だけを足す：鍵がちょうど `envelope`、`itemId`、`expectedRevision`、`optionId`。envelope は今の chatAnswer と同じ検査、`itemId` は空でない文字、`expectedRevision` は正の整数、`optionId` は空でない 1024 字以下の文字。ほかの鍵（`answers` など）は通さない。
			アダプターに `answerApproval(target: ChatSendTarget, prompt: {itemId, revision}, optionId, operationId, fence): Promise<SendResult>` を足す。params は `{envelope: {sessionId, clientOperationId: operationId, expectedRuntimeFence: fence, payloadFingerprint}, itemId, expectedRevision: revision, optionId}`、指紋は `sha256(canonicalize({method: 'agentSession.respondTo:approval', sessionId, fields: {itemId, expectedRevision, optionId}}))`（今の canonicalize）。timeoutMs 15000。結果の分け方は今の `classifyAnswer` と同じ規則（resolution.state の resolved は submitted、cancelled は refused、pending は unknown、refusal は refused とその code、RPC の失敗は今の failure。method は respondToApproval で記す）。共通の部分は関数にまとめてよい。
			読み `readApproval(sessionId, itemId): Promise<SendRead<ApprovalRead>>`（`ApprovalRead = {fence, revision, state, options, answerable, selectedOptionId}`）：今の readQuestion と同じく `agentSession.history`（tail、limit 200）を1回読み、itemId の項目を `parseJournalApproval` で読む。項目がなければ `{ok: false, error: 'question_not_found'}`（今の値を承認にも使う。名前は変えない）、読めなければ（approval でない項目を含む）`unknown_shape`。
			照会 `checkApproval(target, prompt, digest, operationId)`：readApproval で今の状態を読み、answered で `digestOption(selectedOptionId)` が記録の digest と同じなら submitted（code 'resolved'）、違えば refused（code 'resolved_by_other'）、selectedOptionId が null なら unknown（'resolved_unverified'）、cancelled なら refused（'cancelled'）、pending なら unknown（'prompt_pending'）、項目がなければ unknown（'question_not_found'）。送り直さない。
			能力 `answerApproval`（FeatureName に足す）：`capability:agent-session.structured.v1`、`runtime-id:consistent`、`feature:readTabs`、`feature:readTranscript` を要し、`rpc:agentSession.respondToApproval` を defer にする（question-answers.v1 は要らない）。
			"""
		satisfies: ["R-03", "R-05", "F-01", "F-02", "F-03"]
	}
	"D-04": {
		title: "承認の答えの送信のサービス（`src/send/approval.ts`（新）、`src/send/service.ts`、`src/send/ticket.ts`、`src/send/journal.ts`）"
		text: """
			`src/send/approval.ts`（純な関数）：
			- `checkOption(approval: {options, answerable}, optionId: unknown, confirmPersistent: unknown): {ok: true, option} | {ok: false, error: 'invalid_answer', reason}`。answerable が偽なら reason 'not_answerable'、optionId が空でない 1024 字以下の文字でなければ 'invalid_option'、選択肢になければ 'unknown_option'、選んだ選択肢の intent が allow_always か reject_always で confirmPersistent が `true` でなければ 'persistent_unconfirmed'。
			- `digestOption(optionId: string): string` は `sha256(canonicalize({optionId}))`。
			票 `TicketInput` に任意の `approval: {itemId, revision, optionId, intent}` を足す（承認の票だけが持つ）。今の confirm・answerConfirm は承認の票を受けない（ticket_invalid wrong_kind）、approvalConfirm は送信と質問の票を受けない。
			`SendService.approvalIntent({agent, target?, prompt, optionId, confirmPersistent?})`：sendEnabled（偽なら send_disabled）、preflight（mode 'approval'。route が chat でなければ `{error: 'not_sendable', reason: 'terminal_route'}`、能力 answerApproval がなければ unsupported と missing、method_not_found で止めた鍵は 'approval'）、指紋の比べ（今の intent と同じ）、readApproval（state が pending でないか revision が違えば `{error: 'target_changed', reason: 'question_changed'}`、項目がなければ reason 'question_gone'。理由の名前は質問と同じものを使い、画面の言葉の表を共有する）、checkOption（誤りは `{error: 'invalid_answer', reason}`、HTTP 400）の順。通れば票を出し `{ticket, expiresAt, operationId, preview, digest, intent}` を返す。
			`SendService.approvalConfirm({ticket, optionId})`：今の answerConfirm と同じ順（busy、sendEnabled、票の取り出しと処理中の印を同じ同期の処理で、票の種類、optionId が票と同じか（違えば target_changed 'answer_changed'）、preflight と宛先の比べ）に加えて、readApproval で同じ itemId が pending で revision が票と同じことと、checkOption が今の選択肢で通る（confirmPersistent は意図で確かめたので、ここでは票の intent が今の選択肢の intent と同じことを確かめる。違えば target_changed 'question_changed'）ことを確かめ、送る前の記録を書いてから answerApproval を1回だけ呼び、後の記録を書く。拒みは今の #refuse で記録する。
			記録：before の行に `action: 'approval'`、`route: 'chat'`、`prompt: {itemId, revision}`、`intent`（選択肢の intent か null）、`digest` を書き、`text`・optionId・ラベルを書かない。parseRow は action が 'approval' の before を、prompt と intent（4つの値か null）があれば読む。今の送信と質問の行の形は変えない。`check(operationId)` は before の action が approval なら checkApproval で照会する。
			status：`SendService.status` の応答に `approval: {available: boolean, reason: string | null}` を足す（今の answer と同じ決め方で、能力 answerApproval と止めた鍵 'approval' を見る）。
			"""
		satisfies: ["R-03", "R-04", "R-05", "R-06", "F-01", "F-02"]
	}
	"D-05": {
		title: "承認の答えの HTTP の口（`src/server/app.ts`）"
		text: """
			`POST /api/approval/intent`：物は `{agent, prompt: {itemId, revision}, optionId, confirmPersistent?, target?}` の鍵だけ（ほかの鍵、形の誤りは 400 invalid_request。agent・target・prompt の検査は今の `/api/answer/intent` と同じ、optionId は 1〜1024 字の文字、confirmPersistent は真偽）。
			`POST /api/approval/confirm`：物は `{ticket, optionId}` の鍵だけ。
			どちらも今の送信の書き込みと同じ守り（checkSameOriginWrite の POST、checkToken、本文の上限、拒みの数の記録）を通し、誤りの HTTP の状態は今の SEND_ERROR_STATUS。成功は 200 で `ok` を除いた物。
			照会は今の `GET /api/send/{操作の ID}`、送れるかは今の `GET /api/send/status`（approval の項目が増える）。
			"""
		satisfies: ["R-05", "R-06"]
	}
	"D-06": {
		title: "承認のカードの部品（`web/embed/approval-view.js`、`approval-dom.js`（新））と小窓への組み込み"
		text: """
			`approval-view.js`（純な関数と注入した口だけ）：
			- 流れは `question-view.js` の `initialFlow`・`reduceFlow`（idle → sending → done | refused | unknown）を使う。言葉は `approval-view.js` の `APPROVAL_REASONS`（`QUESTION_REASONS` を引き継ぎ、「質問」と書く言葉を承認の言葉で上書きした表）の1か所から引く：question_changed「許可の確認が変わりました」、question_gone「許可の確認が見つかりません。Orca で確かめてください」、cancelled「許可の確認は取り消されました」、prompt_pending「許可の確認はまだ答えを待っています」、unsupported「この Orca の版では、ここから許可に答えられません」、resolved_unverified「許可の確認は答え済みですが、この答えか確かめられません」、question_not_found「許可の確認が見つかりません」、not_answerable「この許可は小窓では答えられません」、persistent_unconfirmed「確かめてから答えてください」、unknown_option・invalid_option「選択肢が変わりました」。引き継いだ表のうち「質問」を含む言葉は、ここに挙げたもののほかもすべて承認の言葉に上書きする（テストで「質問」の字が出ないことを確かめる）。今の QUESTION_REASONS は変えない。
			- カードごとの状態 `{flow, pending: optionId | null}`。`pending` は常に許可の確かめの段にいる選択肢。`choose(state, part, optionId)`：intent が allow_always・reject_always なら `pending` にする（送らない）、ほかは送る印を返す。`cancelPending(state)` で戻す。
			- `persistentNote(part, option)`：何が以後省かれるかの1行。選択肢の説明があればそれ、なければ allow_always は「以後、同じ種類の確認が省かれ、自動で許可されます（<tool か title>）」、reject_always は「以後、同じ種類の確認が省かれ、自動で拒否されます（<tool か title>）」。
			- `buildApprovalCard(part, {state, availability})`：描く物 `{key, closed, state, title, tool, description, reason, blockedPath, plan, detail: {preview, full, hasMore} | null, options: [{id, label, description, primary, disabled, busy}], confirm: {optionId, label, note} | null, summary, notice, reasonText, open: boolean, truncated}`。題がなければ「許可の確認」。detail の preview は Orca の approvalDetailPreview と同じ（先頭 512 字・4 行、続きがあれば「…」）。plan があるときは plan を描き、detail は null にする（Orca の計画の承認は detail に同じ計画の本文を入れ、Orca のカードも plan があれば detail を描かない）。answered・cancelled なら closed で、summary は answered なら intent による言葉（allow_*「許可しました」、reject_*「拒否しました」、なし「答えました」）とラベル、selectedOptionId が選択肢になければ「答え済み」、cancelled は「取り消されました」。
			- 答える手段（approver）の契約：`{availability(part, status): {ok: true} | {ok: false, reason, open?: true}, submit(part, optionId, {confirmPersistent}): Promise<FlowResult>, check?(operationId)}`。`createChatApprover({agentId, writer, read?})`（構造化 Chat：`/api/approval/intent` と `/confirm` を続けて1回ずつ送る。照会は `/api/send/{操作の ID}?check=1`）と、読むだけの `readOnlyApprover`（source terminal は「端末のエージェントの許可は、Orca で答えてください」、answerable 偽の chat は「この許可は Orca で答えてください」、どちらも open 真）。`approverFor(part, approvers)` が source と answerable で選ぶ。質問の createChatAnswerer と HTTP の手順が同じ部分（意図→確定→結果の分け方→照会）は、`question-view.js` の中の共有の関数に移して両方が使ってよい（createChatAnswerer の外の振る舞いと export は変えない）。
			- 板 `createApprovalBoard({approvers, onChange})`：key ごとの状態を描き直しや追記でも保つ。`choose(key, part, optionId, status)`、`confirm(key, part, status)`（pending の選択肢を confirmPersistent 真で送る）、`cancel(key)`、`query(key, part)`、`dismiss(key)`、`prune(keys)`。送れる（answerable、availability が ok、flow が idle か refused、part が pending）ときだけ submit を1回呼ぶ。sending の間の押しは捨てる。自動で送り直さない。
			`approval-dom.js`：textContent と createElement だけで描く。カードは `section.question-card.approval-card`（質問のカードと同じ枠と見た目の規則を使う）、選択肢は `button.question-option`（主の選択肢に `data-primary`）、確かめの段は `div.approval-confirm`（1行と2つのボタン）、detail は `pre.approval-detail`（white-space: pre-wrap、overflow-wrap: anywhere）と「詳しく」の `details`、閉じた形は `details`（summary に題と結果）。押しは data 属性（`data-action`、`data-option`）で親が受ける。open の操作は今の `createOpenControl`（新しく作らない）で、390px 以下でも出す。
			`agent-view.js` の buildChat：approval の部分を `{kind: 'approval', key, at, part}` の行にする（ツールの結果とは結びつけない）。`agent-dom.js` の renderChatRow は approval の行を approval-dom.js に任せる。`agent-frame.js` は承認の板を持ち、今の `/api/send/status` の読み（enabled と approval）で availability を決め、状態が変わったら承認の行を描き直す（今の質問の行と同じ仕組み）。
			`agent.css`：承認のカードの差分だけを足す（確かめの段、detail の等幅の塊、主の選択肢）。`--ds-*` を先に、明暗。選択肢は今の question-option と同じ（全幅、min-height 44px、折り返し）。
			`src/server/app.ts` の STATIC_FILES に2つのファイルを足す。
			"""
		satisfies: ["R-02", "R-03", "R-04", "R-06", "R-07", "F-01", "F-04"]
	}
	"D-07": {
		title: "文書、実機の確かめ、次の Issue の案"
		text: """
			README.md と AGENTS.md に、承認の部分、承認の答えの口、常に許可の確かめ、端末の承認は読むだけであることを書く。
			実機：試しの orca-web（別のポート、専用の settings で sendEnabled を真）と `npm run trial` の試しの画面で、試しのエージェント（構造化 Chat の Claude haiku）に、許可の要る無害な操作（試しの worktree の中の決めた一時ファイルを作るなど）をさせ、承認のカードが出ることと、小窓から「許可」で答えて操作が進むこと、別の承認で「拒否」で答えて止まることを確かめる。常に許可の確かめの段の「やめる」で何も送られないことも見る。端末の Claude Code の試しのエージェントで permission prompt を出させ、カードが読め答えるボタンがないことを見る（agentStatus の interactivePrompt がタブの一覧に載ることの確かめ。載らなければ記録し、Residual Risks に書く）。試しのエージェントは確かめの後に止める。sendEnabled を偽にした試しの orca-web で、カードが読めて押せないことも見る。Mac の幅と 390px、明暗の写しを Scope の artifacts に置く（会話の中身は写さない）。
			report.md に、端末のエージェントの許可への答え（iss-00049 のキーの列の仕組みを使う）の次の Issue の案を書く：Orca の readAgentPromptAnswers と同じ選択肢（allow_once・reject_once）とキー（許すは Claude が Enter、Codex が決めたキー、拒むは Escape）、送る前の状態の確かめ、途中まで届いた状態、照会。
			"""
		satisfies: ["R-03", "R-06", "R-07"]
	}
}

compatibility: """
	会話の文書の schema は `orca-web.transcript/v1` のまま、部分の種類が1つと、端末の承認の件（id 'pending-approval'）が増える。画面は同じサーバーが配るので互換の問題はない。
	送信の記録は before の行に action 'approval' のものが増える。今の行の形は変えない。戻した版は action 'approval' の before を読まない（今の parseRow が捨てる）ので、after のない承認の操作は戻した版の照会で not_sent と誤って示されうる。戻すときは承認の照会を信じず、Orca の画面で状態を見る。
	"""

risks: [
	"Orca の journal の approval の形が後の版で変わると、unsupported に戻る（F-03）",
	"タブの一覧の agentStatus に interactivePrompt が載らない版では、端末の承認のカードは出ない（今と同じ。安全側）。S-04 で確かめる",
	"history の tail 200 件より前の承認は readApproval で見つからず、答えられない（question_gone）。未回答の承認はふつう末尾にあるので許す",
	"端末の承認の件は最新の窓の最後に出入りするので、出入りのたびに置き換えの描き直しになる（件の数は小さいので許す）",
]
