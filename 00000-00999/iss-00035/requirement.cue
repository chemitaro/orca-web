package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "ボタンの見た目だけを変え、開く操作と守りは変えない"
}

purpose: "「Orca で開く」のボタンを、Orca のアイコンと Open の小さなボタン1つにそろえ、狭い所（SpecDock の横の欄の見出しの右端、iss-00592）にも置けるようにする。"

background: """
	本人の要望（2026-11-14）：今の「Orca で開く」は見た目がよくなく、文字が長い。もっとコンパクトにスマートに、わかりやすいアイコンとボタンにしたい。例：Orca のマークに Open。文字の多い詳細の画面でも、Open のようなシンプルな表記がよい。
	今のボタンは3か所に別々の実装がある：埋め込みのボタン（`web/embed/open-button.*`、iframe の既定の幅 260、結果は横の文字）、詳細とチャットの見出し（`web/embed/agent.html` の `#open` と `#open-status`）、受け箱の項目（`web/inbox-dom.js` の `.open` と `.open-status`）。結果の言葉の表は open-button-frame.js、inbox.js、agent-frame.js に3つある。試しの画面（`web/trial/`）は埋め込みのボタンを使う。
	Orca のロゴ：stablyai/orca（MIT、Lovecast Inc.）の `resources/logo.svg`（タグ v1.4.258、コミット c91a7a6ee3dc76090cafb33943961ae2235246d6）。1つの path、viewBox 0 0 318.60232 202.66667、translate(-6.6666669,-70.666669)。ロゴは Orca の商標で、MIT の許諾に含まれない（iss-00027 の Claude・Codex と同じ扱い）。
	SpecDock のデザインシステム（spec-dock の `src/spec_dock/assets/dashboard/app.css`）：`.chip` は 1px の線、角丸 4px（`--ds-radius-s`）、字の太さ 700、12.5px。フォーカスは `--ds-focus`。
	"""

includes: [
	"Orca のアイコンと Open の、1つの共有の部品（DOM の組み立てと、結果の言葉と状態を決める純粋な関数）と、その CSS",
	"Orca のロゴを、稼働の印のアイコンの表と同じファイル（`web/embed/agent-marks-icons.js`）の1か所の表に置く",
	"埋め込みのボタン（`/embed/open-button.js` と iframe）、`/embed/agent` の見出し、受け箱の項目を、共有の部品に置き換える。試しの画面は埋め込みのボタンを通して新しい形になる",
	"埋め込みのボタンの iframe の既定の幅と高さを、中身に合わせる。アイコンだけの形（`data-label=\"none\"`）を足す",
	"README.md と AGENTS.md の更新",
]
excludes: [
	"開く操作（`POST /api/open`、`OpenService`、タブの選び方）と守り（Host、同じオリジン、短期のトークン、frame-ancestors、CSP）の変更",
	"Run の木（`/runs/<id>`）とプロジェクトの画面（`/projects/<id>`）に開く操作を足すこと（前の Issue の決定。統括の答え 2026-11-14）",
	"幅 390px 以下で出さない決まりの変更",
	"SpecDock のリポジトリの変更（横の欄に置くのは spec-dock の iss-00592）",
]

requirements: {
	"R-01": {
		title: "ボタンは、Orca のアイコンと見える文字 Open の1つの形になる"
		text:  "埋め込みのボタン、詳細とチャットの見出し、受け箱の項目のボタンは、どれも左に Orca のロゴ、右に Open の文字の1つの形で出る。読み上げの名前（aria-label）は「Open（Orca で開く）」、title は「Orca で開く」（統括の答え 2026-11-14。WCAG 2.5.3 のため見える文字を名前に含める）。ロゴは装飾（aria-hidden）。"
		acceptance: [
			"3か所のボタンの見える文字が Open で、Orca で開く の文字が見えない",
			"3か所のボタンに aria-label「Open（Orca で開く）」と title「Orca で開く」があり、ロゴの svg が aria-hidden",
			"ロゴの path が stablyai/orca の resources/logo.svg（v1.4.258）と同じで、表が1か所だけにある。出どころと商標の1行がある",
		]
	}
	"R-02": {
		title: "見た目は SpecDock の .chip の仲間で、大きさは sm と md"
		text:  "1px の線（`--ds-border`、hover で `--ds-border-2`）、角丸 `--ds-radius-s`（4px）、字の太さ 700、字体 `--ds-font-sans`、背景は透明、字の色 `--ds-text`。フォーカスは `--ds-focus` の線。大きさは sm（高さ 24px、アイコン 14px）と md（高さ 28px、アイコン 16px）。新しい色を足さない（変数の既定は SpecDock の app.css の明暗の値）。明暗は prefers-color-scheme と data-theme の両方に従う。"
		acceptance: [
			"CSS の色・字体・角丸・線・フォーカスが `var(--ds-…, <既定>)` の形で、既定が SpecDock の app.css の明るい値と暗い値に一致する",
			"sm の高さ 24px・アイコン 14px、md の高さ 28px・アイコン 16px が、試しの画面の描画で測れる",
			"明暗、Mac の幅で、置き換えたすべての場所の直す前と後の写しが report.md にある",
		]
	}
	"R-03": {
		title: "アイコンだけの形がある"
		text:  "`data-label=\"none\"`（埋め込みのボタンの1行のスクリプト）または部品の選択で、文字を出さずアイコンだけの正方形（sm 24px、md 28px）になる。aria-label は「Orca で開く」、title は「Orca で開く」（統括の答え）。"
		acceptance: [
			"アイコンだけの形が正方形で、Open の文字がなく、aria-label と title が「Orca で開く」",
		]
	}
	"R-04": {
		title: "埋め込みのボタンの iframe が中身に合う小さな幅になる"
		text:  "`/embed/open-button.js` の iframe の既定の幅と高さを、形と大きさで決める（Open の形が収まる幅、アイコンだけなら正方形の幅）。`data-width` の上書きは残す。フォーカスの線が iframe で切れない。"
		acceptance: [
			"iframe の既定の幅と高さが、形と大きさごとに決めた値で、中のボタンが切れず、横のスクロールが出ない",
			"`data-width` を付けるとその幅になる",
		]
	}
	"R-05": {
		title: "開いている途中・開けた・開けなかったを、文字でなくアイコンの変化と title で示す"
		text:  "押すと途中の間はロゴの代わりに小さな回る印を出して押せなくし（aria-busy）、開けたら短い間（2秒）チェックの印を出して元に戻り、開けなかったら線を琥珀（`--ds-warn`）にし title に理由を出して、次に押すまで残す。理由の言葉は今の言葉を保ち、表は1か所にする。読み上げには、目に見えない status の領域で同じ言葉を伝える。横に結果の文字を出さない。回る動きは prefers-reduced-motion で止める。"
		acceptance: [
			"途中・開けた・開けなかったの状態が、アイコン（回る印、チェック、ロゴ）と線の色と title で区別でき、見える結果の文字がない",
			"誤りの種類ごとの言葉が今と同じで、言葉の表が1か所だけにある",
			"status の領域（目に見えない）に同じ言葉が入る",
		]
	}
	"R-06": {
		title: "開く操作、守り、狭い幅で出さない決まりは変わらない"
		text:  "押したときに送る要求（`POST /api/open` と本体）、短期のトークンの扱い、frame-ancestors と CSP、幅 390px 以下でボタンを出さない（埋め込みは iframe を読み込まない）決まりは今のまま。"
		acceptance: [
			"既存の開く口と守りのテストが変わらずに通る",
			"幅 390px で3か所ともボタンが出ない",
		]
	}
}

failures: {
	"F-01": {
		title: "結果の言葉に Orca の応答の文字を入れない"
		text:  "title と status の言葉は、決めた表の言葉か HTTP の状態の数だけで作り、textContent と属性で入れる（innerHTML を使わない）。"
	}
	"F-02": {
		title: "worktree の指定がないときは押せず、理由を title に出す"
	}
}

constraints: [
	"実行時の依存を足さない。素の ES Modules でビルドしない",
	"DOM は textContent と createElementNS だけで描く",
]

decisions: [
	"置き換える場所は今ある3か所（埋め込みのボタン、/embed/agent の見出し、受け箱）と試しの画面だけ。Run の木とプロジェクトの画面には足さない（統括の答え 2026-11-14）",
	"aria-label は『Open（Orca で開く）』、title は『Orca で開く』。アイコンだけの形は aria-label も『Orca で開く』（統括の答え 2026-11-14）",
	"ロゴの箱は正方形でなくロゴの比の横長（sm 14×22px、md 16×25px、アイコンだけは 12×19・14×22）、iframe の既定の幅は sm 72・md 82（統括の答え 2026-11-14 の C。R-02 のアイコンの大きさは高さを指す）",
]
