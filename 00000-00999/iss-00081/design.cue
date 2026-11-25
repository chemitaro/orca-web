package spec

design: {
	"D-01": {
		title:     "favicon"
		text:      "新しい `web/favicon.svg`（普通）と `web/favicon-alert.svg`（印付き）を `STATIC_FILES`（`image/svg+xml`）に足す。`web/apexes.html` に `<link rel=\"icon\" id=\"favicon\" href=\"/favicon.svg\">`。`apexes.js` が描くたびに、対応が必要の数で href を替える。ほかの画面は `/favicon.svg` を参照してよい（任意）。"
		satisfies: ["R-01"]
	}
	"D-02": {
		title:     "通知の判断の純粋な関数（新しい `web/apexes-notify.js`）"
		text:      "`createNotifyTracker()` が、読んだ文書を順に受け（`observe(doc)`）、出すべき通知の配列 `{ id, key, title, reasons }` を返す。前の2つの文書を覚え、R-02 の条件で決め、出した key を Set に覚える（ページの寿命の間）。stale の文書を受けたら、次の2回の読みまで何も返さない。理由の言葉は `apexes-view.js` の表を使う。"
		satisfies: ["R-02", "F-01"]
	}
	"D-03": {
		title:     "通知を出す口と許可のボタン（`apexes.js`・`apexes-dom.js`）"
		text:      "`Notification` と `isSecureContext` があり、permission が default ならボタンを出し、押したら requestPermission。granted で `document.hidden` のときだけ、tracker の返したものを `new Notification(title, { body, tag: key })` で出し、onclick で `window.focus()` と頂点の選択。どれも try/catch で包む。"
		satisfies: ["R-02", "R-03"]
	}
}
