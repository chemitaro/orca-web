package spec

// 設計（Epic）。型 specdock/v1。

design: {
	"D-01": {
		title: "会話のログの API"
		text: """
			`GET /api/transcript?agent=…`（とページング）と、変化を受ける口（SSE など。サーバーが nativeChat.subscribe／agentSession.subscribe を購読する）。
			Orca の記録を、役割（利用者、エージェント、ツール）と本文と折り畳むツールに正規化し、思考は印も付けずに落とし、未対応の部分（画像、未知のブロックなど）にだけ「表示できない」の印を付ける。購読の口が Unix ソケットで使えないときは、末尾を短い間隔で読み直して差を送る（iss-00012 の調べ）。
			追記と置き換えを区別して送る。セッションの識別子と記録のパスは Orca が持つものを使い、ファイルの名前から作らない。
			"""
		satisfies: ["R-01", "F-05"]
	}
	"D-02": {
		title: "送信の3段（意図、確かめ、確定）"
		text: """
			`POST /api/send/intent` が最新の状態で宛先（runtime、worktree の識別子、タブ、leaf、端末の世代、provider のセッション）を固定し、
			本文の digest と宛先に結び付いた、短い期限（初期値 60秒）の使い捨ての確かめの票を返す。`POST /api/send/confirm` が票を受け、
			宛先の同一性、世代、本文、送れる状態を確かめ直し、変わっていれば 409 で確かめに戻す。必須の識別子が取れなければ送れない。
			"""
		satisfies: ["R-02", "F-01", "F-06"]
	}
	"D-03": {
		title: "送る経路のアダプター"
		text: """
			構造化 Chat は agentSession.send（clientOperationId、expectedRuntimeFence、payloadFingerprint）。端末のエージェントは、送る直前に宛先と
			書き込み先を確かめる内部の経路（terminal-agent-send-guard）を使い、本文の投入と送信の2段の部分的な成功を扱う。権限の確認待ちは拒む。
			どの組み合わせが保護つきで送れるかを機能の確かめで決め、確かめられない組み合わせは送信を止める。シェルへの代わりの送信はしない。
			"""
		satisfies: ["R-02", "F-02", "F-04"]
	}
	"D-04": {
		title: "送信の記録"
		text: """
			利用者の置き場（例：`~/Library/Application Support/orca-web/sends/`、権限 0600）に、送る前（操作の ID、宛先、本文、digest、時刻、世代）と
			送った後（結果の5つの区別、Orca の receipt）を追記する。送る前の記録に失敗したら送らない。結果不明は、`GET /api/send/{操作の ID}` で同じ操作の ID の状態を確かめるだけを許す（Orca の receipt か、構造化 Chat の clientOperationId で照会）。設定 `sendEnabled` が偽なら、送信の口はすべて拒み、画面は読むだけになる。
			"""
		satisfies: ["R-03", "F-03"]
	}
	"D-05": {
		title: "チャットの小窓と埋め込み"
		text: """
			`/embed/agent?id=…` の iframe の画面（詳細とチャット。描画は iss-00012 が持つ）。素の ES Modules。本文は textContent で描く。390px で詳細を広げられる。iframe の中で短期のトークンを得て、
			書き込みの守り（epic-00003）の下で送る。frame-ancestors で SpecDock のオリジンだけに埋め込みを許す。postMessage は対象の選択とテーマだけ。
			"""
		satisfies: ["R-01", "R-04", "F-06"]
	}
	"D-06": {
		title: "稼働の印の要約の API"
		text:  "`GET /api/worktrees/summary` が worktree ごとに、パス、ブランチ、エージェントの数と状態（working・blocked・waiting・done・スリープ）を返す。読み取りの CORS は SpecDock のオリジンだけ。"
		satisfies: ["R-04"]
	}
}

risks: [
	"端末のエージェントへの保護つきの送信が、Orca 1.4.251 でどこまで宛先の取り違えを防げるかは、iss の最初に検証用のセッションで確かめる。確かめられなければ、構造化 Chat だけ送れる形で出す",
	"nativeChat.subscribe は非公開の口。版が変わったら録画を取り直す",
]
