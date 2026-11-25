package spec

goals: [
	"判定は状態の文書と時刻だけを受ける純粋な関数の1か所に置き、後の Issue（結び、通知、`/`）が同じ関数を広げる",
	"画面は受け箱の作り（view は純粋な関数、dom は textContent だけ、入口は薄い）に揃える",
]

current: "受け箱（`src/inbox/classify.ts` の `buildInbox`）はエージェントを1件ずつ並べ、done を役割を問わず finished に畳む。親子は要約（`src/summary/build.ts` の parent）と Run の木が別々に決める。"

target: "`src/apex/build.ts` の `buildApexList` が頂点の一覧の文書を作り、`GET /api/apexes` が配り、`/apexes` が描く。"

compatibility: "既存の道・文書・画面は変えない。受け箱・Run の一覧・状態の表の見出しに `/apexes` へのリンクを足すだけ。"

design: {
	"D-01": {
		title: "文書の型 `src/apex/model.ts`"
		text: """
			```ts
			export const APEXES_SCHEMA = 'orca-web.apexes/v1';
			type ApexStatus = 'needs_action' | 'working' | 'done';
			type ApexGroup = 'needs_action' | 'working' | 'done_recent' | 'done_older' | 'sleeping';
			type ApexReason = 'apex_blocked' | 'apex_waiting' | 'member_blocked' | 'member_waiting'
			  | 'working' | 'monitoring' | 'members_working' | 'member_grace' | 'done' | 'sleeping';
			interface ApexMember { id; parentId; depth /* 1 から */; mark: AgentMark; agentType; title; worktreeId; stateStartedAt }
			interface ApexItem {
			  id; kind; agentType; title; worktreeId; worktreeName; project: {id,name}|null; issue;
			  mark: AgentMark; status: ApexStatus; group: ApexGroup; reasons: ApexReason[];
			  tags: ('unverified')[]; lastActivityAt: string|null; stateStartedAt: string|null;
			  members: ApexMember[]; counts: { total; working; waiting; done };
			}
			interface UnlinkedItem { id; kind; agentType; title; worktreeId; project; issue; mark; reason: 'parent_missing' | 'worker_without_parent' | 'cycle' }
			interface ApexListDocument { schema; generatedAt; stale: boolean; connection; project: string|null;
			  counts: Record<ApexStatus, number>; items: ApexItem[]; unlinked: UnlinkedItem[] }
			```
			題名は agent の `title`、なければ worktree の `displayName`。Issue は `findIssue`（受け箱と同じ）。
			"""
		satisfies: ["R-01", "R-05", "F-02"]
	}
	"D-02": {
		title: "分け方（頂点・メンバー・結べないもの）"
		text: """
			`paneKey` → エージェントの表を作る（同じ paneKey が2つ以上あれば、その paneKey は親として使わない）。各エージェントの親は「`parentPaneKey` に一致する、自分でないエージェントがちょうど1つ」のときだけ。親をたどって根を求め、たどる途中で同じエージェントに戻れば輪として打ち切る。
			- 根が「`parentPaneKey` なし・`worker` なし」なら、その根が頂点で、途中のすべてがメンバー（depth は根からの段数）。
			- 根がそれ以外なら、根と途中のすべてが結べないもの。理由は根の理由を途中の節も引き継ぐ（`parentPaneKey` があり親がない → parent_missing、`worker` があり親がない → worker_without_parent）。輪の中の節と、輪にぶら下がる節は、どれも cycle。
			"""
		satisfies: ["R-01"]
	}
	"D-03": {
		title: "状態の判定 `apexStatus`"
		text: """
			R-02 の順のとおり。`agentMark`・`agentWorkingMode` を `src/inbox/classify.ts` から使う。猶予 `MEMBER_GRACE_MS = 20_000` は `now - Date.parse(stateStartedAt)` で測り、日時が読めなければ猶予なし。猶予の中のメンバーがいれば、ほかに当たらなくても作業中（理由 `member_grace`）。
			"""
		satisfies: ["R-02", "R-03"]
	}
	"D-04": {
		title: "段と並び"
		text: """
			最後の活動 = 頂点とメンバーの `stateStartedAt` の最大。どれもなければ頂点の worktree の `lastActivityAt`。どれもなければ null（null は段の末尾、眠っているにしない）。
			眠っている：R-04 のとおり（動き・待ち・猶予のない頂点のうち、復元待ち、done で 7 日より前、unverified だけで 24 時間より前）。
			以前の完了：status done で、最後の活動が `now - 24時間` より前。
			段の中は最後の活動の新しい順、同じなら id の順。
			"""
		satisfies: ["R-04"]
	}
	"D-05": {
		title: "API `GET /api/apexes`"
		text: """
			`src/server/app.ts` の、同じオリジンだけの道の組（`/api/inbox`・`/api/runs` と同じ判定）に足す。状態の文書は `/api/runs` と同じ `options.runs.snapshot()` から取り、`noteViewer()` を呼ぶ。`?project=` は 512 字まで。頂点と結べないものを、その worktree の repo の id で絞り、counts は絞った後の items で数える。`options.runs` がなければ 503 `apexes_unavailable`。
			`stale` は、状態の文書の `stale` が真か、`connection.state` が `connected` でないとき真。
			"""
		satisfies: ["R-06", "R-03", "F-01"]
	}
	"D-06": {
		title: "画面 `/apexes`"
		text: """
			- `web/apexes.html`（CSP は index の画面と同じ `page: 'index'`）、入口 `web/apexes.js`、純粋な関数 `web/apexes-view.js`（文書 → 描く物：段ごとの行、見出しの数、題名、帯）、DOM `web/apexes-dom.js`（textContent と createElement・createElementNS だけ）。`STATIC_FILES` に4つと `/apexes` を足す。
			- 行：種類のアイコン（`agent-marks-icons.js` の `AGENT_ICONS`）、状態の印（`agent-marks.js` の `stateIcon`）、題名、プロジェクト・Issue、理由の札（日本語の言葉の表は `apexes-view.js` の1か所）、配下の数「動いている/全体」（配下がなければ出さない）、経過（`elapsed.js`、起点は最後の活動）。
			- 行のリンクは `/embed/agent?id=<id>` を `_blank`・`noopener noreferrer`。
			- 段：対応が必要・作業中・完了は開いて、以前の完了・眠っている・結べない仕事は `<details>` で畳む。
			- 見出し：「対応が必要 n・作業中 n・完了 n」、鮮度の帯（stale のとき）、ほかの画面へのリンク（受け箱、Run の一覧、状態）。受け箱・Run の一覧・状態の表の見出しにも `/apexes` へのリンク「指揮」を足す。
			- 題名：R-07。ポーリングは `poll-loop.js` の `createPollLoop`（10 秒）。`visibilitychange` で隠れたら予約を取り消し、見えたら `restart()`。
			"""
		satisfies: ["R-05", "R-07"]
	}
	"D-07": {
		title: "文書の更新"
		text:  "README の画面の節に `/apexes` と `GET /api/apexes` を、AGENTS.md の地図に `src/apex/` と `web/apexes*` を足す。"
		satisfies: ["R-06"]
	}
}

risks: [
	"頂点は今の実データで 74 あり、多くは単独の古いエージェント。畳む段（R-04）が前提",
	"メンバーの親は生きた辺だけなので、子のタブが閉じたチームは配下 0 に見える（iss-00078 で結ぶ）",
]
