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
			"""
		satisfies: ["R-02", "F-02"]
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
		satisfies: ["R-03", "F-02"]
	}
	"D-04": {
		title: "機能の確かめ（probeCapabilities）"
		text: """
			- 入力は OrcaCli と RpcTransport。`orca --version`、`orca status --json`、`orca agent-context --json`、`session.tabs.listAll`、
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
			  RpcTransport を直接置き換える `ReplayRpcTransport` も持つ。
			- 録画：`RecordingCliRunner` と `RecordingRpcTransport` が実物を包んで記録し、書き出す前に `sanitizeRecording` と `assertRecordingSafe` を通す。
			- 仮名化（`Pseudonymizer`、1つの録画で1つ）：
			  - 秘密の項目（`authToken`、`token`、`pairingCode` など、名前で判定）は消す。`orca://pair` を含む文字列は伏せる。
			  - 自由な文の項目（`prompt`、`preview`、`lastAssistantMessage`、`toolInput`、`title`、`taskTitle`、`spec`、`result`、`objective`、`comment`、`messages` の本文など）は
			    `text-N` に置き換える（同じ文は同じ仮名）。
			  - 絶対パスは区切りごとに `p-N` に置き換える（`/Users/a/w/r` と `/Users/a/w/r/x` は、仮名でも前方一致が保たれる）。
			  - ID（UUID、`term_`、`task_`、`ctx_`、`run_` などの接頭辞つき、長い16進、`repoId::path` の合成）は種類ごとの仮名（`uuid-N`、`term_N` など）に置き換える。
			  - 上のどれでもない文字列は、短い列挙の値（例 `working`、`claude`、`terminal`。英小文字、数字、`.`、`-`、`_`、`:` だけで40文字以下）だけを残し、ほかは `text-N` にする。
			  - オブジェクトのキーも、ID やパスなら同じ規則で置き換える。
			- 検査（`assertRecordingSafe`）：authToken の値、利用者の家のパス、`orca://pair`、秘密の項目の名前が残れば、書き出さずに誤り。
			"""
		satisfies: ["R-05", "F-03"]
	}
	"D-06": {
		title: "実機の確かめの道具"
		text: """
			- `src/tools/probe-live.ts`（`npm run probe:live`）。ReadOnlyRpc と OrcaCli だけを使い、`orca --version`、`status`、`agent-context`、`worktree list`、
			  `worktree ps`、`terminal list`、`session.tabs.list`（worktree ごと）、`nativeChat.readSession`（provider のセッションごとに `limit: 1`）を呼ぶ。
			- 出力は集計だけ（件数、項目の有無、値の種類、結べたかどうか）。会話の中身、プロンプト、題名、パスを出さない。
			  model と effort は、値があるかと、値の種類（例 `claude-opus-*` の形、`high` などの列挙）だけを出す。
			- 結べるかの確かめ：worktree list の `id` → `session.tabs.list` のタブ（`parentTabId`、`leafId`）→ terminal list の `tabId`・`leafId`・`handle` → worktree ps の
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
