package spec

// 設計（Epic）。型 specdock/v1。

goals: [
	"判定と結びは状態の文書から作る純粋な関数の1か所（新しい `src/apex/`）に置き、画面・通知・Run の木が同じ答えを使う",
	"今ある部品（`/embed/agent`、承認のカード、送信の門、稼働の印、経過の表記）を組み、二重に持たない",
]

current: "受け箱（`src/inbox/classify.ts`）、Run の木（`src/runs/tree.ts`・`links.ts`）、要約（`src/summary/build.ts`）がそれぞれ親子を決め、規則が3通りある。どれも統括の done と作業者の done を区別しない。"

target: "`src/apex/` が頂点の一覧の文書 `orca-web.apexes/v1` を作り、`GET /api/apexes`（同じオリジンだけ）で配る。指揮の画面は2ペイン（左に頂点の一覧、右に対応のカード・チームの帯・会話の枠）。"

compatibility: "`orca-web.state/v1`、`/embed/*`、`/api/worktrees/summary` は変えない。受け箱・Run の一覧と木・状態の表は残す（`/` だけ最後の段で入れ替える）。"

design: {
	"D-01": {
		title:     "頂点の一覧の純粋な関数と文書"
		text:      "`buildApexList(state, now, options)` が、頂点、メンバーの木、3つの状態、理由の札、畳む段を返す。状態の決め方は受け箱の `agentMark` を使う。"
		satisfies: ["R-01", "R-02", "R-03", "R-06"]
	}
	"D-02": {
		title:     "結びの部品"
		text:      "生きた辺、Run の世代、task の作成者の3段。構造化 Chat の対応表はメモリだけ。"
		satisfies: ["R-04", "F-01"]
	}
	"D-03": {
		title:     "対応の判定（A1〜A6）"
		text:      "鮮度とデータの時刻から測る猶予（G=90 秒、メンバーの許可待ちは 20 秒）。"
		satisfies: ["R-02", "R-05", "F-04"]
	}
	"D-04": {
		title:     "指揮の画面（2ペイン）と会話の枠"
		text:      "頂点を選ぶたびに `/embed/agent` の iframe の要素を作り直す。`frame-ancestors 'self'` は embed の画面だけに足す。"
		satisfies: ["R-07", "R-11", "F-02", "F-03"]
	}
	"D-05": {
		title:     "チームの帯と履歴の帯"
		satisfies: ["R-08"]
	}
	"D-06": {
		title:     "対応のカード"
		text:      "メンバーの承認は同じ枠で `/embed/agent?id=<メンバー>&compose=off`。質問・判断は postMessage で決めた型の下書き。"
		satisfies: ["R-09", "F-02"]
	}
	"D-07": {
		title:     "気づかせ方"
		text:      "題名の件数、静的な favicon、Web Notification（127.0.0.1 だけ、ボタンで許可）。SSE は足さずポーリング。"
		satisfies: ["R-10", "F-04"]
	}
}

risks: [
	"構造化 Chat の統括は、最後の子が閉じた後に orca-web を再起動すると結び直せない（Orca が統括の識別子を出さない）。「結べない仕事」に出し、Orca に要望する",
	"この Mac は負荷が高い時間があり、Orca の CLI が timeout する。鮮度の札と、完了へ動かさない規則で受ける",
]
