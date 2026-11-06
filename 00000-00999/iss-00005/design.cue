package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"Orca に触る所を `src/orca/` の中に閉じ込め、CLI と RPC の境界を差し替えられるようにする",
	"機能ごとに確かめ、読む機能は欠けを示して続け、確かめられない書き込みは使えないとする",
	"録画と再生で、Orca なしに、秘密と本文を残さずにテストできるようにする",
]

current: "リポジトリには README と SpecDock の資産だけがある。試作（orca-link-url-trial の server.mjs）は1ファイルで、RPC の呼び方の手本になる。"
target:  "TypeScript のプロジェクトが CI で検査され、`src/orca/` のアダプターが CLI と RPC を呼び、機能ごとの確かめを返し、録画と再生でテストされている。"

design: {
	"D-01": {
		title: "プロジェクトの形"
		text: """
			- Node.js 24（LTS）。TypeScript は Node の型の剥がし（erasable な構文だけ。`erasableSyntaxOnly`、`verbatimModuleSyntax`）で直接動かし、
			  `npm run build` は `tsc` で `dist/` に出す（`rewriteRelativeImportExtensions`）。
			- 置き場：`src/orca/`（アダプター）、`src/server/`（HTTP の最小の入口。`/api/health` だけ。待ち受けは 127.0.0.1 の既定だけで、常駐と待ち受けの設定は iss-00008）、
			  `src/tools/`（実機の確かめと録画の道具）、`web/`（素の ES Modules の画面の置き場。今は空の入口だけ）、`test/`（テストと録画の fixture）。
			- `npm test` は `node --test`、`npm run lint` は `biome check` と `tsc --noEmit`、`npm run build` は `tsc -p tsconfig.build.json`。
			- 依存は devDependencies の `typescript`、`@types/node`、`@biomejs/biome` だけ。実行時の依存はない。
			- CI は `.github/workflows/ci.yml`（PR と main への push で、`npm ci`、`npm run lint`、`npm test`、`npm run build`）。
			- `AGENTS.md` にプロジェクトの形、テストの実行、守ること、仕様の扱い（`.agents/skills/spec-dock/SKILL.md` の「仕様の扱い」と同じ）を書く。`CLAUDE.md` は `@AGENTS.md` の1行。
			"""
		satisfies: ["R-01"]
	}
	"D-02": {
		title: "CLI の境界（CliRunner）"
		text: """
			- `interface CliRunner { run(argv: string[], options): Promise<CliResult> }`。`CliResult` は `{ exitCode, stdout, stderr, durationMs, timedOut }`。
			- 実物の `NodeCliRunner` は、`execFile`（シェルなし）で、絶対パスの実行ファイルを呼ぶ。相対パスは呼ばずに誤り。作業ディレクトリは固定（既定は `os.tmpdir()`）。
			- 環境変数は許した名前（`HOME`、`USER`、`LOGNAME`、`LANG`、`LC_ALL`、`LC_CTYPE`、`TMPDIR`、`PATH`）だけを親から写す（`buildManagedEnv`）。`ORCA_` で始まる名前は、許した名前に足されても渡さない。
			- `OrcaCli` は CliRunner の上で `--json` のコマンドを呼び、`{ ok: true, result }`、`{ ok: false, error: { code, message } }` の Orca の封筒を解いて、
			  `CliOutcome`（`ok`、`orca-error`、`exit-nonzero`、`timeout`、`invalid-json`、`spawn-failed`）の型の結果で返す。stderr と stdout の文は、長さを切って誤りの文に入れる。
			- 読むコマンドの一覧（`READ_COMMANDS`：`--version`、`status`、`agent-context`、`repo list`、`worktree list`、`worktree ps`、`terminal list`、
			  `orchestration run-list`、`orchestration task-list`、`orchestration worker-list`、`orchestration worker-show`）を持ち、この Issue の呼び出し口の
			  `ReadOnlyOrcaCli` は、一覧にないコマンド（`terminal switch`、`terminal send` など）を呼ばずに誤りにする。
			"""
		satisfies: ["R-02", "R-06", "F-02"]
	}
	"D-03": {
		title: "RPC の境界（RpcTransport）"
		text: """
			- `interface RpcTransport { call(method, params, options): Promise<RpcOutcome> }`。`RpcOutcome` は `{ ok: true, result, runtimeId }`、または
			  `{ ok: false, kind, code?, message }`（`kind` は `orca-error`、`timeout`、`disconnected`、`invalid-frame`、`mismatched-id`、`unavailable`、`oversized`）。
			- 実物の `UnixSocketRpc` は、呼ぶたびに `RuntimeLocator` で `orca-runtime.json`（既定は `~/Library/Application Support/orca/`）を読み、unix の口に接続し、
			  `{"id","authToken","method","params"}` の1行を送り、同じ id の応答の行を1つ受けて閉じる。分割された行をつなぎ、`{"_keepalive":true}` は読み飛ばして時間切れを延ばす。
			  応答の行の大きさに上限（既定 16MB）を持つ。
			- authToken は `RuntimeLocator` が返す `RuntimeEndpoint` の閉じた内側（クラスの非公開のフィールド）にだけ持ち、`toJSON` と `inspect` で伏せる。
			  誤りの文は Orca の `error.code` と、authToken の値を伏せた `message` だけにする。
			- 読み取りの RPC の名前の一覧（`READ_METHODS`：`session.tabs.list`、`session.tabs.listAll`、`nativeChat.readSession`）を持ち、
			  この Issue の呼び出し口は `ReadOnlyRpc` で、一覧にない名前を送らずに誤りにする。
			"""
		satisfies: ["R-03", "R-06", "F-02"]
	}
	"D-04": {
		title: "機能の確かめ（probeCapabilities）"
		text: """
			- 入力は ReadOnlyOrcaCli と ReadOnlyRpc（読むものだけを呼べる口）。`orca --version`、`orca status --json`、`orca agent-context --json`、`session.tabs.listAll`、
			  `nativeChat.readSession`（空の引数で呼び、`invalid_argument` なら口がある、`method_not_found` なら無い）を確かめる。
			- 結果の `CapabilityReport` は `{ checkedAt, cliVersion, appVersion, runtimeId, runtimeIdConsistent, connection, features }`。
			  `connection` は `connected` か `unreachable`（理由つき）。`features` は機能ごとに `{ available, satisfied[], missing[], deferred[] }`。
			- 機能と、その確かめ：
			  - `readState`：runtime に届く。コマンド `repo list`、`worktree list`、`worktree ps`、`terminal list`、`orchestration run-list`、`orchestration task-list`、
			    `orchestration worker-list`、`orchestration worker-show` がある。
			  - `readTabs`：`session.tabs.listAll` が読め、タブに `id`、`type` があり、terminal のタブに `parentTabId`、`leafId` がある。
			  - `openExistingTab`：`readTabs` が使え、コマンド `terminal switch` とそのフラグ `terminal` があり、capability `session-tabs.authoritative-inventory.v1` がある。
			    `session.tabs.activate` と `worktree.activate` の有無は `deferred`（呼ぶときの method_not_found で確かめる）。
			  - `readTranscript`：`nativeChat.readSession` の口がある。
			  - `sendGuarded`：capability `terminal.prompt-delivery.v1`、コマンド `terminal send` がある。加えて「保護された送信の経路の確かめ（epic-00004）」が
			    満たされるまで `missing` に残し、使えないとする。
			- runtime の ID は `status` の `runtime.runtimeId`、`orca-runtime.json`、RPC の `_meta.runtimeId` を比べ、食い違えば `runtimeIdConsistent: false` で、
			  書き込みの機能（openExistingTab、sendGuarded）を使えないとする。
			- `CapabilityCache` は runtime の ID ごとに結果を持ち、ID が変わったら捨てて確かめ直す。
			"""
		satisfies: ["R-04", "F-01", "F-02"]
	}
	"D-05": {
		title: "録画と再生"
		text: """
			- 録画の形（JSON、`version: 1`）：CLI は `{ kind: "cli", entries: [{ argv, exitCode, stdout, stderr, delayMs }] }`。
			  RPC は `{ kind: "rpc", exchanges: [{ method, params, chunks: string[], end: "close" | "hold" }] }`（`chunks` は届いた順の生の文字列で、分割、keepalive、不正な JSON を表す）。
			- 再生：`ReplayCliRunner` は argv が一致する録画を順に返し（遅延も再現）、一致しなければ誤り。RPC は、テストの中で一時の Unix ソケットの
			  `ReplayRpcServer` を立て、要求ごとに `chunks` を送り、`end` に従って閉じる。実物の `UnixSocketRpc` をそのまま検査できる。
			  RpcTransport を直接置き換える `ReplayRpcTransport` も持つ（`chunks` を同じ解き方で解く）。
			- 録画：`RecordingCliRunner` は CliRunner を包み、argv、終了コード、stdout、stderr、所要時間を記録する。`RecordingRpcTransport` は RpcTransport を包み、
			  解いた応答を1つの行（`{ id, ok, result | error, _meta }` の1つの chunk）として記録する。分割、keepalive、不正な JSON、接続断は、実機からは録らず、手で書いた録画で表す。
			  どちらも書き出す前に `sanitizeRecording` と `assertRecordingSafe` を通す。
			- 仮名化（`Pseudonymizer`、1つの録画で1つ。同じ時に録って一緒に再生する CLI と RPC の録画の組では、1つを共有し、録画をまたいでも同じ値を同じ仮名にする）。CLI の stdout と RPC の chunk は、JSON の行として読めれば中を仮名化して書き戻す。
			  - 秘密の項目（`authToken`、`token`、`pairingCode` など、名前で判定）は消す。`orca://pair` を含む文字列は伏せる。
			  - 自由な文の項目（`prompt`、`preview`、`lastAssistantMessage`、`toolInput`、`title`、`taskTitle`、`spec`、`result`（task の）、`objective`、`comment`、`messages` の本文など）は
			    `text-N` に置き換える（同じ文は同じ仮名）。stderr も自由な文として扱う。
			  - ほかの文字列は、中の部分を置き換える：UUID は `uuid-N`、8文字以上の16進は `hex-N`、絶対パスは区切りごとに `p-N`（`/Users/a/w/r` と `/Users/a/w/r/x` は仮名でも前方一致が保たれる）。
			    文字列の中の一部を置き換えるので、`term_<uuid>`、`<uuid>:<uuid>`（paneKey）、`<repoId>::<path>` の中の対応も、ほかの項目の同じ値の仮名と一致する。
			  - 置き換えた後の文字列が、仮名と、短い列挙の値（英数字、`.`、`-`、`_`、`:`、`/` だけで40文字以下）と区切りだけでできていなければ、元の文字列ごと `text-N` にする。
			  - オブジェクトのキーも、同じ規則で置き換える。
			- 検査（`assertRecordingSafe`）は仮名化と別に、録画全体（argv、stdout、stderr、chunk、キーと値）を読み、次のどれかがあれば、書き出さずに誤りにする。
			  - authToken の値（渡されたとき）、利用者の家のパス、`orca://pair`、秘密の項目の名前。
			  - 自由な文の項目に `text-N` と空でない値（本文の残り）。
			  - ほかの文字列で、仮名と短い列挙の値と区切りだけでできていないもの（自由な文、仮名にしていない ID やパス）。JSON として読めない chunk は、引用符の中の文字列ごとに同じ規則で見る。
			  手で書いた fixture も、テストで同じ検査を通す。
			"""
		satisfies: ["R-05", "F-03"]
	}
	"D-06": {
		title: "実機の確かめの道具"
		text: """
			- `src/tools/probe-live.ts`（`npm run probe:live`）。ReadOnlyRpc と ReadOnlyOrcaCli だけを使い、`orca --version`、`status`、`agent-context`、`worktree list`、
			  `worktree ps`、`terminal list`、`session.tabs.list`（worktree ごと）、`nativeChat.readSession`（provider のセッションごとに `limit: 1`）を呼ぶ。
			- 出力は集計だけ（件数、項目の有無、値の種類、結べたかどうか）。会話の中身、プロンプト、題名、パスを出さない。
			  model と effort は、値があるかと、値の種類（例 `claude-opus-*` の形、`high` などの列挙）だけを出す。
			- 結べるかの確かめ：worktree list の `id` → `session.tabs.list` のタブ（`parentTabId`、`leafId`）→ terminal list の `tabId`・`leafId`・`handle`（タブの `terminal` の handle からも結び、どの識別子が一致するかを数える）→ worktree ps の
			  `paneKey`（`<tabId>:<leafId>`）→ `agentStatus.providerSession` の id。各段で一意に結べた数、結べなかった数、複数に当たった数を数える。
			- スリープの見え方：タブの `status`（`pending-handle`）、`ptyId` の有無、`agentStatus` の有無と `state`、worktree ps の `hasLivePty` の組を数える。
			- 結論は開発者が report.md に書く。道具の出力は Git の管理外の `.workbench/` に置く。
			"""
		satisfies: ["R-06"]
	}
}

compatibility: "新しいリポジトリの土台で、既存の契約はない。Orca の内部の RPC の形はタグ v1.4.249 のソースに合わせ、手元の Orca の版を確かめの結果に記録する。"

risks: [
	"内部の RPC は非公開。Orca の版が変わったら、録画を取り直し、実機の確かめの道具を走らせ直す",
	"`nativeChat.readSession` を空の引数で呼んで口の有無を見る方法は、引数の検査の前に method の解決をする Orca の今の作り（rpc-request-admission-prologue.ts）に頼る",
	"仮名化の列挙の値の判定は、短い自由な文を残しうる。自由な文の項目の名前の一覧で先に置き換え、録画は人が読んでからコミットする",
]
