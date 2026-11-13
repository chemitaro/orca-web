package spec

// 計画（Issue）。型 specdock/v1。
// 作業しながら、手順の追加、変更、status の更新を、このファイルに直接書く。

goal: "会話のログの API と、詳細とチャットの画面（読むだけ）を出し、実機で Claude Code と Codex の会話を読めることを確かめる。"

steps: {
	"S-01": {title: "会話の取得元のアダプターを作り、READ_METHODS に agentSession.history を足す", realizes: ["R-01", "F-01", "F-02"], status: "todo", session: "impl"}
	"S-02": {title: "会話の正規化と、まとめた録画の fixture（仮の会話）を作る", realizes: ["R-01", "F-03"], status: "todo", after: ["S-01"], session: "impl"}
	"S-03": {title: "窓の差分と共有の見張りを作る", realizes: ["R-02", "F-01", "F-02"], status: "todo", after: ["S-02"], session: "impl"}
	"S-04": {title: "会話の HTTP の道、/embed/agent の配り方、起動の組み立てを足す", realizes: ["R-01", "R-02", "R-05", "F-01", "F-02", "F-03"], status: "todo", after: ["S-03"], session: "impl"}
	"S-05": {title: "詳細とチャットの画面（純粋な組み立てと DOM）を作る", realizes: ["R-03", "F-01", "F-02", "F-03"], status: "todo", after: ["S-04"], session: "impl"}
	"S-06": {title: "状態の画面のエージェントの表から開けるようにする", realizes: ["R-04"], status: "todo", after: ["S-05"], session: "impl"}
	"S-07": {title: "実機の確かめの道具を作って実行し、390px の表示を確かめ、report.md、README.md、AGENTS.md を書く", realizes: ["R-06", "R-03"], status: "todo", after: ["S-06"], session: "impl"}
}

tests: {
	"T-01": {title: "端末のタブと構造化 Chat のタブの id から、Orca が持つセッションの識別子と記録のパスで読み、引数に transcriptSourceOrder が入る", verifies: ["R-01"]}
	"T-02": {title: "正規化で、本文、ツール、表示できない印が返り、思考が返らず、並べ替えず、長い本文を切る", verifies: ["R-01"]}
	"T-03": {title: "before で、重ならない、より古いページが返る（nativeChat と agentSession）", verifies: ["R-01"]}
	"T-04": {title: "応答と誤りに、記録のパス、authToken、Orca の誤りの文が含まれない", verifies: ["R-01", "F-03"]}
	"T-05": {title: "窓の差分が、追記、同じ id の更新、窓の前進、書き換え、巻き戻しを、appended と replacement に分ける", verifies: ["R-02", "F-02"]}
	"T-06": {title: "見張りが、購読者で読みを共有し、セッションの切り替えで replacement、読めないときに unavailable、回復で replacement を配り、最後の購読者で止まり、上限で busy を返す", verifies: ["R-02", "F-01", "F-02"]}
	"T-07": {title: "誤りの種類（タブがない、セッションがない、記録がない、機能がない、届かない、知らない形）が区別した code と HTTP の状態で返り、0件は読めたときだけ", verifies: ["F-01"]}
	"T-08": {title: "before のセッションの鍵が今と違えば 409 で読まない", verifies: ["F-02"]}
	"T-09": {title: "SSE の道が snapshot と appended を配り、別のオリジンを 403 で拒み、CORS を付けない", verifies: ["R-02", "F-03"]}
	"T-10": {title: "/embed/agent の CSP が inline を許さず、frame-ancestors が読み取りのオリジンだけ", verifies: ["R-05", "F-03"]}
	"T-11": {title: "詳細の組み立てが、状態、種類、モデルと推論と意味、親と子、PR と CI、開く要求を作り、https でない PR の URL をリンクにしない", verifies: ["R-03", "F-03"]}
	"T-12": {title: "会話の組み立てが、吹き出し、callId で組にしたツール、表示できない印を作り、思考を出さない", verifies: ["R-03"]}
	"T-13": {title: "`<script>` や `<img onerror>` を含む本文が、DOM に描いても要素にならない（textContent だけで描く）", verifies: ["R-03", "F-03"]}
	"T-14": {title: "画面が replacement で前のページを含めて捨て、unavailable で読めない理由を示す（画面の状態の純粋な関数）", verifies: ["F-01", "F-02"]}
	"T-15": {title: "状態の画面のエージェントの行に、詳細とチャットの画面へのリンクが付く", verifies: ["R-04"]}
	"T-16": {title: "実機の確かめ（Claude Code と Codex の会話を読み、並びと差分と前のページを数え、390px の表示を見る）", verifies: ["R-06", "R-03"]}
}

verification: "`npm run lint` と `npm test` を通す。`npm run transcript:live` を実機で実行し、件数と結論だけを report.md に書く。`npm start` の画面を、ブラウザーの幅 390px と広い幅で見る。"
rollback:     "PR を戻せば、会話の API と画面がなくなり、既存の状態の API と開く口は元のまま動く。"
exit:         "録画の再生のテストと実機の確かめが通り、PR がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（統括が選んだ値の記録）", model: "opus", effort: "high", rationale: "統括の依頼：非公開の購読の口、信頼しない本文の描画（XSS の境界）、別の会話を混ぜない同一性"}
		impl: {task: "実装（仕様化と同じセッション）", model: "opus", effort: "high", rationale: "統括の依頼と同じ"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", after: "S-01", model: "opus", effort: "medium"}
		code: {role: "コードのレビュー（code-reviewer）", after: "S-07", model: "sonnet", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer、1人）", after: "S-07", model: "opus", effort: "high"}
	}
}
