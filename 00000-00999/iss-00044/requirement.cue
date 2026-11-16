package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

// 保証レベル（light、standard、strict、critical）と、その理由。
assurance: {
	level:  "standard"
	reason: "読み取りの表示だけを直し、送信や開く操作は変えない"
}

purpose: "Run の木（`GET /api/runs/<id>/tree`、`/runs/<id>`）で、構造化 Chat（Orca の Chat の画面）の統括と作業者の節を、状態の API のエージェント（`chat:agent-session:…`、iss-00039 の正の id）に結ぶ。今は節の親子は正しいが、構造化 Chat の統括と作業者の `agentId` がすべて null で、状態・種類・詳細のリンクが出ない。"

background: """
	事実（タスク担当が 2026-11-17 に確かめた。読むだけ。識別子は記録に出さない）：
	- 常駐の orca-web（main の 775226a 相当）の `GET /api/runs` の 21 の Run の木で、根の統括 21 のうち agentId のあるもの 0、worker の節 297 のうち 0（`.workbench/iss-00044/count-tree.mjs`）。対象の Run（epic-00615 の調べで名指した Run）でも統括 0/1、worker 0/201。
	- 同じ時刻の状態の API で、エージェントは chat-tab 11・terminal-tab 46。chat-tab の `worker` はすべて null、`terminalHandle` も null。対象の Run の `coordinatorHandle`・`activeCoordinatorHandle` は null。その Run の task 201 のうち、統括（構造化 Chat）が作ったものは `createdByTerminalHandle` が null（42）、構造化の task 担当が作ったものは `structworker_…`（37）、端末は `term_…`（122）。
	- `orca orchestration worker-list --full`（Orca 1.4.259）の 297 行のうち 69 行が `resource.endpointIncarnation` に `structured:<セッション>` を持ち、同じセッションを2つ以上の Dispatch が持つものは 0。そのうち 6 のセッションに、今の状態の API の chat-tab（`chat:agent-session:<同じセッション>`、タブの `sessionId` が同じ）がある。
	- 構造化 Chat の作業者の chat-tab の `parentPaneKey`（ps の行の値）6 つは、すべて状態の API のエージェントの `paneKey` のどれかと完全に一致し、この作業の依頼主の統括の chat-tab を指すものもある。
	- Orca 1.4.259 のソース（stablyai/orca、読むだけ）：`src/main/runtime/orchestration/terminal-authority/structured-sessions/structured-worker-identity.ts` の `structuredWorkerProcessIncarnation(sessionId)` が `structured:${sessionId}` を作り、`sessionIdFromStructuredWorkerIncarnation` が逆に解く。sessionId は「セッションと /clear の系列の根」で、/clear の後の後継のセッションは別に解く、と注記がある。タブの id は `chatTabId(sessionId)` のほか、開き直したタブの別の形がある（`structured-session-tab-publication.ts`）。
	- orca-web の木（`src/runs/tree.ts`）は worker の節のエージェントを `agent.worker.dispatchId` か `terminalHandle` で、統括を `run.activeCoordinatorHandle` と同じ `terminalHandle` で探す。受け箱（`src/inbox/classify.ts` の `linkedAgent`）も同じ2つで探す。
	"""

includes: [
	"worker-list の `resource.endpointIncarnation` の読み取り（`src/orca/read-state.ts`、状態の文書には新しい項目として出さない）",
	"状態の正規化で、構造化 Chat のタブ（chat-tab）に担当（`agent.worker`）を付ける（`src/state/normalize.ts`）",
	"Run の木で、統括の節を、根の task の作業者の `parentPaneKey` から結ぶ（`src/runs/`）",
	"テスト、README.md、AGENTS.md",
]

excludes: [
	"状態の文書・木の文書の版の変更、項目の意味の変更（`coordinatorResolvedBy` に値を足さない）",
	"送信・Orca で開く・Orca への書き込み・統括の連絡を既読にする読み方",
	"chat-tab のモデルと推論の値（今の no-source のまま。木の worker の節は今どおり worker の値を使う）",
	"/clear の後の後継のセッションの追跡",
	"要約に親を足すこと（iss-00043）",
]

requirements: {
	"R-01": {
		title: "構造化 Chat の作業者の節を、その chat-tab に結ぶ"
		text: """
			worker-list の行の `resource.endpointIncarnation` が `structured:<S>`（S は空でない）で、S を持つ worker の行がちょうど1つのとき、同じ S をタブの `sessionId` に持つ chat-tab のエージェントの `worker` を、その行の `{dispatchId, taskId, runId}` にする。
			Run の木の、その Dispatch の worker の節の `agentId` はその chat-tab の id（`chat:…`）になり、`agentType`・`state`・`workingMode`・`since`・`links.detail` もそのエージェントの値になる。`model`・`effort` は今どおり worker の値。
			S を持つ worker の行が0か2つ以上、`structured:` で始まらない、空、またはその S の chat-tab がないときは、chat-tab の `worker` は null のまま（推測で結ばない）。
			"""
		acceptance: [
			"`structured:<S>` の worker 1行と、sessionId が S の chat-tab 1つを与えると、状態の文書のその chat-tab の `worker` が `{dispatchId, taskId, runId}` で、木のその worker の節の agentId が `chat:…`",
			"S を持つ worker が2行のとき、chat-tab の `worker` は null で、どちらの節の agentId も null",
			"`endpointIncarnation` が端末の形（`structured:` で始まらない）・`structured:` だけ・ない、のどれでも、chat-tab の `worker` は null",
			"タブの id が `agent-session:<S>` と違う形（開き直したタブ）でも、sessionId が S なら結ぶ",
		]
	}
	"R-02": {
		title: "構造化 Chat の統括の節を、その chat-tab に結ぶ"
		text: """
			Run の `activeCoordinatorHandle` が null のとき、その Run の根の task（`parentId` が null）を新しい順に見て、その task の worker の節に結んだエージェントの `parentPaneKey` の値と `paneKey` が完全に一致するエージェントが状態の文書にあれば、最初に見つかったものを根の統括の節のエージェントにする。根の節の `agentId`・`agentType`・`model`・`effort`・`state`・`workingMode`・`since`・`links.detail` はそのエージェントの値になり、根の `worktreeId`（と、それから決まる project）は Run の値がないときそのエージェントの worktree になる。
			見つからないときは今どおり null。
			"""
		acceptance: [
			"統括の chat-tab（paneKey P）と、根の task の作業者の chat-tab（parentPaneKey P、R-01 で結んだもの）を与えると、木の根の agentId が統括の chat-tab の id で、root.project がその worktree の repo",
			"根の task が2つあり、新しいほうの作業者の parentPaneKey が統括 B を、古いほうが統括 A を指すとき、根は B",
			"parentPaneKey がどのエージェントの paneKey とも一致しない、根の task の作業者にエージェントがない、子の task（parentId あり）の作業者だけが一致する、のどれでも根の agentId は null",
		]
	}
	"R-03": {
		title: "端末の統括と作業者の結び付けを変えない"
		text:  "端末の作業者の節は今どおり `agent.worker.dispatchId`、なければ `terminalHandle` で結ぶ。`activeCoordinatorHandle` が null でない Run の統括は今どおり同じ `terminalHandle` のエージェントだけで結び、そのエージェントがなくても R-02 の結び方を使わない。"
		acceptance: [
			"既存の木と状態の正規化のテストが、期待値を変えずに通る",
			"`activeCoordinatorHandle` があり同じ handle のエージェントもあるとき、根の作業者の parentPaneKey が別のエージェントを指していても、根は handle のエージェント",
			"`activeCoordinatorHandle` があり同じ handle のエージェントがないとき、根の作業者の parentPaneKey が一致するエージェントがあっても、根の agentId は null",
		]
	}
	"R-04": {
		title: "結び付けは状態の文書の今の項目で出し、受け箱も同じ結び付けを使う"
		text: """
			R-01 の結び付けは、状態の文書の今の項目 `agent.worker` で出す。セッションの識別子（S）や `endpointIncarnation` を新しい項目として状態の文書・木の文書に出さない。
			受け箱（`buildInbox`）は今の探し方（`agent.worker.dispatchId`）のままで、結んだ chat-tab に、その Dispatch の質問・判断の門の連絡と、task から決まる場所（issue）が付く（結ぶ前は、エージェントに付かない質問の行として出ていた）。
			"""
		acceptance: [
			"状態の文書に `endpointIncarnation` や `structured:` の文字列、新しいセッションの項目が出ない（文書を JSON にして調べる）",
			"結んだ chat-tab の作業者の Dispatch の question の連絡が、受け箱でその chat-tab の行（`agent:chat:…`）の mail に付き、`question:…` の行は出ない",
		]
	}
	"R-05": {
		title: "直す前と後の実物の数を残す"
		text:  "常駐の orca-web（直す前）と、この worktree の一時の orca-web（直した後、127.0.0.1 だけ、送信は無効）の Run の木を読むだけで続けて読み、根の統括と worker の節の agentId のある数を report.md に残す。識別子、パス、IP、ユーザー名は記録に出さない。"
		acceptance: [
			"report.md に、Run の数、統括の agentId のある数、worker の節の agentId のある数の、直す前と後の表がある",
			"直した後に、構造化 Chat の統括か作業者で agentId のある節が1つ以上ある（同じ時刻に該当の chat-tab があるとき）",
		]
	}
}

failures: {
	"F-01": {
		title: "結べないときは今どおり null"
		text:  "worker-list が `resource` を返さない、`endpointIncarnation` が知らない形、タブの取得元の失敗、ps の取得元の失敗（parentPaneKey がない）のどれでも、例外を出さず、結べない節の agentId は null。木の親子・数・ほかの節は変わらない。"
	}
	"F-02": {
		title: "/clear の後の後継のセッションは結ばない"
		text:  "worker の S（系列の根）と、今の chat-tab の sessionId が違うときは結ばない（null のまま）。誤った相手に結ぶよりよい。"
	}
}

constraints: [
	"実行時の依存を足さない。erasable な TypeScript だけ。",
	"Orca には読む要求だけを送る（読む命令も増やさない：worker-list の `--full` の応答のうち、今読んでいない項目を拾うだけ）。",
	"iss-00043 が後で同じ読み取りに触れるので、作業者のエージェントの探し方と統括の探し方は `src/runs/` の1つのモジュールに閉じ、木はそれを使う。",
	"公開リポジトリに、実際の IP、ユーザー名、パス、セッションの識別子を書かない。",
]

decisions: [
	"作業者の結び付けを、木だけでなく状態の正規化の `agent.worker` で出す（タスク担当、2026-11-17。依頼書の「読み取りの1か所に閉じる」に従う。受け箱にも効くのは同じ欠けの解消として受け入れ、R-04 で固める）。",
	"統括の結び方は、木の側で `parentPaneKey` から解き、`coordinatorResolvedBy` に値を足さない（タスク担当、2026-11-17。木の文書の契約を変えない）。",
	"同じセッションを複数の Dispatch が持つときは結ばない（タスク担当、2026-11-17。実物では 0 件。推測で結ばない）。",
]
