package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"端末の承認の手段が、質問の答えと同じ時間切れと確定の 5xx の読み方を、同じ関数で使う",
	"変えるのは画面の答える手段だけ。サーバー、描画、言葉は変えない",
]

current: """
	`createTerminalApprover.submit` は `deps.writer.send` を時間切れなしで待ち、確定の `ok: false` と文字の error を status によらず `terminalRefusal` にする。`question-view.js` の `timing`・`withTimeout`・`confirmRefused` は内部の関数で、承認の手段から使えない。
	"""

target: """
	`question-view.js` が `timing`・`withTimeout`・`confirmRefused` を export し（中身は変えない）、`createTerminalApprover` がそれで意図と確定を待ち、確定の `ok: false` は `confirmRefused` が真のときだけ `terminalRefusal`、ほかは partial にする。
	"""

design: {
	"D-01": {
		title: "question-view.js の export を足す"
		text: """
			`timing(deps, confirmDefault)`、`withTimeout(promise, ms, clock)`、`confirmRefused(res)` に `export` を付けるだけで、引数・戻り値・中身を変えない。JSDoc の型の注記は今のものを保つ。`approval-view.js` が import する。
			既存の呼び手（`sendIntentConfirm`、`createCallAnswerer`）はそのまま。
			"""
		satisfies: ["R-01", "R-03"]
	}
	"D-02": {
		title: "createTerminalApprover の時間切れと確定の分け方"
		text: """
			`createTerminalApprover(deps)` の deps に、ほかの手段と同じ `timeouts?: {intentMs?, confirmMs?}`、`setTimer?`、`clearTimer?` を足す。`const clock = timing(deps)`（確定の既定は CONFIRM_TIMEOUT_MS の 60 秒）。
			submit の手順（変えるところだけ）：
			1. 意図：`await withTimeout(deps.writer.send('/api/approval/intent', …), clock.intentMs, clock)`。投げたら（時間切れ・通信の誤り）今のとおり `{kind: 'refused', reason: APPROVAL_REASONS.network}`。
			2. 確定：`await withTimeout(deps.writer.send('/api/approval/confirm', …), clock.confirmMs, clock)`。投げたら今のとおり `lost(operationId)`（partial、note unconfirmed）。
			3. 200 の outcome の分け方は今のまま。
			4. 200 でない（または outcome のない）応答：`confirmRefused(confirm)` が真なら `terminalRefusal(result)`（今の blocked と refused の分け方）、偽なら `lost(operationId)`。
			これで `500 internal_error` と 5xx の知らない識別子は partial、4xx と 5xx の送る前の識別子は今のとおり。`ok: false` のない形・body のない 502 は今のとおり partial。
			JSDoc のコメント（手段の説明）を新しい分け方と時間切れに合わせて直す。`agent-frame.js` は既定の時間を使うので変えない。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01"]
	}
	"D-03": {
		title: "テストと文書と描画の確かめ"
		text: """
			- `test/web/approval-view.test.ts` に、R-01〜R-03・F-01 を観るテストを足す（注入した時計 `setTimer`・`clearTimer` で時間を進める。実の時間を待たない）。iss-00054 の今のテスト（`{status: 409, …}` の blocked と refused、`502 body null` の partial など）は変えずに通す。
			- `AGENTS.md` の承認のカードの説明の `createTerminalApprover` の括弧に「時間切れと確定の 5xx の結果不明は質問と同じ」を足す。README に端末の承認の結果不明の説明があれば合わせる（なければ足さない）。
			- 描画は変えないが、結果不明の帯が今のまま出ることを、実装担当の一時の orca-web（偽の会話と、確定に 500 internal_error を返す偽の口。実物の Orca には書き込まない）とヘッドレスの Chrome で、幅 1280px と 390px で写す（はみ出し 0、「Orca で開く」あり）。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01"]
	}
}

compatibility: """
	HTTP の口と記録の形は変えない。画面の振る舞いは、確定の 5xx の知らない誤りが refused から partial になり、応答のない接続が時間切れで抜けるところだけが変わる。どちらもより安全側（押し直させない、Orca で確かめさせる）。
	"""

risks: [
	"確定の時間切れの後にサーバーがキーを送っていても、画面は結果不明と示し、押し直させない。二重の送信はサーバーの記録（already_sent）が止める",
	"確定の 60 秒は、送る直前の読み直し（前面と listAll）と1キーの送信に十分と見込む（実測はない）。足りなければ結果不明に倒れる（安全側）",
]
