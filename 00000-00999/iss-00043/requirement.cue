package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

// 保証レベル（light、standard、strict、critical）と、その理由。
assurance: {
	level:  "standard"
	reason: "読み取りの要約に項目を足すだけで版を変えず、送信や Orca への書き込みはなく、PR を戻せば元に戻る"
}

purpose: "SpecDock が構造の図に指揮の線（親のエージェントの印から子の印へ）を引けるように、orca-web の要約（`GET /api/worktrees/summary`）の各エージェントに指揮の親 `parent` と開始の時刻 `startedAt`、各 worktree に `main` を足し、稼働の印の部品の並びを指揮の関係の順に改め、印の要素に `data-agent-id` を入れる（SpecDock の Epic epic-00615 の前提。Epic の R-14・D-01・F-01）。"

background: """
	正本：SpecDock の Epic epic-00615 の requirement.cue（R-14、F-01、decisions）・design.cue（D-01）・plan.cue（prerequisites の gh:chemitaro/orca-web#43）、調べの報告書 `epic-00615/.workbench/research-report.md` §1〜§3、改訂の依頼書 `planner-epic-00615-r2.md`（本人の決定）。読むだけ。
	事実（タスク担当が 2026-11-17 に確かめた。読むだけ）：
	- 状態の文書の各エージェントは `paneKey` と `parentPaneKey`（Fact）を、各 worktree は `isMainWorktree`（Fact）を持つ（`src/state/model.ts`）。要約（`src/summary/build.ts`）にはどちらもない。報告書 §1.3 の実データの5組は、すべて子の `parentPaneKey` が別の行の `paneKey` に完全に一致した。
	- Orca 1.4.259 の `worktree ps` の agents の行に開始の時刻はない（`stateStartedAt`・`updatedAt` だけ）。`session.tabs.listAll` の端末のタブの `agentStatus` は `firstStateStartedAt`（あるタブとないタブがある）と `stateHistory[].startedAt` を持つ。Orca のソース（stablyai/orca、`src/shared/agent-session/lifecycle/resume/agent-session-start-time.ts` の `agentEntrySessionStartedAt`）は、セッションの開始を `firstStateStartedAt` → `stateHistory[0].startedAt` → `stateStartedAt` の順で決め、型の注記は `firstStateStartedAt` を「行の並びのための、観測したセッションの始まり」とする。構造化 Chat のタブ（`chatStatus`）には開始の時刻がない。
	- 稼働の印の部品の `buildMarks`（`web/embed/agent-marks-view.js`）は状態の重さ（`ORDER`）の順、同じなら要約の順で並べる。`renderAgentMarks` の印の要素（`markElement`）に `data-agent-id` はない。
	- orca-web の中で `renderAgentMarks`（つまり `buildMarks` の並び）を使うのは `/embed/agent` の見出し（`web/embed/agent-dom.js`）だけ。受け箱と Run の木は状態の印（`stateIcon`）だけを使い、印の並びを持たない。
	"""

includes: [
	"要約の各 worktree の `main`、各エージェントの `parent`・`startedAt`（`src/summary/`）",
	"開始の時刻の取得元：端末のタブの `agentStatus.firstStateStartedAt`・`agentStatus.stateHistory[0].startedAt` の読み取り（`src/orca/read-state.ts`）と、状態の文書の新しい項目 `agents[].sessionStartedAt`（`src/state/`）",
	"orca-web が最初に見た状態の始まりの時刻を覚える小さな記憶（`src/summary/`）と、要約の道（`src/server/app.ts`）での使い方",
	"`buildMarks` の並びの規則（`web/embed/agent-marks-view.js`）と、印の要素の `data-agent-id`（`web/embed/agent-marks.js`）",
	"テスト、README.md の「SpecDock のダッシュボードに置く」の契約、AGENTS.md",
]

excludes: [
	"要約・状態の文書の版の変更、既存の項目の意味と形の変更",
	"Run の木（`src/runs/`）の結び付け（iss-00044 でマージ済み）。受け箱と Run の木の行の並び",
	"SpecDock の側の線・帯・押した印の対応（epic-00615 の SpecDock の Issue）",
	"送信・Orca で開く・Orca への書き込み・統括の連絡を既読にする読み方。Orca への新しい命令や RPC",
	"印の見た目（色、形、大きさ、上限と『+N』の規則）",
]

requirements: {
	"R-01": {
		title: "要約の各エージェントに、指揮の親 `parent` を出す"
		text: """
			各エージェントの `parent` を次のとおりにする（Epic の D-01）。
			- そのエージェントの状態の文書の `parentPaneKey` の値が null：`parent: null`（親がない）。
			- 値があり、その値と `paneKey` が完全に一致する別のエージェントが状態の文書にちょうど1つある：`parent: {id: <そのエージェントの id>, worktreeId: <その worktreeId>}`。id は状態の文書と要約の id（構造化 Chat の合併の後の `chat:…` の id）。
			- 値があるのに、一致するエージェントがない、2つ以上ある、または自分自身だけ：`parent: {id: null, worktreeId: null}`（親がいるはずだが見えない。推測で結ばない）。
			親の `worktreeId` は、同じ要約の `worktrees[].id` のどれか（親もエージェントなので、要約に必ずその worktree がある）。
			"""
		acceptance: [
			"子の parentPaneKey が統括の chat-tab の paneKey と一致するとき、子の `parent` が `{id: 'chat:…', worktreeId: <統括の worktree>}` で、その worktreeId が要約の worktrees にある",
			"parentPaneKey が null のエージェントの `parent` が null",
			"parentPaneKey が、どのエージェントの paneKey とも一致しない、2つのエージェントの paneKey と一致する、自分の paneKey と一致する、のどれでも `parent` が `{id: null, worktreeId: null}`",
			"別の worktree にいる親も解ける（親の worktreeId が子の worktree と違う）",
		]
	}
	"R-02": {
		title: "要約の各 worktree に `main` を出す"
		text:  "各 worktree の `main` を、状態の文書の worktree の `isMainWorktree` の値（true・false）にする。worktree が状態の文書にない、または値がないときは null。"
		acceptance: [
			"isMainWorktree が true・false の worktree で `main` が同じ値、値がない（Fact の value が null）か worktree が見つからないときは null",
		]
	}
	"R-03": {
		title: "要約の各エージェントに、状態が変わっても動かない開始の時刻 `startedAt` を出す"
		text: """
			`startedAt`（ISO 8601 か null）を次の順に決める。
			1. Orca のセッションの開始の時刻（状態の文書の新しい項目 `sessionStartedAt`）があればそれ。端末のタブの `agentStatus.firstStateStartedAt`、なければ `agentStatus.stateHistory` の先頭の `startedAt`（Orca の `agentEntrySessionStartedAt` と同じ順）。構造化 Chat のタブと、タブのない行は取得元がない。
			2. なければ、orca-web がそのエージェントの id を要約の道で初めて見たときの `stateStartedAt`（覚えて、状態が変わっても動かさない）。初めて見たときに `stateStartedAt` がなければ覚えず、値が出た最初の時に覚える。
			3. どちらもなければ null。
			覚えた値は、そのエージェントの id が状態の文書から消えた時に忘れる（記憶が増え続けない）。orca-web を立て直すと、その時の値から覚え直す。
			状態の文書には `sessionStartedAt`（Fact。取得元 `tabs`、項目 `agentStatus.firstStateStartedAt` か `agentStatus.stateHistory.startedAt`）だけを足す。覚えた値は状態の文書に出さない。
			"""
		acceptance: [
			"firstStateStartedAt のある端末のタブのエージェントの `startedAt` がその時刻で、状態が変わって stateStartedAt が変わっても同じ",
			"firstStateStartedAt がなく stateHistory の先頭に startedAt のある端末のタブで、その時刻",
			"構造化 Chat のエージェントの `startedAt` が、初めて見た時の stateStartedAt で、次の要約で stateStartedAt が新しい値になっても変わらない",
			"エージェントが状態の文書から消え、また現れると、現れた時の stateStartedAt を覚え直す",
			"初めて見た時の stateStartedAt が null なら `startedAt` は null、次に値が出ればその値で固定",
			"状態の文書の各エージェントに `sessionStartedAt` の Fact があり、端末のタブ以外は値が null（missing は no-source）",
		]
	}
	"R-04": {
		title: "稼働の印の並びを、関係のないものを先に新しい順、関係のあるものを後ろに上流から下流の順にする"
		text: """
			`buildMarks(worktree, {now, max})` の並びを、状態の重さの順（`ORDER`）から次に改める（Epic の R-14・D-01）。同じ worktree の `agents` について：
			1. 関係あり ＝ `parent.id` がその worktree の別のエージェントを指すもの、または、その worktree の別のエージェントの `parent.id` に指されるもの。ほかは関係なし（親が別の worktree にいる子、親が見えない子も、関係なし）。
			2. 関係なしを `startedAt` の新しい順（null と読めない値は最後）、同じなら要約の順に並べる。
			3. 関係ありを、その worktree の中に親のいないもの（根）から深さ優先でたどる（親 → 子 → 孫）。根どうしと兄弟は 2 と同じ比べ方。輪（親子の輪）で根から届かないものは、関係なしの比べ方で後ろに足し、それぞれ1回だけ出す。
			4. 関係なし → 関係ありの順に並べ、上限を越えれば、今どおり先頭から上限 − 1 人と『+N』。
			`parent` や `startedAt` がない（古い orca-web の要約）なら、全員が関係なしで、要約の順のまま並ぶ。この並びは、この部品を使うすべての画面（SpecDock の構造の図・ボード・横の欄、orca-web の `/embed/agent` の見出し）で同じになる。
			"""
		acceptance: [
			"`buildMarks` の単体テストで、関係のない2人が新しい順、親 → 子 → 孫の3人がこの順、兄弟2人が新しいものから、親が別の worktree にいる子が関係なしの側、の並び",
			"関係なしと関係ありが混ざると、関係なしが左に、関係ありが右にまとまる。状態（blocked、sleeping など）は並びを変えない",
			"輪（A の親が B、B の親が A）と自分を指す親で、止まらず、各エージェントが1回だけ出る",
			"parent・startedAt のない要約で、並びが要約の順",
			"上限を越えたとき、新しい並びの先頭から上限 − 1 人と、残りの数の overflow",
		]
	}
	"R-05": {
		title: "印の要素にエージェントの id を `data-agent-id` で出す"
		text:  "`renderAgentMarks` が描く各エージェントの印の要素（`.orca-mark`、span でもボタンでも）に、その id を `data-agent-id` で付ける。id が null の印には付けない。『+N』の要素には付けない。"
		acceptance: [
			"描いた印の要素の `data-agent-id` が、`buildMarks` の並びの順で各エージェントの id と同じ",
			"id のないエージェントの印と『+N』に `data-agent-id` がない",
		]
	}
	"R-06": {
		title: "README の SpecDock への契約と、AGENTS.md を新しい形に合わせる"
		text:  "README.md の「SpecDock のダッシュボードに置く」の要約と部品の節に、`main`・`parent`・`startedAt` の意味と null の場合、印の並びの規則、`data-agent-id` を書く。AGENTS.md の `src/summary/`・`web/embed/agent-marks*` の説明を合わせる。"
		acceptance: [
			"README.md の要約の節に `main`・`parent`・`startedAt` が、部品の節に並びの規則と `data-agent-id` があり、『要対応・作業中・…の順に並ぶ』の記述がない",
		]
	}
	"R-07": {
		title: "実物で、親・並び・`data-agent-id` を確かめて残す"
		text:  "常駐の orca-web（直す前）と、この worktree の一時の orca-web（直した後。127.0.0.1 だけ、送信は無効）の要約を読むだけで続けて読み、Run `run_b7c4f4c08bbc` の統括と作業者の `parent` が解けること、`main`、並び、`data-agent-id` を、数と写し（識別子は略す）で report.md に残す。"
		acceptance: [
			"report.md に、要約のエージェントの数、parent が null・解けた・見えないの数、main の数、親の worktree が要約にある数の表がある",
			"report.md に、報告書 §1.3 の組（今いるもの）が解けたかの写しと、同じ worktree の親子の並びの写しと、`data-agent-id` を描いた結果の写しがある",
		]
	}
}

failures: {
	"F-01": {
		title: "親や時刻を決められないときも、要約を返し、ほかの項目は今のまま"
		text:  "worktree ps や tabs の取得元が失敗した、parentPaneKey がない、`firstStateStartedAt` が数でない、`stateHistory` が配列でない・空、のどれでも、例外を出さず、その項目を null（parent は R-01 の規則）にし、ほかの項目・数・並びの元（要約の agents の順）は今と同じ。"
	}
	"F-02": {
		title: "形の違う要約でも、部品は止まらない"
		text:  "`parent` が object でない、`parent.id` が文字列でない、`startedAt` が文字列でないか日時として読めない、のときは、その項目がないものとして並べる（例外を出さない）。"
	}
}

constraints: [
	"要約の版 `orca-web.worktree-summary/v1`・状態の文書の版 `orca-web.state/v1` は変えない（項目を足すだけ）。",
	"Orca への命令と RPC を増やさない（今の `worktree ps` と `session.tabs.listAll` の応答から拾うだけ）。",
	"要約に、paneKey、parentPaneKey、会話や題名を出さない（今どおり小さく保つ）。",
	"実行時の依存を足さない。erasable な TypeScript と、ビルドしない ES Modules。",
	"Run の木の探し方（`src/runs/links.ts`）を変えない、重ねない（親の解き方は要約の中の1か所。iss-00044 とは対象が違う：木は task と worker、要約は ps の parentPaneKey）。",
	"公開リポジトリに、実際の IP、ユーザー名、パス、セッションの識別子を書かない。",
]

decisions: [
	"開始の時刻の Orca の取得元は、端末のタブの `agentStatus.firstStateStartedAt`、なければ `stateHistory[0].startedAt`（タスク担当、2026-11-17。Orca の `agentEntrySessionStartedAt` と同じ。Epic の D-01『どの Orca の項目が開始の時刻に当たるかは iss-00043 の設計で、Orca の実物で確かめて決める』に従う）。Orca の最後の後ろ盾 `stateStartedAt` は、状態が変わると動くので使わず、orca-web の記憶にする（Epic の決定）。",
	"Orca の開始の時刻を、状態の文書の新しい Fact `sessionStartedAt` で出す（タスク担当、2026-11-17。要約は状態の文書だけから作る今の形を保つため。版は変えない）。",
	"orca-web の記憶は、要約の道（`GET /api/worktrees/summary`）で状態の文書を見るたびに更新し、状態の文書から消えた id を忘れる（タスク担当、2026-11-17）。",
	"関係なしの同じ時刻と、時刻のない古い要約の並びは、要約の順にする（タスク担当、2026-11-17。要約は id の順に並ぶので Epic の D-01『同じなら id の順』と同じ結果になり、id の重複や欠けでも並びが決まる）。",
	"受け箱と Run の木は印の部品の並びを使っていないので、この Issue で並びを変えない（タスク担当、2026-11-17。依頼書の『受け箱・Run の木で同じ順』は、部品を使う画面の意味と読む）。",
]
