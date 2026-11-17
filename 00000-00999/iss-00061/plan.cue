package spec

// 計画（Issue）。型 specdock/v1。

goal: "Markdown を木に解く純な関数を作って区切りのレビューを通し、その上に木を DOM にする部品と小窓への組み込み・見た目・写しの使い回しを作り、文書と実機の写しを残して出す。"

// 開始のコミット：0a55268（main、PR #60 のマージ）。worktree は iss-00061、ブランチ chemitaro/iss-00061。
// 各手順は tdd で、まず失敗するテストを書いてから作る。テストは Orca を起動しない。
// 実装担当は実物の Orca に書き込みの RPC を送らない。仕様の読み方に迷ったら、直さずにタスク担当に問う。
// 実装担当は requirement.cue・design.cue・plan.cue と epic の文書を変えない。

steps: {
	"S-01": {
		title:    "Markdown を木に解く純な関数（D-01）"
		text:     "対象：`web/embed/markdown.js`（新）と `test/web/markdown.test.ts`（新）。DOM に触らない。確かめ：T-01〜T-03。完了：`node --test test/web/markdown.test.ts`、`npm run lint`、`npm test`、`npm run build` が通り、T-01〜T-03 のテストがある。実装担当 impl の手順で、区切りのレビュー CP-1 の最後の手順。止まって HEAD を報告する"
		realizes: ["R-01", "R-02", "R-03", "F-02", "F-03"]
		status:   "todo"
		session:  "impl"
	}
	"S-02": {
		title:    "木を DOM にする部品、小窓への組み込み、写しの使い回し、見た目、配る口（D-02〜D-06 の画面と STATIC_FILES）"
		text:     "対象：`web/embed/markdown-dom.js`（新）、`web/embed/agent-dom.js`、`web/embed/agent-frame.js`、`web/embed/agent.css`、`src/server/app.ts`（STATIC_FILES の2行だけ）と、`test/web/markdown-dom.test.ts`（新）、`test/web/agent-dom.test.ts`、`test/web/agent-css.test.ts`、配る口のテスト（今の STATIC_FILES のテストに足す）。`web/embed/markdown.js` は使うだけで、解き方の誤りを見つけたら直さずに報告する。質問・承認のカード、`open-control*.js`、`agent-marks*.js` は変えない。確かめ：T-04〜T-08。完了：`npm run lint`、`npm test`、`npm run build` が通り、T-04〜T-08 のテストがある。描画の確かめは、実装担当が自分で起動した orca-web（一時の port、一時の settings、偽の Orca の会話。実物の Orca には書き込まない）とヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の Browser.close で閉じる）で、R-05 の偽の会話を、幅 1280px と 390px、明暗の4通りで描き、文書の横のはみ出しがないこと、pre と表の枠だけが横に動くことを DOM で数え、写しと数えた値を `.workbench/implement/iss-00061/render/` に置く。終えたら止まって HEAD を報告する。区切りのレビュー：なし（最終品質ゲートで見る）"
		realizes: ["R-01", "R-02", "R-03", "R-04", "R-05", "F-01", "F-02", "F-03"]
		after:    ["S-01"]
		status:   "todo"
		session:  "ui"
	}
	"S-03": {
		title:    "README.md と AGENTS.md、描画の写しの整理、試しのエージェントでの実機の写し（D-06）"
		text:     "タスク担当が行う。README.md と AGENTS.md の追記。S-02 の写しを Scope の artifacts に移す。試しのエージェント（haiku など。業務中のエージェントは使わない）を立て、見出し・表・コード・箇条書き・リンクを含む返事を書かせ、試しの orca-web（`npm run trial`、別の port と専用の settings。sendEnabled は偽のまま）の小窓で、1280 と 390、明暗の写しを撮り、試しのエージェントを止める。確かめ：T-09。完了：README.md と AGENTS.md に Markdown の描き方があり、report.md の Verification に写しの場所と確かめがあり、`npm run lint`、`npm test`、`npm run build` が通る。試しの画面は本人が見られるように動かしたまま報告する"
		realizes: ["R-01", "R-05"]
		after:    ["S-02"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "parseMarkdown の各構文：ATX の見出し（1〜6、閉じの #、`## C#` は C# のまま、7個は段落）、段落と改行（1つの改行が break、行末の2つの空白と \\ も break）、太字・斜体・取り消し線・行内のコード（`` の数、`_foo_`・`__bold__` は強調で、snake_case_name は文字）、柵のコード（``` と ~~~、言語、閉じのない塊、字下げを落とす）、箇条書き（- * +、1. 1)、start、入れ子、チェック [ ] [x]、印の種類が変わると別の list）、引用（入れ子、引用の中の箇条書きとコード）、表（寄せ、\\|、セルの数を見出しに合わせる、区切りの数が違えば段落）、横線（--- *** ___ と空白入り）、リンク（[a](url)、題つき、<url>、素の URL の尾の記号と釣り合わない )、画像は image 真のリンク）、逃がし", verifies: ["R-01", "F-03"]}
	"T-02": {title: "safeHref と危ない入力：http・https だけが href になり、javascript:・JaVaScRiPt:・頭の空白・制御文字入り・data:・vbscript:・file:・相対・空、` onmouseover=` の差し込みはリンクにならず元の文字の text になる。生の HTML（<script>、<img onerror>、<a href>、<iframe>、閉じない <）は text のまま。コードの塊の言語の引用符も文字として lang に入るだけ", verifies: ["R-02", "F-02"]}
	"T-03": {title: "壊れた・大きい・深い入力：閉じない **・`・```・[・](、列の違う表、空、文字でない入力、\\ で終わる、9段以上の入れ子で例外を出さず、元の文字が欠けない（木の text を集めた文字に元の語が残る）。病的な入力 100,000 字（`*` の並び、`[` の並び、`` ` `` の並び、`>` の並び、`_a` の並び）を、それぞれ 1 秒より短く解く", verifies: ["R-03"]}
	"T-04": {title: "renderMarkdown：各塊と行内が決めた要素（h1〜h6.md-h、p、div.md-code > pre > code と md-code-lang・data-lang、ul・ol と start、li.md-task と disabled の input、blockquote、div.md-table > table と寄せのクラス、hr、br、strong・em・del・code）になり、リンクが渡した link の口（newTabLink）で target _blank・rel noopener noreferrer になる。知らない type の文字を落とさない", verifies: ["R-01", "F-03"]}
	"T-05": {title: "XSS の表（R-02 の acceptance の全部）を parseMarkdown と renderMarkdown（agent-dom の renderMarkdownBody）に通し、偽の document（innerHTML・outerHTML・insertAdjacentHTML・document.write と on・style の属性で失敗する）で、script・img・iframe・style の要素ができず、a の href が http・https だけで、元の文字が textContent に残る。描く側で safeHref を通らない href の link の木を与えても文字で描く", verifies: ["R-02", "F-02"]}
	"T-06": {title: "renderChatRow：assistant の bubble が div.bubble.md で Markdown を描き、user の bubble・notice・unsupported・ツールの行・質問と承認のカードは今のまま文字。parse か render が例外を出す偽の部品で、その行が今の div.bubble の文字になる", verifies: ["R-01", "R-03", "F-01"]}
	"T-07": {title: "createMarkdownCache：同じ key と本文の2回目で render を呼ばず同じ要素を返し、本文が変わると呼び直し、prune で消えた key を捨てる。agent-frame.js が rowOptions に markdown を渡し、renderChat で prune を呼ぶ（ファイルを読むテストか、今の agent-frame のテストの方式）", verifies: ["R-04"]}
	"T-08": {title: "agent.css の .md の規則が var(--chat-…) の色だけを使い、pre と .md-table に overflow-x: auto があり、.bubble.md が white-space: normal で、user-select: none がない（CSS を読むテスト）。STATIC_FILES が /embed/markdown.js と /embed/markdown-dom.js を JavaScript の型で配る（今の配る口のテストの方式）", verifies: ["R-05"]}
	"T-09": {title: "S-02 の描画の写し（1280px・390px、明暗、はみ出し 0、pre と表の枠だけ横に動く）と、試しのエージェントの実機の写しを report.md に挙げる（タスク担当）", verifies: ["R-05"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実物の Orca への書き込みは、試しのエージェントを立てて返事を書かせることだけ（業務中のエージェントには送らない）。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う。タスク担当はマージしない）
	- 区切りのレビュー CP-1：最後の手順 S-01、範囲 `0a55268..<S-01 の後の HEAD>`、レビュアー Claude `code-reviewer`（Opus 5.5 / medium）を1人（standards と spec を1人で）。理由：画面（S-02）が依る木の形と、危ない URL を落とす safeHref と、病的な入力での時間が S-01 で決まる
	- 最終品質ゲート：範囲 `0a55268..HEAD` の全体（`src/`、`web/`、`test/`、`README.md`、`AGENTS.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。観点は functional-correctness、requirements-closure、test-adequacy、security-baseline（HTML を解かない、決めた属性だけ、リンクの scheme、newTabLink）、performance（病的な入力、写しの使い回し）、e2e-user-flow（390px、明暗、横に動く枠）。second_opinion：chatgpt（統括の補足『2人目は ChatGPT Use の系列の skill を先に使う』。取れなければ記録して主のレビュアーで続ける）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する。合格の後に Git の記録だけのコミットは作らない）
	"""
rollback: "PR を戻せば、assistant の発言は今の文字のままの表示に戻る。会話の API と送信は変わらない。"
exit:     "CP-1 と最終品質ゲート（`0a55268..HEAD`、または取り込み後の HEAD）が合格し、描画の写しと実機の写しが report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-18）：Opus 5.5 / medium（方針の「タスク担当 × standard」）"}
		impl: {task: "実装（S-01。Markdown を木に解く純な関数。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコード（データの形）は Codex GPT-6.1 Sol / medium。S-01 は DOM に触らない純な関数で、入力と木の形だけでテストで確かめられる。方針の「実装担当（バックエンド）× standard」。Sol で失敗や見落としが記録されたときだけ GPT-6 Astra / high に上げる。Codex が chat-scratch の symlink の拒否で止まったら worker-stop して Claude Opus 5.5 / medium に切り替える（統括が了承済み）。provider: codex"}
		ui: {task: "画面の実装（S-02。描く部品、小窓への組み込み、見た目、描画の確かめ。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：画面と一体の部分は Claude Opus 5.5、standard なので medium（方針の「実装担当（フロントエンド）× standard」）。STATIC_FILES の2行は画面を配るための付随の変更。provider: claude"}
		doc: {task: "文書と確かめ（S-03。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。試しのエージェントを立てる実機の写しもタスク担当が行う（実装担当は誰も起動しない）"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。standard なので1人）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー CP-1（code-reviewer ×1：standards と spec）", after: "S-01", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目は ChatGPT）", after: "S-03", model: "opus", effort: "medium"}
	}
}
