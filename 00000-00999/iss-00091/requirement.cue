package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。
// 文章の項目には Markdown を書いてよい。型にない項目は、必要に応じて足してよい。

// 型の版。消さない。
schema: "specdock/v1"

// 保証レベル（light、standard、strict、critical）と、その理由。
// 失敗したときの影響と回復の難しさで選ぶ（工数や作業の難しさでは選ばない）。
// 具体化や作業の途中で、上げても下げてもよい。正本はここだけで、ほかの場所に写さない。
assurance: {
	level:  "standard"
	reason: "対応が必要の判定を変える。読むだけで、誤りは表示に留まり、PR を戻せば元に戻る"
}

purpose: "未回答の質問（ask）や判断（gate）の印がある作業者でも、その作業者が作業を続けている間は、頂点を「対応が必要」にしない。答えを待って止まっている作業者の問いだけを人の対応にする。"

background: """
	利用者の指摘（2026-11-26、実際に使って）：yubisaki の統括が「対応が必要（未回答の質問）」に残った。Orca の worker-list を読むだけで確かめると、統括あての ask の印（`projection.attention.categories` の `input`）を持つ生きた Dispatch が2つあり、1つは `projection.stage.activity` が `working`（質問を出したまま作業を続けている）、もう1つは `done`（番を終えて答えを待っている）だった。前者は待たずに進む質問か、答えが届いた後に印だけが残っている見込みで、人の対応には当たらない。
	iss-00078 の A3（`src/apex/build.ts` の judgeWork）は、activity を見ずに attention だけで判定している。
	"""

includes: [
	"worker-list の `projection.stage.activity` を内部の値（`src/apex/extras.ts`）に足す（`orca-web.state/v1` には出さない）",
	"A3 で、activity が `working` の Dispatch の ask・gate を対応が必要の材料にしない",
	"そのときの理由の札と、対応のカード（iss-00080 の questions）の表し方",
]
excludes: ["統括あての連絡を読むこと（既読になる）", "A4〜A6 の変更"]

requirements: {
	"R-01": {
		title: "作業を続けている作業者の問いでは対応が必要にしない"
		text:  "A3 の ask と gate のどちらも、その Dispatch の `projection.stage.activity` が `working` なら、対応が必要の材料にしない（猶予も数えない）。activity が `working` でない（`done`・`idle`・`unknown`・読めない）ときは今のとおり。"
		acceptance: [
			"attention input で activity working の Dispatch だけを持つ done の頂点は、90 秒を過ぎても対応が必要にならず、作業中（配下が動いている）か理由 question_working の札で示される",
			"attention input で activity done の Dispatch は、今のとおり 90 秒で対応が必要（question）",
		]
	}
	"R-02": {
		title: "作業を続けている作業者の問いを控えめに示す"
		text:  "頂点の reasons に `question_working`（「質問あり（作業は継続中）」）を足す（対応が必要の段には入れない）。対応のカードの `questions` の各項目に `working: true|false` を足し、カードは working のとき「作業を続けながらの質問」と添える。［頂点に伝える］は今のとおり使える。"
		acceptance: [
			"理由 question_working の言葉が行に出て、対応が必要の段に入らない",
			"カードの questions の working が activity から決まる",
		]
	}
}

failures: {
	"F-01": {
		title: "activity が読めないときは今の判定"
		text:  "activity がない・知らない値なら working でないとみなし、今の A3 のとおり判定する（見落としより誤報を選ぶ）。"
	}
}

constraints: ["AGENTS.md の守ること", "`orca-web.state/v1` を変えない"]
decisions: [
	"作業を続けている作業者の問いは対応が必要にしない（利用者、2026-11-26、会話で Issue にして直すよう依頼）",
]
