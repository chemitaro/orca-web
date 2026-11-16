package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"構造化 Chat の1人を、正規化の1か所でまとめ、下流（要約、受け箱、Run の木、印、埋め込み）を変えずに1人にする",
	"古い id の埋め込みの URL を、サーバーの1か所の転送で受ける",
]
current: "normalize.ts は、タブから chat-tab を作り、使われなかった ps の行を untabbed にする。構造化 Chat の ps の paneKey は端末のタブと一致しないため、同じ1人が2つに出る。"
target:  "normalize.ts が、構造化 Chat のタブの sessionId から Orca の式で paneKey を作り、同じ worktree の一致する ps の行を chat-tab にまとめ、untabbed を作らない。`/embed/agent?id=<古い id>` は正の id に 302 で転送する。"

design: {
	"D-01": {
		title: "読み取りの写しにタブの sessionId を持つ"
		text:  "`src/orca/read-state.ts` の `OrcaTab` に `sessionId: string | null` を足し、`pickTab` で `str(r.sessionId)` を拾う。状態の文書には出さない（`AgentState` に足さない）。ほかの項目は変えない。"
		satisfies: ["R-01"]
	}
	"D-02": {
		title: "Orca の式の paneKey を作る純な関数"
		text:  """
			`src/state/normalize.ts` に私的な `structuredPaneKey(sessionId: string): string` を置く。Orca v1.4.259 の `structuredAgentSessionPaneKey(structuredAgentSessionTabId(sessionId), sessionId)` と同じ：`createHash('sha256').update(sessionId, 'utf8')` の先頭16バイトの16進 hex を、`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}` にした leaf で、`structured-agent-session-${sessionId}:${leaf}`。出どころ（Orca のファイルと版）を1行のコメントで書く。
			テストは、Orca のソースの式を写した期待値（テストの中で同じ手順を書かず、固定の sessionId と、手で計算して書いた期待の文字列）で確かめる。
			"""
		satisfies: ["R-01", "F-01"]
	}
	"D-03": {
		title: "正規化で、構造化 Chat のタブと ps の行をまとめる"
		text:  """
			`normalizeState` のエージェントの組み立てを次の順にする。
			1. 今のとおりタブを読み、chat-tab を作る。そのとき、`tab.sessionId` があり、その worktree の ps の行（`psByPane` の worktreeId が同じ）に `structuredPaneKey(tab.sessionId)` と完全に一致する paneKey があり、その paneKey がまだ `usedPanes` にないとき、その ps の行をこの chat-tab にまとめ、paneKey を `usedPanes` に入れる（F-01：タブの順で最初のタブだけ）。
			2. 今のとおり、使われなかった ps の行から untabbed を作る（まとめた行は作らない）。
			まとめた chat-tab の値（R-02）：
			- `paneKey`：ps の paneKey。
			- `parentPaneKey`：`first([[ps.parentPaneKey, 'worktreePs', 'agents.parentPaneKey']])`。
			- `agentType`：`first([[tab.agent, 'tabs', 'agent'], [ps.agentType, 'worktreePs', 'agents.agentType']])`。
			- `state`：`first([[tab.chatState, 'tabs', 'chatStatus.state'], [ps.state, 'worktreePs', 'agents.state']])`。`workingMode` は state の取得元が worktreePs なら ps の値、そうでなければタブの値（terminalTab と同じ決まり）。
			- `stateStartedAt`：タブの値、なければ ps の値。
			- `title`：customTitle、title（タブ）、なければ ps の taskTitle（clipTitle）。
			- ほか（id、kind、tabId、terminalHandle、lastOutputAt、terminal、worker、model、effort）は今の chat-tab のまま。
			まとめない chat-tab は、今と同じ値（paneKey null、parentPaneKey no-source）。
			F-02：タブの取得元が失敗なら chat-tab がなく、ps の行は今のまま untabbed。ps の取得元が失敗なら `psByPane` が空で、chat-tab は今のまま。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01", "F-02"]
	}
	"D-04": {
		title: "古い id の埋め込みの画面を転送する"
		text:  """
			`src/server/app.ts` の静的な画面の処理で、pathname が `/embed/agent`、method が GET か HEAD、検索の引数 `id` が `structured-agent-session-` で始まり、`options.poller` があるとき、`await options.poller.snapshot()` の agents から `kind === 'chat-tab' && paneKey === id` のエージェントを探す。見つかれば 302、`location` は `/embed/agent?` に、元の引数の `id` の値だけをそのエージェントの id に置き換えた `URLSearchParams` の文字列（ほかの引数は順のまま）、`cache-control: no-store`、本文なし。見つからない、snapshot が例外を投げる、poller がないときは、今のとおり画面を返す。Host の守りは今のとおりすべての道の前に効く。CORS、CSP、frame-ancestors は変えない（転送の応答には画面の CSP を付けない。本文がないため）。
			`noteViewer` は呼ばない（画面の表示は見る人の印にしない今の決まりのまま）。
			"""
		satisfies: ["R-04", "F-02"]
	}
	"D-05": {
		title: "API は正の id だけを解く（変えない）"
		text:  "送信の `resolveTarget`、会話の `resolveFromTabs`、開く口は変えない。まとめたので古い id の untabbed が状態にないため、送信の意図は `isUntabbedAgent` に当たらず `resolveTarget` が `agent_not_found`、会話も `agent_not_found` になる。テストで送信の意図が送らずに `agent_not_found` を返すことを固める。"
		satisfies: ["R-04"]
	}
	"D-06": {
		title: "文書"
		text:  "README.md の状態の API（エージェントの kind）の説明と AGENTS.md の `src/state/` の normalize.ts の説明に、構造化 Chat のタブと ps の行を Orca の式の paneKey でまとめること、古い id の `/embed/agent` は転送することを1〜2行で足す。"
		satisfies: ["R-01", "R-04"]
	}
}

// 受け入れの見え方（seam）：
// - R-01・R-02・F-01・F-02：normalizeState に手書きの取得元（test/state/fixture.ts の形）を与え、文書のエージェントを数える（test/state/）。
// - R-03：同じ状態の文書から buildWorktreeSummary と buildInbox を作って数える（test/summary/、test/inbox/）。実物は常駐と一時の orca-web の要約の件数。
// - R-04：createApp に偽の poller を与え、`/embed/agent?id=…` の応答の status と location を見る（test/server/）。送信は SendService に状態の写しを与え、意図の結果を見る（test/send/ か test/server/send-api）。

compatibility: "状態の文書の版は変えない。まとめた chat-tab の paneKey が null から値になり、parentPaneKey が値を持つことがある（項目の意味は同じ）。`structured-agent-session-…` の id の untabbed は文書から消える。古い id の `/embed/agent` は転送で動き続ける。古い id での会話は `no_session` から `agent_not_found` に、送信の意図は `not_sendable`（untabbed）から `agent_not_found` に変わる（どちらも前から使えなかった）。"

risks: [
	"Orca が式を変えると、まとめが効かず今の2つに戻る（悪くはならない）。出どころのコメントと固定の期待値のテストで気づける",
	"SpecDock が古い id を保存して、要約の id と突き合わせていると、合わなくなる。SpecDock の iss-00602 は要約の id を毎回読むので、統括に報告で伝える",
]
