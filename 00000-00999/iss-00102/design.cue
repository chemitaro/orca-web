package spec

current: "Open は右のペインの見出しに1つ。広い幅でページ全体が縦に巻かれ、右のペインは sticky で窓の下にはみ出し、ページと会話の枠のスクロールバーが右端に並ぶ。"
target:  "頂点の行ごとに Open がある。広い幅ではページは巻かれず、左の一覧と右の会話がそれぞれの中で巻かれる。"

design: {
	"D-01": {
		title: "行の開く先（`web/apexes-view.js`）"
		text:  "apexRow に `open: {worktree, agent} | null` を足す（buildPane の header.open と同じ決め方：`str(item.worktreeId)` があれば `{worktree: item.worktreeId, agent: String(item.id)}`）。決め方は1つの関数 `openTargetOf(item)` にし、buildPane もそれを使う。bundleRow・unlinkedRow は `open: null`。"
		satisfies: ["R-01"]
	}
	"D-02": {
		title: "行の部品（`web/apexes-dom.js` の renderRow）"
		text:  "renderRow(doc, row, options) に options `{ onOpen, onOpenMount }` を足す。`row.selectable` で `row.open` があり、`options.onOpen` があるときだけ `createOpenControl(doc, {size: 'sm'})` を作り、`onOpenMount?.(row.open, control)` の後、click で `onOpen(row.open, control)`。部品の root は、li の中の「新しいタブで開く」と並ぶ行の操作の箱 `span.apex-actions` に入れる（選ぶボタンの外）。renderSection は options を renderRow に渡す。"
		satisfies: ["R-01", "F-01"]
	}
	"D-03": {
		title: "画面の配線（`web/apexes.js`）"
		text:  "`createOpenBoard()` を1つ持ち、onOpenMount で `board.mount(agent, control)`、onOpen で `board.open(agent, control, () => writer.send('/api/open', 'POST', target))`。render の renderSection に渡す。右のペインの見出しの openControl は今のまま。"
		satisfies: ["R-01", "F-01"]
	}
	"D-04": {
		title: "見た目（`web/style.css`）"
		text: """
			行：`.apexes-page .apex-actions` は flex・wrap・gap で「新しいタブで開く」と Open を並べ、min-width 0。`@media (max-width: 390px)` で `.apexes-page .apex-actions .orca-open { display: none }`。
			広い幅 `@media (min-width: 900px)`：`body.apexes-page { height: 100dvh; overflow: hidden; display: flex; flex-direction: column }`、`body.apexes-page > header { flex: none }`、`.apex-layout { flex: 1 1 auto; min-height: 0; grid-template-rows: minmax(0, 1fr); align-items: stretch }`、`.apex-list { height: 100%; overflow-y: auto; overscroll-behavior: contain }`、`.apex-pane { position: static; height: 100% }`（sticky・top・calc の高さを外す）。`.apex-pane-head { flex: 0 1 auto; min-height: 0; max-height: 60%; overflow-y: auto }`、`.apex-pane-frame { min-height: 40% }`。
			狭い幅の規則は変えない。
			"""
		satisfies: ["R-02", "R-03", "R-04"]
	}
}

risks: ["窓が低いとき見出しの帯が 60% に縮み、帯の中で巻かれる（会話の枠を残すため受け入れる）"]
