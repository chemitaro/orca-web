package spec

// 計画（Issue）。型 specdock/v1。

goal: "要対応の受け箱（段の決め方、連絡の読み取り、API、画面、プロジェクトの絞り込み）を出し、実機で、許可待ちと統括あての質問が要対応に出て、連絡が既読にならないことを確かめる。"

// 開始のコミット：4fa942020a7113fafb979a9c8d290b5c35f44520（main と同じ。worktree iss-00017、ブランチ chemitaro/iss-00017）。
// 各手順はテスト先行（tdd）。fixture は自分で作った仮の文だけ。仕様の読み方に迷ったら、直さずにタスク担当に問う。

steps: {
	"S-01": {
		title:    "段の決め方の純粋な関数と文書の型（D-01）を作る"
		text:     "対象：`src/inbox/model.ts`、`src/inbox/classify.ts`、`test/inbox/classify.test.ts`、手書きの入力 `test/inbox/fixture.ts`。入力の `MailSnapshot` の型もここで決める（S-02 が埋める）。確かめ：T-01、T-02、T-03、T-04、T-05。完了：`node --test test/inbox/classify.test.ts` と `npm run lint` が通る。区切りのレビュー：なし。この手順を終えたら止まって HEAD を報告する（セッション impl-logic の最後）"
		realizes: ["R-01", "R-02", "F-01", "F-02"]
		status:   "todo"
		session:  "impl-logic"
	}
	"S-02": {
		title:    "連絡と門の読み取り、読む口の一覧、最後の一言の拾い方（D-02）を作る"
		text:     "対象：`src/orca/read-mail.ts`、`src/orca/orca-cli.ts`（READ_COMMANDS と refuse）、`src/orca/read-state.ts`（lastAssistantMessage）、`test/orca/`。確かめ：T-06、T-07、T-08。完了：`node --test test/orca/*.test.ts` が通り、状態の API の文書に lastAssistantMessage が出ないことを既存の状態のテストで確かめている。区切りのレビュー：なし"
		realizes: ["R-01", "F-01"]
		after:    ["S-01"]
		status:   "todo"
		session:  "impl"
	}
	"S-03": {
		title:    "ポーリングへの連絡の取得元、`GET /api/inbox`、設定（D-03、D-04）を作る"
		text:     "対象：`src/state/poller.ts`、`src/server/app.ts`、`src/server/config.ts`、`src/server/main.ts`、`test/state/`、`test/server/`。確かめ：T-09、T-10、T-11、T-12。完了：`npm run lint`、`npm test`、`npm run build` が通る。ここで受け箱の契約（`orca-web.inbox/v1`、同じオリジンの道）が決まり、画面（S-04）がそれに依るので、区切りのレビュー CP-1 の最後の手順。止まって HEAD を報告する（セッション impl の最後）"
		realizes: ["R-01", "R-02", "F-01"]
		after:    ["S-02"]
		status:   "todo"
		session:  "impl"
	}
	"S-04": {
		title:    "受け箱の画面と `/settings`（D-05）を作る"
		text:     "対象：`web/index.html`、`web/settings.html`（今の index.html から）、`web/inbox.js`、`web/inbox-view.js`、`web/inbox-dom.js`（任意）、`web/style.css`、`src/server/app.ts` の配るファイルの表と CSP、`test/web/`、`test/server/`。確かめ：T-13、T-14、T-15。完了：`npm run lint`、`npm test`、`npm run build` が通る。`npm start` を一時の port で起動して、広い幅と 390px で見る（Orca で開くは押さない）。区切りのレビュー：なし（最終品質ゲートで見る）。止まって HEAD を報告する"
		realizes: ["R-01", "R-02", "F-01", "F-02"]
		after:    ["S-03"]
		status:   "todo"
		session:  "ui"
	}
	"S-05": {
		title:    "実機の確かめ（読むだけ）と、README.md、AGENTS.md、report.md を書く（D-06）"
		text:     "タスク担当が行う（文書の手順）。一時の port の `npm start` で `/api/inbox` を読み、段と理由ごとの件数だけを report.md に書く。許可待ちと統括あての未読の質問が needs_action に出ることと、読む前と後で未読の件数が同じことを確かめる（許可待ちと未読の質問が手元にないときは、統括に `ask` で用意を頼む）。`orca --version` を書く。確かめ：T-16。完了：report.md の Verification に実機の結論があり、README.md と AGENTS.md が出来上がったものと合う"
		realizes: ["R-01", "R-02"]
		after:    ["S-04"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "blocked・waiting・未読の question・decision_gate・待っている門のあるエージェントが needs_action に、理由つきで入る", verifies: ["R-01"]}
	"T-02": {title: "最後の出力から閾値以上の working、終了した端末、開いた PR の CI の失敗が stalled に入り、閾値より前と lastOutputAt の欠けた working は running", verifies: ["R-01"]}
	"T-03": {title: "done とスリープ（state が null で awaiting-restore）が finished に入り、finished に collapsed と最後の一言が付く", verifies: ["R-01"]}
	"T-04": {title: "state の欠けたエージェントと知らない state、URL の合わない未読の worker_done が unknown に入り、missing の code が付き、needs_action に入らない", verifies: ["F-02"]}
	"T-05": {title: "PR の項目（succeeded の worker と open の PR）、結び付かない質問・門の項目、絞り込み、projects の数、並び、鮮度と、連絡が一度も読めていないときの sources.mail", verifies: ["R-01", "R-02", "F-01"]}
	"T-06": {title: "連絡の読み取りが、決めた項目だけを拾い（本文、question の本文、options、reportPath を拾わない）、統括あてでない件を捨て、worker_done の PR の URL だけを拾う", verifies: ["R-01"]}
	"T-07": {title: "ReadOnlyOrcaCli が、`--peek` のない check と、`--ack`・`--all`・`--unread`・`--wait`・`--retry-request` の付いた check を呼ばずに拒む（既読にしない）", verifies: ["R-01"]}
	"T-08": {title: "門の読み取りが pending だけを返し、名前の揺れを受け、知らない形を invalid-shape にする。状態の文書に lastAssistantMessage が出ない", verifies: ["R-01", "F-01"]}
	"T-09": {title: "ポーリングが、見る人がいるときだけ、7 日以内・上限 50 の Run を読み、失敗した Run は前の値を残して数え、全部の失敗を error にする", verifies: ["R-01", "F-01"]}
	"T-10": {title: "`GET /api/inbox` が文書を返し、`?project=` で絞り、別のオリジンを 403、GET 以外を 405、長すぎる project を 400、inbox がなければ 503 にし、CORS を付けない", verifies: ["R-01", "R-02"]}
	"T-11": {title: "`ORCA_WEB_STALL_MINUTES` の既定 30 と、範囲外・整数でない値の ConfigError", verifies: ["R-01"]}
	"T-12": {title: "Orca に届かないとき、`/api/inbox` が最後に読めた内容と stale と connection を返す", verifies: ["F-01"]}
	"T-13": {title: "画面の組み立て（inbox-view.js）が、段の順、件数、項目の行、理由と経過の文、終わった段の畳み、鮮度と読めない部分の文を作り、https でない PR の URL をリンクにしない", verifies: ["R-01", "F-01", "F-02"]}
	"T-14": {title: "プロジェクトの選択が `?project=` を作り、URL から選択を読み戻す（純粋な関数）。`/settings` が一覧の表を配り、`/` が受け箱を配る", verifies: ["R-02"]}
	"T-15": {title: "`<script>` を含む最後の一言と題名が DOM で要素にならない（textContent だけ）", verifies: ["R-01"]}
	"T-16": {title: "実機の確かめ：許可待ちと統括あての質問が needs_action に出て、読む前と後で未読の件数が同じ。390px で横にはみ出さず、Orca で開くが出ない", verifies: ["R-01", "R-02"]}
}

verification: """
	各手順で、その手順のテストを録画の再生と手書きの入力で通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実機の確かめは読むだけで、件数と結論だけを report.md に書く。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：agent（統括がマージする）。merge_permission：本人が統括にマージを委任した（統括の依頼書、2026-11-13：「マージは統括が行う。本人が統括に委任した」）
	- 区切りのレビュー CP-1：最後の手順 S-03、範囲 `4fa9420..<S-03 の後の HEAD>`、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）。理由：受け箱の契約（`orca-web.inbox/v1`、同じオリジンの道、既読にしない読む口）が S-03 で決まり、画面（S-04）がそれに依る
	- 最終品質ゲート：範囲 `4fa9420..HEAD` の全体（`src/`、`web/`、`test/`、`package.json`、`README.md`、`AGENTS.md`）。観点は既定に、security-baseline（XSS、同じオリジン、既読にしない、秘密を出さない）を足す。second_opinion：none（standard）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "PR を戻せば、`/` が一覧の表に戻り、受け箱の API と連絡の読み取りがなくなる。状態の API と開く口と会話の API は元のまま動く。"
exit:     "CP-1 が `4fa9420..<S-03 の後の HEAD>` で、最終品質ゲートが `4fa9420..HEAD` で合格し、実機の確かめが report.md にあり、PR の CI が通ってマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-13）：Opus 5.5 / medium（方針の「タスク担当 × standard」から統括が選んだ）"}
		"impl-logic": {task: "段の決め方（S-01。Codex の実装担当、Orca の worker）", model: "gpt-6-astra", effort: "high", rationale: "本人の指示（2026-11-13、統括の依頼書）：難しいロジックのステップは理由を書いて GPT-6 Astra / high にしてよい。理由：段の優先の順、連絡・門・PR の結び付け、不明の判定が込み入り、純粋な関数で網羅のテストが要る。provider: codex"}
		impl: {task: "連絡の読み取り、ポーリング、API（S-02〜S-03。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコードは GPT-6.1 Sol / medium。provider: codex"}
		ui: {task: "画面（S-04。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分は Opus 5.5 / medium。provider: claude"}
		doc: {task: "実機の確かめと文書（S-05。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実機の確かめは読むだけで、コードを変えない"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		code: {role: "区切りのレビュー CP-1（code-reviewer）", after: "S-03", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-05", model: "opus", effort: "medium"}
	}
}
