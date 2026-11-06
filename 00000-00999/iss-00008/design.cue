package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"待ち受けのアドレスを、設定の2つ（127.0.0.1 と Tailscale の IP）から変えない形に閉じ込め、テストで確かめる",
	"Tailscale がまだ動いていなくても、127.0.0.1 では必ず答える",
	"launchd の定義と操作を、純な組み立てと差し替えられる実行に分け、本物の launchctl を呼ばずにテストする",
]

current: "`main.ts` が待ち受けのアドレスごとに `http.Server` を作るが、待ち受けの誤り（Tailscale のアドレスがまだない、など）を扱わずに落ちる。終わりのシグナルを扱わない。常駐の定義とスクリプトはない。`/api/health` は `{ ok: true }` だけ。"
target:  "`src/server/listen.ts` が待ち受けを組み立て、Tailscale の IP の失敗を試し直し、状態を `/api/health` に出す。`src/service/launchd.ts` が定義と操作を組み立て、`src/tools/service.ts` が命令の入口になる。"

design: {
	"D-01": {
		title: "待ち受けの組み立て（`src/server/listen.ts`）"
		text: """
			`startListeners({ port, addresses, handler, log, retryMs = 30000, createServer? })` が、`ListenerSet` を返す。

			1. `addresses[0]`（127.0.0.1）で `server.listen(port, address)` する。失敗したら誤りを投げる（main が記録して終了コード1。F-01）。ポートが 0（テスト）なら、得たポートを残りにも使う。
			2. 残りのアドレス（Tailscale の IP）ごとに listen を試す。失敗したら、その server を閉じ、`{ address, state: 'retrying', error: <code> }` にし、誤りの種類が前と違うときだけログに1行を書き、`retryMs` の後に試し直す（時計は `unref` しない。`close()` で止める）。成功したら `listening` にし、ログに1行。
			3. `status()` はアドレスごとの `{ address, state, error? }` の配列。`close()` は試し直しを止め、すべての server を閉じる。

			listen はいつもアドレスを指定して呼ぶ（アドレスなしの listen は 0.0.0.0 か `::` になるため）。`createServer` は差し替えられ、テストは listen の引数を記録する偽を渡す。
			アドレスの集合は `loadConfig` の `bindAddresses` だけから来る（127.0.0.1 と、検査を通った Tailscale の IPv4）。
			"""
		satisfies: ["R-02", "R-03", "F-01"]
	}
	"D-02": {
		title: "起動と終わり（`src/server/main.ts`）と `/api/health`（`src/server/app.ts`）"
		text: """
			- `main.ts` は、設定を読み（`ConfigError` は終了コード2）、Orca の配線とポーリングと設定のファイルを組み立て、`startListeners` で待ち受ける。127.0.0.1 の失敗は `orca-web: cannot listen on 127.0.0.1:<port> (<code>)` を記録して終了コード1。
			- SIGTERM と SIGINT で、`ListenerSet.close()` とポーリングの `stop()` を呼び、終了コード0で終わる（閉じ切らないときは 5 秒で抜ける）。
			- `createAppHandler` に `health?: () => { pid: number; listeners: ListenerStatus[] }` を足す。`GET /api/health` は `{ ok: true, pid, listeners: [...] }`（なければ今までどおり `{ ok: true }`）。Host の確かめは今までどおり先に当てる。
			"""
		satisfies: ["R-03", "F-01", "F-04"]
	}
	"D-03": {
		title: "LaunchAgent の定義の組み立て（`src/service/launchd.ts`）"
		text: """
			- 定数：ラベル `io.github.chemitaro.orca-web`、定義の置き場 `<HOME>/Library/LaunchAgents/<ラベル>.plist`、ログ `<HOME>/Library/Logs/orca-web/service.log`、`PATH` `/usr/bin:/bin:/usr/sbin:/sbin`。
			- `parseServiceArgs(argv)`：命令（install、uninstall、restart、status）と引数（`--port`、`--tailscale-ip`、`--read-origins`、`--orca-bin`、`--settings-file`、`--dry-run`）を読む。知らない引数は誤り。
			- `parseTailscaleIpv4(stdout)`：`tailscale ip -4` の行のうち 100.64.0.0/10 の最初の IPv4。なければ null。
			- `buildServiceEnv(options, tailscaleIp)`：plist の環境変数を作り、`loadConfig` に通して確かめる（誤りは `ConfigError`）。`--read-origins` と `--settings-file` は指定したときだけ書く（なければサーバーの既定）。
			- `renderPlist(definition)`：決めたキー（`Label`、`ProgramArguments`、`WorkingDirectory`、`EnvironmentVariables`、`RunAtLoad`、`KeepAlive`、`ThrottleInterval`、`ProcessType` Background、`StandardOutPath`、`StandardErrorPath`）だけの XML。文字列は `& < > " '` を逃がす。キーは決めた順。
			"""
		satisfies: ["R-01", "R-02", "R-03"]
	}
	"D-04": {
		title: "LaunchAgent の操作（`ServiceManager`、`src/service/launchd.ts`）と命令の入口（`src/tools/service.ts`）"
		text: """
			`ServiceManager` は、差し替えられる口（`exec(file, args)`、ファイルの読み書き、`health(port)`、`out`、`err`）と、`home`、`uid`、`repoDir`、`nodePath`、`nodeVersion` を受ける。

			| 命令 | 送る launchctl の引数 | ほか |
			|---|---|---|
			| install | `print gui/<uid>/<ラベル>`（読み込み済みか）、あれば `bootout gui/<uid>/<ラベル>`、`bootstrap gui/<uid> <plist>`、待つ間の `print` | 設定と node（24 以上、絶対パス）と成果物を確かめ、ログのディレクトリを作り、一時ファイルから名前を変えて定義を書き、`/api/health` の `pid` が `print` の `pid = N` と一致するまで 15 秒待つ |
			| uninstall | `print`、あれば `bootout` | 定義を消す。ログと設定は残す |
			| restart | `print`、`kickstart -k gui/<uid>/<ラベル>`、待つ間の `print` | 読み込まれていなければ誤り。install と同じく `pid` の一致を待つ |
			| status | `print` | 読み込みの状態（`state`、`pid`、`last exit code` の行だけ）と `/api/health` の待ち受けの状態 |

			- Tailscale の IP の `auto` は、`PATH` の `tailscale`、なければ `/Applications/Tailscale.app/Contents/MacOS/Tailscale` の `ip -4` を 5 秒で呼ぶ。取れなければ、Tailscale なしで書き、出力に「Tailscale の IP が取れないので 127.0.0.1 だけで待ち受ける」と出す。
			- `--dry-run` は、定義と送る命令を出すだけで、ファイルを書かず、launchctl を呼ばない（Tailscale の IP の `auto` を探すことはする）。
			- `health(port)` は `http://127.0.0.1:<port>/api/health` を読む（`fetch` の Host は `127.0.0.1:<port>` で、守りを通る）。答えた `pid` が launchd のサービスの pid と違えば、同じポートの別のプロセスなので成功としない。
			- `bootout` が非ゼロで終わったら、そこで終了コード1で止まる（install は定義を書き換えず、uninstall は定義を消さない）。
			- 入口の `src/tools/service.ts` は、本物の口（`execFile`、`node:fs/promises`、`fetch`）と、`process.execPath`、`process.getuid()`、`os.homedir()`、リポジトリのディレクトリ（`import.meta.dirname` の2つ上）を渡す。終了コードは成功 0、設定の誤り 2、そのほかの誤り 1。
			- `package.json`：`service:install` と `service:restart` は先に `npm run build` を走らせる（`npm run build && node src/tools/service.ts install`）。
			"""
		satisfies: ["R-01", "R-03", "F-02", "F-03"]
	}
	"D-05": {
		title: "CLI の誤りの文から stdout を外す（`src/orca/orca-cli.ts`）"
		text: """
			`OrcaCli` の失敗の `message` は、stderr（切り詰め）か、決まった文だけから作る。

			- `json`：JSON でない stdout で終了コード0なら `invalid-json`、`stdout is not JSON (<n> bytes)`。非ゼロなら `exit-nonzero`、`clip(stderr)`、空なら `exited with code <n>`。
			- `document`：非ゼロは `clip(stderr)` か `exited with code <n>`。JSON でなければ `stdout is not JSON (<n> bytes)`。
			- `version`：非ゼロは同じ。
			封筒の `error.message` は Orca が誤りとして返す文なので、今までどおり切り詰めて使う。
			"""
		satisfies: ["R-05"]
	}
	"D-06": {
		title: "録画の検査の配列の規則（`src/orca/replay/sanitize.ts`）"
		text: """
			`isSafeString` の配列の規則で、各要素は「仮名（`PSEUDONYM_ANY`）を1つ以上含み、仮名を除いた残りが 16 字以下で `SAFE_REMAINDER`」を満たす文字列に限る。空の配列は安全。
			満たさなければ、配列の規則では安全とせず、そのまま後の規則（文字列全体の検査）に進む。`[` と `"` と `,` は `SAFE_REMAINDER` にないので、後の規則でも安全にならない。
			"""
		satisfies: ["R-06"]
	}
	"D-07": {
		title: "文書（`README.md`、`AGENTS.md`）"
		text: """
			- README：概要、必要なもの、手元での起動（`npm start`）、常駐（入れる・外す・起動し直す・状態・ログ）、設定の表（環境変数と入れるときの引数）、待ち受けと守り、SpecDock への置き方（`fetch('http://127.0.0.1:8791/api/state')` と CORS、ボタンの1行の `<script>` と `data-*`、Tailscale のアドレスの場合）、スマホ、開発の命令。
			- AGENTS.md：プロジェクトの形に `open*.ts`、`wiring.ts`、`server/guard.ts`、`server/listen.ts`、`service/launchd.ts`、`tools/service.ts`、`web/embed/`、`web/write.js` を足し、道と環境変数と命令を今の形にし、守ることに「launchd の本物の登録は利用者か統括が行う」を足す。
			"""
		satisfies: ["R-04", "R-08"]
	}
	"D-08": {
		title: "noteViewer の配線のテスト（`test/server/api.test.ts`）"
		text:  "呼ばれた回数を数える偽の `StateSource` を渡し、`GET /api/state` で1回増え、`/api/fields`、`OPTIONS /api/state`、拒んだ Origin の `/api/state` では増えないことを確かめる。"
		satisfies: ["R-07"]
	}
	"D-09": {
		title: "実機の受け入れの段取り"
		text: """
			- サーバー：`npm run build` の後に `PORT=18791 ORCA_WEB_TAILSCALE_IP=<この Mac の IP> ORCA_WEB_READ_ORIGINS=http://127.0.0.1:18700 ORCA_WEB_SETTINGS_FILE=<一時> node dist/server/main.js`。`lsof -nP -iTCP:18791 -sTCP:LISTEN` で待ち受けを見る。
			- 別のオリジンの試しの画面：scratchpad に、開くボタンの1行だけを持つ HTML を置き、`127.0.0.1:18700` で配る小さな静的のサーバー（node）。
			- ブラウザー：ヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP で操作し、`Browser.close` で閉じる）。画面の写しは scratchpad で見て、リポジトリに入れない。
			- Orca に届かないとき：`ORCA_BIN=/nonexistent` の別の起動（別のポート）。
			- 開く口の対象は、この Issue の worktree と orca-web の main のチェックアウトだけ。押す前と後の `session.tabs.listAll` の数を比べる（`npm run open:live` の数え方）。
			- Codex：統括に、orca-web の worktree で Codex を1つ起動するよう `ask` で頼み、状態の API で `agentType` が Codex の行を数える。
			"""
		satisfies: ["R-09"]
	}
}

compatibility: "`/api/health` に `listeners` を足すだけで、`ok` は変えない。CLI の誤りの文が短くなるが、誤りの種類（`kind`）は変えない。既存の環境変数と既定値は変えない。"

risks: [
	"Tailscale のアドレスが変わると、定義の IP が古くなる。待ち受けは試し直しを続け、ログに出るので、入れ直す（README に書く）",
	"node をバージョン管理の道具（nodenv など）で入れていると、版を消したときに定義の node のパスが消える。入れ直す（README に書く）",
	"Chrome の Private Network Access で、Tailscale のアドレスからの iframe と要求が止められうる。実機の受け入れで確かめ、止まれば report に書く",
]
