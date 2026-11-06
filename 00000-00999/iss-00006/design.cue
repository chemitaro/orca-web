package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"Orca の応答は、読んだその場で、表示に要る項目だけに減らす（プロンプトや本文をメモリーにも残さない）",
	"値の意味、取得元、鮮度、欠けた理由を、値と一緒に返し、取れない値を別の値で埋めない",
	"Orca を呼ぶのは共有のポーリングだけにし、要求はキャッシュから正規化して返す",
	"書き込みは項目の選択の保存だけにし、iss-00007 の書き込みの守りに差し替えやすい小さな形にする",
]

current: "サーバーは `/api/health` だけ。`src/orca/` に CLI と RPC の境界、機能の確かめ、録画と再生がある。画面は空の入口だけ。"
target:  "`/api/state`、`/api/fields`、`/api/settings/fields` があり、共有のポーリングが Orca を読み、状態の画面が選んだ項目だけを表示する。"

design: {
	"D-01": {
		title: "Orca の読み取り（`src/orca/read-state.ts`）"
		text: """
			`ReadOnlyOrcaCli` と `ReadOnlyRpc` だけを受け、取得元ごとの関数で読む。どの関数も、応答を、決めた項目だけを持つ型の記録に減らして返す
			（項目の許可の一覧で拾う。プロンプト、`toolInput`、`lastAssistantMessage`、Task の `spec` と `result`、`transcriptPath`、端末の `preview` などは拾わない）。
			結果は `SourceRead<T> = { ok: true, data: T, truncated: boolean } | { ok: false, error: { kind, message } }`。

			| 取得元の名前 | 呼ぶもの | ページ |
			|---|---|---|
			| `repos` | `orca repo list --json` | なし |
			| `worktrees` | `orca worktree list --limit <n> --json` | `truncated` なら `totalCount` まで上げて読み直す（上限 100000） |
			| `worktreePs` | `orca worktree ps --limit <n> --json` | 同上 |
			| `terminals` | `orca terminal list --limit <n> --json` | 同上 |
			| `tabs` | RPC `session.tabs.listAll` | なし（1回で全部） |
			| `runs` | `orca orchestration run-list --limit 100 [--cursor c] --json` | `nextCursor` がなくなるまで（50ページまで。超えたら truncated） |
			| `tasks` | `orca orchestration task-list --run <id> --full --json` | Run ごと |
			| `workers` | `orca orchestration worker-list --full --limit 100 [--cursor c] --json` | `page.hasMore` が偽になるまで（50ページまで） |
			| `workerLaunch` | `orca orchestration worker-show --dispatch <id> --full --json` | Dispatch ごと |

			最初の `--limit` は 10000。カーソルのある一覧は、同じカーソルが2度出たら止めて truncated にする。
			誤りの種類は、CLI の `CliFailureKind`、RPC の `RpcFailureKind`、形が違うとき `invalid-shape`、機能が使えないとき `unavailable`。
			誤りの文は短く切り、RPC の文は `UnixSocketRpc` が authToken を伏せたものを使う。
			"""
		satisfies: ["R-01", "R-02", "F-02"]
	}
	"D-02": {
		title: "正規化した状態の文書（`src/state/model.ts`、`src/state/normalize.ts`）"
		text: """
			`normalizeState(input, now)` は、取得元ごとの最後に読めた記録と鮮度から、次の文書を作る純粋な関数。

			```
			{ schema: "orca-web.state/v1", generatedAt, stale, connection: { state: "connected"|"unreachable"|"starting", reason, checkedAt },
			  orca: { appVersion, cliVersion, features: { readState, readTabs } },
			  sources: { <取得元>: { fetchedAt, lastSuccessAt, stale, truncated, error } },
			  repos: [...], worktrees: [...], agents: [...], runs: [...], tasks: [...], workers: [...] }
			```

			- 項目の形 `Fact<T> = { value: T | null, source: <取得元> | null, field: <Orca の項目の名前> | null, missing: <理由> | null }`。
			  識別子（`id`、`worktreeId`、`paneKey`、`terminalHandle`、`dispatchId` など結ぶための値）は Fact にしない素の値。
			- 欠けた理由：`not-provided`（取得元を読めたが、この対象に値がない）、`no-source`（この種類の対象には取得元がない。例：Codex の推論、構造化 Chat のモデル）、
			  `not-linked`（結ぶ鍵がない。例：handle のないタブの最後の出力）、`not-fetched`（方針で読まない。例：終わった担当の `worker-show`）、
			  `source-failed`（取得元が一度も成功していない。Dispatch ごとに読む `workerLaunch` では、その Dispatch の読みが成功していない）、`source-unavailable`（機能が使えない。例：`readTabs` の欠け）、`invalid-value`（知らない形の値）。
			- 鮮度：各 Fact の `source` で `sources` を引く。取得元の `stale` は、最後の取得が失敗したか、最後の成功から間隔の3倍を過ぎたとき真。文書の `stale` は、どれかの取得元が古いとき真。
			- モデルと推論は `ReadingFact = Fact<string> & { meaning, readings: [{ value, meaning, source, field }] }`。
			  `readings` は読めた値のすべてで、並びは `current-selection`、`last-observed`、`launch-resolved`、`launch-requested`。代表（value、meaning、source、field）は先頭。
			  エージェントの取得元：タブの `agentStatus.model`（`last-observed`）、`agentStatus.providerSession.effort`（`current-selection`）、担当なら `workerLaunch` の
			  `startOptions.launch.effective`（`launch-resolved`）と `requested`（`launch-requested`）。どれもなければ null で、理由は、担当で `worker-show` を読んでいなければ
			  `not-fetched`、読めていなければ `source-failed`。担当でなければ、端末のタブのモデルは `not-provided`（Orca が報告しない）、推論は Claude Code なら `not-provided`、ほかの種類なら `no-source`。
			  構造化 Chat のタブと、タブのない行（`untabbed`）は、モデルも推論も `no-source`（この Issue では `agentSession.options` を読まない）。
			- エージェントの作り方：
			  1. `tabs` の terminal のタブのうち、`agentStatus` か `launchAgent` を持つもの（`kind: "terminal-tab"`、`id` は paneKey `<parentTabId>:<leafId>`）。
			  2. `tabs` の `agent-session` のタブ（`kind: "chat-tab"`、`id` は `chat:<tab.id>`）。
			  3. `worktreePs` のエージェントのうち、1の paneKey に当たらないもの（`kind: "untabbed"`）。`tabs` が使えないときは、ps のエージェントがすべてこれになる。
			  - 種類：`agentStatus.agentType`、なければ ps の `agentType`、なければ `launchAgent`（chat は `agent`）。
			  - 状態：`agentStatus.state`、なければ ps の `state`（chat は `chatStatus.state`）。状態の開始時刻も同じ順。
			  - 端末：タブの `status` を `ready`→`attached`、`pending-handle`→`awaiting-restore` に写す（ほかの値はそのまま）。`awaiting-restore` をスリープと断定しない。
			  - 最後の出力の時刻：タブの handle で `terminals` を引いた `lastOutputAt`（handle がなければ `not-linked`）。
			  - 題名：`agentStatus.orchestration.taskTitle`、ps の `taskTitle`、タブの `customTitle`、タブの `title` の順。200字で切る。
			  - 親：`agentStatus.orchestration.parentPaneKey`、なければ ps の `parentPaneKey`。
			  - 担当：`agentStatus.orchestration` の `dispatchId`、`taskId`、`orchestrationRunId`。なければ `workers` の `agentTerminalHandle` がタブの handle と一致する担当。
			- repo：`id`、`displayName`、`path`、`kind`、remote の鍵は `gitRemoteIdentity.canonicalKey` をそのまま返す（URL から作らない。なければ `not-provided`）。
			- worktree：`worktrees` を基にし、`worktreePs` を `worktreeId` で重ねる（片方にしかない worktree も返す）。ブランチは `refs/heads/` を外す。
			  パス、ブランチ、表示名、main か、アーカイブか、親（`parentWorktreeId`）、子（`childWorktreeIds`）、最後に動いた時刻（`lastActivityAt`）は `worktrees` を先に、なければ `worktreePs`。
			  状態は ps の `status`（`working`、`active`、`inactive` など）、最後の出力の時刻は ps の `lastOutputAt`。
			- Run：`id` と、題名は `objective`（200字で切る）。
			  PR は `linkedPR` の番号、状態、題名、URL。CI は `linkedPR.checksStatus` と `checksSummary` の件数。PR がなければ両方 `not-provided`。
			- 担当：`workers` の `dispatchId`、`taskId`、`runId`、`workerState`、`dispatchStatus`、`projection.liveness.verdict`、`agentTerminalHandle`、`projection.workspace.id`。
			- Task：`task_title`（なければ `display_name`）、`status`、`parent_id`、`deps`（JSON の配列の文字列を解く。解けなければ `invalid-value`）、`created_at` と `completed_at`。
			- 時刻：数（ミリ秒）と、Orca の `YYYY-MM-DD HH:MM:SS`（SQLite の UTC）を ISO 8601 の UTC にそろえる。
			- 並び：worktree は最後に動いた時刻の新しい順、エージェントは worktree、状態の開始時刻の順（同じなら id）。テストで比べられるように決まった順にする。
			"""
		satisfies: ["R-01", "R-02", "R-04", "F-01", "F-02"]
	}
	"D-03": {
		title: "共有のポーリング（`src/state/poller.ts`）"
		text: """
			`StatePoller` が、取得元の組ごとに間隔と次の時刻を持ち、`tick()` で期限の来た組を読む。`start()` は1秒ごとに `tick()` を呼ぶタイマーを置き、`stop()` で止める。
			時計（`now`）は差し替えられ、テストは `tick()` を直接呼ぶ。

			| 組 | 取得元 | 見ているとき | 見る人がいないとき |
			|---|---|---|---|
			| fast | `tabs`、`worktreePs`、`terminals` | 5秒 | 30秒 |
			| orchestration | `runs`、`tasks`、`workers`、`workerLaunch` | 10秒 | 30秒 |
			| slow | `repos`、`worktrees` | 60秒 | 120秒 |

			- 見る人：最後の `noteViewer()`（`/api/state` の要求ごとに呼ぶ）から 60秒以内。見る人が戻ったら、組の次の時刻を「最後の取得＋見ているときの間隔」に縮める。
			- 組ごとに読みの途中の Promise を1つだけ持ち、途中なら新しく読まない。`snapshot()` は、一度も読んでいなければ最初の読みを待ち、以後は待たずにキャッシュから正規化する。
			- 組を読む前に `CapabilityCache.get()` を呼ぶ。`connection` が `unreachable` なら Orca を読まず、その組の取得元に誤りを記録する（前の値は残す）。
			  `readTabs` が使えなければ `tabs` を読まず `unavailable` を記録する。
			- 取得元ごとに、最後に成功した値と時刻、最後の取得の時刻と誤り、truncated を持つ。失敗しても前の値を消さない。
			- `tasks`：Run ごとに読む（同時に4つまで）。前回すべての Task が終わり（`completed`、`failed`、`cancelled`）で、その Run に終わっていない担当がない Run は、slow の間隔で読む。
			- `workerLaunch`：Dispatch ごとに成功した結果を覚え（2000件まで。古い順に捨てる）、呼び直さない。呼ぶのは、覚えていない担当のうち、
			  終わっていない（`workerState` が `succeeded`、`failed`、`stopped`、`abandoned`、`cancelled` 以外）か、端末を返していない（`terminalState` が `released` でない）もの。
			  1回の読みで30件まで、同時に4つまで。失敗は覚えず、次の読みで呼び直す。
			- 接続の状態：まだ確かめていなければ `starting`。確かめの結果が `unreachable` なら `unreachable` と理由。届いていて、最後の組の読みで全部の取得元が失敗したら `unreachable`（最初の誤り）。
			"""
		satisfies: ["R-05", "F-01", "F-02"]
	}
	"D-04": {
		title: "項目の一覧と選択の保存（`src/state/fields.ts`、`src/state/settings.ts`）"
		text: """
			- 項目の一覧は固定の表：`{ id: "<対象>.<項目>", entity: "repo"|"worktree"|"agent"|"worker"|"task"|"run", label, description, defaultSelected }`。
			  `id` の後ろの部分は、文書の項目の名前と同じ（例：`agent.model` は agents[].model）。
			- 設定のファイル：`ORCA_WEB_SETTINGS_FILE`、なければ `~/Library/Application Support/orca-web/settings.json`。形は `{ version: 1, fields: string[] }`。
			  書くときは、同じディレクトリの一時ファイルに書いてから名前を変える（権限 0600、ディレクトリは 0700 で作る）。
			- 読むとき：ファイルがなければ既定の選択。壊れている、形が違うときも既定の選択で動き、`settings.error` に理由を返す。知らない識別子は読み飛ばす。
			- `GET /api/fields` は `{ fields: [...], selected: [...], settings: { source: "file"|"default", error } }`。
			- `PUT /api/settings/fields` は `{ selected: string[] }` を受け、知らない識別子、重複、配列でない値、64KB を超える本文は 400。保存に失敗したら 500 で理由を返し、メモリーの選択も変えない。
			- 書き込みの小さな守り（iss-00007 が一般の守りを作るまでの形）：`Content-Type` が `application/json`、`Host` がサーバー自身の Host の一覧（既定は `127.0.0.1:<port>` と `localhost:<port>`）と完全に一致し、
			  `Origin` があって `http://<Host>` と完全に一致するときだけ受ける。違えば 403。SpecDock のオリジンにも書き込みは許さない（CORS は GET だけ）。
			"""
		satisfies: ["R-03", "F-03"]
	}
	"D-05": {
		title: "HTTP の入口、読み取りの CORS、静的な画面（`src/server/`）"
		text: """
			- `createAppServer(options)` が、`poller`、`settings`、`readOrigins`、`selfHosts` を受ける（ない部品の口は 503）。`src/server/main.ts` が設定を読んで組み立てる。
			- 設定：`ORCA_WEB_READ_ORIGINS`（カンマ区切りの正確なオリジン。既定 `http://127.0.0.1:47800`）、`ORCA_WEB_SETTINGS_FILE`、`ORCA_BIN`、`PORT`。
			  オリジンは `new URL(o).origin` と同じ文字列だけを受け、末尾の `/` やパスのあるものは起動の誤りにする。
			- Host の確かめ（DNS の付け替えへの守り）：`/api/` の口は、`Host` が selfHosts（既定は `127.0.0.1:<port>` と `localhost:<port>`）と完全に一致しなければ 421 で拒む。
			  iss-00007 が一般の守り（F-04）を作るときに、同じ一覧を使うか置き換える。
			- 読み取りの CORS（`/api/state`、`/api/fields` の GET と OPTIONS）：Origin がない、または `http://<Host>` なら通す。
			  `readOrigins` と完全に一致すれば `Access-Control-Allow-Origin: <そのオリジン>` と `Vary: Origin` を付ける。ほかの Origin は 403。
			  OPTIONS は許したオリジンに `Access-Control-Allow-Methods: GET` を返す。資格情報（Cookie）は許さない。
			- 応答はすべて `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`。
			- 静的な画面：`/` は `web/index.html`、`/main.js`、`/view.js`、`/style.css` だけを、決めた表から配る（パスから読まない）。
			"""
		satisfies: ["R-01", "R-03", "R-04"]
	}
	"D-06": {
		title: "状態の画面（`web/`）"
		text: """
			- `web/view.js`：純粋な関数。`buildView(state, fields, selected)` が、worktree・エージェント・担当の表の、選んだ列だけの見出しと行（文字と、欠けた理由の注記）を返す。
			  worktree の表はアーカイブを除き、エージェントのいる worktree を先にする。値は Fact の `value` を文字にし、モデルと推論は「値（意味）」、欠けたら「—」と理由を出す。
			- `web/main.js`：`/api/fields` と `/api/state` を読み、5秒ごとに `/api/state` を読み直す。項目の選択のチェックボックスと保存のボタンを持ち、`PUT /api/settings/fields` で保存する。
			  上に、接続の状態、最後に成功した時刻、古いかを出す。文字は `textContent` で入れ、HTML として解かない。
			- 明るい・暗い表示と、幅 390px で横にはみ出さない（表は横に巻く）。
			"""
		satisfies: ["R-03", "F-01"]
	}
	"D-07": {
		title: "AGENTS.md を今の形に合わせる"
		text: "`src/orca/` の説明の「後の手順で足します」を、今あるファイル（rpc、runtime、capabilities、read-state、replay）の説明に直し、`src/state/` と API の口を足す。"
		satisfies: ["R-01"]
	}
}

compatibility: """
	新しい口を足すだけで、`/api/health` は変えない。文書の型は `schema: "orca-web.state/v1"` で示し、項目を足すときは版を変えず、意味や形を変えるときは版を上げる。
	iss-00007 は、書き込みの守りを作るときに、D-04 の小さな守りを一般の守りに差し替える（`src/server/` の `same-origin-write.ts` を置き換える）。
	"""

risks: [
	"内部の RPC と CLI の JSON は非公開で、Orca の版で変わりうる。拾う項目を許可の一覧にし、形が違えば `invalid-shape` か `invalid-value` で示す",
	"`worker-show` を担当の数だけ呼ぶ。終わって端末を返した担当は呼ばず、結果を覚えて抑える",
	"Host の確かめは selfHosts の完全一致の最小の形。Tailscale のアドレスで待ち受けるとき（iss-00008）は、その Host を selfHosts に足す必要がある",
	"Task の時刻の `YYYY-MM-DD HH:MM:SS` を UTC とみなしている（SQLite の CURRENT_TIMESTAMP）。違えば時刻がずれる",
]
