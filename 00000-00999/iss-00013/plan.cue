package spec

// 計画（Issue）。型 specdock/v1。
// 作業しながら、手順の追加、変更、status の更新を、このファイルに直接書く。

goal: "確かめてから送る3段と、送る経路のアダプター、送信の記録、結果の照会、送信を止める設定を、録画と再生で確かめながら作り、検証用の端末のエージェントで実機の確かめをして出す。"

// 開始のコミット：ce5d4e2（main、PR #23 のマージ）。worktree は iss-00013、ブランチ chemitaro/iss-00013。
// 各手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動せず、送る RPC は録画（手書きの仮の応答）と、呼ばれた回数を数える偽の口で与える。
// 送る RPC を実物の Orca に送るのは S-10（タスク担当、検証用の宛先だけ）だけ。実装担当は実物の Orca に送る RPC を送らない（`npm run send:live` を実行しない）。
// 仕様の読み方に迷ったら、直さずにタスク担当に問う。

steps: {
	"S-01": {
		title:    "会話の読み手の直し（D-11）"
		text:     "対象：`src/orca/read-transcript.ts`。確かめ：T-01。完了：`node --test test/orca/read-transcript.test.ts` が通り、別の sessionId のページ、hasMore（hasOlder）が真で位置が欠けるか形が違うページの両方の取得元について unknown_shape のテストがある。区切りのレビュー：なし"
		realizes: ["R-08"]
		status:   "todo"
		session:  "impl"
	}
	"S-02": {
		title:    "送る門と RPC の封筒、機能の確かめ（D-01、D-08）"
		text:     "対象：`src/orca/rpc.ts`、`src/orca/runtime.ts`、`src/orca/send-gates.ts`（新規）、`src/orca/capabilities.ts`、`src/orca/wiring.ts`（SendRpc を作るだけ）。確かめ：T-02、T-03、T-14。完了：`node --test test/orca/*.test.ts` が通り、封筒の位置と authToken を伏せること、門が決めた形だけを通して各種の違う形と一覧にない RPC を送らずに拒むこと、READ_METHODS が変わらないこと、sendTerminal と sendChat の確かめの満たし方と欠け方のテストがある。区切りのレビュー：なし"
		realizes: ["R-03", "F-04"]
		after:    ["S-01"]
		status:   "todo"
		session:  "impl"
	}
	"S-03": {
		title:    "宛先と票と本文の確かめ（D-02、D-03）"
		text:     "対象：`src/send/model.ts`（型）、`src/send/target.ts`、`src/send/ticket.ts`（新規、純な関数と票の倉庫）、`test/send/fixture.ts`（自分で作った仮のタブの集合）。確かめ：T-04、T-05、T-06。完了：`node --test test/send/target.test.ts test/send/ticket.test.ts` が通り、resolve の各 reason、compareTargets の各種類、本文の各拒み方、票の期限・1回だけ・上限・同期の消費のテストがある。Codex の実装担当 impl の最後の手順なので、止まって HEAD を報告する。区切りのレビュー：なし"
		realizes: ["R-01", "R-02", "F-01", "F-04", "F-05"]
		after:    ["S-02"]
		status:   "todo"
		session:  "impl"
	}
	"S-04": {
		title:    "送る経路のアダプターと結果の分け方と指紋（D-04）"
		text:     "対象：`src/orca/send.ts`（新規）。確かめ：T-07、T-08、T-09。完了：`node --test test/orca/send.test.ts` が通り、D-04 の表の各行、指紋の固定の値（Orca v1.4.258 の canonicalize を写した手計算の値）、送る関数が再試行しないこと（時間切れでも1回）、照会が送る RPC を呼ばないことのテストがある。区切りのレビュー：なし"
		realizes: ["R-02", "R-03", "R-05", "F-02", "F-03", "F-04"]
		after:    ["S-03"]
		status:   "todo"
		session:  "logic"
	}
	"S-05": {
		title:    "送信の記録と sendEnabled（D-05、D-07）"
		text:     "対象：`src/send/journal.ts`（新規）、`src/state/settings.ts`。確かめ：T-10、T-11。完了：`node --test test/send/journal.test.ts test/state/settings.test.ts` が通り、権限（0700、0600）、before の datasync の後に戻ること、書けないときに投げること、after と check のメモリーの持ち方、after のない before が unknown になること、壊れた行を飛ばすこと、sendEnabled の各場合（なし、偽、壊れたファイル、version 違い、真）と保存で消えないことのテストがある。テストは一時のディレクトリだけを使う。区切りのレビュー：なし"
		realizes: ["R-04", "R-06", "F-06"]
		after:    ["S-04"]
		status:   "todo"
		session:  "logic"
	}
	"S-06": {
		title:    "送信の処理（D-06）"
		text:     "対象：`src/send/service.ts`（新規）。確かめ：T-12、T-13。完了：`node --test test/send/service.test.ts` が通り、intent と confirm の各手順の止まり方（送る RPC が0回）、成功で送る RPC がちょうど1回、同時の2つの確定で1回、同じ票の2回目、本文の違い、宛先の各変化、sendEnabled の偽、before の書き込みの失敗、after の書き込みの失敗、check が unknown のときだけ照会して送る RPC を呼ばないこと、のテストがある。ここで二重送信を防ぐ契約が決まるので、区切りのレビュー CP-1 の最後の手順にする。止まって HEAD を報告する"
		realizes: ["R-01", "R-02", "R-04", "R-05", "R-06", "F-01", "F-02", "F-03", "F-05", "F-06"]
		after:    ["S-05"]
		status:   "todo"
		session:  "logic"
	}
	"S-07": {
		title:    "送信の HTTP の口と起動の組み立て（D-09）"
		text:     "対象：`src/server/app.ts`、`src/server/main.ts`、`src/server/config.ts`、`src/orca/wiring.ts`。確かめ：T-15、T-16。完了：`node --test test/server/*.test.ts` が通り、4つの道の成功、誤りの code と HTTP の状態の表、守りの順（Host、方法、Content-Type、Origin、トークン、物の大きさと鍵）、守りで拒んだ確定の記録、GET の同じオリジンの読み（Sec-Fetch-Site の cross-site を 403）、CORS なし、ORCA_WEB_SENDS_DIR の読み、のテストがある。区切りのレビュー：なし"
		realizes: ["R-01", "R-02", "R-05", "R-06", "F-05"]
		after:    ["S-06"]
		status:   "todo"
		session:  "api"
	}
	"S-08": {
		title:    "実機の確かめの道具（D-12）"
		text:     "対象：`src/tools/send-live.ts`（新規）、`package.json` の `send:live`。確かめ：T-17。完了：`node --test test/tools/*.test.ts` と `npm run lint`、`npm test`、`npm run build` が通り、worktree の守り（違う worktree、main の worktree の拒み）、場面の数え方、出力に本文・題名・パス・handle・セッションの識別子が出ないことのテストがある（偽の SendService と偽の口で。実物の Orca に送らない）。Codex の実装担当 api の最後の手順で、区切りのレビュー CP-2 の最後の手順。止まって HEAD を報告する"
		realizes: ["R-09"]
		after:    ["S-07"]
		status:   "todo"
		session:  "api"
	}
	"S-09": {
		title:    "送る欄と確認の画面（D-10）"
		text:     "対象：`web/embed/agent.html`、`web/embed/agent-frame.js`、`web/embed/send-view.js`、`web/embed/send-dom.js`（新規）、`web/embed/agent.css`、`src/server/app.ts` の STATIC_FILES（2つの js を足すだけ）。確かめ：T-18、T-19、T-20。完了：`node --test test/web/*.test.ts` と `npm run lint`、`npm test`、`npm run build` が通り、reduceSend の各出来事、5つの outcome と warning の言葉、409 と期限の経過で本文を残して戻ること、sending の間の2回目の押しを捨てること、unknown の照会、disabled の理由、textContent だけで描くことのテストがある。画面の実装担当（Claude Opus 5.5）の手順。終えたら止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-07", "F-01", "F-03"]
		after:    ["S-08"]
		status:   "todo"
		session:  "ui"
	}
	"S-10": {
		title:    "実機の確かめと 390px の表示を確かめ、report.md、README.md、AGENTS.md を書く"
		text:     "タスク担当が行う（文書と、送る RPC を実物の Orca に送る手順）。`npm run send:live -- --worktree <send-test のパス> --agent <Claude の id> --agent <Codex の id>` を、統括が許した2つの宛先だけで実行し、件数と結論だけを report.md に書く。構造化 Chat の検証用のセッションが届いていれば同じく確かめ、なければ録画と再生だけと書く。`npm start` を一時の port と一時の settings（sendEnabled: true）と一時の記録の置き場で起動し、send-test のエージェントの `/embed/agent` を幅 390px と広い幅で見て、確認の画面まで進めて「やめる」で戻る（送らない）。README.md と AGENTS.md に送信の口、記録、sendEnabled、send:live を書く。確かめ：T-21、T-22。完了：report.md の Verification に実機の表と結論がある"
		realizes: ["R-09", "R-07"]
		after:    ["S-09"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "会話の読み手が、別の sessionId のページと、続きがあるのに位置が欠けるページを、nativeChat と agentSession の両方で unknown_shape にする", verifies: ["R-08"]}
	"T-02": {title: "要求の行の最上位に orchestrationRequestId が置かれ、envelope がなければ今と同じ行になり、authToken は inspect と JSON に出ない", verifies: ["R-03"]}
	"T-03": {title: "送る門が、決めた形の terminal.send と agentSession.send と読む RPC だけを通し、interrupt・requireAgentStatus・操作の ID なし・delivery・画像の block・一覧にない RPC を送らずに拒み、READ_METHODS は変わらない", verifies: ["R-03", "F-02"]}
	"T-04": {title: "resolveTarget が、端末と構造化 Chat の宛先を解き、asleep、no_session、identity_unavailable、untabbed、agent_not_found、unknown_shape を返す", verifies: ["R-01", "F-04"]}
	"T-05": {title: "compareTargets が、runtime、タブ、handle、ptyId、incarnation、種類、セッションのそれぞれの変化を種類つきで返し、同じなら変化なし", verifies: ["R-02", "F-01"]}
	"T-06": {title: "本文の確かめ（空、空白だけ、16 KiB 超、CR と制御文字）と、票の期限・1回だけ・上限・同期の消費", verifies: ["R-01", "R-02", "F-05"]}
	"T-07": {title: "結果の分け方が、D-04 の表の各行の outcome と detail を返し、Orca の誤りの文を入れない", verifies: ["R-02", "R-04", "F-02", "F-03"]}
	"T-08": {title: "構造化 Chat の指紋が、Orca v1.4.258 の算法の固定の値と一致する", verifies: ["R-03"]}
	"T-09": {title: "送る関数が時間切れでも1回だけ送り、照会（requestShow、sendRecorded）が送る RPC を呼ばない", verifies: ["R-05", "F-03"]}
	"T-10": {title: "送信の記録の権限、before の datasync の後に送れること、書けないときに投げること、after・check のメモリー、after のない before の unknown、壊れた行の扱い、authToken を持たないこと", verifies: ["R-04", "R-05", "F-06"]}
	"T-11": {title: "sendEnabled の読みが、真のときだけ真で、ほかの各場合に偽、保存で消えない", verifies: ["R-06"]}
	"T-12": {title: "SendService の intent と confirm が、止まるべき各場合に送る RPC を0回、成功で1回だけ送り、同時の2つの確定でも1回", verifies: ["R-01", "R-02", "F-01", "F-02", "F-05"]}
	"T-13": {title: "SendService が、記録の書き込みの失敗で送らず、after の失敗を応答に示し、check が unknown のときだけ照会し、送り直さない", verifies: ["R-04", "R-05", "F-03", "F-06"]}
	"T-14": {title: "機能の確かめが、sendTerminal と sendChat の満たし方と欠け方を返し、確かめのために書き込みの RPC を呼ばない", verifies: ["F-04"]}
	"T-15": {title: "送信の4つの道の成功と、誤りの code と HTTP の状態、守りの順、CORS なし、GET の同じオリジンの読み", verifies: ["R-01", "R-02", "R-05", "F-05"]}
	"T-16": {title: "sendEnabled を偽にすると、再起動なしで意図と確定が 403 になり、照会の口は使える。守りで拒んだ確定が記録に残る", verifies: ["R-06", "F-05"]}
	"T-17": {title: "実機の確かめの道具の守りと集計と、出力に本文・題名・パス・handle・セッションの識別子が出ないこと", verifies: ["R-09"]}
	"T-18": {title: "送る欄の状態の純粋な関数が、確認の項目、5つの outcome と warning の言葉、unknown の照会、disabled の理由を作る", verifies: ["R-07"]}
	"T-19": {title: "409 と期限の経過で本文を残して書く欄に戻り、sending の間の2回目の押しを捨て、時間切れで送り直さない", verifies: ["R-07", "F-01", "F-03"]}
	"T-20": {title: "`<script>` を含む本文と題名が、確認の画面に文字のまま描かれ、要素にならない", verifies: ["R-07"]}
	"T-21": {title: "実機の確かめ（検証用の端末のエージェントへの送信、結果の区別、照会、送らない場合）", verifies: ["R-09", "R-02", "R-04", "R-05"]}
	"T-22": {title: "実機の画面で、幅 390px で送る欄と確認の画面が横にはみ出さない（送らずに戻る）", verifies: ["R-07"]}
}

verification: """
	各手順で、その手順のテストを録画の再生で通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。`npm run send:live` を、統括が許した検証用の宛先だけで、タスク担当が実行し、件数と結論だけを report.md に書く。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（strict。統括の依頼による coordinated の使い方なので、マージは統括が行う）
	- 区切りのレビュー CP-1：最後の手順 S-06、範囲 `ce5d4e2..<S-06 の後の HEAD>`、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）を2人（standards と spec）。理由：二重送信と誤送信を防ぐ契約（門、宛先の比べ方、票、結果の分け方、記録、処理の順）が S-06 までで決まり、HTTP（S-07）と画面（S-09）がそれに依る
	- 区切りのレビュー CP-2：最後の手順 S-08、範囲 `<CP-1 の合格の HEAD>..<S-08 の後の HEAD>`、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）を1人（standards と spec を1人で）。理由：HTTP の守りの順（トークンを確かめる前に票を消費しないこと）と、実物の Orca に送る道具の守りが決まる
	- 最終品質ゲート：範囲 `ce5d4e2..HEAD` の全体（`src/`、`web/`、`test/`、`package.json`、`README.md`、`AGENTS.md`）。観点は functional-correctness、requirements-closure、test-adequacy に、security-baseline（同じオリジン、トークン、秘密を出さない、XSS）と、concurrency-idempotency（二重送信、票の消費、同時の確定、再送しないこと）を足す。second_opinion：chatgpt（strict。取れなければ GPT-6 Astra / high）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "settings.json の `sendEnabled` を偽にするか消せば、再起動なしで送信の口がすべて拒み、画面は読むだけになる。PR を戻せば送信の口と画面の送る欄がなくなり、読む口と開く口は元のまま動く。送信の記録のファイルは残る。"
exit:     "CP-1 と CP-2 と、最終品質ゲート（`ce5d4e2..HEAD`）が合格し、検証用の端末のエージェントでの実機の確かめが report.md にあり、PR の CI が通ってマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "high", rationale: "統括の依頼書（2026-11-13）：Opus 5.5 / high（方針の「タスク担当 × strict」から統括が選んだ）"}
		impl: {task: "実装（S-01〜S-03。読み手の直し、門と封筒、機能の確かめ、宛先と票。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコードは Codex GPT-6.1 Sol / medium（方針の「実装担当 × strict」）。provider: codex"}
		logic: {task: "実装（S-04〜S-06。結果の分け方、指紋、記録、送信の処理。Codex の実装担当、Orca の worker）", model: "gpt-6-astra", effort: "high", rationale: "本人の指示（2026-11-13）で、難しいロジックは理由を書いて GPT-6 Astra / high にしてよい。理由：二重送信の防止（票の同期の消費、同時の確定、記録の順）と、結果不明の判定（D-04 の表、receipt の欠けの扱い）と、Orca の算法と同じ指紋が、この3手順に集まる。provider: codex"}
		api: {task: "実装（S-07〜S-08。HTTP の口と、実機の確かめの道具。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13）：API・サーバー側は Codex GPT-6.1 Sol / medium。provider: codex"}
		ui: {task: "画面の実装（S-09。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "high", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分は Claude Opus 5.5、strict なので方針の「実装担当（フロントエンド）× strict」の high。provider: claude"}
		doc: {task: "実機の確かめと文書（S-10。タスク担当が自分で行う）", model: "opus", effort: "high", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実物の Orca に送る確かめは、統括が許した宛先だけを、タスク担当が自分で行う"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。strict なので ChatGPT GPT-6 / Extra High の2人目を並べる）", model: "opus", effort: "high"}
		code: {role: "区切りのレビュー CP-1（code-reviewer ×2）と CP-2（code-reviewer ×1）", after: "S-06", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT GPT-6 / Extra High、取れなければ GPT-6 Astra / high）", after: "S-10", model: "opus", effort: "high"}
	}
}
