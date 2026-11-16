package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"構造化 Chat の作業者を、状態の正規化の1か所で、今の項目 `agent.worker` によってエージェントに結ぶ",
	"作業者と統括のエージェントの探し方を `src/runs/links.ts` の1か所にし、木はそれだけを使う",
]
current: "read-state.ts の pickWorker は `resource.endpointIncarnation` を拾わない。normalize.ts の chatTab は `worker: null`。tree.ts は作業者を dispatchId か terminalHandle、統括を activeCoordinatorHandle の terminalHandle だけで探すので、構造化 Chat はすべて null。"
target:  "pickWorker が `structured:` のセッションを内部の値で拾い、normalize.ts がそれとタブの sessionId で chat-tab に `worker` を付ける。`src/runs/links.ts` の `workerAgent`・`coordinatorAgent` が探し方を持ち、統括は handle がないとき根の task の作業者の parentPaneKey から解く。"

design: {
	"D-01": {
		title: "worker-list の構造化のセッションの読み取り"
		text: """
			`src/orca/read-state.ts`：`OrcaWorker` に `structuredSessionId: string | null` を足す。`pickWorker` で `rec(r.resource)?.endpointIncarnation` が文字列で `structured:` で始まり、その後ろが空でないとき、その後ろを値にする（Orca の `sessionIdFromStructuredWorkerIncarnation` と同じ解き方）。ほかは null。
			この値は内部だけに持ち、`WorkerState`（状態の文書）には足さない。読む命令は変えない（今の `worker-list --full` の応答から拾う）。
			"""
		satisfies: ["R-01", "R-04", "F-01"]
	}
	"D-02": {
		title: "正規化で chat-tab に担当を付ける"
		text: """
			`src/state/normalize.ts`：worker の行から、`structuredSessionId` ごとの行の Map を作る（同じ値の行が2つ以上なら、その値は結ばない印にする）。`chatTab` で、タブの `sessionId` があり、その値の行がちょうど1つのとき、`worker` を `{dispatchId, taskId, runId}` にする。ほかは null。
			タブの id の形には頼らない（sessionId だけで比べる）。model・effort は今の noSource のまま。
			"""
		satisfies: ["R-01", "R-04", "F-01", "F-02"]
	}
	"D-03": {
		title: "作業者と統括の探し方の1か所（src/runs/links.ts）"
		text: """
			新しい純粋なモジュール `src/runs/links.ts`：
			- `workerAgent(state, worker): AgentState | undefined`：今の tree.ts の探し方をそのまま移す（`agent.worker?.dispatchId === worker.dispatchId`、なければ `worker.terminalHandle` が null でないとき同じ `terminalHandle`）。
			- `coordinatorAgent(state, run): AgentState | undefined`：`run.activeCoordinatorHandle` が null でなければ、同じ `terminalHandle` のエージェント（なければ undefined。R-03）。null なら、`state.tasks` のうち `runId` が run で `parentId.value` が null のものを後ろから（状態の文書の tasks は Run・作成の時刻・id の順）見て、その task の id を `taskId` に持つ同じ Run の worker ごとに `workerAgent` を引き、そのエージェントの `parentPaneKey.value` が null でなく、`paneKey` がそれと完全に一致するエージェントがあれば返す。なければ undefined。
			`src/runs/tree.ts` の `buildRunTree` は、統括と作業者のエージェントをこの2つだけで探す（ほかの部分は変えない）。受け箱の `linkedAgent` は変えない（範囲外。同じ結果になる）。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01"]
	}
	"D-04": {
		title: "文書"
		text:  "AGENTS.md の `src/orca/read-state.ts`（`structured:` のセッションを内部で拾う）、`src/state/normalize.ts`（chat-tab の担当）、`src/runs/`（`links.ts`：作業者と統括の探し方、統括は parentPaneKey から）の説明と、README.md の Run の木の説明に、構造化 Chat の結び方と結べないときの null を書く。"
		satisfies: ["R-02", "R-04"]
	}
	"D-05": {
		title: "実物の数の確かめ"
		text:  "`.workbench/iss-00044/count-tree.mjs`（Run の一覧と木を GET で読み、agentId のある数だけを出す）を、常駐の orca-web と、一時の orca-web（`PORT` を空いた番号、`ORCA_WEB_TAILSCALE_IP` なし、`ORCA_WEB_SETTINGS_FILE` と `ORCA_WEB_SENDS_DIR` は `.workbench/iss-00044/` の下）に続けて当てる。一時の orca-web は読んだ後に止める。"
		satisfies: ["R-05"]
	}
}

compatibility: "状態の文書と木の文書の版・項目は変えない。構造化 Chat の作業者の chat-tab の `worker` が null から値になり、木の構造化の節の `agentId` などが null から値になる。受け箱では、その作業者の質問・判断の門が、エージェントのない行からそのエージェントの行に移る。"

risks: [
	"Orca が `structured:` の形を変えると、今どおり null に戻る（悪くはならない）。",
	"/clear の後は、系列の根と今のセッションが違い、結べない（F-02）。",
	"統括の推定は根の task の作業者の parentPaneKey に頼る。作業者が別の統括から起動された根の task だと、その統括に結ぶ（parentPaneKey は Orca が記録した事実なので受け入れる）。",
]
