package spec

// 計画（Issue）。型 specdock/v1。

goal: "サーバーの指紋と残りの P2 の直しを先に作って区切りのレビューを通し、その上に普通のチャットの画面を作り、試しの画面と検証用の宛先で確かめて出す。"

// 開始のコミット：fc654c0（main、PR #30 のマージ。iss-00027 の印の部品を含む。2026-11-14 にブランチを 68d8c88 から fast-forward した）。worktree は iss-00028、ブランチ chemitaro/iss-00028。
// 各手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない（録画と、呼ばれた回数を数える偽の口）。
// 実装担当は実物の Orca に送る RPC を送らない（`npm run send:live` も試しの画面からの送信もしない）。実物への送信は S-04 のタスク担当だけ。
// 仕様の読み方に迷ったら、直さずにタスク担当に問う。実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。

steps: {
	"S-01": {
		title:    "宛先の指紋と、送れるかの口・送る意図の追加の項目（D-01）"
		text:     "対象：`src/send/target.ts`（targetFingerprint）、`src/send/service.ts`（status の target・agentType、intent の target の比べ）、`src/server/app.ts`（意図の物の鍵 target の検査）と、`test/send/target.test.ts`、`test/send/service.test.ts`、`test/server/send-api.test.ts`。確かめ：T-01、T-02。完了：`node --test test/send/*.test.ts test/server/send-api.test.ts` と `npm run lint` が通り、指紋が決まった値になり各項目の違いで変わり識別子そのものを含まないこと、status の新しい2つの項目（通らないときは null）、指紋の違う意図が送る RPC を0回で 409 target_changed（changed_since_shown）になること、指紋のない意図と同じ指紋の意図が今と同じに票を返すこと、HTTP の target の形の誤りが 400 で、ほかの鍵が今と同じに 400 のテストがある。区切りのレビュー：なし"
		realizes: ["R-04", "R-06", "F-04"]
		status:   "done"
		session:  "impl"
	}
	"S-02": {
		title:    "iss-00013 の残りの P2 の直し（D-02 の (b)〜(f)）"
		text:     "対象：`src/send/journal.ts`（(b)、(d)）、`src/send/service.ts`（(c)、(d)、(e)）、`src/server/app.ts`（record_unreadable の 503）、`src/orca/send.ts`（(f) の checkChat だけ）と、それぞれのテスト。確かめ：T-03、T-04、T-05、T-06、T-07。完了：`node --test test/send/*.test.ts test/orca/send.test.ts test/server/send-api.test.ts` と `npm run lint`、`npm test`、`npm run build` が通り、T-03〜T-07 のテストがある。実装担当 impl の最後の手順で、区切りのレビュー CP-1 の最後の手順。止まって HEAD を報告する"
		realizes: ["R-07", "F-05"]
		after:    ["S-01"]
		status:   "done"
		session:  "impl"
	}
	"S-03": {
		title:    "普通のチャットの画面（D-03、D-04、D-05、D-07、D-08、D-09、R-07 の (a) の言葉）"
		text:     "対象：`web/embed/agent.html`、`web/embed/agent.css`、`web/embed/agent-frame.js`、`web/embed/send-view.js`、`web/embed/send-dom.js`、`web/embed/agent-view.js`（formatAgo）、`web/embed/agent-dom.js`（時刻）と、`test/web/agent-view.test.ts`、`test/web/agent-dom.test.ts`、`test/web/send-view.test.ts`、`test/web/send-dom.test.ts`、画面の静的な形のテスト（`test/web/` に足す。`agent.html` を読む）。`src/server/app.ts` の STATIC_FILES はファイルを足すときだけ変える。`web/embed/agent-marks*.js` と `agent-marks.css` は変えない。確かめ：T-08、T-09、T-10、T-11、T-12、T-13、T-16、T-17、T-18。完了：`node --test test/web/*.test.ts` と `npm run lint`、`npm test`、`npm run build` が通り、T-08〜T-13 と T-16〜T-18 のテストがある。描画の確かめは、実装担当が自分で起動した orca-web（一時の port、一時の settings で sendEnabled は偽のまま）とヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じる）で、幅 1280px と 390px、明暗の両方で、詳細が畳まれ、見出しに印が出て、送るボタンが出て、横のはみ出しがないことを見る（送らない）。画面の実装担当の手順。終えたら止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-01", "R-02", "R-03", "R-04", "R-05", "R-07", "R-09", "R-10", "R-11", "F-01", "F-02", "F-03", "F-04", "F-06"]
		after:    ["S-02"]
		status:   "done"
		session:  "ui"
	}
	"S-04": {
		title:    "試しの画面での写しと検証用の宛先への送信、README.md と AGENTS.md（D-06）"
		text:     "タスク担当が行う（文書と、実物の Orca に送る手順）。D-06 のとおり、`npm run trial` で幅 1280px と 390px、明暗の写し（会話の欄をぼかし、SpecDock のダッシュボードと並べる）を Scope の `artifacts/` に置き、send-test の Claude と Codex の2つにだけ Enter で1回ずつ送り、outcome と試しの記録の行の数を report.md に書く（会話と送った文の中身は写さない）。README.md と AGENTS.md の送信の説明を直す。確かめ：T-14、T-15。完了：report.md の Verification に写しと送信の結論があり、`npm run lint`、`npm test`、`npm run build` が通る。試しのサーバーは本人が見られるように動かしたまま報告する"
		realizes: ["R-08", "R-01", "R-02", "R-03", "R-09"]
		after:    ["S-03"]
		status:   "done"
		session:  "doc"
	}
	"S-05": {
		title:    "吹き出しを1重にする（D-10、R-12。PR #32 の後の続き）"
		text:     "対象：`web/embed/agent.css`、`test/web/agent-css.test.ts`（必要なら `test/web/agent-dom.test.ts`）。ブランチ chemitaro/iss-00028-bubble、開始のコミット 3a83547（origin/main）。確かめ：T-19。完了：`node --test test/web/*.test.ts`、`npm run lint`、`npm test`、`npm run build` が通り、T-19 のテストがある。描画の確かめは S-03 と同じ方法（一時の orca-web、sendEnabled は偽、ヘッドレスの Chrome）で、1280px と 390px、明暗で、発言の li の線の幅 0・背景が透明・内側の余白 0、本文の div だけが線を持つことを数える（送らない）。画面の実装担当（Claude Opus 5.5 / high）の手順。終えたら止まって HEAD を報告する。区切りのレビュー：なし"
		realizes: ["R-12"]
		after:    ["S-04"]
		status:   "done"
		session:  "ui2"
	}
	"S-06": {
		title:    "直す前と後の写しと記録（R-12）"
		text:     "タスク担当が行う。試しの画面（8793・47910、tailnet でも動かしたまま）で、S-04 と同じ方法（iframe だけを切り出し、本文の文字は透明にして中身を写さない）で、直す前（3a83547）と後の写しを明暗、1280px と 390px で撮り、並べて Scope の artifacts に入れ、report.md に書く。確かめ：T-20。完了：report.md に前後の写しと数の結論がある"
		realizes: ["R-12"]
		after:    ["S-05"]
		status:   "done"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "targetFingerprint が、端末と構造化 Chat で決まった32文字の16進を返し、指紋に入る各項目の違いで変わり、識別子そのものを含まない。status が、通るときに target と agentType を、通らないときに null を返す", verifies: ["R-04", "F-04"]}
	"T-02": {title: "intent が、違う target で送る RPC を0回のまま 409 target_changed（changed_since_shown）を返し票を出さず、target のない意図と同じ target の意図は今と同じに票を返す。HTTP が target の形の誤りとほかの鍵を 400 にし、既存の送信の口のテストが変わらずに通る", verifies: ["R-04", "R-06", "F-04"]}
	"T-03": {title: "記録の読みが、確定した照会の行の後に unknown の照会の行が来ても、確定した結果を返す", verifies: ["R-07"]}
	"T-04": {title: "照会の結果の追記が失敗すると、照会の応答に checkWarning check_record_failed が付く", verifies: ["R-07"]}
	"T-05": {title: "記録のファイルの読みが ENOENT 以外で失敗したとき、メモリーの行があればそれで答え、なければ照会が 503 record_unreadable になり、not_sent を返さない", verifies: ["R-07", "F-05"]}
	"T-06": {title: "再起動の直後（preflight の前）の照会で method_not_found が分かると、記録の宛先が今の runtime と同じなら、その経路の status が送れないと示し、意図が unsupported になる。runtime が違えば止めない", verifies: ["R-07"]}
	"T-07": {title: "構造化 Chat の照会で、カードがなく queuedMessageId でだけ当たった submission が rejected なら unknown（card_gone）を返し、accepted も refused も返さない。送る時の応答の分け方は変わらない", verifies: ["R-07"]}
	"T-08": {title: "composerKeyAction が、Enter で send、Shift+Enter・Alt+Enter で null、Cmd/Ctrl+Enter で send、isComposing・keyCode 229・repeat で null、タッチが主の端末の Enter で null、Enter でない鍵で null を返す", verifies: ["R-02", "F-01"]}
	"T-09": {title: "送る流れが、1回の submit で意図と確定を1回ずつ送り、意図に status の target を添え、sending の間の submit を捨て、届いたら本文を空にして warning の言葉を出し、送る前の拒みと refused で本文を残して1行の理由を出し、どの送る前の拒みの後も status を1回読み直し、send_disabled で disabled になる。compose の間に status が固定と違う指紋を返すと target を上書きせずに changed になり、changed の間の submit を捨て、adopt で新しい指紋を固定して compose に戻り、その後の意図に新しい指紋を添える。意図の changed_since_shown でも changed になる", verifies: ["R-03", "R-04", "R-05", "R-06", "F-02", "F-04"]}
	"T-10": {title: "確定の応答を失うか unknown のとき、unknown の帯になり、その間の submit と input を捨て、「確かめる」が意図の操作の ID で照会し、届いていれば本文を空に、送っていなければ本文を残して compose に、「閉じる」で本文を残して compose に戻る。自動で送り直さない", verifies: ["R-05", "F-03"]}
	"T-11": {title: "buildSendView が、確認の画面・期限・送る前の「確かめる」を作らず、送るボタンを compose で本文があるときだけ押せるようにし、disabled の理由（foreground_mismatch を含む）を言葉で、changed で知らせと「新しい宛先で続ける」を作って送るボタンを止め、placeholder を端末の種類と agentType で作る", verifies: ["R-02", "R-03", "R-04", "R-07"]}
	"T-12": {title: "renderSendPanel が、`<script>` と `<img onerror>` を含む理由・warning・code を文字のまま描き、作る要素は DIV・P・UL・LI・BUTTON・SPAN だけで、innerHTML を使うと偽の要素が投げる", verifies: ["F-06"]}
	"T-13": {title: "agent.html の詳細の details に open の属性がなく、送るボタン（aria-label 送る）と入力欄があり、agent-frame.js が幅で details を開け閉めしない", verifies: ["R-01", "R-02"]}
	"T-14": {title: "試しの画面で、幅 1280px と 390px、明暗の写しを撮って SpecDock のダッシュボードと並べ、詳細が畳まれ、送るボタンがあり、横のはみ出しが 0。send-test の Claude と Codex に Enter で1回ずつ送り、届いた結果と記録の行の数を確かめる（タスク担当、実機）", verifies: ["R-08", "R-01", "R-02", "R-03", "R-09"]}
	"T-16": {title: "agent.css が、色・字体・角丸・線・フォーカスを `var(--ds-…, <既定>)` の形で使い、既定の値が SpecDock の app.css（c050e7bd7）の明るい値と暗い値（prefers-color-scheme と data-theme の両方）に一致し、`--bg` などの古い名前の色の直書きが残らない。agent.css が `--sd-*` の状態の変数を、明るい値と暗い値（prefers-color-scheme と data-theme が dark の両方）で、agent-marks.css の各状態の既定と同じ値で置く（CSS を読むテスト。iss-00027 の test/web/agent-marks-css.test.ts と同じ方式）", verifies: ["R-09", "R-10"]}
	"T-17": {title: "詳細の見出しの印：要約の中のこのエージェントだけを、elapsedFrom と elapsedBasis を null にした写しで、renderAgentMarks で max 1 で描き（.orca-mark-time がなく aria-label に経過がない）、見つからない・読めないときは置き場を空にし、agent.html が agent-marks.css を読み、summary に置き場がある", verifies: ["R-10"]}
	"T-18": {title: "formatAgo が 59 秒で now、1〜59 分で Nm、1〜23 時間で Nh、24 時間以上で Nd、未来と読めない値で null を返し、会話の行の time に datetime と title があり、文字に『今』『分』『時間』『日』が入らない", verifies: ["R-11"]}
	"T-19": {title: "agent.css の吹き出しの規則が本文の要素（li.row の子）だけに当たり、li.row に線・背景・内側の余白の規則がないことを CSS を読んで確かめ、吹き出しの色の変数（ready の組、surface）が R-09 のまま", verifies: ["R-12"]}
	"T-20": {title: "試しの画面で、直す前と後の写し（明暗、1280px と 390px）を撮り、発言の li の線の幅 0・背景が透明、本文の div だけが線を持つことを DOM で数える（タスク担当、実機）", verifies: ["R-12"]}
	"T-15": {title: "README.md と AGENTS.md に、確認の画面・送る前の「確かめる」・60 秒の期限の説明が残っていない（`rg` で確かめる）", verifies: ["R-08"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実物の Orca への送信は S-04 のタスク担当だけ、試しの送り先の2つだけ。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（strict。統括の依頼による coordinated の使い方なので、マージは統括が行う。タスク担当はマージしない）
	- 区切りのレビュー CP-1：最後の手順 S-02、範囲 `fc654c0..<S-02 の後の HEAD>`、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）を1人（standards と spec を1人で）。理由：画面（S-03）が依る HTTP の口の形（指紋、record_unreadable、checkWarning）と、照会が not_sent を誤って示さない契約が S-02 までで決まる
	- 最終品質ゲート：範囲 `fc654c0..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy に、security-baseline（同じオリジン、トークン、識別子と秘密を出さない、textContent）と、concurrency-idempotency（二重送信、結果不明の後に送らないこと、照会が not_sent を誤って示さないこと）と、ui-interaction（Enter・Shift+Enter・変換中・タッチが主の端末、詳細の畳み、390px、SpecDock のデザインシステムとの一致、明暗）を足す。second_opinion：chatgpt（strict。取れなければ GPT-6 Astra / high）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- 続き（R-12、2026-11-14）：新しいブランチ chemitaro/iss-00028-bubble、開始のコミット 3a83547（PR #32 のマージを含む origin/main）。区切りのレビューなし。最終品質ゲートは範囲 `3a83547..HEAD`、観点は functional-correctness、requirements-closure、test-adequacy、e2e-user-flow、second_opinion：chatgpt。PR は新しく作る
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "settings.json の `sendEnabled` を偽にするか消せば、再起動なしで送信の口がすべて拒み、画面は読むだけになる。PR を戻せば、確認の画面つきの iss-00013 の画面とサーバーに戻る（HTTP の口の形は互換なので、戻しても記録は読める）。"
exit:     "CP-1 と最終品質ゲート（`fc654c0..HEAD`、または取り込み後の HEAD）が合格し、試しの画面の写しと検証用の宛先への送信が report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "high", rationale: "統括の依頼書（2026-11-14）：Opus 5.5 / high（方針の「タスク担当 × strict」から統括が選んだ）"}
		impl: {task: "実装（S-01〜S-02。指紋と送れるかの口、残りの P2 の直し。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコード（API、サーバー、データの形）は Codex GPT-6.1 Sol / medium（方針の「実装担当 × strict」）。Sol で失敗や見落としが記録されたときだけ GPT-6 Astra / high に上げる。provider: codex"}
		ui: {task: "画面の実装（S-03。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "high", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分は Claude Opus 5.5、strict なので high（方針の「実装担当（フロントエンド）× strict」）。provider: claude"}
		ui2: {task: "吹き出しを1重にする（S-05。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "high", rationale: "統括の依頼書（2026-11-14）：画面なので Claude Opus 5.5 / high（方針の「実装担当（フロントエンド）× strict」）。provider: claude"}
		doc: {task: "試しの画面の写し、検証用の宛先への送信、文書（S-04、S-06。タスク担当が自分で行う）", model: "opus", effort: "high", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実物の Orca に送る確かめは、統括が許した宛先だけを、タスク担当が自分で行う"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。strict なので ChatGPT GPT-6 / Extra High の2人目を並べる）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー CP-1（code-reviewer ×1：standards と spec）", after: "S-02", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT GPT-6 / Extra High、取れなければ GPT-6 Astra / high）", after: "S-04", model: "opus", effort: "high"}
		gate2: {role: "続きの最終品質ゲート（範囲 3a83547..HEAD。quality-gate-reviewer と ChatGPT GPT-6 / Extra High）", after: "S-06", model: "opus", effort: "high"}
	}
}
