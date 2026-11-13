package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "読むだけ。誤りは表示で分かり、直せる"
}

purpose: "orca-web 単独の画面に、Run ごとの「オーケストレーションの木」（統括と作業者の親子。プロジェクトをまたぐ節に札）と、「プロジェクトの画面」（そのプロジェクトの受け箱と、そこに節がある Run）を出し、利用者が体制を見られるようにする。"

background: """
	親の epic-00016 の slice iss-00018（R-03、R-04）と、init-00002 の R-10 を受ける。
	決定の経緯：hearing-20261106.md の「最終の形の決定」と「設計案への回答」（2026-11-13、利用者）、画面案の案 C、設計案（https://claude.ai/artifact/R4uRVUWgQeXsbTpet8Y9qu）。
	受け箱（`/api/inbox`、`/`）は iss-00017、項目から開く詳細とチャットは iss-00012 の `/embed/agent?id=…`、状態の読み取り（Run・Task・worker を含む）は iss-00005〜iss-00008。
	実機の観測（タスク担当、2026-11-13、読むだけ。件数だけ）：`orchestration run-list --full` の Run は `coordinator_handle`（今の統括の端末）を持つ。`task-list --full` の task は `parent_id` と `created_by_terminal_handle` を持つ。
	Run `run_b7c4f4c08bbc` で worker 89、そのうち task に `parent_id` のある入れ子の worker 5。入れ子の 5 件はすべて、`parent_id` の task の worker の端末が、子の task の `created_by_terminal_handle` と一致した。
	Run の統括は `run-use` で替わる（この Run は世代 6）ので、上の段の task の `created_by_terminal_handle` は今の `coordinator_handle` と一致しないことが多い（84 件のうち一致 10）。
	"""

includes: [
	"Run の一覧と木の API（`GET /api/runs`、`GET /api/runs/<id>/tree`）と、木を組む純粋な関数",
	"状態の読み取りへの、Run の統括の端末と、task を作った端末の追加（状態の文書へは項目の追加だけ）",
	"木の画面（`/runs/<id>`）、Run の一覧の画面（`/runs`）、プロジェクトの画面（`/projects/<repo の id>`）",
	"受け箱の画面から、プロジェクトの画面と Run の一覧へのリンク",
]
excludes: [
	"送信、許可の承認、返事（epic-00004 の iss-00013）",
	"SpecDock への組み込み、稼働の印の API",
	"受け箱の段の決め方（iss-00017）の変更",
	"状態の API（`orca-web.state/v1`）の既存の項目の意味や形の変更（項目の追加だけ）",
]

requirements: {
	"R-01": {
		title: "オーケストレーションの木が、Run ごとに統括と作業者の親子を1本の木で示す"
		text: """
			木の根は Run の今の統括（`coordinator_handle` の端末）。その下に、その Run の worker（Dispatch）を、task の親子（`parent_id`）に従って並べる。親の task のない worker は統括の子。
			各節に、役割（統括、作業者）、担当の Issue（分かれば）、task の題名、エージェントの種類、モデル（作業者は起動時の値）、推論、状態、経過、プロジェクトを出す。取れない値は「—」。
			作業者の worktree のプロジェクト（Orca の repo）が統括のプロジェクトと違えば、その節にプロジェクトの札を付け、木は分けない。
			オーケストレーションで起動していないエージェント（worker に結び付かないエージェント）は木に入れない。
			各節から、結び付くエージェントの詳細とチャット（`/embed/agent?id=…`）を開ける。
			"""
		acceptance: [
			"手書きの状態の文書（Run・Task・worker・エージェント・worktree・repo）から、期待どおりの親子、項目、札の木が組める（テスト）",
			"実機で、プロジェクトをまたぐ Run（spec-dock の統括と orca-web の作業者の Run `run_b7c4f4c08bbc`）が1本の木で出て、orca-web の節に札が付く",
		]
	}
	"R-02": {
		title: "プロジェクトの画面が、そのプロジェクトの受け箱と、そこに節がある Run を出す"
		text: """
			`/projects/<repo の id>` に、そのプロジェクトで絞った受け箱（iss-00017 の `/api/inbox?project=`）と、そのプロジェクトに節（統括か作業者）が1つでもある Run の一覧を出す。
			統括が別のプロジェクトにいる Run には「<統括のプロジェクト> の統括から」の札を付ける。統括のプロジェクトが分からなければ札の代わりに「統括のプロジェクト：—」と出す。
			各 Run から木の画面（`/runs/<id>`）へ進める。
			"""
		acceptance: [
			"手書きの状態の文書で、プロジェクトを選ぶと、そのプロジェクトに節が1つでもある Run が全部、ほかの Run は出ずに返り、統括が別のプロジェクトの Run に札の値が付く（テスト）",
			"実機で、orca-web のプロジェクトの画面に Run `run_b7c4f4c08bbc` が「spec-dock の統括から」（spec-dock の repo の表示名）の札つきで出る",
		]
	}
	"R-03": {
		title: "木とプロジェクトの画面が、PC とスマホで使え、鮮度を示す"
		text:  "幅 390px で横にはみ出さずに読める（木は字下げを浅くし、長い語は折り返す）。状態の文書の stale と、Orca に届くかを示し、API が読めなければ前の内容を残して「更新できない」と示す。本文はテキストとして描く。"
		acceptance: [
			"画面の組み立ての純粋な関数が、節の行、札、「—」、鮮度の文を作る（テスト）。`<script>` を含む題名が要素にならない（テスト）",
			"実機の画面で、1280px と 390px で横にはみ出さない",
		]
	}
}

failures: {
	"F-01": {
		title: "親の task や統括の端末が見つからないときは、推測で別の親にせず、統括の子に置いて示す"
		text:  "親の task に worker がない、親の task が読めない、または親子が輪になるときは、その worker を統括の直下に置き、節に「親が分からない」の印（`orphan`）を付ける。統括の端末が分からないときも根は作り、根の項目を「—」にする。"
	}
	"F-02": {
		title: "知らない Run の id と、形の正しくない id は、木を返さない"
		text:  "`/api/runs/<id>/tree` は、状態の文書にない Run の id に 404、形の正しくない id に 400 を返す。"
	}
}

constraints: [
	"実行時の依存を足さない。画面は素の ES Modules で、本文は textContent だけで描く",
	"Orca に送るのは読む要求だけ。読む要求も、既存の共有のポーリングの読みの中だけ（新しい Orca の命令を足さない。`run-list`、`task-list` の既存の読みから項目を足して拾う）",
	"`/api/runs` と `/api/runs/<id>/tree` は同じオリジンだけに読ませ、CORS を付けない（受け箱と同じ扱い）",
	"状態の API（`orca-web.state/v1`）は版を変えず、項目の追加だけ",
	"記録、録画、ログに、会話や連絡の中身、authToken、個人の絶対パスを入れない。fixture は自分で作った仮の文だけ",
]

decisions: [
	"木の単位は Run。作業者の worktree が統括と別のプロジェクトなら、その節に札を付け、木は分けない（利用者、2026-11-13、hearing-20261106.md「設計案への回答」）",
	"モデルは作業者の起動時の値、推論は Claude だけ、取れない値は「—」。オーケストレーションで起動していないエージェントは木に入れない。統括が別のプロジェクトにいる Run には「<プロジェクト> の統括から」の札（設計案、利用者が採用。統括の依頼書、2026-11-13）",
	"「推論は Claude だけ」の読み方：作業者の推論は起動時の値（Orca が `worker-show` の launch に記録した値。Codex の起動でも記録されていれば出す）を先に、なければエージェントの今の値（Claude の `providerSession.effort`）を出す。統括はエージェントの今の値だけ。どれもなければ「—」（タスク担当、2026-11-13。意味を保つ解釈：Orca から取れる値だけを出し、推測しない）",
	"木の根は Run の今の `coordinator_handle`。過去の統括（`run-use` の前の端末）は節にしない。親の task のない worker は、作った端末によらず今の統括の子にする（タスク担当、2026-11-13。実機で上の段の task の作り手の端末が今の統括と一致しないことを観測）",
	"入れ子の worker は、子の task の `parent_id` の task の worker の子にする。その task に worker が複数あれば、端末が子の task の `created_by_terminal_handle` と一致するものを、なければ状態の文書の `workers` の並びで最初のものを親にする（タスク担当、2026-11-13）",
	"プロジェクトは Orca の repo（受け箱と同じ）。節のプロジェクトは、作業者は worker の worktree、統括は統括の端末の worktree から決める（タスク担当、2026-11-13）",
	"API は `GET /api/runs`（一覧。`?project=`）と `GET /api/runs/<id>/tree`、画面は `/runs`、`/runs/<id>`、`/projects/<repo の id>`（epic-00016 の D-02、D-03。`/runs` の一覧はタスク担当が足した入口、2026-11-13）",
]

questions: []
