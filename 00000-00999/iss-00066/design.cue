package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"種類ごとの違いは `web/embed/agent-marks-icons.js` の `AGENT_ICONS`・`iconKey` の1か所に閉じる",
	"書き出しの形を変えず、値を足すだけにする",
]

current: """
	- `iconKey(agentType)`：`claude`・`claude-agent-teams` → `claude`、`codex` → `codex`、null・undefined・'' → `none`、ほか → `other`。
	- `AGENT_ICONS`：`claude`・`codex`・`other`・`none`。`agent-marks-view.js` が `iconKey` と表から印のアイコンと読み上げの名前を作り、`agent-marks.js` が書き出す。
	- `send-view.js` の `typeName`：`iconKey` が `claude`・`codex` のときだけ表の `label`、ほかは `agentType` を40字までの文字のまま。
	- `web/trial/trial-view.js` の `stateSamples`：working（claude）、monitoring（claude）、done（codex）の3つ。
	"""

target: """
	- `iconKey`：上に `antigravity` → `antigravity`、`gemini` → `gemini` を足す（ほかは今のまま）。JSDoc の戻りの型も足す。
	- `AGENT_ICONS`：`antigravity`・`gemini` の2つを、今と同じ形（`label`、`viewBox`、`paths` の `d`・`fill`・`fillRule`）で足す。
	- `typeName`：`iconKey` が `other`・`none` でなければ表の `label`。
	- `stateSamples`：Antigravity と Gemini の見本を1つずつ足す。
	"""

design: {
	"D-01": {
		title: "種類の表に Antigravity と Gemini を足す"
		text: """
			`web/embed/agent-marks-icons.js`：
			- `gemini`：`{label: 'Gemini', viewBox: '0 0 65 65', paths: [{d: <GeminiIcon の star の d をそのまま>, fill: '#3186FF'}]}`。mask・filter・多色のぼかしは写さない。
			- `antigravity`：`{label: 'Antigravity', viewBox: '0 0 64 64', paths: [{d: <PNG の輪郭の path>, fill: '#3587FF'}]}`。path は Orca の `src/shared/agent-icons/antigravity.png`（64×64）の不透明の部分（alpha > 127）の輪郭を、左右対称のアーチとして3次ベジェで写す（頂点 (32,0) 付近、内側の頂点 (32,34) 付近、両裾は画像の下の端に届く）。写した path を同じ 64×64 で塗った形が、PNG の不透明の部分と目で見て同じ形になること（ブラウザーで重ねて確かめる）。
			- 表の上の注に、Gemini と Antigravity の出どころ（stablyai/orca、MIT、ファイル、コミット 5e7ceb61eb028e3d62a6664ebfba8adfb60ad8e8、Antigravity は PNG の輪郭を写した path であること、色はそれぞれの主な単色）と商標（Google LLC の商標）を書く。
			- `iconKey` に2つの振り分けを足し、JSDoc の戻りの型を `'claude' | 'codex' | 'antigravity' | 'gemini' | 'other' | 'none'` にする。
			印の DOM（`agent-marks-view.js`・`agent-marks-dom.js`）は表を引くだけなので変えない。
			"""
		satisfies: ["R-01", "F-01"]
	}
	"D-02": {
		title: "送信の欄の種類の名前を表から取る"
		text: """
			`web/embed/send-view.js` の `typeName`：文字でなければ null。`iconKey` が `other`・`none` でなければ `AGENT_ICONS[icon].label`、そうでなければ `agentType.slice(0, TYPE_LABEL_MAX)`。
			"""
		satisfies: ["R-02", "F-01"]
	}
	"D-03": {
		title: "試しの画面の見本と README"
		text: """
			`web/trial/trial-view.js` の `stateSamples` に `sample('antigravity', 'waiting', null, 'antigravity', 30)` と `sample('gemini', 'working', null, 'gemini', 2)` を、今の3つの後に足す（id は `sample:antigravity`・`sample:gemini`）。
			README の稼働の印の節の『種類はアイコン（…）』と出どころの行に、Antigravity と Gemini を足す（タスク担当が書く）。
			"""
		satisfies: ["R-01"]
	}
}

compatibility: """
	書き出しの名前と形は変えず、`AGENT_ICONS` の鍵と `iconKey` の戻りの値が2つ増えるだけ。古い SpecDock は名前の表を読まないので影響しない。
	`iconKey` が `other` を返していた `antigravity`・`gemini` は、新しい鍵を返す（この Issue の意図した変更）。
	"""

risks: [
	"Antigravity の写しの path が PNG と形がずれる：ブラウザーで PNG と重ねて確かめ、写しで見分けられることを確かめる",
	"Gemini と Antigravity が同じ系統の青で並ぶ：形で見分ける。写しで見分けにくければ、タスク担当が統括に問う",
]
