package spec

design: {
	"D-01": {title: "チームの節（`src/apex/team.ts`）", text: "iss-00078 の束と生きた辺のメンバーから R-01 の節を作る純粋な関数。`buildApexList` が各頂点の `team` に入れる。Dispatch の status は workerState から（生きていれば live、failed は failed、終わりは done）、エージェントの status は agentMark から。", satisfies: ["R-01"]}
	"D-02": {title: "チームの帯（`web/apexes-team-view.js` 純粋な関数、`web/apexes-team-dom.js`）", text: "数の要約、表示する節の選び（動いている・待ち・24 時間以内の失敗と、その祖先。ほかは親ごとのまとめ）、履歴の帯の四角の並び。DOM は textContent と createElementNS（四角は SVG の rect か span）。開閉は `<details>`。", satisfies: ["R-02"]}
}
