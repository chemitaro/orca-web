package spec

design: {
	"D-01": {title: "選ぶ関数（`web/apexes-view.js` か新しい `web/apexes-live-view.js`、純粋な関数）", text: "`buildLiveTeam(team, { now, limit: 8 })` が、稼働中の節と祖先を選び、深さ・題名・状態の言葉・経過・薄くするか、と「ほか n」を返す。チームの帯（apexes-team-view.js）の祖先をたどる処理があれば使い回す。", satisfies: ["R-01", "R-02"]}
	"D-02": {title: "描く（`web/apexes-dom.js`）", text: "頂点の行の下に小さな木を描く（textContent と createElement だけ、字下げは depth の CSS 変数）。行を押す動き（選択）は変えない。新しいファイルを足すなら STATIC_FILES に登録する。", satisfies: ["R-01"]}
}
