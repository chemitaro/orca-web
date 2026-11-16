package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "数え方と並べ方だけを変え、送信と開く操作は変えない"
}

purpose: "Orca の構造化のセッション（構造化 Chat）1人を、orca-web の状態の API・要約・受け箱・稼働の印・`/embed/agent` で1人のエージェントとして出す。今は同じ1人が `chat:agent-session:<X>`（chat-tab）と `structured-agent-session-<X>:<leaf>`（untabbed）の2つに出て、印の数と受け箱の行が二重になる。"

background: """
	事実（タスク担当が 2026-11-16 に確かめた）：
	- 常駐の orca-web（main の 373a2c7 相当）の `GET /api/worktrees/summary` で、構造化 Chat のある3つの worktree が、それぞれ total 2（chat-tab 1 と untabbed 1）を数える。同じ時刻の状態の API で、untabbed の `structured-agent-session-…` の3つすべてが、同じ worktree の agent-session のタブの `sessionId` から Orca の式で作った paneKey と一致した（読むだけの確かめ、`.workbench/iss-00039/probe-sessions.ts`。識別子は記録に出さない）。
	- Orca v1.4.259（この Mac の版、タグ 980c0024）のソース：`src/shared/agent-session/view/structured-agent-session-projection.ts` の `structuredAgentSessionTabId(sessionId)` は `structured-agent-session-<sessionId>`、`structuredAgentSessionPaneKey(tabId, sessionId)` は `<tabId>:<leaf>`（leaf は sessionId の UTF-8 の sha256 の先頭16バイトの16進を `8-4-4-4-12` に分け、3つ目の先頭を `4`、4つ目の先頭を `a` に置き換えた形）。`structured-agent-session-host-tab-id.ts` の `structuredAgentSessionHostTabId(sessionId)` は `agent-session:<sessionId>`（ほかに再び開いたタブの `agent-chat-tab-v1-…` がある）。`structured-session-notification-pane.ts` は paneKey から sessionId を、この式で作り直して一致するときだけ解く。つまり Orca にとって、タブ（`session.tabs.listAll` の type agent-session、`sessionId`）と `worktree ps` の行（paneKey）は同じ1つのセッション。Orca の画面は、タブ1つと、サイドバーの ps の行1つで示す（`runtime-worktree-sidebar-status.ts` は ps の行を paneKey ごとに1つ数える）。
	- orca-web の `src/state/normalize.ts` は、タブから chat-tab を作り、どのタブにも使われなかった ps の行を untabbed にする。構造化 Chat の ps の paneKey は端末のタブ（`parentTabId:leafId`）と一致しないので、untabbed として2つ目が出る。
	- 両方の id での今の動き：送信（`src/send/target.ts` の `resolveTarget`）と会話（`src/orca/read-transcript.ts` の `resolveFromTabs`）は `chat:<タブの id>` だけを解き、untabbed の id には送信 `not_sendable`（理由 `untabbed`）、会話 `no_session` を返していた。Orca で開くは、chat-tab は worktree だけ、untabbed は開く口なし。`/embed/agent?id=` は、どちらの id でも状態から詳細を描いた（untabbed は会話と送信が使えない）。
	- 端末の worker の親（`parentPaneKey`）が構造化 Chat の統括を指すとき、その値は ps の paneKey（`structured-agent-session-…`）。今の詳細の「親」のリンクは untabbed を指す（2026-11-16 の状態で4件）。
	"""

includes: [
	"状態の正規化で、構造化 Chat のタブと、同じ worktree の ps の行のうち Orca の式で同じ sessionId を指すものを、1つのエージェント（chat-tab）にまとめる",
	"まとめたエージェントの paneKey を ps の paneKey にして、ps の親（parentPaneKey）と、タブにない値の補いを持たせる",
	"古い id（`structured-agent-session-…`）の `/embed/agent?id=` を、まとめたエージェントの id の同じ画面に転送する",
	"テスト（正規化、要約、受け箱、埋め込みの転送）",
	"常駐の orca-web と、この worktree の一時の orca-web を読むだけで並べ、直す前と後の要約の件数を report.md に残す",
	"README.md と AGENTS.md の更新",
]
excludes: [
	"端末のエージェント（terminal-tab、端末の untabbed）の数え方と id",
	"送信の経路、宛先の解き方、確認の項目、送れる・送れないの理由の種類",
	"会話の API の解き方",
	"Orca で開くの操作",
	"Run の木の worker と Orca のエージェントの結び方（構造化の worker の handle とエージェントの結び付け）",
	"状態の文書の版（`orca-web.state/v1` のまま。項目を足さない）",
	"SpecDock のリポジトリの変更（すべての印を出すのは SpecDock の iss-00602）",
]

requirements: {
	"R-01": {
		title: "構造化のセッション1人を、状態の API で1つのエージェントにする"
		text:  """
			`session.tabs.listAll` の type agent-session のタブ（`sessionId` を持つ）と、同じ worktree の `worktree ps` の行のうち paneKey が Orca の式 `structured-agent-session-<sessionId>:<leaf(sessionId)>` と完全に一致するものを、1つのエージェントにする。id は今の chat-tab の id `chat:<タブの id>`、kind は `chat-tab` のまま。一致した ps の行から untabbed を作らない。
			一致しない ps の行（別の worktree、タブのない構造化のセッション、端末）は今のまま untabbed にする。sessionId のないタブは今のまま chat-tab にし、何ともまとめない。
			"""
		acceptance: [
			"構造化 Chat のタブ1つと、それに一致する ps の行1つを与えると、状態の文書のエージェントは1つ（id `chat:<タブの id>`、kind chat-tab）で、`structured-agent-session-…` の id のエージェントがない",
			"ps の行が別の worktree にある、paneKey の leaf が式と違う、タブに sessionId がない、のどれでも、今と同じく2つ（chat-tab と untabbed）のまま",
			"端末のタブと端末の ps の行だけの録画の状態の文書が、変える前と同じ（既存のテストが変えずに通る）",
		]
	}
	"R-02": {
		title: "まとめたエージェントは、ps の paneKey と親とを持つ"
		text:  """
			まとめたエージェントの `paneKey` は ps の行の paneKey にする（端末の worker の `parentPaneKey` がそれを指す）。`parentPaneKey` は ps の行の値（取得元 worktreePs、項目 `agents.parentPaneKey`）。
			状態（state）・workingMode・stateStartedAt・agentType・title はタブの値を先に使い、タブにないときだけ ps の行の値で補う。state と workingMode は同じ取得元から取る（今の決まりのまま）。
			"""
		acceptance: [
			"まとめたエージェントの paneKey が ps の paneKey で、それを親に持つ端末の worker の詳細の「親」のリンクが `chat:<タブの id>` を指す",
			"タブに chatStatus があるとき state・workingMode はタブの値、ないとき ps の行の値（取得元 worktreePs）",
			"ps の行に parentPaneKey があるとき、まとめたエージェントの parentPaneKey がその値（取得元 worktreePs）",
		]
	}
	"R-03": {
		title: "要約・受け箱・稼働の印で1人に数える"
		text:  "`GET /api/worktrees/summary` の worktree ごとの agents と counts、`GET /api/inbox` のエージェントの行は、まとめたエージェントを1つだけ出す。状態の決め方（`agentMark`、`agentWorkingMode`）は変えない。"
		acceptance: [
			"構造化 Chat のある worktree の要約の counts.total が 1 で、agents が1つ（id `chat:<タブの id>`）",
			"受け箱に、そのエージェントの行が1つだけある",
			"実物：常駐の orca-web（直す前）と、この worktree の一時の orca-web（直した後）の要約を同じ時刻に読み、重複していた worktree の total が 2 から 1 になり、ほかの worktree の total が変わらないことが report.md に残る",
		]
	}
	"R-04": {
		title: "古い id の埋め込みの画面を壊さない"
		text:  """
			`GET /embed/agent?id=<structured-agent-session-…>` で、その id が今の状態のまとめたエージェントの paneKey と一致するとき、302 で `/embed/agent?id=<まとめたエージェントの id>` に転送する（ほかの検索の引数は順のまま保つ）。転送の先で、詳細、会話、送る欄、Orca で開くが、まとめたエージェントとして動く。一致しないとき、状態を読めないときは、今と同じく画面をそのまま返す（画面が「見つからない」を示す）。
			API（`/api/transcript`、`/api/send/*`、`/api/open`）は、まとめたエージェントの id で呼ぶ。古い id で呼ばれたときは、今の誤りの形（会話・送信は `agent_not_found`）で理由を示し、別の相手に送らない。
			"""
		acceptance: [
			"まとめたエージェントがある状態で、`/embed/agent?id=<その paneKey>&theme=dark` が 302、Location が `/embed/agent?id=<chat の id を encodeURIComponent した値>&theme=dark`",
			"一致しない `structured-agent-session-…` の id、`structured-agent-session-` で始まらない id、状態を読めないときは、今と同じ 200 の画面",
			"古い id での送信の意図は送らず、`agent_not_found` を返す（宛先を別の相手に解かない）",
		]
	}
}

failures: {
	"F-01": {
		title: "似た id を同じ相手と取り違えない"
		text:  "まとめるのは、同じ worktree で、paneKey が式で作った値と文字のまま完全に一致するときだけ。前方一致や sessionId の切り出しだけで決めない。同じ sessionId のタブが1つの worktree に2つあるときは、タブの順で最初のタブだけにまとめ、ほかのタブは今のまま chat-tab にする。"
	}
	"F-02": {
		title: "取得元が欠けても、今より悪くしない"
		text:  "タブの取得元が失敗したときは ps の行を今のまま untabbed にし、ps の取得元が失敗したときはタブを今のまま chat-tab にする。転送は状態を読めないときに行わない。"
	}
}

constraints: [
	"実行時の依存を足さない。sha256 は `node:crypto` を使う",
	"状態の文書の版と項目は変えない（sessionId を文書に出さない。読み取りの写し `OrcaTab` の中だけに持つ）",
	"送信・会話・開く口のアダプター（`src/orca/send*.ts`、`read-transcript.ts`、`open*.ts`）と `src/send/` を変えない",
]

decisions: [
	"1人のエージェントは、要約・状態の API・受け箱・Run の木・稼働の印のどこでも1つにする。Orca の画面が1つとして示すならそれに合わせる。もう一方の id で来た要求が動いていたなら壊さない（同じ相手として受けるか、理由を示す）。端末のエージェントの数え方は変えない（統括の決定、依頼書 2026-11-16）",
	"正の id は `chat:<タブの id>`：送信・会話の API が解けるのはこの id だけで、受け箱の開く口と今の埋め込みの URL もこれを使う。Orca の画面はタブ1つ・サイドバーの行1つで示し、両者は Orca の式で同じ sessionId を指す（タスク担当 2026-11-16、Orca v1.4.259 のソースと実機）",
	"古い id は、今まで動いていた `/embed/agent` の画面だけを転送で受ける。会話（`no_session`）と送信（`not_sendable`/`untabbed`）は古い id では前から動いていなかったので、`agent_not_found` で理由を示す（タスク担当 2026-11-16）",
	"Run の木は worker から節を作るので、この重複では節は増えていない。まとめたエージェントの paneKey で親子のリンクが正の id を指すことで足りる（タスク担当 2026-11-16）",
]
