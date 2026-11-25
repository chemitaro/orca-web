package spec

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "CSP の frame-ancestors と埋め込みの画面の規則を変える。送信の経路は変えず、PR を戻せば元に戻る"
}

purpose: "指揮の画面（`/apexes`）で頂点を選ぶと、同じ画面の右に、その頂点の会話（既存の `/embed/agent`）が出て、頂点に送れる。完了してまだ見ていない頂点に新着の点を出す。"

background: """
	Epic epic-00075 の切り分け（R-06、R-07、F-02）。iss-00076 の一覧の画面（`web/apexes*.js`）の上に作る。
	Opus 5.5 のレビュアーの指摘（2026-11-25）：`/embed/agent` は今 `frame-ancestors` に SpecDock のオリジンしかなく、自分の画面に埋め込めない。AGENTS.md は「同じ iframe の中で別のエージェントへ移るリンクやページの移動を足さない」とし、親が iframe の src を替える作りはこの文言に当たる。`agent-frame.js` は見えない間も SSE を閉じず、`/api/state` を5秒ごとに読む（同じホストへの接続は Chrome で6本まで、会話の見張りは `src/transcript/hub.ts` で8つまで）。
	利用者は AGENTS.md の文言の書き換えを許した（2026-11-25、会話）。
	"""

includes: [
	"`/embed/agent` の CSP の `frame-ancestors` に `'self'` を足す（`/embed/agent` だけ）",
	"指揮の画面の2ペイン（左に一覧、右に選んだ頂点の見出しと会話の枠）と、狭い幅の1列",
	"頂点を選ぶたびに iframe の要素を作り直す（src を替えない）。選んだ頂点を `?apex=` で覚える",
	"`agent-frame.js` が、見えない状態が 30 秒続いたら SSE と状態の読みを止め、見えたらつなぎ直す",
	"新着の点（ブラウザの localStorage）",
	"AGENTS.md の文言と地図、README の画面の節",
]
excludes: [
	"メンバーの会話の表示、対応のカード（iss-00080）",
	"チームの帯（iss-00079）",
	"送信の経路・門・票・記録の変更",
	"`/` の差し替え（iss-00082）",
	"`/embed/open-button` など、ほかの埋め込みの画面の CSP の変更",
]

requirements: {
	"R-01": {
		title: "頂点を選ぶと、同じ画面に会話が出て頂点へ送れる"
		text:  "一覧の行を押すと（新しいタブを開かず）右のペインに頂点の見出し（題名、状態の印、「Orca で開く」の共有の部品）と `/embed/agent?id=<頂点>` の枠が出る。送る欄は `/embed/agent` のもので、送信の流れは変えない。行には「新しいタブで開く」の小さなリンクを残す。"
		acceptance: [
			"行を押すと右のペインの枠が `/embed/agent?id=<その頂点>` になり、URL が `?apex=<id>` になる（履歴は増やさない）",
			"`?apex=<id>` で開くと、その頂点が選ばれた状態で描かれる。一覧にない id なら選ばない",
			"何も選んでいないときは、対応が必要の先頭の頂点を選ぶ。対応が必要がなければ右のペインに案内の文を出す",
		]
	}
	"R-02": {
		title: "枠を作り直して切り替え、iframe の中では移らない"
		text:  "頂点を替えるときは、今の iframe の要素を外し、新しい要素を作って src を決めてから入れる。既にある iframe の src を書き換えない。`agent-frame.js` 側は今のまま、iframe の中からページを移さない。"
		acceptance: [
			"頂点を3回替えた後、DOM の iframe は1つだけ",
			"`web/apexes*.js` に、既にある iframe の src・location を書き換えるコードがない（テストで確かめる）",
		]
	}
	"R-03": {
		title: "`/embed/agent` だけを自分の画面に埋め込めるようにする"
		acceptance: [
			"`/embed/agent` の CSP の frame-ancestors が `'self'` と SpecDock のオリジン（なければ `'self'` だけ）",
			"`/embed/open-button` と index の画面の frame-ancestors は今のまま",
		]
	}
	"R-04": {
		title: "見えない間は会話の接続と状態の読みを止める"
		text:  "`agent-frame.js` は、`document.visibilityState` が hidden の状態が 30 秒続いたら、EventSource を閉じ、`/api/state` の読みの予約をやめる。visible になったら、すぐ状態を読み、EventSource をつなぎ直す（会話は snapshot から描き直す）。送る欄の書きかけの文は消さない。"
		acceptance: [
			"hidden が 29 秒なら接続はそのまま、30 秒で閉じる",
			"visible に戻ると EventSource が1本だけ作られ、状態が読まれる",
		]
	}
	"R-05": {
		title: "完了してまだ見ていない頂点に新着の点を出す"
		text: """
			- 見た時刻：頂点を選んで右のペインに 10 秒以上出し続けた時刻を、ブラウザの localStorage に頂点の id ごとに覚える（id と時刻だけ）。
			- 点：status が done（段が完了・以前の完了）で、最後の活動の時刻が見た時刻より新しい（見たことがなければ点を出す）。
			- 捨てる：一覧の文書にない id と、14 日より古い記録は、読むたびに捨てる。
			- localStorage が使えないときは点を出さず、画面は動く。
			"""
		acceptance: [
			"done の頂点を選んで 10 秒たつと点が消え、9 秒で離れると残る",
			"見た後で、その頂点がまた動いて done になると（最後の活動が新しくなると）点がまた出る",
			"localStorage の読み書きが例外を投げても一覧と会話が描かれる",
		]
	}
	"R-06": {
		title: "狭い幅でも使える"
		text:  "幅 900px 以上は2ペイン（一覧は 320px）。900px 未満は1列で、頂点を選ぶと会話が全面に出て、見出しの「← 一覧」で戻る（`?apex=` を外す）。横に流れない。"
		acceptance: [
			"幅 390px で、選ぶ前は一覧、選んだ後は会話と「← 一覧」が出て、横のスクロールがない",
		]
	}
	"R-07": {
		title: "規則の文言と文書を合わせる"
		acceptance: [
			"AGENTS.md の web/ の節の「同じ iframe の中で別のエージェントへ移る…」が、「iframe の中からは移らない。外の画面は枠の要素を作り直して替える」の意味に直り、地図に新しい部品が載る",
			"README の画面の節に、指揮の画面の2ペインと新着の点が載る",
		]
	}
}

failures: {
	"F-01": {
		title: "送信の流れを変えない"
		text:  "送る欄、意図→確定、宛先の指紋、結果不明の扱いは `/embed/agent` のまま。枠を作り直すと書きかけと処理中の送信は捨てられるので、送っている途中（処理中の印）は頂点の切り替えの前に確かめの文を出す。"
	}
	"F-02": {
		title: "古い接続を残さない"
		text:  "枠を外すと、その中の EventSource とタイマーは文書と一緒に捨てられる。切り替えの後に会話の見張りが増え続けない。"
	}
}

constraints: [
	"AGENTS.md の守ること（innerHTML を足さない、実行時の依存を足さない）",
	"SpecDock との契約（`/embed/*` の道と形、`orca-web.state/v1`、要約）を変えない。frame-ancestors に `'self'` を足すのは許す範囲を広げるだけで、SpecDock の埋め込みはそのまま動く",
	"「Orca で開く」は共有の部品 `web/embed/open-control.js` を使い、二重に持たない",
]

decisions: [
	"AGENTS.md の文言を、外の画面が枠を作り直す形に合わせて書き換える（利用者、2026-11-25、会話）",
	"2ペイン（右の第3ペインを置かない）、SSE を1窓1本（Opus 5.5 のレビュアーの提案をタスク担当が採用、2026-11-25）",
	"新着の点はブラウザの localStorage だけに持つ（台帳を作らない利用者の判断の範囲。端末ごとの便宜で、なくても動く）",
]
