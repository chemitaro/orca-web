package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"実物の Orca が出している項目（worker の起動の記録）だけを、今の読み取りの形で使う",
	"端末のタブの読み取りに触れない",
]

current: """
	`src/state/normalize.ts` の `chatTab` は `model: noSource()`、`effort: noSource()` を返す。worker は `structuredWorker(tab)` で結んでいるが、起動の記録は読まない。
	起動の記録は `launchReadings(dispatchId, key)`（effective → launch-resolved、requested → launch-requested の Reading の列）と `launchMissing(dispatchId, key)`（not-provided・not-fetched・source-failed）で、端末のタブだけが使う。
	ポーリング（`poller.ts`）は、`needsLaunch` の worker の起動の記録を種類によらず読み、`sources.workerLaunch` に置く。変える必要はない。
	"""

target: """
	`chatTab` は `structuredWorker(tab)` の結果を1度だけ求めて `worker` に使い、worker があれば `model`・`effort` を `readingFact(launchReadings(w.dispatchId, key), launchMissing(w.dispatchId, key))` にする（状態の文書の `workers` の行と同じ式）。worker がなければ今どおり `noSource()`。
	"""

design: {
	"D-01": {
		title: "chat-tab の model・effort を、結んだ worker の起動の記録から作る"
		text: """
			変えるのは `normalize.ts` の `chatTab` だけ。
			- `const worker = structuredWorker(tab)` を先に求め、`worker` の項目にそれを使う。
			- `model: worker ? readingFact(launchReadings(worker.dispatchId, 'model'), launchMissing(worker.dispatchId, 'model')) : noSource()`。effort も同じ。
			- 優先の順は `readingFact` の今の `MEANING_ORDER`（current-selection → last-observed → launch-resolved → launch-requested）。chat-tab の readings は起動の記録の2つだけなので、effective が requested より先。
			- タブの `agentStatus`（`model`、`providerSession.effort`）は chat-tab では読まない（F-02）。Orca 1.4.263 の agent-session のタブにその項目はなく、Claude の chat-tab でも起動の記録だけが出どころになる。統括の条件2の『両方あるときの順』は、タブの値を読まずに起動の記録を使う、として決まる。
			- 結べない chat-tab（F-01）は `structuredWorker` が null なので noSource のまま。
			端末のタブ（`terminalTab`）、`workers` の行、`launchReadings`・`launchMissing`・`readingFact`・ポーリング・型（`model.ts`）は変えない。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01", "F-02"]
	}
}

compatibility: """
	状態の文書の形（`orca-web.state/v1`）は変わらない。chat-tab の `model`・`effort` の値と欠けた理由が、worker に結ばれたときだけ no-source から起動の記録の値や理由に変わる。
	エージェントの `model`・`effort` を読むのは、状態の画面の表、`/embed/agent` の詳細の『モデル』『推論』のセル（`web/embed/agent-view.js` の cellOf）、Run の木（`src/runs/tree.ts`。worker があれば `workers` の行の値を先に使うので、結ばれた chat-tab では今も起動の記録の値が出ている）。画面のコードは変えず、`/embed/agent` の詳細のセルに値が出るようになる。受け箱と要約は使わない。
	今の `test/state/structured-worker.test.ts` の T-02 は、結ばれた chat-tab の model・effort が no-source であることを確かめている。これは今回変える振る舞いなので、そのテストの期待を新しい振る舞い（起動の記録がない空の Map では source-failed）に直す。端末のタブの期待は変えない。
	"""

risks: [
	"Antigravity のモデルの id は推論の深さを含む（`gemini-3.8-flash-low`）ので、model と effort に同じ深さが重ねて見える。id は Orca の出すままにし、解かない（excludes）",
	"利用者が Chat の画面で後からモデルや推論を変えても、起動の記録の値のまま見える。meaning が launch-resolved・launch-requested なので、起動のときの値と読める",
]
