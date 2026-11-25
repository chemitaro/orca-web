package spec

goals: [
	"会話は既存の `/embed/agent` をそのまま使い、送信の部品を二重に持たない",
	"選択・新着の点・幅の判断は純粋な関数に置き、DOM は textContent だけで描く",
]

current: "`/apexes`（iss-00076）は一覧だけで、行は `/embed/agent` を新しいタブで開く。`/embed/agent` の frame-ancestors は SpecDock のオリジンだけ。`agent-frame.js` は見えない間も SSE を保ち、`/api/state` を5秒ごとに読む。"

target: "`/apexes` が2ペインになり、右に選んだ頂点の見出しと iframe。`agent-frame.js` は見えない 30 秒で接続を止める。"

design: {
	"D-01": {
		title: "CSP"
		text:  "`src/server/app.ts` の `pagePolicy` に、`/embed/agent` のときだけ frame-ancestors の先頭に `'self'` を足す引数を渡す（例：STATIC_FILES の項目に `frameSelf: true`）。SpecDock のオリジンがなければ `'self'` だけ。ほかの画面は今の値。"
		satisfies: ["R-03"]
	}
	"D-02": {
		title: "選択の純粋な関数（`web/apexes-view.js`）"
		text: """
			- `pickSelection(doc, requestedId)`：requestedId が items にあればそれ、なければ needs_action の先頭、なければ null。
			- `selectionUrl(currentSearch, id)`：`?apex=` を足す・替える・外した search の文字列（ほかの引数は保つ）。
			- `frameSrc(id)`：`/embed/agent?id=<encodeURIComponent(id)>`。
			"""
		satisfies: ["R-01"]
	}
	"D-03": {
		title: "枠の作り直し（`web/apexes-dom.js`）"
		text: """
			`mountAgentFrame(slot, id)`：slot の子をすべて外し、`document.createElement('iframe')` に `src`、`title`、`loading='lazy'` は付けずに、`referrerpolicy='same-origin'` を決めてから `slot.append`。既にある iframe の src を書き換える関数を作らない。選んだ id が前と同じなら作り直さない（ポーリングの描き直しで会話を読み直さない）。
			右のペインの見出しは、題名、状態の印、`createOpenControl`（`web/embed/open-control.js`）。開く先は頂点の worktree と id。
			"""
		satisfies: ["R-01", "R-02", "F-02"]
	}
	"D-04": {
		title: "切り替えの前の確かめ"
		text:  "iframe は同じオリジンなので、親は `frame.contentDocument` の送る欄の処理中の印（`/embed/agent` の DOM の決めた data 属性、例：`data-send-busy=\"true\"`）を読む。処理中なら「送信の処理中です。切り替えると結果の表示を失います」と出し、利用者が選んだときだけ替える。読めないとき（例外）は替える。`agent-frame.js` は、処理中の間だけ送る欄の要素に `data-send-busy=\"true\"` を付ける（送信の流れは変えない）。"
		satisfies: ["F-01"]
	}
	"D-05": {
		title: "見えない間の停止（`web/embed/visibility-gate.js`、新しい小さな部品）"
		text: """
			`createVisibilityGate({ hiddenMs: 30_000, onPause, onResume, schedule, cancel, isHidden })`：hidden になったら hiddenMs の後に onPause を1回。それまでに visible に戻れば取り消す。pause の後に visible になったら onResume を1回。時計と予約は注入する（テストのため）。
			`agent-frame.js`：`connect()` が EventSource を変数に持ち、onPause で `close()` と状態の読みの予約の取り消し、onResume で状態をすぐ読み、`connect()` をもう1回。会話は SSE の snapshot から描き直す（`reduceChat` の今の扱い）。送る欄の入力は触らない。
			"""
		satisfies: ["R-04", "F-02"]
	}
	"D-06": {
		title: "新着の点（`web/apexes-view.js` の純粋な関数と、`apexes.js` の保存）"
		text: """
			- `seenStore` の形：`{ v: 1, seen: { [apexId]: ISO 時刻 } }`、localStorage の鍵 `orca-web.apexes.seen`。読み書きは try/catch で包む。
			- `pruneSeen(seen, doc, now)`：doc にない id と now-14日 より古い時刻を落とす。
			- `isUnseen(item, seen)`：item.status が done で、`lastActivityAt` があり、`seen[item.id]` がないかそれより古い。
			- `apexes.js`：選んだ頂点が 10 秒続けて右のペインに出たら（その間に別の頂点を選ばず、タブが visible）、`seen[id] = now` を書く。
			- 行の題名の前に点（`apex-unseen`、`aria-label=\"新着\"`）を出す。見出しの完了の数の横に「新着 n」。
			"""
		satisfies: ["R-05"]
	}
	"D-07": {
		title: "幅（`web/style.css` と `apexes-dom.js`）"
		text:  "`body` に選択の有無の class（`apexes--selected`）。900px 以上は grid の2列。900px 未満は、選んでいなければ一覧だけ、選んでいれば右のペインだけを出し、見出しに「← 一覧」のボタン（押すと `?apex=` を外して一覧へ）。iframe は右のペインの残りの高さいっぱい。"
		satisfies: ["R-06"]
	}
	"D-08": {
		title: "文書"
		text:  "AGENTS.md の web/ の節の文言（R-07）と、地図に `visibility-gate.js`、`apexes*` の役割。README の画面の節。"
		satisfies: ["R-07"]
	}
}

risks: [
	"iframe の中の `/embed/agent` は自分の `/api/state` の読みを続ける（見えている間）。重さの改善は範囲外",
	"同じオリジンの contentDocument を読む D-04 は、`/embed/agent` の DOM に依る。属性の名前を1か所に決めてテストで固定する",
]
