package spec

// 計画（Issue）。型 specdock/v1。

goal: "端末の許可の確認の同一性と選択肢、承認のキー、門・アダプター・サービス・記録・HTTP の口を作って区切りのレビューを通し、その上に承認のカードの端末の手段を差し替え、文書と本人の確かめの手順を書いて出す。"

// 開始のコミット：253a1a6（main、PR #56 のマージ）。worktree は iss-00054、ブランチ chemitaro/iss-00054。
// 各手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない（録画と、呼ばれた回数を数える偽の口）。
// 実装担当は実物の Orca に書き込みの RPC を送らない。
// 仕様の読み方に迷ったら、直さずにタスク担当に問う。実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。
// Orca v1.4.261 のソースは `.workbench/orca-src/`（Git の外）にある。値の根拠として読んでよい（ファイルをコミットしない）。
// 並行の iss-00055 が承認のカードと送信の層（`src/send/`）に触れる。PR の直前に origin/main を取り込み直し、最終のコミットでテストとゲートをやり直す。

steps: {
	"S-01": {
		title:    "端末の許可の確認の同一性と正規化、承認のキー、門・アダプター・サービス・記録・HTTP の口（D-01〜D-05）"
		text:     "対象：`src/transcript/terminal-approval.ts`（新）、`src/transcript/normalize.ts`、`src/send/keys.ts`、`src/send/target.ts`、`src/orca/send-gates.ts`、`src/orca/send.ts`、`src/send/service.ts`、`src/send/ticket.ts`、`src/send/journal.ts`、`src/send/model.ts`（要れば）、`src/server/app.ts` と、`test/transcript/terminal-approval.test.ts`（新）、`test/transcript/normalize.test.ts`、`test/send/keys.test.ts`、`test/send/target.test.ts`、`test/orca/send-gates.test.ts`、`test/orca/send.test.ts`、`test/send/service.test.ts`（または承認の答えのテスト）、`test/send/journal.test.ts`、`test/server/*.test.ts`（承認の HTTP の口のテスト）。確かめ：T-01〜T-08。完了：`npm run lint`、`npm test`、`npm run build` が通り、T-01〜T-08 のテストがあり、今の端末の承認の正規化のテストは、promptId・options・answerable の期待値を変えるほかは変えずに通る。実装担当 impl の手順で、区切りのレビュー CP-1 の最後の手順。止まって HEAD を報告する"
		realizes: ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06", "F-01", "F-02", "F-03", "F-04"]
		status:   "todo"
		session:  "impl"
	}
	"S-02": {
		title:    "承認のカードの端末の手段（D-06）"
		text:     "対象：`web/embed/approval-view.js`、`web/embed/approval-dom.js`、`web/embed/agent-view.js`、`web/embed/agent-frame.js`、`web/embed/agent.css` と、`test/web/approval-view.test.ts`、`test/web/approval-dom.test.ts`、`test/web/agent-view.test.ts`、`test/web/agent-css.test.ts`。`web/embed/question-view.js` の契約と export、`open-control*.js`、`agent-marks*.js` は使うだけで変えない。確かめ：T-09〜T-12。完了：`node --test test/web/*.test.ts`、`npm run lint`、`npm test`、`npm run build` が通り、T-09〜T-12 のテストがある。描画の確かめは、実装担当が自分で起動した orca-web（一時の port、一時の settings、偽の Orca の会話と偽の送信の口。実物の Orca には書き込まない）とヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じる）で、幅 1280px と 390px、明暗で、端末の承認のカード（押せる形、押せない形と理由、送った後、結果不明の帯、押し直せない形）が横にはみ出さず、選択肢の高さが 44px 以上であることを DOM で数え、写しを `.workbench/implement/iss-00054/render/` に置く。終えたら止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-02", "R-03", "R-04", "R-05", "R-06", "R-07"]
		after:    ["S-01"]
		status:   "todo"
		session:  "ui"
	}
	"S-03": {
		title:    "README.md と AGENTS.md、本人の確かめの手順と写し（D-07）"
		text:     "タスク担当が行う。D-07 のとおり。確かめ：T-13。完了：README.md と AGENTS.md に端末の承認の答えがあり、report.md の Verification に描画の写しの場所、試しの画面での確かめ、本人の確かめの手順と残る危険があり、`npm run lint`、`npm test`、`npm run build` が通る。試しの画面は本人が見られるように動かしたまま報告する"
		realizes: ["R-02", "R-07"]
		after:    ["S-02"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "terminal-approval：readTerminalApproval が null・物でない・state が working・待っているのに interactivePrompt がない・JSON でない・approval のない封筒（質問）・tool が空・summary が空・上限を超える tool と summary を、unverified・not_waiting・other・approval（truncated）に分け、terminalApprovalId が ta_ と16進20字で、stateStartedAt か interactivePrompt が違えば違う値、同じなら同じ値。matchTerminalApproval が match・unverified・gone・mismatch（違う promptId、質問の封筒）・truncated を返す", verifies: ["R-01", "R-04", "F-03"]}
	"T-02": {title: "正規化：端末のエージェントが許可を待つとき、pending-approval の承認の部分が promptId、2つの選択肢（allow_once Allow once、reject_once Reject、intent 付き）、answerable 真・unanswerableReason null を持ち、切った承認は answerable 偽（terminal）。構造化 Chat の承認の部分は promptId null で、ほかは今のまま。待っていない・読めない封筒では件を足さない", verifies: ["R-01"]}
	"T-03": {title: "approvalKey：claude と codex で allow_once が `1`、reject_once が ESC、ほかの種類（opencode など）とほかの optionId は null。terminalStatusOf が id と leafId で照合し、3つの値を手を加えずに返す", verifies: ["R-02"]}
	"T-04": {title: "門：キーの組の ESC だけの text を通し、ESC [ D、ESC と文字の組、ESC を2つ、を今のとおり拒む。今のキーの組と agentPrompt の形は変わらない", verifies: ["R-02", "F-04"]}
	"T-05": {title: "アダプター：answerApprovalKey が送る直前に前面と listAll を読み、前面がシェル・違う・読めない、許可の確認が消えた・変わった・読めないときは terminal.send を呼ばず refused（not_sent）、通れば terminal.send を1回（enter 偽、requireWriteSettlement 真、client orca-web desktop）呼び、accepted・refused・unknown・method_not_found を input_accepted（keys_sent）・refused（not_sent）・unknown（unconfirmed）・refused（method_not_found）に分ける。checkTerminalApproval が match で prompt_pending、unverified で prompt_unverified、ないか違えば resolved_unverified を返し、terminal.send を呼ばない", verifies: ["R-02", "R-04", "R-05", "F-02", "F-03"]}
	"T-06": {title: "approvalIntent（promptId）：sendEnabled 偽、構造化 Chat の宛先、知らない種類のエージェント、能力なし、前面がシェル、agentStatus がない、interactivePrompt がない、state が working、promptId が違う、質問の封筒、切られた封筒、前に送った記録がある（新しい SendService でも記録から）、記録が読めない、allow_always や `2` などの optionId、で決めた error と reason を返し、書き込みの RPC を0回。端末の status が permission でも通り、票と intent を返す", verifies: ["R-03", "R-04", "R-05", "R-06"]}
	"T-07": {title: "approvalConfirm（promptId）：同じ票の2回目と送っている間の2回目を送らず、確定の前に許可の確認が消えた・変わった・optionId が違うときは送らず、通れば before の記録の後にキーを1回だけ送り（claude の allow_once が `1`、codex の reject_once が ESC）、送り始めた後の同じ promptId の意図と確定を already_sent で拒む。terminalApproval の票と構造化 Chat の承認・質問・callId・送信の票を取り違えない。before の記録を書けなければ送らない。照会が mode keys の承認の記録で checkTerminalApproval を使い、after の行のない記録は no_after_record。記録の before・after・refused の行に、allow_once・reject_once の id、`1`・ESC のバイト、道具の名前、要約が入らず、action approval・mode keys・route terminal・promptId・intent・digest・totalGroups 1 が入る。hasApproval が before の行から見つけ、今の構造化 Chat の承認と質問の行は変わらない", verifies: ["R-02", "R-05", "F-01", "F-02"]}
	"T-08": {title: "HTTP：`/api/approval/intent` が promptId の物を受け、prompt と promptId の両方・どちらもない・形の違う promptId・余分な鍵を 400 で拒み、守り（同じオリジン、トークン、CORS なし）は今のまま", verifies: ["R-02", "R-06"]}
	"T-09": {title: "createTerminalApprover：availability が promptId なし・answerable 偽・status なし・sendEnabled 偽・answerKeys がない・answerKeys が agent_keys_unknown・unsupported で押せない理由と open 真を返し、available で ok。submit が意図と確定を1回ずつ `{agent, promptId, optionId, confirmPersistent}`・`{ticket, optionId}` で送る。approverFor が source terminal に terminal の手段を選ぶ", verifies: ["R-02", "R-03", "R-06"]}
	"T-10": {title: "流れ：確定の input_accepted で done と「答えを送りました…」、200 の refused で blocked、200 の unknown・応答の欠けで partial（押し直し・閉じる・照会を受けない）、意図の already_sent・question_gone・prompt_mismatch・prompt_unsupported・agent_keys_unknown で blocked、prompt_unverified で refused（押し直せる）。どれも送ったと偽らず、未回答の端末のカードはいつも open 真", verifies: ["R-04", "R-05"]}
	"T-11": {title: "buildChat：source terminal の承認の行の key が promptId を含み、promptId の違う承認に前の流れの状態を持ち越さない。approval-dom.js が partial の帯と blocked の理由を textContent だけで描き、`<script>` や `<img onerror>` の文字を文字のまま描き、「Orca で開く」を出す", verifies: ["R-04", "R-05", "R-07"]}
	"T-12": {title: "agent.css の帯の規則が `var(--ds-…, 既定)` を使い、折り返しの規則がある（CSS を読むテスト）", verifies: ["R-07"]}
	"T-13": {title: "S-02 の描画の確かめの写し（1280px・390px、明暗、はみ出し 0、選択肢 44px 以上）を report.md に挙げ、試しの画面で構造化 Chat の承認のカードが今のまま描けることを見る（タスク担当）。端末の実機の答えは本人の確かめの手順として report.md に書く", verifies: ["R-02", "R-07"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実物の Orca への書き込みはしない（端末の実機は本人の確かめ）。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う。タスク担当はマージしない）
	- 区切りのレビュー CP-1：最後の手順 S-01、範囲 `253a1a6..<S-01 の後の HEAD>`、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）を1人（standards と spec を1人で）。理由：画面（S-02）が依る部分の形と答えの口の契約、端末に書き込む門と、送る直前の確かめ・二度と送らないことが S-01 で決まる
	- 最終品質ゲート：範囲 `253a1a6..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy、security-baseline（端末に書き込む門、同じオリジン、トークン、記録に中身を出さない、textContent）、reliability-recovery（送る直前の確かめ、二度と送らないこと、結果不明の後に送らないこと）、e2e-user-flow（押せる形、390px、明暗、押せない理由、結果不明の帯）。second_opinion：chatgpt（統括の補足『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ記録して主のレビュアーで続ける）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "settings.json の `sendEnabled` を偽にすれば、答えの口はすべて拒み、カードは読むだけになる。PR を戻せば、端末の承認は今の読むだけ（理由と「Orca で開く」）に戻る。"
exit:     "CP-1 と最終品質ゲート（`253a1a6..HEAD`、または取り込み後の HEAD）が合格し、描画の写しと、端末の実機の本人の確かめの手順と残る危険が report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-18）：Opus 5.5 / medium（方針の「タスク担当 × standard」）"}
		impl: {task: "実装（S-01。端末の許可の確認の同一性と正規化、承認のキー、門・アダプター・サービス・記録・HTTP の口。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコード（API、サーバー、データの形）は Codex GPT-6.1 Sol / medium。方針の「実装担当（バックエンド）× standard」。Sol で失敗や見落としが記録されたときだけ GPT-6 Astra / high に上げる。Codex が chat-scratch の symlink の拒否で止まったら worker-stop して Claude Opus 5.5 / medium に切り替える（統括が了承済み）。provider: codex"}
		ui: {task: "画面の実装（S-02。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分は Claude Opus 5.5、standard なので medium（方針の「実装担当（フロントエンド）× standard」）。provider: claude"}
		doc: {task: "文書と確かめ（S-03。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。standard なので1人）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー CP-1（code-reviewer ×1：standards と spec）", after: "S-01", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-03", model: "opus", effort: "medium"}
	}
}
