package spec

goals: [
	"新しい項目は内部の値として運び、`orca-web.state/v1` の契約を変えない",
	"結びと判定は `src/apex/` の純粋な関数に置き、メモリの対応表だけを小さな状態のある部品にする",
]

current: "iss-00076 の `buildApexList(state, now)` は生きた辺だけでメンバーを決め、A1・A2 と作業中だけを判定する。`read-state.ts` は run・task・worker の項目の一部だけを拾う。"

target: "`buildApexList(state, now, { extras, bundles })` が束を結び、A3〜A6 と残りの札を判定する。`/api/apexes` は状態の文書と内部の値と対応表を渡す。"

design: {
	"D-01": {
		title: "読む項目の追加（内部の値）"
		text: """
			`src/orca/read-state.ts` の pick に足す（今の応答の項目を読むだけ）：run の `consumerGeneration`（整数か null）、task の `createdByPaneKey`・`createdByRunGeneration`、worker の `workerState`・`attentionCategories`（文字列の配列。知らない値も文字列のまま。配列でなければ空）。
			`src/state/normalize.ts` は今の文書にこれらを入れない。代わりに新しい純粋な関数（例 `buildOrchestrationExtras(raw)`、置き場は `src/apex/extras.ts`）が、生の読みから `{ runs: Map<runId, {generation}>, tasks: Map<taskId, {paneKey, generation}>, workers: Map<dispatchId, {workerState, attention}> }` を作る。
			`src/state/poller.ts` は、今の `snapshot()` を変えず、状態の文書とこの内部の値を同じ読みの世代で返す口（例 `snapshotWithExtras()`）を足す。`/api/state` は今の `snapshot()` のまま。
			"""
		satisfies: ["R-01"]
	}
	"D-02": {
		title: "束と結び（`src/apex/bundles.ts`）"
		text: """
			- 束の鍵 `${runId}#${generation}`（generation は task の `createdByRunGeneration`。なければ `?`）。束は task の集まりと、その task の Dispatch の集まり。
			- 端末の統括：束の根の task（`parentId` なし）の `createdByPaneKey` が、頂点の `paneKey` に一致すれば、束 → 頂点。
			- 構造化 Chat：生きた辺のメンバー（と worker_without_parent のエージェント）の `worker.taskId` の task の束 → そのメンバーの頂点。
			- 対応表 `BundleOwners`（メモリだけ、状態のある小さな部品。`src/apex/owners.ts`）：`observe(bundleKey, apexId, now)` で覚え、`resolve(bundleKey)` で引く。生きた辺や作成者で今わかる結びは、覚えたものより先に使う。捨てる：`sweep(state, extras, now)` が、頂点が2回続けて文書にない、束の task がすべて終わり最後の `completed_at` から 24 時間、上限 1,000 件を超えた古いもの、を捨てる。
			- 生きた仕事の結び：Run の `consumerGeneration` がわかるとき、その世代でない束の生きた Dispatch は、今の世代の束の頂点に結ぶ（今の世代の束の頂点がわからなければ結べない束）。
			- worker_without_parent のエージェントで、その task の束の頂点がわかれば、メンバーにする（depth は束の task の `parent_id` の深さ＋1）。
			"""
		satisfies: ["R-02", "F-01"]
	}
	"D-03": {
		title: "判定（`src/apex/build.ts` の広げ）"
		text: """
			R-03 のとおり。F は状態の文書の `sources.tasks.stale` と `sources.workers.stale` がどちらも偽。生きた仕事の終わった状態の集合は `succeeded`・`failed`・`stopped`・`abandoned`・`cancelled`（大文字小文字を区別しない。知らない値は生きているとみなす）。
			A3 の起点：max(頂点の stateStartedAt, task の createdAt)。A4 の起点：max(頂点の stateStartedAt, メンバーの stateStartedAt の最大)。A6 の起点：task の completedAt（頂点の stateStartedAt より後のもの）。起点が読めなければ、その規則は猶予なしで当たる（A3・A6）、当たらない（A4）。
			理由の順：apex_blocked、apex_waiting、member_blocked、member_waiting、question、decision、stalled、apex_closed、failed、working、monitoring、members_working、live_work、member_grace、grace、done、sleeping。
			眠っている・以前の完了の段の決め方（iss-00076）は、生きた仕事・問いがある頂点を眠っているにしない、を足す。
			"""
		satisfies: ["R-03", "R-04", "F-02"]
	}
	"D-04": {
		title: "札と結べない束"
		text: """
			ApexItem に `badges`（`merge_pending`・`ci_failed`・`failed_members`・`remaining_tasks` と数）を足す。PR と CI は頂点とメンバーの worktree の `pr`・`ci` から（同じ worktree は1回）。`counts` を「生きた辺のメンバー＋束の Dispatch」の working／全体にする（Dispatch の working は生きた仕事、done は終わった workerState）。
			文書の `unlinked` に、結べない束 `{ kind: 'bundle', runId, objective（200 字まで）, generation, live, questions }` を足す（生きた Dispatch か問いがあるものだけ）。
			"""
		satisfies: ["R-05", "R-06"]
	}
	"D-05": {
		title: "画面"
		text:  "`web/apexes-view.js` の言葉の表に、新しい理由と札の言葉を足し、行に札を出す。結べない束の行（Run の目的、生きた数、問いの数、`/runs/<id>` へのリンク）を足す。"
		satisfies: ["R-07"]
	}
}

risks: [
	"構造化 Chat の統括は、再起動の後に最後の子が閉じていれば結べない（受け入れた制約）",
	"`created_by_pane_key` と orca-web の paneKey の式の一致は、端末の統括で確かめる（S-01 の実機の集計）。構造化 Chat の作成者の paneKey は使わない",
]
