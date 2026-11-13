package spec

// 設計（Initiative）。型 specdock/v1。

goals: [
	"読む・開く・送るを、別の部品と別の安全の扱いにする",
	"Orca の更新に、機能ごとの確かめと縮退で備える",
]

current: "Orca の状態は CLI と Orca の画面でしか見られない。試作は Node の標準モジュールだけの1ファイル。"
target:  "orca-web が常駐し、SpecDock のダッシュボードが状態を描き、開くボタンとチャットを埋め込む。"

design: {
	"D-01": {
		title: "単一の常駐プロセス（Node.js と TypeScript）"
		text: """
			利用者の権限の LaunchAgent 1つに、HTTP の API と静的な画面、状態の集約と共有のキャッシュ、操作の確かめと記録、Orca のアダプターを置く。
			ブラウザーを Orca の口に直接つながない。別の `orca serve` は起動せず、デスクトップアプリのランタイムを使う。
			"""
		satisfies: ["R-08"]
	}
	"D-02": {
		title: "Orca のアダプター（CLI を基本に、足りない所だけ内部の口）"
		text: """
			CLI は絶対パス・引数の配列・管理した環境変数で呼び、ORCA_ENVIRONMENT と ORCA_PAIRING_CODE を引き継がない。
			内部の Unix ソケットの RPC（session.tabs.list／activate、worktree.activate、nativeChat.readSession など）はアダプターの中に閉じ込める。
			初めと再接続のときに、CLI の版、runtime の ID、`status` の capabilities、`agent-context` の必要なコマンドを確かめ、
			readState、openExistingTab、readTranscript、sendGuarded などの機能ごとに使えるかを決める。
			"""
		satisfies: ["F-01", "F-02"]
	}
	"D-03": {
		title: "状態の API"
		text: """
			repo、worktree、エージェント、オーケストレーションを集めて正規化した小さな JSON を返す。状態・時刻・親子・鮮度・取得元・欠けた理由を分けて持つ。
			モデルと推論は、値の意味（起動の要求、起動時の解決、現在の選択、最後の観測）を付ける。取得は共有のポーリング（表示中 5秒など）でまとめる。
			SpecDock の正確なオリジンにだけ読み取りの CORS を許す。
			"""
		satisfies: ["R-01", "R-02", "R-07", "F-01", "F-02"]
	}
	"D-04": {
		title: "開く口と、単独のボタンの部品"
		text: """
			開く口は既存のタブだけを選ぶ（動いている端末は CLI の terminal switch、ほかのタブは session.tabs.activate、タブがなければ worktree.activate）。
			navigation は host に固定する。新しいタブやファイルを作る代わりの経路は持たない。タイムアウトの後に別のタブへ切り替えない。
			ボタンの部品は、開く口を呼ぶだけの小さな iframe（またはそれを置く1行のスクリプト）として配り、チャットや状態の画面なしで使える。
			"""
		satisfies: ["R-03", "R-04", "F-02", "F-04"]
	}
	"D-05": {
		title: "チャットの小窓（ログと確認つきの送信）"
		text: """
			ログは Orca が持つ会話の記録（通常のエージェントは nativeChat.readSession／subscribe、構造化 Chat は agentSession.history）から読み、
			追記と置き換えを分けて扱う。端末の画面は診断用にとどめる。送信は、送る意図を作る→確かめを出す→確定のときに宛先・世代・本文を
			確かめ直す、の順にし、Orca の送る直前の保護の経路を使う。操作の ID・宛先・本文・結果を、送る前と後に記録する。
			"""
		satisfies: ["R-05", "R-06", "R-07", "F-03"]
	}
	"D-07": {
		title: "単独の画面（受け箱、木、プロジェクト）"
		text: """
			受け箱は、状態の API とオーケストレーションの連絡（統括あての question・decision_gate・worker_done を --peek で読む）と PR の checks から
			段を決める。木は Run・Task・worker を Run ごとに組み、節の worktree からプロジェクトの札を決める。画面は素の ES Modules。
			"""
		satisfies: ["R-09", "R-10"]
	}
	"D-08": {
		title: "SpecDock への3つの部品"
		text: """
			稼働の印は `GET /api/worktrees/summary`（worktree ごとのエージェントの数と状態）を SpecDock が読んで描く。開くボタンは `/embed/open-button`、
			詳細とチャットは `/embed/agent?id=…` の iframe。組み込みそのものは spec-dock の epic-00471・epic-00526 で行い、その前に利用者が確かめる。
			"""
		satisfies: ["R-07"]
	}
	"D-06": {
		title: "書き込みの守り"
		text: """
			127.0.0.1 と指定の Tailscale の IP だけにバインドし、Host を完全一致で確かめる。書き込みは POST と JSON と、iframe の中で同じオリジンから
			得る短期のトークンの独自ヘッダーを要し、Origin の完全一致を確かめる。iframe の埋め込みは frame-ancestors で SpecDock のオリジンだけを許す。
			任意の CLI や RPC を通す汎用のプロキシは作らない。
			"""
		satisfies: ["R-08", "F-04"]
	}
}

risks: [
	"内部の口は非公開で、Orca の更新で変わりうる。録画と再生のテストと、更新後の少数の実機の確かめで備える",
	"通常の CLI のタブへの送信で、送る直前の保護の経路がどこまで宛先の取り違えを防げるかは実機で確かめる。確かめられない組み合わせは送信を無効にする",
	"ふつうのエージェントのモデルと推論レベルが、実際に値として出るかは実機で確かめる",
]
