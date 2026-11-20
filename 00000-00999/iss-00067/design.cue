package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"種類ごとの前面のプロセスの照合を、`src/orca/send.ts` の1か所の表にする（Epic の D-02）",
	"実物で確かめた経路（構造化 Chat の RPC）だけで答え、確かめられない経路（端末のキー）では送らないことを、テストで固定する",
	"送る経路、再送の道、キーの列を足さない",
]

current: """
	- `src/orca/send.ts` の `readForeground` が、前面の名前を正規化し（引用符、小文字、パスの最後、Windows の拡張子）、`isShell` と `matchesAgent` を返す。`matchesAgent` は `claude` と `codex`（`codex-` で始まる名前を含む）の決め打ちの式で、ほかの種類はいつも偽。`readForeground` は、送信の前の確かめ（`src/send/service.ts` の `#check`）、キーの組の各組の前（`answerKeys`）、端末の承認の1キーの前（`answerApprovalKey`）が共有する。
	- `src/send/service.ts` の `KEY_AGENTS`（claude・codex）にない種類は、キーの組の状態と意図が `agent_keys_unknown`。`src/send/keys.ts` の `planKeys` も `agent_keys_unknown`、`approvalKey` は null で、端末の承認の意図は `agent_keys_unknown` で止まる。
	- 構造化 Chat の質問は、`src/transcript/normalize.ts` の journal の読み（`parseJournalQuestion` を含む）と、`answerIntent`・`answerConfirm` の `agentSession.respondToQuestion` で、種類によらず同じ経路を通る。実物の Antigravity で動くことを確かめた（requirement の background）。
	- `web/embed/question-view.js` の `createCallAnswerer` の `availability` は、状態の `answerKeys` が available でなければ理由と「Orca で開く」を返し、押せる形にしない。`keysUnsupported` は claude と codex の形の場合分けだけを持つ。
	"""

target: """
	- `readForeground` の `matchesAgent` を、種類ごとの照合の表（1か所）で決める。表は claude（`claude`）、codex（`codex`、`codex-` で始まる名前）、antigravity（`antigravity`）。
	- キーの組と端末の承認には、antigravity を足さない。`KEY_AGENTS`、`planKeys`、`approvalKey`、`keysUnsupported` は変えず、antigravity で送らないことをテストで固定する。
	- 構造化 Chat の Antigravity の質問は、確かめた形の仮名の fixture で、正規化から答えの送信までをテストで固定する。
	- README の送信と質問の節に、Antigravity の扱い（端末は前面の照合、構造化 Chat の質問は RPC、端末の質問と承認は答えない）を書く。
	"""

design: {
	"D-01": {
		title: "前面のプロセスの照合の表（`src/orca/send.ts`）"
		text: """
			`readForeground` の中の決め打ちの式を、種類から照合の規則への1つの表（モジュールの中の定数と、それを引く1つの関数。名前は実装の裁量）に替える。
			規則は、正規化した `processName`（今の正規化の結果。正規化は変えない）に対して：
			- `claude`：`processName === 'claude'`
			- `codex`：`processName === 'codex'` か `processName.startsWith('codex-')`
			- `antigravity`：`processName === 'antigravity'`
			- 表にない種類：偽
			`isShell` の判定、読めないときの `foreground_unknown`、RPC の失敗の扱い、返す形（`{ ok, isShell, matchesAgent }`）は変えない。表は `src/orca/send.ts` の中だけに置き、ほかのファイルで種類を場合分けしない。
			`agy`（wrapper の名前）は合わせない。wrapper は bash の `exec` で本体に替わるので、前面に `agy` が出るのは本体が起きる前の短い間か、別のものであり、推測で合わせない（F-01）。
			"""
		satisfies: ["R-01", "F-01"]
	}
	"D-02": {
		title: "端末の Antigravity の質問と承認には、キーで答えない（コードは変えない）"
		text: """
			`src/send/service.ts` の `KEY_AGENTS`、`src/send/keys.ts` の `planKeys`・`approvalKey`、`web/embed/question-view.js` の `keysUnsupported` は変えない。Orca 1.4.263 自身が端末の Antigravity の問いを `unsupported` とし、キーの列を持たないので、写す元がない。
			今のコードで、端末の Antigravity は次のとおり送らない。これをテストで固定する：
			- `GET /api/send/status` の `answerKeys` が `{ available: false, reason: 'agent_keys_unknown' }`（前面が `antigravity` でも）。
			- 答えの意図（`callId`、mode keys）が `agent_keys_unknown` で拒み、`terminal.send` を送らない。
			- `planKeys('antigravity', …)` が `agent_keys_unknown`、`approvalKey('antigravity', …)` が null、端末の承認の意図（promptId）が `agent_keys_unknown` で拒み、キーを送らない。
			- 画面の `createCallAnswerer({ mode: 'keys' }).availability` が、状態の `answerKeys` が `agent_keys_unknown` のとき、押せない形（`ok: false`、理由、`open: true`）を返す。
			後の発言で答える質問（`answerVia: message`）は、送信の経路と同じ守り（D-01 の照合を含む）に従い、手を加えない。
			"""
		satisfies: ["F-02"]
	}
	"D-03": {
		title: "構造化 Chat の Antigravity の質問を、確かめた形でテストに固定する（コードは変えない）"
		text: """
			実物で読んだ journal の件の形（キーと型。値は仮名）を、テストの fixture にする：itemId は `legacy:antigravity:<仮のセッション>:request%3A…elicitation…` の形、`revision`、`body.kind: 'question'`、`body.question`、`body.options[{id, label}]`、`body.freeTextQuestionId`、`body.questions[{id, question, header, multiSelect, options[{id, label}], freeTextQuestionId}]`、答えた後は `body.resolution{state: 'resolved', selectedOptionId, answers[{questionId, optionIds}], resolvedBy, resolvedAt, resolvedByDevice{kind}}`。
			テストは、(1) 正規化が `question`（`source: chat`、`answerVia: rpc`、`prompt.itemId` と `revision`、問いの `multiSelect`・`allowOther`）を作ること、(2) 答えの意図と確定が `agentSession.respondToQuestion` を1回、決めた形の answers（単一選択、複数選択＋その他）で送り、`resolved` を `submitted` にすること、(3) 答えた後の件が `answered` と answers になること、(4) 読めない形の件（例：`body.questions` の要素が問いの形でない）では `unknown_shape` で送らないこと、を確かめる。
			種類（`agentType: 'antigravity'`）は宛先と状態の fixture に入れ、経路が種類で変わらないことを示す。
			"""
		satisfies: ["R-02", "F-03"]
	}
	"D-04": {
		title: "README の送信と質問の節"
		text: """
			README の『送る経路』『質問』『端末の許可の確認』の節に、Antigravity の扱いを足す：端末の Antigravity は前面のプロセスが `antigravity` のときだけ送る（タブの `providerSession` が要るのは今どおり）。構造化 Chat の Antigravity の質問は RPC で答えられる。端末の Antigravity の質問と許可の確認は、Orca 自身もキーの列を持たないので答えない（理由と「Orca で開く」）。確かめた Orca と agy の版を書く。
			iss-00066 も README を触るので、PR の直前に `origin/main` を取り込み直す。
			"""
		satisfies: ["R-01", "R-02", "F-02"]
	}
	"D-05": {
		title: "実物の確かめ（タスク担当）"
		text: """
			実装の後、試しの orca-web（別のポート、専用の settings、`sendEnabled` 真）で、統括が用意した試しの送り先だけを使う：
			- 構造化 Chat：送信と、選択の問いへの答えが届き、作業が続くこと（実装の前に確かめた3つの形の結果と合わせ、実装の後に1つの形を確かめ直す）。
			- 端末：前面の名前（`antigravity`）。統括が `providerSession` の付く端末の Antigravity を立てられれば、送信の状態が available で、短い文が届くこと。立てられなければ未確認として残す。
			記録は report.md に、送った答えの種類（単一・複数・自由記述）、届いたこと（outcome、journal の resolved）、続いたこと（返事の有無）だけを書き、会話の中身、セッションの id、パス、アカウントを書かない。
			"""
		satisfies: ["R-01", "R-02"]
	}
}

compatibility: """
	照合の表は値を足すだけで、claude・codex の結果は変わらない。API の形、状態の文書、送信の記録の形は変えない。
	古い orca-web に戻すと、端末の Antigravity は今どおり `foreground_mismatch` で送れなくなるだけ。
	"""

risks: [
	"Antigravity の将来の版が本体の名前を変えると、照合が合わずに送れなくなる（安全側）。そのときは実物で確かめて表に足す",
	"Orca が端末の Antigravity の会話と問いを読むようになると、端末の問いのカードが出るが、キーの列がないので答えない（F-02）。Orca がキーの列を持ったら別の Issue で写す",
	"端末への送信が届くところは、`providerSession` の付く試しの送り先がないと実物で確かめられない（requirement の questions）",
]
