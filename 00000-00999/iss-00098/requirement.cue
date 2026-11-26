package spec

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "対応が必要の判定と Orca から読むものを足す。読むだけで既読にしない。誤りは表示に留まり、PR を戻せば元に戻る"
}

purpose: "未回答の質問（ask）と未解決の判断（gate）を、Orca の Dispatch の印（`projection.attention` の input・approval）だけで決めず、やり取りの記録（質問と返事）と判断の門の一覧という、より確かな事実と照らし合わせてから「対応が必要」にする。"

background: """
	利用者の指摘（2026-11-26）：yubisaki の統括が「対応が必要（未回答の質問）」なのに、実際には未回答の質問がない。読むだけで確かめると、配下のタスク担当（Dispatch ctx_89355b8d9655）に Orca は attention input を付けている。Orca の同梱のコードでは、input は DB の `question_threads` の `status = 'pending'` から付く。一方、`orchestration inbox --run`（Orca で access が reads の RPC。既読にしない）で読むと、その Dispatch が出した質問はすべて返事のスレッドを持ち（最新の質問にも返事が2回）、配下から受けた質問にもすべて返事があった。Orca の内部の印だけが閉じずに残っている。
	利用者の判断（2026-11-26）：いくつか情報を取れるなら、信憑性の高い事実に基づいた情報を表示に使う。
	今の判定：iss-00078 の A3（`src/apex/build.ts` の judgeWork）、iss-00091 の activity working の除外。
	"""

includes: [
	"印のある Dispatch のいる Run だけの `orchestration inbox --run <id> --limit 1000 --full --json`（Orca で access が reads の RPC。既読にしない）と、`orchestration gate-list --run <id>`（今の受け箱が使う読み）を、頂点の一覧のために読む",
	"ReadOnlyOrcaCli の許す命令に `orchestration inbox` を足す（`--run`・`--limit`・`--full`・`--json` だけ）",
	"A3 の ask・gate を、やり取りと門の事実で確かめてから数える",
	"返事済みの印を控えめに示す理由と、questions の `answered`",
]
excludes: ["本文の保存と表示（本文は Orca の自動の知らせかを見分けるためにその場で照らすだけで、値として持たない）", "統括の連絡を既読にすること", "Orca の印を書き換えること"]

requirements: {
	"R-01": {
		title: "本当の返事の付いた質問は対応が必要にしない"
		text: """
			Dispatch D に attention input があるとき、その Dispatch の Run のやり取りを読む。D が送り手（`from_handle` が `dispatch:<D>`）で種類が `question` のメッセージのうち最も新しいものを Q とする。次のすべてを満たすメッセージが1つ以上あれば「返事済み」とする。
			- `thread_id` が Q の id で、id が Q と違い、`created_at` が Q より後
			- 宛先（`to_handle`）が `dispatch:<D>`（質問した本人が別の名で Run に送る追いの発言は数えない）
			- 本文が Orca の自動の知らせでない（R-05）
			返事済みなら A3 の材料にしない。頂点の理由に `question_answered`（「質問の印あり（返事済み）」）を足すが、対応が必要の段には入れない。
			返事がなければ、今のとおり A3 とする（activity working の除外も今のとおり）。
			やり取りを読めないときは、今のとおり Orca の印を信じる。読めないとは、読みの失敗、Run が見つからない、形が違う、やり取りの中に D の質問がない、のどれか。
			"""
		acceptance: [
			"attention input の Dispatch の最新の質問に、本人あての自動の知らせでない返事があると、90 秒を過ぎても対応が必要にならず、理由 question_answered が付く",
			"返事が Orca の自動の知らせだけ、または本人が Run に送った追いの発言だけなら、今のとおり 90 秒で対応が必要（question）",
			"やり取りを読めないときは、今のとおり対応が必要（question）",
		]
	}
	"R-02": {
		title: "判断の門は門の一覧で確かめる"
		text:  "Dispatch D に attention approval があるとき、その Run の `gate-list` を読み、D の task に `status` が pending の門があるときだけ A3 の gate の材料にする。門の一覧を読めないときは Orca の印を信じる。pending の門がなければ理由 `decision_resolved`（「判断の印あり（門は解決済み）」）を足す。"
		acceptance: ["attention approval でも、その task に pending の門がなければ対応が必要にならない"]
	}
	"R-03": {
		title: "読む量を抑え、既読にせず、本文を持たない"
		text:  "やり取りと門の一覧は、attention input か approval のある Dispatch のいる Run だけを読む（今の実データでは数個）。orchestration の読みの世代ごとに1回で、同じ世代では読み直さない。読みは `orchestration inbox --run … --full`（Orca の reads の RPC。getInbox を返すだけで既読にしない。`--full` がないと thread_id・created_at・生の from_handle が出ない）と `gate-list --run` だけで、`check` や `--ack` を使わない。読んだ行から持つのは id・type・from_handle・to_handle・thread_id・created_at と、本文が自動の知らせかの真偽だけ。本文・件名・payload は持たず、`orca-web.state/v1` にも出さない。"
		acceptance: [
			"ReadOnlyOrcaCli が `orchestration inbox` を `--run`・`--limit`・`--full`・`--json` だけで通し、ほかの引数（`--terminal` を含む）を拒む",
			"読みの結果の値に body・subject・payload がない",
		]
	}
	"R-04": {
		title: "対応のカードに返事済みを示す"
		text:  "questions の各項目に `answered: true|false|null`（null は確かめられない）。返事済みの ask と解決済みの gate はカードに「返事済み」「門は解決済み」と添え、対応が必要の色にしない。"
		acceptance: ["返事済みの ask のカードに「返事済み」が付く"]
	}
	"R-05": {
		title: "Orca の自動の知らせを返事に数えない"
		text: """
			Orca v1.4.272 の同梱のコード（orcad-server.js）は、質問に答えがないまま次のような知らせを、本物の答えと同じ送り手（`run:<id>`）・件名・種類・thread_id で入れる。
			- 統括が答えずに止まった
			- 統括が読む前に質問が取り下げられた
			- Run を統括する者がいない
			- ペアの相手の質問が答えられない
			本文がこれらの文（文の型）に当たるメッセージは、返事に数えない。本文が文字列でないメッセージも返事に数えない。
			"""
		acceptance: ["4つの文のどれかに当たる本文の返事だけでは返事済みにならない", "本文のない返事は返事済みにしない"]
	}
}

failures: {
	"F-01": {title: "読めないときは今の判定", text: "やり取りや門の一覧を読めない・形が違うときは、Orca の印のとおり判定する（見落としより誤報を選ぶ）。"}
}

constraints: ["AGENTS.md の守ること（統括の連絡を既読にする読み方を足さない。本文を拾わない）", "`orca-web.state/v1` を変えない"]
decisions: [
	"信憑性の高い事実に基づいた情報を表示に使う（利用者、2026-11-26、会話）",
	"`orchestration inbox` は Orca の同梱のコードで access が reads（getInbox を返すだけ）で既読にしないことを確かめた（タスク担当、2026-11-26）",
	"inbox は新しい順に返る（sequence の降順）。1,000 件の窓の中にある質問なら、その後の返事も窓の中にある（タスク担当、2026-11-26、読むだけで確かめた）",
	"実データでは、返事のスレッドに、質問した構造化 Chat の作業者が別の名（structworker_…）で Run に送る追いの発言が入る。そのため宛先で返事を見分ける（タスク担当、2026-11-26）",
	"本文は自動の知らせの見分けにだけその場で使う。spec review round-1 の P1・P2 への対応（タスク担当、2026-11-26）",
]
