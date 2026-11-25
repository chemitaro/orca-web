package spec

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "読み取りの新しい API と画面を足すだけで、Orca の状態も送信も変えない。誤判定は表示に留まり、PR を戻せば元に戻る"
}

purpose: "親のない頂点のエージェントだけを、3つの状態（対応が必要・作業中・完了）で並べた一覧の API と画面を出す。今の状態の文書にある項目だけで作り、Orca から読む項目は足さない。"

background: """
	Epic epic-00075 の最初の切り分け（R-01〜R-03）。設計の根拠は Epic の requirement.cue の decisions と、タスク担当の Workbench `.workbench/orchestrator-ui/proposal-v2.md`。
	2026-11-25 の実データ：エージェント 79、`parentPaneKey` を持つもの 4（親はどれも見つかる）、頂点 74、state が null の 8、端末のタブ 55 のうち復元待ち 54、状態の始まりが 7 日以上前の頂点 49。
	質問・判断・止まった作業者・失敗の判定と、閉じた子との結びは iss-00078 に任せる。会話を同じ画面で開くのは iss-00077。
	"""

includes: [
	"純粋な関数の新しいモジュール `src/apex/`（`model.ts`、`build.ts`）と文書 `orca-web.apexes/v1`",
	"`GET /api/apexes`（同じオリジンだけ、CORS なし、`?project=`）",
	"一覧の画面 `/apexes`（`web/apexes.html`・`apexes.js`・純粋な関数の `apexes-view.js`・textContent だけの `apexes-dom.js`）と、ほかの画面からのリンク",
	"README と AGENTS.md の地図の追記",
]
excludes: [
	"Orca から読む項目の追加（iss-00078）",
	"質問（ask）・判断（gate）・報告のない作業者・失敗・統括不在の判定（iss-00078）",
	"会話の埋め込み、新着の点（iss-00077）",
	"通知、favicon（iss-00081）",
	"`/` の差し替え（iss-00082）",
	"`orca-web.state/v1`・`/embed/*`・`/api/worktrees/summary` の変更",
]

requirements: {
	"R-01": {
		title: "エージェントを頂点・メンバー・結べないものの3つに分ける"
		text: """
			- メンバー：`parentPaneKey` が、自分でない今あるエージェントの `paneKey` とちょうど1つ一致するエージェント（親子は何段でもたどる。循環は打ち切り、輪に入ったものは結べないものにする）。
			- 頂点：`parentPaneKey` がなく、`worker` もないエージェント。
			- 結べないもの：それ以外（`parentPaneKey` があるが親が見つからない、`worker` があるが親が見つからない）。
			各エージェントは3つのどれか1つだけに入る。
			"""
		acceptance: [
			"親・子・孫の3段の木で、子と孫が頂点のメンバーになり、頂点は1つだけ一覧に出る",
			"`parentPaneKey` の親が見つからない子と、`worker` があって親のない子は、頂点にならず「結べない仕事」に出る",
			"エージェントの数＝頂点の数＋メンバーの数＋結べないものの数",
		]
	}
	"R-02": {
		title: "頂点の状態を、配下を含めて3つで決める"
		text: """
			状態の印は受け箱の `agentMark`（working・blocked・waiting・done・sleeping・unknown）を使う。上から順に最初に当たったもの：
			1. 対応が必要：頂点が blocked か waiting（理由 `apex_blocked`・`apex_waiting`）。または、メンバーが blocked か waiting で、`stateStartedAt` から 20 秒以上たった（`stateStartedAt` がなければすぐ）。端末のタブのメンバーは `terminal` が `attached` のものだけ（理由 `member_blocked`・`member_waiting`）。
			2. 作業中：チームの誰か（頂点かメンバー）が working（理由 `working`、頂点が monitoring なら `monitoring`、メンバーだけが動いていれば `members_working`）。または、メンバーの許可待ち・入力待ちが 20 秒の猶予の中。
			3. 頂点の印が unknown：作業中にする（理由なし）。
			4. 完了：それ以外（頂点が done か sleeping で、チームに動いている・待っているものがない）。理由は印に合わせて `done` か `sleeping`。
			`reasons` には、当たった規則の理由だけでなく、当てはまる理由をすべてこの順で並べる（例：頂点が waiting でメンバーが working なら `["apex_waiting", "members_working"]`）。札 `unverified` は、どの規則が当たっても、頂点の印が unknown なら付ける。
			"""
		acceptance: [
			"頂点が done でメンバーが working の頂点は作業中（理由 members_working）",
			"頂点が waiting なら、メンバーが working でも対応が必要",
			"メンバーの blocked は 19 秒では作業中、20 秒で対応が必要",
			"頂点もメンバーも done なら完了",
		]
	}
	"R-03": {
		title: "読めない・古いときを完了と区別する"
		text: """
			- 頂点の印が unknown（state が null で、terminal が `awaiting-restore` でない）なら完了にせず、作業中に札 `unverified`（「確かめられない」）。state が null で復元待ちの頂点は、`agentMark` のとおり sleeping（タブが復元されておらず動いていないことが分かる）として完了・眠っているに入る。
			- 状態の文書が `stale` か接続が `connected` でないとき、文書に `stale: true` を立て、画面に帯を出す（状態は最後に読めた値のまま）。
			"""
		acceptance: [
			"state が null で復元待ちでない頂点（配下なし）は作業中・札 unverified で、完了の数に入らない。state が null で復元待ちの頂点は完了（理由 sleeping）で眠っているに入る",
			"状態の文書が stale のとき、一覧の文書の stale が真で、画面に「Orca を読めていません」の帯が出る",
		]
	}
	"R-04": {
		title: "完了と古いものを畳む段に分ける"
		text: """
			画面の段は5つ：対応が必要、作業中、完了（最近）、以前の完了、眠っている。ほかに結べない仕事。
			- 眠っている：チームに動いている・待っている・猶予の中のものがない頂点（status が done か、status が working で理由がなく札 unverified だけのもの）のうち、次のどれか。頂点の `terminal` が `awaiting-restore`。status が done で最後の活動（頂点とメンバーの `stateStartedAt` の最大、なければ worktree の `lastActivityAt`）が 7 日より前。札 unverified だけの頂点で最後の活動が 24 時間より前（Epic R-03）。
			- 以前の完了：完了で、最後の活動が 24 時間より前（眠っているでないもの）。
			- 完了（最近）：完了で、最後の活動が 24 時間以内。
			段の中は、最後の活動の新しい順。以前の完了・眠っている・結べない仕事は畳んで出す。
			"""
		acceptance: [
			"25 時間前に done になった頂点は以前の完了、復元待ちの頂点は眠っている、に入る",
			"unverified だけの頂点で 25 時間動きがないものは眠っているに入り、23 時間なら作業中のまま",
			"頂点が復元待ちでもメンバーが working なら作業中の段に出て、眠っているに入らない",
		]
	}
	"R-05": {
		title: "頂点の行で相手と構成が分かる"
		text:  "各行に、種類のアイコン、状態の印、題名（なければ worktree の名前）、プロジェクトと Issue、理由の札、配下の数（動いている／全体）、経過（`elapsed.js`）を出す。行を押すと、その頂点の `/embed/agent?id=` を新しいタブで開く。"
		acceptance: [
			"行に題名・プロジェクト・Issue・理由の札・配下の数・経過が出る",
			"行のリンクが `/embed/agent?id=<頂点の id>` を新しいタブ（`_blank`、`noopener noreferrer`）で開く",
		]
	}
	"R-06": {
		title: "API を同じオリジンだけに配り、プロジェクトで絞れる"
		acceptance: [
			"`GET /api/apexes` が `orca-web.apexes/v1` を返し、別のオリジンは 403、GET 以外は 405",
			"`?project=<repo の id>` で、その repo の worktree にいる頂点と結べないものだけになり、counts は絞った後の items で数える（513 字以上は 400）",
		]
	}
	"R-07": {
		title: "画面がタブの題名に対応が必要の数を出し、見えない間は読まない"
		acceptance: [
			"対応が必要が2つなら題名が `(2) 指揮 — orca-web`、0なら `指揮 — orca-web`",
			"`document.hidden` の間はポーリングを止め、見えたらすぐ読む",
		]
	}
}

failures: {
	"F-01": {
		title: "状態の文書が使えないときは空の一覧と理由を返す"
		text:  "状態の読みの部品がない（起動の途中）ときは 503 `apexes_unavailable`。接続が `starting` のときは空の items と `stale: true`。"
	}
	"F-02": {
		title: "本文・パス・paneKey を文書に出さない"
		text:  "文書には会話の本文、最後の一言、worktree のパス、paneKey、terminalHandle を入れない（受け箱・要約と同じ方針）。"
	}
}

constraints: [
	"AGENTS.md の守ること（innerHTML を足さない、実行時の依存を足さない、Orca に読む要求のほか送らない）",
	"`orca-web.state/v1`・`/embed/*`・`/api/worktrees/summary` を変えない",
	"状態の決め方は `src/inbox/classify.ts` の `agentMark`・`agentWorkingMode` を使い、二重に持たない",
]

decisions: [
	"Epic epic-00075 の decisions をすべて引き継ぐ",
	"メンバーの許可待ちの猶予は 20 秒（Opus 5.5 のレビュアーの提案をタスク担当が採用、2026-11-25。自動の承認で一瞬だけ出る表示を拾わないため）",
	"取得元が古いときは状態を変えず帯と札で示す（純粋な関数は前の値を持たないため。古い間は文書が更新されないので完了への移り変わりも起きない）",
]
