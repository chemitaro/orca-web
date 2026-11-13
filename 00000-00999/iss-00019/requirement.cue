package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "読むだけ。誤りは表示で分かり、直せる"
}

purpose: "SpecDock の構造の図が worktree ごとにエージェントの稼働の印（丸と少しの文字）を描けるよう、worktree ごとのエージェントの数と状態を返す小さな読み取りの API `GET /api/worktrees/summary` を出し、SpecDock のオリジンにだけ読ませる。あわせて、前の Issue の残り（受け箱の連絡の読み落とし、時刻の形、一覧の画面のポーリングの重複）を直す。"

background: """
	親の epic-00004 の slice iss-00019（R-04 の (2)、D-06）と、init-00002 の R-07 の (1)（SpecDock に渡すのは稼働の印、開くボタン、詳細と会話の iframe の3つ）を受ける。
	SpecDock 側の受け手は spec-dock の epic-00471（構造の図に稼働を重ねる。Scope と worktree の対応は SpecDock が決める。エージェントが作業を終えてからの待ち時間を数え上げで示したい）と epic-00526（詳細とチャットの iframe）。
	読み取りの CORS は iss-00006 の `ORCA_WEB_READ_ORIGINS`（既定 `http://127.0.0.1:47800`、Tailscale の IP があればその `:47800` を足す）がすでにある。
	受け箱の段の決め方（iss-00017 の `buildInbox`）は、エージェントの状態 working・blocked・waiting・done と、状態がなく端末が `awaiting-restore` のスリープを使う。
	合わせて直すこと（統括の依頼書、2026-11-13）：
	(1) 受け箱の連絡の読み取りは Run を `updated_at` が7日以内のものに絞る。iss-00018 の時点で `run_b7c4f4c08bbc` の `updated_at` は worker を起動しても 11-05 のまま進まなかった（タスク担当が 2026-11-14 に読んだときは 11-13 に進んでいた。Orca が `updated_at` を進める契機は分からない）。動いている Run の連絡を読み落とさない絞り方にする。
	(2) 連絡と判断の関門の `createdAt` は Orca の文字列をそのまま写すので、SQLite の形（`YYYY-MM-DD HH:MM:SS`）が混じる（iss-00017 の最終品質ゲートの P2）。
	(3) Run の一覧の画面（`web/runs.js`）は、読みの途中にプロジェクトを選び直すと、読みの終わりごとに次の読みを予約するので、ポーリングの輪が2重になる（iss-00018 の最終品質ゲートの P3）。
	"""

includes: [
	"稼働の印の要約の文書 `orca-web.worktree-summary/v1` を組む純粋な関数と、`GET /api/worktrees/summary`（SpecDock のオリジンへの読み取りの CORS）",
	"受け箱の連絡を読む Run の選び方の修正（共有のポーリング）",
	"連絡と判断の関門の `createdAt` の ISO 8601 への正規化",
	"Run の一覧の画面のポーリングの重複の修正",
	"README.md と AGENTS.md の更新",
]
excludes: [
	"SpecDock 側の描画と、Scope と worktree の対応（spec-dock の epic-00471。SpecDock のリポジトリは変えない）",
	"SpecDock のオリジンの試しの画面（epic-00004 の iss-00014）",
	"状態の API（`orca-web.state/v1`）の項目と意味の変更",
	"受け箱の段の決め方（iss-00017）の変更",
	"Orca への新しい命令（読む命令も含む）",
]

requirements: {
	"R-01": {
		title: "要約の API が、worktree ごとにエージェントの数と状態を、SpecDock が描ける小さな JSON で返す"
		text: """
			`GET /api/worktrees/summary` は、エージェントが1つ以上いる worktree ごとに、worktree の id、パス、ブランチ、プロジェクト（Orca の repo の id と表示名）、Issue（分かれば）、エージェントの一覧、状態ごとの数を返す。
			エージェントごとに、id、状態（`working`・`blocked`・`waiting`・`done`・`sleeping`・`unknown` のどれか）、種類、その状態になった時刻、詳細とチャットの画面への道（`/embed/agent?id=…`）を返す。
			状態の決め方は受け箱（iss-00017）と同じ：Orca の状態が working・blocked・waiting・done ならそれ。状態がなく端末が `awaiting-restore` なら `sleeping`。ほかは `unknown`。
			会話や連絡の本文、プロンプト、タブの題名、最後の一言は返さない。
			文書は、状態の文書と同じ鮮度（`stale`、Orca に届くか）を持つ。
			"""
		acceptance: [
			"手書きの状態の文書から、期待どおりの worktree、エージェント、状態、数の文書が組める。エージェントのいない worktree は出ない（テスト）",
			"実機で、この Mac の Orca の worktree ごとの数と状態が返り、状態の API のエージェントの数と合う",
		]
	}
	"R-02": {
		title: "要約の API は、SpecDock のオリジンと自分のオリジンにだけ読ませる"
		text: """
			読み取りの CORS は、状態の API と同じ設定 `ORCA_WEB_READ_ORIGINS`（既定 `http://127.0.0.1:47800`、`ORCA_WEB_TAILSCALE_IP` があればその `:47800` も）の正確なオリジンにだけ付ける。
			Origin がない、または自分のオリジンなら CORS を付けずに読ませる。ほかのオリジンは 403。GET と OPTIONS のほかは 405。Host の確かめはほかの道と同じ。
			"""
		acceptance: [
			"許したオリジンの GET と OPTIONS に `Access-Control-Allow-Origin` とそのオリジン、`Vary: Origin` が付き、ポートやスキームだけ違うオリジンは 403（テスト）",
			"実機の一時の起動で、`Origin: http://127.0.0.1:47800` の GET が通り、ほかのオリジンが 403 になる",
		]
	}
	"R-03": {
		title: "受け箱は、動いている Run の統括あての連絡を読み落とさない"
		text: """
			受け箱のために連絡と関門を読む Run は、`updated_at` が7日以内の Run に加えて、生きている worker（`needsLaunch` が真の worker）がいる Run、今の統括の端末（状態の文書の `activeCoordinatorHandle`）が今ある端末の Run、task の作成か完了が7日以内の Run も含める。
			読む Run の数の上限（50）は変えず、上限を超えるときは、生きている worker か今ある統括の端末のある Run を先に、次に新しい順に選ぶ。
			読みは今までどおり `--peek` で、既読にしない。
			"""
		acceptance: [
			"`updated_at` が8日前でも、生きている worker がいる Run、今ある統括の端末の Run、task が7日以内に作られた Run の連絡が読まれる。どれにも当たらない古い Run は読まれない（テスト）",
			"上限を超えるとき、生きている Run が古い順でも先に選ばれる（テスト）",
			"実機の読むだけの確かめで、今の Orca の Run・worker・状態の文書を `selectMailRuns` に通すと `run_b7c4f4c08bbc` が選ばれ、その選ばれた理由（生きている worker、今ある統括の端末、最近の task、`updated_at` のどれが当たったか）を示せる。あわせて、`updated_at` を8日前に置き換えた同じ入力でも選ばれる（旧来の7日の絞り込みでは落ちる）。その Run の連絡を `--peek` で読んだ件数を記録する（0 件でもよい。中身は記録しない）",
		]
	}
	"R-04": {
		title: "連絡と判断の関門の時刻は ISO 8601 の UTC にそろう"
		text: "連絡の `createdAt` と判断の関門の `createdAt` を、状態の文書の時刻と同じ規則（`isoFromText`：SQLite の `YYYY-MM-DD HH:MM:SS` は UTC とみなす）で `toISOString()` の形にする。解けない値は null にする。"
		acceptance: ["SQLite の形、`Z` 付きの形、オフセット付きの形が ISO 8601 の UTC に、解けない値が null になる（テスト）"]
	}
	"R-05": {
		title: "Run の一覧の画面は、プロジェクトを選び直してもポーリングの輪を1本に保つ"
		text: "読みの途中にプロジェクトを選び直しても、次の読みの予約はいつも1つだけ。古い選択の結果では描かない（今の挙動を保つ）。"
		acceptance: ["読みの途中に選び直したとき、読みが終わった後の予約が1つだけになる（テスト）"]
	}
}

failures: {
	"F-01": {
		title: "Orca に届かない、または状態が読めないときも、要約は形を保ち、古いことを示す"
		text:  "共有のポーリングの文書が古い（`stale`）か Orca に届かないときは、最後に読めた内容から組んだ要約に `stale: true` と接続の状態を付けて 200 で返す。一度も読めていなければ worktree の一覧は空。ポーリングがなければ 503。"
	}
	"F-02": {
		title: "知らない状態の値と、結び付かない worktree を推測で埋めない"
		text:  "Orca の知らない状態の値は `unknown` に数える。エージェントの worktree が状態の文書の worktrees にないときは、パス、ブランチ、プロジェクトを null にして、その worktree の id で出す。"
	}
}

constraints: [
	"実行時の依存を足さない",
	"Orca に送るのは読む要求だけで、既存の共有のポーリングの読みの中だけ（新しい Orca の命令を足さない）。受け箱の連絡の読みは `--peek` のまま、既読にしない",
	"状態の API（`orca-web.state/v1`）は変えない。要約は状態の文書から組む別の文書",
	"記録、録画、ログに、会話や連絡の中身、authToken、個人の絶対パスを入れない。fixture は自分で作った仮の文だけ",
]

decisions: [
	"読み取りの CORS は SpecDock のオリジンだけ。SpecDock のダッシュボードは手元の 127.0.0.1:47800 と tailnet の同じポート（統括の依頼書、2026-11-13）。設定は既存の `ORCA_WEB_READ_ORIGINS` と `ORCA_WEB_TAILSCALE_IP` を使い、新しい環境変数を足さない（タスク担当、2026-11-14）",
	"状態は working・blocked・waiting・done・スリープ（統括の依頼書、2026-11-13、epic-00004 の D-06）。どれにも当たらない値は `unknown` に数え、推測しない（タスク担当、2026-11-14）",
	"道は `GET /api/worktrees/summary`、文書の版は `orca-web.worktree-summary/v1`（epic-00004 の D-06。版の名前はタスク担当、2026-11-14）",
	"エージェントのいない worktree は返さない（小さな JSON にする。SpecDock は、返らない worktree に印を描かない）。絞り込みの引数は持たない（タスク担当、2026-11-14）",
	"エージェントごとに状態になった時刻（`since`）を返す。SpecDock の epic-00471 の「終えてからの待ち時間」の起点に使える（タスク担当、2026-11-14）",
	"状態の決め方は受け箱の決め方と同じ1つの関数にまとめる（受け箱の段の結果は変えない。タスク担当、2026-11-14）",
	"受け箱の連絡を読む Run の選び方：未読があるかは Orca に問わずには分からないので、生きている worker、今ある統括の端末、最近の task で「動いている」を判定する（タスク担当、2026-11-14。新しい Orca の命令を足さない制約から）",
]

questions: []
