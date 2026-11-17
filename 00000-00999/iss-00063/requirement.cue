package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "light"
	reason: "iss-00061 の最終品質ゲートの P2 の小さな直し。会話の表示の描き方だけを変え、書き込みの経路は変えない。誤っても表示が崩れるだけで、PR を戻せば今の描き方に戻る。HTML を解かない守りと、リンクの scheme の制限は今のまま保つ"
}

purpose: """
	`/embed/agent` の会話の Markdown の描き方の小さな誤り2つを直す。
	(1) GFM の表のセルの中の `\\|`（逃がした縦棒）を、行内のコードや強調の中でも文字の `|` として出す（GitHub の GFM と同じ）。
	(2) 会話の role tool の件（道具の出力）の本文を Markdown として描かず、今までどおり文字のまま出す（エージェントの発言だけを描く、という iss-00061 の決定に合わせる）。
	"""

background: """
	iss-00061（PR #62、マージ 5d1353f）の最終品質ゲートの2人目（ChatGPT）の P2 の2件（iss-00061 の report.md の Residual Risks、closure.md の P2-a・P2-b）。統括の依頼書（2026-11-18）が、この2件を小さく直すことを求めた。
	確かめた事実（main 5d1353f）：
	- `web/embed/markdown.js` の splitCells は `\\|` で列を分けない。セルの文字は `\\|` のまま parseInline に渡すので、ふだんの文字と強調の中では逃がしとして `|` になるが、行内のコードの中では逃がしが効かず `c\\|d` と出る。`x \\\\| y` は `x \\| y` と出る。
	- GitHub の GFM（`gh api markdown -f mode=gfm`、2026-11-18 に確かめた）は、`| x \\\\| y | `c\\|d` |` を2列にし、`x | y` と `<code>c|d</code>` を出す。`f\\|oo`、`**p\\|q**` は `f|oo`、`p|q`。つまり列は逃がしの付かない `|` だけで分け、各セルの `\\|` を `|` に置き換えてから行内を解く（cmark-gfm の unescape_pipes と同じ）。ChatGPT の P2-a は「`\\\\|` は列を分けるべき」としたが、GitHub の結果はそうでないので、GitHub に合わせる。
	- `web/embed/agent-view.js` の buildChat は、role user でない件の text の部品を role assistant の bubble にする（role tool の件の text も assistant になる）。`web/embed/agent-dom.js` の renderChatRow は role assistant の bubble を Markdown で描く。正規化（`src/transcript/normalize.ts`）の role は user・assistant・tool・system の4つ。
	"""

includes: [
	"表のセルの `\\|` を、行内を解く前に `|` に置き換えること（見出しの行と本文の行）",
	"buildChat の bubble に、Markdown で描くかどうかの印を持たせ、role assistant の件だけを描くこと",
	"それぞれの単体のテスト",
	"README.md の Markdown の描き方の説明の補い（必要な分だけ）",
]

excludes: [
	"表のほかの描き方、CommonMark との細部の違い（参照式のリンクなど。iss-00061 の Residual Risks のまま）",
	"会話の API（`src/transcript/`）の形を変えること",
	"道具の行（kind tool）、質問・承認のカード、本人の発言の描き方を変えること",
	"見た目（CSS）を変えること",
]

requirements: {
	"R-01": {
		title: "表のセルの逃がした縦棒が、どの行内の中でも文字の `|` として出る"
		text:  "列は、直前に逃がし（`\\`）の付かない `|` だけで分ける（今のまま）。各セルの文字の `\\|` を `|` に置き換えてから行内を解く。見出しの行も本文の行も同じ。表でない段落の `\\|` は今のまま（逃がしとして `|`）。"
		acceptance: [
			"`| a | b |\\n|---|---|\\n| x \\\\| y | `c\\\\|d` |` が2列の表になり、本文の行のセルが文字 `x | y` と行内のコード `c|d` になる",
			"`f\\\\|oo` と `**p\\\\|q**` のセルが `f|oo` と強調の `p|q` になる",
			"`x \\\\\\\\| y`（逆斜線2つと縦棒）のセルが列を分けず `x | y` になる（GitHub の GFM と同じ）",
			"見出しのセルの `\\\\|` も `|` になる",
		]
	}
	"R-02": {
		title: "道具の出力（role tool の件）の本文は Markdown で描かず、文字のまま出る"
		text:  "role tool の件の text の部品は、今と同じ bubble の行（見た目も同じ）として、textContent の文字で描く。role assistant の件の本文だけを Markdown で描く。本人の発言、notice、unsupported、道具の行、質問・承認のカードは今のまま。"
		acceptance: [
			"role tool の件の `**x**` を含む text が、div.bubble の textContent `**x**` で描かれ、strong の要素ができない",
			"role assistant の件の同じ text は、今のまま div.bubble.md で strong になる",
			"渡した Markdown の写し（options.markdown）は role tool の行では呼ばれない",
		]
	}
}

failures: {
	"F-01": {
		title: "守りを弱めない"
		text:  "直しの後も、Markdown の中の生の HTML は文字のまま、href は http・https だけ、要素は createElement と textContent と決めた属性だけで作る（今の XSS の表のテストがそのまま通る）。`\\|` の置き換えで、行内のコードや強調の中に新しい危ない入力の道を作らない。"
	}
	"F-02": {
		title: "病的な入力でも時間が入力の長さにほぼ比例したまま"
		text:  "セルの置き換えは各セルの長さに比例する1回だけの処理にし、今の病的な入力のテスト（100,000 字の表を 1 秒より短く）が通る。"
	}
}

constraints: [
	"依存を足さない。innerHTML などの HTML を解く口を使わない",
	"既存のテストの意味を変えない（直すのは、今の誤った出力を固めているテストがあればその期待だけ）",
]

decisions: [
	"`\\\\|` の扱いは GitHub の GFM の実際の出力に合わせる（タスク担当、2026-11-18、`gh api markdown` で確かめた）。ChatGPT の P2-a の『逆斜線の偶奇を数えて分ける』は採らない",
	"描くかどうかは、行の role を変えず（CSS の `li.row.tool` は道具の行のもの）、bubble の行の印（`markdown: true` は元の role が assistant のときだけ）で決める（タスク担当、2026-11-18）",
]
