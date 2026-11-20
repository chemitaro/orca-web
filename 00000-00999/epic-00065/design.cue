package spec

// 設計（Epic）。型 specdock/v1。

goals: [
	"種類ごとの違いは、表示は `AGENT_ICONS`・`iconKey` の1か所、送信は照合とキーの組の1か所、状態は `normalize.ts` の読み取りの1か所に閉じる",
	"実物の Antigravity で確かめた事実だけで、照合と回答の手段を決める",
]

current: """
	- 表示：`web/embed/agent-marks-icons.js`（`AGENT_ICONS`、`iconKey`）を `agent-marks-view.js`・`send-view.js` が使い、`agent-marks.js` が書き出す。SpecDock は書き出しを読む。
	- 送信：`src/orca/send.ts`（受け取りの確かめ、前面のプロセスの照合）、`src/send/service.ts`（`KEY_AGENTS`、回答の RPC `agentSession.respondToQuestion`・`respondToApproval`）、`src/send/keys.ts`（Claude と Codex のキーの組）、`web/embed/question-view.js`（答えられない形の判定）。
	- 状態：`src/state/normalize.ts`（モデルは起動の記録、推論の深さは Claude の `agentStatus.providerSession.effort` だけ）。
	"""

target: """
	- iss-00066：`AGENT_ICONS` に `antigravity`・`gemini`、`iconKey` の場合分け、`send-view.js` の `typeName` が表の名前を使う。
	- iss-00067：実物で確かめた照合と回答の手段。
	- iss-00068：実物で確かめたモデルと推論の深さの出どころ。
	"""

design: {
	"D-01": {
		title: "種類の表を広げる（iss-00066）"
		text: """
			`iconKey` の戻りの型に `antigravity`・`gemini` を足し、`AGENT_ICONS` に2つの項目を、今の形（`label`、`viewBox`、`paths`）で足す。
			`send-view.js` の `typeName` は、`iconKey` が `other`・`none` でなければ表の `label` を使う（今の `claude`・`codex` の決め打ちをやめる）。
			試しの画面（`web/trial/`）の見本に Antigravity と Gemini を足し、統括が写しで確かめられるようにする。
			"""
		satisfies: ["R-01", "F-01"]
	}
	"D-02": {
		title: "Antigravity の送信の照合と回答（iss-00067）"
		text: """
			タスク担当は、仕様を書く前に、統括に試しの送り先（Antigravity のエージェント）を `ask` で頼み、実物で次を確かめる：前面のプロセスの名前、質問の画面の形（選択肢、複数選択、自由記述）、Orca の回答の RPC が Antigravity の質問に効くか、効かなければ端末のキーで選べるか。
			RPC が効くなら RPC を、効かなければキーの組（`keys.ts` に Antigravity の組を、Claude・Codex と同じ形で）を使う。照合の場合分けは `send.ts` の1か所に足す。
			"""
		satisfies: ["R-02", "R-03", "F-02"]
	}
	"D-03": {
		title: "Antigravity と Gemini のモデルと推論の深さ（iss-00068）"
		text: """
			Orca の `agentStatus`・`providerSession`・起動の記録のうち、Antigravity と Gemini でモデルと推論の深さを持つ項目を、実物の Antigravity のエージェントの状態の文書で確かめる。あれば `normalize.ts` の読み取りに、出どころの名前つきで足す。
			"""
		satisfies: ["R-04"]
	}
}

compatibility: """
	書き出しの形（`AGENT_ICONS`、`iconKey`、要約の版）は変えず、値を足すだけ。古い SpecDock は名前の表を読まないので、今どおり生の文字列を出す。
	"""

risks: [
	"Antigravity のアイコンの、ライセンスの確かめられる出どころがない可能性がある。そのときは自前の中立の形で、名前だけを出す（制約）",
	"Antigravity の質問の画面が Claude・Codex と違い、キーの組で安全に答えられない可能性がある。そのときは答えられない理由を示して送らない側に倒し、報告書に残す",
	"Antigravity は構造化のセッション（Chat）として動くことがある。端末のキーの経路と RPC の経路のどちらが使われるかを、実物で確かめる",
]
