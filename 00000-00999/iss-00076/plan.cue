package spec

goal: "`/apexes` を開くと、頂点だけが対応が必要・作業中・完了（と畳んだ段）に並び、`GET /api/apexes` が同じ答えを返すことが、テストと常駐とは別のポートの試しの orca-web で確かめられている。"

steps: {
	"S-01": {
		status:   "done"
		title:    "頂点の一覧の純粋な関数と型（D-01〜D-04）"
		text:     "対象：新しい `src/apex/model.ts`・`src/apex/build.ts`、新しい `test/apex/build.test.ts`（状態の文書の仮の組み立ては `test/inbox/fixture.ts` を使うか、同じ形の小さな fixture を `test/apex/fixture.ts` に作る）。`src/inbox/classify.ts` は変えない（`agentMark`・`agentWorkingMode`・`findIssue` を import する）。確かめ：T-01〜T-06。完了：`npm run lint`、`npm test`、`npm run build` が通る。コミットして次へ"
		realizes: ["R-01", "R-02", "R-03", "R-04", "F-02"]
		session:  "impl"
	}
	"S-02": {
		status:   "done"
		title:    "API `GET /api/apexes`（D-05）"
		text:     "対象：`src/server/app.ts`（同じオリジンだけの道の組に足す）、新しい `test/server/apexes-api.test.ts`（既存の `test/server/` の受け箱・Run の API のテストの組み立てに倣う）。確かめ：T-07。完了：lint・test・build が通る。コミットして次へ"
		realizes: ["R-06", "F-01"]
		after:    ["S-01"]
		session:  "impl"
	}
	"S-03": {
		status:   "done"
		title:    "画面 `/apexes` とリンク（D-06）"
		text:     "対象：新しい `web/apexes.html`・`web/apexes.js`・`web/apexes-view.js`・`web/apexes-dom.js`、`web/style.css`（要るだけ）、`src/server/app.ts` の `STATIC_FILES`、受け箱・Run の一覧・状態の表の見出しのリンク（`web/index.html`、`web/runs.html`、`web/settings.html` などの見出しの nav だけ）、新しい `test/web/apexes-view.test.ts`・`test/web/apexes-dom.test.ts`（既存の `inbox-view`・`inbox-dom` のテストに倣う）、配るファイルの一覧を確かめる既存のテストがあれば更新。innerHTML を使わない。確かめ：T-08〜T-10。完了：lint・test・build が通る。実装担当 impl の最後の手順。止まって HEAD を報告する。区切りのレビュー：あり（cp1、開始のコミット..HEAD）"
		realizes: ["R-05", "R-07"]
		after:    ["S-02"]
		session:  "impl"
	}
	"S-04": {
		status:   "done"
		title:    "README・AGENTS.md と試しの orca-web での確かめ（タスク担当。D-07）"
		text:     "タスク担当が行う。README の画面と API の節、AGENTS.md の地図に追記する。別のポートで起動した試しの orca-web（この worktree のコード、送信は無効の既定のまま）で `GET /api/apexes` の集計（頂点・メンバー・結べないもの・段ごとの数、stale）と、ブラウザで `/apexes` が描けることを確かめ、report.md に集計だけを記録する（題名・パス・会話を書かない）。この Mac の負荷が高く Orca が timeout するときは、stale の帯が出ることの確かめとして記録する。確かめ：T-11。完了：lint・test・build が通り、report.md に結論がある"
		realizes: ["R-06"]
		after:    ["S-03"]
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "分け方：親・子・孫の木で、子（depth 1）と孫（depth 2）が頂点のメンバーになり、頂点が1件。単独のエージェントは配下 0 の頂点。数の合計がエージェントの数に一致", verifies: ["R-01"]}
	"T-02": {title: "結べないもの：parentPaneKey の親がない子（parent_missing）、worker があり親のない子（worker_without_parent）、2つが互いを親にする輪（cycle）が unlinked に出て、頂点にならない。parent_missing の根の子も parent_missing、輪にぶら下がる子も cycle。同じ paneKey が2つあるとき、その paneKey を親にする子は結べないもの", verifies: ["R-01"]}
	"T-03": {title: "状態：頂点 done・メンバー working → working（members_working）。頂点 waiting・メンバー working → needs_action（apex_waiting）。頂点 working かつ monitoring → working（monitoring）。頂点もメンバーも done → done（reasons done）。reasons は当てはまるものをすべて決めた順で並べ、等しさで確かめる。メンバーが working で頂点の state が null → working、tags に unverified", verifies: ["R-02"]}
	"T-04": {title: "メンバーの猶予：terminal attached のメンバーが blocked で stateStartedAt から 19 秒 → working（member_grace）、20 秒 → needs_action（member_blocked）、stateStartedAt なし → needs_action。terminal が awaiting-restore のメンバーの blocked は数えない。構造化 Chat のメンバーは terminal を問わない", verifies: ["R-02"]}
	"T-05": {title: "不明と古さ：state null・配下なしの頂点 → working・tags に unverified・counts.done に入らない。状態の文書の stale 真、または connection が unreachable → 一覧の stale 真", verifies: ["R-03"]}
	"T-06": {title: "段：最後の活動が 23 時間前の done → done_recent、25 時間前 → done_older、8 日前 → sleeping、terminal awaiting-restore → sleeping、needs_action は 8 日前でも needs_action。unverified だけで 25 時間前 → sleeping、23 時間前 → working。頂点が awaiting-restore でもメンバーが working → working の段。state null で awaiting-restore の頂点 → done（reasons sleeping）で sleeping、counts.done に入る。段の中は新しい順。文書に paneKey・terminalHandle・パスの文字列がない", verifies: ["R-04", "F-02"]}
	"T-07": {title: "API：GET が 200 と schema `orca-web.apexes/v1`、別のオリジンの Origin は 403、POST は 405、`?project=` で items と unlinked が絞られ counts が絞った後の数になり、513 字は 400、runs の部品がなければ 503 apexes_unavailable。CORS の見出しがない", verifies: ["R-06", "F-01"]}
	"T-08": {title: "view：段の並び（開く3つと畳む3つ）、見出しの数、理由の札の言葉、配下の数（配下 0 なら出さない）、stale の帯、行のリンク先 `/embed/agent?id=<id>`", verifies: ["R-05"]}
	"T-09": {title: "題名：対応が必要 2 → `(2) 指揮 — orca-web`、0 → `指揮 — orca-web`（view の純粋な関数で確かめる）", verifies: ["R-07"]}
	"T-10": {title: "dom：描いた木に innerHTML を使わず、リンクが `_blank`・`noopener noreferrer`。入口の apexes.js が visibilitychange で読みを止め、見えたら読み直す（既存の入口のテストと同じく、ソースの確かめか注入した口で）", verifies: ["R-05", "R-07"]}
	"T-11": {title: "試しの orca-web（実物の Orca を読むだけ）：`/api/apexes` の集計がエージェントの数の式（頂点＋メンバー＋結べない＝全体）を満たし、`/apexes` がブラウザで描ける", verifies: ["R-06"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門（coding-task の `## 関門`。CUE に専用の項目がないので、ここに書く）：
	- merge：agent
	- merge_permission：本人「ユーザーの許可なくマージする権限を付与します」（2026-11-25、利用者との Claude Code の会話。orca-web の PR を、最終品質ゲートと CI の合格を条件にエージェントがマージしてよいという許し。全文は公開しない）
	- 区切りのレビュー：cp1。最後の手順 S-03、範囲 `<開始のコミット>..<S-03 の HEAD>`、レビュアー code-reviewer（Opus 5.5 / medium、方針の standard）。理由：判定の規則と画面がまとまってから、文書の前に一度見る
	- 最終品質ゲート：範囲 `<開始のコミット>..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。PR の直前に `origin/main` を取り込んだときは、取り込んだ後のコミットでやり直す。追加の観点：privacy（文書に本文・パス・paneKey を出さない）、frontend-safety（innerHTML を足さない、リンクの rel）。second_opinion：none（standard の既定）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（report.md は Git の外で SpecDock が保存する）
	"""
rollback: "PR を戻せば、新しい道と画面がなくなるだけで、既存の画面と API は今のまま。"
exit:     "最終品質ゲートが合格し、試しの orca-web での確かめが report.md にあり、PR の CI が通り、merge.md の条件でエージェントがマージした状態。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。利用者との会話のセッション）", model: "opus", effort: "high", rationale: "利用者が会話で起動した Claude Code のセッションの値の記録（本人の指示 2026-11-25：Opus 5.5 を積極的に使う）"}
		impl: {task: "実装（S-01〜S-03。サーバーの純粋な関数・API と画面。Claude の実装担当、Orca の worker、この Issue の worktree）", model: "opus", effort: "medium", rationale: "provider: claude。本人の指示（2026-11-25：Codex の GPT-6.2 Sol・Astra を使わず Opus 5.5 を使う）。方針 §2 の実装担当（フロントエンドの設計と実装）standard の Opus 5.5 / medium。バックエンドの行の GPT-6.2 Sol は本人の指示で使えないので同じ値に置き換える"}
		doc: {task: "文書と試しの確かめ（S-04。タスク担当が自分で行う）", model: "opus", effort: "high", rationale: "方針 §2 の注記：文書を書く手順はタスク担当が書く"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。standard なので1人）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー（code-reviewer）", after: "S-03", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目なし）", after: "S-04", model: "opus", effort: "medium"}
	}
}
