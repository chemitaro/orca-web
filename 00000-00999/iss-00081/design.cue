package spec

design: {
	"D-01": {
		title:     "favicon"
		text:      "新しい `web/favicon.svg`（普通）と `web/favicon-alert.svg`（印付き）を `STATIC_FILES`（`image/svg+xml`）に足す。`web/apexes.html` に `<link rel=\"icon\" id=\"favicon\" href=\"/favicon.svg\">`。`apexes.js` が描くたびに、対応が必要の数で href を替える。ほかの画面は `/favicon.svg` を参照してよい（任意）。"
		satisfies: ["R-01"]
	}
	"D-02": {
		title:     "通知の判断の純粋な関数（新しい `web/apexes-notify.js`）"
		text:      "`createNotifyTracker()` が、読んだ文書を順に受け（`observe(doc)`）、出すべき候補の配列 `{ id, key, title, reasons }` を返す。R-02 の K（知っている同一性と、それぞれの「続けて出なかった回数」）、stale でない最初の2回の読みの数、1つ前の stale でない文書の needs_action の同一性を持つ。stale の文書では続けて読めた数を0に戻し何も返さない。読みの失敗は `observeFailure()` で同じく0に戻す（`apexes.js` の load が失敗のたびに呼ぶ）。返した候補は呼び手が出した（`markShown(key)`）ときに K に入る。理由の言葉は `apexes-view.js` の表を使う。"
		satisfies: ["R-02", "F-01"]
	}
	"D-03": {
		title:     "通知を出す口と許可のボタン（`apexes.js`・`apexes-dom.js`）"
		text:      "`Notification` と `isSecureContext` があり、permission が default ならボタンを出し、押したら requestPermission。granted で `document.hidden` のときだけ、tracker の返したものを `new Notification(title, { body, tag: key })` で出し、onclick で `window.focus()` と頂点の選択。どれも try/catch で包む。"
		satisfies: ["R-02", "R-03"]
	}
	"D-04": {
		title:     "見えない間の読み（`apexes-dom.js` の `startApexPolling`）"
		text:      "`startApexPolling` に `keepAliveWhenHidden()`（呼ぶたびに真偽を返す口）と `hiddenDelayMs`（30 秒）を足す。hidden の間は、keepAliveWhenHidden() が真なら hiddenDelayMs で予約し、偽なら今のとおり止める。`apexes.js` は Notification.permission === 'granted' を返す。"
		satisfies: ["R-02"]
	}
}
