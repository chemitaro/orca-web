package spec

design: {
	"D-01": {title: "列の組み立て（`web/apexes-view.js`）", text: "定数 `BOARD_COLUMNS = [{key:'needs_action', stages:['needs_action']}, {key:'working', stages:['working']}, {key:'done', stages:['done_recent','done_older','sleeping','unknown','unlinked']}]`。純粋な関数 `boardColumns(sections)` が、buildApexesView の sections を列ごとに分けて `[{key, sections}]` を返す（列の中の段の順は stages の順。知らない段は捨てない：最後の列に足す）。", satisfies: ["R-01", "R-02"]}
	"D-02": {title: "描き方（`web/apexes-dom.js`・`apexes.js`）", text: "`renderBoard(doc, columns, { opened, onOpen, onOpenMount })` が列ごとに `div.apex-column`（data-column）を作り、中に renderSection（expanded は opened に段の key があるか）を並べる。apexes.js の render は els.sections を renderBoard の列で置き換える。開いた details の覚え方（`section[data-stage] details[open]`）は今のまま。", satisfies: ["R-01"]}
	"D-03": {title: "選び（`web/apexes-view.js`・`apexes.js`）", text: "`initialSelection(search)` は autoPick をいつも偽にする（wide の引数は受けても使わない）。apexes.js は wide を渡さない。", satisfies: ["R-03"]}
	"D-04": {title: "CSS（`web/style.css`）", text: "`@media (min-width: 900px)`：`body.apexes-page:not(.apexes--selected)` のとき `.apex-layout { grid-template-columns: minmax(0, 1fr) }`、`.apex-pane { display: none }`、`.apex-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; overflow: hidden }`、`.apex-column { min-height: 0; overflow-y: auto; overscroll-behavior: contain }`。選んだときは今の 320px の2列で、`.apex-column` は普通の箱（一覧が巻く）。`.apex-back { display: none }` を外す。段の見出し h2 の上の余白は列の先頭では 0。", satisfies: ["R-01", "R-02", "R-04"]}
}
