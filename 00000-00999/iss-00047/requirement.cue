package spec

// 要件（Issue）。型 specdock/v1。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "Orca の画面を動かす開く口の不具合。今の Orca の版で確かめ直す"
}

purpose: "「Orca で開く」（`POST /api/open` と、それを使う埋め込みのボタン・`/embed/agent` の見出し・受け箱）を押すと、押した端末の Orca（ホストの Mac か、ホストの Orca のランタイムに接続しているクライアントの PC の Orca）で、その worktree とタブが本当に表示され、Orca が前面に出るようにする。成功と失敗を偽らない。"

background: """
	本人の指摘（2026-11-18）：SpecDock の欄の見出しの「Open」が機能していない。統括の確かめ（Orca 1.4.261、orca-web main 27b01fe）：`POST /api/open` は `{"ok":true,"status":"opened","route":"tab-activate","reason":"last-tab"}` を返すのに、Orca の左の一覧の選択は変わらなかった。
	範囲の追加（統括、2026-11-18、本人の要望）：ホストの PC のブラウザーで押したらホストの Orca で、クライアントの PC（ホストのランタイムにリモートで接続する Orca のデスクトップ版がある端末）のブラウザーで押したらその端末の Orca で開く。先行の試作 `orca-link-url-trial`（Orca 1.4.249 のころ）：navigation の `clients`、要求の元の IP と lsof による auto、`open -b com.stablyai.orca`、クライアントは `orca://` で前面に出す。
	タスク担当が確かめた事実（2026-11-18、Orca 1.4.261 のソース v1.4.261 = 92d4266c と実機。証拠は report.md）：
	- 原因：`session.tabs.activate` は、選んだタブが端末でない（構造化 Chat などの agent-session）とき、ホストの窓へ `ui:focusEditorTab` を `userInitiated` なしで送る。窓の側（`terminal-ui-routing-ipc-bridge.ts`）は、agent-session のタブで、今の worktree が違い、`userInitiated` がなければ何もしない（`Courtesy completion reveals must not undo user navigation`）。`intent: "user"` は窓まで渡らない。実機でも、別の worktree の agent-session のタブへの `session.tabs.activate`（host）は ok を返したが、画面は変わらなかった。
	- `worktree.activate`（`navigation: "host"`）は実機で画面を切り替えた（作業の済んだ worktree で、左の一覧とタブの帯が変わった）。端末のタブは `ui:focusTerminal` → `revealWorkspaceSurface` で worktree ごと切り替わる。
	- 窓の今の worktree を読む RPC はない（`ui.get` の `lastActiveWorktreeId` は null）。ホストの画面が切り替わったかを、orca-web は読む RPC で確かめられない。
	- `navigation` は `caller`・`host`・`clients`・`all`。`clients` は、ランタイムのイベントを購読するすべての端末（クライアントのデスクトップ版、iPhone のアプリ）に配る。1台に絞る引数はない（`activateWorktree` のイベントに宛先がなく、タブの選択は購読の `clientNavigationId` ごとにすべてへ配る）。
	- 接続中の端末とそのアドレスを返す RPC はない。ランタイムの websocket（`orca-runtime.json` の `transports` の `websocket`）の TCP の接続は、OS（lsof）から読める。
	- デスクトップ版の `orca://` は、skill の共有と plugin の導入のリンクだけを扱う。worktree を開くリンクはない（macOS は Orca を前面に出すだけ）。
	"""

includes: [
	"開く口（`src/orca/open.ts`、`open-gates.ts`、`open-target.ts`）の呼び方の直し：worktree を先に表示してからタブを選ぶ",
	"押した端末を見分ける決まり（ホスト・接続中のクライアント・どちらでもない）と、`navigation` の `clients` を通す門",
	"ホストで開いたときに Orca を前面に出す。クライアントで開いたときに、画面からその端末の Orca を前面に出す試み",
	"結果の文書（`OpenSuccess`・`OpenFailure`）と、ボタンの言葉（`web/embed/open-control-view.js`）",
	"テスト、README.md、AGENTS.md、実機の確かめ（ホスト。クライアントは統括を通して本人に頼む）",
]

excludes: [
	"Orca の不具合そのものの修正（Orca に出す報告の下書きは report.md に書く）",
	"SpecDock のリポジトリの変更（CSP で止まるときは統括に知らせる）",
	"タブやファイルを作る操作、送信、統括の連絡を既読にする読み方",
	"iPhone のアプリで開くリンク（`orca://h/<hostId>/session/...`）",
	"押した端末だけに絞る仕組み（Orca に引数がない。制約として記録する）",
]

requirements: {
	"R-01": {
		title: "ホストで押すと、ホストの Orca で、その worktree とタブが表示される"
		text: """
			要求の元がホスト自身（R-03）のとき、開く口は次の順で送る：
			1. `worktree.activate`（`navigation: "host"`）。Orca の左の一覧を押したときと同じく、worktree を表示する。
			2. 選んだタブがあれば、そのタブを選ぶ（端末で handle があれば `terminal switch`、なければ `session.tabs.activate`、`navigation: "host"`、`intent: "user"`）。
			タブの選び方（`chooseTarget`）は変えない。タブがなければ 1 だけ。
			"""
		acceptance: [
			"別の worktree の agent-session のタブが選ばれたとき、`worktree.activate` → `session.tabs.activate` の順に、どちらも `navigation: \"host\"` で送る（テスト）",
			"端末のタブ（ready、handle あり）が選ばれたとき、`worktree.activate` → `terminal switch` の順に送る（テスト）",
			"実機：作業の済んだ worktree へ開くと、Orca の左の一覧の選択とタブの帯が変わる（前と後の写し）",
		]
	}
	"R-02": {
		title: "クライアントの PC で押すと、ホストの画面を動かさず、クライアントの Orca の画面を切り替える"
		text: """
			要求の元がホストのランタイムに接続中の端末（R-03）のとき、R-01 と同じ順と同じ選び方で、`navigation: "clients"` で送る（`terminal switch` は `clients` を取らないので、端末のタブも `session.tabs.activate` で選ぶ）。
			`clients` は接続中のすべての端末を動かす（Orca に1台に絞る引数がない）。この制約を結果（`device: "client"`）と README に出す。
			"""
		acceptance: [
			"要求の元が接続中の端末のアドレスのとき、`worktree.activate` と `session.tabs.activate` を `navigation: \"clients\"` で送り、`terminal switch` を呼ばない（テスト）",
			"実機（本人に頼む）：クライアントの PC のブラウザーで押すと、クライアントの Orca の選択が変わり、ホストの選択は変わらない",
		]
	}
	"R-03": {
		title: "押した端末を、要求の元のアドレスで見分ける"
		text: """
			要求の TCP の元のアドレス（`req.socket.remoteAddress`。IPv4 に写した IPv6 は IPv4 に直す）で決める。
			- loopback か、ホストのネットワークの口が持つアドレス（tailnet のアドレスを含む）なら、ホスト。
			- そうでなく、Orca のランタイムの websocket の口に、そのアドレスから確立した TCP の接続があれば、クライアント。
			- どちらでもなければ開かず、理由（`device_not_connected`）を返す。接続を読めなければ `device_unknown` を返す。
			`X-Forwarded-For` などの頭は使わない（orca-web は前に代理を置かない）。
			"""
		acceptance: [
			"127.0.0.1、::1、::ffff:127.0.0.1、ホストの口のアドレスはホスト。接続の一覧にあるアドレスはクライアント。どちらでもなければ device_not_connected、一覧を読めなければ device_unknown（テスト）",
			"ホストと判じたときは、接続の一覧を読まない（テスト）",
		]
	}
	"R-04": {
		title: "開いた端末の Orca を前面に出す"
		text: """
			ホストで開いたら、orca-web が `open -b com.stablyai.orca`（絶対パス、引数の配列）で Orca を前面に出す。結果に `raised`（true か false）を出す。前面に出せなくても開いた結果は変えない。
			クライアントで開いたら、画面（ボタンの部品）が `orca://` へ移ってその端末の macOS に Orca を前面に出させる。埋め込みのボタンの iframe（`open-button.js` が作る）の sandbox に `allow-top-navigation-to-custom-protocols` を足す。Chrome と Safari で確かめ、だめな方は理由と代わりの形を report.md に書く。
			"""
		acceptance: [
			"ホストで送った後に1回だけ Orca を前面に出す命令を呼び、失敗しても ok のまま `raised: false` を返す。クライアントと失敗のときは呼ばない（テスト）",
			"ボタンの部品は、結果の `device` が `client` のときだけ `orca://` へ移る口を1回呼ぶ（テスト）",
			"`open-button.js` の iframe の sandbox が `allow-scripts allow-same-origin allow-top-navigation-to-custom-protocols` である（テスト）",
		]
	}
	"R-05": {
		title: "結果は成功と失敗を偽らず、画面を確かめられないことを出す"
		text: """
			成功の文書に `device`（`host` か `client`）と `screen: "unverified"`（orca-web は Orca の画面を読めない）を足す。ボタンの言葉は、送ったことと、確かめられないことが分かる言葉にする（例：『Orca に切り替えを送りました』、クライアントは『この端末の Orca に…』）。
			1 が失敗したら 2 を送らない。1 が通って 2 が失敗したら、失敗を返し、worktree だけ表示したこと（`worktreeShown: true`）を出す。時間切れや結果不明では、送り直さない（今の unconfirmed の決まりを保つ）。
			"""
		acceptance: [
			"1 が失敗・結果不明なら 2 を送らず、その誤りを返す。2 が失敗なら ok:false と worktreeShown:true（テスト）",
			"新しい誤り（device_not_connected、device_unknown）に、ボタンの言葉がある（テスト）",
		]
	}
}

failures: {
	"F-01": {title: "要求の元が見分けられないときは、どの画面も動かさない"}
	"F-02": {title: "門は、`navigation` が `host` か `clients` の activate だけを通し、`all` と `caller` と navigation なしを拒む"}
}

constraints: [
	"Orca の画面を読む RPC がないので、切り替わったかは orca-web で確かめない（R-05 で出す）",
	"`clients` は接続中のすべての端末（iPhone のアプリも）を動かす",
	"ランタイムに relay で接続する端末は、アドレスで見分けられない（device_not_connected になる）",
	"本人の環境に特化した決まり（固定の IP や名前）を入れない",
]

decisions: [
	"`clients` が接続中のすべての端末を動かす制約を受け入れ、README と結果の device に出す（統括、2026-11-18）",
]
