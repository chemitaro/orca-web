package spec

// 計画（Issue）。型 specdock/v1。

goal: "前の Issue の残り（FQG-001〜003）→待ち受けの組み立て→常駐の定義とスクリプト→文書→実機の受け入れの順に、テスト先行で作り、PR をマージできる状態で止める。"

steps: {
	"S-01": {title: "FQG-001：CLI の誤りの文から stdout を外す", realizes: ["R-05"], status: "done", session: "impl"}
	"S-02": {title: "FQG-002：録画の検査の配列の規則を、仮名を含む要素に限る", realizes: ["R-06"], status: "done", session: "impl"}
	"S-03": {title: "FQG-003：`/api/state` の noteViewer の配線のテストを足す", realizes: ["R-07"], status: "done", session: "impl"}
	"S-04": {title: "待ち受けの組み立て（listen.ts）、`/api/health` の待ち受けの状態、main.ts の終わりのシグナル", realizes: ["R-02", "R-03", "F-01", "F-04"], status: "done", session: "impl"}
	"S-05": {title: "LaunchAgent の定義の組み立てと ServiceManager、命令の入口、package.json の命令", realizes: ["R-01", "R-03", "F-02", "F-03"], status: "done", after: ["S-04"], session: "impl"}
	"S-06": {title: "README と AGENTS.md を書く", realizes: ["R-04", "R-08"], status: "done", after: ["S-05"], session: "impl"}
	"S-07": {title: "実機の受け入れ（一時の起動、ブラウザー、Codex は統括に頼む）と、`--dry-run` の定義の `plutil -lint`。report.md に書く", realizes: ["R-01", "R-02", "R-09"], status: "done", after: ["S-05"], session: "impl"}
	"S-08": {title: "コードのレビュー、最終品質ゲート、PR の作成と CI の確かめ", realizes: ["R-01", "R-02"], status: "doing", after: ["S-06", "S-07"], session: "impl"}
}

tests: {
	"T-01": {title: "OrcaCli の json・document・version が、JSON でない stdout と非ゼロの終了で、stdout を含まない誤りの文を返し、状態の API の取得元の誤りと開く口の応答にも出ない", verifies: ["R-05"]}
	"T-02": {title: "isSafeString が語の並びの配列を安全とせず、仮名化で text-N になり、仮名の配列と空の配列は残り、既存の録画が検査を通る", verifies: ["R-06"]}
	"T-03": {title: "GET /api/state で noteViewer が1回呼ばれ、/api/fields、OPTIONS、拒んだ Origin では呼ばれない", verifies: ["R-07"]}
	"T-04": {title: "startListeners が、偽の server で、127.0.0.1 と Tailscale の IP の2つだけ（なければ 127.0.0.1 だけ）にアドレスつきで listen する", verifies: ["R-02"]}
	"T-05": {title: "startListeners が、本物の server で、待ち受けられない 192.0.2.1 を retrying にして 127.0.0.1 で答えてログは1行、偽の server で、試し直しで listening になるとログに1行、close で時計が止まる", verifies: ["R-03", "F-04"]}
	"T-06": {title: "startListeners が、127.0.0.1 の待ち受けの失敗（使用中のポート）で誤りを投げ、Tailscale の IP を試さない", verifies: ["F-01"]}
	"T-07": {title: "GET /api/health が pid と listeners を返し、health がなければ { ok: true } のまま", verifies: ["R-03"]}
	"T-08": {title: "renderPlist が決めたキーと値だけを持ち、XML の特殊な文字を逃がし、buildServiceEnv が loadConfig の誤りを ConfigError にし、指定のない項目を書かない", verifies: ["R-01", "R-02"]}
	"T-09": {title: "parseServiceArgs と parseTailscaleIpv4 が、命令と引数、100.64.0.0/10 の最初のアドレスを読み、知らない引数と命令を拒む", verifies: ["R-01", "R-03"]}
	"T-10": {title: "ServiceManager の install が、偽の launchctl に決めた引数の配列だけを送り、一時の HOME に定義を書き、読み込み済みなら先に外し、Tailscale の IP が取れなければその旨を出し、--dry-run は何も書かず何も送らない", verifies: ["R-01", "R-03"]}
	"T-11": {title: "ServiceManager の install が、設定の誤り、古い node、成果物のなさで、何も書かず何も送らずに終了コード2で止まり、bootstrap の失敗と health の無応答と pid の食い違いで終了コード1、bootout の失敗で定義を書き換えずに終了コード1", verifies: ["F-02", "F-03"]}
	"T-12": {title: "ServiceManager の uninstall・restart・status が、決めた引数の配列を送り、読み込まれていない restart を誤りにし、uninstall は定義を消してログを残し、bootout の失敗では定義を消さない", verifies: ["R-01", "F-03"]}
	"T-13": {title: "本物のサーバー（node dist/server/main.js）を一時の起動で動かし、lsof の待ち受けが2つだけで、SIGTERM で終了コード0で終わる", verifies: ["R-02", "F-04"]}
	"T-14": {title: "実機の受け入れの1〜6（report.md に記録）", verifies: ["R-09"]}
	"T-15": {title: "README と AGENTS.md の命令とファイルの名前が、package.json とリポジトリと一致する（目で確かめ、レビューで見る）", verifies: ["R-04", "R-08"]}
}

verification: "`npm run lint`、`npm test`、`npm run build` と CI。待ち受けと実機の受け入れは一時の起動とブラウザーで確かめ、report.md に書く。本物の launchd の登録は、マージの後に統括が行う。"
rollback:     "PR を戻す。入れた LaunchAgent は `npm run service:uninstall`（または `launchctl bootout gui/$(id -u)/io.github.chemitaro.orca-web` と plist の削除）で外せる。"
exit:         "PR がマージできる状態で、CI が通り、report.md に実機の受け入れの結論と、最終品質ゲートの合格の証拠と、利用者・統括に頼む確かめの手順がある。本物の登録とスマホの確かめの結果は、マージの後に統括が epic-00003 の report.md に書く。"

execution: {
	sessions: {
		spec: {task: "仕様化（起動した側が選んだ値の記録）", model: "opus", effort: "high", rationale: "統括が依頼で指定（待ち受けのアドレスと常駐の定義は安全の境界。Epic の受け入れも兼ねる）"}
		impl: {task: "実装", model: "opus", effort: "high", rationale: "統括が依頼で指定。仕様化と同じセッションで実装する"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-review、実装の前）", model: "opus", effort: "medium"}
		code: {role: "コードのレビュー（code-review）", after: "S-07", model: "sonnet", effort: "high"}
		gate: {role: "最終品質ゲート（final-quality-gate、1人）", after: "S-08", model: "opus", effort: "high"}
	}
}
