package spec

schema: "specdock/v1"

assurance: {
	level:  "light"
	reason: "読み取りの表示だけを足す。Orca の状態と送信は変えない"
}

purpose: "指揮の画面で頂点を選ぶと、会話の上の「チームの帯」で、配下の階層（途中のタスク担当を含む）と、多数の Dispatch の結果を一目で見られる。"

background: """
	Epic epic-00075 の切り分け（R-08）。iss-00078 が頂点に束（Run と世代）の Dispatch を結ぶ。iss-00077 が2ペインの右に頂点の見出しと会話を置く。実データの木の深さは最大 3（統括 → タスク担当 → 実装担当）、最大の Run は task 356。
	"""

includes: [
	"頂点の一覧の文書に、頂点ごとのチームの節（メンバーのエージェントと束の Dispatch を重ねずに）を足す",
	"右のペインの会話の上に、畳めるチームの帯（数の要約、字下げの木、履歴の帯）",
]
excludes: ["対応のカード（iss-00080）", "メンバーへの送信"]

requirements: {
	"R-01": {
		title: "頂点ごとのチームの節を文書に出す"
		text:  "各頂点の `team`：節 `{ key, kind: 'agent'|'dispatch', agentId, dispatchId, parentKey, depth, title（task の題名かエージェントの題名、200 字まで）, status: 'working'|'waiting'|'done'|'failed'|'live'|'unknown', createdAt }`。エージェントと Dispatch が同じなら1節（agent）。親は、エージェントは parentId、Dispatch は task の parent_id の task の Dispatch の節、なければ頂点。並びは深さ優先、兄弟は createdAt の古い順。"
		acceptance: [
			"タブのある作業者とその Dispatch が1節で出る",
			"閉じた子の Dispatch が、親の task の節の下に出る",
		]
	}
	"R-02": {
		title: "チームの帯で階層と結果が見える"
		text:  "チームのある頂点を選ぶと、会話の上に「チーム n（作業中 a・待ち b・完了 c・失敗 d）」の帯が出て、押すと開く。開いた中に、字下げの木（深さに沿って字下げ、状態の印と題名と経過）。動いている・待っている・最近 24 時間の失敗の節はいつも出し、それ以外の終わった節は親ごとに「完了 n」にまとめて押すと開く。節の上に履歴の帯（Dispatch を createdAt の順に1つの小さな四角で並べ、状態で色を分ける。押すとその節へ）。エージェントの節はリンクで `/embed/agent?id=` を新しいタブで開く（読むため）。"
		acceptance: [
			"配下が 100 を超える頂点でも、木は動いている節と最近の失敗と「完了 n」のまとめだけで1画面に収まり、履歴の帯がすべての Dispatch を表す",
			"チームのない頂点では帯を出さない",
		]
	}
}

constraints: [
	"DOM は textContent と createElement・createElementNS だけ",
	"iss-00077・iss-00078 が main に入った後に、その main から始める",
]
