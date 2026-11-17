package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "iss-00048・iss-00049・iss-00050 の最終品質ゲートの P2/P3 の小さな直し。今の答えの道（票、記録、照会、revision の比較、自動で送り直さない）は変えず、表示の正確さと、誤った宛先・送れない状態での押しを減らす"
}

purpose: """
	`/embed/agent`（エージェントの詳細とチャットの小窓）の質問と承認のカードと、その答えの道に残った小さな欠けを直す。
	どれも「送ってしまったかもしれないのに、押し直せると示す」「送れないのに押せる形で残る」「別のセッションの物を付ける」「答えられるのに止める」の類いで、見た目と守りを今の部品にそろえる。
	"""

background: """
	統括の依頼（2026-11-18）：iss-00048（PR #52）・iss-00050（PR #53）・iss-00049（PR #56、マージ済み 253a1a6）の最終品質ゲートの P2/P3 と report.md の次の提案を直す。直す価値のないものは理由を書いて外してよい。
	タスク担当がコード（開始のコミット 253a1a6）で確かめた事実：
	- (a) iss-00050 P2-a：`src/orca/read-transcript.ts` の `terminalPromptFromTabs` は、タブの agentStatus の interactivePrompt を、タブの `providerSession.id` と見張りの target の `sessionId` を比べずに返す。見張り（`src/transcript/hub.ts`）が古い target で読む間、新しいセッションの許可の確認が古いセッションの会話の末尾に付きうる。
	- (b) iss-00050 P2-b：`web/embed/approval-view.js` の `buildApprovalCard` は、常に許可の確かめの段（`confirm`）を availability と answerable によらず出し、`approval-dom.js` は「<ラベル>で答える」を常に押せる形で描く。板の `confirm` は送れないとき何もしない（安全側だが、押しても何も起きない）。トークンの取り直しは `web/write.js` の writer が自動で行い（401 で1回取り直す）、取れなければ送る前の拒み（network）になって押し直せるので、カードの側で別に扱う要はない。
	- (c) iss-00048 P2-a：`web/embed/question-view.js` の `sendIntentConfirm`（質問の構造化 Chat と承認が共有）と `createCallAnswerer` は、確定の応答が `ok: false` で `error` があれば、応答の status によらず送る前の拒みと読む。サーバーは取り扱いの外の例外を 500 `internal_error` で返し（`src/server/app.ts` の handle の catch）、それは送った後にも起きうる。
	- (d) iss-00048 P2-b：答えの流れ（`sendIntentConfirm`、`createCallAnswerer`）には時間切れがなく、応答のない通信でカードが「送っています…」のまま止まる。送る欄（`web/embed/send-view.js` の `createSendFlow`）は意図 30 秒、確定 60 秒の時間切れを持つ。
	- (e) iss-00048 P2-c：`/api/answer/*` の本文の上限は 128KiB（`readBody(req, 128 * 1024)`）。その他の文は1つ 64KiB まで（Orca の AGENT_SESSION_QUESTION_ANSWER_MAX_BYTES）、問いは4つまで（`MAX_QUESTIONS`）なので、64KiB の文を2つ書くと 413 になり、カードは理由の分からない拒みを出す。
	- (f) iss-00049 P2：`src/orca/send.ts` の `answerKeys` は、2組目からは組の前に前面のプロセスを読み直すが、1組目の前には読まない（送る前の preflight と before の記録の後、1組目を送るまでの間にエージェントが終わると、文と Enter がシェルに届きうる）。
	- (g) iss-00049 P2：`src/send/service.ts` は method_not_found で止めた RPC を経路（terminal）ごとに覚え、端末のキーの組の門（`answerKeys`）も同じ terminal の集合で止める。今の送信の確定の照会が `orchestration.requestShow` で method_not_found を受けると、それを使わない answerKeys まで unsupported になる。
	- (h) iss-00049 P3：質問と承認のカードの「Orca で開く」（`createOpenControl` の size md）は高さ 28px で、カードのほかのボタン（44px 以上）とそろわない。端末の質問では答える唯一の道になる。
	- iss-00048 の P3（FQG-01：空を許すその他に空の文で答えた質問の要約が「（答えなし）」）と P2-d（iss-00049 で扱った）は、依頼の範囲（P2 a〜c）の外なので扱わない。
	"""

includes: [
	"端末の承認の部分を、タブのセッションが見張りの target と同じときだけ付ける（a）",
	"常に許可の確かめの段の「<ラベル>で答える」を、送れないとき押せなくし、理由を出す（b）",
	"質問と承認のカードの確定の応答の読み方：5xx の知らない誤りは結果不明（c）",
	"質問と承認のカードの答えの流れに、送る欄と同じ時間切れ（d）",
	"`/api/answer/*` の本文の上限を、答えの最大に合わせて上げ、画面も上限を超える答えを送らず理由を出す（e）",
	"端末のキーの組の1組目の前にも前面を読み直す（f）",
	"`orchestration.requestShow` の method_not_found で端末のキーの組を止めない（g）",
	"質問と承認のカードの「Orca で開く」の押せる高さを 44px にする（h）",
	"README.md・AGENTS.md の説明の更新（変わる所だけ）、試しの画面（`npm run trial`）での写し（Mac の幅と 390px）",
]

excludes: [
	"iss-00048 の P3（FQG-01）と P2-d",
	"送る欄（`send-view.js`、`/api/send/*`）の振る舞いの変更",
	"端末の承認にキーの列で答えること（並行の iss-00054）",
	"共有の部品 `open-control.*` の大きさの表の変更（埋め込みのボタン、見出し、受け箱は今のまま）",
	"SpecDock 側の組み込み",
]

requirements: {
	"R-01": {
		title: "端末の承認の部分は、今のタブのセッションの会話にだけ付く"
		text:  "会話の最新のページに端末の待っている許可の確認を添えるのは、そのタブの `agentStatus.providerSession.id` が読んでいる target の `sessionId` と同じときだけにする。違うか読めなければ添えない（読み直しの後に新しい target で付く）。"
		acceptance: [
			"タブの providerSession.id が target.sessionId と違うとき、最新のページに terminalPrompt が添えられず、会話に端末の approval の件が出ない",
			"同じときは今のとおり添えられる",
		]
	}
	"R-02": {
		title: "常に許可の確かめの段は、送れないとき押せず、理由が出る"
		text:  "確かめの段にいる間に、送れなくなった（sendEnabled 偽、status が読めない、approval.available 偽、answerable 偽）ら、「<ラベル>で答える」を押せない形にし、送れない理由を出す。「やめる」は押せる。送れるようになれば、また押せる。"
		acceptance: [
			"availability が ok でないとき、確かめの段の「<ラベル>で答える」が disabled で、理由の文が出て、「やめる」は押せる",
			"availability が ok に戻ると押せる",
		]
	}
	"R-03": {
		title: "確定の 5xx の知らない誤りは、押し直せる形でなく結果不明として示す"
		text:  "質問（構造化 Chat、端末のキーの組、後の発言）と承認のカードで、確定の応答の `ok: false` を送る前の拒みと読むのは、応答の status が 5xx でないとき、または 5xx で error がサービスの送る前の拒みの識別子（unsupported、unknown_shape、unreachable、record_failed、record_unreadable）のときだけにする。ほかの 5xx（internal_error や知らない識別子）は、構造化 Chat と承認と後の発言では照会できる結果不明、端末のキーの組では途中まで届いたか分からない形（partial）にする。意図の応答の読み方は変えない（意図は書き込みの RPC を送らない）。"
		acceptance: [
			"確定が 500 internal_error を返すと、カードは結果不明（構造化 Chat・承認・後の発言は「確かめる」と「閉じる」、キーの組は partial）を出し、押し直せない",
			"確定が 503 record_failed や 409 target_changed を返すと、今のとおり送っていないとして押し直せる",
		]
	}
	"R-04": {
		title: "答えの流れは、応答のない通信で止まらない"
		text:  "質問と承認のカードの意図と確定に、送る欄と同じ時間切れ（意図 30 秒、確定 60 秒）を付ける。意図の時間切れは送っていない（network）として押し直せる形、確定の時間切れは R-03 と同じ結果不明（キーの組は partial）にする。端末のキーの組の確定は、組の間を1秒ずつ空けて組ごとに読み直すので、確定の時間切れを 5 分にする（問い4つ・選択肢9つの最多の組でも、読みが普通に返れば足りる長さ）。時間切れの後に届いた応答は捨てる。自動で送り直さない。"
		acceptance: [
			"意図の応答が来ないまま 30 秒たつと、カードは送っていないとして押し直せる形になる",
			"確定の応答が来ないまま時間がたつと、カードは結果不明（キーの組は partial）になり、送り直さない",
		]
	}
	"R-05": {
		title: "答えの最大の長さまで、答えの口が受け、画面は上限を超える答えを送らない"
		text:  "`/api/answer/intent`・`/api/answer/confirm` の本文の上限を、問い4つにそれぞれ 64KiB のその他の文を書いた答え（JSON の逃がしを含む）が入る大きさにする。ほかの書き込みの口の上限は変えない。画面は、送る答えの JSON の大きさがこの上限から封筒の分を引いた値を超えるとき送らず、理由「答えが長すぎます」を出す。"
		acceptance: [
			"64KiB のその他の文を2つ以上（4つまで）書いた構造化 Chat の質問の答えの意図と確定が、413 にならずサービスに届く",
			"上限を超える答えの本文は今のとおり 413 になり、画面は送る前に理由を出す",
			"`/api/send/*`・`/api/approval/*`・ほかの書き込みの口の上限は変わらない",
		]
	}
	"R-06": {
		title: "端末のキーの組は、1組目の前にも前面を読み直す"
		text:  "`answerKeys` は、1組目を含むすべての組の直前に、前面のプロセスを読み直し（シェルか、エージェントと合わなければ止める）、画面の質問を読み直す。組の間の間隔（Orca と同じ）は変えない。"
		acceptance: [
			"1組目の直前の前面の読みがシェルを示すと、何も送らず refused（not_sent）になる",
			"今の2組目以降の止め方と間隔は変わらない",
		]
	}
	"R-07": {
		title: "端末のキーの組は、使わない RPC の method_not_found で止まらない"
		text:  "端末のキーの組の門（answerKeys の可否、keys の preflight）は、method_not_found で止めた RPC のうち、キーの組が使う RPC（`terminal.send`、`terminal.agentStatus`、`terminal.inspectProcess`、`session.tabs.listAll`、`nativeChat.readSession`）だけで止める。今の送信の門は今のとおり terminal の集合のすべてで止める。"
		acceptance: [
			"`orchestration.requestShow` の method_not_found の後も、`/api/send/status` の answerKeys が available で、keys の意図が通る",
			"`terminal.send` の method_not_found の後は、今のとおり answerKeys も unsupported",
		]
	}
	"R-08": {
		title: "カードの「Orca で開く」は、押せる高さが 44px"
		text:  "質問と承認のカードの中の「Orca で開く」（`.question-foot` の中の共有の部品）の押せる高さを 44px 以上にする。共有の部品のほかの使い場所（埋め込みのボタン、`/embed/agent` の見出し、受け箱）は変えない。"
		acceptance: [
			"カードの「Orca で開く」のボタンの高さが、幅 1280px と 390px で 44px 以上",
			"見出しの「Orca で開く」と受け箱のボタンの大きさは変わらない",
		]
	}
}

failures: {
	"F-01": {
		title: "直しの後も、自動で送り直さず、同じ票・同じ callId に二度送らない"
	}
	"F-02": {
		title: "結果不明を送る前の拒みと取り違えない方へ倒す（迷う応答は結果不明）"
	}
}

constraints: [
	"実行時の依存を足さない。送る経路、再送の道、Orca への書き込みの種類を足さない",
	"答えの口と送る欄の契約（answerer・approver の形、`/api/answer/*`・`/api/approval/*` の意味）を変えない",
	"並行の iss-00054（端末の承認のキーの列）が `approval-view.js` と `src/send/` を触るので、変更を小さく保つ",
	"本人の方針：本人の環境に特化した決まりを入れず、普遍的でシンプルな仕組みにする",
]

decisions: [
	"8件すべてを直す（タスク担当、2026-11-18）。iss-00048 の P3 と P2-d は依頼の範囲外として扱わない",
	"(b) のトークン切れは、writer の自動の取り直しで足りるので、カードの側の変更は availability の反映だけにする（タスク担当、2026-11-18、根拠 `web/write.js`）",
	"(h) は共有の部品の表を変えず、カードの中だけで高さを上げる（受け箱と見出しは密な並びのため。タスク担当、2026-11-18）",
]
