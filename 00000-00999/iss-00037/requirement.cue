package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "リンクの開き方だけを変え、送信の守りは変えない"
}

purpose: "`/embed/agent` の中から、同じ iframe のまま別のエージェントへ移る道をなくす。SpecDock が選んだ相手 A の帯と題名のまま iframe の中が別の相手 B に変わり、利用者が B を A と思って送るおそれを根から断つ。"

background: """
	今の `web/embed/agent-dom.js` の `renderDetail` は、`/` で始まる href（親のエージェント `/embed/agent?id=…`）を `target="_self"` で、子のエージェントのリンク（`row.links`）を target も rel もなしで描く。どちらも iframe の中で別のエージェントの詳細に移る。PR のリンク（https だけ）は `_blank`。
	SpecDock の iss-00593 の仕様レビューで、ChatGPT がこれを P1 の残るリスクとした。SpecDock 側は、iframe の2回目の load を検知して外す守り（F-08）を並行して作っている（読むだけ）。
	`/embed/agent` の中でリンクを描くのは `renderDetail` だけ（会話の本文、ツールの出力、送る欄はすべて textContent で、リンクを作らない。詳細の見出しの印は onSelect なしで span）。ページを移す `location` の代入や `window.open` もない（2026-11-14 に rg で確かめた）。
	SpecDock のデザインシステムの「新しいタブで開く」の印：spec-dock（`67abbe6c1`）の `src/spec_dock/assets/dashboard/core/ui.js` の `ICONS.external`（viewBox 0 0 24 24、`M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5`、`svg.ds-icon` は 1em、線 currentColor、線の太さ 1.9、round）。`views/_shared/panel.js` は title と aria-label に「新しいタブで開く」を使う。orca-web には今、外部リンクの印はない。
	"""

includes: [
	"`/embed/agent` の詳細の中のリンク（親、子、PR）を、すべて `target=\"_blank\"`・`rel=\"noopener noreferrer\"` で描く",
	"新しいタブで開くことを示す小さな印（SpecDock の `external` の形）と、読み上げと title の「新しいタブで開く」",
	"`/embed/agent` の中のどのリンクも同じ iframe の中で移らないことを固めるテスト",
	"試しの画面か常駐の orca-web を読むだけで、親・子のリンクが新しいタブで開くことの写し",
	"README.md と AGENTS.md の更新",
]
excludes: [
	"`/embed/agent` の中の自分自身の操作（詳細の開閉、前を読む、ツールの折り畳み、送る欄、Orca で開く）の変更",
	"単独の画面（受け箱 `/`、状態の画面 `/settings`、Run の木と一覧、プロジェクトの画面）のリンクの開き方の変更",
	"リンクの行き先（`/embed/agent?id=…`、PR の https の URL）の変更",
	"送信、送る欄の守り、CSP、frame-ancestors、CORS の変更",
	"SpecDock のリポジトリの変更（2回目の load の守りは SpecDock の iss-00593）",
]

requirements: {
	"R-01": {
		title: "`/embed/agent` の中のリンクは、どれも新しいタブで開く"
		text:  "詳細の中の親、子（複数）、PR のリンクは、どれも `target=\"_blank\"` と `rel=\"noopener noreferrer\"` を持つ。`_self`、`_parent`、`_top`、target のないリンクを描かない。行き先の href は今のまま（親と子は `/embed/agent?id=…`、新しいタブでは iframe でない単独の詳細の画面として開く）。"
		acceptance: [
			"親・子・PR のある詳細を描くと、すべての a 要素が target `_blank` と rel `noopener noreferrer` を持ち、href が今と同じ",
			"`/embed/agent` が読む画面のスクリプト（agent-frame.js、agent-dom.js、agent-view.js、send-dom.js、send-view.js、open-control*.js、agent-marks*.js）に、`_self`・`_parent`・`_top`、`location` への代入・`location.assign`・`location.replace`・`window.open` がない",
			"実物の画面（試しの画面か常駐の orca-web）で、詳細の親と子のリンクが target `_blank` で、押すと新しいタブ（別の target）で開き、元の iframe の URL が変わらないことが写しと数で残る",
		]
	}
	"R-02": {
		title: "新しいタブで開くことが分かる小さな印を付ける"
		text:  "各リンクの文字の後に、SpecDock の `external` の形の小さな印（字の大きさ 1em ほど、線 currentColor、aria-hidden）を付ける。title に「新しいタブで開く」、読み上げには目に見えない文字「（新しいタブで開く）」を添える。印の形は1か所の表に置く。見た目は SpecDock のデザインシステムのまま（新しい色を足さない。リンクの色を変えない）。"
		acceptance: [
			"各リンクに、aria-hidden の svg（SpecDock の external の path と同じ）と、目に見えない「（新しいタブで開く）」の文字と、title「新しいタブで開く」がある",
			"印の形の表が1か所だけにある（出どころの1行つき）",
			"CSS が新しい色を足さず、印を文字の高さに合わせ、明暗の両方で見える（写し）",
		]
	}
	"R-03": {
		title: "自分自身の操作と単独の画面は変わらない"
		text:  "`/embed/agent` の中の詳細の開閉、前を読む、ツールの折り畳み、送る欄、Orca で開くの動きと、単独の画面（受け箱、状態の画面、Run の木と一覧、プロジェクトの画面）のリンクの開き方は今のまま。"
		acceptance: [
			"既存のテスト（受け箱、Run の木、状態の画面、送る欄、開く部品、サーバー）が変えずに通る",
		]
	}
}

failures: {
	"F-01": {
		title: "リンクの文字と href は信頼しないデータとして扱う"
		text:  "リンクの文字は textContent で入れ、印は createElementNS で描く（innerHTML を使わない）。href は今のとおり、エージェントは `agentHref`、PR は https だけ（`safeHref`）。"
	}
}

constraints: [
	"実行時の依存を足さない。素の ES Modules でビルドしない",
	"DOM は textContent と createElementNS だけで描く",
]

decisions: [
	"`/embed/agent` の中では、親・子を含む別のエージェントや別の画面へ移るリンクはすべて新しいタブで開く（`_blank`、`noopener noreferrer`）。新しいタブの行き先は orca-web の単独の詳細。単独の画面の開き方は今のまま。`/embed/agent` の中の自分自身の操作は変えない。印は既存の外部リンクの印（統括の決定 2026-11-14、依頼書）",
	"`/embed/agent` を iframe でなく直接タブで開いたときも、中のリンクは新しいタブで開く（iframe の中か外かを見分けない）。依頼書の「`/embed/agent` の中では…すべて」を、見分けの誤りで同じ iframe の中に移る道を残さない形で読む。「単独の画面」は受け箱・状態・Run・プロジェクトの画面と読む（タスク担当の解釈 2026-11-14。意味を変えない読み）",
	"印は orca-web に既存の外部リンクの印がないので、SpecDock のデザインシステムの `external` の形を写す（タスク担当 2026-11-14）",
]
