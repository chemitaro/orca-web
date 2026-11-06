package spec

// 計画（Issue）。型 specdock/v1。

goal: "守り→開く門と選び方→開く処理→HTTP の口→ボタンの部品→実機の確かめの順に、テスト先行で作り、PR をマージできる状態で止める。"

steps: {
	"S-01": {title: "iss-00005 の確かめの抜け（FQG-001、FQG-002）のテストを足す", realizes: ["R-05"], status: "todo", session: "impl"}
	"S-02": {title: "設定（loadConfig）と書き込みの守り（checkHost、checkSameOriginPost、TokenStore）を作る", realizes: ["R-04", "F-03"], status: "todo", session: "impl"}
	"S-03": {title: "開く門（OpenOrcaCli、OpenRpc）と、タブの選び方（parseTabsSnapshot、chooseTarget）を作る", realizes: ["R-01", "R-02"], status: "todo", session: "impl"}
	"S-04": {title: "開く処理（OpenService）を作り、録画の再生で経路と失敗を確かめる", realizes: ["R-01", "R-02", "F-01", "F-02", "F-04", "F-05"], status: "todo", after: ["S-03"], session: "impl"}
	"S-05": {title: "HTTP の口（/api/token、/api/open、/embed/*、Host の確かめ）と main.ts の組み立てを作る", realizes: ["R-03", "R-04", "F-03"], status: "todo", after: ["S-02", "S-04"], session: "impl"}
	"S-06": {title: "ボタンの部品（open-button.js、open-button.html、open-button-frame.js、open-button.css）を作り、ブラウザーで確かめる", realizes: ["R-03"], status: "todo", after: ["S-05"], session: "impl"}
	"S-07": {title: "実機の確かめの道具（open-live）を作り、orca-web の worktree で3つの経路とタブの集合を確かめ、report.md に書く", realizes: ["R-01", "R-02"], status: "todo", after: ["S-04"], session: "impl"}
	"S-08": {title: "コードのレビューと最終品質ゲートを通し、PR を作って CI の通過を確かめる", realizes: ["R-01", "R-04"], status: "todo", after: ["S-06", "S-07"], session: "impl"}
}

tests: {
	"T-01": {title: "`_meta.runtimeId` の食い違いで openExistingTab と sendGuarded が使えず、keepalive が時間切れを延ばす", verifies: ["R-05"]}
	"T-02": {title: "loadConfig が待ち受けのアドレス、許す Host、自分のオリジン、SpecDock のオリジンを導き、0.0.0.0 や不正な IP とオリジンを拒む", verifies: ["R-04"]}
	"T-03": {title: "checkHost、checkSameOriginPost が、Host の違い・欠け、GET、JSON でない型、Origin の欠け・null・別のポート・別の host、Sec-Fetch-Site の cross-site を拒み、そろった要求を通す", verifies: ["R-04", "F-03"]}
	"T-04": {title: "TokenStore が、期限内のトークンを通し、期限切れ、知らない値、上限を超えて捨てたトークンを拒み、inspect と JSON に値を出さない", verifies: ["R-04", "F-03"]}
	"T-05": {title: "OpenOrcaCli と OpenRpc が、一覧にない操作（terminal create、file open、session.tabs.create、worktree.create、terminal send）と host でない navigation を送らずに拒む", verifies: ["R-02"]}
	"T-06": {title: "chooseTarget が、指定のエージェント、指定が消えたとき、最後に動いたエージェント（updatedAt の比較と同点）、スリープ中の端末、最後に見ていたタブ（leaf の選び方、activeTabId）、タブなしで、期待する経路と理由を返し、parseTabsSnapshot が形の違いと worktree の食い違いで null を返す", verifies: ["R-01"]}
	"T-07": {title: "OpenService が、録画の再生で、各経路を期待する引数で1回だけ呼び、worktree をパスと ID で解決し、truncated の一覧を読み直す", verifies: ["R-01", "R-02"]}
	"T-08": {title: "OpenService が、書き込みの後の時間切れ、接続断、CLI の時間切れで unconfirmed を返し、2回目の書き込みを送らない", verifies: ["F-01"]}
	"T-09": {title: "OpenService が、機能の欠け、Orca に届かない、形の違い、runtime の ID の変化、method_not_found、worktree の不在と重複、tab_not_found、重なった要求で、書き込みを送らず（method_not_found と tab_not_found は1回の後に）理由を返す", verifies: ["F-02", "F-04", "F-05"]}
	"T-10": {title: "HTTP のテストで、/api/token と /api/open の守りを1つずつ外した要求が拒まれて開く処理が呼ばれず、そろった要求が届き、すべての道が Host を確かめ、応答に CORS の見出しとトークンの記録がない", verifies: ["R-04", "F-03"]}
	"T-11": {title: "/embed/open-button が CSP（frame-ancestors に SpecDock のオリジンだけ、inline を許さない）と nosniff で返り、部品のファイルが固定の対応だけで返る", verifies: ["R-03"]}
	"T-12": {title: "ブラウザーで、別のオリジンの試しの画面に1行のスクリプトを置くとボタンが出て、押すと偽の開く処理まで届き、幅 390px では出ない", verifies: ["R-03"]}
	"T-13": {title: "実機で、orca-web の worktree に3つの経路を1回ずつ送り、Orca の前面が切り替わり、タブの集合が変わらない（report.md に記録）", verifies: ["R-01", "R-02"]}
}

verification: "`npm run lint`、`npm test`、`npm run build` と CI。ボタンはブラウザーで、開く口は `npm run open:live` で、orca-web のリポジトリの worktree だけを対象に確かめ、report.md に書く。"
rollback:     "PR を戻す。Orca の前面の切り替えは画面で戻せる。利用者の環境と Orca の設定には書き込まない。"
exit:         "PR がマージできる状態で、CI が通り、report.md に実機の確かめの結論と最終品質ゲートの合格の証拠がある。"

execution: {
	sessions: {
		spec: {task: "仕様化（起動した側が選んだ値の記録）", model: "opus", effort: "high", rationale: "統括が依頼で指定（偽の要求の拒否と、非公開の内部の口での書き込み）"}
		impl: {task: "実装", model: "opus", effort: "high", rationale: "統括が依頼で指定。仕様化と同じセッションで実装する"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-review、実装の前）", model: "opus", effort: "medium"}
		code: {role: "コードのレビュー（code-review）", after: "S-07", model: "sonnet", effort: "high"}
		gate: {role: "最終品質ゲート（final-quality-gate、1人）", after: "S-08", model: "opus", effort: "high"}
	}
}
