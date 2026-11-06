package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"偽の要求を、Orca に何も送る前に、HTTP の入口で止める",
	"Orca に送れる書き込みを、門（gate）で3つの操作と `navigation: \"host\"` に限る",
	"タブの選び方を、Orca に触らない純な関数にして、録画なしでも網羅して確かめる",
]

current: "サーバーは `GET /api/health` だけを持ち、127.0.0.1 だけで待ち受ける。Orca の境界は読むだけの門（ReadOnlyOrcaCli、ReadOnlyRpc）だけを持つ。"
target:  "設定した2つのアドレスで待ち受け、すべての要求で Host を確かめ、`POST /api/token` と `POST /api/open` と `/embed/*` を持つ。iss-00006 の項目の選択の保存も同じ書き込みの守りの下に置く。開く口は、開く門を通して、既存のタブだけを選ぶ。"

design: {
	"D-01": {
		title: "設定と待ち受け（`src/server/config.ts`、`src/server/main.ts`）"
		text: """
			`loadConfig(env)` が、環境変数から設定を作る。

			| 変数 | 既定 | 意味 |
			|---|---|---|
			| `PORT` | 8791 | 待ち受けのポート（iss-00006 と共通） |
			| `ORCA_WEB_TAILSCALE_IP` | なし | Tailscale の IPv4。あれば 127.0.0.1 と並べて待ち受け、その Host を許す |
			| `ORCA_WEB_READ_ORIGINS` | `http://127.0.0.1:47800`（と `http://<Tailscale の IP>:47800`） | SpecDock のオリジン（カンマ区切り）。読み取りの CORS（iss-00006）と frame-ancestors に使う。空なら frame-ancestors は `'none'` |
			| `ORCA_BIN` | `/Applications/Orca.app/Contents/Resources/bin/orca` | Orca の CLI の絶対パス（iss-00006 と共通） |
			| `ORCA_WEB_SETTINGS_FILE` | iss-00006 の既定 | 項目の選択の保存先（iss-00006） |

			そこから、待ち受けのアドレス（`127.0.0.1` と Tailscale の IP）と、足す Host（`<Tailscale の IP>:<port>`）を導く。iss-00006 が先にマージしたので、変数の名前は iss-00006 に合わせた。
			Tailscale の IP は IPv4 の形だけを受け、`0.0.0.0`、ループバック、マルチキャスト、ブロードキャストを拒んで起動を止める（`ConfigError`）。SpecDock のオリジンは `new URL(o).origin` と同じ文字列だけを受ける。
			`main.ts` は、待ち受けのアドレスごとに1つの `http.Server` を作り、同じ処理を共有する。0.0.0.0 に代えない。常駐の定義は iss-00008 で作る。
			"""
		satisfies: ["R-04"]
	}
	"D-02": {
		title: "書き込みの守り（`src/server/guard.ts`）"
		text: """
			- `checkHost(req, hosts)`：Host の見出しが、許す Host（待ち受けのポートの `127.0.0.1:<port>`、`localhost:<port>` と足した Host）のどれかと完全一致するか。ないとき、違うときは 421 `misdirected_host`（iss-00006 と同じ）。**すべての要求**（静的な画面を含む）に、道の振り分けの前に当てる（DNS rebinding を防ぐ）。
			- `checkSameOriginWrite(req, method)`：method が決めたもの（開く口とトークンは POST、項目の選択の保存は PUT。違えば 405 `method_not_allowed`）、`Content-Type` の media type が `application/json`（違えば 415 `unsupported_media_type`）、
			  `Origin` が `http://<Host>` と完全一致（ない、`null`、違う値は 403 `origin_rejected`）、`Sec-Fetch-Site` があれば `same-origin`（違えば 403 `origin_rejected`）。
			- `TokenStore`：`issue()` が 32 バイトの乱数を base64url にしたトークンと期限（10 分）を返す。`verify(token)` が期限内か。生きているトークンは 64 個までで、超えたら古いものから捨てる。時計は差し替えられる。値を記録しない。
			- 書き込み（`/api/open` と `/api/settings/fields`）は、`checkSameOriginWrite` の後に、`X-Orca-Web-Token` の見出しを `verify` で確かめる（ない 401 `token_missing`、無効や期限切れ 401 `token_invalid`）。開く口の物は 4 KiB まで（超えたら 413 `payload_too_large`）、JSON の物で、知らない鍵を持たない（違えば 400 `invalid_request`）。項目の選択の保存の物の確かめは iss-00006 のまま（64 KiB、`checkSelection`）。
			- 応答には CORS の見出しを付けない。
			"""
		satisfies: ["R-04", "F-03"]
	}
	"D-03": {
		title: "開く門（`src/orca/open-gates.ts`）"
		text: """
			- `OpenOrcaCli`：iss-00005 の読むコマンドに加えて、`terminal switch` だけを呼べる。`--pairing-code` と `--environment` を拒む。
			- `OpenRpc`：読む RPC（`READ_METHODS`）に加えて、`session.tabs.activate` と `worktree.activate` だけを送れる。2つは params の `navigation` が `"host"` でなければ送らずに拒む。
			- 一覧にない操作は、送らずに例外にする（呼び出し側の誤り）。`terminal create`、`file open`、`session.tabs.create`、`worktree.create` は一覧にない。
			"""
		satisfies: ["R-02"]
	}
	"D-04": {
		title: "タブの選び方（`src/orca/open-target.ts`、純な関数）"
		text: """
			`parseTabsSnapshot(result, worktreeId)` が `session.tabs.list` の結果を確かめて型にする（`worktree` が渡した ID と一致、各タブに `id` と `type`、端末のタブに `parentTabId` と `leafId`）。形が違えば null。
			`chooseTarget(snapshot, agent?)` が、R-01 の順で1つを選び、次のどれかを返す。

			- `{ route: "terminal-switch", handle, tabId, paneKey, reason }`：選んだ端末のタブが `status: "ready"` で `terminal` の handle を持つとき。
			- `{ route: "tab-activate", tabId, leafId?, reason }`：そのほかの既存のタブ（スリープ中の端末は `tabId` に親のタブの ID ではなくタブの `id`、`leafId` に leaf を渡す）。
			- `{ route: "worktree-activate", reason: "worktree-only", mayCreateInitialTerminal }`：タブが1つもないとき（`mayCreateInitialTerminal: true`。Orca が最初の端末を作りうる）、または最後に見ていたタブを決められないとき（`false`。worktree を選ぶと Orca が覚えているタブを出す）。

			最後に動いたエージェントは `agentStatus.updatedAt`（数）が最も大きいもので、同じなら `isActive` のもの、それでも同じなら一覧の順の先。
			最後に見ていたタブは `isActive` のタブ。同じ親のタブの leaf が複数 `isActive` なら、`parentLayout.activeLeafId` に当たる leaf、なければ一覧の順の先。`isActive` がなければ `activeTabId` に `id` か `parentTabId` が当たるタブ。
			"""
		satisfies: ["R-01"]
	}
	"D-05": {
		title: "開く処理（`src/orca/open.ts` の `OpenService`）"
		text: """
			`open({ worktree, agent? })` は次の順で進み、どこかで止まれば、書き込みを送らずに理由を返す。

			1. 同時に1つだけ。処理中なら `busy`。
			2. `CapabilityCache.get()` の `openExistingTab` が使えなければ `unavailable`（`missing` を付ける）。
			3. `orca worktree list --json` で worktree を解決する。`truncated` なら `--limit <totalCount>` で読み直し、それでも切れていれば `unknown_shape`。ID かパスの完全一致が1件でなければ `worktree_not_found`。
			4. `session.tabs.list { worktree: "id:<ID>" }`。失敗は `orca_error`、形が違えば `unknown_shape`、応答の runtime の ID が確かめのときと違えば `runtime_changed`。
			5. `chooseTarget` で選び、経路の1回だけを送る（`terminal switch` は `--terminal <handle>`、activate は `navigation: "host"`、タブの activate は `intent: "user"`）。
			6. 結果を分ける：成功は `opened`。時間切れ、接続断、不正な応答、CLI の時間切れと、Orca の答え（封筒）のない CLI の非ゼロの終了（シグナルでの終了を含む。切り替えが届いた可能性がある）は `unconfirmed`（F-01）。CLI を起動できなかったときは送っていないので `unavailable`。`method_not_found` は `unsupported`。`tab_not_found` などのタブの消失は `target_gone`。そのほかの Orca の誤りは `orca_error`。どの場合も、2回目の書き込みを送らない。

			HTTP の状態：`opened` 200、`invalid_request` 400、`worktree_not_found` 404、`busy` と `target_gone` 409、`unsupported` 501、`orca_error` と `unknown_shape` 502、`unavailable` と `runtime_changed` 503、`unconfirmed` 504。
			誤りの文は `clip` で短くし、authToken は RPC の境界が伏せる。
			"""
		satisfies: ["R-01", "R-02", "F-01", "F-02", "F-04", "F-05"]
	}
	"D-06": {
		title: "HTTP の口（`src/server/app.ts`）"
		text: """
			`createAppServer(options)` は、設定（D-01）、`TokenStore`、開く処理（`(request) => Promise<OpenOutcome>` の関数）、`web/` の場所を受ける。Orca の組み立ては `main.ts` が行い、テストは偽の開く処理を渡す。

			| 道 | 守り | 応答 |
			|---|---|---|
			| `GET /api/health` | Host | `{ ok: true }` |
			| `GET /api/state`、`GET /api/fields`（iss-00006） | Host、読み取りの CORS | 状態と項目 |
			| `PUT /api/settings/fields`（iss-00006） | Host、同じオリジンの PUT と JSON、トークン、64 KiB | 項目の選択の保存 |
			| `POST /api/token` | Host、同じオリジンの POST と JSON | `{ ok: true, token, expiresAt }`（`cache-control: no-store`） |
			| `POST /api/open` | Host、同じオリジンの POST と JSON、トークン、4 KiB | D-05 の結果 |
			| `GET /embed/open-button` | Host | ボタンの画面（D-07）、CSP つき |
			| `GET /embed/open-button.js`、`/embed/open-button-frame.js`、`/embed/open-button.css` | Host | 固定の対応のファイル（利用者のパスを受けない） |
			| `GET /`、`/main.js`、`/view.js`、`/style.css`（iss-00006）、`/write.js` | Host | 状態の画面と、書き込みの送り方（D-07） |

			ボタンの画面の CSP：`default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors <SpecDock のオリジン>`。状態の画面の CSP（iss-00006）にも `frame-ancestors <SpecDock のオリジン>` を足す。SpecDock のオリジンが空なら `'none'`。
			あわせて `X-Content-Type-Options: nosniff`、`Referrer-Policy: same-origin`、`Cache-Control: no-store`（`no-referrer` にすると、Fetch の仕様では同じオリジンの `mode: same-origin` の POST の Origin が `null` になりうり、守りが拒む。コードのレビューで見つけて直した）。状態の API（iss-00006）が足す道とぶつからないよう、振り分けは道の表の1か所にまとめる。
			"""
		satisfies: ["R-01", "R-03", "R-04", "F-03"]
	}
	"D-07": {
		title: "ボタンの部品（`web/embed/`）"
		text: """
			- `open-button.js`（置き場の1行のスクリプト）：`document.currentScript` の `src` から orca-web のオリジンを、`data-worktree`、`data-agent`、`data-theme`、`data-size` から引数を得て、スクリプトの直後に iframe（`title`、枠なし、`sandbox="allow-scripts allow-same-origin"`）を差し込む。
			  親の画面で `matchMedia("(max-width: 390px)")` が当たる間は iframe を隠し、`src` を付けない（読み込まない）。トークンを扱わない。
			- `open-button.html`（iframe の中）：ボタン1つと結果の1行。外の script と style だけを使う（CSP で inline を許さない）。
			- `write.js`（`/write.js`、状態の画面と iframe が共有）：`createWriter()` の `send(path, method, body)` が、初めの書き込みの前に `POST /api/token` でトークンを得て、メモリーにだけ持ち、`X-Orca-Web-Token` で送る。期限の 30 秒前を過ぎたら取り直し、401 なら取り直して1回だけ送り直す。`mode: same-origin`、`referrerPolicy: same-origin`。
			- `open-button-frame.js`（iframe の中）：押すと `write.js` で `POST /api/open` を呼ぶ。処理中はボタンを止める。結果は `textContent` で示す。`theme` と `size` は許した値だけを `data-` の属性に写す。
			- `open-button.css`：明るい・暗い（`prefers-color-scheme` と `data-theme`）、大きさ（sm、md）。
			"""
		satisfies: ["R-03"]
	}
	"D-08": {
		title: "実機の確かめの道具（`src/tools/open-live.ts`、`npm run open:live`）"
		text: """
			`--worktree <パス>`（と `--agent <paneKey>`）を受け、作業の場所の Git のリポジトリと同じ repo の worktree でなければ何もせずに止まる。
			押す前と後に `session.tabs.listAll` を読み、タブの ID の集合の数、増えた数、消えた数だけを出す（題名、本文、パスを出さない）。
			既定は `OpenService.open` を呼ぶ。`--route tab-activate|worktree-activate` を付けると、選んだ既存のタブに対して指定の経路で送る（3つの経路を実機で1回ずつ確かめるため。新しいタブを作る経路は持たない）。
			"""
		satisfies: ["R-01", "R-02"]
	}
	"D-09": {
		title: "iss-00005 の確かめの抜けのテスト"
		text: """
			- FQG-001：`capabilities.test.ts` に、`session.tabs.listAll` の `_meta.runtimeId` だけを違う値にした録画で、`runtimeIdConsistent` が false になり、`openExistingTab` と `sendGuarded` が `runtime-id:consistent` の欠けで使えないことを足す。
			- FQG-002：`rpc.test.ts` に、時間切れより長い間、時間切れより短い間隔で keepalive を送り、その後に応答を返すソケットで、`ok` が得られることを足す（keepalive がなければ時間切れになる対照も確かめる）。
			"""
		satisfies: ["R-05"]
	}
}

compatibility: "iss-00006（PR #11）が先にマージされたので、0a0e76c を取り込んだ（マージのコミット）。`createAppServer(options)` は iss-00006 の形（poller、settings、readOrigins、extraHosts、webDir）に open と tokens を足した。Host の確かめは /api/ だけから全ての道に広げた。`same-origin-write.ts` を消し、項目の選択の保存はトークンを要するようになった（画面は write.js で送る）。"

risks: [
	"内部の RPC は非公開。Orca の版が変わったら、録画を取り直し、`npm run open:live` で確かめ直す",
	"Origin とトークンはブラウザー由来の偽の要求を防ぐもので、同じ Mac の悪意あるプロセスへの認証の境界ではない（調査の design-01 の前提）",
	"Chrome の Private Network Access で、Tailscale のアドレスからの iframe と要求が止められうる。Mac とスマホの実機の受け入れは iss-00008 で行う",
]
