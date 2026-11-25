package spec

design: {
	"D-01": {
		title:     "道"
		text:      "`src/server/app.ts` の STATIC_FILES：`/` と `/index.html` を `apexes.html` に、`/inbox` を今の `index.html`（受け箱）に。受け箱の HTML のファイルの名前を `inbox.html` に変えてよい（そのときは `/inbox` だけが指す）。`/apexes` は残す。"
		satisfies: ["R-01", "F-01"]
	}
	"D-02": {
		title:     "リンク"
		text:      "各画面の HTML の見出しの nav（`web/apexes.html`・`project.html`・`run.html`・`runs.html`・`settings.html`・受け箱の HTML）で、受け箱へのリンク（今は `/`）を `/inbox` に、指揮へのリンク（今は `/apexes`）を `/` に直す。`web/*.js` の中に `/` や `/apexes` を受け箱・指揮として作るリンクがあれば同じく直す（実装の時点の main で `rg` で確かめる）。"
		satisfies: ["R-02"]
	}
	"D-03": {
		title:     "Run の木の根"
		text:      "`src/runs/links.ts` の `coordinatorAgent` は、`activeCoordinatorHandle` があってもその端末のエージェントが見つからなければ、生きた作業者の `parentPaneKey` の方法に進み、それでも結べなければ `src/apex/` の束の解決（Run の今の世代 `consumerGeneration` の束の持ち主の頂点。なければ最も新しい世代の束の頂点。iss-00078 の `bundles.ts`・`owners.ts`）を呼ぶ。`buildRunTree` と `buildRunList` は内部の値と対応表を引数に受け、`/api/runs/<id>/tree` と `/api/runs`（Run の一覧とプロジェクトの画面が読む）は、頂点の一覧と同じ内部の値と対応表を渡す。"
		satisfies: ["R-03"]
	}
	"D-04": {
		title:     "要望の下書き"
		text:      "report.md の Residual Risks に、要望の題と本文の下書き（日本語と英語）を置く。何を出してほしいか（run-list・run-show に統括の paneKey かセッションの id）、なぜ要るか（作業者のタブが閉じた後に統括を特定できない）、私的な値を含めない。"
		satisfies: ["R-04"]
	}
}
