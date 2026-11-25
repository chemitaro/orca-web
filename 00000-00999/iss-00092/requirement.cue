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
	reason: "画面の表示だけを足す。Orca の状態と送信は変えない"
}

purpose: "指揮の画面の頂点の行で、配下の数だけでなく、稼働中のメンバーの内訳（誰が、どの状態で、どの段に）を、多段の入れ子も含めて一目で見られる。止まったメンバーは出さない。"

background: """
	利用者の指摘（2026-11-26、実際に使って）：行の「配下 2/95」のような数だけでは、稼働中の配下がどういう状態なのか、多段（統括 → タスク担当 → 実装担当）の構成が分からない。稼働中のメンバーの内訳とチームの構成を出してほしい。止まっているものはよい。
	頂点ごとのチームの節 `team`（iss-00079、`src/apex/team.ts`）は文書にあり、節ごとに kind・status・depth・parentKey・title・createdAt・stateStartedAt を持つ。右のペインのチームの帯（`web/apexes-team-view.js`）はいつも出す節を選ぶ関数を持つ。
	"""

includes: ["左の一覧の頂点の行に、稼働中のメンバーの小さな木を出す（文書は変えず、画面だけ）"]
excludes: ["止まったメンバー（done・failed）の表示", "右のペインのチームの帯の変更", "文書（orca-web.apexes/v1）の変更"]

requirements: {
	"R-01": {
		title: "行に稼働中のメンバーの内訳を木で出す"
		text: """
			頂点の `team` のうち、status が working・waiting・live・unknown の節（稼働中）と、その祖先の節（途中のタスク担当など。祖先が止まっていても構成を示すために出す）を、頂点の行の下に深さに沿って字下げして出す。各節は、種類（エージェントは agentType のアイコン、Dispatch は小さな印）、題名（40 字まで）、状態の言葉（作業中・待ち・動作中（タブなし）・不明）、経過（`elapsed.js`、起点はエージェントの節は stateStartedAt、Dispatch の節は createdAt）。祖先だけの節（止まっている）は薄く出す。
			"""
		acceptance: [
			"統括 → タスク担当 → 実装担当（作業中）のチームで、行の下にタスク担当と実装担当が2段で出る",
			"止まったメンバーだけの枝は出ない",
		]
	}
	"R-02": {
		title: "多いときは抑える"
		text:  "出す節が 8 を超えるときは、深さの浅い順・同じ深さは新しい順に 8 まで出し、「ほか n」を添える。稼働中の節がない頂点では木を出さない。"
		acceptance: [
			"稼働中が 12 の頂点で、8 節と「ほか 4」が出る",
		]
	}
}

constraints: ["DOM は textContent と createElement・createElementNS だけ", "AGENTS.md の守ること"]
decisions: ["稼働中のメンバーだけを出し、止まったものは出さない（利用者、2026-11-26、会話）"]
