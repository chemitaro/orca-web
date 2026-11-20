package spec

// 計画（Epic）。型 specdock/v1。

goal: "Antigravity と Gemini のエージェントが、orca-web の印・送信・チャット・状態で、Claude・Codex と同じ扱いで見えて操作できる。"

slices: {
	"iss-00066": {
		covers: ["R-01", "F-01"]
		text: """
			種類の表（D-01）：`web/embed/agent-marks-icons.js`、`web/embed/send-view.js`、`web/trial/` の見本、`test/web/` のテスト、README の部品の契約。
			SpecDock の iss-00674 がこの名前を読むので、先に入れる。マージの後、統括が常駐の orca-web を立て直す。
			"""
		session: "owner"
	}
	"iss-00067": {
		covers: ["R-02", "R-03", "F-02"]
		text: """
			送信の照合と回答（D-02）：`src/orca/send.ts`、`src/send/{service,keys}.ts`、`web/embed/question-view.js`、`test/orca/`・`test/send/`・`test/web/` のテスト。実物の確かめは、統括が用意する試しの送り先で行う。
			"""
		session: "owner"
	}
	"iss-00068": {
		covers: ["R-04"]
		text: """
			モデルと推論の深さ（D-03）：`src/state/normalize.ts` と `test/state/` のテスト。実物の状態の文書で出どころを確かめる。
			"""
		session: "owner"
	}
}

verification: """
	iss-00066：`iconKey` と `AGENT_ICONS` の単体テスト、印と送信の欄のテスト、試しの画面の写し（明・暗）、全テストと lint。
	iss-00067：照合とキーの組（または RPC）の単体テスト、答えられない形のテスト、試しの送り先での実物の確かめの記録、全テストと lint。
	iss-00068：normalize の単体テスト（Antigravity・Gemini の項目あり・なし、Claude・Codex は今どおり）、実物の状態の文書の確かめ、全テストと lint。
	最後に統括が、常駐の orca-web を立て直し、実際の Orca の Antigravity のエージェントで、印・送信・回答・モデルの表示を確かめる。
	"""

rollback: "各 Issue の PR を戻す。iss-00066 を戻すと印は中立の丸に、iss-00067 を戻すと Antigravity への回答はできなくなり、iss-00068 を戻すとモデルは出どころなしに戻る。"

exit: "iss-00066、iss-00067、iss-00068 が閉じ、常駐の orca-web で、Antigravity のエージェントのアイコン・名前・回答・モデルが確かめられた。"

execution: {
	sessions: {
		plan: {task: "Epic の仕様と切り分け（この記録）", model: "Opus 5.5", effort: "medium", rationale: "統括（方針の第2節、standard の統括）が自分で書いた"}
		owner: {task: "各 Issue のタスク担当", model: "Opus 5.5", effort: "medium（iss-00067 は high）", rationale: "方針の第2節：standard のタスク担当は medium、strict の iss-00067 は high。実装担当は Issue の計画で選ぶ（iss-00066 は画面の部品なので Opus 5.5 / medium、iss-00067・iss-00068 はテストで確かめられるサーバー側なので GPT-6.2 Sol / medium を推す）"}
	}
}
