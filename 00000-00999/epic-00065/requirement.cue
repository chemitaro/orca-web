package spec

// 要件（Epic）。型 specdock/v1。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "稼働の印のアイコンと名前、送信と回答、状態の読み取りを Antigravity と Gemini に広げる。送信の誤りの危険は、その Issue（iss-00067）を strict にして扱う"
}

purpose: """
	Orca に Antigravity CLI（`agy`）が入り、Gemini などのモデルのエージェントが動くようになった。
	orca-web の稼働の印、送信の欄、チャット、状態の読み取りで、Antigravity と Gemini のエージェントを、Claude・Codex と同じ扱いで見て操作できるようにする。
	"""

background: """
	本人の依頼（2026-11-20）：Orca に Antigravity CLI を導入した。SpecDock と orca-web が対応しているかを確かめ、足りないところを直す。SpecDock 側は spec-dock の epic-00672 が持つ。

	統括が確かめた事実（2026-11-20、orca-web main 58275ea、Orca 1.4.263、agy 1.5.12）：
	- Orca は Antigravity のエージェントを `agentType: "antigravity"`、Gemini CLI を `"gemini"` で報告する。モデルは `agentType` に入らない。
	- 種類のアイコンの表 `web/embed/agent-marks-icons.js` の `AGENT_ICONS` は `claude`・`codex`・`other`・`none` だけで、`iconKey` は `claude`・`claude-agent-teams`・`codex` のほかを `other`（中立の丸）にする。テストも `iconKey('gemini') === 'other'` を確かめている。
	- 送信の欄の種類の名前 `web/embed/send-view.js` の `typeName` は、Claude・Codex のほかを `agentType` の文字のまま出す。
	- 送信の受け取りの確かめ `src/orca/send.ts:68` は `antigravity` を受け付けるが、端末のプロセスの照合 `send.ts:319` は `claude`・`codex` だけを知る。
	- 質問に答えるキーの組は `claude`・`codex` だけ（`src/send/service.ts:79` の `KEY_AGENTS`、`src/send/keys.ts:157`・`196`、`web/embed/question-view.js:631`）。Antigravity の質問には、ダッシュボードから答えられない。
	- 推論の深さ（effort）を読むのは Claude だけ（`src/state/normalize.ts:376`）。モデルは worker の起動の記録からだけ読む。
	"""

includes: [
	"稼働の印・送信の欄・チャットで、Antigravity と Gemini のアイコンと名前を出す",
	"Antigravity のエージェントへの送信で、端末のプロセスを照合し、質問に答える手段（キーの組、または Orca の回答の RPC）を作る",
	"Antigravity と Gemini のエージェントのモデルと推論の深さを、Orca が出していれば状態に出す",
]

excludes: [
	"モデルごとのアイコン（印は種類ごと。統括の決定、2026-11-20。decisions）",
	"SpecDock の画面の変更（spec-dock の epic-00672）",
	"Gemini CLI への送信と回答（Orca が Gemini CLI を送信の対象として報告するかを iss-00067 で確かめ、報告するなら別の Issue にする）",
]

requirements: {
	"R-01": {
		title: "Antigravity と Gemini のエージェントの印に、それぞれのアイコンと名前が出る"
		text: """
			`agentType` が `antigravity` の印に Antigravity の、`gemini` の印に Gemini のアイコンを出し、読み上げと title の名前を『Antigravity』『Gemini』にする。
			送信の欄の種類の名前（placeholder など）も同じ名前にする。名前とアイコンは `AGENT_ICONS` の1か所だけに置き、書き出しの形は変えない（SpecDock の epic-00672 の iss-00674 が `AGENT_ICONS[iconKey(t)].label` を読む）。
			"""
		acceptance: [
			"`iconKey('antigravity')` が `antigravity`、`iconKey('gemini')` が `gemini` を返し、`AGENT_ICONS` にそれぞれの `label`・`viewBox`・`paths` がある",
			"合成の要約の Antigravity と Gemini のエージェントの印に、それぞれのアイコンがあり、読み上げの名前が『Antigravity、…』『Gemini、…』になる",
			"送信の欄の placeholder が『Antigravity に送る』になる",
			"アイコンの出どころ（ライセンス、コミット）が、今の Claude・Codex と同じく表の注に書かれている",
		]
	}
	"R-02": {
		title: "Antigravity のエージェントへの送信で、端末のプロセスを照合できる"
		text: """
			端末へのキーの送信で、`agentType` が `antigravity` の端末の前面のプロセスが Antigravity のもの（実物で確かめた名前）なら照合が合う。
			"""
		acceptance: [
			"実物の Antigravity の端末で確かめたプロセスの名前で照合が合い、ほかの名前（シェルなど）では合わない（テスト）",
		]
	}
	"R-03": {
		title: "Antigravity のエージェントの質問に、チャットから答えられる"
		text: """
			Antigravity のエージェントが質問（選択肢の問い）を出したとき、チャットの質問の欄から答えを送れる。手段は、実物の Antigravity の質問の画面と Orca の RPC（`agentSession.respondToQuestion` など）を確かめて決める。
			答えられない形の問い（手段が対応しない複数選択など）は、今の Claude・Codex と同じく、答えられない理由を示して送らない。
			"""
		acceptance: [
			"実物の Antigravity の質問で、チャットから選んだ答えがエージェントに届き、その答えで作業が続く（統括が用意した試しの送り先で確かめ、記録を残す）",
			"手段が対応しない形の問いでは、送らずに理由が出る（テスト）",
		]
	}
	"R-04": {
		title: "Antigravity と Gemini のエージェントのモデルと推論の深さが、Orca が出していれば状態に出る"
		text: """
			Orca が Antigravity・Gemini のエージェントのモデルと推論の深さを出していれば（タブの状態、プロバイダーのセッション、起動の記録など）、状態の文書の各エージェントの `model`・`effort` に出す。出していなければ、今どおり『出どころなし』のまま。
			"""
		acceptance: [
			"実物の Antigravity のエージェントで、Orca の出す項目を確かめた結果が報告書にあり、出していれば状態にモデル（例：Gemini 3.8 Flash）が出る",
			"Claude・Codex の今の読み取りが変わらない（今のテストがそのまま通る）",
		]
	}
}

failures: {
	"F-01": {
		title: "知らない種類は、今どおり中立の『ほかの種類』"
		text:  "Antigravity・Gemini・Claude・Codex のほかの種類は、今どおり `other` のアイコンと `agentType` の文字で出す。"
	}
	"F-02": {
		title: "照合や回答の手段が確かめられないときは、送らない"
		text:  "前面のプロセスが Antigravity と確かめられない、または質問の形が手段に合わないときは、キーも回答も送らず、今の『送れない』の理由を返す（推測で送らない）。"
	}
}

constraints: [
	"アイコンは、ライセンスが確かめられる出どころ（stablyai/orca の MIT のアイコン、または公式の資料の素材）から写し、出どころと商標の注を表に書く。確かめられなければ、自前の中立の形にして名前だけを出す",
	"アイコンの表の DOM の作り方（createElementNS、innerHTML を使わない）を変えない",
	"送信の試しは、統括が用意した試しの送り先にだけ送り、作業中のエージェントに送らない",
	"公開のリポジトリの文書とテストに、この PC の実際のパスやセッションの id、プロンプトの本文を書かない",
]

decisions: [
	"2026-11-20 本人：統括の推奨のとおり、orca-web と SpecDock の両方で Antigravity と Gemini への対応を行う。",
	"2026-11-20 統括：アイコンと名前は種類（道具）ごとにする。Antigravity と Gemini は別の種類として別のアイコンにする（Gemini CLI と Antigravity CLI は別の道具）。色は、出どころのロゴの色に従う（Claude と同じ扱い）。",
	"2026-11-20 統括：iss-00066（表示）、iss-00067（送信と回答、strict）、iss-00068（状態の読み取り）の3つに分け、書く範囲が重ならないので並べて進める。iss-00066 を先に入れる（SpecDock の iss-00674 が待つ）。",
]
