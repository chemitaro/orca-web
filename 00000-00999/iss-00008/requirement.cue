package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "手元の常駐。止まっても手で起動し直せる"
}

purpose: "orca-web をこの Mac の launchd の利用者のサービス（LaunchAgent）として常駐させ、127.0.0.1 と指定の Tailscale の IP だけで待ち受けるようにする。あわせて、epic-00003 の全体を、この Mac の実機で受け入れる。"

background: """
	親の epic-00003 の最後の slice（R-06 と、Epic 全体の実機の受け入れ）。状態の API（iss-00006）と開く口・ボタンの部品・書き込みの守り（iss-00007）はマージ済み。
	待ち受けのアドレスの設定（`ORCA_WEB_TAILSCALE_IP`）は iss-00007 の `loadConfig` にあるが、Tailscale のアドレスで待ち受けられないとき（ログインの直後で Tailscale がまだ動いていないなど）、今の `main.ts` は待ち受けの誤りで落ちる。
	SpecDock のダッシュボード（`io.github.chemitaro.spec-dock.dashboard`）は、KeepAlive の LaunchAgent で、Tailscale のアドレスが取れないときは 127.0.0.1 だけで始めて後からアドレスを足す。この形を手本にする。
	iss-00006 の最終品質ゲートの P2・P3（FQG-001〜003）と、iss-00007 で範囲の外だった `AGENTS.md` の更新も、この Issue で直す（統括の依頼）。
	"""

includes: [
	"LaunchAgent の定義（plist）と、入れる・外す・起動し直す・状態を見るスクリプト（`npm run service:install` など）",
	"待ち受けの組み立て（127.0.0.1 と Tailscale の IP の2つだけ。Tailscale で待ち受けられないときの扱い）と、そのテスト",
	"README の入れ方、外し方、設定、SpecDock のダッシュボードへの置き方",
	"iss-00006 の FQG-001（CLI の生の stdout を誤りの文に出さない）、FQG-002（録画の検査の JSON の配列の規則）、FQG-003（`/api/state` が `noteViewer` を呼ぶテスト）",
	"`AGENTS.md` を今の形（モジュール、書き込みの守り、開く口、常駐）に合わせる",
	"Epic の実機の受け入れ（状態の画面、項目の選択、開くボタン、390px、Orca に届かないときの表示、Codex を含む状態）と、利用者に頼むスマホの確かめの手順",
]

excludes: [
	"launchd への本物の登録（利用者の環境を変えるため、マージの後に統括が行う。2026-11-06 統括の依頼）",
	"スマホでの確かめそのもの（利用者が行う）",
	"Tailscale の設定の変更、Tailscale Serve の利用",
	"ログの自動の回転（行は起動と待ち受けの変化だけで少ない）",
	"SpecDock 側の画面の変更（spec-dock の epic-00471）",
]

requirements: {
	"R-01": {
		title: "利用者が、スクリプトで orca-web の LaunchAgent を入れ、外し、起動し直し、状態を見られる"
		text: """
			`npm run service:install`、`service:uninstall`、`service:restart`、`service:status`（中身は `node src/tools/service.ts <命令>`）。

			- 定義（`~/Library/LaunchAgents/io.github.chemitaro.orca-web.plist`）は、ラベル `io.github.chemitaro.orca-web`、node の絶対パスとビルドした成果物（`<リポジトリ>/dist/server/main.js`）の引数の配列、作業のディレクトリ（リポジトリ）、
			  ログ（`~/Library/Logs/orca-web/service.log`。標準出力と標準エラー）、`RunAtLoad`、`KeepAlive`、`ThrottleInterval` 10 秒、環境変数（`PORT`、`ORCA_BIN`、`ORCA_WEB_TAILSCALE_IP`、指定があれば `ORCA_WEB_READ_ORIGINS` と `ORCA_WEB_SETTINGS_FILE`、最小の `PATH`）を持つ。
			- 設定は、入れるときの引数（`--port`、`--tailscale-ip <IP|auto|none>`、`--read-origins`、`--orca-bin`、`--settings-file`）で渡す。Tailscale の IP の既定は `auto`（`tailscale ip -4` の 100.64.0.0/10 のアドレス）。
			- `install` は、設定をサーバーと同じ規則（`loadConfig`）で確かめてから定義を書き、読み込み済みなら外してから `launchctl bootstrap gui/<uid>` で読み込み、`/api/health` が答えるまで待つ。`--dry-run` では、定義と送る命令を出すだけで何も書かない。
			- `uninstall` は外して定義を消す（ログと項目の選択の設定は残す）。`restart` は `launchctl kickstart -k`。`status` は読み込みの状態と `/api/health` を出す。
			"""
		acceptance: [
			"テストで、定義の plist が決めたキーと値（node の絶対パス、成果物、ログ、環境変数）だけを持ち、XML の特殊な文字を逃がす",
			"テストで、偽の launchctl に対して、install・uninstall・restart・status が決めた引数の配列だけを送り、`--dry-run` は何も書かず何も送らない",
			"この Mac で `--dry-run` の定義が `plutil -lint` を通る（本物の登録はマージの後に統括が行い、ログインし直しても動くことを確かめる）",
		]
	}
	"R-02": {
		title: "待ち受けは、127.0.0.1 と指定の Tailscale の IP の2つだけで、0.0.0.0 にならない"
		text: """
			サーバーは、設定の待ち受けのアドレス（`127.0.0.1` と、あれば `ORCA_WEB_TAILSCALE_IP`）ごとに1つ待ち受け、ほかのアドレス（`0.0.0.0`、`::`、アドレスの指定なし）で待ち受けない。
			`ORCA_WEB_TAILSCALE_IP` の `0.0.0.0`、ループバック、IPv6、IPv4 でない値は、サーバーも `install` も起動の前に拒む（iss-00007 の `loadConfig`）。
			"""
		acceptance: [
			"テストで、待ち受けの組み立てが、Tailscale の IP があれば 127.0.0.1 とその IP の2つだけ、なければ 127.0.0.1 だけに listen し、アドレスのない listen をしない",
			"本物のサーバーを一時の起動で動かすと、`lsof` で見た待ち受けが、127.0.0.1 と Tailscale の IP の2つだけである",
		]
	}
	"R-03": {
		title: "Tailscale の IP で待ち受けられないときは、127.0.0.1 だけで動き、そのことを記録する"
		text: """
			- `install` で Tailscale の IP が取れない（`tailscale` がない、動いていない、100.64.0.0/10 のアドレスがない）ときは、Tailscale の IP なしで定義を書き、そのことを出力に出す。
			- サーバーが Tailscale の IP で待ち受けられない（`EADDRNOTAVAIL` など。ログインの直後で Tailscale がまだ動いていない）ときは、127.0.0.1 の待ち受けを続け、ログに1行（アドレスと誤りの種類）を書き、30 秒ごとに待ち受けを試し直す。待ち受けられたらログに1行を書く。同じ誤りの繰り返しは書かない。
			- `GET /api/health` が、待ち受けのアドレスごとの状態（`listening`、`retrying` と誤りの種類）を返す。
			"""
		acceptance: [
			"テストで、待ち受けられない Tailscale の IP（文書用のアドレス 192.0.2.1）を設定しても 127.0.0.1 で答え、`/api/health` に `retrying` が出て、ログに1行だけ書く",
			"テストで、2回目の試し直しで待ち受けられると `listening` になり、ログに1行を書く",
			"テストで、`install` が Tailscale の IP を取れないとき、`ORCA_WEB_TAILSCALE_IP` のない定義を書き、そのことを出力に出す",
		]
	}
	"R-04": {
		title: "README に、入れ方、外し方、設定、SpecDock のダッシュボードへの置き方がある"
		text: """
			README に、必要なもの（Node.js 24、Orca、任意の Tailscale）、入れ方（`npm ci`、`npm run service:install`）、外し方、起動し直し方、状態とログの見方、設定（環境変数と入れるときの引数の表）、
			SpecDock のダッシュボードへの置き方（状態の API を読む URL と CORS、開くボタンの1行のスクリプト）、スマホでの見え方（ボタンは出ない）を書く。
			"""
		acceptance: ["README に上の項目があり、書いた命令と引数が実装と一致する"]
	}
	"R-05": {
		title: "CLI の stdout が JSON でないとき、Orca の生の stdout を誤りの文に出さない（iss-00006 の FQG-001）"
		text: """
			`OrcaCli` の `json`、`document`、`version` が失敗を返すとき、誤りの文（`message`）に stdout の中身を入れない。JSON でない stdout は「stdout is not JSON（バイト数）」と書く。
			stderr は、Orca の誤りの説明として、今までどおり切り詰めて使う。状態の API の取得元の誤りと、開く口の誤りの文は、この `message` から作られる。
			"""
		acceptance: ["テストで、JSON でない stdout（秘密に見える文を含む）を返す CLI の誤りの文、状態の API の取得元の誤り、開く口の応答に、その stdout が出ない"]
	}
	"R-06": {
		title: "録画の検査の JSON の配列の規則が、短い語の並びを安全と判定しない（iss-00006 の FQG-002）"
		text:  "`isSafeString` の JSON の配列の規則は、各要素が仮名（`uuid-N`、`hex-N`、`p-N`、`text-N`）を含み、仮名を除いた残りが短い区切りの文字だけのときに限って安全とする。`[\"fix\",\"the\",\"bug\"]` のような語の並びは安全としない。"
		acceptance: ["テストで、語の並びの配列が安全と判定されず、仮名化で text-N になり、仮名の配列（`[\"task_hex-1\"]`）と空の配列は残り、既存の録画が検査を通る"]
	}
	"R-07": {
		title: "`GET /api/state` が見る人を知らせる配線をテストで確かめる（iss-00006 の FQG-003）"
		text:  "`/api/state` の GET が `noteViewer()` を呼び、`/api/fields`、CORS の preflight、拒んだ要求では呼ばないことをテストで確かめる。"
		acceptance: ["テストが `npm test` で通る"]
	}
	"R-08": {
		title: "`AGENTS.md` が今の形を説明する"
		text:  "モジュール（開く口、門、配線、書き込みの守り、待ち受け、常駐）、道（`/api/token`、`/api/open`、`/embed/*`）、環境変数（`ORCA_WEB_TAILSCALE_IP`）、命令（`open:live`、`service:*`）、常駐の扱い（エージェントは本物の登録をしない）を書く。"
		acceptance: ["`AGENTS.md` に上の項目があり、ファイルと命令の名前がリポジトリと一致する"]
	}
	"R-09": {
		title: "epic-00003 を、この Mac の実機で受け入れ、report.md に書く"
		text: """
			一時の起動（`npm run build` の後の `node dist/server/main.js`、待ち受けは 127.0.0.1 と Tailscale の IP、一時の設定のファイル）で、ブラウザーを使って次を確かめる。

			1. 状態の画面に repo・worktree・エージェント・オーケストレーションの状態が出て、Claude Code と Codex とオーケストレーションの担当が返る（Codex は、統括に1つ起動を頼む）。
			2. 項目を選ぶと、選んだ項目だけが表示され、サーバーを起動し直しても残る。
			3. 別のオリジンの試しの画面に開くボタンの1行だけを置き、押すと、この Mac の Orca で orca-web のリポジトリの worktree のタブが前面に出て、タブの集合が変わらない。
			4. 幅 390px ではボタンが出ず、広げると出る。
			5. Orca に届かないとき（Orca の CLI のパスを存在しないものにした別の起動）、画面が止まらず「接続できない」と鮮度を示す。実際の Orca は止めない（ほかのエージェントが止まるため）。
			6. Tailscale の IP で、状態の API が読め、許していない Host が拒まれる。

			スマホでの確かめ（幅 390px で状態の画面が読め、ボタンが出ない）は利用者に頼み、手順を report.md に書く。
			"""
		acceptance: ["report.md に、1〜6の結果（件数と結論だけ。本文、プロンプト、トークンを書かない）と、利用者に頼むスマホと本物の登録の確かめの手順がある"]
	}
}

failures: {
	"F-01": {
		title: "127.0.0.1 で待ち受けられない（ポートの使用中など）ときは、理由を記録して終了コード1で止まる"
		text:  "0.0.0.0 や別のポートに代えない。launchd が `ThrottleInterval` の後に起動し直す。Tailscale の IP の待ち受けは始めない。"
	}
	"F-02": {
		title: "設定の誤りでは、何も書かず、何も送らずに止まる"
		text:  "`install` は、`loadConfig` の誤り、node が 24 より古い、成果物（`dist/server/main.js`）がない、のどれかで、定義を書かず launchctl を呼ばずに、理由と直し方を出して終了コード2で止まる。サーバーは今までどおり `ConfigError` で終了コード2。"
	}
	"F-03": {
		title: "launchctl が失敗したとき、または入れた後に `/api/health` が答えないときは、成功と言わない"
		text:  "`bootstrap` と `kickstart` の失敗は、launchctl の終了コードと stderr を出して終了コード1。答えないときは、ログの置き場を示して終了コード1。読み込まれていない `restart` は `install` を示して終了コード1。読み込まれていない `uninstall` は、定義があれば消して成功する。"
	}
	"F-04": {
		title: "SIGTERM と SIGINT では、待ち受けと試し直しとポーリングを止めて、終了コード0で終わる"
		text:  "launchd の `bootout` と `kickstart -k` が送る SIGTERM で、試し直しの時計が残ってプロセスが終わらない、ということがない。"
	}
}

constraints: [
	"launchd への本物の登録、`~/Library/LaunchAgents` への書き込み、Tailscale と Orca の設定の変更を、この Issue の作業では行わない（テストは一時のディレクトリと偽の launchctl を使う）",
	"定義、ログ、出力に、Orca の authToken、書き込みのトークン、ペアリングのコードを出さない",
	"実行時の依存を足さない",
	"開く口の実機の確かめは、orca-web のリポジトリの worktree だけにする。送信の RPC は呼ばない",
	"report.md と録画に、利用者の私的なプロンプトの文と、絶対パスの個人の情報を書かない",
]

decisions: [
	"2026-11-06 ラベルは `io.github.chemitaro.orca-web`（SpecDock のダッシュボードの名前の形に合わせる）",
	"2026-11-06 設定は plist の環境変数で渡す（別の設定のファイルは作らない）。値は入れるときの引数で決め、サーバーと同じ `loadConfig` で確かめる",
	"2026-11-06 Tailscale のアドレスは、入れるときに1回決めて定義に書く。走っている間に変わったら、入れ直す（SpecDock のダッシュボードの `--tailscale` と違い、Host の許しと SpecDock のオリジンが IP に結び付くため、走っている間に IP を探し直さない）",
	"2026-11-06 Tailscale の IP の Host は、待ち受けられていない間も許す（届かない Host なので害がない。待ち受けられた瞬間から答えられる）",
	"2026-11-06 KeepAlive は `true`（SpecDock のダッシュボードと同じ）。設定の誤りでの再起動の繰り返しは ThrottleInterval の 10 秒ごとで、ログで分かる",
	"2026-11-06 Orca が止まったときの表示は、Orca を止めずに、CLI のパスを存在しないものにした別の起動で確かめる（iss-00006 と同じ。実際に止めると、ほかのエージェントが止まる）",
]
