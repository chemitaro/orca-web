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
		status:   "done"
		session:  "ui"
	}
	"S-02": {
		title:    "要約の経過の起点 `elapsedFrom`・`elapsedBasis`（D-01）を足す"
		text:     "対象：`src/summary/model.ts`、`src/summary/build.ts`、`test/summary/build.test.ts`。確かめ：T-01。完了：`node --test test/summary/*.test.ts test/server/summary-api.test.ts` と `npm run lint` が通る。区切りのレビュー：なし"
		realizes: ["R-01"]
		after:    ["S-01"]
		status:   "done"
		session:  "impl"
	}
	"S-03": {
		title:    "部品のファイルの配りと読み取りの CORS（D-05）"
		text:     "対象：`src/server/app.ts`、`test/server/`（`summary-api.test.ts` か新しい `marks-assets.test.ts`）。確かめ：T-08。完了：`npm run lint`、`npm test`、`npm run build` が通る。区切りのレビュー：なし。止まって HEAD を報告する（セッション impl の最後）"
		realizes: ["R-04"]
		after:    ["S-02"]
		status:   "done"
		session:  "impl"
	}
	"S-04": {
		title:    "試しの画面を新しい部品で描き直す（D-06）"
		text:     "対象：`web/trial/trial.js`、`web/trial/trial-view.js`、`web/trial/trial.css`、`web/trial/index.html`、`web/trial/forbidden.html`、`web/trial/forbidden.js`、`src/tools/trial-host.ts`（CSP の style-src）、`test/web/trial-view.test.ts`、`test/tools/trial-host.test.ts`（とほかの trial のテスト）。確かめ：T-09。完了：`npm run lint`、`npm test`、`npm run build` が通る。`npm run trial` で起動し、Mac の幅と `phone.html`（390px）で、構造の図の箱、Issue の一覧の行、節の一覧に印が収まり、印を選ぶと詳細とチャットが開き、47901 の画面で import が拒まれることを見る（送信はしない）。見終えたら止める。区切りのレビュー：なし。止まって HEAD を報告する"
		realizes: ["R-02", "R-03", "R-04"]
		after:    ["S-03"]
		status:   "done"
		session:  "trial"
	}
	"S-05": {
		title:    "実機の確かめ（読むだけ）、写し、README.md、AGENTS.md、report.md（D-07）"
		text:     "タスク担当が行う（文書の手順）。一時の port の `npm start` で要約の新しい項目の件数を数え、`npm run trial` で Mac の幅と 390px を写して report.md に残す。`orca --version` を書く。確かめ：T-10。完了：report.md の Verification に実機の結論と写しがあり、README.md と AGENTS.md が出来上がったものと合う"
		realizes: ["R-01", "R-02", "R-03", "R-04"]
		after:    ["S-04"]
		status:   "done"
		session:  "doc"
	}
	"S-06": {
		title:    "印の色と形を SpecDock に合わせ（D-08）、作業中に回る動きを付ける（D-09）"
		text:     "2026-11-14 の追記（本人の要望）。開始は main の `10ab4e9`（PR #29 のマージ）、ブランチ `chemitaro/iss-00027-style`。対象：`web/embed/agent-marks.css`、（必要なら）`web/embed/agent-marks.js`、`web/trial/trial.css`、`test/web/agent-marks-css.test.ts`（新規。CSS の文字を読む）、（DOM を変えたら）`test/web/agent-marks-dom.test.ts`。確かめ：T-11、T-12。完了：`npm run lint`、`npm test`、`npm run build` が通る。`npm run trial` の試しの画面で、明暗の両方で色が SpecDock の系統に見え、working が回ることを見る（送信と「Orca で開く」はしない。試しのサーバーは止めずに残す。止まっていたら同じ形で起動し直す）。区切りのレビュー：なし。止まって HEAD を報告する"
		realizes: ["R-05", "R-06"]
		after:    ["S-05"]
		status:   "done"
		session:  "style"
	}
	"S-07": {
		title:    "突き合わせの表、並べた写し、動きを減らす設定の確かめ、README（D-10）"
		text:     "タスク担当が行う。report.md に突き合わせの表と理由を書き、試しの画面と SpecDock のダッシュボードを明暗で並べて写し、動きを減らす設定を確かめ、README.md の CSS のカスタムプロパティと動きの説明を改める。確かめ：T-13。完了：report.md と README.md が出来上がったものと合う"
		realizes: ["R-05", "R-06"]
		after:    ["S-06"]
		status:   "done"
		session:  "doc"
	}
	"S-08": {
		title:    "経過の表記の関数（D-11）を1か所にし、印の部品と配りを替える"
		text:     "2026-11-14 の追記（本人の指摘、統括の決定 task_27eff0d07653）。開始は main の `fc654c0`（PR #30 のマージ）、ブランチ `chemitaro/iss-00027-elapsed`。対象：`web/embed/elapsed.js`（新規）、`web/embed/agent-marks-view.js`、（必要なら）`web/embed/agent-marks.js`、`web/trial/` の経過の組み立て（あれば）、`src/server/app.ts`（配る表と CORS）、`test/web/elapsed.test.ts`（新規）、`test/web/agent-marks-view.test.ts`、`test/web/agent-marks-dom.test.ts`、`test/server/marks-assets.test.ts`、（期待値が変わる）`test/web/trial-view.test.ts`、受け箱と Run の木（`web/inbox-view.js`、`web/runs-view.js`、`test/web/inbox-view.test.ts`、`test/web/runs-view.test.ts`、`test/web/inbox-dom.test.ts` と `runs-dom.test.ts` の期待値）。確かめ：T-14、T-15、T-16。完了：`npm run lint`、`npm test`、`npm run build` が通る。試しの画面で経過が now・Nm・Nh・Nd で見えることを見る（試しのサーバーは止めない）。区切りのレビュー：なし。止まって HEAD を報告する"
		realizes: ["R-07"]
		after:    ["S-07"]
		status:   "todo"
		session:  "elapsed"
	}
	"S-09": {
		title:    "README.md・AGENTS.md、写し、report.md（D-11 の文書）"
		text:     "タスク担当が行う。README の経過の表記と部品のファイルの一覧、AGENTS.md の `web/embed/` の説明を改め、試しの画面（tailnet でも）の写しを report.md に残す。確かめ：T-17。完了：文書が出来上がったものと合う"
		realizes: ["R-07"]
		after:    ["S-08"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "`buildWorktreeSummary`：stateStartedAt のあるエージェントは elapsedFrom = since・basis state。since がない sleeping と unknown は worktree の lastActivityAt・basis worktree-activity。since がない working などの印、lastActivityAt が null の worktree、worktrees にない worktree のエージェントは両方 null。既存の項目と並びは変わらない", verifies: ["R-01"]}
	"T-02": {title: "（R-07 で置き換えた。今の確かめは T-14）`formatElapsed` の境目と null の条件。未来、解けない文字、now が数でないときは null", verifies: ["R-02", "F-02"]}
	"T-03": {title: "`buildMarks`：要約の worktree から、icon の鍵、mark（知らない値は unknown）、elapsed、label（種類、状態、起点ごとの経過の文）、detail（`/embed/agent?id=` で始まるものだけ）を返す。agents が配列でなければ空。いつも要対応・working・unknown・done・sleeping の順に安定に並べ（同じ印の中は要約の並び）、max を超えると先頭の max−1 個と overflow「+N」。題名などの決めていない項目を拾わない", verifies: ["R-02", "F-01", "F-02"]}
	"T-04": {title: "アイコンの表：iconKey が claude・claude-agent-teams → claude、codex → codex、null・'' → none、ほか → other。claude と codex の path の `d` は Orca のコミット 80a514c の ClaudeIcon・OpenAIIcon の値と同じ。表の近くに出どころと商標のコメントがある。ロゴの path の値が `web/` の中で `agent-marks-icons.js` にだけある", verifies: ["R-02", "F-02"]}
	"T-05": {title: "`findWorktree`：パスの一致、末尾の `/` の違い、id の一致、見つからないとき、文書の形が違うときに null", verifies: ["R-03", "F-01"]}
	"T-06": {title: "`watchWorktreeSummary`：すぐに1回読み、終わってから間隔で予約する（重ならない）。hidden の間は読まず、visibilitychange で見えたら読む。HTTP の誤りと例外は onError で、輪は続く。stop の後は読まず、予約と受け手を外す（fetch・時計・doc を差し替える）", verifies: ["R-03", "F-01"]}
	"T-07": {title: "`renderAgentMarks`：置き場の中を作り直し、印ごとに class `orca-mark--<mark>`、aria-label と title、SVG のアイコン（createElementNS、aria-hidden）、経過の span を持つ。スリープに月の印。onSelect があればボタンで、押すと `{ id, detail }` を渡す。なければ role img。overflow の印。innerHTML を使わない", verifies: ["R-02", "R-03"]}
	"T-08": {title: "部品の4つのファイル：Origin なしは CORS なしで 200 と正しい content-type。許したオリジンの GET・HEAD に `Access-Control-Allow-Origin` と `Vary: Origin`、OPTIONS は 204。ポートやスキームだけ違うオリジンは 403、POST は 405。`/embed/open-button.js` は Origin が違っても今までどおり 200 で CORS なし", verifies: ["R-04"]}
	"T-09": {title: "試しの画面の組み立て：同じ要約の文書から、構造の図の箱、Issue の一覧の行、節の一覧の見本が組める。数の札は文字の状態の名前を持たない。経過と種類の文字の組み立てが trial-view.js に残らない（部品を使う）。試しの静的なサーバーの CSP の style-src に試しの orca-web の基が入り、ほかの指示は変わらない。許さないオリジンの画面が部品の import を試して拒まれたことを示す", verifies: ["R-02", "R-03"]}
	"T-10": {title: "実機の確かめ：要約のスリープの大半に elapsedFrom、since のあるエージェントは elapsedFrom = since（件数だけ）。試しの画面の Mac の幅と 390px の写しで印が収まる。47900 から部品の import が通り、47901 から拒まれる", verifies: ["R-01", "R-02", "R-03", "R-04"]}
	"T-11": {title: "CSS：`.orca-marks` の各状態の主・背景・線・文字の変数が SpecDock の変数（`--sd-doing` など、スリープは `--sd-track` と `--ds-muted`）を先に使い、既定の値が D-08 の表の明るい値と同じ。`prefers-color-scheme: dark` の既定が表の暗い値と同じ。`.orca-mark` の角丸 4px、線 1px、太さ 700、字体が `--ds-font-sans` を先に使う。不明に破線がない", verifies: ["R-05"]}
	"T-12": {title: "CSS：回る keyframes が transform だけを動かし、animation を持つ規則が working の印の中の要素だけ。`prefers-reduced-motion: reduce` の中で、その要素の animation が none", verifies: ["R-06"]}
	"T-13": {title: "記録：report.md に突き合わせの表と、waiting・スリープ・+N の色の理由がある。試しの画面と SpecDock のダッシュボードを明暗で並べた写しがあり、working が回り、動きを減らす設定で止まる（animation-name が none）", verifies: ["R-05", "R-06"]}
	"T-14": {title: "`formatElapsed`：59 秒 now、60 秒 1m、59 分 59m、60 分 1h、23 時間 59 分 23h、24 時間 1d、30 日 30d、400 日 400d。ミリ秒の数の from も受ける。未来、解けない文字、文字でも数でもない値、now が数でないときは null。`describeElapsed` は同じ境目で 1分未満・N分・N時間・N日。`elapsedMs` の null の条件が同じ。`clampFuture: true` で未来は now・1分未満。受け箱と Run の木の経過が短い形で、未来は now（今までの『1分未満』の扱いを保つ）", verifies: ["R-07"]}
	"T-15": {title: "`buildMarks`：elapsed が短い形、label が読める形（basis ごとの文）で、label に『今』も短い形（/\\d+[mhd]\\b/ と now）も含まない。agent-marks-view.js から formatElapsed を今までどおり import できる。経過の境目（60_000 など）が web/ の中で elapsed.js にだけある", verifies: ["R-07"]}
	"T-16": {title: "`/embed/elapsed.js` が印の部品と同じ読み取りの CORS で配られる（許したオリジンで Access-Control-Allow-Origin、ほかは 403、Origin なしは 200）", verifies: ["R-07"]}
	"T-17": {title: "記録：試しの画面（tailnet でも）で経過が now・Nm・Nh・Nd に見える写しが report.md にある。README と AGENTS.md が elapsed.js と短い形を書く", verifies: ["R-07"]}
}

verification: """
	各手順で、その手順のテストを手書きの入力で通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実機の確かめは読むだけで、件数と結論と写しだけを report.md に書く。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：agent（統括がマージする。タスク担当はマージしない）。merge_permission：統括の依頼書（2026-11-14）の「マージ（統括が行う）」
	- 区切りのレビュー：なし（手順ごとに互いに依らない小さな変更。最終品質ゲートで全体を見る）
	- 最終品質ゲート：範囲 `68d8c88..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。観点は既定に、security-baseline（CORS が SpecDock のオリジンと部品の4つのファイルだけ、DOM が textContent と createElementNS だけ、秘密と会話の中身と個人のパスを出さない）と、ロゴの出どころと商標の記載を足す。second_opinion：none（standard）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（report.md は Git の外で、SpecDock が保存する）
	追記（2026-11-14、S-06〜S-07）の関門：新しいブランチ `chemitaro/iss-00027-style`、新しい PR。区切りのレビュー：なし。最終品質ゲート：範囲 `10ab4e9..HEAD`（`web/`、`test/`、`README.md`、`AGENTS.md`）、観点は既定（functional-correctness、requirements-closure、test-adequacy）に security-baseline（DOM と CSS の変更が受けた文字を HTML として解かない、秘密や個人のパスや IP を出さない）を足す。second_opinion：none。test_commands：`npm run lint`、`npm test`、`npm run build`。merge：agent（統括がマージする）
	経過の表記の追記（2026-11-14、S-08〜S-09）の関門：新しいブランチ `chemitaro/iss-00027-elapsed`、新しい PR。区切りのレビュー：なし。最終品質ゲート：範囲 `fc654c0..HEAD`（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）、観点は既定に security-baseline（新しく配るファイルの CORS が印の部品と同じだけ、秘密や個人のパスや IP を出さない）を足す。second_opinion：none。test_commands：`npm run lint`、`npm test`、`npm run build`。merge：agent（統括がマージする）
	"""
rollback: "PR #29 を戻せば、要約の2つの項目と部品のファイルがなくなり、試しの画面は前の文字の丸に戻る。PR #30 を戻せば、色と形は PR #29 のもの（塗りの丸い札）に戻り、回る動きがなくなる。経過の表記の PR を戻せば、経過は日本語（今・N分・N時間・N日）に、受け箱と Run の木は前の formatElapsed に戻り、`/embed/elapsed.js` は配られなくなる。状態の API とほかの配るファイルは元のまま。"
exit:     "最終品質ゲートが `68d8c88..HEAD`（PR #29）、追記の `10ab4e9..HEAD`（PR #30）、`fc654c0..HEAD`（経過の表記の PR）のそれぞれで合格し、実機の確かめと写しが report.md にあり、各 PR の CI が通ってマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-14）：Opus 5.5 / medium（方針の「タスク担当 × standard」から統括が選んだ）"}
		ui: {task: "印の部品（S-01。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分（HTML・CSS・画面の JavaScript）は Claude Opus 5.5、standard は medium。provider: claude"}
		impl: {task: "要約の項目と部品の配りの CORS（S-02〜S-03。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコード（API、サーバー、データの形）は Codex GPT-6.1 Sol / medium をなるべく使う。provider: codex"}
		trial: {task: "試しの画面の描き直し（S-04。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13）：画面は Claude Opus 5.5 / medium。S-03 の配りの後でないと別のオリジンから部品を読めないので、ui と別のセッションにする。provider: claude"}
		style: {task: "色とスタイルと回る動き（S-06。Claude の実装担当、Orca の worker。2026-11-14 の追記）", model: "claude-opus-5-5", effort: "medium", rationale: "統括の依頼（task_719d89144ea2、2026-11-14）：画面なので Claude Opus 5.5 / medium。provider: claude"}
		elapsed: {task: "経過の表記（S-08。Claude の実装担当、Orca の worker。2026-11-14 の追記）", model: "claude-opus-5-5", effort: "medium", rationale: "統括の依頼（task_27eff0d07653）：画面と一体なので Claude Opus 5.5 / medium（印の部品と試しの画面と配りを同じ手順で替えるため、純粋な関数だけの Codex に分けない）。provider: claude"}
		doc: {task: "実機の確かめ、写し、文書（S-05、S-07、S-09。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "統括の依頼書：要件・設計・計画と文書はタスク担当が書く。実機の確かめは読むだけで、コードを変えない"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-05", model: "opus", effort: "medium"}
		gate2: {role: "追記分の最終品質ゲート（quality-gate-reviewer）", after: "S-07", model: "opus", effort: "medium"}
		gate3: {role: "経過の表記の追記の最終品質ゲート（quality-gate-reviewer）", after: "S-09", model: "opus", effort: "medium"}
	}
}
