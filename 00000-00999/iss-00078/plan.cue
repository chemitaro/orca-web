package spec

goal: "頂点に閉じた子を含む配下が結ばれ、問い・止まった仕事・失敗・統括のタブの閉じが対応が必要として出て、完了に残りの札が付くことが、テストと試しの orca-web の集計で確かめられている。"

steps: {
	"S-01": {
		title:    "読む項目の追加と内部の値（D-01）"
		text:     "対象：`src/orca/read-state.ts`（pick の追加だけ）、新しい `src/apex/extras.ts`、`src/state/poller.ts`（`snapshot()` は変えず、内部の値を同じ世代で返す口を足す）、録画の fixture（既存の録画に項目があれば使い、なければ仮の値を足した小さな fixture を `test/apex/` に）、テスト。`/api/state` の JSON に新しい鍵が出ないテストを足す。確かめ：T-01、T-02。完了：`npm run lint`、`npm test`、`npm run build`。コミットして次へ"
		realizes: ["R-01"]
		session:  "impl"
	}
	"S-02": {
		title:    "束と対応表（D-02）"
		text:     "対象：新しい `src/apex/bundles.ts`・`src/apex/owners.ts`、`src/apex/build.ts`（引数の追加）、テスト。確かめ：T-03〜T-05。完了：lint・test・build。コミットして次へ"
		realizes: ["R-02", "F-01"]
		after:    ["S-01"]
		session:  "impl"
	}
	"S-03": {
		title:    "判定 A3〜A6 と札・結べない束（D-03、D-04）"
		text:     "対象：`src/apex/build.ts`・`src/apex/model.ts`、テスト。確かめ：T-06〜T-10。完了：lint・test・build。コミットして次へ"
		realizes: ["R-03", "R-04", "R-05", "R-06", "F-02"]
		after:    ["S-02"]
		session:  "impl"
	}
	"S-04": {
		title:    "API の接続と画面（D-01 の口、D-05）"
		text:     "対象：`src/server/app.ts`（`/api/apexes` が内部の値と対応表を渡す。対応表は app の生存の間1つ）、`web/apexes-view.js`・`web/apexes-dom.js`、テスト。確かめ：T-11。完了：lint・test・build。実装担当 impl の最後の手順。止まって HEAD を報告する。区切りのレビュー：あり（cp1、開始のコミット..HEAD）"
		realizes: ["R-07"]
		after:    ["S-03"]
		session:  "impl"
	}
	"S-05": {
		title:    "README・AGENTS.md と試しの orca-web での集計（タスク担当）"
		text:     "タスク担当が行う。README と AGENTS.md の `src/apex/` の節を直す。別のポートの試しの orca-web で `/api/apexes` を読み、頂点に結べた束の数、閉じた子を含む配下の数、理由ごとの頂点の数、結べない束の数、端末の統括の `created_by_pane_key` と頂点の paneKey の一致の数を集計し、report.md に記録する（題名・パス・会話を書かない）。確かめ：T-12。完了：lint・test・build が通り、report.md に結論がある"
		realizes: ["R-02", "R-07"]
		after:    ["S-04"]
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "pick：run の consumer_generation、task の created_by_pane_key・created_by_run_generation、worker の workerState・projection.attention.categories を拾う。形が違えば null・空の配列", verifies: ["R-01"]}
	"T-02": {title: "`/api/state` の JSON に consumerGeneration・createdByPaneKey・attentionCategories などの新しい鍵がない（今の文書の鍵の集合が変わらない）", verifies: ["R-01"]}
	"T-03": {title: "端末の統括：根の task の createdByPaneKey が頂点の paneKey と一致する束の Dispatch（タブのないものを含む）が頂点の counts.total に入る", verifies: ["R-02"]}
	"T-04": {title: "構造化 Chat：メンバーのタブのある文書で一度 build した後、そのメンバーの消えた文書でも、同じ BundleOwners で束が頂点に結ばれる。新しい BundleOwners では結べない束になる", verifies: ["R-02"]}
	"T-05": {title: "BundleOwners の掃除：頂点が2回続けて消えると捨てる（1回では残る）、束の task がすべて終わり 24 時間で捨てる、1,001 件目で最も古いものを捨てる。consumerGeneration が 2 の Run で、世代 1 の束の生きた Dispatch は世代 2 の束の頂点に数えられる", verifies: ["F-01", "R-02"]}
	"T-06": {title: "A3：attention input の Dispatch と done の頂点で、89 秒は作業中（grace）、90 秒で needs_action（question）。approval（gate）は頂点が monitoring でも 90 秒で decision、input は monitoring の間は作業中", verifies: ["R-03"]}
	"T-07": {title: "A4・A5：生きた Dispatch があり誰も動いていない 90 秒で stalled。頂点の terminal が awaiting-restore で生きた仕事がある → apex_closed。生きた仕事のない awaiting-restore は眠っている", verifies: ["R-03"]}
	"T-08": {title: "A6：頂点の stateStartedAt より後の completedAt の failed は 90 秒で failed、前の failed は当たらない。dispatchStatus が failed でも workerState が stopped なら当たらない", verifies: ["R-03"]}
	"T-09": {title: "鮮度：sources.tasks か sources.workers が stale なら A3〜A6 に当たらない（A1・A2 は当たる）", verifies: ["F-02", "R-03"]}
	"T-10": {title: "放置と札：ready・blocked の task だけの束の done の頂点は完了で remaining_tasks が付く。PR open・CI failure で ci_failed、CI success で merge_pending、failed の Dispatch で failed_members。終わった Dispatch だけの結べない束は unlinked に出ず、生きた Dispatch のある結べない束は出る", verifies: ["R-04", "R-05", "R-06"]}
	"T-11": {title: "画面：新しい理由と札の言葉が行に出る。結べない束の行が `/runs/<id>` にリンクする。配下の数が束の Dispatch を含む", verifies: ["R-07"]}
	"T-12": {title: "試しの orca-web（実物の Orca を読むだけ）：集計が report.md にある", verifies: ["R-02", "R-07"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す（Node 24）。
	関門：
	- merge：agent
	- merge_permission：本人「ユーザーの許可なくマージする権限を付与します」（2026-11-25、利用者との Claude Code の会話。orca-web の PR を、最終品質ゲートと CI の合格を条件にエージェントがマージしてよいという許し。全文は公開しない）
	- 区切りのレビュー：cp1。最後の手順 S-04、範囲 `<開始のコミット>..<S-04 の HEAD>`、code-reviewer（Opus 5.5 / medium）を規約と仕様の2人
	- 最終品質ゲート：範囲 `<開始のコミット>..HEAD`。追加の観点：compatibility-regression（`/api/state` の形を変えない）、reliability-recovery（読めないときに鳴らさない、メモリの掃除）。second_opinion：none
	- test_commands：`npm run lint`、`npm test`、`npm run build`
	- record_paths：なし
	"""
rollback: "PR を戻せば、頂点の一覧は生きた辺と A1・A2 だけに戻る。メモリの対応表は再起動で消える。"
exit:     "最終品質ゲートが合格し、試しの集計が report.md にあり、PR の CI が通り、merge.md の条件でエージェントがマージした状態。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。利用者との会話のセッション）", model: "opus", effort: "high", rationale: "利用者が会話で起動した Claude Code のセッションの値の記録"}
		impl: {task: "実装（S-01〜S-04。Claude の実装担当、Orca の worker、この Issue の worktree）", model: "opus", effort: "medium", rationale: "provider: claude。本人の指示（2026-11-25：Codex を使わず Opus 5.5）。方針 §2 の実装担当 standard"}
		doc: {task: "文書と試しの集計（S-05。タスク担当）", model: "opus", effort: "high", rationale: "方針 §2 の注記"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー（code-reviewer）", after: "S-04", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-05", model: "opus", effort: "medium"}
	}
}
