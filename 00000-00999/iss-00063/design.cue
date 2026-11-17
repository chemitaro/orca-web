package spec

// 設計（Issue）。型 specdock/v1。

goals: ["表のセルの `\\|` を GitHub の GFM と同じに描く", "道具の出力の本文を文字のまま出す"]
current: "splitCells は `\\|` で分けないが、セルの `\\|` を残したまま parseInline に渡す。buildChat は role tool の text を assistant の bubble にし、renderChatRow は role assistant の bubble を Markdown で描く。"
target:  "parseTable がセルごとに `\\|` を `|` にしてから parseInline に渡す。buildChat の bubble は `markdown`（元の role が assistant のときだけ真）を持ち、renderChatRow はそれが真の bubble だけを Markdown で描く。"

design: {
	"D-01": {
		title: "表のセルの逃がした縦棒を `|` にしてから行内を解く（web/embed/markdown.js）"
		text: """
			`parseTable` の中のセルを行内に解くところ（今の `fit` の `parseInline(cells[k] ?? '')`）で、セルの文字の `\\|` を全部 `|` に置き換えた文字を parseInline に渡す（`replaceAll('\\\\|', '|')`。cmark-gfm の unescape_pipes と同じ）。列の分け方（splitCells）は変えない。見出しと本文の行が同じ fit を通るので、両方に効く。
			置き換えは各セルに1回で、時間はセルの長さに比例する（F-02）。置き換えで増えるのは `|` の文字だけで、行内の解き方（safeHref、生の HTML を文字にする）はそのまま通る（F-01）。
			木の形（`{type: 'table', align, head, rows}`）は変えない。
			"""
		satisfies: ["R-01", "F-01", "F-02"]
	}
	"D-02": {
		title: "bubble の行に Markdown で描く印を持たせ、assistant の件だけを描く（web/embed/agent-view.js、web/embed/agent-dom.js）"
		text: """
			buildChat の bubble の行に `markdown: m.role === 'assistant'` を足す（role は今のまま user か assistant。CSS と並びは変わらない）。行の型の注記（`{ kind: 'bubble', key, role, at, text, truncated, markdown }`）も直す。
			renderChatRow の分かれ目を `row.kind === 'bubble' && row.role === 'assistant' && row.markdown === true` にする。偽なら今の文字の `make(doc, 'div', row.text, 'bubble')`。options.markdown（写し）もこの分かれ目の中だけで呼ぶ。
			agent-frame.js の写し（createMarkdownCache）と prune は変えない（描かない行の key は写しに入らない）。
			手で作った行（テスト）で `markdown` を持たない assistant の bubble は文字で描かれる。今のテストのうち、手で作った assistant の行で Markdown を期待するものは `markdown: true` を足す。
			"""
		satisfies: ["R-02", "F-01"]
	}
}

compatibility: "会話の API と送信は変わらない。画面の見た目は、role tool の本文と表のセルの `\\|` のほかは変わらない。"
risks: ["Orca が道具の出力の本文として Markdown の整った文（表など）を返す場合、それは文字のまま出る（iss-00061 の決定どおり）"]
