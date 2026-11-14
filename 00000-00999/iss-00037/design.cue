package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"`/embed/agent` の中でリンクを作る場所を1つの関数にし、その関数が必ず新しいタブの属性と印を付ける",
	"見た目と行き先は変えず、開き方だけを変える",
]

current: "`renderDetail`（`web/embed/agent-dom.js`）が `row.href` を、`/` で始まれば `_self`、ほかは `_blank` の a に、`row.links` を target も rel もない a にする。"
target:  "`renderDetail` の a はすべて私的な `newTabLink(doc, text, href)` で作る。属性は `_blank` と `noopener noreferrer`、中に文字、目に見えない「（新しいタブで開く）」、印の svg。印の形は `agent-marks-icons.js` の `LINK_ICONS.external`。"

design: {
	"D-01": {
		title: "新しいタブのリンクを作る1つの関数"
		text: """
			`web/embed/agent-dom.js` に私的な `newTabLink(doc, text, href)` を置く。返す a は：
			- `href` は与えたまま、`target = '_blank'`、`rel = 'noopener noreferrer'`、`title = '新しいタブで開く'`、`className = 'newtab'`。
			- 子：リンクの文字（textContent）、`span.vh`（textContent「（新しいタブで開く）」。目に見えない）、印の svg（`appIcon(doc, 'external', 'newtab-icon', LINK_ICONS)`、aria-hidden、focusable false）。
			`renderDetail` の `row.href` と `row.links` の両方をこの関数で作る（`_self` の分かれ道を消す）。agent-dom.js のほかの場所で a を作らない。
			見分け（iframe の中か外か）はしない（requirement の decisions）。
			"""
		satisfies: ["R-01", "R-02", "F-01"]
	}
	"D-02": {
		title: "印の形の表 LINK_ICONS"
		text: """
			`web/embed/agent-marks-icons.js` に `export const LINK_ICONS = { external: { label: '新しいタブで開く', viewBox: '0 0 24 24', paths: [{ d: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', fill: 'none', stroke: 'currentColor', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round' }] } }` を足す。表の上に出どころの1行（spec-dock `67abbe6c1` の `src/spec_dock/assets/dashboard/core/ui.js` の `ICONS.external`、SpecDock のデザインシステムの新しいタブの印）を書く。`agent-marks.js` の再輸出に `LINK_ICONS` を足す。描くのは今の `appIcon(doc, key, className, shapes)`（新しい SVG の組み立てを作らない）。
			"""
		satisfies: ["R-02"]
	}
	"D-03": {
		title: "見た目 agent.css"
		text: """
			`web/embed/agent.css` に：
			- `.vh`：目に見えない文字（`position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap;`。SpecDock の app.css の `.vh` と同じ）。
			- `a.newtab .newtab-icon`：`width: 0.9em; height: 0.9em; margin-left: 2px; vertical-align: -0.1em; flex: none;`（色は文字の currentColor のまま。新しい色を足さない）。
			リンクの色・下線は今のまま。
			"""
		satisfies: ["R-02"]
	}
	"D-04": {
		title: "どのリンクも同じ iframe の中で移らないことを固めるテスト"
		text: """
			- DOM のテスト（偽の document）：親・子2つ・PR のある詳細を描き、a のすべてが target `_blank`・rel `noopener noreferrer`・title「新しいタブで開く」で、href が与えたまま、印の svg（aria-hidden、path の d が LINK_ICONS と同じ）と `.vh` の文字を持ち、`<img onerror>` を含む文字が文字のまま入る。
			- ソースを読むテスト：`/embed/agent` が読むスクリプト（agent.html が読む agent-frame.js から import をたどった web/embed の全ファイル、または一覧の固定）に `_self`・`_parent`・`_top`・`location.href =`・`location =`・`location.assign`・`location.replace`・`window.open` がなく、agent-dom.js で a を作るのは newTabLink だけ（`'a'` の出現が1か所）。
			- 表のテスト：LINK_ICONS.external の d が SpecDock の値と同じで、出どころの1行がある。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01"]
	}
}

compatibility: "行き先の URL、見た目の色、ほかの画面は変わらない。`/embed/agent` を直接タブで開いて親・子を押すと、前は同じタブ、これからは新しいタブで開く。"
risks: [
	"新しいタブが増える。iPhone の Safari では新しいタブに切り替わる。送る宛先を取り違えないことを優先する（統括の決定）",
]
