package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"Orca の左の一覧を押したときと同じく、worktree を先に表示してからタブを選ぶ。経路の分かれを増やさない",
	"押した端末の見分けは、純な関数1つ（アドレスの分類）と、Orca の接続を読む小さな口1つに分ける",
	"画面を確かめられないことを、文書とボタンで正直に出す",
]

current: "`OpenService.#send` は選んだ先へ1回だけ送る：`terminal switch`（CLI）、`session.tabs.activate`、`worktree.activate`（どちらも `navigation: \"host\"`）。`OpenRpc` は `navigation: \"host\"` の activate だけを通す。前面に出さない。成功の文書は `{ok, status: \"opened\", route, reason, worktreeId, ...}`。ボタンは『開きました』。"

target: "開く口は、押した端末（host か client）を決め、`worktree.activate` → タブの選択の順に、その端末の navigation で送る。ホストなら Orca を前面に出す。成功の文書は `device` と `screen: \"unverified\"` を持ち、ボタンは送ったことを言う。クライアントでは部品が `orca://` へ移る。"

design: {
	"D-01": {
		title: "送る順：worktree を表示してからタブを選ぶ（src/orca/open.ts）"
		text: """
			`OpenService.open(request, origin)`：`origin` は D-03 の `OpenDevice`（`'host' | 'client'`）。`navigation = origin === 'client' ? 'clients' : 'host'`。
			`#send(worktreeId, target, navigation)`：
			1. いつも `worktree.activate {worktree: "id:<id>", navigation}` を送る（timeoutMs は今の書き込みの時間切れ）。`classifyRpc` で ok でなければ、そのまま失敗を返し 2 を送らない（route は `worktree-activate`）。
			2. `target.route` が `terminal-switch` で navigation が `host` なら、今どおり `terminal switch --terminal <handle>`。`terminal-switch` で `clients` なら `session.tabs.activate {worktree, tabId: target.tabId, leafId: <paneKey の leaf>, navigation, intent: "user"}`（`terminal switch` の RPC は navigation に `clients` を取らない）。`tab-activate` なら今の params で navigation だけを差す。`worktree-activate` なら 2 はない。
			3. 2 が ok でなければ、その失敗に `worktreeShown: true` を足して返す。
			結果の `route` は、最後に送った書き込みの経路にする：2 が `terminal switch` なら `terminal-switch`、`session.tabs.activate` なら（クライアントの端末のタブも）`tab-activate`、2 がなければ `worktree-activate`。`reason` は選び方の理由のまま。
			`OpenTarget` の `terminal-switch` に `leafId` を足す（`open-target.ts` の `routeFor`）。選び方は変えない。
			Orca の窓は、別の worktree の agent-session のタブへの `ui:focusEditorTab` を、`userInitiated` なしでは捨てる（要件の背景）。1 で worktree を先に表示すると、2 は今の worktree のタブの選択になり、捨てられない。1 の表示は窓の中で非同期（`fetchWorktrees` の後）なので、2 が先に届けば捨てられうる。そのときも worktree は表示され、窓が覚えているタブが出る（多くは `last-tab` と同じ）。
			"""
		satisfies: ["R-01", "R-02", "R-05"]
	}
	"D-02": {
		title: "門：navigation の `host` と `clients` を通す（src/orca/open-gates.ts）"
		text: """
			`OpenRpc.call` の書き込みの確かめを `params.navigation === 'host' || params.navigation === 'clients'` にする。`all`・`caller`・なしは拒む。読む RPC と CLI の一覧は変えない（`terminal switch` は CLI が host に固定）。注記と AGENTS.md の門の記述を直す。
			"""
		satisfies: ["F-02"]
	}
	"D-03": {
		title: "押した端末の見分け（src/orca/open-device.ts、新規）"
		text: """
			純な関数 `classifyOrigin(address: string | undefined, hostAddresses: ReadonlySet<string>): 'host' | 'remote' | 'unknown'`：
			- `normalizeAddress`：`::ffff:a.b.c.d` を `a.b.c.d` に、IPv6 の zone（`%en0`）を落とし、小文字にする。
			- loopback（`127.0.0.0/8`、`::1`）か、`hostAddresses` にあれば `host`。値がなければ `unknown`。ほかは `remote`。
			`hostAddresses()`：`os.networkInterfaces()` のすべてのアドレスを `normalizeAddress` した集合（呼ぶたびに読む。tailnet のアドレスを含む）。
			クラス `RuntimePeers`（Orca の接続を読む口）：`peers(): Promise<{ok: true; addresses: ReadonlySet<string>} | {ok: false; message: string}>`。
			- `orca-runtime.json`（`RuntimeLocator` と同じファイル）の `pid` と、`transports` の `kind: "websocket"` の `endpoint`（`ws://<host>:<port>`）の port を読む。websocket がなければ空の集合（接続できる端末がない）。
			- `/usr/sbin/lsof -nP -a -p <pid> -iTCP:<port> -sTCP:ESTABLISHED -F n` を引数の配列で、時間切れ 3 秒、出力の上限 64 KiB で呼ぶ（`CliRunner` と同じ `execFile` の形の注入できる runner）。`n` で始まる行の `<local>-><remote>` の remote のアドレス（`[v6]:port` と `v4:port`）を `normalizeAddress` して集める。lsof は接続がないと終了コード 1 で何も出さないので、出力が空の 1 は空の集合とする。ほかの失敗は `ok: false`。
			`RuntimeLocator` に `locateRuntimeFile()` は足さず、`open-device.ts` が同じファイルの `pid` と websocket の port だけを読む（authToken を読まない、持たない）。
			決め方 `resolveOpenDevice(address, deps)`：`classifyOrigin` が `host` なら `{ok, device: 'host'}`（接続を読まない）。`unknown` なら `device_unknown`。`remote` なら `peers()`：失敗は `device_unknown`、集合にあれば `{ok, device: 'client'}`、なければ `device_not_connected`。
			"""
		satisfies: ["R-03", "F-01"]
	}
	"D-04": {
		title: "前面に出す（src/orca/raise.ts、新規。画面は web/embed/open-control.js）"
		text: """
			`raiseOrca(runner)`：`/usr/bin/open -b com.stablyai.orca` を引数の配列で、時間切れ 5 秒で呼び、終了コード 0 なら true、ほかは false（投げない）。`OpenService` は、ホストで成功したときだけ1回呼び、`raised` を成功の文書に入れる。失敗とクライアントでは呼ばない（`raised` を出さない）。依存の `raise?: () => Promise<boolean>` として注入する（なければ呼ばず `raised` を出さない）。
			画面：`runOpen(control, send, {raiseClient})` に `raiseClient` を足す。既定は `() => { globalThis.location.href = 'orca://'; }` を try で包む。結果が done で `body.device === 'client'` のときだけ1回呼ぶ。投げても結果は変えない。
			埋め込みの iframe：iframe とその sandbox は orca-web の `web/embed/open-button.js` が作る（SpecDock は script を置くだけ。統括の確かめ 2026-11-18）。sandbox を `allow-scripts allow-same-origin allow-top-navigation-to-custom-protocols` にする（外部の protocol への移動だけを足す、いちばん狭い印。上の窓のページの移動は許さない）。`orca://` へ移るのは結果が client のときだけ。Chrome と Safari の両方で sandbox の iframe から `orca://` へ移れるかを実機で確かめ、だめな方は理由と代わりの形を report.md に書く。SpecDock の CSP（frame-src）で止まるところが見つかったら統括に知らせる。
			"""
		satisfies: ["R-04"]
	}
	"D-05": {
		title: "結果の文書とボタンの言葉"
		text: """
			`OpenSuccess` に `device: 'host' | 'client'`、`screen: 'unverified'`、`raised?: boolean` を足す。`status: 'opened'` と今の項目は残す（読む側を壊さない）。`OpenFailure` に `worktreeShown?: true` を足す。`OpenErrorCode` に `device_not_connected`、`device_unknown` を足し、`app.ts` の `OPEN_ERROR_STATUS` に 409 と 503 を足す。
			`app.ts` の `handleOpen`：`options.open(request, req.socket.remoteAddress)` を呼ぶ。`main.ts` は `resolveOpenDevice` を呼んでから `OpenService.open(request, device)` を呼ぶ形の関数を渡す（`wiring.ts` に `openFrom(request, address)` を置く）。見分けに失敗したら Orca に何も送らない。
			`open-control-view.js` の `openResult`：成功は device が `client` なら『この端末の Orca に切り替えを送りました』、ほかは『Orca に切り替えを送りました』。`mayCreateInitialTerminal` のときは今の注記を後ろに足す。失敗で `worktreeShown` なら『worktree は表示しましたが、タブを選べませんでした』を先に出す。`OPEN_MESSAGES` に `device_not_connected`：『この端末から Orca のホストへの接続が見つかりません』、`device_unknown`：『押した端末を確かめられません』。
			"""
		satisfies: ["R-05"]
	}
	"D-06": {
		title: "文書と実機の確かめ"
		text: """
			README.md：開く口の節に、押した端末の決め方、`clients` が接続中のすべての端末を動かすこと、relay の端末は見分けられないこと、ホストで前面に出すこと、SpecDock の iframe に `allow-top-navigation-to-custom-protocols` が要ること、`screen: "unverified"` の意味を書く。AGENTS.md の `open-gates.ts` の行（`navigation: "host"` だけ）と `src/orca/` の一覧に `open-device.ts`・`raise.ts` を足す。
			実機：タスク担当が、作業の済んだこのリポジトリの worktree に一時の orca-web（8792、`ORCA_WEB_SETTINGS_FILE` は一時のファイル）から開き、前と後の左の一覧の選択とタブの帯を、アクセシビリティの木（`orca computer get-app-state`、タブの題名の行だけ）と、ぼかした写しで report.md に残し、元の worktree とタブへ戻す。クライアントの確かめは、手順を統括に `ask` で送り、本人に頼む。
			"""
		satisfies: ["R-01", "R-02", "R-04"]
	}
}

alternatives: [
	"タブの種類で経路を分ける（agent-session のときだけ worktree を先に）：分かれが増え、端末のタブでも窓の worktree が今のものと違うときの振る舞いを別に考えることになる。一律に worktree を先にする方が、左の一覧を押す操作と同じで単純",
	"`navigation: \"all\"`：ホストとクライアントの両方が動き、押した端末で開く要望に反する",
	"`orca://` で worktree を開く：デスクトップ版にその道がない",
	"画面の切り替えをアクセシビリティの木で確かめる：利用者の画面の中身を読むことになり、権限と環境に依る。製品の道には入れず、実機の確かめだけに使う",
]
