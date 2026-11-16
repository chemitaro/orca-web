package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"親を id に解くのは要約の組み立て（`src/summary/build.ts`）の1か所、並びを決めるのは部品の `buildMarks` の1か所にする",
	"要約は今どおり状態の文書だけから作る純粋な関数のままにし、時刻の記憶は小さな別の部品に閉じる",
]
current: "要約は worktree ごとに id・path・branch・project・issue・counts・agents（id・mark・workingMode・agentType・since・detail・elapsedFrom・elapsedBasis）を返す。`buildMarks` は ORDER（状態の重さ）の順。印の要素に id はない。read-state は端末のタブの agentStatus から開始の時刻を拾わない。"
target:  "要約の worktree に `main`、エージェントに `parent`・`startedAt` が足され、`buildMarks` は指揮の関係と startedAt で並べ、印の要素は `data-agent-id` を持つ。"

design: {
	"D-01": {
		title: "Orca のセッションの開始の時刻の読み取りと、状態の文書の `sessionStartedAt`"
		text: """
			`src/orca/read-state.ts`：`OrcaAgentStatus` に `firstStateStartedAt: number | null` と `historyStartedAt: number | null` を足す。`pickAgentStatus` で `num(a.firstStateStartedAt)`、`num(rec(records(a.stateHistory)[0])?.startedAt)`（配列でない・空・数でないなら null）。読む RPC は変えない。
			`src/state/model.ts`：`AgentState` に `sessionStartedAt: Fact<string>` を足す（版は変えない。注記：Orca が観測したセッションの始まり。並びのため）。
			`src/state/normalize.ts`：端末のタブは `time([[as?.firstStateStartedAt, 'tabs', 'agentStatus.firstStateStartedAt'], [as?.historyStartedAt, 'tabs', 'agentStatus.stateHistory.startedAt']])`（両方なければ今の `time` の欠けの理由）。chat-tab と untabbed は `missingFact(null, null, 'no-source')`。
			`src/state/fields.ts`：`agent.sessionStartedAt`（『開始の時刻』『Orca が観測したセッションの始まり（端末のタブだけ）』、既定で選ばない）を足す。
			"""
		satisfies: ["R-03", "F-01"]
	}
	"D-02": {
		title: "初めて見た状態の始まりの時刻の記憶（src/summary/started.ts）"
		text: """
			新しいモジュール `src/summary/started.ts` の `FirstSeenStartTimes`（クラス。時計に触れない）：
			- `observe(state: StateDocument): ReadonlyMap<string, string>`：状態の文書の各エージェントについて、まだ覚えていない id で `stateStartedAt.value` が null でなければ、その値を覚える。覚えている id のうち、今の文書にないものを忘れる。覚えている表（id → ISO 8601）を返す。
			`src/server/app.ts` の要約の道は、アプリごとに1つの `FirstSeenStartTimes` を持ち、`buildWorktreeSummary(snapshot, { firstSeen: times.observe(snapshot) })` で組む。
			"""
		satisfies: ["R-03"]
	}
	"D-03": {
		title: "要約の組み立て（src/summary/build.ts、model.ts）"
		text: """
			`WorktreeSummary` に `main: boolean | null`、各エージェントに `parent: {id: string | null; worktreeId: string | null} | null` と `startedAt: string | null` を足す。
			`buildWorktreeSummary(state, options?: { firstSeen?: ReadonlyMap<string, string> })`（options がなければ記憶なし。純粋な関数のまま）：
			- `main`：その worktree の `isMainWorktree.value`（なければ null）。
			- `parent`：状態の文書の全エージェントから paneKey → エージェントの並びの表を作る（paneKey が null のものは入れない）。子の `parentPaneKey.value` が null なら null。表の値がちょうど1つで、自分でなければ `{id, worktreeId}`。ほかは `{id: null, worktreeId: null}`。
			- `startedAt`：`sessionStartedAt.value ?? firstSeen.get(id) ?? null`。
			キーの順は、今の項目の後ろに `parent`・`startedAt`（エージェント）、`main`（worktree の `issue` の後）。agents の並び（id の順）と worktrees の並びは変えない。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01"]
	}
	"D-04": {
		title: "部品の並び（web/embed/agent-marks-view.js の buildMarks）"
		text: """
			`buildMarks` の中で、`ORDER` による並べ替えを、新しい純粋な関数 `orderAgents(agents)`（書き出す。agents の写しを並べ直した配列を返す）に置き換える。
			- 各エージェントの `id`（`str`）、`startedAt` の時刻（`Date.parse` が有限なら数、ほかは null）、要約の順（index）を取る。
			- 比べ方 `newer`：時刻が両方あれば大きい方が先、片方だけなら時刻のある方が先、ほかは index の小さい方が先。
			- 同じ worktree の id の表を作り、`parent?.id` が文字列で表にあり自分でないものを『この worktree の親』とする。子の表（親 id → 子の並び）を作る。親か子のあるものが関係あり。
			- 結果 ＝ 関係なしを newer で並べたもの ＋ 根（関係ありで、この worktree の親がないもの）を newer で並べ、それぞれを深さ優先（子を newer で並べる。見たものは飛ばす）でたどったもの ＋ まだ出ていない関係あり（輪）を newer で並べたもの。
			- id が null・重複のエージェントは、表に入れず（重複は最初のものだけ表に入れる）関係なしとして扱う。
			`ORDER` の定数は消す。`markView` と overflow の規則は変えない。
			"""
		satisfies: ["R-04", "F-02"]
	}
	"D-05": {
		title: "印の要素の data-agent-id（web/embed/agent-marks.js）"
		text:  "`markElement` で `view.id` が null でなければ `node.dataset.agentId = view.id`。『+N』の要素は今のまま。"
		satisfies: ["R-05"]
	}
	"D-06": {
		title: "文書"
		text:  "README.md の「稼働の印（worktree ごとの要約）」の例と箇条に `main`・`parent`・`startedAt`（R-01〜R-03 の意味と null）を、「稼働の印の部品」に並びの規則（R-04）と `data-agent-id`（R-05）を書き、『印は要対応・作業中・…の順に並ぶ』を改める。AGENTS.md の `src/summary/`（parent・main・startedAt と started.ts）、`src/state/`（sessionStartedAt）、`web/embed/agent-marks*`（並びと data-agent-id）の説明を合わせる。"
		satisfies: ["R-06"]
	}
	"D-07": {
		title: "実物の確かめ"
		text:  "`.workbench/iss-00043/` の読むだけのスクリプトで、常駐の orca-web と一時の orca-web（`PORT` を空いた番号、`ORCA_WEB_TAILSCALE_IP` なし、`ORCA_WEB_SETTINGS_FILE` と `ORCA_WEB_SENDS_DIR` は `.workbench/iss-00043/` の下、送信は無効のまま）の `GET /api/worktrees/summary` を続けて読み、数と組と並びを出す。`data-agent-id` は、一時の orca-web の要約を `renderAgentMarks` で最小の偽の DOM に描いて確かめる（テストと同じ偽の DOM）。一時の orca-web は読んだ後に止める。"
		satisfies: ["R-07"]
	}
}

compatibility: "版は変えず項目を足すだけなので、今の SpecDock（項目を読まない）は壊れない。並びは状態の重さの順から変わる（SpecDock と `/embed/agent` の見出しの印の順が変わる。Epic で本人が決めた）。状態の文書に `agents[].sessionStartedAt` が増える。"

risks: [
	"Orca が `firstStateStartedAt`・`stateHistory` の形を変えると、orca-web の記憶に戻る（並びが立て直しの時刻に頼る）。",
	"orca-web の記憶は要約の道を読んだ時だけ進むので、要約を読む人がいない間に始まったエージェントは、次に読んだ時の状態の始まりの時刻になる（並びの新旧が少しずれうる）。",
	"構造化 Chat には Orca の開始の時刻がなく、記憶に頼る。orca-web を立て直すと、その時の状態の始まりの時刻で覚え直すので、並びが変わりうる。",
]
