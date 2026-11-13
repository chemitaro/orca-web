package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "読むだけ。段の誤りは表示で分かり、直せる"
}

purpose: "orca-web 単独の画面の入口として、利用者が答えるべきもの（許可待ち、入力待ち、統括あての質問と判断の依頼、マージ待ちの PR）を一目で知れる「要対応の受け箱」を出す。"

background: """
	親の epic-00016 の slice iss-00017（R-01、R-02、F-01、F-02）と、init-00002 の R-09 を受ける。
	決定の経緯：hearing-20261106.md の「最終の形の決定」と「設計案への回答」（2026-11-13、利用者）、画面案の案 B、設計案。
	項目から開く詳細とチャットは iss-00012 の `/embed/agent?id=…`。状態の読み取りは iss-00005〜iss-00008。
	"""

includes: [
	"受け箱の API `GET /api/inbox`（段の決め方、プロジェクトの絞り込み、連絡の読み取り）",
	"受け箱の画面（`/`）。今の一覧の表と項目の選択は `/settings` へ移す",
	"止まっているとみなす時間の設定（`ORCA_WEB_STALL_MINUTES`）",
]
excludes: [
	"オーケストレーションの木とプロジェクトの画面（iss-00018）",
	"送信、許可の承認、質問への返事（epic-00004 の iss-00013）。受け箱は Orca で開くへ案内するだけ",
	"SpecDock への組み込み",
	"状態の API（`orca-web.state/v1`）の形の変更",
]

requirements: {
	"R-01": {
		title: "受け箱が、エージェントと連絡を、要対応・止まっている・動いている・終わった（と不明）の段に分ける"
		text: """
			要対応：state が blocked（許可待ち）・waiting（入力待ち）のエージェント、統括あての未読の question・decision_gate の連絡と待っている判断の門、
			マージ待ちの PR（worker_done で成功を報告した作業者の worktree の、開いている PR）。
			止まっている：開いている PR の CI の失敗（マージ待ちの PR でも、CI が落ちていればこちら）、最後の出力から `ORCA_WEB_STALL_MINUTES`（既定 30）分以上たった working、終了した端末。
			動いている：working。終わった：done とスリープ（Orca が復元を待つ端末で、エージェントが動いていないもの）。終わった段は畳み、最後の一言を見せる。
			各項目に、プロジェクト、Issue（分かれば）、エージェントの種類、経過の時間、最後の一言を出し、詳細とチャット（`/embed/agent?id=…`）、
			Orca で開く（Mac だけ）、PR へ進める。
			オーケストレーションの連絡は `orca orchestration check --peek` で読み、既読にしない。Orca へは読む要求だけを送る。
			"""
		acceptance: [
			"録画した状態と連絡から、各段に期待どおりの項目が、期待どおりの理由とともに入る（テスト）",
			"実機で、許可待ちのエージェントと統括あての質問が要対応の段に出る",
			"受け箱を開いても、統括の連絡が既読にならない（実機で、開く前と後の未読の件数が同じ。テストで、`--peek` のない check と `--ack`・`--all` を送れない）",
		]
	}
	"R-02": {
		title: "受け箱をプロジェクトで絞り込め、PC とスマホで使える"
		text:  "プロジェクトは Orca の repo。絞り込みは URL（`?project=<repo の id>`）に残り、再読み込みしても保たれる。"
		acceptance: [
			"プロジェクトを選ぶと、その項目だけが出る（API と画面の両方。テスト）",
			"幅 390px で横にはみ出さずに読め、Orca で開くが出ない",
		]
	}
}

failures: {
	"F-01": {
		title: "Orca に届かない、連絡が読めないときは、最後に読めた内容を鮮度つきで示し、読めない部分を示す"
		text:  "状態と連絡の取得元ごとに、最後に読めた時刻と誤りを返し、画面に出す。連絡が一度も読めていなければ、質問の項目は「読めない」と示し、空とは示さない。"
	}
	"F-02": {
		title: "段を決める根拠が欠けたエージェントは、推測で要対応にせず「不明」として示す"
		text:  "state が取れない（スリープでない）、知らない state の値、または結び付く PR の状態が分からない項目は、不明の段に置き、欠けた根拠を示す。"
	}
}

constraints: [
	"実行時の依存を足さない。画面は素の ES Modules で、本文は textContent だけで描く",
	"Orca に送るのは読む要求だけ（`orchestration run-list`、`check --peek`、`gate-list` と、既存の読み取り）。統括の連絡を既読にしない",
	"`/api/inbox` は同じオリジンだけに読ませ、CORS を付けない（連絡の題名と最後の一言を含むため）",
	"状態の API（`orca-web.state/v1`）の文書に、最後の一言や連絡の中身を足さない",
	"記録、録画、ログに、会話や連絡の中身、authToken、個人の絶対パスを入れない。fixture は自分で作った仮の文だけ",
]

decisions: [
	"done のエージェントは「終わった」の段に畳み、最後の一言を見せる。質問はオーケストレーションの連絡で拾う（利用者、2026-11-13、hearing-20261106.md「設計案への回答」）",
	"連絡は `--peek` で読み、既読にしない。Orca の state は working・blocked・waiting・done。許可の承認はしない（Orca で開くへ案内）（統括の依頼書、2026-11-13）",
	"統括あての連絡は `orca orchestration check --peek --terminal run:<run の id>` で読む。Orca の端末の外（orca-web の常駐）から読める（タスク担当が 2026-11-13 に実機で確かめた。件数だけ）。`check --all` は使わない（他の統括の受け箱への送信として止められた。--peek だけにする）",
	"マージ待ちの PR は、連絡の既読・未読によらず、状態の API の worker（state が succeeded）と、同じ worktree の PR（state が open）から決める。未読の worker_done の本文にある PR の URL は、それに重ねるだけ（タスク担当、2026-11-13。worker_done を統括が読んだ後もマージまで要対応に残すため）",
	"最後の一言は、端末のタブの `agentStatus.lastAssistantMessage` を、受け箱の文書にだけ、短く切って出す。状態の API には出さない（タスク担当、2026-11-13。状態の API は SpecDock に CORS で読ませているため）",
	"今の一覧の表の画面は、項目の選択と一緒に `/settings` へ移す（epic-00016 の D-03）",
]

questions: []
