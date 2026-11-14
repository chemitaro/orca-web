package spec

// 計画（Issue）。型 specdock/v1。

goal: "要約に経過の起点を足し、種類のアイコン・状態の色・経過の時間の小さな印を描く ES Module の部品を SpecDock のオリジンに読ませ、試しの画面をその部品で描き直して、Mac の幅と 390px で確かめる。"

// 開始のコミット：68d8c88（main と同じ。worktree iss-00027、ブランチ chemitaro/iss-00027）。
// 各手順はテスト先行（tdd）。fixture は自分で作った仮の文だけ。仕様の読み方に迷ったら、直さずにタスク担当に問う。
// iss-00028 と並んで走る（`src/server/app.ts`、README、`web/trial/` が重なりうる）。PR の直前に origin/main を取り込み直す。

steps: {
	"S-01": {
		title:    "種類のアイコンの表（D-02）、印の組み立て（D-03）、描画と読みの輪と CSS（D-04）を作る"
		text:     "対象：`web/embed/agent-marks-icons.js`、`web/embed/agent-marks-view.js`、`web/embed/agent-marks.js`、`web/embed/agent-marks.css`、`test/web/agent-marks-view.test.ts`、`test/web/agent-marks-dom.test.ts`（既存の `runs-dom.test.ts` のような偽の要素。createElementNS も偽で受ける）。ロゴの path は `.workbench/orca-icons.tsx`（Orca のコミット 80a514c のファイル）から写す。確かめ：T-02、T-03、T-04、T-05、T-06、T-07。完了：`node --test test/web/*.test.ts` と `npm run lint` が通る。区切りのレビュー：なし。止まって HEAD を報告する（セッション ui の最後）"
		realizes: ["R-02", "R-03", "F-01", "F-02"]
		status:   "todo"
		session:  "ui"
	}
	"S-02": {
		title:    "要約の経過の起点 `elapsedFrom`・`elapsedBasis`（D-01）を足す"
		text:     "対象：`src/summary/model.ts`、`src/summary/build.ts`、`test/summary/build.test.ts`。確かめ：T-01。完了：`node --test test/summary/*.test.ts test/server/summary-api.test.ts` と `npm run lint` が通る。区切りのレビュー：なし"
		realizes: ["R-01"]
		after:    ["S-01"]
		status:   "todo"
		session:  "impl"
	}
	"S-03": {
		title:    "部品のファイルの配りと読み取りの CORS（D-05）"
		text:     "対象：`src/server/app.ts`、`test/server/`（`summary-api.test.ts` か新しい `marks-assets.test.ts`）。確かめ：T-08。完了：`npm run lint`、`npm test`、`npm run build` が通る。区切りのレビュー：なし。止まって HEAD を報告する（セッション impl の最後）"
		realizes: ["R-04"]
		after:    ["S-02"]
		status:   "todo"
		session:  "impl"
	}
	"S-04": {
		title:    "試しの画面を新しい部品で描き直す（D-06）"
		text:     "対象：`web/trial/trial.js`、`web/trial/trial-view.js`、`web/trial/trial.css`、`web/trial/index.html`、`test/web/trial-view.test.ts`（とほかの trial のテスト）。確かめ：T-09。完了：`npm run lint`、`npm test`、`npm run build` が通る。`npm run trial` で起動し、Mac の幅と `phone.html`（390px）で、構造の図の箱、Issue の一覧の行、節の一覧に印が収まり、印を選ぶと詳細とチャットが開き、47901 の画面で import が拒まれることを見る（送信はしない）。見終えたら止める。区切りのレビュー：なし。止まって HEAD を報告する"
		realizes: ["R-02", "R-03", "R-04"]
		after:    ["S-03"]
		status:   "todo"
		session:  "trial"
	}
	"S-05": {
		title:    "実機の確かめ（読むだけ）、写し、README.md、AGENTS.md、report.md（D-07）"
		text:     "タスク担当が行う（文書の手順）。一時の port の `npm start` で要約の新しい項目の件数を数え、`npm run trial` で Mac の幅と 390px を写して report.md に残す。`orca --version` を書く。確かめ：T-10。完了：report.md の Verification に実機の結論と写しがあり、README.md と AGENTS.md が出来上がったものと合う"
		realizes: ["R-01", "R-02", "R-03", "R-04"]
		after:    ["S-04"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "`buildWorktreeSummary`：stateStartedAt のあるエージェントは elapsedFrom = since・basis state。since がない sleeping と unknown は worktree の lastActivityAt・basis worktree-activity。since がない working などの印、lastActivityAt が null の worktree、worktrees にない worktree のエージェントは両方 null。既存の項目と並びは変わらない", verifies: ["R-01"]}
	"T-02": {title: "`formatElapsed`：59 秒は「今」、60 秒は「1分」、59 分は「59分」、60 分は「1時間」、23 時間 59 分は「23時間」、24 時間は「1日」。未来、解けない文字、文字でない値、now が数でないときは null", verifies: ["R-02", "F-02"]}
	"T-03": {title: "`buildMarks`：要約の worktree から、icon の鍵、mark（知らない値は unknown）、elapsed、label（種類、状態、起点ごとの経過の文）、detail（`/embed/agent?id=` で始まるものだけ）を返す。agents が配列でなければ空。max を超えると、要対応・working・unknown・done・sleeping の順に並べて max−1 個と overflow「+N」。題名などの決めていない項目を拾わない", verifies: ["R-02", "F-01", "F-02"]}
	"T-04": {title: "アイコンの表：iconKey が claude・claude-agent-teams → claude、codex → codex、null・'' → none、ほか → other。claude と codex の path の `d` は Orca のコミット 80a514c の ClaudeIcon・OpenAIIcon の値と同じ。表の近くに出どころと商標のコメントがある。ロゴの path の値が `web/` の中で `agent-marks-icons.js` にだけある", verifies: ["R-02", "F-02"]}
	"T-05": {title: "`findWorktree`：パスの一致、末尾の `/` の違い、id の一致、見つからないとき、文書の形が違うときに null", verifies: ["R-03", "F-01"]}
	"T-06": {title: "`watchWorktreeSummary`：すぐに1回読み、終わってから間隔で予約する（重ならない）。hidden の間は読まず、visibilitychange で見えたら読む。HTTP の誤りと例外は onError で、輪は続く。stop の後は読まず、予約と受け手を外す（fetch・時計・doc を差し替える）", verifies: ["R-03", "F-01"]}
	"T-07": {title: "`renderAgentMarks`：置き場の中を作り直し、印ごとに class `orca-mark--<mark>`、aria-label と title、SVG のアイコン（createElementNS、aria-hidden）、経過の span を持つ。スリープに月の印。onSelect があればボタンで、押すと `{ id, detail }` を渡す。なければ role img。overflow の印。innerHTML を使わない", verifies: ["R-02", "R-03"]}
	"T-08": {title: "部品の4つのファイル：Origin なしは CORS なしで 200 と正しい content-type。許したオリジンの GET・HEAD に `Access-Control-Allow-Origin` と `Vary: Origin`、OPTIONS は 204。ポートやスキームだけ違うオリジンは 403、POST は 405。`/embed/open-button.js` は Origin が違っても今までどおり 200 で CORS なし", verifies: ["R-04"]}
	"T-09": {title: "試しの画面の組み立て：同じ要約の文書から、構造の図の箱、Issue の一覧の行、節の一覧の見本が組める。数の札は文字の状態の名前を持たない。経過と種類の文字の組み立てが trial-view.js に残らない（部品を使う）", verifies: ["R-02", "R-03"]}
	"T-10": {title: "実機の確かめ：要約のスリープの大半に elapsedFrom、since のあるエージェントは elapsedFrom = since（件数だけ）。試しの画面の Mac の幅と 390px の写しで印が収まる。47900 から部品の import が通り、47901 から拒まれる", verifies: ["R-01", "R-02", "R-03", "R-04"]}
}

verification: """
	各手順で、その手順のテストを手書きの入力で通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実機の確かめは読むだけで、件数と結論と写しだけを report.md に書く。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：agent（統括がマージする。タスク担当はマージしない）。merge_permission：統括の依頼書（2026-11-14）の「マージ（統括が行う）」
	- 区切りのレビュー：なし（手順ごとに互いに依らない小さな変更。最終品質ゲートで全体を見る）
	- 最終品質ゲート：範囲 `68d8c88..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。観点は既定に、security-baseline（CORS が SpecDock のオリジンと部品の4つのファイルだけ、DOM が textContent と createElementNS だけ、秘密と会話の中身と個人のパスを出さない）と、ロゴの出どころと商標の記載を足す。second_opinion：none（standard）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（report.md は Git の外で、SpecDock が保存する）
	"""
rollback: "PR を戻せば、要約の2つの項目と部品のファイルがなくなり、試しの画面は前の文字の丸に戻る。状態の API、受け箱、ほかの配るファイルは元のまま。"
exit:     "最終品質ゲートが `68d8c88..HEAD`（origin/main を取り込んだ後は、その取り込みを含む最終のコミット）で合格し、実機の確かめと写しが report.md にあり、PR の CI が通ってマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-14）：Opus 5.5 / medium（方針の「タスク担当 × standard」から統括が選んだ）"}
		ui: {task: "印の部品（S-01。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分（HTML・CSS・画面の JavaScript）は Claude Opus 5.5、standard は medium。provider: claude"}
		impl: {task: "要約の項目と部品の配りの CORS（S-02〜S-03。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコード（API、サーバー、データの形）は Codex GPT-6.1 Sol / medium をなるべく使う。provider: codex"}
		trial: {task: "試しの画面の描き直し（S-04。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13）：画面は Claude Opus 5.5 / medium。S-03 の配りの後でないと別のオリジンから部品を読めないので、ui と別のセッションにする。provider: claude"}
		doc: {task: "実機の確かめ、写し、文書（S-05。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "統括の依頼書：要件・設計・計画と文書はタスク担当が書く。実機の確かめは読むだけで、コードを変えない"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-05", model: "opus", effort: "medium"}
	}
}
