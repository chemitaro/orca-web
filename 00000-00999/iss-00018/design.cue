package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"木と一覧の組み立てを、状態の文書と時刻だけを受ける純粋な関数にし、手書きの文書からテストする",
	"Orca を読むのは共有のポーリングだけのまま。新しい Orca の命令を足さず、既存の `run-list`・`task-list` の読みから項目を足して拾う",
	"状態の API の既存の項目を変えない（足すだけ）",
	"受け箱（iss-00017）の段の決め方と画面の組み立てを、そのまま使う",
]
current: "Run・Task・worker は状態の文書に平らに並ぶ（`runs`、`tasks`、`workers`）。Run の統括の端末と、task を作った端末は読んでいない。木とプロジェクトの画面はない。"
target:  "`GET /api/runs` と `GET /api/runs/<id>/tree` が、Run の一覧と、統括を根にした親子の木を返す。`/runs`、`/runs/<id>`、`/projects/<repo の id>` の画面がそれを描く。"

design: {
	"D-01": {
		title: "状態の読み取りと文書への項目の追加（`read-state.ts`、`normalize.ts`、`model.ts`）"
		text: """
			- `OrcaRun` に `coordinatorHandle`（`run-list` の各件の `coordinator_handle` の文字列。なければ null）を足す。`run-list` の呼び出しに `--full` を足す（実機で、`--full` のない簡潔な形は `id` と `objective` だけで、`coordinator_handle` は `--full` のときだけ出た。タスク担当、2026-11-13）。読む命令のままで、`ReadOnlyOrcaCli` の READ_COMMANDS は変えない。録画の fixture の命令の引数も合わせて直す。
			- `OrcaTask` に `createdByTerminalHandle`（`task-list --full` の `created_by_terminal_handle`。なければ null）を足す。
			- `RunState` に `coordinatorHandle: string | null`（端末のハンドル。WorkerState の terminalHandle と同じ扱い）と、
			  `coordinatorWorktreeId: Fact<string>`（取得元 `terminals` の、そのハンドルの端末の `worktreeId`。なければ、状態の文書の agents のうち `terminalHandle` が等しいものの `worktreeId`。
			  どちらにもなければ `missing: "not-linked"`、ハンドルが null なら `not-provided`、terminals が一度も読めていなければ `source-failed`）を足す。
			- `TaskState` に `createdByTerminalHandle: string | null` を足す。
			- `fields.ts` に `run.coordinator`（統括の端末の worktree）を足すかは任意（足すなら既存の項目の選択の契約を壊さない）。
			状態の文書の版は `orca-web.state/v1` のまま（項目の追加だけ）。既存のテストの期待値（`test/state/expected.ts` など）は、足した項目だけを足して直す。
			"""
		satisfies: ["R-01", "R-02", "F-01"]
	}
	"D-02": {
		title: "木と一覧の組み立て（純粋な関数）`src/runs/tree.ts` と文書の型 `src/runs/model.ts`"
		text: """
			`buildRunTree(state: StateDocument, runId: string): RunTreeDocument | null`（Run が状態の文書になければ null）と、
			`buildRunList(state: StateDocument, project: string | null): RunListDocument`。Orca にも時計にも触らない（時刻は状態の文書の `generatedAt` を写す）。

			**節**（`RunNode`）：`id`（統括は `coordinator:<runId>`、作業者は dispatchId）、`role`（`coordinator`・`worker`）、`dispatchId`・`taskId`（統括は null）、
			`title`（作業者は task の題名、統括は Run の題名。null 可）、`issue`（`iss-\\d+` を5桁に0埋め。作業者は worktree の branch、displayName、task の題名の順。
			統括は Run の題名、統括の worktree の branch・displayName の順。受け箱と同じ規則の関数を `src/inbox/classify.ts` から出して共有する）、
			`agentId`、`agentType`、`model`、`effort`、`state`、`since`、`project`（`{ id, name }`。name は repo の displayName、なければ id。repo が分からなければ null）、
			`worktreeId`、`otherProject`（真偽。下の札）、`orphan`（真偽。F-01）、`links.detail`（`/embed/agent?id=<agentId を encodeURIComponent>`。agentId がなければ null）、`children`。
			値は文字列か null（画面が null を「—」にする）。

			**エージェントの結び付け**：作業者は、状態の文書の agents のうち `worker.dispatchId` が等しいもの、なければ `terminalHandle` が worker の `terminalHandle` と等しいもの。
			統括は `terminalHandle` が Run の `coordinatorHandle` と等しいもの。結び付かなければ agentId・agentType は null。worker に結び付かないエージェントは節にしない。

			**項目**：
			- `model`：作業者は worker の `model.value`（起動時の値）、なければ null。統括はエージェントの `model.value`、なければ null。
			- `effort`：作業者は worker の `effort.value`、なければエージェントの `effort.value`、なければ null。統括はエージェントの `effort.value`、なければ null。
			- `state`：エージェントの `state.value`。それが null で、エージェントの `terminal.value` が `awaiting-restore` なら `sleeping`。エージェントがないか、それでも null なら、作業者は worker の `state.value`（succeeded、failed など）、統括は null。
			- `since`：エージェントの `stateStartedAt.value`、なければ null。
			- `worktreeId`：作業者は worker の `worktreeId.value`、なければエージェントの worktreeId。統括は Run の `coordinatorWorktreeId.value`、なければエージェントの worktreeId。
			- `project`：worktreeId の worktree の `repoId` の repo。

			**親子**：根は統括の節（統括の端末が分からなくても作る。F-01）。その Run の worker（`runId` が等しいもの）を1つずつ節にする。
			worker の task（`taskId` の TaskState）の `parentId.value` が null なら、親は根。null でなければ、`taskId` がその id の同じ Run の worker の節が親。候補が複数なら、
			`terminalHandle` が子の task の `createdByTerminalHandle` と等しいもの、なければ状態の文書の `workers` の並びで最初のもの。
			候補がない、worker の task が状態の文書にない（親の有無が読めていない）、または親をたどると自分に戻る（輪）なら、根の子に置き `orphan: true`。
			`orphan: false` で根の子になるのは、task の `parentId.value` が null の worker だけ。
			兄弟の並びは、task の `createdAt.value` の古い順（null は最後）、同じなら dispatchId の順。

			**札**：作業者の節の `otherProject` は、根の `project` と自分の `project` がどちらも分かり、`id` が違うとき真。統括の節は偽。
			根の project が分からないときは札を付けない（推測しない）。

			**木の文書**（`RunTreeDocument`）：`schema: "orca-web.run-tree/v1"`、`generatedAt`、`stale`、`connection`、`sources`（状態の文書の `runs`、`tasks`、`workers`、`workerLaunch`、`tabs`、`terminals` の取得元の `{ lastSuccessAt, stale, error }`）、
			`run`（`{ id, title, coordinatorProject }`）、`root`（節）、`counts`（`{ nodes, workers, otherProject, orphan }`）。

			**一覧の文書**（`RunListDocument`）：`schema: "orca-web.runs/v1"`、`generatedAt`、`stale`、`connection`、`sources`（上と同じ）、`project`（絞り込み。`{ id, name }` か null。name は repo の displayName、repo がなければ null）、
			`projects`（全 Run の節に出てくるプロジェクトの `{ id, name, count }`。count はそのプロジェクトに節のある Run の数。名前の順）、
			`runs`：各 Run の `{ id, title, coordinatorProject, projects（その Run の節のプロジェクトの { id, name }、名前の順）, workers（worker の数）, otherProject（札の付く節の数）, active（state が working・blocked・waiting の節の数）, latestTaskAt（その Run の task の createdAt の最大。null 可）, fromOtherProject }`。
			`fromOtherProject` は、`project` で絞ったとき、統括のプロジェクトが分かり、その id が絞りのプロジェクトと違えば、統括のプロジェクトの `{ id, name }`。ほかは null。
			絞り込み：`project` が null でなければ、統括か作業者の節のどれかの project の id が等しい Run だけを残す（統括のプロジェクトが分からない Run も、作業者の節が当たれば残す）。
			並び：`active` の多い順、同じなら `latestTaskAt` の新しい順（null は最後）、同じなら id の順。
			"""
		satisfies: ["R-01", "R-02", "F-01"]
	}
	"D-03": {
		title: "HTTP の道（`src/server/app.ts`、`src/server/main.ts`）"
		text: """
			`AppOptions.runs?: { snapshot(): Promise<StateDocument>; noteViewer(): void }` を受ける（`main.ts` が共有のポーリングの状態の文書と、`/api/state` と同じ `poller.noteViewer()` を渡す。Orca を新たに読まない）。両方の API は、文書を返す前に `noteViewer()` を呼ぶ（見る人がいる間はポーリングが速い間隔で読む）。
			- `GET /api/runs?project=<repo の id>`：`buildRunList` の文書。`project` が 512 文字を超えれば 400。
			- `GET /api/runs/<id>/tree`：`<id>` が `^[A-Za-z0-9_-]{1,128}$` でなければ 400、`buildRunTree` が null なら 404、ほかは文書。
			どちらも、Host を確かめ、`Origin` があって自分のオリジンでなければ 403（受け箱と同じ）、CORS を付けない、GET 以外は 405、`runs` がなければ 503。
			画面の道：`/runs`（`web/runs.html`）、`/runs/<id>`（`web/run.html`）、`/projects/<id>`（`web/project.html`）を、`page: 'index'` と同じ CSP で配る（`<id>` は上と同じ形でなければ 404。
			`/projects/<id>` の id は `encodeURIComponent` された repo の id を受け、1〜512 文字）。画面の JavaScript と CSS は絶対パス（`/runs.js` など）で配り、STATIC_FILES に足す。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-02"]
	}
	"D-04": {
		title: "画面（`web/run.html`・`run.js`、`web/runs.html`・`runs.js`、`web/project.html`・`project.js`、組み立ての純粋な関数 `web/runs-view.js`、DOM `web/runs-dom.js`）"
		text: """
			`runs-view.js` は、木の文書から行の列（字下げの深さ、役割の文、Issue、題名、種類、モデル、推論、状態の文、経過の文、プロジェクトの札、`orphan` の印、詳細のリンク）を、
			一覧の文書から Run の行（題名、統括のプロジェクト、プロジェクトの札の並び、作業者の数、動いている数、「<名前> の統括から」の札）を作る純粋な関数。null の値は「—」。
			木の行は、すべての節にプロジェクトの名前の列を持ち（project が null なら「—」）、それとは別に、otherProject が真の節に札を付ける。
			経過の文は受け箱（`inbox-view.js`）の関数を使う（二重に書かない。要れば export する）。鮮度の文は、木と一覧の文書の平らな `sources`（取得元ごとの `{ lastSuccessAt, stale, error }`）を読む関数を `runs-view.js` に新しく書く（受け箱の `freshnessLines` は受け箱の文書の形を読むので使わない。連絡の取得元は出さない）。`test/web/` から確かめる。
			`runs-dom.js` は textContent だけで描く。リンクの href は自分で組んだ相対でない URL（`/runs/<encodeURIComponent(id)>`、`/embed/agent?id=…`）だけ。
			- `/runs/<id>`：木を 10 秒ごとに読み直す。札は「<プロジェクト名>」を点線の枠で示す（色だけに頼らない。文字で出す）。390px では字下げを 1 段 12px 以下にする。
			- `/runs`：全 Run の一覧。プロジェクトの選択（`?project=`）を付ける。
			- `/projects/<id>`：上に受け箱（`/api/inbox?project=<id>`。iss-00017 の `inbox-view.js` と `inbox-dom.js` を使う）、下にそのプロジェクトの Run の一覧（`/api/runs?project=<id>`）。
			- 受け箱の画面（`/`）の見出しに `/runs` へのリンクと、プロジェクトを選んでいるときは `/projects/<id>` へのリンクを足す（選択に従うリンクは `inbox.js` が、選択を変えるたびに書き換える）。
			鮮度：文書の `connection` と `stale` と `sources` から、最後に読めた時刻と読めない取得元を見出しの下に出す。API が読めなければ前の内容を残して「更新できない」と示す。
			Orca で開く、送信の操作は置かない（詳細とチャットのリンクだけ）。CSP は既存の index と同じ（inline を許さない）。390px で1列、横にはみ出さない。
			"""
		satisfies: ["R-01", "R-02", "R-03"]
	}
	"D-05": {
		title: "実機の確かめと文書"
		text: """
			`npm start` を一時の port で起動し（常駐の登録は変えない）、`/api/runs/run_b7c4f4c08bbc/tree` と `/api/runs?project=<orca-web の repo の id>` を読み、
			節の数、札の数、orphan の数、統括のプロジェクト名、札のプロジェクト名だけを記録する（題名や会話の中身は記録しない）。画面を 1280px と 390px で見る。
			README.md と AGENTS.md に、木、一覧、プロジェクトの画面と API、`src/runs/` を書く。
			"""
		satisfies: ["R-01", "R-02", "R-03"]
	}
}

// 要件と設計の対応
// R-01：D-01（統括の端末と作り手）、D-02（木）、D-03（API）、D-04（画面）、D-05（実機）
// R-02：D-01、D-02（一覧と絞り込みと札）、D-03、D-04（プロジェクトの画面）、D-05
// R-03：D-03（CSP と配り方）、D-04（390px、鮮度、textContent）、D-05
// F-01：D-01（missing）、D-02（orphan と根）
// F-02：D-03（400 と 404）

compatibility: "状態の API（`orca-web.state/v1`）は項目を足すだけ。受け箱の API と画面の契約は変えない（見出しにリンクを足すだけ）。"
risks: [
	"Orca の Run・task の項目（`coordinator_handle`、`created_by_terminal_handle`）の名前が変わると、根のプロジェクトと入れ子の親の選び方が弱まる。そのときは根の項目が「—」、入れ子の親は並びの最初になり、木は壊れない",
	"終わった worker の起動時の値は、共有のポーリングが読まない（`needsLaunch` が生きている worker だけ）ので、モデルと推論が「—」になる。読む範囲は変えない（Orca への読みを増やさない）",
	"Run が長く続くと worker が多い（実機で 89）。木は全部出し、画面は縦に長くなる。畳むかは今後の改善",
]
