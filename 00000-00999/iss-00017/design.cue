package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"段の決め方を、状態の文書と連絡の写しと時刻だけを受ける純粋な関数にし、録画からテストする",
	"Orca を読むのは共有のポーリングだけのまま、連絡の読み取りを足す。送る要求は読むものだけで、既読にしない",
	"状態の API の契約を変えない",
]
current: "`/` は状態の一覧の表（iss-00006）。連絡は読んでいない。最後の一言は状態の読み取りで捨てている。"
target:  "`/` が要対応の受け箱。`GET /api/inbox` が段に分けた項目を返す。一覧の表は `/settings` に移る。"

design: {
	"D-01": {
		title: "段の決め方（純粋な関数）`src/inbox/classify.ts` と文書の型 `src/inbox/model.ts`"
		text: """
			`buildInbox(input): InboxDocument`。input は `{ state: StateDocument, mail: MailSnapshot, lastWords: ReadonlyMap<agentId, string>, now: number, stallMs: number, project: string | null }`。
			Orca にも時計にも触らない。文書は `schema: "orca-web.inbox/v1"`。

			**項目**（`InboxItem`）：`id`、`kind`（`agent`・`question`・`gate`・`pr`）、`stage`（`needs_action`・`stalled`・`running`・`finished`・`unknown`）、
			`reasons`（下の理由の code の配列。段を決めた順）、`project`（`{ id, name }`。repo の id と表示名。分からなければ null）、`worktreeId`、`issue`（分からなければ null）、
			`agentType`、`since`（経過の起点の ISO 時刻。null 可）、`lastWords`（200 文字で切った1行。null 可）、
			`links`（`detail`：`/embed/agent?id=<agentId を encodeURIComponent>` か null、`open`：`{ worktreeId, agentId }` か null、`pr`：`https://` の URL か null）、
			`missing`（不明の段の欠けた根拠の code の配列。ほかは空）、`mail`（結び付けた連絡の `{ id, type, createdAt, subject }`。subject は 200 文字で切る）。

			**エージェントの項目**：状態の文書の `agents` の1件ごとに1つ。段は次の順で最初に当たったもの：
			1. needs_action：`state` が `blocked`（理由 `blocked`）か `waiting`（`waiting`）、または結び付いた未読の question・decision_gate の連絡（`question`、`decision_gate`）か、待っている判断の門（`gate`）がある。
			2. stalled：`state` が `working` で、`lastOutputAt` から `stallMs` 以上たった（`no_output`）。`terminal` の値が `attached`・`awaiting-restore` 以外の値で、`state` が `done` でない（`terminal_ended`）。
			   その worktree の PR の state が `open` で CI の status が `failure`（`ci_failed`）。ただし `state` が `done` のエージェントには `ci_failed` を当てない（PR の項目が受ける）。
			3. running：`state` が `working`（`working`）。
			4. finished：`state` が `done`（`done`）、または `state` が null で `terminal` が `awaiting-restore`（`sleeping`）。
			5. unknown：上のどれでもない。`missing` に、state が欠けた（`state_missing`）か、知らない値（`state_unknown`）かを入れる。
			`lastOutputAt` が欠けた working は、`no_output` を当てずに running にする（推測で止まっているとしない）。
			`since` は `stateStartedAt`。`lastWords` は `lastWords` の写しから引く。`links.detail` はすべてのエージェントに付け、`links.open` は `kind` が `terminal-tab` か `chat-tab` のときだけ付ける。

			**連絡の結び付け**：連絡の payload の `dispatchId` → エージェントの `worker.dispatchId`（なければ状態の文書の `workers` の `terminalHandle` → エージェントの `terminalHandle`）。
			結び付いた question・decision_gate はエージェントの項目の `mail` と `reasons` に入れる。結び付かないものは、連絡ごとに `kind: question`（type が decision_gate でも同じ kind に、reasons で区別）の項目にし、段は needs_action。
			その project と worktreeId は、`dispatchId` の worker の `worktreeId` から決め、分からなければ null。lastWords は subject、since は createdAt、links.detail は null。
			判断の門（`gate-list` の待っているもの）も同じく、`taskId` → worker → エージェントで結び、結び付かなければ `kind: gate` の項目にする。

			**PR の項目**：状態の文書の worktree のうち、PR の state が `open` で、その worktree に `state` が `succeeded` の worker が1つでもあるものごとに1つ（`kind: pr`、needs_action、理由 `merge_pending`）。
			未読の worker_done の本文から取った PR の URL で、同じ URL（または repo の PR の番号）の PR の項目があれば、その `mail` に重ねる。
			URL が状態のどの worktree の PR とも合わない未読の worker_done は、`kind: pr` の unknown（`missing: ["pr_state_missing"]`）にする。
			CI が failure で open の PR の項目は、`reasons` に `ci_failed` を足し、段は needs_action のまま。PR の state が `merged`・`closed` なら項目を作らない。
			lastWords は PR の題名、since は worker の終わりの時刻か null、links.pr は https の URL のときだけ。

			**Issue**：worktree の branch か displayName に `iss-\\d+` があればそれを（5桁に0埋め）、なければ結び付いた task の title の同じ形、なければ null。

			**絞り込み**：`project` が null でなければ、`project.id` が等しい項目だけを残す。`projects` には、絞り込む前の全項目に出てくるプロジェクトの `{ id, name, count }` を名前の順で入れる。

			**並び**：各段の中は、needs_action と stalled は since の古い順（null は最後）、running と finished は since の新しい順。finished は `collapsed: true` を文書に付ける（画面が畳む）。

			**鮮度**：文書の `generatedAt`、`stale`（状態の文書の stale か、連絡の写しが stale）、`connection`（状態の文書の写し）、
			`sources`：`state`（状態の文書の stale と、取得元のうち誤りのある名前の配列）、`mail`（`fetchedAt`、`lastSuccessAt`、`stale`、`error`、読めなかった Run の数）、
			`stallMinutes`。連絡の写しが一度も成功していなければ `sources.mail.lastSuccessAt` は null で、画面は質問を「読めない」と示す。
			"""
		satisfies: ["R-01", "R-02", "F-01", "F-02"]
	}
	"D-02": {
		title: "連絡の読み取り `src/orca/read-mail.ts` と、読む口の一覧"
		text: """
			`createMailReader(cli: ReadOnlyOrcaCli)` が `readRunMail(runId)` と `readGates(runId)` を出す。
			- `readRunMail`：`orchestration check --peek --terminal run:<runId> --json --full`。`result.messages` の各件から、`id`、`run_id`、`type`、`to_handle`、`created_at`、
			  `subject`（200 文字で切る）、payload の `dispatchId`・`taskId`・`outcome`（payload は JSON の文字列のことがあるので解く）、
			  type が worker_done のときだけ本文から最初の `https://github.com/<owner>/<repo>/pull/<番号>` の URL を拾う。本文、question の本文、options、reportPath、filesModified は拾わない。
			  `to_handle` が `run:<runId>` でない件（統括あてでないもの）は捨てる。
			- `readGates`：`orchestration gate-list --run <runId> --json --full`。`result.gates` の各件から `id`、`taskId`（`task_id` も受ける）、`status`、`createdAt`（`created_at` も受ける）、
			  `question` を 200 文字で切ったもの、を拾い、status が `pending` のものだけを返す。知らない形は SourceRead の `invalid-shape`。
			`ReadOnlyOrcaCli` の `READ_COMMANDS` に `['orchestration', 'check']` と `['orchestration', 'gate-list']` を足し、`refuse` で、
			`check` は引数に `--peek` があり、`--ack`・`--all`・`--unread`・`--wait`・`--retry-request` がないときだけ通す（ほかは呼ばずに例外）。
			状態の読み取り（`read-state.ts` の `pickAgentStatus`）は `lastAssistantMessage` を拾い（500 文字で切る）、`OrcaAgentStatus.lastAssistantMessage` に入れる。
			状態の正規化（`normalize.ts`）はこれを状態の文書に出さない。
			"""
		satisfies: ["R-01", "F-01"]
	}
	"D-03": {
		title: "共有のポーリングへの連絡の取得元 `src/state/poller.ts`"
		text: """
			連絡の取得元を、状態の文書の `sources` とは別に持つ（状態の文書の形を変えない）。
			`noteInboxViewer()` が呼ばれてから `VIEWER_WINDOW_MS` の間だけ、orchestration の組の間隔で連絡を読む（見る人がいなければ読まない）。
			読む Run は、`runs` の取得元の写しのうち、`updated_at` が 7 日以内のもの（上限 50。新しい順）。Run ごとに `readRunMail` と `readGates` を、同時に 4 までで読む。
			Run ごとに最後に成功した値を残し、失敗した Run は前の値を使って、読めなかった Run の数に数える。全部の Run が失敗したら写しの error に入れる。
			`inboxSnapshot(): Promise<{ state: StateDocument, mail: MailSnapshot, lastWords: Map }>` を出す。`lastWords` は、正規化と同じ id の決め方（`paneKey`、なければタブの id）で、
			端末のタブの `lastAssistantMessage` から作る（id の作り方は normalize の関数を共有して、二重に書かない）。
			連絡の取得元の記録と再生は、既存の `ReplayCliRunner` で行う（録画の fixture は手書きの仮の文）。
			"""
		satisfies: ["R-01", "F-01"]
	}
	"D-04": {
		title: "HTTP の道 `GET /api/inbox` と設定 `ORCA_WEB_STALL_MINUTES`"
		text: """
			`app.ts` に `GET /api/inbox?project=<repo の id>` を足す。`AppOptions.inbox?: { snapshot(): Promise<InboxInputs>; noteViewer(): void }` を受け、`buildInbox` を呼んで JSON で返す。
			Host を確かめ、`Origin` があって自分のオリジンでなければ 403（会話の API と同じ同じオリジンの扱い）。CORS を付けない。GET 以外は 405。`project` が 512 文字を超えれば 400。
			`inbox` がなければ 503。`config.ts` が `ORCA_WEB_STALL_MINUTES`（1 以上 1440 以下の整数。既定 30）を読み、誤りは `ConfigError`。
			`main.ts` がポーリングと設定から `inbox` を組んで渡す。
			"""
		satisfies: ["R-01", "R-02", "F-01"]
	}
	"D-05": {
		title: "受け箱の画面 `web/index.html`、`web/inbox-view.js`（純粋な関数）、`web/inbox.js`、と `/settings`"
		text: """
			`/` が受け箱。今の `index.html`（一覧の表と項目の選択）は `web/settings.html` に名前を変え、`/settings` で配る（`main.js`、`view.js`、`write.js` はそのまま使う）。
			`inbox-view.js` は文書から描く内容（段の見出し、件数、項目の行、理由の文、経過の文、鮮度の文、読めない部分の文）を作る純粋な関数で、`test/web/` から確かめる。
			`inbox.js` は `/api/inbox` を 10 秒ごとに読み、DOM を textContent だけで描く。段は要対応、止まっている、動いている、不明、終わった の順。終わった段は `<details>` で畳む。
			プロジェクトの選択（`<select>`）で `?project=` を変え（`history.replaceState`）、URL から読み直しても保つ。
			各項目：プロジェクト、Issue、エージェントの種類、経過（「12分」「3時間」など）、最後の一言、理由。
			詳細とチャットは `/embed/agent?id=…` を新しい画面で開くリンク。PR は https の URL だけをリンクにする（`rel="noopener noreferrer"`）。
			Orca で開くは、`write.js` の短期のトークンで `/api/open` を呼ぶ既存の流れを使い、幅 390px 以下（`matchMedia('(max-width: 390px)')`）では出さない。
			許可の承認、返事、送信の操作は置かない（許可待ちは「Orca で開いて答える」と案内）。
			F-01：文書の `connection` と `sources` から、最後に読めた時刻と、読めない部分（状態、連絡）を見出しの下に出す。`/api/inbox` が読めなければ前の内容を残して「更新できない」と示す。
			390px で1列。横にはみ出さない（長い語は折り返す）。`/settings` へのリンクを置く。CSP は既存の index と同じ（inline を許さない）。
			"""
		satisfies: ["R-01", "R-02", "F-01", "F-02"]
	}
	"D-06": {
		title: "実機の確かめと文書"
		text: """
			`npm start` を一時の port で起動し（常駐の登録は変えない）、`/api/inbox` を読み、段ごとの件数と理由ごとの件数だけを記録する。
			許可待ちのエージェントと統括あての未読の質問が needs_action に出ること、受け箱を読む前と後で `check --peek --terminal run:<id>` の未読の件数が同じことを確かめる。
			README.md と AGENTS.md に、受け箱、`/settings`、`ORCA_WEB_STALL_MINUTES`、連絡を `--peek` だけで読むことを書く。
			"""
		satisfies: ["R-01", "R-02"]
	}
}

// 要件と設計の対応
// R-01：D-01（段）、D-02（連絡と最後の一言）、D-03（取得）、D-04（API）、D-05（画面）、D-06（実機）
// R-02：D-01（絞り込み）、D-04（`?project=`）、D-05（選択と 390px）、D-06
// F-01：D-01（鮮度）、D-02・D-03（失敗の写し）、D-04、D-05（表示）
// F-02：D-01（unknown と missing）、D-05（表示）

compatibility: "状態の API（`orca-web.state/v1`）は形を変えない。`/` の中身が受け箱に変わり、一覧の表は `/settings` に移る（SpecDock は `/` を埋め込んでいない）。"
risks: [
	"Orca の連絡と門の形が変わると読めなくなる。知らない形は invalid-shape として示し、推測しない",
	"gate-list の各件の形は、実機に待っている門がなく確かめられていない（2026-11-13）。名前の揺れ（taskId と task_id など）を受け、確かめられたら report に書く",
	"Run が多いと読みが増える。7 日以内・上限 50・同時 4 で抑え、見る人がいなければ読まない",
]
