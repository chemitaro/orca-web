package spec

design: {
	"D-01": {
		title:     "道"
		text:      "`src/server/app.ts` の STATIC_FILES：`/` と `/index.html` を `apexes.html` に、`/inbox` を今の `index.html`（受け箱）に。受け箱の HTML のファイルの名前を `inbox.html` に変えてよい（そのときは `/inbox` だけが指す）。`/apexes` は残す。"
		satisfies: ["R-01", "F-01"]
	}
	"D-02": {
		title:     "リンク"
		text:      "各画面の見出しの nav と `web/runs-view.js` の `inboxLinks`、`web/apexes-view.js` の受け箱へのリンクを、指揮 `/`、受け箱 `/inbox` に直す。受け箱の画面の見出しに「指揮」を足す。"
		satisfies: ["R-02"]
	}
	"D-03": {
		title:     "Run の木の根"
		text:      "`src/runs/links.ts` の `coordinatorAgent` が、今の2つの方法で結べなければ、`src/apex/` の束の解決（Run の今の世代の束の頂点。iss-00078 の `bundles.ts`・`owners.ts`）を呼ぶ。`/api/runs/<id>/tree` は、頂点の一覧と同じ内部の値と対応表を渡す。"
		satisfies: ["R-03"]
	}
	"D-04": {
		title:     "要望の下書き"
		text:      "report.md の Residual Risks に、要望の題と本文の下書き（日本語と英語）を置く。何を出してほしいか（run-list・run-show に統括の paneKey かセッションの id）、なぜ要るか（作業者のタブが閉じた後に統括を特定できない）、私的な値を含めない。"
		satisfies: ["R-04"]
	}
}
