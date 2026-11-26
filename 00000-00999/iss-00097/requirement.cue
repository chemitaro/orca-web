package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。
// 文章の項目には Markdown を書いてよい。型にない項目は、必要に応じて足してよい。

// 型の版。消さない。
schema: "specdock/v1"

// 保証レベル（light、standard、strict、critical）と、その理由。
// 失敗したときの影響と回復の難しさで選ぶ（工数や作業の難しさでは選ばない）。
// 具体化や作業の途中で、上げても下げてもよい。正本はここだけで、ほかの場所に写さない。
assurance: {
	level:  "light"
	reason: "画面の表示だけを足す。文書と判定と送信は変えない"
}

purpose: "頂点が対応が必要なとき、配下のどのメンバー（どの作業者・タスク担当）に対応が要るのかを、行の下の稼働中の内訳の木（iss-00092）と右のペインのチームの帯（iss-00079）の、そのメンバー自身に印で示す。"

background: """
	利用者の指摘（2026-11-26）：頂点に「未回答の質問」と出ても、配下のどのワーカーが質問しているのかが分からない。メンバーの状態（作業中・停止・完了）の表示の中に、対応が必要の表示もほしい。
	読むだけで確かめると、質問を出したタスク担当は番を終えて答えを待つので、チームの節の status が done になり、稼働中の内訳の木（`web/apexes-live-view.js` は working・waiting・live・unknown だけを選ぶ）に出ていなかった。
	頂点の文書には、対応の材料 `questions`（dispatchId・kind・working、iss-00080・iss-00091）と `waitingMembers`（id、iss-00080）がある。iss-00098 が questions に answered を足す。
	"""

includes: ["内訳の木とチームの帯の節に、対応が必要の印（質問・判断・許可待ち）を付け、その節をいつも出す（文書は変えず、画面だけ）"]
excludes: ["判定（build.ts）と文書の変更", "答える操作（対応のカード iss-00080 のまま）"]

requirements: {
	"R-01": {
		title: "対応が必要なメンバーの節に印を付ける"
		text: """
			節ごとの印（画面の純粋な関数で決める）：
			- `question`：節の dispatchId が、頂点の questions のうち kind ask・working 偽・answered が真でない項目の dispatchId と同じ。
			- `decision`：同じく kind gate・working 偽・answered が真でない項目。
			- `waiting`：節の agentId が頂点の waitingMembers の id と同じ（許可待ち・入力待ち）。
			印のある節には、状態の言葉の横に「対応が必要：質問」「対応が必要：判断」「対応が必要：許可待ち」を目立つ色で出す。working 真か answered 真の問いは「質問あり（作業は継続中）」「質問の印あり（返事済み）」を控えめに出す。
			"""
		acceptance: [
			"未回答の ask を出して done になったタスク担当の節に「対応が必要：質問」が出る",
			"許可待ちのメンバーの節に「対応が必要：許可待ち」が出る",
		]
	}
	"R-02": {
		title: "印のある節はいつも出し、先に選ぶ"
		text:  "内訳の木（buildLiveTeam）では、対応が必要の印のある節を status に関わらず稼働中と同じく出し、8 の選びで最初に選ぶ（祖先も出す）。チームの帯（buildTeamBand）でも、いつも出す節に入れる。"
		acceptance: [
			"status done で印のある節が内訳の木に出て、稼働中が 12 あっても選ばれる",
			"チームの帯で、印のある done の節が「完了 n」にまとめられない",
		]
	}
}

constraints: ["DOM は textContent と createElement・createElementNS だけ", "AGENTS.md の守ること"]
decisions: ["配下のどのメンバーに対応が必要かを、そのメンバーの表示に出す（利用者、2026-11-26、会話）"]
