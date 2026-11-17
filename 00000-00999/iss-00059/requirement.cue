package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "端末への1キーの書き込み（iss-00054）の画面の結果の示し方を直す。誤ると、送ったかもしれない答えを押し直せると示したり、送信中のまま止めたりする。サーバーの守り（二度と送らない記録）は変えないので二重送信にはならず、戻すのは PR を戻すだけで済む"
}

purpose: """
	`/embed/agent` の承認のカードで、端末のエージェントの許可の確認に1キーで答える手段（`web/embed/approval-view.js` の `createTerminalApprover`、iss-00054）の結果の示し方を、iss-00055 で質問の答えに入れた扱いにそろえる：
	- 意図と確定に時間切れを付け、応答のない接続で「送っています」のまま止まらない。
	- 確定の 5xx のうち、送る前にしか返らない識別子のほか（`internal_error` や知らない識別子）は結果不明（押し直せない帯と「Orca で開く」）にする。
	"""

background: """
	iss-00054（PR #58、3ddeb95）の最終品質ゲートの P2（主のレビュアーと ChatGPT の同じ根）：`createTerminalApprover` は、取り込んだ iss-00055 の `sendIntentConfirm` の時間切れと 5xx の分け方を使わず、確定の `500 {ok: false, error: 'internal_error'}` を押し直せる refused と示し（送ったかもしれないのに）、応答のない接続で「送っています」のまま止まる。二重の送信にはならない（サーバーの記録の `already_sent` で止まり、「Orca で開く」はいつも出る）。

	確かめた事実（main 3ddeb95 のコード）：
	- `web/embed/question-view.js` の `sendIntentConfirm` と `createCallAnswerer` は、`timing`（意図 30 秒、確定 60 秒、端末のキーの組の確定は 5 分）と `withTimeout` で待ち、意図の時間切れ・通信の誤りは送っていない refused（network）、確定の時間切れ・通信の誤りは結果不明にする。確定の `ok: false` は `confirmRefused`（4xx か、5xx でも送る前にだけ返す `PRE_SEND_5XX` の unsupported・unknown_shape・unreachable・record_failed・record_unreadable）のときだけ送る前の拒みと読み、ほかは結果不明にする。これらは export されていない（`sendIntentConfirm` だけ export）。
	- `createTerminalApprover` は時間切れを持たず、確定の `ok: false` と文字の error を、5xx でも `terminalRefusal`（押し直せる refused か blocked）にする。確定の 200 の refused は blocked、200 の unknown・応答の欠け・通信の誤りは partial（帯「届いたか分かりません。Orca で確かめてください」、押し直し・閉じる・照会を受けない）。
	- 板（`createApprovalBoard`）と流れ（`reduceFlow`）と描画（`approval-dom.js`）は partial・blocked・refused をすでに描ける。描画は変えなくてよい。
	"""

includes: [
	"`createTerminalApprover` の意図と確定の時間切れ（質問の答えと同じ既定：意図 30 秒、確定 60 秒。注入できる時計と長さ）",
	"`createTerminalApprover` の確定の `ok: false` の分け方を `confirmRefused` と同じにする",
	"そのために `question-view.js` の時間切れと確定の拒みの読み方を、承認の手段から使えるようにする（同じ関数を1か所に保つ）",
	"テスト（`test/web/approval-view.test.ts`）、AGENTS.md の1行、描画の写し（Mac の幅と 390px）",
]

excludes: [
	"サーバー（`src/`）の変更。答えの口、記録、二度と送らない守りは今のまま",
	"構造化 Chat の承認の手段（`createChatApprover`）と質問の手段の振る舞いの変更",
	"端末の承認の照会（check）を足すこと。結果不明は今のまま照会せず、Orca で確かめるよう示す",
	"カードの見た目と言葉の変更（partial の帯と言葉は今のものを使う）",
]

requirements: {
	"R-01": {
		title: "確定の 5xx の知らない誤りは結果不明として示し、押し直させない"
		text:  "端末の承認の確定の応答が `ok: false` で、status が 500 以上で、error が送る前にだけ返る識別子（unsupported、unknown_shape、unreachable、record_failed、record_unreadable）でないとき（`internal_error`、知らない識別子）、カードは partial（結果不明の帯、押し直し・閉じる・照会を受けない、「Orca で開く」）になる。"
		acceptance: [
			"確定が `500 {ok: false, error: 'internal_error'}` を返すと、submit の結果が `{kind: 'partial', operationId, note: APPROVAL_REASONS.unconfirmed}` で、送った回数は意図と確定の2回だけ",
			"確定が 5xx の知らない識別子（例 `503 {ok: false, error: 'something_new'}`）でも同じ partial",
			"板の流れでは partial の帯が出て、選択肢を押しても送らない",
		]
	}
	"R-02": {
		title: "確定の送る前の拒みは今のまま分ける"
		text:  "確定の `ok: false` が 4xx か、5xx の送る前の識別子のときは送っていないので、今のとおり `terminalRefusal`（TERMINAL_BLOCKING の reason は blocked、ほかは押し直せる refused）にする。200 の outcome の分け方（input_accepted 等は done、refused は blocked、ほかは partial）も今のまま。"
		acceptance: [
			"確定の `503 {ok: false, error: 'unreachable'}` と `500 {ok: false, error: 'record_failed'}` は押し直せる refused（理由は表の言葉）",
			"確定の `409 {ok: false, error: 'target_changed', reason: 'question_gone'}` は blocked、`409 {ok: false, error: 'busy'}` は refused（iss-00054 の今のテストが変わらず通る）",
		]
	}
	"R-03": {
		title: "意図と確定に時間切れを付け、送信中から抜ける"
		text:  "意図の応答を既定 30 秒、確定の応答を既定 60 秒（質問の答えと承認の構造化 Chat と同じ既定）待つ。意図の時間切れは送っていないので押し直せる refused（network の言葉）、確定の時間切れは結果不明の partial。時間切れの後に届いた応答は捨てる。長さと時計は `timeouts`・`setTimer`・`clearTimer` で差し替えられる（ほかの手段と同じ形）。"
		acceptance: [
			"意図が返らないまま意図の時間が過ぎると、確定を送らず `{kind: 'refused', reason: APPROVAL_REASONS.network}`",
			"確定が返らないまま確定の時間が過ぎると `{kind: 'partial', operationId, note: APPROVAL_REASONS.unconfirmed}`、送った回数は2回だけ",
			"板の流れが sending から抜け（refused か partial）、どちらも送り直さない",
			"既定の長さは意図 30000 ミリ秒、確定 60000 ミリ秒（注入した時計で観る）",
		]
	}
}

failures: {
	"F-01": {
		title: "時間切れの後に遅れて届いた確定の応答で、結果を書き換えない"
		text:  "時間切れで partial を返した後に確定の応答が届いても、submit の結果は変わらず、送り直さない（`withTimeout` の形のまま）。"
	}
}

constraints: [
	"実行時の依存を足さない。素の ES Modules のまま（ビルドしない）",
	"時間切れと確定の拒みの読み方は `question-view.js` の1か所に保ち、承認の手段に写しを作らない",
	"`question-view.js` の既存の export と振る舞い（質問の手段、構造化 Chat の承認）を変えない。足すのは export だけ",
	"本人の方針：本人の環境に特化した決まりを入れない、普遍的でシンプルな仕組みにする",
]

decisions: [
	"端末の承認の確定の時間切れは 60 秒（構造化 Chat の承認と同じ）。端末のキーの組の 5 分は、組の間を1秒ずつ空けて組ごとに読み直すためで、承認は1キーなので要らない（タスク担当、2026-11-18、根拠 `question-view.js` の KEYS_CONFIRM_TIMEOUT_MS の注記と iss-00054 D-03 の1組だけの送り方）",
	"結果不明は今のとおり partial（照会しない）にし、unknown（照会できる）にしない。端末の承認の記録の照会は prompt_pending・resolved_unverified しか言えず、答えたかを決められない（iss-00054 D-06 の判断を保つ。タスク担当、2026-11-18）",
]

questions: []
