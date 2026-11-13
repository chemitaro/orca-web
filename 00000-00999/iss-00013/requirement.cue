package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "strict"
	reason: "誤送信や二重送信は取り消せず、作業を壊しうる"
}

purpose: """
	利用者が、orca-web の詳細とチャットの画面（`/embed/agent?id=…`）から、Orca のエージェント（端末の Claude Code と Codex、構造化 Chat）へ、宛先と本文を確かめてから指示を送れるようにする。
	送る前と後の記録をこの Mac の中に残し、結果が分からない送信は、送り直さずに同じ操作の ID で確かめられるようにする。送信は設定で止められ、止めると画面は読むだけになる。
	"""

background: """
	親の epic-00004 の切り分け（slices の iss-00013。covers は R-02、R-03、F-01〜F-04、F-06）を受け、Epic の D-02（送信の3段）、D-03（送る経路のアダプター）、D-04（送信の記録）を具体にする。
	前の Issue の土台：iss-00007 の書き込みの守り（Host の完全一致、同じオリジンの JSON、短期のトークン `X-Orca-Web-Token`）、iss-00012 の詳細とチャットの画面と会話の読み手、iss-00017 と iss-00018 の状態の文書の項目。
	Orca のソースは、この Mac の版のタグ v1.4.258 を根拠にする（2026-11-13、`.workbench/orca-src`）。確かめたこと：
	- 端末の守りの経路（`terminal.send` の `requireAgentStatus: "sendable"`）は、本文と Enter を同時に送れず2段になり、本文を貼り付けの枠なしの生のキー入力で書き（`terminal-send-payload.ts`）、要求の ID も receipt も持たない。
	- 耐久の agent prompt の経路（`terminal.send` の `agentPrompt: true` と、要求の封筒の `orchestrationRequestId`。Orca CLI の `terminal send --text --enter` と同じ）は、貼り付けの枠で書き、貼り付けの前と Enter の前に権限の確認待ちを確かめて `agent_prompt_blocked` で止め、同じ ID の再送には記録を返すだけで2回目を書かず（`orchestration-mutation-executor.ts`）、読むだけの `orchestration.requestShow` で結果を照会できる。ただし、Orca がその時にエージェントを認めないと、守りなしで本文と Enter を書く（`terminal-send-method.ts` の `useSettledAgentPrompt` が偽の枝）。
	- 構造化 Chat の `agentSession.send` は、`clientOperationId` と `payloadFingerprint` で二重の送信を防ぎ（同じ ID と同じ指紋は記録を返す）、`expectedRuntimeFence` を送信では見ない。作業中や確認待ちのセッションへの送信は拒まず、カードとして待たせ、確認には答えない。読むだけの `agentSession.sendRecorded` で、記録があるかを真偽で照会できる（偽は届いていない証拠ではない）。
	"""

includes: [
	"送信の3段の HTTP の口（`POST /api/send/intent`、`POST /api/send/confirm`）と、送れるかを示す口（`GET /api/send/status`）",
	"送る経路のアダプター（端末は耐久の agent prompt の経路、構造化 Chat は `agentSession.send`）と、送る経路の門",
	"送信の記録（この Mac の利用者の置き場、権限 0600、追記）と、結果不明の確かめの口（`GET /api/send/{操作の ID}`）",
	"送信を止める設定 `sendEnabled`（settings.json）",
	"詳細とチャットの画面の、送る欄と確認の画面と結果の表示",
	"iss-00012 の残り（P2）：`agentSession.history` の返したページの sessionId の照合と、続きがあるのに位置が欠けるページを `unknown_shape` にすること",
	"統括が用意した検証用の端末のエージェント（2つ）での送信の実機の確かめと、report.md への記録（件数と結論だけ）",
	"epic-00004 の設計の D-03 と D-04 の、Orca 1.4.258 に合わせた書き換え（統括の許し、2026-11-13）",
]

excludes: [
	"権限の承認の代行、割り込み（interrupt）、待ち行列の操作（`queue-if-active` を含む）",
	"画像や添付、skill の指定の送信（本文の文字だけを送る）",
	"結果不明の送信の自動の再送。同じ操作の ID での再送も行わない（照会だけ）",
	"エージェントの起動と停止、受け箱や木の画面からの送信",
	"SpecDock のオリジンの試しの画面での受け入れ（iss-00014）",
	"送信の記録の自動の削除と、記録を見る一覧の画面",
]

requirements: {
	"R-01": {
		title: "利用者が、送る前に、宛先と本文を確かめられる（送る意図）"
		text: """
			`POST /api/send/intent`（物は `{ agent, text }`。agent は状態の API のエージェントの id）が、Orca の最新の読みで宛先を解いて固定し、確認に要る項目と、使い捨ての確認の票を返す。
			確認の項目：リポジトリの名前、worktree のパスとブランチ、エージェントの種類、題名、状態、送る経路（端末か構造化 Chat か）、セッションの短い識別子（先頭の8文字）、本文。確認の項目の worktree は、解いた宛先の worktree と同じでなければならない（違えば票を出さない）。
			票は、宛先と本文の sha256 と操作の ID に結び付き、期限は 60 秒で、1回だけ使える。操作の ID は意図の応答で画面に渡し、確定の応答を失っても、画面はその ID で照会できる。送れない宛先（タブがない、スリープ中の端末、セッションが結ばれていない、権限の確認待ちの端末、エージェントが動いていない端末、前面のプロセスが宛先のエージェントそのものでないか読めない端末、必須の識別子が取れない）には票を出さず、理由を返す。
			本文は、空や空白だけでない、UTF-8 で 16 KiB までの文字。タブと改行のほかの制御文字（C0、DEL、C1）を含めない。
			"""
		acceptance: [
			"録画した状態から、意図の応答に確認の項目と票と期限が返る",
			"送れない宛先の種類ごとに、区別した誤りの code が返り、票が出ない",
			"空の本文、16 KiB を超える本文、制御文字を含む本文が 400 で拒まれる",
		]
	}
	"R-02": {
		title: "利用者が確定すると、確かめ直したうえで、その宛先にだけ1回だけ届く（確定）"
		text: """
			`POST /api/send/confirm`（物は `{ ticket, text }`）が、票を使い済みにしてから、Orca の最新の読みで次を確かめ直す：Orca の runtime の ID、宛先の同一性（端末はタブ、leaf、端末の handle、ptyId、incarnation、エージェントの種類、provider のセッションの識別子。構造化 Chat はタブ、セッションの識別子、エージェントの種類）、本文の sha256、送れる状態（端末は `terminal.agentStatus` でエージェントがいて権限の確認待ちでなく、`terminal.inspectProcess` で前面のプロセスが宛先のエージェントそのもの）。
			1つでも違えば、送らずに 409 で確かめに戻す。同じでなければ送る経路で1回だけ送り、結果を返す。同時に送るのは1つだけで、送っている間の確定は断る。
			"""
		acceptance: [
			"録画の再生で、確かめた宛先にだけ、送る RPC が1回だけ送られる",
			"票の後に宛先が変わる（タブが閉じる、同じ枠で別のエージェントやセッションになる、ptyId や incarnation が変わる、Orca が再起動する）と、送る RPC を送らずに 409 になる",
			"同じ票での2回目の確定、期限の切れた票、別の本文での確定が、送る RPC を送らずに拒まれる",
			"同時の2つの確定で、送る RPC は1回だけ送られる",
		]
	}
	"R-03": {
		title: "送る経路が、Orca の保護つきの経路だけを使う"
		text: """
			端末のエージェントは、耐久の agent prompt の経路（`terminal.send` に `agentPrompt: true`、`text`、`enter: true`、`client: { id: "orca-web", type: "desktop" }`、要求の封筒に `orchestrationRequestId` として操作の ID）で送る。
			構造化 Chat は `agentSession.send`（`clientOperationId` に操作の ID、本文の指紋 `payloadFingerprint`、`delivery` は付けない）で送る。
			送る経路の門が、この2つの形の書き込みと、決めた読む RPC のほかを送らずに拒む。シェルへの代わりの送信、守りの経路への切り替え、別の ID での再送はしない。
			"""
		acceptance: [
			"門が、決めた形でない `terminal.send`（interrupt、agentPrompt がない、操作の ID がないなど）と `agentSession.send`（delivery、options、画像の block など）と、一覧にない RPC を送らずに拒む",
			"構造化 Chat の指紋が、Orca v1.4.258 の算法（`agent-session-mutation-envelope.ts`）と同じ値になる（固定の値のテスト）",
		]
	}
	"R-04": {
		title: "送った指示の記録が、この Mac の中に残り、結果の5つの区別が分かる"
		text: """
			送る前（操作の ID、宛先、本文、本文の sha256、時刻、確かめた世代＝runtime の ID と端末の incarnation）と、送った後（結果と Orca の receipt の要点）を、利用者の置き場（既定 `~/Library/Application Support/orca-web/sends/`、ディレクトリ 0700、ファイル 0600）の記録に追記する。
			結果は5つに分ける：accepted（受け付けた）、input_accepted（入力を受けた）、submitted（送信を確かめた）、unknown（結果不明）、refused（拒んだ）。送る前の記録を書けなければ送らない。守りを通った確定の要求を確定の口で拒んだもの（票の誤り、宛先の変化、送れない状態、送信の停止）も、本文を除いて記録する。
			Orca の authToken は記録しない。サーバーのログには本文を出さない。
			"""
		acceptance: [
			"送るたびに、送る前と後の記録が残り、5つの結果の区別が記録と応答に出る",
			"記録の置き場に書けないとき、送る RPC が送られず 503 になる",
			"記録のファイルの権限が 0600、ディレクトリが 0700 で、記録に authToken が含まれない",
		]
	}
	"R-05": {
		title: "結果不明の送信を、送り直さずに、同じ操作の ID で確かめられる"
		text: """
			`GET /api/send/{操作の ID}` が、記録からその送信（宛先、時刻、本文、結果、確かめの経過）を返す。`?check=1` を付けると、結果が unknown の送信だけ、Orca に読むだけの照会をする（端末は `orchestration.requestShow`、構造化 Chat は `agentSession.sendRecorded`）。
			照会の結果を記録に追記し、分かったことを返す。照会でも分からなければ unknown のまま、「Orca の画面で確かめてから、必要なら改めて送る」と示す。この口は送る RPC を決して送らない。
			記録がない ID の照会は、2つに分けて答える。その ID の確定が処理の途中なら `in_progress`（少し待ってもう一度照会する）。そうでなければ、その ID のまだ使われていない票を取り消してから `not_sent`（送っていない。後から確定が届いても送らない）。送る前の記録を書いてから送り、票は1回だけ使えるので、`not_sent` は確かに送っていないことを意味する。
			"""
		acceptance: [
			"結果不明の送信を照会すると、読む RPC だけが送られ、Orca の記録に応じて結果が変わるか unknown のままになる",
			"送る前の記録だけがあり後の記録がない送信（送っている間にサーバーが止まった）が unknown として返る",
			"意図で得た操作の ID の確定が届かなかったとき、照会が not_sent を返し、その後に届いた確定は送らない（票が取り消されている）",
			"確定の処理の途中の ID の照会が in_progress を返し、not_sent を返さない",
		]
	}
	"R-06": {
		title: "送信を設定で止められ、止めると画面は読むだけになる"
		text: """
			設定のファイル（`ORCA_WEB_SETTINGS_FILE`、既定 `~/Library/Application Support/orca-web/settings.json`）の `sendEnabled` が真のときだけ送れる。鍵がない、偽、ファイルが読めない、壊れているときは送れない。
			意図と確定と送れるかの口のたびにファイルを読み直す（再起動なしで止められる）。HTTP の口からは変えない。項目の選択の保存は `sendEnabled` を消さない。
			止まっているとき、意図と確定は 403 `send_disabled` で拒み、結果の確かめの口（R-05）は使える。画面は送る欄を止め、理由を示す。
			"""
		acceptance: [
			"`sendEnabled` が真でない各場合に、意図と確定が送る RPC を送らずに 403 になる",
			"ファイルを偽に書き換えると、再起動なしで次の確定から拒まれる",
			"項目の選択を保存しても `sendEnabled` が残る",
		]
	}
	"R-07": {
		title: "利用者が、詳細とチャットの画面で、書いて、確かめて、送って、結果を見られる"
		text: """
			`/embed/agent?id=…` の会話の下に送る欄を置く。「確かめる」で意図を送り、確認の画面（R-01 の項目、本文、期限）を示し、「送る」で確定し、「やめる」で書く欄に戻る。
			結果は5つの区別を言葉で示し、unknown では「確かめる」（R-05 の照会）を示す。端末で「要確認」（Orca がエージェントを確かめずに書いた可能性）のときは、その旨を示す。409 では理由を示して、本文を残したまま書く欄に戻る。
			送る間はボタンを押せなくし、時間切れや結果不明で自動の再送をしない。送れないとき（設定で止まっている、経路が確かめられない、宛先が送れない状態）は、送る欄を止めて理由を示す。
			本文と宛先の項目は textContent で描く。幅 390px で横にはみ出さずに使える。
			"""
		acceptance: [
			"画面の組み立ての純粋な関数のテストで、確認の画面の項目、5つの結果の言葉、unknown の確かめの操作、409 で本文を残して戻ることが確かめられる",
			"確定のボタンを2回押しても、確定の要求は1回だけ送られる",
			"`<script>` を含む本文と題名が、確認の画面に文字のまま描かれ、要素にならない",
			"実機で、幅 390px の表示で、送る欄と確認の画面が横にはみ出さない",
		]
	}
	"R-08": {
		title: "会話の読み手が、頼んだのと別のセッションのページや、位置の欠けたページを、読めたことにしない"
		text: """
			iss-00012 の最終品質ゲートの P2 の2つを直す。`agentSession.history` の返したページの `sessionId` が頼んだものと違えば `unknown_shape`。
			続きがある（nativeChat の `hasMore`、agentSession の `hasOlder` が真）のに、より古いページの位置（`beforeOffset`、`window.oldest`）が欠けるか形が違えば、最後のページとして扱わず `unknown_shape`。
			"""
		acceptance: ["録画の再生で、別の sessionId のページと、位置の欠けた続きのあるページが、どちらも unknown_shape になる"]
	}
	"R-09": {
		title: "この Mac の Orca で、検証用の端末のエージェントへ送れることと、宛先が変わったときに送らないことが確かめられている"
		text: """
			統括が用意した検証用の端末のエージェント（worktree send-test の Claude と Codex の2つ）だけに送り、結果の区別、記録、結果の照会、応答の消失のあとの照会（`orchestration.requestShow` が orca-web の呼び手で receipt を引けること）、宛先の変化（票の中の宛先の識別子を道具が書き換えた確定が、本物の読みとの比べで送らないこと）、送らない場合（使い済み・期限切れの票、本文の違い、送信の停止）を確かめる。
			業務中のエージェントには送らない。構造化 Chat は、検証用のセッションが用意されたときだけ実機で確かめ、なければ録画と再生だけで確かめたと記録する。
			件数と結論だけを report.md に書き、送った文と返答の中身は写さない。
			"""
		acceptance: ["report.md に、Orca の版、送り先の数、送った回数と結果の区別ごとの数、照会の結論、送らなかった場合の確かめが、件数だけで書かれている"]
	}
}

failures: {
	"F-01": {
		title: "宛先が確かめのときから変わったら、送らずに確かめに戻る"
		text:  "R-02 の確かめ直しで、runtime の ID、宛先の識別子、本文の sha256 のどれかが違えば 409 `target_changed`（理由の種類つき）を返し、送る RPC を送らない。"
		impact:   "別のエージェントやシェルに指示が入り、作業を壊す"
		recovery: "画面は本文を残して書く欄に戻り、利用者が最新の宛先で確かめ直す。送ってしまった場合は記録から宛先と本文を特定し、Orca の画面で対処する"
	}
	"F-02": {
		title: "権限の確認待ちや、エージェントが動いていない端末には送らない。シェルへの代わりの送信もしない"
		text: """
			意図と確定の両方で `terminal.agentStatus` を読み、`isRunningAgent` が真でないか `status` が `permission` なら 409 `not_sendable` で送らない。さらに `terminal.inspectProcess`（`expectedIncarnationId` つき）で前面のプロセスを読み、宛先のエージェントの種類そのもの（Orca の `isExpectedAgentProcess` と同じ名前の規則。claude は `claude`、codex は `codex`・`codex-…`）でなければ送らない。シェル、ほかのプログラム（例：`python3`）、読めない前面は、どれも送らない（`terminal.agentStatus` は題名の状態だけでエージェントありと返すことがあり、Orca が保護つきで書くかの判定とは別物のため）。
			Orca が `refusedReason`（`no-agent`、`permission`）で拒んだら refused として記録する。送った後の Orca の誤り（`agent_prompt_blocked`、`terminal_handle_stale` など。本文を書いた後にも起きうる）は unknown として記録する。どちらも送り直さない。
			送った後の receipt に、エージェントの経路で書いた証（`send.prompt` の provider が claude、codex、antigravity）がなければ、unknown（要確認）として記録し、画面にその旨を示す。
			"""
		impact:   "権限の承認や拒否、シェルのコマンドとして受け取られ、意図しない操作が進む"
		recovery: "Orca の画面で利用者が確認に答えるか、エージェントの様子を確かめてから、改めて送る"
	}
	"F-03": {
		title: "結果が分からない送信を、新しい要求としても、同じ ID でも、送り直さない"
		text:  "時間切れ、接続の断ち切れ、知らない形の応答、receipt の欠けは unknown として記録する。orca-web は自分から送り直さず、画面も自動で送り直さない。照会は読む RPC だけで行う（R-05）。"
		impact:   "同じ指示が2回届き、作業が2回行われる"
		recovery: "記録の unknown を示し、同じ操作の ID で照会する。届いていないと分かったか、Orca の画面で確かめた後に、利用者が改めて送る"
	}
	"F-04": {
		title: "送る経路が確かめられないときは、その経路の送信を止める"
		text: """
			機能の確かめで、端末の経路は `terminal.prompt-delivery.v1`、構造化 Chat は `agent-session.structured.v1` と `agent-session.send-recorded.v1` を Orca の status に要し、runtime の ID がそろうことを要する。欠ければその経路の意図を 501 `unsupported` で拒む。
			タブの集合に、端末の宛先の必須の識別子（handle、ptyId、incarnation、provider のセッションの識別子）がなければ、その宛先は送れない（`not_sendable`、理由 `identity_unavailable`）。送る RPC が `method_not_found` を返したら、何も書かれていないので refused として記録し、その経路を止める。
			"""
		impact:   "保護のない経路で送り、F-01・F-02 を防げない"
		recovery: "読むことは続け、送る欄を止めて理由を示す。Orca に合わせて直してから有効にする"
	}
	"F-05": {
		title: "別のオリジン、許していない Host、トークンのない要求、古い確かめ（期限切れ、使い済み）からの送信を拒み、記録する"
		text:  "送信の口（意図と確定）は、iss-00007 の書き込みの守り（Host の完全一致、同じオリジンの JSON、短期のトークン）の後に置き、CORS を付けない。守りを通った確定の要求を確定の口で拒んだときは、本文を除いて送信の記録に書く。守りで拒んだ要求は、別のサイトが記録を限りなく増やせないよう送信の記録には書かず、道ごとの件数をサーバーのログに1分に1回まで出す。結果の確かめの口と送れるかの口は同じオリジンの読みだけを受ける。"
		impact:   "悪意のある画面や古い画面から、利用者の意図しない指示が送られる"
		recovery: "画面を開き直して確かめ直す"
	}
	"F-06": {
		title: "送る前の記録を書けなければ、送らない"
		text:  "送る前の記録の追記と同期（datasync）が終わってから送る RPC を送る。失敗したら 503 `record_failed`。送った後の記録を書けなかったときは、結果を返したうえで、記録の失敗を応答に示し、サーバーのメモリーに持って、照会の口で返す。"
		impact:   "記録のない送信が起き、結果不明のときに確かめられない"
		recovery: "置き場の権限や空きを直してから送る"
	}
}

constraints: [
	"Orca に送る書き込みは、R-03 の2つの形だけ。読む RPC は、既存のものに `terminal.agentStatus`、`terminal.inspectProcess`、`orchestration.requestShow`、`agentSession.sendRecorded` を足すだけ",
	"Orca の authToken とペアリングのコードを、記録、応答、画面、ログ、録画に出さない",
	"録画の fixture は、自分で作った仮の宛先と本文にする",
	"実行時の依存を足さない",
	"実機の確かめは、統括が用意した検証用の宛先だけに送る。worktree send-test の中のファイルは変えない",
]

risks: [
	"端末の経路の残る隙：Orca は、その時に前面のプロセスをエージェントと認めないと（v1.4.258 の `isTerminalRunningSettledPromptAgent` が偽、`useSettledAgentPrompt` が偽の枝）、守りなしで本文と Enter を生のまま端末に書く。この判定は RPC で外に出ていない。orca-web は前面のプロセスが宛先のエージェントそのものであることを確かめる（F-02）ので、残るのは確かめ直しと Orca の書き込みの間（ミリ秒。送る前の記録の書き込みを含む）の競合だけ。その間にエージェントが終わると、終わった後の前面（シェルなど）に生のまま書かれうる。送った後の receipt で検出して unknown（要確認）と示すが、書いたことは取り消せない。Orca 1.4.258 には、書き込みの時点で守りつきかつ耐久の経路がない（守りの経路は2段で receipt がない）",
	"構造化 Chat の宛先の同一性は sessionId だけで確かめる（Orca 1.4.258 は送信で `expectedRuntimeFence` を見ない）",
	"`agentSession.sendRecorded` の偽と、`orchestration.requestShow` の absent は、届いていない証拠ではない。`agentSession.sendRecorded` の真は、受けた記録があることだけを示し、届いたかは示さない",
	"`terminal.send`、`agentSession.send`、`orchestration.requestShow`、`agentSession.sendRecorded` は Orca の非公開の口。版が変わったら、録画を取り直し、実機の確かめをやり直す",
	"送信の記録は消さずに増える（1人で使う前提。消し方は README に書く）",
	"構造化 Chat の結果の形（`value.submission.dispatchState`、`value.queued.state`）は Orca のソースの型から決めた。構造化 Chat の実機の確かめができるまでは録画（手書き）だけで確かめる",
	"`orchestration.requestShow` が、orca-web の Unix ソケットの呼び出しと同じ呼び手の鍵（ローカルの mutation の呼び手）で receipt を引けることは、実機の確かめ（S-10、応答を捨てる場面）で確かめる",
	"権限の確認待ちの端末を拒むことは、検証用の宛先で安全に作れないので、録画と再生だけで確かめる",
	"項目の選択の保存は、設定のファイルを比べてから入れ替えるが、直前の読みと入れ替えの間（マイクロ秒）に手で sendEnabled を書き換えると、その書き換えが上書きされうる。止めたいときは、書き換えた後に送れるかの口（画面の送る欄）で止まったことを確かめる（README に書く）",
]

decisions: [
	"2026-11-13 統括の判断（Q1）：端末の送る経路は、Epic D-03 の守りの2段ではなく、耐久の agent prompt の経路（`orchestrationRequestId` つき）にする。条件は、送る直前に `terminal.agentStatus` とタブの ptyId・incarnation・providerSession を確かめ、1つでも違えば送らないこと、送った後の receipt で届いたかを確かめ、届いていなければ要確認と示すこと、残る隙を risks に書くこと。Epic の D-03・D-04 の書き換えをこの件に限り任された",
	"2026-11-13 統括の判断（Q2）：`sendEnabled` は settings.json の鍵、既定は偽、HTTP から変えない、意図と確定のたびに読み直す",
	"2026-11-13 統括の判断（Q3）：構造化 Chat の送信に `delivery` を付けない（Orca の既定。作業中の turn に合流する）。本人の決定「作業中のエージェントにも送る」（2026-11-06）と合う",
	"2026-11-13 統括の判断（Q4）：実機の送り先は worktree send-test の Claude（term_33f82ee2…）と Codex（term_0787c5d8…）の2つだけ。構造化 Chat の検証用のセッションは本人に頼み、用意できたら知らせる。それまでは録画と再生",
	"2026-11-13 タスク担当：操作の ID は意図のときに作って票に結び付け、意図の応答で返す（仕様のレビュー round 1 の P1。確定の応答を失っても照会できるように）。形は `<13桁のミリ秒>-<32桁の16進>`（構造化 Chat の clientOperationId の形。端末の orchestrationRequestId は任意の文字列を受けるので同じ形を使う。Orca は 24 時間より古い clientOperationId を拒むが、票の期限は 60 秒）",
	"2026-11-13 タスク担当：送る前の確かめに `terminal.inspectProcess` の前面のプロセスがシェルでないことを足す（仕様のレビュー round 1 の P1。`terminal.agentStatus` は題名だけでエージェントありと返す枝がある）。残る隙を risks に書き直した。統括が了承した（2026-11-13、msg_0d4cef153a1c）",
	"2026-11-13 タスク担当（仕様のレビュー round 3 の P1）：照会は、await の前に処理中の判定と票の取り消しを済ませてから記録を読む。確定のときの宛先の消失（タブがない、runtime の変化、スリープ）は 409 `target_changed` にする。端末の receipt の provider が確かめたエージェントの種類と違えば unknown（`agent_mismatch`）にする。項目の保存は設定のファイルを比べてから入れ替える",
	"2026-11-14 タスク担当（最終品質ゲート attempt 01 の ChatGPT の P1）：前面のプロセスの確かめを「シェルでない」から「宛先のエージェントそのもの」に強める。実機の検証用の端末の前面は `claude` と `codex` だった。名前が版の番号に見える Claude などは送れない（Orca の画面から送る）側に倒す。残る隙は競合だけになった（risks）",
	"2026-11-13 タスク担当：構造化 Chat のスリープは送る前に拒まない。Orca v1.4.258 で、スリープの印 `sleptAt` は購読の口（`agentSession.subscribeStatus`）の要約だけにあり、Unix ソケットで使える読む口（`session.tabs.listAll` の `chatStatus`、`agentSession.history`）にはない。送ると、Orca の画面の入力欄から送るのと同じく Orca が扱う（受けない場合は Orca が拒み、refused になる）。端末のスリープは PTY がなく送れないので拒む",
	"2026-11-13 タスク担当：記録のない ID の照会は、処理の途中なら in_progress、そうでなければその ID の票を取り消してから not_sent と答える（仕様のレビュー round 2 の P1。照会の後に届いた確定が送ると、「送っていない」を信じた利用者の再送と二重になる）",
	"2026-11-13 タスク担当：送った後の結果は、記録がある限り HTTP 200 で返し、5つの区別を `outcome` で示す（refused と unknown も 200）。送る前に止めたものだけを 4xx・5xx にする",
	"2026-11-13 タスク担当：構造化 Chat は、確認待ちのときも Orca が待たせて答えないので、orca-web は状態で拒まない。端末は `terminal.agentStatus` の permission で拒む",
	"2026-11-13 タスク担当：端末で送った後の Orca の誤りは unknown とする（`agent_prompt_blocked` と `terminal_handle_stale` は本文を書いた後にも起きうる。仕様のレビュー round 1 の P1）。`agent_prompt_blocked` には「本文が入力欄に残っているかもしれない」を添える。`send.accepted` が偽の応答と、`invalid_argument`・`method_not_found` だけが refused",
	"2026-11-13 タスク担当：構造化 Chat で、Orca がまだ送りうるもの（待機のカードの waiting・returned、カードの再送待ちの rejected、pending）は accepted とし、refused にしない（仕様のレビュー round 1 の P1。refused と示すと、利用者が同じ本文を改めて送り二重になる）",
]
