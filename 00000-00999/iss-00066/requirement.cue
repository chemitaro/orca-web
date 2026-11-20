package spec

// 要件（Issue）。型 specdock/v1。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "表示だけを変える。誤りはアイコンや名前の誤りにとどまり、版を戻せば回復できる"
}

purpose: """
	`agentType` が `antigravity`・`gemini` のエージェントの稼働の印、送信の欄、チャットに、それぞれのアイコンと名前（『Antigravity』『Gemini』）を出す。
	親の epic-00065 の R-01・F-01 を、この Issue が受け持つ（D-01）。
	"""

background: """
	統括の依頼書（2026-11-20）と epic-00065 の background による。Orca 1.4.263 は Antigravity を `agentType: "antigravity"`、Gemini CLI を `"gemini"` で報告する。
	今の `iconKey` はこの2つを `other`（中立の丸）にし、送信の欄の `typeName` は `agentType` の文字のまま出す。
	SpecDock の iss-00674 が `AGENT_ICONS[iconKey(t)].label` を読むので、書き出しの形を変えずに値を足す。

	アイコンの出どころを確かめた事実（2026-11-20、stablyai/orca main 5e7ceb61eb028e3d62a6664ebfba8adfb60ad8e8、LICENSE は MIT）：
	- Gemini：`src/renderer/src/components/status-bar/accounts/provider-icons.tsx` の `GeminiIcon` に、星の形の path（viewBox `0 0 65 65`）と、その中を塗る多色のぼかし（mask・filter）がある。
	- Antigravity：ベクターのアイコンはない。`src/shared/agent-icons/antigravity.png`（64×64、コミット 371d71a「bundle agent icons instead of loading them from Google's favicon service」で同梱）だけがある。形は左右対称のアーチ（裾の開いた『Λ』）で、色は青から上の虹色へのグラデーション。いちばん多い色は `#3587FF` 付近（不透明の画素の数え上げ）。
	- Gemini の PNG（`src/shared/agent-icons/gemini.png`）でも、いちばん多い色は `#3186FF`。
	"""

includes: [
	"`iconKey` に `antigravity`・`gemini` の振り分けを足し、`AGENT_ICONS` に2つの項目（label・viewBox・paths）を足す",
	"送信の欄の種類の名前を、表の `label` から取る",
	"試しの画面の見本に Antigravity と Gemini を1つずつ足す",
	"README の部品の契約（種類のアイコンと出どころ）の更新",
]

excludes: [
	"送信の照合と回答（iss-00067）、モデルと推論の深さ（iss-00068）",
	"状態の色（印の縁や点）の変更",
	"モデルごとのアイコン",
	"SpecDock の画面の変更（spec-dock の epic-00672）",
]

requirements: {
	"R-01": {
		title: "Antigravity と Gemini のエージェントの印に、それぞれのアイコンと名前が出る"
		text: """
			`agentType` が `antigravity` の印に Antigravity の、`gemini` の印に Gemini のアイコンを出し、読み上げと title の名前を『Antigravity』『Gemini』にする。
			名前とアイコンは `AGENT_ICONS` の1か所だけに置き、書き出し（`AGENT_ICONS`、`iconKey`、`agent-marks.js` の export）の形は変えない。
			"""
		acceptance: [
			"`iconKey('antigravity')` が `antigravity`、`iconKey('gemini')` が `gemini` を返し、`AGENT_ICONS` にそれぞれの `label`（『Antigravity』『Gemini』）・`viewBox`・`paths` がある",
			"合成の要約の Antigravity と Gemini のエージェントの印に、それぞれの表の path の svg があり、読み上げの名前が『Antigravity、…』『Gemini、…』で始まる",
			"アイコンの出どころ（stablyai/orca の MIT、ファイル、コミット、写し方）と商標の注が、今の Claude・Codex と同じく表の注と README に書かれている",
			"試しの画面の写し（幅 1280 と 390、明と暗）で、Antigravity と Gemini のアイコンが面の上で見分けられ、互いにも、ほかの種類の丸とも見分けられる",
		]
	}
	"R-02": {
		title: "送信の欄の種類の名前が、表の名前になる"
		text: """
			送信の欄の placeholder などの種類の名前は、`iconKey` が `other`・`none` でなければ `AGENT_ICONS` の `label` を使う（今の `claude`・`codex` の決め打ちをやめる）。
			"""
		acceptance: [
			"`agentType` が `antigravity` の送信の欄の placeholder が『Antigravity に送る』で始まり、`gemini` なら『Gemini に送る』で始まる",
			"Claude・Codex の placeholder は今のまま",
		]
	}
}

failures: {
	"F-01": {
		title: "知らない種類は、今どおり中立の『ほかの種類』"
		text:  "Antigravity・Gemini・Claude・Codex のほかの種類（例 `opencode`、文字でない値）は、今どおり `other` のアイコンと、送信の欄では `agentType` の文字（40字まで）で出す。種類がなければ `none`。"
	}
}

constraints: [
	"表の値は viewBox と path の決めた項目だけ（DOM は createElementNS で作り、innerHTML を使わない）。塗りは単色だけで、グラデーション・mask・filter を持たない",
	"状態の色（印の縁や点）と、印の大きさや並びは変えない",
	"公開のリポジトリの文書とテストに、この PC の実際のパスやセッションの id を書かない",
	"実行時の依存を足さない",
]

decisions: [
	"2026-11-20 統括（依頼書）：名前とアイコンは `AGENT_ICONS` の1か所。`iconKey` は `antigravity` → `antigravity`、`gemini` → `gemini`。書き出しの形は変えない",
	"2026-11-20 統括（依頼書）：`typeName` は `iconKey` が `other`・`none` でなければ表の `label` を使う",
	"2026-11-20 統括（依頼書）：色は、ロゴが多色やグラデーションなら出どころの主な単色を選ぶ。状態の色は変えない",
	"2026-11-20 タスク担当：Gemini は Orca の `GeminiIcon` の星の path をそのまま写し、塗りは主な単色 `#3186FF`（Orca の Gemini の PNG で最も多い色、ぼかしの青と同じ）にする",
	"2026-11-20 タスク担当：Antigravity は Orca にベクターがなく PNG だけなので、Orca の同梱の PNG（MIT の配布物）の輪郭（不透明の部分）を写して path にし、塗りは最も多い色 `#3587FF` にする。統括の決定3の『stablyai/orca から写す』に当たると判断した（公式の資料のベクターでライセンスの確かめられるものは探していない）。報告書の逸脱と判断に書き、統括に報告する",
	"2026-11-20 タスク担当：Gemini と Antigravity は同じ系統の青になるが、形（四つ角の星とアーチ）で見分ける。写しで確かめる",
]
