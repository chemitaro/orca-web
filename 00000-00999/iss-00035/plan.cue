package spec

// 計画（Issue）。型 specdock/v1。

goal: "純粋な組み立てとロゴの表を先に作り、その上に DOM と CSS の部品を作って3か所を置き換え、試しの画面で前後の写しを撮って出す。"

// 開始のコミット：1a2afed（main、PR #34 のマージ）。worktree は iss-00035、ブランチ chemitaro/iss-00035。
// 各手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない。
// 実装担当は Orca の開く操作を実物で呼ばない（試しの画面のボタンを押さない。押すのは S-03 のタスク担当が、試しの送り先の worktree だけ）。
// 実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。読み方に迷ったら直さずにタスク担当に問う。

steps: {
	"S-01": {
		title:    "Orca のロゴの表と、純粋な組み立て open-control-view.js（D-01、D-02）"
		text:     "対象：`web/embed/agent-marks-icons.js`（APP_ICONS と出どころの1行だけを足す。ほかの表は変えない）、新しい `web/embed/open-control-view.js`、新しい `test/web/open-control-view.test.ts`、`test/web/` の今のアイコンの表のテストに APP_ICONS の検査を足す。確かめ：T-01、T-02、T-03。完了：`node --test test/web/*.test.ts` と `npm run lint` と `npm test` が通る。DOM・CSS・HTML・inbox.js・agent-frame.js・open-button* は触らない（S-02 の範囲）。終えたらコミットして止まり HEAD を報告する"
		realizes: ["R-01", "R-03", "R-05", "F-01", "F-02"]
		status:   "todo"
		session:  "impl"
	}
	"S-02": {
		title:    "DOM と CSS の部品と、3か所の置き換え、iframe の大きさ（D-03〜D-06）"
		text:     "対象：`web/embed/agent-marks.js`（appIcon を出すだけ）、新しい `web/embed/open-control.js`・`open-control.css`、`web/embed/open-button.js`・`open-button.html`・`open-button-frame.js`・`open-button.css`、`web/embed/agent.html`・`agent-frame.js`・`agent.css`（古い #open の規則の削除と置き場）、`web/index.html`・`inbox.js`・`inbox-dom.js`・`style.css`（古い .open-status の削除）、`src/server/app.ts`（STATIC_FILES だけ）と、`test/web/` と `test/server/` のテスト。確かめ：T-04〜T-08。完了：`npm run lint`、`npm test`、`npm run build` が通る。描画の確かめは、実装担当が自分で起動した orca-web（一時の port、`npm run trial` か一時の settings）とヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じる）で、幅 1280px と 390px、明暗で、3か所の部品の高さ・アイコンの大きさ・切れ・横のはみ出しを数える。ボタンは押さない（状態は setState を直に呼んで見てよい）。iframe の既定の幅は、ここで測って定数にする。終えたらコミットして止まり HEAD を報告する"
		realizes: ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06", "F-01", "F-02"]
		after:    ["S-01"]
		status:   "todo"
		session:  "ui"
	}
	"S-03": {
		title:    "前後の写し、README.md と AGENTS.md、記録"
		text:     "タスク担当が行う。試しの画面（`npm run trial`、tailnet でも）で、直す前（1a2afed）と後の写しを明暗、Mac の幅と 390px で、置き換えたすべての場所（埋め込みのボタン＝試しの画面、詳細の見出し、受け箱）について撮り、Scope の artifacts に置き report.md に書く。開く操作は試しの送り先の worktree だけで1回押し、途中・開けたの変化を確かめる。README.md の『「Orca で開く」のボタン』の節（data-label、既定の大きさ）と AGENTS.md の web/ の説明を直す。確かめ：T-09、T-10。完了：report.md に写しと結論があり、`npm run lint`、`npm test`、`npm run build` が通る。試しのサーバーは本人が見られるように動かしたまま報告する"
		realizes: ["R-02", "R-04", "R-06"]
		after:    ["S-02"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "APP_ICONS.orca の d が stablyai/orca の resources/logo.svg（v1.4.258）の d と同じで、viewBox が transform を吸収した値、fill が currentColor。出どころと商標の1行がある（ファイルを読む）", verifies: ["R-01"]}
	"T-02": {title: "openResult が、ok で done『開きました』、mayCreateInitialTerminal で『開きました（Orca が端末を作ることがあります）』、表にある誤りの鍵でその言葉（9つ全部）、ない鍵と body.error がない応答で『開けません（<status>）』、network で『orca-web につながりません』を返し、body の他の文字（message など）を言葉に入れない", verifies: ["R-05", "F-01"]}
	"T-03": {title: "openControlView が、5つの状態と label text・none の組で、D-02 の text・ariaLabel・title・icon・disabled・busy・tone・status を返す（『Open（Orca で開く）』『Orca で開く』『worktree の指定がありません』）", verifies: ["R-01", "R-03", "R-05", "F-02"]}
	"T-04": {title: "createOpenControl が、偽の document で、button の aria-label・title・中の svg（aria-hidden）・'Open' の span（none ではない）・role=status の span を作り、setState で icon（ロゴ・回る印・チェック）と data-tone と disabled と aria-busy と status の文字が変わり、`<img onerror>` を含む言葉を文字のまま入れ、innerHTML を使わない", verifies: ["R-01", "R-03", "R-05", "F-01"]}
	"T-05": {title: "runOpen が、busy の間の2回目の押しで send を呼ばず、done の後 OPEN_DONE_MS で idle に戻り、error は残り、send の投げで network の言葉になる（偽の時計）", verifies: ["R-05"]}
	"T-06": {title: "open-control.css が、色・字体・角丸・線・フォーカスを `var(--ds-…, <既定>)` で使い、既定が SpecDock の app.css の明るい値と暗い値（prefers-color-scheme と data-theme の両方）に一致し、sm 24px・md 28px・アイコン 14px・16px、prefers-reduced-motion の規則がある。agent.css・style.css・open-button.css に古い開くボタンの見た目の規則が残らない（CSS を読むテスト）", verifies: ["R-02", "R-03"]}
	"T-07": {title: "open-button.js が、size と label で iframe の既定の幅と高さを決め（文字あり sm・md、アイコンだけ sm・md）、data-width で上書きでき、label=none をクエリーに渡し、390px 以下で読み込まない。3か所の HTML と JS に見える『Orca で開く』の文字のボタンが残らず、受け箱の項目が showOpen のときだけ部品を置く", verifies: ["R-01", "R-03", "R-04", "R-06"]}
	"T-08": {title: "既存の開く口と守りのテスト（test/server/app.test.ts の /api/open と /embed/open-button の CSP）が変わらずに通り、新しい3つのファイルが決めた型で配られ CORS がない", verifies: ["R-06"]}
	"T-09": {title: "試しの画面で、直す前と後の写し（明暗、Mac の幅と 390px、3か所）を撮り、部品の高さ・アイコンの大きさ・横のはみ出し 0・390px で出ないことを DOM で数える。試しの送り先の worktree で1回押し、途中と開けたの変化を見る（タスク担当、実機）", verifies: ["R-02", "R-04", "R-06"]}
	"T-10": {title: "README.md と AGENTS.md に data-label と新しい既定の大きさの説明があり、古い既定の幅 260 の記述が残らない（rg）", verifies: ["R-04"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門：
	- merge：統括が行う（タスク担当はマージしない）
	- 区切りのレビュー：なし
	- 最終のレビュー：S-02 の後、範囲 `1a2afed..HEAD` を code-review スキルの独立したレビュアー（Claude code-reviewer、Opus 5.5 / medium）で1回。観点は functional-correctness、requirements-closure、test-adequacy、security-baseline（textContent、トークンを出さない、CSP と CORS を広げない）、ui-interaction（明暗、390px、フォーカス、reduced-motion、SpecDock との一致）
	"""

exit: "PR を開き、CI が通り、本人が試しの画面で見る URL を報告した状態。本人の確かめは report.md に残す。"

execution: {
	sessions: {
		spec: {task: "仕様化とタスク担当", model: "claude-opus-5-5", effort: "medium", rationale: "統括が方針の『タスク担当 × standard』から選んだ"}
		impl: {task: "S-01 の純粋な部分", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（テストで確かめられる純粋な部分は Codex GPT-6.1 Sol / medium）"}
		ui:   {task: "S-02 の画面", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（画面と一体なので Claude Opus 5.5 / medium）"}
		doc:  {task: "S-03 の写しと文書", model: "claude-opus-5-5", effort: "medium", rationale: "タスク担当が行う"}
	}
	reviews: code: {role: "コードのレビュー", after: "S-02", model: "claude-opus-5-5", effort: "medium"}
}
