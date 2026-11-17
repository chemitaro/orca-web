package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"8件の小さな欠けを、それぞれ1か所の変更で直す（今の部品の中で直し、新しい部品を作らない）",
	"迷う応答は結果不明の方へ倒し、自動で送り直さないことを保つ",
	"並行の iss-00054 との重なりを小さく保つ（契約と関数の名前を変えない）",
]

current: "requirement.cue の background の (a)〜(h) のとおり（開始のコミット 253a1a6）。"

target: "端末の承認は今のセッションにだけ付き、確かめの段は送れないとき押せず、カードの確定の 5xx と応答なしは結果不明になり、長い答えが口に入り、キーの組は1組目の前にも前面を確かめ、使わない RPC で止まらず、カードの「Orca で開く」は 44px になる。"

design: {
	"D-01": {
		title: "端末の承認の付け先（`src/orca/read-transcript.ts`）"
		text: """
			`terminalPromptFromTabs(listAll, agentId)` に3つ目の引数 `sessionId: string` を足す。agentId のタブが見つかり agentStatus があっても、`agentStatus.providerSession.id`（文字）が sessionId と違うか、文字でなければ null を返す。`read` の nativeChat の最新のページで `target.sessionId` を渡す。
			ほかの呼び手はない（`grep terminalPromptFromTabs` で確かめる）。返す3つの項目と、ほかの項目を写さないことは変えない。
			"""
		satisfies: ["R-01"]
	}
	"D-02": {
		title: "確かめの段の押せる・押せない（`web/embed/approval-view.js`、`approval-dom.js`）"
		text: """
			`buildApprovalCard` の `confirm` に `disabled: boolean` を足す。値は `!(part.answerable === true && availability.ok === true)`。`confirm` を出す条件（pendingOption があり、流れが idle か refused）は変えない。
			確かめの段がある間も、送れないときは `reasonText`（availability.reason）を出す（今のとおり `availability.ok !== true` なら出る）。
			`renderApprovalCard` は「<ラベル>で答える」のボタンを `view.confirm.disabled` で disabled にし、「やめる」は常に押せる。板の `confirm` は今のとおり送れないとき何もしない（二重の守り）。
			トークンは writer が取り直すので、カードは扱わない（requirement の decisions）。
			"""
		satisfies: ["R-02"]
	}
	"D-03": {
		title: "確定の応答の読み方と時間切れ（`web/embed/question-view.js`）"
		text: """
			question-view.js に1か所の小さな関数を置き、`sendIntentConfirm` と `createCallAnswerer` の両方が使う：
			- `PRE_SEND_5XX = new Set(['unsupported', 'unknown_shape', 'unreachable', 'record_failed', 'record_unreadable'])`（サーバーの SEND_ERROR_STATUS の 5xx の識別子。サービスはこれらを送る前にだけ返す）。
			- `confirmRefused(res)`：`res.body.ok === false` で `error` が文字のとき、`res.status < 500` か `PRE_SEND_5XX.has(error)` なら真。それ以外（5xx の internal_error、知らない識別子）は偽で、呼び手は結果不明（`sendIntentConfirm` は `{kind: 'unknown', operationId}`、`createCallAnswerer` は今の `lost(operationId)`：keys は partial、message は unknown）にする。
			- `withTimeout(promise, ms, timer)`：送る欄と同じ形（時間切れで投げる、届いた方で時計を止める）。時計は注入できる（`deps.setTimer`・`deps.clearTimer`、既定は setTimeout）。
			- 時間切れの値：意図 30_000ms、確定 60_000ms、端末のキーの組（`createCallAnswerer` の mode keys）の確定 300_000ms。`sendIntentConfirm` の step と `createCallAnswerer`・`createChatAnswerer`・`createChatApprover`（approval-view.js）の deps に任意の `timeouts?: {intentMs, confirmMs}` と `setTimer`・`clearTimer` を足す（テストが短くする）。
			- 意図の時間切れ・例外は今の catch と同じ（refused network。keys・message の意図も同じ）。確定の時間切れ・例外は今の catch と同じ（結果不明、keys は partial）。時間切れの後に届いた応答は Promise が既に決まっているので捨てられる。
			送る欄（send-view.js）は変えない。
			"""
		satisfies: ["R-03", "R-04"]
	}
	"D-04": {
		title: "答えの口の本文の上限と、画面の長さの確かめ（`src/server/app.ts`、`web/embed/question-view.js`）"
		text: """
			サーバー：`MAX_ANSWER_BODY_BYTES = 640 * 1024` を置き、`/api/answer/intent`・`/api/answer/confirm`（answering の道）だけ `readBody(req, MAX_ANSWER_BODY_BYTES)` にする。ほかの書き込みの道（`/api/send/*`、`/api/approval/*`）は今の 128KiB のまま。`parseAnswerConfirm` の ticket の長さの確かめは変えない。
			根拠：問い4つ × その他 64KiB（制御文字は送れないので、JSON の逃がしで増えるのは `"` と `\\` の2倍まで）= 512KiB と、封筒（agent 512 字、callId、prompt、ticket、questionId・optionIds）の余り 128KiB。
			画面：`buildAnswers` の最後に、`byteLength(JSON.stringify(answers)) > MAX_ANSWERS_JSON_BYTES`（512 * 1024）なら `{ok: false, reason: 'too_large'}` を返す（answerVia によらない。message の 16KB の確かめは今のまま先にある）。カードの今の reason の表示（too_large の言葉）を使う。
			"""
		satisfies: ["R-05"]
	}
	"D-05": {
		title: "1組目の前の前面の読み直し（`src/orca/send.ts` の `answerKeys`）"
		text: """
			組の繰り返しで、`sleep(ANSWER_STEP_MS)` は今のとおり2組目からだけにし、`readForeground` の読み直しと照合（`!foreground.ok || foreground.isShell || !foreground.matchesAgent` なら `stopped()`）を1組目の前にも行う。1組目の前に止まれば sentGroups は0なので refused（not_sent）。続く画面の質問の読み直しは今のまま。
			"""
		satisfies: ["R-06"]
	}
	"D-06": {
		title: "キーの組の門の止める集合（`src/send/service.ts`）"
		text: """
			`KEYS_METHODS = new Set(['terminal.send', 'terminal.agentStatus', 'terminal.inspectProcess', 'session.tabs.listAll', 'nativeChat.readSession'])` を置き、`#blockedFor` に鍵 `'keys'` を足す：`[...(this.#blocked.get('terminal') ?? [])].filter((m) => KEYS_METHODS.has(m))`。`#check` の status の answerKeys の門、keys の preflight、status の `answerKeys` の項目（`#gate(cap, 'answerKeys', …)` の3か所）で `this.#blockedFor('keys')` を使う。`#block` の記録の仕方（鍵は route）と、今の送信の門（`#blockedFor(target.route)`）は変えない。
			"""
		satisfies: ["R-07"]
	}
	"D-07": {
		title: "カードの「Orca で開く」の高さ（`web/embed/agent.css`）"
		text: """
			agent.css の `.question-foot` の規則の近くに、共有の部品の変数を上書きする規則を足す：`.question-foot .orca-open[data-size]`（`open-control.css` の `.orca-open[data-size="md"]` より詳しい指定）で `--orca-open-height: 44px`。アイコンと文字の大きさは md のまま。`open-control.css` と `open-control.js` は変えない。
			"""
		satisfies: ["R-08"]
	}
	"D-08": {
		title: "守りの保ち方"
		text: """
			D-03 は結果不明の側へだけ倒す（送る前の拒みと読む場合を狭める）。どの変更も、自動の送り直し、照会のほかの読み、新しい書き込みの RPC を足さない。同じ票は TicketStore が、同じ callId は SendJournal.hasAnswer が今のとおり拒む。
			"""
		satisfies: ["F-01", "F-02"]
	}
}

compatibility: "応答の形、口、記録の形は変わらない。`terminalPromptFromTabs` の引数が1つ増える（内部の関数）。`/api/answer/*` の本文の上限だけが上がる。"

risks: [
	"並行の iss-00054 が approval-view.js（端末の approver）と service.ts（承認のキーの列の門）を触る。マージの前に origin/main を取り込み、テストとゲートをやり直す",
	"キーの組の確定の時間切れ 5 分を超えて Orca の読みが遅いとき、届いたのに partial と示しうる（押し直せない形なので安全側）",
]
