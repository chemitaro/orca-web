package spec

// 計画（Issue）。型 specdock/v1。
// 作業しながら、手順の追加、変更、status の更新を、このファイルに直接書く。

goal: "会話のログの API と、詳細とチャットの画面（読むだけ）を、前の作業者の下書きを仕様と照らして直したうえで出し、実機で Claude Code と Codex の会話を読めることを確かめる。"

// 下書き：ブランチには前の作業者のコミット（373d026..18e9697）があり、D-01〜D-08 の各単位のファイルとテストがある（requirement の decisions、2026-11-13）。
// S-01〜S-06 は「作る」ではなく「仕様と1行ずつ照らし、食い違いを直し、足りないテストを足す」。各手順で、対応するテスト T-xx が録画の再生で通ることを完了の条件にする。
// 食い違いを見つけたら、まず失敗するテストを書いてから直す（tdd）。仕様の読み方に迷ったら、直さずにタスク担当に問う。

steps: {
	"S-01": {
		title:    "会話の取得元のアダプター（D-01）を仕様と照らして直す"
		text:     "対象：`src/orca/read-transcript.ts`、`src/orca/rpc.ts` の `READ_METHODS`。確かめ：T-01、T-03、T-04、T-07（読み手の誤りの code）。完了：`node --test test/orca/read-transcript.test.ts test/orca/rpc.test.ts` が通り、D-01 の各文（id の規則、セッションと記録のパスの取り方、誤りの code の写し方、reset の扱い、鍵の作り方、記録のパスを外に出さない）に対応するテストがある。区切りのレビュー：なし"
		realizes: ["R-01", "F-01", "F-02"]
		status:   "done"
		session:  "impl"
	}
	"S-02": {
		title:    "会話の正規化（D-02）と録画の fixture を仕様と照らして直す"
		text:     "対象：`src/transcript/normalize.ts`、`test/transcript/fixture.ts`（自分で作った仮の会話だけ）。確かめ：T-02、T-04。完了：`node --test test/transcript/normalize.test.ts` が通り、思考を印も付けずに落とす、決めた `what` の名前だけ、並べ替えない、切る長さ、`before` の不透明な位置、のそれぞれにテストがある。区切りのレビュー：なし"
		realizes: ["R-01", "F-03"]
		after:    ["S-01"]
		status:   "done"
		session:  "impl"
	}
	"S-03": {
		title:    "窓の差分（D-03）と共有の見張り（D-04）を仕様と照らして直す"
		text:     "対象：`src/transcript/diff.ts`、`src/transcript/hub.ts`。確かめ：T-05、T-06。完了：`node --test test/transcript/diff.test.ts test/transcript/hub.test.ts` が通り、追記、同じ id の更新、窓の前進、書き換え、巻き戻し、セッションの切り替え、unavailable と回復、共有と停止、上限の busy にテストがある。区切りのレビュー：なし"
		realizes: ["R-02", "F-01", "F-02"]
		after:    ["S-02"]
		status:   "done"
		session:  "impl"
	}
	"S-04": {
		title:    "会話の HTTP の道と /embed/agent の配り方（D-05）を仕様と照らして直す"
		text:     "対象：`src/server/app.ts`、`src/server/main.ts`。確かめ：T-07、T-08、T-09、T-10。完了：`node --test test/server/*.test.ts` が通り、誤りの code と HTTP の状態の表、409、SSE の出来事の名前と形、別のオリジンの 403、CORS なし、GET 以外の 405、CSP にテストがある。ここで公開の契約（`orca-web.transcript/v1`、SSE の出来事、同じオリジンの境界）が決まるので、区切りのレビュー CP-1 の最後の手順にする。止まって HEAD を報告する"
		realizes: ["R-01", "R-02", "R-05", "F-01", "F-02", "F-03"]
		after:    ["S-03"]
		status:   "done"
		session:  "impl"
	}
	"S-05": {
		title:    "実機の確かめの道具（D-08）を仕様と照らして直す"
		text:     "対象：`src/tools/live-transcript.ts`、`src/tools/transcript-live.ts`、`package.json` の `transcript:live`。確かめ：T-17。完了：`node --test test/tools/*.test.ts` と `npm run lint`、`npm test`、`npm run build` が通り、道具の出力に本文、題名、パス、セッションの識別子が出ないことをテストで確かめている。Codex の実装担当の最後の手順なので、止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）。2026-11-13 の本人の補足で、画面の手順を別のセッションに分けるため、もとの S-05（画面）と S-06（開き方と道具）の中身を入れ替えた"
		realizes: ["R-06"]
		after:    ["S-04"]
		status:   "done"
		session:  "impl"
	}
	"S-06": {
		title:    "詳細とチャットの画面（D-06）と、状態の画面からの開き方（D-07）を仕様と照らして直す"
		text:     "対象：`web/embed/agent.*`、`web/view.js`、`web/main.js`。確かめ：T-11、T-12、T-13、T-14、T-15。完了：`node --test test/web/*.test.ts` と `npm run lint`、`npm test`、`npm run build` が通り、textContent だけで描く、https だけをリンクにする、置き換えで前のページを捨てる、鍵の違う古いページを足さない、送信の欄がない、エージェントの行のリンク、にテストがある。画面の実装担当（Claude Opus 5.5）の手順。終えたら止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-03", "R-04", "F-01", "F-02", "F-03"]
		after:    ["S-05"]
		status:   "done"
		session:  "ui"
	}
	"S-07": {
		title:    "実機の確かめ（読むだけ）と 390px の表示を確かめ、report.md、README.md、AGENTS.md を書く"
		text:     "タスク担当が行う（文書の手順。方針の「文書を書くステップはタスク担当が書く」）。`npm run transcript:live` を実行し、件数と結論だけを report.md に書く。Orca の版（`orca --version`）と、購読の口が Unix ソケットで使えないことをソースで確かめた結論も書く。`npm start` を一時の port で起動し、このリポジトリの worktree のエージェントの `/embed/agent` を幅 390px と広い幅で見る（Orca で開くは押さない）。会話の中身は記録に写さない。README.md と AGENTS.md の説明が、出来上がったものと食い違えば直す。確かめ：T-16。完了：report.md の Verification に実機の表と結論がある"
		realizes: ["R-06", "R-03"]
		after:    ["S-06"]
		status:   "done"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "端末のタブと構造化 Chat のタブの id から、Orca が持つセッションの識別子と記録のパスで読み、引数に transcriptSourceOrder が入る", verifies: ["R-01"]}
	"T-02": {title: "正規化で、本文、ツール、表示できない印が返り、思考が返らず、並べ替えず、長い本文を切る", verifies: ["R-01"]}
	"T-03": {title: "before で、重ならない、より古いページが返り、agentSession の reset（ok: false）は古いページとして返さない（nativeChat と agentSession）", verifies: ["R-01"]}
	"T-04": {title: "応答と誤りに、記録のパス、authToken、Orca の誤りの文が含まれない", verifies: ["R-01", "F-03"]}
	"T-05": {title: "窓の差分が、追記、同じ id の更新、満ちた窓の前進、書き換え、巻き戻し、hasMore が偽の窓での先頭の件の消失（件数が limit と同じ場合を含めて replacement）を、appended と replacement に分ける", verifies: ["R-02", "F-02"]}
	"T-06": {title: "見張りが、購読者で読みを共有し、セッションの切り替えで replacement、読めないときに unavailable、回復で replacement を配り、最後の購読者で止まり、上限で busy を返す", verifies: ["R-02", "F-01", "F-02"]}
	"T-07": {title: "誤りの種類（agent_not_found、no_session（状態の API の untabbed のエージェントを含む）、transcript_not_found、unsupported、unreachable、read_failed、unknown_shape）が区別した code と HTTP の状態で返り、0件は読めたときだけ", verifies: ["F-01"]}
	"T-08": {title: "before のセッションの鍵が今と違えば 409 で読まない", verifies: ["F-02"]}
	"T-09": {title: "SSE の道が snapshot と appended を配り、別のオリジンを 403 で拒み、CORS を付けない", verifies: ["R-02", "F-03"]}
	"T-10": {title: "/embed/agent の CSP が inline を許さず、frame-ancestors が読み取りのオリジンだけ", verifies: ["R-05", "F-03"]}
	"T-11": {title: "詳細の組み立てが、状態、種類、モデルと推論と意味、親と子、PR と CI、開く要求を作り、https でない PR の URL をリンクにしない", verifies: ["R-03", "F-03"]}
	"T-12": {title: "会話の組み立てが、吹き出し、callId で組にしたツール、表示できない印、system の知らせの行を作り、思考を出さない", verifies: ["R-03"]}
	"T-13": {title: "`<script>` や `<img onerror>` を含む本文が、DOM に描いても要素にならない（textContent だけで描く）", verifies: ["R-03", "F-03"]}
	"T-14": {title: "画面が replacement で前のページを含めて捨て、要求の後に置き換えを受けた古いページや鍵の違う古いページを足さず、unavailable で読めない理由を示す（画面の状態の純粋な関数）", verifies: ["F-01", "F-02"]}
	"T-15": {title: "状態の画面のエージェントの行に、詳細とチャットの画面へのリンクが付く", verifies: ["R-04"]}
	"T-16": {title: "実機の確かめ（Claude Code と Codex の会話を読み、並びと差分と前のページを数え、390px の表示を見る）", verifies: ["R-06", "R-03"]}
	"T-17": {title: "実機の確かめの道具の集計が、件数と結論だけを出し、本文、題名、パス、セッションの識別子を出さない", verifies: ["R-06"]}
}

verification: """
	各手順で、その手順のテストを録画の再生で通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。`npm run transcript:live` を実機で実行し、件数と結論だけを report.md に書く。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（strict。マージは本人）
	- 区切りのレビュー CP-1：最後の手順 S-04、範囲 `373d026..<S-04 の後の HEAD>`（前の作業者の分を含む）、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）。理由：公開の契約（`orca-web.transcript/v1`、SSE の出来事）と、同じオリジンの読みの境界が S-04 で決まり、画面（S-06）と道具（S-05）がそれに依る
	- 最終品質ゲート：範囲 `373d026..HEAD` の全体（`src/`、`web/`、`test/`、`package.json`、`README.md`、`AGENTS.md`）。観点は functional-correctness、requirements-closure、test-adequacy に、security-baseline（XSS、同じオリジン、秘密を出さない）を足す。second_opinion：chatgpt（strict。取れなければ GPT-6 Astra）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "PR を戻せば、会話の API と画面がなくなり、既存の状態の API と開く口は元のまま動く。"
exit:     "区切りのレビュー CP-1 が `373d026..<S-04 の後の HEAD>` で、最終品質ゲートが `373d026..HEAD`（全体）で合格し、実機の確かめが report.md にあり、PR の CI が通ってマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-13）：Opus 5.5 / medium（方針の「タスク担当 × standard」から統括が選んだ）。保証レベルは strict だが、値は統括の指定に従う"}
		impl: {task: "実装（S-01〜S-05。API・サーバー側と道具。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられる実装は Codex の GPT-6.1 Sol / medium（方針の「実装担当 × standard」）。provider: codex"}
		ui: {task: "画面の実装（S-06。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の補足（2026-11-13、統括の status の知らせ）：画面の作成は Opus 5.5 / medium（方針の「実装担当（フロントエンド）× standard」）。provider: claude"}
		doc: {task: "実機の確かめと文書（S-07。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実機の確かめは読むだけで、コードを変えない"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。strict なので ChatGPT GPT-6 / Extra High の2人目を並べる）", model: "opus", effort: "high"}
		code: {role: "区切りのレビュー CP-1（code-reviewer）", after: "S-04", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT GPT-6 / Extra High、取れなければ GPT-6 Astra / high）", after: "S-07", model: "opus", effort: "high"}
	}
}
