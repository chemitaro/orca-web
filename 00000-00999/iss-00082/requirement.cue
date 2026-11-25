package spec

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "道とリンクを入れ替え、Run の木の根の結び方を替える。SpecDock との契約（`/embed/*`、`/api/state`、要約）は変えず、PR を戻せば元に戻る"
}

purpose: "orca-web を開いたときの最初の画面（`/`）を指揮の画面にし、受け箱は `/inbox` で今のとおり使えるようにする。Run の木の根（統括）を、指揮の画面と同じ結び方で頂点に結ぶ。Orca 本体への要望（統括の識別子の公開）の下書きを用意する。"

background: """
	Epic epic-00075 の最後の切り分け（R-11、F-03）。今の Run の木（`src/runs/links.ts` の `coordinatorAgent`）は、`activeCoordinatorHandle` か、生きている作業者の `parentPaneKey` でしか統括を結べず、2026-11-25 の実データで木 17 本のうち根が結べたのは 1 本だけ。iss-00078 が `src/apex/` に束（Run と世代）と頂点の結びを作る。
	`/` へのリンクは `web/apexes.html`・`project.html`・`run.html`・`runs.html`・`settings.html` の見出しにあり、`web/runs-view.js` の `inboxLinks` が受け箱の見出しのリンクを作る。SpecDock が `/?project=` を開くことがある（受け箱へのリンク）。
	"""

includes: [
	"`/` と `/index.html` を指揮の画面に、受け箱を `/inbox`（`?project=` を保つ）に",
	"`/apexes` は `/` の別名として残す",
	"各画面の見出しのリンク（受け箱・指揮）の直し",
	"Run の木の統括の結びを、頂点の結び（束 → 頂点）を使う形に替える",
	"Orca 本体への要望の下書き（`.workbench` か report.md。送るのは利用者の了承の後）",
	"README・AGENTS.md の画面の節の直し",
]
excludes: [
	"`/embed/*`、`/api/state`、`/api/worktrees/summary`、`/api/inbox` の形の変更",
	"Orca 本体への要望を送ること（利用者の了承が要る外への投稿）",
]

requirements: {
	"R-01": {
		title: "`/` が指揮の画面で、受け箱は `/inbox`"
		acceptance: [
			"`GET /` と `GET /index.html` が指揮の画面を返し、`/apexes` も同じ画面を返す",
			"`GET /inbox` が今の受け箱を返し、`/inbox?project=<id>` で絞れる",
			"`/?project=<id>` を開くと、指揮の画面がそのプロジェクトで絞られる",
		]
	}
	"R-02": {
		title: "見出しのリンクが新しい道を指す"
		acceptance: [
			"どの画面の見出しにも「指揮」（`/`）と「受け箱」（`/inbox`）のリンクがあり、受け箱へのリンクが `/` を指していない",
		]
	}
	"R-03": {
		title: "Run の木の根を頂点の結びで決める"
		text:  "Run の木の統括の節は、今の `coordinatorAgent` で結べなければ、頂点の結び（Run の今の世代の束の頂点。iss-00078 の `src/apex/` の部品を使う）で結ぶ。結び方の規則を2か所に持たない（`src/runs/links.ts` は `src/apex/` の束の解決を呼ぶ）。"
		acceptance: [
			"子のタブが閉じた端末の統括の Run で、木の根が頂点のエージェントに結ばれる（今は結べない場面）",
			"今の `coordinatorAgent` で結べる Run の結果は変わらない",
		]
	}
	"R-04": {
		title: "Orca 本体への要望の下書きを用意する"
		text:  "`orchestration run-list --full`・`run-show` が、DB に持つ統括の識別子（`coordinator_pane_key`・`coordinator_orca_session_id`）を出さないため、構造化 Chat の統括を再起動の後に結べない。これを Orca（stablyai/orca）に要望する日本語と英語の下書きを、利用者が読める場所に置く。送らない。"
		acceptance: [
			"下書きがあり、利用者の私的な情報（パス、プロンプト、id）を含まない",
		]
	}
}

failures: {
	"F-01": {
		title: "SpecDock の埋め込みと読み取りの契約を変えない"
		text:  "`/embed/*`、`/api/state`、`/api/worktrees/summary` の道と形、CORS、frame-ancestors を変えない。SpecDock の受け箱へのリンク（`/?project=`）は指揮の画面の絞り込みとして動く。"
	}
}

constraints: [
	"実装は iss-00078・iss-00079・iss-00080・iss-00081 が main に入った後に、その main から始める",
	"AGENTS.md の守ること",
]

decisions: [
	"受け箱は残す（利用者、2026-11-25：今の画面は観点の1つとして残してよい）",
	"Orca 本体への要望は下書きまで。送るのは利用者の了承の後（外への投稿）",
]
