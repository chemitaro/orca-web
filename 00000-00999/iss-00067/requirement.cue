package spec

// 要件（Issue）。型 specdock/v1。

schema: "specdock/v1"

assurance: {
	level:  "strict"
	reason: "エージェントの端末にキーを送る。照合や組み立てを誤ると、意図しない回答や操作がエージェントに届き、取り消せない"
}

purpose: """
	Antigravity（Orca の `agentType: "antigravity"`、CLI は `agy`）のエージェントに、orca-web のチャットから、Claude・Codex と同じ守りで送り、質問に答えられるようにする（epic-00065 の R-02、R-03、F-02、D-02）。
	手段は、仕様を書く前に実物の Antigravity で確かめた事実だけで決め、確かめられない経路では送らない。
	"""

background: """
	仕様を書く前に、統括が用意した試しの送り先で確かめた事実（2026-11-20、orca-web main 58275ea、Orca 1.4.263、agy 1.5.12、モデル gemini-3.8-flash-low）。試しの orca-web は別のポート・専用の settings で動かし、常駐の orca-web（8791）と業務中のエージェントには触れていない。

	構造化 Chat（統括が `--agent antigravity` で立てた worker。Orca の利用者の設定で構造化 Chat として起動された）：
	- 状態の文書では `kind: chat-tab`、`agentType.value: "antigravity"`。`GET /api/send/status` は `route: chat`、送信・答え（rpc）・承認とも available、answerKeys は `chat_route`。
	- 送信（`agentSession.send`）は `accepted`（`dispatchState: pending`）で届き、エージェントが答えた。
	- Antigravity の質問の道具（会話では `ask_question` の tool-call）は、Orca の journal に `body.kind: "question"` の件として出る（itemId は `legacy:antigravity:<セッション>:request…elicitation…`、`questions[]` に id・question・header・multiSelect・options[{id, label}]、`freeTextQuestionId`）。orca-web の会話の部分は `question`（`source: chat`、`answerVia: rpc`）になる。
	- `POST /api/answer/intent`・`confirm` から `agentSession.respondToQuestion` で答えると `submitted`（`code: resolved`）になり、journal の件が `resolution.state: resolved` と送った answers になり、エージェントは選んだ答えで作業を続けた。単一選択（3択）、複数選択（4択から2つ）、選択と自由記述（`other`）の組の3つで確かめた。
	- つまり構造化 Chat の経路は、今の orca-web のコードのままで動く。

	端末（統括が `orca terminal create --command` で agy を直接起動した端末）：
	- `terminal.inspectProcess` の `foregroundProcess` は `antigravity`（`agy` は `exec` で本体の `antigravity` を起こす bash の wrapper）。タブの `agentStatus.agentType` は `antigravity`、`terminal.agentStatus` の `isRunningAgent` は真。
	- 今の orca-web の前面の照合（`src/orca/send.ts` の `readForeground`）は `claude`・`codex` だけを知るので、端末の Antigravity には `foreground_mismatch` で送れない。
	- この端末の agy はサインイン済みで入力を受け付ける（統括が `orca terminal send` で挨拶を1件送り、accepted で1行の返事があった）。ただし Orca の agent launch の経路で起動していないため、タブに `providerSession` がなく、orca-web は `no_session` で送らない（宛先にセッションの同一性を求める今の規則による、送る前の正しい拒み。この規則は変えない）。orca-web から端末への送信が届くところまでは確かめられていない（questions）。
	- Orca 1.4.263 の native chat は Antigravity の会話を読まない（`NATIVE_CHAT_SUPPORTED_AGENT_LIST` に antigravity がなく、`nativeChat.readSession` は `Transcript unavailable`）。Orca 自身も、端末の Antigravity の待っている問いを `unsupported`（答えのキーを持たない。`readAgentPromptAnswers`、`shouldStepNativeChatAskAnswer`）にする。
	- よって、端末の Antigravity の質問と承認に答えるキーの列は、Orca にも確かめられた形がない。

	Gemini CLI：この PC に `gemini` の CLI がなく、Orca が Gemini CLI を送信の対象として報告するかは確かめられない（統括の了承、2026-11-20）。Orca 1.4.263 の起動の表には `gemini`（`detectCmd: gemini`）があるが、native chat の対応の表にはない。
	"""

includes: [
	"端末の Antigravity の前面のプロセスの照合（`antigravity`）",
	"構造化 Chat の Antigravity の質問に RPC で答える経路を、確かめた形のテストで固定する",
	"端末の Antigravity の質問と承認には、キーで答えない（送らずに理由を返す）ことをテストで固定する",
	"README の送信と質問の節の、Antigravity の扱い",
	"実物での確かめの記録（report.md）",
]

excludes: [
	"Antigravity のためのキーの列（Orca 1.4.263 自身が持たず、確かめられた形がない。F-02）",
	"端末の Antigravity の会話の読み取り（Orca の native chat が対応していない）",
	"Gemini CLI への送信と回答（CLI が入っておらず確かめられない。epic-00065 の excludes）",
	"アイコンと名前（iss-00066）、モデルと推論の深さ（iss-00068）",
	"Antigravity・Orca の設定の変更",
]

requirements: {
	"R-01": {
		title: "端末の Antigravity に送るとき、前面のプロセスが antigravity なら照合が合う"
		text: """
			宛先の `agentType` が `antigravity` の端末で、`terminal.inspectProcess` の前面のプロセスの名前（今の正規化：前後の引用符を外し、小文字にし、パスの最後の部分にし、Windows の拡張子を外したもの）が `antigravity` と完全に一致するときだけ、照合が合う。
			照合は、送信の前の確かめ（`#check`）、キーの組の1組目を含む各組の前の読み直し、端末の承認の1キーの前の読み直しで共有される1か所（`readForeground`）で決める。
			Claude（`claude`）と Codex（`codex`、`codex-` で始まる名前）の今の照合は変えない。
			"""
		acceptance: [
			"`readForeground(handle, incarnation, 'antigravity')` が、前面 `antigravity`、`/opt/x/antigravity`、`\"antigravity\"`、`Antigravity` で `matchesAgent` 真、`agy`・`zsh`・`bash`・`node`・`gemini`・`claude`・`codex`・`antigravity-helper`・`antigravity2` で偽（テスト）",
			"`agentType` が `claude`・`codex` の今の照合のテストが、そのまま通る",
			"送信の状態（`GET /api/send/status`）と意図が、端末の Antigravity で前面が `antigravity` のとき送れる（`available` 真）、前面がシェルのとき `shell_foreground`、ほかの名前のとき `foreground_mismatch` を返す（テスト）",
			"実物の端末の Antigravity で `foregroundProcess` が `antigravity` だったことが report.md にある",
		]
	}
	"R-02": {
		title: "構造化 Chat の Antigravity の質問に、チャットから RPC で答えられる"
		text: """
			構造化 Chat の Antigravity の journal の質問（確かめた形：`legacy:antigravity:` の itemId、`freeTextQuestionId`、単一選択・複数選択）は、会話の部分 `question`（`answerVia: rpc`）になり、`/api/answer/intent`・`confirm` が `agentSession.respondToQuestion` を1回だけ送り、結果を今の分け方で返す。
			種類によって経路を変えない（今のコードのまま動くことを、確かめた形のテストで固定する）。
			"""
		acceptance: [
			"確かめた形の Antigravity の journal の質問（単一選択、複数選択＋その他）から、正規化が `answerVia: rpc` の部分を作り、答えの意図と確定が `agentSession.respondToQuestion` を1回、決めた形の answers で送る（テスト）",
			"試しの送り先で、チャットから選んだ答えが届き、その答えで作業が続いたことが report.md にある（単一選択、複数選択、自由記述。会話の中身は写さない）",
		]
	}
}

failures: {
	"F-01": {
		title: "前面のプロセスが antigravity と確かめられないときは、端末に何も送らない"
		text: """
			前面が読めない、シェル、`antigravity` 以外の名前のときは、送信も、キーの組も、承認のキーも送らず、今の理由（`foreground_unknown`、`shell_foreground`、`foreground_mismatch`、キーの組の途中なら今の止め方）を返す。名前の似たもの（`agy`、`antigravity-` で始まる名前など）を推測で合わせない。
			"""
		impact:   "照合を緩めると、エージェントでないプログラム（シェルやエディター）に文やキーが届き、取り消せない操作になる"
		recovery: "送らずに理由を返すので、利用者は Orca で開いて端末で直接扱う。照合の名前が変わったら、実物で確かめてから足す"
	}
	"F-02": {
		title: "端末の Antigravity の質問と承認には、キーを送らない"
		text: """
			端末の Antigravity の質問（キーの組 `answerVia: keys`）と端末の承認（promptId の1キー）は、キーの列が確かめられていないので、送らずに今の理由を返す：質問は `agent_keys_unknown`（状態の `answerKeys` も同じ理由で available 偽）、承認は今の答えられない理由（`approvalKey` が null）。
			画面は、今の Claude・Codex の答えられない形と同じく、理由と「Orca で開く」を出し、押せる形にしない。後の発言で答える質問（`answerVia: message`）は、今どおり送信の経路の守り（R-01 の照合を含む）に従う。
			"""
		impact:   "推測したキーの列を送ると、意図しない選択肢を選んだり、入力欄に文字が残ったりして、取り消せない回答になる"
		recovery: "利用者は Orca で開いて端末で答える。Orca がキーの列を持ったら、その版で確かめてから別の Issue で足す"
	}
	"F-03": {
		title: "構造化 Chat の質問の形が読めないときは、答えを送らない"
		text: """
			Antigravity の journal の質問が、今の読み方（`parseJournalQuestion`）で読めない形（Orca の版の違いなど）なら、答えを送らず `unknown_shape` を返す。答えの形が問いに合わなければ、今の検査（`checkAnswers`）が送らずに拒む。
			"""
		impact:   "読めない形に推測で答えると、Orca が誤った答えを受けたり、別の問いに答えたりする"
		recovery: "送らずに理由を返すので、利用者は Orca で開いて答える。形が変わったら実物で確かめて読み方を直す"
	}
}

constraints: [
	"照合の名前と答えの手段は、実物で確かめた事実（background）だけで決める。推測で足さない",
	"`src/send/keys.ts` の Claude・Codex の列と間を変えない。`KEY_AGENTS` に antigravity を足さない",
	"送る経路と再送の道を足さない（AGENTS.md）",
	"公開のリポジトリの文書とテストに、この PC の実際のパス、セッションの id、メールアドレス、プロンプトの本文を書かない。テストの形は仮名にする",
	"実物の確かめは、統括が用意した試しの送り先と、試しの orca-web（別のポート、専用の settings）だけで行う",
]

decisions: [
	"2026-11-20 統括（依頼書）：仕様を書く前に実物で確かめ、RPC が効くなら RPC、効かなければキーの組。照合が合わない・形が手段に合わない・版が違って形が読めないときは送らない。",
	"2026-11-20 タスク担当（確かめた事実による）：構造化 Chat は RPC（今のコードで動く）。端末の Antigravity の質問と承認は、Orca 1.4.263 にもキーの列がないので、キーの組を作らず送らない（F-02）。端末の送信は前面の照合だけを足す（R-01）。統括に報告し（msg_46f82ebc122e）、統括が了承した（msg_51fe173ef7a8）。",
	"2026-11-20 タスク担当：端末の宛先にタブの `providerSession` を求める今の規則（`src/send/target.ts`）は変えない。緩めると、送った後の照会とセッションの入れ替わりの確かめが弱まる（統括に伝えた、msg_14bbddc175ff）。",
	"2026-11-20 統括：Gemini CLI はこの PC にないので、report.md に『未確認（CLI 未導入）』と書いて進めてよい（msg_6e61a42ec388）。",
]

questions: [
	"端末の Antigravity への送信が届くところまでの実物の確かめ：直接起動の試しの端末にはタブの `providerSession` がなく未確認。統括が Orca の agent launch で `providerSession` の付く端末の Antigravity を立てられれば、実装の後に試しの orca-web で1回送って確かめ、立てられなければ report.md に未確認として残す（統括に依頼済み、msg_14bbddc175ff）。",
]
