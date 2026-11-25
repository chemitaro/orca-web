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
	reason: "頂点の段の決め方を変える。読むだけで、誤りは表示に留まり、PR を戻せば元に戻る"
}

purpose: "状態の分からない頂点を「作業中」に混ぜず、「不明」の段に分ける。プロセスが動いていない Chat のタブは「眠っている」にする。作業中の段には、実際に動いていると分かる頂点だけが並ぶ。"

background: """
	利用者の指摘（2026-11-26、実際に使って）：「不明・確かめられない」の頂点が作業中の段に並ぶ。読むだけで確かめると、6件とも構造化 Chat のタブ（Claude Chat 4、Antigravity Chat 2）で、Orca のタブの情報に状態がなく（`state` は not-provided）、対応する ps の行がない（chat-tab の `paneKey` は `src/state/normalize.ts` で ps の行と対応したときだけ付く）。題名も既定のまま。動いていない見込みが高い。
	今の決まり（iss-00076 R-02・R-04、`src/apex/build.ts` の judge と groupOf）：頂点の印が unknown なら status working・札 unverified、動きのない 24 時間で眠っている。
	利用者の判断（2026-11-26）：眠っているものは眠っている、完了は完了、不明なものは不明でよい。
	"""

includes: ["プロセスのない頂点の見分け", "段 `unknown`（不明）の追加と画面の段", "README・AGENTS.md の該当の文"]
excludes: ["対応が必要の判定（A1〜A6）の変更", "status の3つ（needs_action・working・done）の値の変更"]

requirements: {
	"R-01": {
		title: "プロセスのない、状態の分からない頂点は眠っているにする"
		text: """
			頂点の印が unknown で、チームに動いている・待っている・猶予の中のものがなく（今の「静か」の条件）、頂点のプロセスがないとき、status を done、理由を `sleeping`、段を `sleeping` にし、札 unverified を付けない。
			プロセスがない：kind が `chat-tab` で `paneKey` が null（ps の行と対応しない）で、かつ状態の文書の取得元 `worktreePs` が一度は読めていて（`lastSuccessAt` がある）stale でない。または kind が `terminal-tab` で `terminal` が null でも `attached` でもなく、取得元 `tabs` が stale でない。kind が `untabbed`（ps の行から作った頂点）はプロセスがある。取得元が古い・読めていないときは「判定できない」とし、R-02 の不明にする。
			段は `sleeping`（完了（最近）・以前の完了には入れず、新着の点も付かない）。
			"""
		acceptance: [
			"state null・paneKey null の chat-tab の単独の頂点は、worktreePs が新しく読めていれば、最後の活動が 1 時間前でも段 sleeping・status done・理由 sleeping で、札 unverified がなく、新着の点が付かない",
			"worktreePs が stale か一度も読めていなければ、同じ頂点は段 unknown・札 unverified",
		]
	}
	"R-02": {
		title: "プロセスがあるのに状態の分からない頂点は不明の段に分ける"
		text:  "頂点の印が unknown で、静かで、プロセスがある（または判定できない）とき、段を新しい `unknown` にする（status は working のまま、札 unverified）。最後の活動の古さで眠っているに移さない（今の「unverified で 24 時間 → 眠っている」の決まりをやめる）。配下が動いているなど静かでない頂点は今のとおり作業中。"
		acceptance: [
			"state null・paneKey ありの chat-tab の単独の頂点は、段 unknown で、30 時間たっても unknown",
			"state null の頂点でメンバーが working なら、今のとおり作業中の段",
		]
	}
	"R-03": {
		title: "画面に不明の段を出す"
		text:  "画面の段の順は、対応が必要・作業中・完了（最近）・以前の完了・眠っている・不明・結べない仕事。不明は畳んで出す。見出しの「作業中」の数に不明は入らない（段の件数から出す今の決まりのまま）。"
		acceptance: ["段「不明（n）」が畳んで出て、作業中の段と数に入らない"]
	}
}

constraints: ["AGENTS.md の守ること", "`orca-web.state/v1` を変えない"]
decisions: [
	"眠っているは眠っている、完了は完了、不明は不明（利用者、2026-11-26、会話）",
	"この Issue は次の上位の決まりを置き換える：epic-00075 R-03（状態が不明の頂点は完了にせず確かめられないの札、unverified で 24 時間動きがなければ眠っている）、iss-00076 R-02 の規則 3 と「頂点の印が unknown なら札 unverified」、iss-00076 R-03（頂点の印が unknown なら完了にしない）。置き換えた後：プロセスがないと新しい取得元で分かる unknown の頂点は眠っている（status done・札なし）、それ以外の静かな unknown は不明の段（status working・札 unverified）、時間で移さない（タスク担当、利用者の判断に基づく、2026-11-26）",
]
