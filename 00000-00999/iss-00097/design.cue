package spec

design: {
	"D-01": {title: "印の決め方（新しい純粋な関数 `web/apexes-attention-view.js`）", text: "`memberAttention(item)` が、頂点の questions と waitingMembers から、dispatchId → 印と agentId → 印の表を返す（question・decision・waiting と、控えめの question_working・question_answered）。`attentionFor(node, table)` が節の印を返す（agent の節は agentId と dispatchId の両方で引く）。STATIC_FILES に登録。", satisfies: ["R-01"]}
	"D-02": {title: "内訳の木とチームの帯", text: "`buildLiveTeam` と `buildTeamBand` に印の表を渡し、対応が必要の印の節を選びの最初とし、いつも出す節に入れる。行と節の描き方（apexes-dom.js・apexes-team-dom.js）に印の札を足す（textContent だけ、色は CSS の class）。", satisfies: ["R-01", "R-02"]}
}
