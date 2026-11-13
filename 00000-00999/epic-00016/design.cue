package spec

// 設計（Epic）。型 specdock/v1。

design: {
	"D-01": {
		title: "受け箱の API と段の決め方"
		text: """
			`GET /api/inbox?project=…` が、状態の API の集約（epic-00003）と、統括の Run の連絡（`orca orchestration check --peek` で読む。既読にしない）と、
			PR の checks から、項目と段を返す。段の決め方は純粋な関数にし、録画からテストする。30分の閾値は設定にする。
			"""
		satisfies: ["R-01", "F-01", "F-02"]
	}
	"D-02": {
		title: "木の API"
		text:  "`GET /api/runs` と `GET /api/runs/{id}/tree` が、Run・Task・worker を親子で組み、節ごとに worktree からプロジェクトを決め、統括のプロジェクトと違えば札を付ける。"
		satisfies: ["R-03", "R-04"]
	}
	"D-03": {
		title: "画面"
		text: """
			`/`（受け箱）、`/projects/{repo}`（プロジェクト）、`/runs/{id}`（木）。素の ES Modules。本文はテキストとして描く。390px で1列。
			項目から `/embed/agent?id=…`（iss-00012）の詳細を開く。今の一覧の表の画面は、項目の選択と一緒に設定の画面へ移す。
			"""
		satisfies: ["R-02", "R-04"]
	}
}
