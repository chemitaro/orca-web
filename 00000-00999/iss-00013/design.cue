package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"送る RPC は、確かめ直しが通った確定の1回にだけ送り、それ以外の道（照会、時間切れ、画面の再読み込み）からは決して送らない",
	"宛先の解決と比べ方、結果の分け方、指紋の算法を、Orca に触らない純な関数にして、録画なしでも網羅して確かめる",
	"Orca に触るのは src/orca/ の送る門とアダプターだけにし、門が決めた形のほかの書き込みを拒む",
	"結果が分からないものを、分かったことにしない（まだ送られうるものを refused と示さない）",
]

current: "orca-web は読む口と「Orca で開く」の口だけを持ち、Orca へのエージェントへの書き込みはない。機能の確かめに `sendGuarded`（確かめの印 `orca-web:guarded-send-verified` が偽のまま）の下地がある。詳細とチャットの画面は読むだけ。"
target:  "詳細とチャットの画面から、意図→確認→確定の3段で、端末のエージェントと構造化 Chat に送れる。送る前と後の記録が Mac の中に残り、結果不明は照会の口で確かめられる。`sendEnabled` が真でなければ、送信の口はすべて拒む。"

design: {
	"D-01": {
		title: "送る門と RPC の封筒（`src/orca/send-gates.ts`、`src/orca/rpc.ts`、`src/orca/runtime.ts`）"
		text: """
			- `RpcCallOptions` に `envelope?: { orchestrationRequestId?: string }` を足す。`RuntimeEndpoint.requestLine(id, method, params, envelope?)` は、envelope があれば要求の行の最上位に `orchestrationRequestId` を置く（Orca CLI の `transport.ts` と同じ位置）。ほかの鍵は置かない。envelope がなければ今と同じ行。
			- `SendRpc`（`RpcTransport`）：送れるのは次だけ。ほかは送らずに例外（呼び出し側の誤り）。
			  - 読む RPC：`READ_METHODS`（既存）と `SEND_READ_METHODS` = `terminal.agentStatus`、`terminal.inspectProcess`、`orchestration.requestShow`、`agentSession.sendRecorded`。`READ_METHODS` 自体は広げない（状態の読みと会話の読みの門は変わらない）。
			  - `terminal.send`：params の鍵がちょうど `terminal`（`term_` で始まる文字）、`text`（空でない文字）、`enter: true`、`agentPrompt: true`、`client: { id: "orca-web", type: "desktop" }`、`waitSubmitMs`（0〜60000 の整数）で、`options.envelope.orchestrationRequestId` が操作の ID の形のときだけ。`interrupt`、`requireAgentStatus`、`inputSequence` などのほかの鍵があれば拒む。
			  - `agentSession.send`：params の鍵がちょうど `envelope`（`sessionId`、`clientOperationId`（操作の ID の形）、`expectedRuntimeFence`、`payloadFingerprint`）と `body`（`kind: "message"`、`role: "user"`、`blocks` が `type: "text"` の1つだけ）のときだけ。`delivery`、`options`、`selection`、`retryUnknown`、画像の block、`skills` があれば拒む。
			- 操作の ID の形は `/^\\d{13}-[0-9a-f]{32}$/`。
			"""
		satisfies: ["R-03", "F-02", "F-04"]
	}
	"D-02": {
		title: "宛先と確認の項目（`src/send/target.ts`、純な関数）"
		text: """
			`SendTarget` は経路ごとの判別つきの型：
			- 端末 `{ route: "terminal", agentId, worktreeId, tabId, leafId, handle, ptyId, incarnationId, agentType, providerSessionId, runtimeId }`
			- 構造化 Chat `{ route: "chat", agentId, worktreeId, tabId, sessionId, agentType, runtimeId }`
			`resolveTarget(listAll, agentId, runtimeId)` が `session.tabs.listAll` の結果から解く（会話の読み手の `resolveFromTabs` と同じ id の規則：端末は paneKey `<parentTabId>:<leafId>`（なければタブの id）、構造化 Chat は `chat:<タブの id>`）。worktreeId はタブを含む snapshot の `worktree`。
			- 端末：タブの `status` が `ready`、`terminal`（handle）、`ptyId`、`incarnationId`、`agentStatus.agentType`、`agentStatus.providerSession.id` がすべて空でない文字。欠ければ `{ ok: false, error: "not_sendable", reason: "identity_unavailable" }`。スリープ（`status` が ready でない）は reason `asleep`、provider のセッションがなければ `no_session`。
			- 構造化 Chat：タブの `agent` と `sessionId` が空でない文字。欠ければ `no_session`。構造化 Chat のスリープ（`sleptAt`）は Unix ソケットの読む口では分からないので、宛先の解決では見ない（requirement の decisions）。
			- 見つからなければ `agent_not_found`。状態の文書で `untabbed` のエージェントは `not_sendable` の reason `untabbed`。形が違えば `unknown_shape`。
			`compareTargets(confirmed, fresh)` が、`route` と上のすべての識別子（worktreeId を含む）と `runtimeId` を比べ、違えば最初に違った項目の種類（`runtime_changed`、`worktree_changed`、`tab_changed`、`terminal_changed`（handle・ptyId・incarnation）、`agent_changed`（種類）、`session_changed`）を返す。
			`buildPreview(state, target)` は確認の項目 `SendPreview`（リポジトリの名前、worktree のパスとブランチ、エージェントの種類、題名、状態、経路、セッションの短い識別子＝provider のセッションの識別子か sessionId の先頭8文字）を、状態の文書（poller の最新）から作る。状態の文書のそのエージェントの `worktreeId` と、`worktrees` の中のその worktree が、`target.worktreeId` と一致しないか、端末ならそのエージェントの `terminalHandle` が `target.handle` と、`agentType` の値が `target.agentType` と一致しなければ null を返す（D-06 が `not_sendable` の reason `state_out_of_date` にする）。確認の項目の worktree と枠が実際の宛先と違うまま確定させないため。題名と状態は poller の間隔（数秒）だけ遅れうるので、画面は「状態の画面の値」として示す。
			"""
		satisfies: ["R-01", "R-02", "F-01", "F-04"]
	}
	"D-03": {
		title: "本文の確かめと確認の票（`src/send/ticket.ts`）"
		text: """
			- `checkText(text)`：文字列で、`trim()` が空でなく、UTF-8 で 16384 バイトまで、`\\t` と `\\n` のほかの C0 の制御文字（`\\r` を含む）、DEL、C1 の制御文字（U+0080〜U+009F）を含まない。違えば理由つきで `invalid_text`。画面は送る前に CRLF と CR を LF にする。
			- `digestText(text)`：本文の UTF-8 の sha256 の16進。
			- `newOperationId(now, random)`：`<13桁のミリ秒>-<32桁の16進>`。
			- `TicketStore`：`issue({ target, digest, operationId })` が 32 バイトの乱数の base64url の票と期限（発行から 60 秒）を返す。生きている票は 32 個までで、超えたら古いものから捨てる。`take(ticket)` は、あれば**同期の処理の中で消してから**中身を返し（2回目は `unknown`）、期限切れなら `expired` を返す。`cancelByOperation(operationId)` は、その操作の ID の票を（期限の内外を問わず）同期の処理の中で消し、消したかを返す。時計は差し替えられる。票の値を記録、ログ、inspect に出さない。
			"""
		satisfies: ["R-01", "R-02", "F-05"]
	}
	"D-04": {
		title: "送る経路のアダプター（`src/orca/send.ts`）と結果の分け方（純な関数）"
		text: """
			`createSendAdapter({ rpc: SendRpc })` が次を持つ。どの関数も、送る RPC を1回より多く送らない（再試行しない）。どの関数も、Orca の誤りの code が `method_not_found` なら、その method の名前を添えて返す（D-06 が経路を止める）。

			**送る前の読み**
			- `readTerminalStatus(handle)`：`terminal.agentStatus { terminal: handle }`。`{ ok, isRunningAgent, status }` か、誤り（`unreachable`、`unsupported`（method_not_found）、`terminal_gone`（`terminal_handle_stale`、`terminal_not_found`、`terminal_gone`、`terminal_exited`）、`unknown_shape`）。
			- `readForeground(handle, incarnationId, agentType)`：`terminal.inspectProcess { terminal: handle, expectedIncarnationId: incarnationId }`。`process.foregroundProcess` が空でない文字なら `{ ok, isShell, matchesAgent }`。`isShell` は Orca v1.4.258 の `shell-process-detection.ts` の `isShellProcess` と同じ規則（前後の引用符を除き小文字にし、パスの最後の部分と、`.exe`・`.cmd`・`.bat`・`.ps1` を除いた名前のどれかが、bash、zsh、sh、fish、cmd、powershell、pwsh、nu、ksh、mksh、dash、ash、tcsh、csh、elvish、xonsh（と `.exe` つき）に当たる）。`matchesAgent` は Orca v1.4.258 の `agent-process-recognition.ts` の `normalizeProcessName` と `recognizeAgentProcess`（保護つきで書くかを決める `isTerminalRunningSettledPromptAgent` が使う）と同じ規則で、正規化した名前（前後の引用符を除き、パスの最後の部分を小文字にし、`.exe`・`.cmd`・`.bat`・`.ps1` を除く）が、agentType が `claude` なら `claude` と完全に一致、`codex` なら `codex` と完全に一致か `codex-` で始まるとき真。ほかの agentType は常に偽。null や形の違いは `foreground_unknown`、誤りは `readTerminalStatus` と同じ分け方。
			- `readChatFence(sessionId)`：`agentSession.history { sessionId, direction: "tail", limit: 1 }`。`ok: true`、`page.sessionId` が頼んだものと同じ、`page.fence` が正の整数のときだけ `{ ok, fence }`。違えば `unknown_shape`。

			**送る**
			- `sendTerminal(target, text, operationId)`：`terminal.send { terminal: target.handle, text, enter: true, agentPrompt: true, client: { id: "orca-web", type: "desktop" }, waitSubmitMs: 10000 }`、envelope `{ orchestrationRequestId: operationId }`、時間切れ 25 秒。
			- `sendChat(target, text, operationId, fence)`：`body = { kind: "message", role: "user", blocks: [{ type: "text", text }] }`、`payloadFingerprint = chatFingerprint(target.sessionId, body)`、envelope `{ sessionId, clientOperationId: operationId, expectedRuntimeFence: fence, payloadFingerprint }`、時間切れ 15 秒。
			- `chatFingerprint(sessionId, body)`：`sha256_hex(canonicalize({ method: "agentSession.send", sessionId, fields: { body } }))`。`canonicalize` は Orca v1.4.258 の `agent-session-mutation-envelope.ts` と同じ（値が undefined の鍵を落とし、鍵を UTF-16 の符号の順に並べ、空白なしの JSON。配列は順のまま、原始の値と null は `JSON.stringify`）。

			**結果の分け方** `classifyTerminal(outcome, target)`、`classifyChat(outcome)` は RPC の結果から `{ outcome, detail }` を返す。detail は決めた鍵だけ（`code`、`method`、`refusedReason`、`stages`、`provider`、`observation`、`dispatchState`、`queuedState`、`replayed`、`warning`）。Orca の誤りの文は入れない。
			原則：Orca が何も書いていないと確かに言えるものだけを refused にし、まだ届きうるものを accepted、届いたと確かめたものを submitted・input_accepted、それ以外を unknown にする。

			| 経路 | RPC の結果 | outcome | detail |
			|---|---|---|---|
			| どちらも | つながる前の失敗（`unavailable`） | refused | `code: "not_sent"` |
			| どちらも | Orca の誤り `method_not_found`、`invalid_argument`（引数の検査で止まり、何も書かれていない） | refused | `code`、`method` |
			| どちらも | 時間切れ、接続断、不正な行、id の違い、大きすぎる応答 | unknown | `code: <kind>` |
			| 端末 | `send.accepted` が偽（Orca の refusedSend。書く前に止めた） | refused | `refusedReason`（`no-agent`、`permission`、なし） |
			| 端末 | Orca の誤り `agent_prompt_blocked` | unknown | `code`、`warning: "composer_may_hold_text"` |
			| 端末 | そのほかの Orca の誤り（`terminal_handle_stale`、`operation_unknown` を含む。本文を書いた後にも起きうる） | unknown | `code` |
			| 端末 | 受けた、`send.prompt` がない、または provider が `unsupported`・`old-host` | unknown | `warning: "agent_not_verified"`（要確認） |
			| 端末 | 受けた、observation が `incarnation_replaced` | unknown | `observation` |
			| 端末 | 受けた、provider が claude・codex・antigravity だが `target.agentType` と違う | unknown | `provider`、`warning: "agent_mismatch"`（確かめたのと別のエージェントに書いたかもしれない） |
			| 端末 | 受けた、provider が `target.agentType` と同じ、stages に `turn_started` | submitted | `stages`、`provider`、`observation` |
			| 端末 | 同上で stages が `input_accepted` だけ | input_accepted | 同上（observation が `permission` なら `warning: "permission_after_submit"`） |
			| Chat | `ok: false` の refusal（受け入れの前に拒んだ） | refused | `code` |
			| Chat | `value.queued` の state が `waiting`・`returned`（カードがまだ送られうる） | accepted | `queuedState` |
			| Chat | `value.queued` の state が `withdrawn`（カードが消され、送られない） | refused | `queuedState` |
			| Chat | `value.queued` の state が `dispatched`（渡したが、渡した先の答えがない） | unknown | `queuedState` |
			| Chat | `value.submission.dispatchState` が `pending` | accepted | `dispatchState` |
			| Chat | 同 `accepted` | submitted | `dispatchState` |
			| Chat | 同 `rejected` で `queuedMessageId` がある（カードの再送待ち） | accepted | `dispatchState`、`queuedState: "card"` |
			| Chat | 同 `rejected` で `queuedMessageId` がない（届かないと確かめた） | refused | `dispatchState` |
			| Chat | 同 `unknown`、または上のどれでもない形 | unknown | `dispatchState` か `code: "unknown_shape"` |

			`replayed: true` が返ったとき（新しい ID では起きないはず）は、上の分け方に `replayed: true` を添える。

			**照会**（読むだけ）
			- `checkTerminal(target, operationId)`：`orchestration.requestShow { request: operationId }`。`completed` で receipt に `send` があれば、その receipt を上の端末の表で（記録の before の宛先を target として）分けて返す。`pending` は unknown（`code: "orca_pending"`）、`absent` は unknown（`code: "orca_absent"`。届いていない証拠ではない）。
			- `checkChat(target, operationId)`：`agentSession.sendRecorded { sessionId, clientMessageId: operationId }`。偽は unknown（`code: "orca_not_recorded"`）。真なら続けて `agentSession.history { sessionId, direction: "tail", limit: 200 }` の `page.queuedMessages` から `messageId` が操作の ID のカード、なければ `page.submissions` から `clientMessageId` が操作の ID のもの、なければ `queuedMessageId` が操作の ID のもの（カードから渡したもの。`submittedSequence` が最大のもの）を探し、あれば上の Chat の表で分ける（`page.sessionId` が違えば探さない）。見つからなければ unknown（`code: "orca_recorded"`。Orca は受けた記録を持つが、届いたかは分からない）。
			"""
		satisfies: ["R-02", "R-03", "R-05", "F-02", "F-03", "F-04"]
	}
	"D-05": {
		title: "送信の記録（`src/send/journal.ts`）"
		text: """
			`SendJournal(dir)`。既定の dir は `~/Library/Application Support/orca-web/sends/`、環境変数 `ORCA_WEB_SENDS_DIR` で変える（`config.ts`）。ディレクトリを 0700 で作り、記録のファイル `sends.jsonl` を 0600 で、追記（`a`）で開く。1行に1つの JSON で、各行に `schema: "orca-web.send-record/v1"`、`kind`、`operationId`、`at`（ISO 8601）を持つ。

			| kind | 中身 |
			|---|---|
			| `before` | `route`、`target`（D-02 の識別子と、確認の項目のリポジトリ、パス、ブランチ、題名）、`text`、`digest`、`generation`（`runtimeId` と端末の `incarnationId`） |
			| `after` | `outcome`、`detail` |
			| `check` | `outcome`、`detail`（照会の結果） |
			| `refused` | 守りを通った確定の要求を、送る前に拒んだもの。`reason`（`ticket_invalid`、`target_changed` と種類、`not_sendable` と reason、`send_disabled`、`busy`、`unsupported`、`unreachable`）と、分かれば `agentId`。本文と票は入れない。operationId は票の操作の ID（票を取り出せないときは、この行のために作る） |

			- `appendBefore` は書いてから `datasync` し、終わってから送る。失敗したら投げる（D-06 が 503 にする）。`appendAfter`、`appendCheck`、`appendRefused` の失敗は投げずに偽を返し、`after`、`check`、`refused` は `SendJournal` のメモリーにも持つ（ファイルに書けなかった拒みも、サーバーが動いている間は照会で見える）。
			- `read(operationId)` は、ファイルを読み、その ID の行を集めて `SendRecord`（before、最後の after、check の並び、refused）にする。メモリーの分を重ねる。行がなければ null（D-06 が処理中か、送っていないかを答える）。before があって after がなければ、outcome を unknown（`code: "no_after_record"`）とする。最後の check の outcome が unknown でなければ、それを今の outcome とする。refused だけなら outcome は refused（送っていない）。壊れた行は飛ばす。
			- authToken、票、トークンは記録の型に入れない。
			"""
		satisfies: ["R-04", "R-05", "F-06"]
	}
	"D-06": {
		title: "送信の処理（`src/send/service.ts` の `SendService`）"
		text: """
			依存：状態の文書（poller の最新の `snapshotSync`）、機能の確かめ（`CapabilityCache.get`）、タブの集合の読み（`SendRpc` の `session.tabs.listAll`。毎回新しく読み、共有の読みを使わない）、送る経路のアダプター（D-04）、票（D-03）、記録（D-05）、`sendEnabled` の読み（D-07）、時計と ID の作り方（差し替えられる）。

			**止めた経路**：アダプターが `method_not_found` を返したら、そのときの runtime の ID と経路と method の名前を持つ。同じ runtime の ID の間、その経路の `status` は available を偽、`intent` と `confirm` は `unsupported`（`missing` に `rpc:<method>`）にする。runtime の ID が変われば捨てる。

			**送れるかの確かめ（共通）** `preflight(agentId)`：
			1. 機能の確かめ（D-08）。つながらなければ `unreachable`。
			2. タブの集合を読み、`resolveTarget`。runtime の ID は、タブの集合の応答の `runtimeId` が null でなく、機能の確かめの値と同じときだけ使い、null なら `unreachable`、違えば `unreachable`（理由 `runtime_changed`）。
			3. 経路の機能が使えないか、止めた経路なら `unsupported`（`missing` を付ける）。
			4. 端末なら `readTerminalStatus`：`isRunningAgent` が真でなければ `not_sendable`（`no_agent`）、`status` が `permission` なら `not_sendable`（`permission`）。続けて `readForeground`：`isShell` なら `not_sendable`（`shell_foreground`）、`matchesAgent` が偽なら `not_sendable`（`foreground_mismatch`）、読めなければ `not_sendable`（`foreground_unknown`）。どちらの読みも `terminal_gone` なら `not_sendable`（`identity_unavailable`）。構造化 Chat なら `readChatFence`。
			5. `buildPreview` が null なら `not_sendable`（`state_out_of_date`）。

			**`status(agentId)`**：`{ enabled, available, route, reason }`。enabled は `sendEnabled`。route と available と reason は `preflight` の結果。送る RPC は送らない。

			**`intent({ agent, text })`**：`sendEnabled` が真でなければ `send_disabled`。`checkText`。`preflight`。操作の ID を作り、票を出し、`{ ticket, expiresAt, operationId, preview, text, digest }` を返す。どこかで止まれば票を出さない。

			**`confirm({ ticket, text })`** の順。送る前に止めたものは `appendRefused` してから返す。
			1. 同時に1つだけ。処理中の印（busy）の判定と立てを、await の前の同じ同期の処理で行い、確定の終わりに `finally` で外す。処理中なら `busy`（票は消費しない）。
			2. `sendEnabled` が真でなければ `send_disabled`（票は消費しない）。
			3. `TicketStore.take` と、取り出せたときの処理中の印（`inFlight` の集合に操作の ID を足す）を、同じ同期の処理の中で行う（間に await を入れない）。なければ・期限切れなら `ticket_invalid`（reason `unknown` か `expired`）。ここから先、票は使い済みで、記録は票の操作の ID で書く。処理中の印は、手順 8 の後か、送る前に止めて `appendRefused` を書いた後に（成功・失敗によらず `finally` で）外す。
			4. `checkText(text)` と `digestText(text) === 票の digest`。違えば `target_changed`（種類 `text_changed`）。
			5. `preflight` をやり直し、その宛先と票の宛先を `compareTargets`。違えば `target_changed`（種類つき）。preflight の誤りのうち、宛先が消えたか変わったことを示すもの（`agent_not_found` は種類 `tab_gone`、`unreachable` の理由 `runtime_changed` は種類 `runtime_changed`、`not_sendable` の reason `asleep`・`untabbed`・`no_session`・`identity_unavailable`・`state_out_of_date` は同じ名前の種類）は `target_changed` にする。`not_sendable` の `no_agent`・`permission`・`shell_foreground`・`foreground_mismatch`・`foreground_unknown` はそのまま `not_sendable`（409）。つながらない `unreachable` は 503 のまま。どれも送らない。
			6. `appendBefore`（票の操作の ID）。失敗したら `record_failed`（送らない）。
			7. 経路の送る関数を1回だけ呼び（構造化 Chat は手順 5 で読んだ fence を使う）、`classifyTerminal`／`classifyChat` で分ける。
			8. `appendAfter`。失敗したら応答に `recordWarning: "after_record_failed"` を付ける。`{ operationId, outcome, detail }` を返す。

			**`check(operationId, { query })`**：最初に、await の前の同じ同期の処理の中で、(a) `inFlight` にその ID があれば `{ state: "in_progress" }` と決め、(b) なければ `TicketStore.cancelByOperation` で票を取り消す。(b) の後は、その ID を新しく送る確定は始まりえない（票がなく、取り出し済みの確定は inFlight にあるため）。そのうえで記録を `read` し、記録があれば `{ state: "recorded", record }`、なければ `{ state: "not_sent" }`。inFlight の印は `appendAfter`（または `appendRefused`）を書き終えてから外すので、(a) で処理中でないと決めた ID の記録は、その後の read で必ず見える。query が真で今の outcome が unknown で、before があるときだけ、経路の照会（`checkTerminal`、`checkChat`）を1回呼び、`appendCheck` して、記録を読み直して返す。Orca に届かなければ check を足さず、`checkError: "unreachable"` を付けて返す。送る関数は呼ばない。

			確定の手順 5 の読みから 7 の送信までの間に、記録の書き込みのほかの await を入れない。それでも残る隙は requirement の risks のとおり。
			"""
		satisfies: ["R-01", "R-02", "R-04", "R-05", "R-06", "F-01", "F-02", "F-03", "F-04", "F-05", "F-06"]
	}
	"D-07": {
		title: "送信を止める設定（`src/state/settings.ts`）"
		text: """
			`SettingsStore.readSendEnabled(): Promise<boolean>` が、呼ぶたびに設定のファイルを読み、JSON の最上位の `sendEnabled === true` のときだけ真を返す。ファイルがない、読めない、JSON でない、`version` が 1 でない、`sendEnabled` が真の真偽でないときは偽。例外を投げない。
			`saveSelected` は、書く前にファイルを読み、そのファイルが JSON で `version` が 1 で `sendEnabled` が真偽のときだけ、その値を残して書く（`{ version: 1, fields, sendEnabled? }`）。それ以外（ない、読めない、壊れている、版が違う）は `sendEnabled` を書かない（送れない側に倒す。版の違うファイルの `sendEnabled: true` を項目の保存が有効にしないため）。
			手で書き換えた停止を項目の保存が上書きしないよう、比べてから入れ替える：最初に読んだファイルの中身（バイト列。なければ「ない」）を覚え、一時ファイルを書いた後、`rename` の直前にもう一度読み、違えば一時ファイルを消して最初からやり直す（3回まで。3回とも違えば保存の誤りにする）。直前の読みと rename の間の隙は残る（requirement の risks）。項目の選択を読む `load` の振る舞いは変えない。HTTP に `sendEnabled` を変える口を作らない。
			"""
		satisfies: ["R-06"]
	}
	"D-08": {
		title: "機能の確かめ（`src/orca/capabilities.ts`）"
		text: """
			`FeatureName` の `sendGuarded` と確かめの印 `orca-web:guarded-send-verified` をやめ、`sendTerminal` と `sendChat` を足す。どちらも書き込みの RPC を確かめのために呼ばない。
			- `sendTerminal`：`runtime:reachable`、`capability:terminal.prompt-delivery.v1`、`runtime-id:consistent`、`feature:readTabs`。deferred：`rpc:terminal.send`、`rpc:terminal.agentStatus`、`rpc:terminal.inspectProcess`、`rpc:orchestration.requestShow`。
			- `sendChat`：`runtime:reachable`、`capability:agent-session.structured.v1`、`capability:agent-session.send-recorded.v1`、`runtime-id:consistent`、`feature:readTabs`、`feature:readTranscript`。deferred：`rpc:agentSession.send`、`rpc:agentSession.sendRecorded`。
			deferred の口は、呼んだときの `method_not_found` を、D-04 が refused（何も書かれていない）として扱い、D-06 がその runtime の間、その経路を止める。
			"""
		satisfies: ["F-04"]
	}
	"D-09": {
		title: "送信の HTTP の口（`src/server/app.ts`、`src/server/main.ts`、`src/server/config.ts`）"
		text: """
			| 道 | 方法 | 守り | 成功 |
			|---|---|---|---|
			| `/api/send/intent` | POST | Host、同じオリジンの JSON、トークン、物は 128 KiB まで、鍵は `agent`（512 字まで）と `text` だけ | 200 `{ ticket, expiresAt, operationId, preview, text, digest }` |
			| `/api/send/confirm` | POST | 同上、鍵は `ticket` と `text` だけ | 200 `{ operationId, outcome, detail, recordWarning? }` |
			| `/api/send/status?agent=` | GET | Host、同じオリジンの読み | 200 `{ enabled, available, route, reason }` |
			| `/api/send/<操作の ID>`（`?check=1`） | GET | Host、同じオリジンの読み | 200 `{ operationId, state: "recorded", record, checkError? }`、`{ operationId, state: "in_progress" }`、`{ operationId, state: "not_sent" }` |

			- 同じオリジンの読み：Origin がないか `http://<Host>`、`Sec-Fetch-Site` がないか `same-origin` か `none`。違えば 403 `forbidden_origin`。CORS を付けない。GET のほかは 405。
			- 誤りの code と HTTP の状態：`invalid_request` 400、`invalid_text` 400、`send_disabled` 403、`agent_not_found` 404、`not_sendable` 409（`reason`）、`target_changed` 409（`reason`）、`ticket_invalid` 409（`reason`）、`busy` 409、`unsupported` 501（`missing`）、`unknown_shape` 502、`unreachable` 503、`record_failed` 503。送った後の結果は、refused と unknown を含めて 200。
			- 送信の口の守りで拒んだ要求（405、413、415、401、403 の Origin）は、送信の記録に書かない。道ごと・誤りの code ごとの件数をメモリーで数え、1分に1回まで件数だけをログに出す。421（Host）は道の振り分けの前なので数えない。
			- 応答とログに本文を出すのは、意図の応答（画面に示すため）と記録の照会の応答だけ。サーバーのログ（`console`）には操作の ID と outcome だけを出す。
			- `main.ts` が `SendService` を組み立てて `createAppHandler` に `send` として渡す。`wiring.ts` が `SendRpc` を作る。`config.ts` が `ORCA_WEB_SENDS_DIR` を読む（空なら既定）。
			"""
		satisfies: ["R-01", "R-02", "R-05", "R-06", "F-05"]
	}
	"D-10": {
		title: "送る欄と確認の画面（`web/embed/agent.html`、`agent-frame.js`、`send-view.js`、`send-dom.js`、`agent.css`）"
		text: """
			- 組み立ては純粋な関数の `send-view.js`：画面の状態 `{ phase: "disabled" | "compose" | "checking" | "confirm" | "sending" | "result", reason?, preview?, ticket?, operationId?, expiresAt?, text, result? }` と、出来事（status の応答、意図の応答、確定の応答、確定の失敗（ネットワークの誤りや時間切れ）、照会の応答、やめる、期限の経過）からの次の状態 `reduceSend(state, event)`。表示の言葉の組み立て `buildConfirm(preview, text)`、`buildResult(result)`（5つの outcome の言葉：受け付けた／入力を受けた／送信を確かめた／結果不明／拒んだ。warning の言葉：要確認（Orca がエージェントを確かめずに書いたかもしれない）、本文が入力欄に残っているかもしれない、送った後に権限の確認が出た）、誤りの code の言葉。
			- 意図の応答の `operationId` を状態に持つ。確定の応答を受けられなかったとき（ネットワークの誤り、時間切れ、JSON でない応答）は、その ID で outcome unknown の結果として示し、「確かめる」を出す。照会が `not_sent` なら「送っていません（後から届いても送りません）」と示し、本文を残して書く欄に戻れるようにする。`in_progress` なら「送っている途中です。少し待ってもう一度確かめてください」と示し、「確かめる」を残す（自動で繰り返さない）。
			- `sending` と `checking` の間は、ボタンを押せなくし、出来事を1つだけ受ける（2回目の押しを捨てる）。自動で送り直さない（write.js の 401 の1回の取り直しは、守りが拒んで何も消費していないので残す）。
			- 409（`target_changed`、`not_sendable`、`ticket_invalid`）と期限の経過は、理由を示して `compose` に戻り、本文を残す。
			- `result` で outcome が unknown なら「確かめる」で `GET /api/send/<ID>?check=1` を呼ぶ。
			- DOM は textContent だけで描く `send-dom.js`。本文は `white-space: pre-wrap` の要素に入れる。CSP は既存の embed のまま（inline の script と style を許さない）。390px で横にはみ出さない。
			- 画面の頭の注記「会話（読むだけ）」は、送れるときは「会話」にする。
			"""
		satisfies: ["R-07", "F-01", "F-03"]
	}
	"D-11": {
		title: "会話の読み手の直し（`src/orca/read-transcript.ts`）"
		text: """
			- `read` が agentSession の結果を解くとき、`page.sessionId` が `target.sessionId` と同じでなければ `unknown_shape`（`parseJournalPage(result, expectedSessionId)`）。
			- `parseNativePage`：`hasMore` が真で `beforeOffset` が 0 以上の整数でなければ `unknown_shape`。`parseJournalPage`：`hasOlder` が真で `window.oldest` が cursor の形でなければ `unknown_shape`。偽のときは今のまま（位置なし、最後のページ）。
			"""
		satisfies: ["R-08"]
	}
	"D-12": {
		title: "実機の確かめの道具（`src/tools/send-live.ts`、`package.json` の `send:live`）"
		text: """
			`node src/tools/send-live.ts --worktree <パス> --handle <端末の handle> [--handle <端末の handle>]` が、実物の Orca につないだ `SendService` を、一時のディレクトリの記録と、`sendEnabled: true` の一時の設定のファイルで組み立て、次を行う。
			- 守り：宛先は端末の handle で指す（統括が知らせた handle をそのまま使う）。状態の文書で、各 handle のエージェントがちょうど1つあり、それが `--worktree` と完全一致するパスの worktree にあり、その worktree が main の worktree（`isMainWorktree`）でないときだけ進む。1つでも違えば、何も送らずに終わる。`--handle` は1〜2個まで。
			- 場面：
			  (1) 各エージェントに短い固定の文（「orca-web の送信の確かめ（<番号>）。受け取りましたとだけ答えてください。」）を意図→確定で送り、outcome を数える。
			  (2) 各送信を照会の口（`check`、query なし）で読み、記録が残っていることを数える。
			  (3) 応答の消失：1つのエージェントに、送る RPC の応答を捨てて時間切れにする包み（`SendRpc` を包む。送る RPC 自体は1回だけ届く）で送り、outcome が unknown になること、続く `check`（query あり）が `orchestration.requestShow` を呼び、Orca の receipt から outcome が決まること（呼び手の鍵の確かめを兼ねる）。
			  (4) 宛先の変化：1つのエージェントの意図の票の中の宛先の provider のセッションの識別子を、道具が別の値に書き換えてから確定し、本物の読みとの比べで `target_changed`（`session_changed`）になること。同じく ptyId を書き換えた票で `terminal_changed`。
			  (5) 送らない場合：使い済みの票での確定、本文を変えた確定、`sendEnabled` を偽にした確定、期限切れの票（時計を進めた票の倉庫）。
			  送る RPC が呼ばれた回数を `SendRpc` を包んで数え、(4) と (5) で 0 回、(1) と (3) で送信ごとに1回であること。
			- 出力：JSON で、Orca の版、エージェントの数、場面ごとの件数と outcome ごとの数、送る RPC の呼ばれた回数、(3) の照会の結論。本文、返答、題名、パス、handle、セッションの識別子を出さない。
			- 一時のディレクトリは終わりに消す。
			"""
		satisfies: ["R-09"]
	}
}

compatibility: """
	状態の API、会話の API、開く口の形は変えない。機能の確かめの `features` から `sendGuarded` が消え、`sendTerminal` と `sendChat` が足される（内部の型。状態の文書には出していない。テストのヘルパーを直す）。
	settings.json に `sendEnabled` が足される（ない間は今のまま送れない）。
	"""
