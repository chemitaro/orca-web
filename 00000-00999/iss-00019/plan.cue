package spec

// 計画（Issue）。型 specdock/v1。

goal: "稼働の印の要約の API を SpecDock のオリジンにだけ読ませ、前の Issue の残り3つを直し、実機で要約の数と、`run_b7c4f4c08bbc` の連絡が受け箱に入ることを確かめる。"

// 開始のコミット：4efd9cbd956316e356ba703f4f8713f56f561f49（main と同じ。worktree iss-00019、ブランチ chemitaro/iss-00019）。
// 各手順はテスト先行（tdd）。fixture は自分で作った仮の文だけ。仕様の読み方に迷ったら、直さずにタスク担当に問う。

steps: {
	"S-01": {
		title:    "要約の文書の型と組み立ての純粋な関数（D-01）を作る"
		text:     "対象：`src/summary/model.ts`、`src/summary/build.ts`、状態の決め方の共有（`src/inbox/classify.ts` の export、または小さなモジュール）、`test/summary/build.test.ts`（手書きの状態の文書。`test/inbox/fixture.ts` などの既存の組み立てを使ってよい）。確かめ：T-01、T-02。完了：`node --test test/summary/*.test.ts test/inbox/*.test.ts` と `npm run lint` が通り、受け箱のテストの期待値が変わらない。区切りのレビュー：なし"
		realizes: ["R-01", "F-02"]
		status:   "todo"
		session:  "impl"
	}
	"S-02": {
		title:    "`GET /api/worktrees/summary` と読み取りの CORS（D-02）を作る"
		text:     "対象：`src/server/app.ts`、`test/server/`（新しい `summary-api.test.ts`）。確かめ：T-03、T-04。完了：`npm run lint`、`npm test`、`npm run build` が通る。区切りのレビュー：なし"
		realizes: ["R-01", "R-02", "F-01"]
		after:    ["S-01"]
		status:   "todo"
		session:  "impl"
	}
	"S-03": {
		title:    "受け箱の連絡を読む Run の選び方（D-03）と、連絡と関門の時刻の正規化（D-04）を直す"
		text:     "対象：`src/inbox/select-runs.ts`（新規）、`src/state/poller.ts`、`src/orca/read-mail.ts`、`test/inbox/select-runs.test.ts`、`test/orca/read-mail.test.ts`、`test/state/`（poller の受け箱の読みのテストがあれば）。確かめ：T-05、T-06、T-07。完了：`npm run lint`、`npm test`、`npm run build` が通る。区切りのレビュー：なし。止まって HEAD を報告する（セッション impl の最後）"
		realizes: ["R-03", "R-04"]
		after:    ["S-02"]
		status:   "todo"
		session:  "impl"
	}
	"S-04": {
		title:    "Run の一覧の画面のポーリングを1本にする（D-05）"
		text:     "対象：`web/runs.js`、（新規なら）`web/poll-loop.js`、`src/server/app.ts` の配るファイルの表（新しい js を配るなら）、`test/web/`。確かめ：T-08。完了：`npm run lint`、`npm test`、`npm run build` が通る。`npm start` を一時の port で起動し、`/runs` で選び直しても表示が保たれることを見る（Orca で開くは押さない）。区切りのレビュー：なし。止まって HEAD を報告する"
		realizes: ["R-05"]
		after:    ["S-03"]
		status:   "todo"
		session:  "ui"
	}
	"S-05": {
		title:    "実機の確かめ（読むだけ）と、README.md、AGENTS.md、report.md を書く（D-06）"
		text:     "タスク担当が行う（文書の手順）。D-06 の確かめをして、数と結論だけを report.md に書く。`orca --version` を書く。確かめ：T-09。完了：report.md の Verification に実機の結論があり、README.md と AGENTS.md が出来上がったものと合う"
		realizes: ["R-01", "R-02", "R-03", "R-04"]
		after:    ["S-04"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "手書きの状態の文書から、エージェントのいる worktree だけが path の順に出て、各 worktree の agents（id の順、mark、agentType、since、detail は encodeURIComponent）と counts（6つの状態と total）、project（repo の表示名がなければ null）、issue が期待どおり。worktrees にない id のエージェントは path・branch・project・issue が null の worktree で出る。generatedAt、stale、connection（reason は出さない）を写す。題名や最後の一言が文書に出ない", verifies: ["R-01", "F-02"]}
	"T-02": {title: "状態の決め方：working・blocked・waiting・done はそのまま、null で端末が awaiting-restore なら sleeping、null でほかの端末、または知らない値は unknown。受け箱の既存のテストが変わらず通る", verifies: ["R-01", "F-02"]}
	"T-03": {title: "`GET /api/worktrees/summary` が文書を返し noteViewer を呼ぶ。Origin なしと自分のオリジンは CORS なしで通り、許したオリジンの GET と OPTIONS に `Access-Control-Allow-Origin` と `Vary: Origin` が付き（OPTIONS は 204、allow-methods GET）、ポートやスキームだけ違うオリジンは 403、GET・OPTIONS 以外は 405、知らない Host は 421", verifies: ["R-01", "R-02"]}
	"T-04": {title: "poller がなければ 503 `summary_unavailable`。状態の文書が stale なら要約も stale: true で 200", verifies: ["F-01"]}
	"T-05": {title: "`selectMailRuns`：`updated_at` が8日前でも、needsLaunch の worker がいる Run、coordinatorResolvedBy のある Run、task の createdAt か completedAt が7日以内の Run が選ばれ、どれにも当たらない古い Run は選ばれない。updatedAt が null の Run は選ばれる。上限を超えると動いている Run が先に、次に新しい順（null は最後、同じなら id）", verifies: ["R-03"]}
	"T-06": {title: "poller の受け箱の連絡の読みが `selectMailRuns` の Run を読む（`updated_at` の古い、生きている worker のいる Run の連絡が mail に入る）。読む命令は `--peek` のまま", verifies: ["R-03"]}
	"T-07": {title: "連絡と関門の `createdAt`：SQLite の形、Z 付き、オフセット付きが `toISOString()` の形に、解けない値と、ない値が null になる", verifies: ["R-04"]}
	"T-08": {title: "一覧の画面のポーリング：読みの途中に選び直すと、両方の読みが終わった後の予約が1つだけ。古い選択の結果では描かない", verifies: ["R-05"]}
	"T-09": {title: "実機の確かめ：要約の worktree とエージェントの数が状態の API と合う。CORS が 47800 だけに付く。`run_b7c4f4c08bbc` が連絡を読む Run に入り、連絡の時刻が ISO 8601", verifies: ["R-01", "R-02", "R-03", "R-04"]}
}

verification: """
	各手順で、その手順のテストを手書きの入力と録画の再生で通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実機の確かめは読むだけで、件数と結論だけを report.md に書く。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：agent（統括がマージする。タスク担当はマージしない）。merge_permission：統括の依頼書（2026-11-13）の「マージ（統括が行う）」
	- 区切りのレビュー：なし（変更が小さく、要約の契約と受け箱の修正は互いに依らない。最終品質ゲートで全体を見る）
	- 最終品質ゲート：範囲 `4efd9cb..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。観点は既定に、security-baseline（CORS が SpecDock のオリジンだけ、Orca へは読むだけで連絡を既読にしない、秘密と会話の中身を出さない）を足す。second_opinion：none（standard）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "PR を戻せば要約の API がなくなり、受け箱の連絡の読みは `updated_at` の7日の絞り込みに、時刻は Orca の文字列に、一覧の画面は前のポーリングに戻る。状態の API、受け箱、木の API の形は元のまま。"
exit:     "最終品質ゲートが `4efd9cb..HEAD` で合格し、実機の確かめが report.md にあり、PR の CI が通ってマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-13）：Opus 5.5 / medium（方針の「タスク担当 × standard」から統括が選んだ）"}
		impl: {task: "要約の組み立てと API、受け箱の Run の選び方と時刻（S-01〜S-03。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：コーディングは Codex GPT-6.1 Sol / medium をなるべく使う。テストで確かめられるサーバー側のコード（方針 §2 の実装担当 × standard）。provider: codex"}
		ui: {task: "一覧の画面のポーリング（S-04。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面（HTML・CSS・画面の JavaScript）を変えるステップは Claude Opus 5.5 / medium。provider: claude"}
		doc: {task: "実機の確かめと文書（S-05。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実機の確かめは読むだけで、コードを変えない"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-05", model: "opus", effort: "medium"}
	}
}
