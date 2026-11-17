package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "端末への書き込み（キーの列）を足す。途中まで届く危険は、送る前の確かめと、途中で止めて知らせること、二度と送らないことで抑え、戻すときは sendEnabled を偽にすれば止まる。iss-00048 と同じ守りの層を使う"
}

purpose: """
	`/embed/agent`（エージェントの詳細とチャットの小窓）の質問のカードから、端末のエージェント（Claude Code の AskUserQuestion、Codex の request_user_input）の質問に答えられるようにする。
	答え方は、Orca 自身（デスクトップとモバイル）が行うのと同じキーの列（数字、矢印、Enter、Tab、自由入力の貼り付け）を、Orca と同じ間（1つの組ごとに 1000ms）で、`terminal.send` で1組ずつ打ち込む。
	あわせて、答えを後の発言で受ける質問（Codex の `request_user_input_async`。端末と構造化 Chat の両方）にも、Orca と同じ形の発言（『> 問い』と答えの引用）で答えられるようにする。
	"""

background: """
	本人の要望（2026-11-18）：チャットで ask に答えたい。iss-00048（PR #52、3b7aece）は、構造化 Chat の質問に `agentSession.respondToQuestion` で答えるカードを作り、端末のエージェントの質問は読むだけ（理由と「Orca で開く」）にした。答える手段（answerer）は差し替えられる形で残してある。

	Orca v1.4.261 のソース（stablyai/orca のタグ v1.4.261 を `.workbench/orca-src/` に取得して読んだ。確かめた事実）：
	- キーの列は `src/shared/native-chat/input/questions/native-chat-ask-answer.ts` の `buildAskAnswerKeys`（Claude）と `buildCodexAskAnswerKeys`（Codex）。組は `{raw}`（そのまま送るキー）か `{text}`（`buildNativeChatPasteBytes` で整えて送る文）。
	  - Claude：単一選択は選択肢の番号の数字（1から）で確定して次へ。その他の文は「Type something」の番号（選択肢の数＋1）、文、Enter。複数選択は数字で入れ外しし、その他は同じく番号・文・Enter、最後に右矢印（ESC [ C）で次のタブ。preview の付く問いは数字で移り、メモは `n` と文、Enter で確定。複数問か、1問の複数選択は、最後に Enter（Submit）。
	  - Codex：数字で確定して次へ。メモは上下の矢印で行を移り、Tab、文、Enter。答えない問いは DEL と次へ（最後は Enter）、飛ばしたら確認で Enter。
	- 間：`native-chat-answer-stepping.ts` の `NATIVE_CHAT_QUESTION_STEP_MS`（500＋500＝1000ms）。デスクトップ（`sendNativeChatAskAnswer`）は組の間に 1000ms を空け、モバイル（`use-mobile-native-chat-answer-send.ts`）は1組ずつ `terminal.send`（`enter: false`、`requireWriteSettlement: true`）で送り、届いたか（`send.writeSettlement.outcome`）を見て、受けられなければそれ以上送らず「Answer partly sent — check chat before retrying」（受けた組があるとき）や「Answer unconfirmed — check chat before retrying」（結果不明のとき）と示す。自動で送り直さない。
	- 文の整え（`native-chat-paste-bytes.ts`）：ESC を印字できる ␛ に替え、改行を含むか 512 バイトを超える文は括弧付きの貼り付け（ESC [200~ と ESC [201~）で包み、改行は CR にする。
	- `request_user_input_async`（`codex-async-question-input.ts`）は `{questions: [{title, options?: string[]}]}` で、ツールの結果はすぐ受付を返し、答えは後の利用者の発言で受ける。Orca は `formatAskAnswer` の replyAsMessage の形（答えた問いごとに『> 問い』、空行、ラベルを『, 』で並べた答え。問いの間は空行）を普通の発言として送る。答え済みかは、後の発言がその引用で始まるか、空行の後に引用を含むか（`quotedByQueuedAnswer`）で分かる。
	- 端末の画面がその質問を出しているかは、タブの agentStatus の `state`（waiting か blocked が needs-you）、`toolName`、`interactivePrompt`（AskUserQuestion の入力の JSON。答えて先へ進むと消える）で分かる（`agent-pending-prompt.ts`）。`terminal.agentStatus` の status は質問を待つ間 `permission` になる。
	- `terminal.send` の `requireAgentStatus: 'sendable'` は status が permission なら拒むので、質問への答えには使えない。
	"""

includes: [
	"会話の正規化（`orca-web.transcript/v1`）の質問の部分に、答え方 `answerVia`（`rpc`・`keys`・`message`）と、問いごとの `preview`（選択肢に preview があるか）を足し、`request_user_input_async` の呼び出しを質問の部分にする",
	"キーの列と答えの発言を作る純な関数（Orca と同じ列、同じ文の整え）と、会話の中で端末の質問がまだ答えられていないかを決める純な関数",
	"キーの列を1組ずつ送る門・アダプター・サービス（送る前の確かめ、組の間 1000ms、途中で止めること、二度と送らないこと、記録に中身を残さないこと）と、`/api/answer/*` の口の広げ（`callId` で端末の質問と後の発言の質問を指す）",
	"送れるかの口（`GET /api/send/status`）に、キーの列と発言で答えられるかを足す",
	"質問のカードの答える手段の差し替え（端末のキーの列、後の発言）、途中まで送ったときの帯、答え済みの判定（ツールの結果、後の発言の引用、失敗したツールの結果は答えずに閉じた形）",
	"README.md と AGENTS.md、試しの画面（`npm run trial`）での写し（Mac の幅と 390px）と、試しのエージェントでの実機の確かめ",
]

excludes: [
	"承認（approval）の表示と答え（iss-00050）",
	"キーの列を Orca がまだ知らない種類のエージェント（Claude と Codex のほか）で送ること。カードは読めるが、理由と「Orca で開く」を出す",
	"Codex の複数選択の問いと preview の問い、Claude の preview の問いのその他の文（メモ）。答えられる選択肢だけを出す",
	"答えない問いを残して送ること（全部の問いに答えがあるときだけ送る。Orca の飛ばす列は使わない）",
	"送ったキーの列の取り消しや、途中まで届いた後の続きを送ること",
	"iss-00048 の残りの P2-a・P2-b・P2-c と P3（照会や期限の扱い）の直し",
	"SpecDock 側の組み込み（spec-dock の epic-00471・00526）",
]

requirements: {
	"R-01": {
		title: "会話の API が、質問の答え方と、後の発言で答える質問を返す"
		text: """
			質問の部分に `answerVia` を足す：構造化 Chat の journal の question は `rpc`、端末のエージェントの AskUserQuestion・request_user_input の呼び出しは `keys`、`request_user_input_async` の呼び出し（端末と構造化 Chat のどちらでも）は `message`。
			問いごとに `preview`（真偽。端末の問いで、単一選択で、入力の選択肢のどれかに空白だけでない preview の文字があるとき真。Orca の parseCanonicalQuestionsInput の hasPreviews と同じ。ほかは偽）を足す。
			端末の `keys` の問いは、preview が偽なら `allowOther` を真（Claude の「Type something」、Codex のメモ）、真なら偽にする。`otherAllowsEmpty` は偽。
			`message` の問いは、`{questions: [{title, options?: string[]}]}` を Orca の parseCodexAsyncQuestionsInput と同じ規則で読み、各問いは単一選択、`allowOther` は真、`preview` は偽。state は pending、answers は null（画面が後の発言と結びつける）。読めない呼び出しは今のままツールの呼び出し。構造化 Chat の呼び出しに付いたツールの結果の部分は、今のまま別の部分で返す。
			"""
		acceptance: [
			"構造化 Chat の question が answerVia rpc、端末の AskUserQuestion と request_user_input が answerVia keys、request_user_input_async（端末と構造化 Chat）が answerVia message の部分になる",
			"preview のある端末の問いは preview 真で allowOther 偽、ない問いは preview 偽で allowOther 真になる",
			"読めない request_user_input_async の入力はツールの呼び出しのまま",
		]
	}
	"R-02": {
		title: "利用者が、端末のエージェントの質問に、カードから選んで（その他の文も）答えられ、Orca が送るのと同じキーの列が同じ間で届く"
		text: """
			カードは iss-00048 と同じ部品で、選び方と送れる条件も同じ（全部の問いに答えがある、単一選択はちょうど1つ、複数選択は1つ以上、その他は空白でない文）。
			送ると、サーバーは宛先のエージェントの種類（claude か codex）で Orca の buildAskAnswerKeys・buildCodexAskAnswerKeys と同じ組の列を作り、1組ずつ `terminal.send`（`enter: false`、`requireWriteSettlement: true`）で送る。最初の組はすぐ、次の組は前の組が受けられてから 1000ms の後に送る。文の組は Orca の buildNativeChatPasteBytes と同じ整えをする。
			全部の組が受けられたら、カードは「答えを送りました」と示し、会話の記録に同じ callId のツールの結果が現れたら答え済みの閉じた形にする。
			"""
		acceptance: [
			"Claude の単一選択・その他の文・複数選択・複数問・preview の問いと、Codex の単一選択・メモ・複数問の答えで、組の列が Orca の関数と同じになる（Orca のテストの例と同じ値）",
			"組の間が 1000ms で、前の組の結果を待ってから次を送る",
			"試しのエージェント（端末の Claude）に小窓から答え、エージェントが答えを受け取って続け、カードが答え済みの閉じた形になる",
		]
	}
	"R-03": {
		title: "送る前に、その質問がまだ答えられておらず、端末がその質問を出していることを確かめる"
		text: """
			意図と確定のどちらでも、送る前に次をすべて確かめ、どれかが外れたら1つも送らず理由を返す：
			- 今の会話の記録（末尾のページ）に同じ callId の質問の呼び出しがあり、同じ callId のツールの結果がない（なければ question_gone、あれば question_answered）。
			- タブの agentStatus の state が waiting か blocked で、toolName が質問のツール（Orca の isAskUserQuestionTool と同じ判定）で、interactivePrompt を同じ規則で読んだ問い（問いの文、複数選択か、選択肢のラベル）が会話の記録の問いと同じ（違えば prompt_mismatch、interactivePrompt がなければ prompt_unverified）。
			- 端末の前面のプロセスがそのエージェント（今の送信と同じ確かめ。`terminal.agentStatus` の permission は拒まない）。
			- 同じエージェントの同じ callId に、前に送り始めた答えの記録がない（あれば already_sent）。
			"""
		acceptance: [
			"ツールの結果がある、interactivePrompt がない・違う、前面がシェル、前に送った記録がある、のそれぞれで、terminal.send を1回も呼ばずに理由を返す",
		]
	}
	"R-04": {
		title: "送る途中で失敗したら、それ以上送らず、途中まで送ったと示し、同じ答えを2回送らない"
		text: """
			組が受けられなかった（refused）か、届いたか分からない（unknown、RPC の誤り、応答の欠け）ときは、残りの組を送らない。結果は次に分ける：
			- 最初の組が受けられなかった：refused（送っていない）。
			- 最初の組が届いたか分からない：unknown（code unconfirmed）。
			- 受けられた組があり、残りを送れなかった：unknown（code partial_sent、送った組の数と全部の数）。
			partial_sent と unconfirmed のカードは「途中まで送りました（または届いたか分かりません）。Orca で確かめてください」と「Orca で開く」を出し、送るボタンを出さない。自動で送り直さない。
			送り始めた答え（送る前の記録を書いたもの）は、結果によらず、同じエージェントの同じ callId に二度と送らない（orca-web を起動し直しても、記録から分かる）。同じ票の2回目の確定と、送っている間の押しは送らない。
			送信の記録には、答えの中身（選んだラベル、番号、その他の文、キーの列、発言の文）を書かない（digest、問いの数、callId、組の数、送った組の数だけ）。
			"""
		acceptance: [
			"2組目が refused・unknown・RPC の誤りのとき、3組目以降を送らず、partial_sent と送った組の数を返す",
			"送り始めた後は、同じ callId への意図と確定を already_sent で拒む（新しい SendService でも記録から拒む）",
			"記録の行に、ラベル、番号の列、その他の文、キーの文字、発言の文が入らない",
			"カードが partial_sent・unconfirmed で、途中まで送った知らせと「Orca で開く」を出し、送るボタンを出さない",
		]
	}
	"R-05": {
		title: "後の発言で答える質問（request_user_input_async）に、Orca と同じ形の発言で答えられる"
		text: """
			answerVia message の質問は、選んだ答えを Orca の formatAskAnswer（replyAsMessage）と同じ文にし、今の送信の経路（端末は `terminal.send` の agentPrompt、構造化 Chat は `agentSession.send`）で1回だけ送る。送る前に、会話の記録にその呼び出しがあり、後の利用者の発言にその引用（『> 問い』と空行）がないことを確かめる（あれば question_answered）。
			記録は R-04 と同じく中身を書かない。結果の分け方と照会は今の送信と同じ（届いたか分からなければ自動で送り直さず、照会で確かめる）。
			カードは、後の利用者の発言にいずれかの問いの引用が現れたら答え済みの閉じた形にする（答えはその発言の文を示す）。
			"""
		acceptance: [
			"request_user_input_async の答えの文が、Orca の formatAskAnswer（replyAsMessage）と同じになる",
			"引用のある発言の後の質問には送らず question_answered を返す",
			"カードが、引用のある後の発言で答え済みになる",
		]
	}
	"R-06": {
		title: "答えられないときは、カードは読めるが押せず、理由を1行で示す"
		text: """
			sendEnabled が偽、Orca の能力がない、エージェントの種類がキーの列を知らない（claude と codex のほか）、Codex の複数選択か preview の問い、R-03 の確かめが外れた、のときは、選択肢と送るボタンを押せず、理由を1行で示し、端末の質問には「Orca で開く」を出す。
			送れるかの口 `GET /api/send/status` は、今の `answer`（rpc）に加えて `answerKeys` と `answerMessage`（どちらも `{available, reason}`）を返す。画面は質問の answerVia で選んで使う。R-03 の質問ごとの確かめは送るときに行い、status では行わない。その結果の拒みのうち、already_sent・question_answered・prompt_mismatch・prompt_unsupported・agent_keys_unknown のカードは、理由を示して押し直せない形（選択肢と送るボタンを押せない）にし、「Orca で開く」を出す。prompt_unverified と、ほかの一時の拒み（busy、unreachable など）は今のとおり押し直せる。
			"""
		acceptance: [
			"sendEnabled 偽、エージェントの種類が違う、Codex の複数選択、で、カードが読めて押せず、理由が出る",
			"status が answerKeys と answerMessage を返し、端末の Claude で answerKeys が available になる",
			"意図が already_sent・question_answered・prompt_mismatch で拒まれたカードは、理由と「Orca で開く」を出し、押し直せない",
		]
	}
	"R-07": {
		title: "端末の質問の失敗したツールの結果は、答え済みでなく、答えずに閉じた形で示す（iss-00048 の P2-d）"
		text:  "同じ callId のツールの結果が isError のとき、カードは「答えずに閉じられました」と示して閉じた形にする（結果の文は示す）。"
		acceptance: [
			"isError のツールの結果が結びついた端末の質問が、答え済みでなく、答えずに閉じた形になる",
		]
	}
	"R-08": {
		title: "狭い枠（SpecDock の欄、390px）でも読めて押せる"
		text:  "iss-00048 の R-06 と同じ。途中まで送った帯と「Orca で開く」も、390px で横にはみ出さない。"
		acceptance: [
			"試しの画面で、Mac の幅と 390px、明暗で、端末の質問のカードが横にはみ出さず、選択肢と送るボタンが押せる（写しを report.md に残す）",
		]
	}
}

failures: {
	"F-01": {
		title: "組を送る途中で orca-web が止まったときは、記録の後の行がなく、照会は結果不明（no_after_record）とし、同じ callId に二度と送らない"
	}
	"F-02": {
		title: "利用者が Orca の画面で先に答えた（ツールの結果がある、interactivePrompt が消えた・変わった）ときは、送らない。Orca の画面で同じ質問を途中まで進めた（複数問の1問目だけ答えた、行を動かした、文を書きかけた）ことは、ツールの結果も interactivePrompt も変わらないので見分けられない（Orca 自身の画面の答えと同じ前提。残る危険として risks に書き、カードの注に「Orca の画面で途中まで答えた質問は、Orca で続けてください」と出す）"
	}
	"F-03": {
		title: "Orca の応答（`terminal.send` の受け取り、タブの agentStatus）が知らない形なら、送らないか（送る前）、結果不明として止める（送る途中）"
	}
	"F-04": {
		title: "その他の文に制御文字があれば送らない（keys は Tab と改行を含むすべての C0・DEL・C1 を拒み、message は今の送信と同じく Tab と改行だけを許す）。門も、キーの組の文に決めたキーのほかの制御文字を通さない。ESC は Orca と同じく ␛ に替える"
	}
	"F-05": {
		title: "組の列の長さが上限（64組）を超える答えは送らない（invalid_answer）"
	}
}

constraints: [
	"実行時の依存を足さない。画面は素の ES Modules で、DOM は textContent と createElement だけで描く",
	"送る経路は、決めた形の `terminal.send`（キーの組：鍵が terminal・text・enter（偽）・requireWriteSettlement（真）・client だけで、text は決めたキーか整えた文）だけを足す。再送の道を足さない。`requireAgentStatus` と `agentPrompt` はキーの組に付けない",
	"Orca の列と間を変えない（Orca の関数を写して、同じ値のテストで確かめる）",
	"会話の API と答えの口は同じオリジンだけ（CORS なし）。書き込みの守りは今の送信と同じ",
	"実機の確かめは試しのエージェントと試しの orca-web（別のポート、専用の settings）だけ。常駐の orca-web（8791）の設定を変えない",
	"本人の方針：本人の環境に特化した決まりを入れない、普遍的でシンプルな仕組みにする",
]

decisions: [
	"request_user_input_async はこの Issue に入れる（依頼書の3：答える道がある。Orca 自身が formatAskAnswer の発言で答える）。タスク担当の判断（2026-11-18）",
	"答えない問いを残して送る列（Orca の飛ばす列）は使わない。全部の問いに答えがあるときだけ送る（iss-00048 のカードの条件と同じ）。タスク担当の判断",
	"Codex の複数選択と preview の問い、Claude の preview の問いのその他の文は、答えないか出さない（Orca の列が先頭の選択だけを使う、メモの意味が選択と違うため。安全側）。タスク担当の判断",
	"途中まで送った答えは、カードからも、サーバーからも送り直さない（依頼書の2）",
	"記録に中身を残さない（依頼書の2。iss-00048 の答えの記録と同じ）",
	"送るクライアントは今の送信と同じ `{id: 'orca-web', type: 'desktop'}` にする（type mobile は Orca のモバイルの入力の床を取るので使わない）",
]

questions: [
	"タブの agentStatus に interactivePrompt と toolName が `session.tabs.listAll` で出るかは、Orca のソースの型（AgentStatusEntry）にあるが、実機で質問を待つ端末のタブでは未確認。出なければ R-03 で prompt_unverified になり答えられない（安全側）。S-04 の実機の確かめで確かめ、出なければ統括に知らせて設計を直す",
]
