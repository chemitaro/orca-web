package spec

// 計画（Issue）。型 specdock/v1。

goal: "Run ごとのオーケストレーションの木と、プロジェクトの画面を出し、実機で、プロジェクトをまたぐ Run `run_b7c4f4c08bbc` が1本の木で出て orca-web の節に札が付くことを確かめる。"

// 開始のコミット：1cab6558fbfff6deeb7c9c4dbda973334bf77054（main と同じ。worktree iss-00018、ブランチ chemitaro/iss-00018）。
// 各手順はテスト先行（tdd）。fixture は自分で作った仮の文だけ。仕様の読み方に迷ったら、直さずにタスク担当に問う。

steps: {
	"S-01": {
		title:    "状態の読み取りと文書に、Run の統括の端末と worktree、task を作った端末を足す（D-01）"
		text:     "対象：`src/orca/read-state.ts`、`src/state/normalize.ts`、`src/state/model.ts`、（任意で `src/state/fields.ts`）、`test/orca/read-state.test.ts`、`test/state/`（fixture と expected）、`run-list` の命令を含む録画の fixture。確かめ：T-01。完了：`node --test test/orca/read-state.test.ts test/state/*.test.ts` と `npm run lint` が通り、既存の状態の項目の値が変わらない。区切りのレビュー：なし"
		realizes: ["R-01", "R-02", "F-01"]
		status:   "todo"
		session:  "impl-logic"
	}
	"S-02": {
		title:    "木と一覧を組む純粋な関数と文書の型（D-02）を作る"
		text:     "対象：`src/runs/model.ts`、`src/runs/tree.ts`、`src/inbox/classify.ts`（Issue の関数の export だけ）、`test/runs/tree.test.ts`、手書きの入力 `test/runs/fixture.ts`。確かめ：T-02、T-03、T-04、T-05、T-06。完了：`node --test test/runs/*.test.ts test/inbox/*.test.ts` と `npm run lint` が通る。区切りのレビュー：なし。この手順を終えたら止まって HEAD を報告する（セッション impl-logic の最後）"
		realizes: ["R-01", "R-02", "F-01"]
		after:    ["S-01"]
		status:   "todo"
		session:  "impl-logic"
	}
	"S-03": {
		title:    "`GET /api/runs` と `GET /api/runs/<id>/tree`、画面の道（D-03）を作る"
		text:     "対象：`src/server/app.ts`、`src/server/main.ts`、`test/server/`（新しい `runs-api.test.ts`）。画面の道は、中身が空でもよい仮の `web/run.html`・`web/runs.html`・`web/project.html` を置いて配り方だけを確かめる（中身は S-04）。確かめ：T-07、T-08。完了：`npm run lint`、`npm test`、`npm run build` が通る。ここで木と一覧の契約（`orca-web.run-tree/v1`、`orca-web.runs/v1`、同じオリジンの道）が決まり、画面（S-04）がそれに依るので、区切りのレビュー CP-1 の最後の手順。止まって HEAD を報告する（セッション impl の最後）"
		realizes: ["R-01", "R-02", "R-03", "F-02"]
		after:    ["S-02"]
		status:   "todo"
		session:  "impl"
	}
	"S-04": {
		title:    "木、一覧、プロジェクトの画面と、受け箱からのリンク（D-04）を作る"
		text:     "対象：`web/run.html`、`web/run.js`、`web/runs.html`、`web/runs.js`、`web/project.html`、`web/project.js`、`web/runs-view.js`、`web/runs-dom.js`、`web/inbox-view.js`（共有する関数の export だけ）、`web/index.html` と `web/inbox.js`（リンク）、`web/style.css`、`src/server/app.ts` の配るファイルの表、`test/web/`、`test/server/`。確かめ：T-09、T-10、T-11。完了：`npm run lint`、`npm test`、`npm run build` が通る。`npm start` を一時の port で起動して、広い幅と 390px で見る（Orca で開くは押さない）。区切りのレビュー：なし（最終品質ゲートで見る）。止まって HEAD を報告する"
		realizes: ["R-01", "R-02", "R-03"]
		after:    ["S-03"]
		status:   "todo"
		session:  "ui"
	}
	"S-05": {
		title:    "根の統括の決め方を、閉じた coordinator_handle のときに最近の依頼の端末へ直す（D-01、D-02 の S-04 の後の仕様の変更）"
		text:     "対象：`src/state/normalize.ts`、`src/state/model.ts`、`src/runs/tree.ts`、`src/runs/model.ts`、`web/runs-view.js`（根の行の添え書き）、`test/state/`、`test/runs/`、`test/web/runs-view.test.ts`。確かめ：T-13。完了：`npm run lint`、`npm test`、`npm run build` が通る。区切りのレビュー：なし（最終品質ゲートで見る）。止まって HEAD を報告する"
		realizes: ["R-01", "R-02", "F-01"]
		after:    ["S-04"]
		status:   "todo"
		session:  "impl-fix"
	}
	"S-06": {
		title:    "実機の確かめ（読むだけ）と、README.md、AGENTS.md、report.md を書く（D-05）"
		text:     "タスク担当が行う（文書の手順）。一時の port の `npm start` で `/api/runs/run_b7c4f4c08bbc/tree` と `/api/runs?project=<orca-web の repo の id>` を読み、節・札・orphan の数と、統括と札のプロジェクト名だけを report.md に書く。画面を 1280px と 390px で見る。`orca --version` を書く。確かめ：T-12。根の統括が `latest-task` で決まり、spec-dock の repo になることも確かめる。完了：report.md の Verification に実機の結論があり、README.md と AGENTS.md が出来上がったものと合う"
		realizes: ["R-01", "R-02", "R-03"]
		after:    ["S-05"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "`run-list` を `--full` 付きで呼び、その `coordinator_handle` と `task-list` の `created_by_terminal_handle` を拾い（なければ null）、RunState の `coordinatorWorktreeId` を terminals、なければ agents から決め、ハンドルが null なら not-provided、結べなければ not-linked、terminals が読めていなければ source-failed にする。既存の状態の項目の値は変わらない", verifies: ["R-01", "F-01"]}
	"T-02": {title: "統括を根に、親の task のない worker が統括の子、`parent_id` のある worker がその task の worker の子になり、親の候補が複数なら created_by の端末が一致するもの、なければ並びの最初が親になる。兄弟は task の createdAt の古い順（null は最後、同じなら dispatchId の順）", verifies: ["R-01"]}
	"T-03": {title: "節の項目：作業者のモデルは起動時の値（エージェントの今の値を使わない）、推論は起動時の値、なければエージェントの値。統括はエージェントの値。state は エージェント、スリープ、worker の順。取れない値は null。worker に結び付かないエージェントは節にならない。詳細のリンクは agentId を encodeURIComponent する", verifies: ["R-01"]}
	"T-04": {title: "作業者の project が統括の project と違えば otherProject が真、同じか、どちらかが分からなければ偽", verifies: ["R-01"]}
	"T-05": {title: "親の task に worker がない、worker の task が文書にない、親子が輪になる worker は、根の子で orphan が真。統括の端末が分からなくても根を作り、根の項目は null。知らない Run の id は null", verifies: ["F-01"]}
	"T-06": {title: "一覧：プロジェクトで絞ると、統括か作業者の節のどれかがそのプロジェクトの Run が全部、ほかは出ない。統括が別のプロジェクトなら fromOtherProject が統括のプロジェクト、同じか分からなければ null。projects の count、並び（active、latestTaskAt、id）、鮮度の写し", verifies: ["R-02"]}
	"T-07": {title: "`GET /api/runs` と `GET /api/runs/<id>/tree` が文書を返し、noteViewer を呼び、`?project=` で絞り、知らない id を 404、形の正しくない id と長すぎる project を 400、別のオリジンを 403、GET 以外を 405、runs がなければ 503 にし、CORS を付けない", verifies: ["R-01", "R-02", "F-02"]}
	"T-08": {title: "`/runs`、`/runs/<id>`、`/projects/<id>` が index と同じ CSP で HTML を配り、形の正しくない id の画面の道は 404", verifies: ["R-03"]}
	"T-09": {title: "画面の組み立て（runs-view.js）が、木の行（字下げの深さ、役割、Issue、題名、種類、モデル、推論、状態と経過の文、すべての節のプロジェクト名（null は「—」）、otherProject の札、orphan の印、詳細のリンク）と、null の「—」と、一覧の行と「<名前> の統括から」の札と、木と一覧の文書の平らな sources からの鮮度の文（連絡の取得元を出さない）を作る", verifies: ["R-01", "R-02", "R-03"]}
	"T-10": {title: "`<script>` を含む題名とプロジェクト名が DOM で要素にならない（textContent だけ）。リンクの href が `/runs/<encodeURIComponent(id)>` と `/embed/agent?id=…` だけ", verifies: ["R-03"]}
	"T-11": {title: "プロジェクトの画面が受け箱を `?project=` で、Run の一覧を `?project=` で読む URL を組む（純粋な関数）。受け箱の画面の見出しに `/runs` と、選んだプロジェクトの `/projects/<id>` のリンクが出る", verifies: ["R-02"]}
	"T-12": {title: "実機の確かめ：`run_b7c4f4c08bbc` が1本の木で出て、orca-web の節に札が付き、orca-web のプロジェクトの画面に spec-dock の統括からの札つきで出る。1280px と 390px で横にはみ出さない", verifies: ["R-01", "R-02", "R-03"]}
	"T-13": {title: "`coordinatorHandle` が terminals にあれば run、なければ親のない task のうち terminals にある作り手の最も新しいもの（createdAt、同じなら id の順で最後）で latest-task、どちらもなければ coordinatorHandle と null。terminals が読めていなければ coordinatorHandle と null。根のエージェントと coordinatorWorktreeId が activeCoordinatorHandle から決まり、木の文書の run に coordinatorResolvedBy が写り、画面の根の行に添え書きが出る", verifies: ["R-01", "R-02", "F-01"]}
}

verification: """
	各手順で、その手順のテストを手書きの入力と録画の再生で通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実機の確かめは読むだけで、件数と結論だけを report.md に書く。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：agent（統括がマージする）。merge_permission：本人が統括にマージを委任した（統括の依頼書、2026-11-13：「マージは統括が行う。本人が統括に委任した」）
	- 区切りのレビュー CP-1：最後の手順 S-03、範囲 `1cab655..<S-03 の後の HEAD>`、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）。理由：木と一覧の契約（`orca-web.run-tree/v1`、`orca-web.runs/v1`、同じオリジンの道）と親子の規則が S-03 までで決まり、画面（S-04）がそれに依る
	- 最終品質ゲート：範囲 `1cab655..HEAD` の全体（`src/`、`web/`、`test/`、`package.json`、`README.md`、`AGENTS.md`）。観点は既定に、security-baseline（XSS、同じオリジン、Orca へは読むだけ、秘密を出さない）を足す。second_opinion：none（standard）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "PR を戻せば、木、一覧、プロジェクトの画面と API がなくなる。状態の API の足した項目もなくなるが、既存の項目と受け箱、開く口、会話の API は元のまま動く。"
exit:     "CP-1 が `1cab655..<S-03 の後の HEAD>` で、最終品質ゲートが `1cab655..HEAD` で合格し、実機の確かめが report.md にあり、PR の CI が通ってマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-13）：Opus 5.5 / medium（方針の「タスク担当 × standard」から統括が選んだ）"}
		"impl-logic": {task: "状態の項目の追加と、木と一覧を組む規則（S-01〜S-02。Codex の実装担当、Orca の worker）", model: "gpt-6-astra", effort: "high", rationale: "本人の指示（2026-11-13、統括の依頼書）：Run・Task・worker から木を組む規則のような難しいロジックのステップは、理由を書いて GPT-6 Astra / high にしてよい。理由：親の選び方（created_by の一致、並びの最初）、輪と欠けた親の orphan、札の判定、一覧の絞り込みと並びが込み入り、純粋な関数で網羅のテストが要る。S-01 は S-02 の入力を作る小さな手順なので同じセッションにまとめる。provider: codex"}
		impl: {task: "API と画面の道（S-03。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：API・サーバー側のテストで確かめられるコードは GPT-6.1 Sol / medium。provider: codex"}
		ui: {task: "画面（S-04。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分（HTML・CSS・画面の JavaScript）は Opus 5.5 / medium。provider: claude"}
		"impl-fix": {task: "根の統括の決め方の修正（S-05。Codex の実装担当、Orca の worker）", model: "gpt-6-astra", effort: "high", rationale: "本人の指示（2026-11-13、統括の依頼書）：Run・Task・worker から木を組む規則のステップは理由を書いて GPT-6 Astra / high にしてよい。理由：S-01〜S-02 と同じ規則の変更（統括の端末の解決と木の根の結び付け）で、端末の有無と task の並びの組み合わせを網羅して確かめる。provider: codex"}
		doc: {task: "実機の確かめと文書（S-06。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実機の確かめは読むだけで、コードを変えない"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		code: {role: "区切りのレビュー CP-1（code-reviewer）", after: "S-03", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-06", model: "opus", effort: "medium"}
	}
}
