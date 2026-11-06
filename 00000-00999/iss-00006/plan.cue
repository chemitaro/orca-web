package spec

// 計画（Issue）。型 specdock/v1。

goal: "読み取り→正規化→ポーリング→項目と設定→HTTP と CORS→画面の順に、テスト先行で作り、実機で確かめ、PR をマージできる状態で止める。"

steps: {
	"S-01": {title: "Orca の読み取り（read-state.ts：取得元ごとの関数、ページング、許可の一覧での項目の拾い）を作る", realizes: ["R-01", "R-02", "F-02"], status: "todo", session: "impl"}
	"S-02": {title: "正規化した状態の文書の型と normalizeState（Fact、ReadingFact、欠けた理由、結び付け、時刻、並び）を作る", realizes: ["R-01", "R-02", "R-04", "F-01", "F-02"], status: "todo", after: ["S-01"], session: "impl"}
	"S-03": {title: "共有のポーリング（StatePoller：組の間隔、見る人、途中の読みの共有、前の値、tasks と workerLaunch の抑え、接続の状態）を作る", realizes: ["R-05", "F-01", "F-02"], status: "todo", after: ["S-02"], session: "impl"}
	"S-04": {title: "項目の一覧と設定の保存（fields.ts、settings.ts）を作る", realizes: ["R-03", "F-03"], status: "todo", after: ["S-02"], session: "impl"}
	"S-05": {title: "HTTP の口（/api/state、/api/fields、/api/settings/fields）、読み取りの CORS、書き込みの小さな守り、静的な画面の配り、main.ts の設定を作る", realizes: ["R-01", "R-03", "R-04"], status: "todo", after: ["S-03", "S-04"], session: "impl"}
	"S-06": {title: "状態の画面（web/view.js、web/main.js、web/style.css、web/index.html）を作る", realizes: ["R-03", "F-01"], status: "todo", after: ["S-05"], session: "impl"}
	"S-07": {title: "AGENTS.md を今の形に合わせる（FQG-003）", realizes: ["R-01"], status: "todo", after: ["S-05"], session: "impl"}
	"S-08": {title: "この Mac の Orca で、サーバーを起動して /api/state と CORS とブラウザーの画面を確かめ、report.md に件数で書く", realizes: ["R-01", "R-02", "R-03", "R-04"], status: "todo", after: ["S-06", "S-07"], session: "impl"}
	"S-09": {title: "コードのレビューと最終品質ゲートを通し、PR を作って CI の通過を確かめる", realizes: ["R-01"], status: "todo", after: ["S-08"], session: "impl"}
}

tests: {
	"T-01": {title: "read-state が、録画から取得元ごとの記録を返し、プロンプト、toolInput、lastAssistantMessage、spec、result、transcriptPath、preview を拾わない", verifies: ["R-01"]}
	"T-02": {title: "run-list と worker-list のカーソルを最後まで読み、worktree ps の truncated で上限を上げて読み直し、それでも切れたら truncated を返す。同じカーソルの繰り返しで止まる", verifies: ["R-01"]}
	"T-03": {title: "揃った録画（CLI と RPC）から、normalizeState と StatePoller を通した /api/state の文書全体が、期待する JSON と一致する", verifies: ["R-01", "R-02", "R-04"]}
	"T-04": {title: "担当のモデルと推論が launch-resolved と launch-requested、Claude Code の推論が current-selection、Claude Code のモデルと Codex のモデルと推論が null と理由で返る。終わった担当は not-fetched になる", verifies: ["R-02"]}
	"T-05": {title: "スリープ中（pending-handle）のタブが端末 awaiting-restore、状態は not-provided、最後の出力は not-linked で返り、agentStatus も launchAgent もないタブはエージェントに入らない。handle で端末を結ぶ（terminal list の tabId が仮の値でも）", verifies: ["R-01"]}
	"T-06": {title: "/api/state の応答の文字列に、録画のプロンプト、ツールの入力、最後の応答、Task の spec と result、transcript のパス、authToken が現れない", verifies: ["R-01"]}
	"T-07": {title: "/api/state を続けて呼んでも Orca の呼び出しが増えず、見る人がいないと間隔が遅くなり、要求で戻る。途中の読みを共有し、同じ Dispatch の worker-show は1回だけ。終わった Run の task-list は遅い間隔になる", verifies: ["R-05"]}
	"T-08": {title: "Orca が動いていない（status が届かない）と connection が unreachable になり、前に読めた値が残って stale が真になり、/api/state は 200 を返す。一度も読めていなければ空の一覧と source-failed", verifies: ["F-01"]}
	"T-09": {title: "1つの取得元だけ失敗（時間切れ、形の違い）すると、その取得元だけが前の値と誤りで返り、ほかは新しい値になる。readTabs が使えないと tabs を読まず、ps のエージェントで返り、タブの項目は source-unavailable", verifies: ["F-02"]}
	"T-10": {title: "GET /api/fields が項目の一覧と選択を返し、PUT /api/settings/fields で保存した選択が、作り直した SettingsStore と サーバーで残る。知らない識別子、重複、JSON でない本文、大きすぎる本文は 400 で、ファイルは変わらない", verifies: ["R-03"]}
	"T-11": {title: "PUT は、Origin がない、別のオリジン、許していない Host、Content-Type が JSON でないとき 403 か 415 で拒まれ、SpecDock のオリジンでも拒まれる", verifies: ["R-03"]}
	"T-12": {title: "設定のファイルが壊れている、形が違うと既定の選択と理由を返し、書けない場所では PUT が 500 と理由を返し、メモリーの選択も変わらず、サーバーは落ちない", verifies: ["F-03"]}
	"T-13": {title: "許したオリジンの GET と OPTIONS に Access-Control-Allow-Origin と Vary: Origin が付き、ポートやスキームだけ違うオリジンは 403。ORCA_WEB_READ_ORIGINS で許すオリジンを変えられ、不正なオリジンの設定は起動の誤り。selfHosts にない Host の /api/ の要求は 421", verifies: ["R-04"]}
	"T-14": {title: "buildView が、選んだ列だけの見出しと行を作り、欠けた値を「—」と理由、モデルを「値（意味）」で出す", verifies: ["R-03"]}
	"T-15": {title: "静的な画面の口が表の4つのファイルだけを配り、ほかのパス（../ を含む）は 404", verifies: ["R-03"]}
	"T-16": {title: "実機で /api/state が Claude Code と担当（とあれば Codex）を返し、許したオリジンからだけ読め、画面が選んだ項目だけを表示する（report.md に件数で書き、人が読んで確かめる）", verifies: ["R-01", "R-02", "R-03", "R-04"]}
}

verification: "`npm run lint`、`npm test`、`npm run build` と CI。実機は、サーバーを起動して `/api/state` を読み、件数だけを report.md に写す。CORS は Origin を付けた curl、画面はブラウザーで確かめる。"
rollback:     "PR を戻す。設定のファイル（利用者の設定の置き場の orca-web の settings.json）のほかに書くものはなく、Orca には書き込まない。"
exit:         "PR がマージできる状態で、CI が通り、report.md に実機の確かめの結論と最終品質ゲートの合格の証拠がある。"

execution: {
	sessions: {
		spec: {task: "仕様化（起動した側が選んだ値の記録）", model: "opus", effort: "high", rationale: "統括が依頼で指定（正規化のデータの意味と、SpecDock との契約を作る）"}
		impl: {task: "実装", model: "opus", effort: "high", rationale: "統括が依頼で指定。仕様化と同じセッションで実装する"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-review、実装の前）", model: "opus", effort: "medium"}
		code: {role: "コードのレビュー（code-review）", after: "S-08", model: "sonnet", effort: "high"}
		gate: {role: "最終品質ゲート（final-quality-gate、1人）", after: "S-09", model: "opus", effort: "high"}
	}
}
