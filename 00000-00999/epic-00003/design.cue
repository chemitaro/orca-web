package spec

// 設計（Epic）。型 specdock/v1。

design: {
	"D-01": {
		title: "プロジェクトの形"
		text: """
			Node.js（LTS）と TypeScript。サーバーは `src/server/`、Orca のアダプターは `src/orca/`、画面は素の ES Modules で `web/`。
			テストは Node の標準のテストか vitest、lint は型の検査を含める。依存は少なくする。
			"""
		satisfies: ["R-06"]
	}
	"D-02": {
		title: "Orca のアダプターと機能の確かめ"
		text: """
			CLI は絶対パス、引数の配列、管理した環境変数（ORCA_ENVIRONMENT と ORCA_PAIRING_CODE を引き継がない）で呼ぶ。
			内部の RPC は orca-runtime.json の口に NDJSON の単発の要求で呼び、authToken はアダプターの外に出さない。
			初めと再接続のときに、CLI の版、runtime の ID、`orca status --json` の capabilities、`orca agent-context --json` の必要なコマンドを確かめ、
			readState、openExistingTab などの機能ごとに使えるかを決めて記録する。CLI と RPC の境界は差し替えられ、録画と再生でテストする。
			"""
		satisfies: ["F-01", "F-02"]
	}
	"D-03": {
		title: "状態の集約と API"
		text: """
			`GET /api/state` が、repo list、worktree list、worktree ps、terminal list、orchestration の run・task・worker を集めて正規化した JSON を返す。
			取得は共有のポーリング（表示中 5秒、オーケストレーション 10秒、repo 60秒、見る人がいなければ遅くする）で、要求をまとめる。
			項目の一覧は `GET /api/fields`、選択は `PUT /api/settings/fields`（書き込みの守りの下）で、設定はこの Mac の利用者の設定の置き場に持つ。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01"]
	}
	"D-04": {
		title: "開く口"
		text: """
			`POST /api/open` が worktree（とエージェント）を受け、最新の一覧で解決して既存のタブを選ぶ。新しいタブやファイルを作る代わりの経路を持たない。
			時間切れの後は結果を確かめ、確かめられなければ別のタブに切り替えずに返す。プロファイルの DB の直接の読み取りは既定にしない。
			"""
		satisfies: ["R-04", "F-02", "F-03"]
	}
	"D-05": {
		title: "単独のボタンの部品"
		text: """
			`/embed/open-button?worktree=…` の小さな iframe の画面（とそれを置く1行のスクリプト）。iframe の中で同じオリジンから短期のトークンを得て、開く口を呼ぶ。
			幅 390px 以下ではボタンを出さない。置き場の画面の見た目に合わせる最小の指定（大きさ、色の明暗）を受ける。
			"""
		satisfies: ["R-05"]
	}
	"D-06": {
		title: "書き込みの守りと待ち受け"
		text: """
			127.0.0.1 と設定した Tailscale の IP だけにバインドし、Host を完全一致で確かめる。書き込みは POST と JSON、独自ヘッダーの短期のトークン、
			Origin の完全一致を要する。読み取りの CORS は SpecDock の正確なオリジンだけ。frame-ancestors で SpecDock のオリジンだけに埋め込みを許す。
			launchd の利用者のサービスの定義を用意する。
			"""
		satisfies: ["R-03", "R-06", "F-04"]
	}
}

risks: [
	"内部の RPC は非公開。Orca の版が変わったら、録画を取り直し、実機の少数の確かめをする",
	"ふつうのエージェントのモデルと推論レベルが値として出るかは、iss-00005 で実機で確かめる",
]
