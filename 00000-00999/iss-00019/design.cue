package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"要約の組み立てを、状態の文書だけを受ける純粋な関数にし、手書きの文書からテストする",
	"Orca を読むのは共有のポーリングだけのまま。新しい Orca の命令を足さない",
	"読み取りの CORS は状態の API と同じ仕組み（`ORCA_WEB_READ_ORIGINS`、`readAccess`）を使う",
	"エージェントの状態の決め方を受け箱と1つにまとめ、受け箱の結果を変えない",
]
current: "SpecDock が worktree ごとの稼働を読むには、大きな状態の文書（`/api/state`）を読んで自分で組むしかない。受け箱の連絡の読みは `updated_at` が7日以内の Run だけ。連絡と関門の時刻は Orca の文字列のまま。一覧の画面は選び直しでポーリングが重なる。"
target:  "`GET /api/worktrees/summary` が `orca-web.worktree-summary/v1` を返し、SpecDock のオリジンにだけ CORS を付ける。受け箱は動いている Run の連絡を読む。時刻は ISO 8601。一覧の画面のポーリングは1本。"

design: {
	"D-01": {
		title: "要約の文書の型と組み立て（純粋な関数）`src/summary/model.ts`、`src/summary/build.ts`"
		text: """
			`buildWorktreeSummary(state: StateDocument): WorktreeSummaryDocument`。Orca にも時計にも触らない（時刻は状態の文書の `generatedAt` を写す）。

			```ts
			type AgentMark = 'working' | 'blocked' | 'waiting' | 'done' | 'sleeping' | 'unknown';
			interface WorktreeSummaryDocument {
			  schema: 'orca-web.worktree-summary/v1';
			  generatedAt: string;            // 状態の文書の generatedAt
			  stale: boolean;                 // 状態の文書の stale
			  connection: { state: 'connected' | 'unreachable' | 'starting'; checkedAt: string | null }; // reason は写さない
			  worktrees: WorktreeSummary[];
			}
			interface WorktreeSummary {
			  id: string;                     // Orca の worktree の id
			  path: string | null;            // worktree の path.value
			  branch: string | null;          // worktree の branch.value
			  project: { id: string; name: string } | null; // 受け箱の location と同じ（repo の displayName が null なら null）
			  issue: string | null;           // findIssue([branch, displayName])（task は使わない）
			  counts: Record<AgentMark, number> & { total: number };
			  agents: { id: string; mark: AgentMark; agentType: string | null; since: string | null; detail: string }[];
			}
			```

			- 状態の決め方 `agentMark(agent: AgentState): AgentMark` を `src/inbox/classify.ts` から export する（または `src/state/` の小さなモジュールに置き、受け箱と要約が共有する）。
			  規則：`agent.state.value` が `working`・`blocked`・`waiting`・`done` ならそれ。値が null で `agent.terminal.value === 'awaiting-restore'` なら `sleeping`。ほかは `unknown`。
			  受け箱の `agentItem` は、working・done・sleeping と状態の欠け（`state_missing`・`state_unknown`）の判定にこの関数を使う（同じ規則を2か所に持たない）。段の決め方（stalled、needs_action の判定と順）と受け箱のテストの期待値は変えない。
			- worktree は、状態の文書の agents の `worktreeId` で集める。agents が1つもない worktree は出さない。worktrees にない id の agents も、その id の worktree として出し、path・branch・project・issue を null にする（F-02）。
			- 並び：worktree は path の文字列の順（null は最後、同じなら id の順）。agents は id の順。
			- `since` は `agent.stateStartedAt.value`。`agentType` は `agent.agentType.value`。`detail` は `/embed/agent?id=${encodeURIComponent(agent.id)}`。
			- 題名、`lastOutputAt` の本文、連絡、Run・task・worker の項目は入れない（小さく保つ。会話の中身を出さない）。
			"""
		satisfies: ["R-01", "F-02"]
	}
	"D-02": {
		title: "`GET /api/worktrees/summary` と読み取りの CORS（`src/server/app.ts`）"
		text: """
			- `READ_ROUTES` に `/api/worktrees/summary` を足し、`/api/state` と同じ `readAccess`（Origin がない・自分のオリジンなら通す、`readOrigins` にあれば `Access-Control-Allow-Origin` と `Vary: Origin`、ほかは 403 `forbidden_origin`）、OPTIONS の 204（`access-control-allow-methods: GET`、`access-control-max-age: 600`）、GET 以外の 405 を通す。
			- 本体：`options.poller` がなければ 503 `summary_unavailable`（CORS の見出しを付ける）。あれば `options.poller.noteViewer()` の後に `buildWorktreeSummary(await options.poller.snapshot())` を 200 で返す。
			- 新しい環境変数は足さない。`ORCA_WEB_READ_ORIGINS` と `ORCA_WEB_TAILSCALE_IP` の既定（`http://127.0.0.1:47800` と `http://<Tailscale の IP>:47800`）をそのまま使う。
			- 共有のポーリングの読みは増やさない（`noteViewer` は状態の API と同じ。受け箱の連絡は読まない）。
			"""
		satisfies: ["R-01", "R-02", "F-01"]
	}
	"D-03": {
		title: "受け箱の連絡を読む Run の選び方（`src/inbox/select-runs.ts`、`src/state/poller.ts`）"
		text: """
			純粋な関数 `selectMailRuns(input: { runs: OrcaRun[]; workers: OrcaWorker[]; state: StateDocument; now: number; limit?: number }): OrcaRun[]`（既定の limit 50、窓 7 日）。
			- Run が「動いている」：`workers` に `runId` がその Run で `needsLaunch(w)` が真の worker がいる、または状態の文書のその Run の `coordinatorResolvedBy` が null でない（今ある端末に解けた統括）。
			- Run が「最近」：`updatedAt` が null、または `isoFromText(updatedAt)` が解けて `now` から7日以内。または状態の文書の tasks のうちその Run の task の `createdAt.value` か `completedAt.value` が7日以内。
			- 動いているか最近の Run を選ぶ。並び：動いている Run を先に、次に `updatedAt` の新しい順（null は最後、同じなら id の順。今の並びと同じ）。先頭から limit 件。
			- `#readMail` は、今の絞り込みと並びの代わりに `selectMailRuns({ runs: this.#sources.runs.data, workers: this.#sources.workers.data ?? [], state: this.snapshotSync(), now: at })` を使う。ほかの処理（誤りの扱い、`#runMail` の掃除、数の記録）は変えない。読みは `createMailReader` の `--peek` のまま。
			"""
		satisfies: ["R-03"]
	}
	"D-04": {
		title: "連絡と判断の関門の時刻の正規化（`src/orca/read-mail.ts`）"
		text: """
			`readRunMail` の `createdAt` と `readGates` の `createdAt` を、`isoFromText`（`src/state/normalize.ts`）で解いた値にする。解けない値と、ない値は null。
			受け箱の `since` と `mail[].createdAt` はこの値を写すので、文書の時刻が ISO 8601 の UTC にそろう。`InboxMessage`・`InboxGate` の型は変えない（`string | null` のまま）。
			"""
		satisfies: ["R-04"]
	}
	"D-05": {
		title: "Run の一覧の画面のポーリングを1本にする（`web/runs.js`、必要なら小さな純粋な部品）"
		text: """
			読みに世代（または進行中の印）を持たせ、次の読みの予約（`setTimeout`）は、その読みが最新の世代のときだけ行う。選び直しは `clearTimeout` の後に新しい世代の読みを始める。古い世代の読みの結果では描かない（今の `asked === project` の確かめを保つ）。
			テストできるように、予約の規則を小さな純粋な部品（例：`web/poll-loop.js` の `createPollLoop({ load, schedule, cancel })`。`schedule` と `cancel` を差し替えられる）に出し、`runs.js` はそれを使う。部品の名前と形は実装担当が決めてよい。
			プロジェクトの画面（`web/project.js`）は選び直しがないので変えない。
			"""
		satisfies: ["R-05"]
	}
	"D-06": {
		title: "実機の確かめと文書（README.md、AGENTS.md、report.md）"
		text: """
			一時の port の `npm start`（`ORCA_WEB_TAILSCALE_IP` は付けない）で、読むだけで確かめる：
			- `/api/worktrees/summary` の worktree の数、エージェントの総数と状態ごとの数を、同じ時の `/api/state` のエージェントの数と比べる。
			- `Origin: http://127.0.0.1:47800` の GET と OPTIONS に CORS の見出しが付き、`Origin: http://127.0.0.1:47801` が 403。
			- 連絡を読む Run の選び方：読むだけの一時のスクリプト（`.workbench/` に置き、コミットしない）で、`src/orca/wiring.ts` の組み立てから共有のポーリングを1回読み、その Run・worker・状態の文書を `selectMailRuns` に通す。`run_b7c4f4c08bbc` が選ばれること、当たった理由（生きている worker、今ある統括の端末、最近の task、`updated_at`）と、`updatedAt` を8日前に置き換えた入力でも選ばれることを記録する。その Run の連絡を `createMailReader` の `readRunMail`（`--peek`）で読んだ件数を記録する（中身は記録しない）。
			- `/api/inbox` を読み、`sources.mail` の `runsRead` と、項目の `mail[].createdAt` と連絡・関門の `since` がすべて ISO 8601 の形（`toISOString()` と同じ）であることを、件数だけで記録する。
			README.md と AGENTS.md に、要約の API、文書の版、CORS、`src/summary/` を書く。
			"""
		satisfies: ["R-01", "R-02", "R-03", "R-04"]
	}
}

// 要件と設計の対応
// R-01：D-01（組み立て）、D-02（道）、D-06（実機）
// R-02：D-02（CORS）、D-06（実機）
// R-03：D-03（選び方）、D-06（実機）
// R-04：D-04、D-06
// R-05：D-05
// F-01：D-02（stale と 503）
// F-02：D-01（unknown と結び付かない worktree）

compatibility: "状態の API、受け箱、木と一覧の API の文書の形は変えない。受け箱の時刻の文字列は ISO 8601 にそろう（値の表し方だけが変わる。画面は Date.parse で読むので影響しない）。受け箱が読む Run は増えうる（上限 50 は変えない）。"
risks: [
	"エージェントの状態の値を Orca が増やすと `unknown` に数えられる。そのときは D-01 の規則に足す",
	"`coordinatorResolvedBy` は今ある端末の統括を示すので、統括の端末が開いたまま止まっている古い Run も連絡を読む対象に入る（上限 50 の中。読む命令は `--peek` で既読にしない）",
	"要約の API は worktree のパス（この Mac の絶対パス）を返す。状態の API と同じく、127.0.0.1 と Tailscale の IP だけで待ち受け、CORS は SpecDock のオリジンだけ",
]
