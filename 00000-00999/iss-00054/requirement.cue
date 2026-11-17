package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "端末への書き込み（1キー）を、iss-00049 のキーの組の守り（送る前と送る直前の確かめ、二度と送らない、記録に中身を残さない）の上に足す。誤って許すと取り返しにくいが、選べるのは1回だけの許可と拒否の2つだけで、戻すときは sendEnabled を偽にすれば止まる"
}

purpose: """
	`/embed/agent`（エージェントの詳細とチャットの小窓）の承認のカードから、端末のエージェント（Claude Code の permission prompt、Codex の承認）の許可の確認に答えられるようにする。
	答え方は、Orca 自身（v1.4.261 の `readAgentPromptAnswers` と、モバイルの `sendMobileNativeChatPermissionResponse`）と同じ：選択肢は「1回だけ許可」（allow_once）と「拒否」（reject_once）の2つで、許可は `1`、拒否は Escape の1キーを、`terminal.send`（enter 偽、requireWriteSettlement 真）で1組だけ送る。
	送る前と送る直前に、端末がまだ同じ許可の確認を出していることを確かめ、確かめられなければ送らずに止まり、「Orca で答えてください」と「Orca で開く」を示す。
	"""

background: """
	本人の要望（2026-11-18）：チャットで ask に答えたい。iss-00050（PR #53）は承認のカードを作り、端末のエージェントの許可は読むだけ（理由と「Orca で開く」）にした。iss-00049（PR #56、253a1a6）は端末の質問にキーの組で答える仕組み（門、アダプター、票、記録、二度と送らない）を作った。iss-00050 の report.md に、この Issue の案がある。

	Orca v1.4.261 のソース（stablyai/orca のタグ v1.4.261 を `.workbench/orca-src/` に取得して読んだ。確かめた事実）：
	- `src/shared/agent-status/contracts/agent-pending-prompt.ts` の `readAgentPromptAnswers`：タブの行の state が blocked か waiting（`hookRowAgentPhase` が needs-you）で、エージェントが知られた種類で、`interactivePrompt` が承認の封筒なら、選択肢を `{id: 'allow_once', label: 'Allow once'}` と `{id: 'reject_once', label: 'Reject'}` の2つにし、キーは allow_once が封筒の allowSend、reject_once が denySend。
	- `src/shared/native-chat/input/approvals/native-chat-approval-envelope.ts` の `parseNativeChatApprovalEnvelope`：interactivePrompt の JSON の `approval` が物で、`tool` が空でない文字なら読め、`summary` は空でない文字のときだけ。allowSend は `nativeChatApprovalAcceptKey(agent)`、denySend は ESC（`\\u001b`）。
	- `src/shared/native-chat/native-chat-agent-support.ts` の `nativeChatApprovalAcceptKey`：opencode なら CR、ほか（claude、codex など）は `1`。
	- モバイルの `mobile-native-chat-permission-send.ts`：選んだキーを1回の `terminal.send`（`enter: false`、`requireWriteSettlement: true`）で送る。結果が分からなければ「Response unconfirmed — check chat before retrying」と示し、送り直さない。
	- デスクトップの本体（`terminal-agent-prompt-answer.ts` の `TerminalAgentPromptAnswers`）：許可の確認の同一性を、pty、プロセスの世代、`stateStartedAt`、`interactivePrompt`、`toolName` の digest（promptId）で決め、送る直前に読み直して同じでなければ送らず、答えた promptId を覚えて二度と答えない。
	- 常に許可（Claude の「Yes, and don't ask again」など）は、Orca も端末の承認には出さない。
	orca-web の今（main 253a1a6）：会話の正規化は、端末のタブの agentStatus（state、interactivePrompt、stateStartedAt）から、待っている許可の確認を会話の最後の件 `pending-approval` の承認の部分（source terminal、options なし、answerable 偽）にする。門 `SendRpc` はキーの組の `terminal.send` を通すが、決めたキーに ESC だけの組はない。
	"""

includes: [
	"会話の正規化の端末の承認の部分に、同一性 `promptId` と、Orca と同じ2つの選択肢（allow_once、reject_once）を足し、答えられる形にする",
	"端末の承認のキーを決める純な関数と、端末が同じ許可の確認を出しているかを決める純な関数",
	"門に ESC だけのキーの組を足し、承認の答えの口（`/api/approval/*`）に端末の経路（promptId で指す）を足す。送る前と送る直前の確かめ、1組だけの送信、二度と送らないこと、記録に中身を残さないこと、照会",
	"承認のカードの端末の手段（approver）を、読むだけから答えられる手段に差し替える。送れないときの理由と「Orca で開く」、結果不明の帯",
	"README.md と AGENTS.md、偽の会話での描画の写し（Mac の幅と 390px、明暗）、端末の実機の確かめの手順（本人の確かめ）",
]

excludes: [
	"常に許可・常に拒否の選択肢を端末の承認に出すこと（Orca も出さない。Claude の「Yes, and don't ask again」の番号を送らない）",
	"claude と codex のほかのエージェント（opencode の CR など）へのキー。カードは読めるが、理由と「Orca で開く」を出す",
	"フォルダーの信頼（folderTrust）や起動のメニュー（startupMenu）の封筒への答え",
	"拒否の理由の文（Claude の「No, and tell Claude what to do differently」）を送ること",
	"構造化 Chat の承認（iss-00050）と質問の答え（iss-00048・iss-00049）の意味の変更",
	"iss-00050 の残りの P2-a・P2-b と、iss-00049 の残りの P2・P3 の直し",
	"SpecDock 側の組み込み（spec-dock の epic-00471・00526）",
]

requirements: {
	"R-01": {
		title: "会話の API の端末の承認の部分が、同一性と、Orca と同じ2つの選択肢を持つ"
		text: """
			端末の承認の部分（件 `pending-approval`、source terminal）に `promptId`（文字。Orca の promptIdentity と同じ考えで、interactivePrompt と stateStartedAt の digest から作る `ta_` で始まる値。構造化 Chat の承認の部分では null）を足し、options を `[{id: 'allow_once', label: 'Allow once', description: null, intent: 'allow_once'}, {id: 'reject_once', label: 'Reject', description: null, intent: 'reject_once'}]` にし、answerable を真、unanswerableReason を null にする。
			道具の名前か要約を上限で切った（truncated の）端末の承認は、options は同じで answerable を偽、unanswerableReason を 'terminal' にする（全部を見せられない許可を小窓から許さない）。
			promptId は答えの中身でも承認の中身でもない（digest の先頭だけ）。interactivePrompt の生の文字は今のとおり応答に出さない。
			"""
		acceptance: [
			"端末のエージェントが許可を待つとき、会話の最後の承認の部分が promptId（ta_ と16進20字）、2つの選択肢、answerable 真を持つ",
			"同じ interactivePrompt でも stateStartedAt が違えば promptId が違い、同じ値なら同じになる",
			"切った端末の承認は answerable 偽（terminal）になる。構造化 Chat の承認の部分は promptId が null で、ほかは今のまま",
		]
	}
	"R-02": {
		title: "利用者が、端末のエージェントの許可の確認に、カードから「1回だけ許可」か「拒否」で答えられ、Orca と同じキーが1組だけ届く"
		text: """
			カードは iss-00050 と同じ部品で、選択肢のボタン（最初の選択肢が主）を出す。押すと、意図（`/api/approval/intent` に `{agent, promptId, optionId, confirmPersistent}`）と確定（`/api/approval/confirm` に `{ticket, optionId}`）を1回ずつ送る。
			サーバーは宛先のエージェントの種類（claude か codex）で、allow_once は `1`、reject_once は ESC の1キーを、`terminal.send`（`enter: false`、`requireWriteSettlement: true`、client は今のキーの組と同じ）で1回だけ送る。
			受けられたら、カードは「答えを送りました。エージェントの続きを待っています」と示す。エージェントが待ちから抜けると、承認の件は会話から消える（今のとおり）。
			"""
		acceptance: [
			"claude と codex で、allow_once が `1`、reject_once が ESC のバイトになり、terminal.send が1回だけ呼ばれる（Orca の readAgentPromptAnswers・nativeChatApprovalAcceptKey と同じ値）",
			"端末の実機（試しの端末の Claude Code の permission prompt に小窓から答え、許せば操作が進み、拒めば止まる）は、本人の確かめとする（iss-00049 と同じ事情。試しのエージェントを端末で立てる道が決まっていない）。手順を report.md に残す",
		]
	}
	"R-03": {
		title: "常に許可の確かめの段は iss-00050 と同じ部品と規則を使い、端末の承認には常に許可・常に拒否を出さない"
		text: """
			画面の確かめの段（allow_always・reject_always を押すと1行と「<ラベル> で答える」「やめる」を出す）と、サーバーの `confirmPersistent` の守り（checkOption）は、端末の承認にも同じものを通す。端末の承認の選択肢は allow_once と reject_once だけなので、確かめの段は出ない。
			サーバーは、端末の承認に allow_once・reject_once のほかの optionId を受けない（invalid_answer、unknown_option）。
			"""
		acceptance: [
			"端末の承認の意図が、allow_once・reject_once のほかの optionId（allow_always、`2` など）を invalid_answer で拒み、書き込みの RPC を0回にする",
			"画面の端末の手段も、構造化 Chat と同じ板（createApprovalBoard）と choose を通る",
		]
	}
	"R-04": {
		title: "送る前と送る直前に、端末が同じ許可の確認を出していることを確かめ、確かめられなければ送らずに止まる"
		text: """
			意図と確定のどちらでも、送る前に次をすべて確かめ、どれかが外れたら1つも送らず理由を返す：
			- 宛先が端末で、エージェントの種類が claude か codex（違えば not_sendable の chat_route か agent_keys_unknown）。能力 answerKeys がある。前面のプロセスがそのエージェント（今のキーの組と同じ確かめ。status の permission は拒まない）。
			- 宛先のペインのタブの agentStatus（state、interactivePrompt、stateStartedAt）を読み、state が blocked か waiting で、interactivePrompt が承認の封筒で、その promptId が要求の promptId と同じ。タブに agentStatus がなければ、宛先の解決（preflight）が今のとおり not_sendable（no_session）で止める。agentStatus はあるが物の形でない、または待っているのに interactivePrompt がない（空の文字を含む）なら not_sendable（prompt_unverified）、待っていなければ target_changed（question_gone）、interactivePrompt が承認の封筒として読めない（JSON でない、質問などの別の封筒）か promptId が違うなら target_changed（prompt_mismatch）、封筒の道具の名前か要約が上限を超える（切られる）なら not_sendable（prompt_unsupported）。
			- 同じエージェントの同じ promptId に、前に送り始めた答えの記録がない（あれば already_sent）。
			確定は、送る前の記録を書いた後、キーを送る直前に、タブの agentStatus をもう一度読み、同じ promptId の許可の確認がまだ待っていなければ送らない（refused、not_sent）。
			カードは、意図の拒みが prompt_mismatch・question_gone・question_answered・already_sent・prompt_unsupported・agent_keys_unknown のとき、選択肢を押し直せない形にし、理由と「Orca で開く」を出す。prompt_unverified とほかの一時の拒み（busy、unreachable など）は、理由を示して押し直せる。端末の承認の未回答のカードは、いつも「Orca で開く」を出す。
			"""
		acceptance: [
			"agentStatus がない（no_session）、interactivePrompt がない（prompt_unverified）・JSON でない、state が working、promptId が違う、承認でなく質問の封筒、前面がシェル、前に送った記録がある、のそれぞれで、terminal.send を1回も呼ばずに決めた理由を返す",
			"確定の送る直前の読みで許可の確認が消えたか変わったら、terminal.send を呼ばずに refused（not_sent）を返す",
			"カードが、prompt_unverified の拒みで理由と「Orca で開く」を出して押し直せ、prompt_mismatch・already_sent などの拒みで押し直せない形になり、どちらも送ったと示さない",
		]
	}
	"R-05": {
		title: "送った答えは二度と送らず、結果が分からなければ自動で送り直さず、記録に中身を残さない"
		text: """
			送り始めた答え（送る前の記録を書いたもの）は、結果によらず、同じエージェントの同じ promptId に二度と送らない（orca-web を起動し直しても、記録から分かる）。同じ票の2回目の確定と、送っている間の押しは送らない。
			結果は、受けられた（input_accepted、code keys_sent）、受けられなかった（refused、code not_sent）、分からない（unknown、code unconfirmed）に分ける。unknown のカードは「届いたか分かりません。Orca で確かめてください」と「Orca で開く」を出し、選択肢を押せない形にする。確定の 200 の refused も、同じ promptId には送れないので、押し直せない形（理由と「Orca で開く」）にする。
			照会（`GET /api/send/{操作の ID}?check=1`）は、宛先のペインの今の agentStatus を読み、同じ promptId の許可の確認がまだ待っていれば unknown（prompt_pending）、待っていなければ unknown（resolved_unverified）を返す（どちらの答えで抜けたかは分からない）。送り直さない。
			送信の記録には、選択肢の id・ラベル、キーのバイト、道具の名前、要約を書かない（action approval、route terminal、promptId、intent、digest、組の数だけ）。
			"""
		acceptance: [
			"送り始めた後は、同じ promptId への意図と確定を already_sent で拒む（新しい SendService でも記録から拒む）",
			"terminal.send が refused・unknown・RPC の誤りのとき、送り直さず、refused（not_sent。method_not_found なら code method_not_found）か unknown（unconfirmed）を返す",
			"記録の行が、optionId・ラベル・キー（text・bytes など）・道具の名前・要約の項目を持たず、ESC のバイトと、道具の名前と要約の文字が入らない（intent の値は入る。intent は選択肢の id と同じ文字になるが、決めた4つの値の記録として許す）",
			"照会が、待っている同じ promptId で prompt_pending、ないときに resolved_unverified を返し、terminal.send を呼ばない",
			"カードが unknown で、届いたか分からない帯と「Orca で開く」を出し、選択肢を押せない",
		]
	}
	"R-06": {
		title: "答えられないときは、カードは読めるが押せず、理由を1行で示し、「Orca で開く」を出す"
		text: """
			sendEnabled が偽、Orca の能力がない、エージェントの種類がキーを知らない（claude と codex のほか）、宛先の確かめが通らない、切った承認、promptId のない古い部分、のときは、選択肢を押せず、理由を1行で示し、「Orca で開く」を出す。
			送れるかは、今の `GET /api/send/status` の `answerKeys`（`{available, reason}`。端末の質問のキーの組と同じ確かめ）で決める。status に新しい項目は足さない。
			"""
		acceptance: [
			"sendEnabled 偽、answerKeys が agent_keys_unknown・unsupported、promptId のない部分、切った承認で、カードが読めて押せず、理由と「Orca で開く」が出る",
			"answerKeys が available の端末の Claude で、端末の承認のカードの選択肢が押せる",
		]
	}
	"R-07": {
		title: "狭い枠（SpecDock の欄、390px）でも読めて押せる"
		text:  "iss-00050 の R-07 と同じ。端末の承認のカード（未回答の押せる形、押せない形と理由、送った後、結果不明の帯）も、390px で横にはみ出さず、選択肢のボタンの高さが 44px 以上。"
		acceptance: [
			"端末の承認のカード（押せる形、押せない形、送った後、結果不明の帯、押し直せない形）が、偽の会話を与えた一時の orca-web とヘッドレスの Chrome で、幅 1280px と 390px、明暗で、横にはみ出さず、選択肢のボタンの高さが 44px 以上（写しのパスを report.md に残す）",
		]
	}
}

failures: {
	"F-01": {
		title: "キーを送る途中で orca-web が止まったときは、記録の後の行がなく、照会は結果不明（no_after_record）とし、同じ promptId に二度と送らない"
	}
	"F-02": {
		title: "確かめた後、送る直前までに許可の確認が答えられた・別の確認に変わったときは送らない（送る直前の読み）。送る直前の読みと書き込みの間に変わることは見分けられない（Orca 自身の同期の fence より広い隙間。残る危険として risks に書く）"
	}
	"F-03": {
		title: "Orca の応答（`terminal.send` の受け取り、タブの agentStatus）が知らない形なら、送らないか（送る前）、結果不明として止める（送った後）"
	}
	"F-04": {
		title: "門は、キーの組の text に、決めたキー（今の表と ESC だけ）、制御文字のない文、括弧付きの貼り付けのほかを通さない。ESC で始まる決めていない列（ESC [ D など）は今のとおり拒む"
	}
}

constraints: [
	"実行時の依存を足さない。画面は素の ES Modules で、DOM は textContent と createElement だけで描く",
	"送る経路は、今の決めた形のキーの組の `terminal.send` だけを使い、決めたキーに ESC を1つ足すほかは門を広げない。再送の道を足さない",
	"Orca のキーと選択肢を変えない（Orca の関数を写して、同じ値のテストで確かめる）",
	"会話の API と答えの口は同じオリジンだけ（CORS なし）。書き込みの守りは今の送信と同じ",
	"承認のカードの部品（approval-view.js の板、choose、確かめの段、言葉の表）と、質問のカードの契約は変えずに使う",
	"実機の確かめは試しのエージェントと試しの orca-web（別のポート、専用の settings）だけ。常駐の orca-web（8791）の設定を変えない",
	"本人の方針：本人の環境に特化した決まりを入れない、普遍的でシンプルな仕組みにする",
]

decisions: [
	"選択肢は Orca の readAgentPromptAnswers と同じ allow_once（Allow once）と reject_once（Reject）の2つだけにする。常に許可は出さない（Orca も出さない）。ラベルは Orca の英語のまま（構造化 Chat の承認の選択肢も Orca の英語のラベル）。タスク担当の判断、2026-11-18",
	"同一性 promptId は interactivePrompt と stateStartedAt の digest にする（Orca の promptIdentity の pty とプロセスの世代は、宛先の incarnationId の比べ方（compareTargets）と前面の確かめで代える）。タスク担当の判断、2026-11-18",
	"送れるかは今の status の answerKeys を使い、新しい項目を足さない（同じ確かめ。シンプルにする）。タスク担当の判断、2026-11-18",
	"切った端末の承認は答えさせない（全部を見せられない許可を小窓から許さない。安全側）。タスク担当の判断、2026-11-18",
	"答えの口は今の `/api/approval/*` に端末の経路（promptId）を足す（承認の言葉の表、板、照会を共有する）。タスク担当の判断、2026-11-18",
	"端末の実機の確かめ（R-02 の受け入れの2つめ）は本人の確かめに残す。iss-00049 と同じく、試しのエージェントを端末で立てる道（worker-start は本人の設定で構造化 Chat、`orca terminal create` はフックが止める）が決まっていないため。依頼書の4（2026-11-18）",
	"送るクライアントは今のキーの組と同じ `{id: 'orca-web', type: 'desktop'}` にする",
]

questions: [
	"タブの agentStatus に、端末のエージェントが許可を待つ間 interactivePrompt（承認の封筒）が `session.tabs.listAll` で出るかは、Orca のソースの型にあるが実機では未確認（iss-00050 の Residual Risks）。出なければ端末の承認のカードはそもそも出ない（安全側）。本人の確かめに残す",
]
