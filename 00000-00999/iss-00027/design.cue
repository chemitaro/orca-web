package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"経過の時間の起点は、要約の純粋な組み立て（`buildWorktreeSummary`）で決め、SpecDock の側に規則を持たせない",
	"描き方は、純粋な組み立て（テストする）と DOM（textContent と createElementNS だけ）に分ける",
	"種類のアイコンの表は1つのファイルの1つの表にし、そこだけで差し替えられる",
	"読み取りの CORS は状態の API と同じ `readAccess` を使い、許すオリジンを増やさない",
]
current: "要約はエージェントごとに mark、agentType、since を返す。スリープと不明は since がなく、経過を出せない。印を描くのは試しの画面の中のコード（`web/trial/trial.js`）だけで、文字の丸（種類の名前、状態の名前、経過）。SpecDock が使える部品はない。"
target:  "要約に `elapsedFrom`・`elapsedBasis` が足される。`/embed/agent-marks*.js` と `/embed/agent-marks.css` を SpecDock が import して、アイコンと色と経過の時間の小さな印を、要約を1回読んで多くの箱と行に描ける。試しの画面はその部品で描く。"

design: {
	"D-01": {
		title: "要約の経過の起点 `src/summary/model.ts`、`src/summary/build.ts`"
		text: """
			エージェントの項目に2つを足す（既存の項目と並びは変えない）：

			```ts
			agents: {
			  id: string; mark: AgentMark; agentType: string | null; since: string | null; detail: string;
			  elapsedFrom: string | null;                          // ISO 8601
			  elapsedBasis: 'state' | 'worktree-activity' | null;
			}[]
			```

			規則（`buildWorktreeSummary` の中、純粋）：
			1. `agent.stateStartedAt.value` が null でなければ、`elapsedFrom` = その値、`elapsedBasis` = `state`。
			2. そうでなく、mark が `sleeping` か `unknown` で、その worktree が状態の文書の worktrees にあり、`lastActivityAt.value` が null でなければ、`elapsedFrom` = その値、`elapsedBasis` = `worktree-activity`。
			3. ほかは両方 null。
			状態の文書の時刻はすでに ISO 8601 に正規化されている（`normalize.ts` の `time`）ので、そのまま写す。
			"""
		satisfies: ["R-01"]
	}
	"D-02": {
		title: "種類のアイコンの表 `web/embed/agent-marks-icons.js`"
		text: """
			種類のアイコンをこのファイルの1つの表 `AGENT_ICONS` にだけ置く。実物のロゴに差し替えるときは、この表の値だけを変える。

			```js
			// 鍵 → { label: 読み上げの名前, viewBox: '0 0 16 16', paths: [{ d, fill?: 'currentColor'|'none', stroke?: 'currentColor', strokeWidth? }] }
			export const AGENT_ICONS = { claude: {...}, codex: {...}, other: {...}, none: {...} };
			/** 種類の値 → 表の鍵。claude・claude-agent-teams → claude、codex → codex、null・'' → none、ほか → other。 */
			export function iconKey(agentType) {...}
			```

			図形：claude と codex は各社の実物のロゴ。Orca（stablyai/orca、MIT、コミット `80a514cfb6ac169ef311e70ea2b8a07b961416d8`）の `src/renderer/src/components/status-bar/icons.tsx` の `ClaudeIcon`（viewBox `0 0 24 24`、path 1本、fill `#D97757`、fillRule nonzero）と `OpenAIIcon`（viewBox `0 0 24 24`、path 1本、fill `currentColor`、fillRule evenodd）から、viewBox、path の `d`、fill、fillRule の値だけを写す（タスク担当がそのコミットのファイルを `.workbench/orca-icons.tsx` に置いた。実装担当はそこか、`gh api` で同じコミットから読む）。表のすぐ上に、出どころ（Orca の MIT のファイルのパスとコミットから写したこと）と、ロゴは Anthropic・OpenAI の商標であることを1行のコメントで書き、README にも1行書く。other は中立の丸の縁に点、none は破線の丸（どちらも自前、16×16 か 24×24 の viewBox、`currentColor`）。label は claude → `Claude`、codex → `Codex`、other → 種類の値をそのまま（長さは 40 字まで）、none → `エージェント`。表の値は SVG の文字列でなく、viewBox と path の `d`・fill・fillRule・stroke などの決めた項目だけ（DOM は createElementNS で作り、innerHTML を使わない）。アイコンは印の中で白い小さな丸の台（`--orca-mark-icon-bg`）に載せ、状態の色の上でもロゴの色（Claude の橙、OpenAI の currentColor は濃い色 `--orca-mark-icon-fg`）が読めるようにする。
			"""
		satisfies: ["R-02", "F-02"]
	}
	"D-03": {
		title: "印の組み立て（純粋な関数）`web/embed/agent-marks-view.js`"
		text: """
			DOM、時計、fetch に触らない。

			```js
			export const MARKS = ['working','blocked','waiting','done','sleeping','unknown'];
			export const MARK_LABELS = { working:'作業中', blocked:'許可待ち', waiting:'入力待ち', done:'完了', sleeping:'スリープ', unknown:'不明' };
			export function formatElapsed(from, now) // → '今' | 'N分' | 'N時間' | 'N日' | null
			export function findWorktree(summary, { path, id }) // → worktree | null
			export function buildMarks(worktree, { now, max = 4 }) // → { marks: MarkView[], overflow: { count, label } | null }
			// MarkView = { id, mark, icon: <AGENT_ICONS の鍵>, typeLabel, elapsed: string | null, label: string, detail: string | null }
			```

			- `formatElapsed`：from が文字列でない、解けない、now が数でないときは null。差が負（未来）なら null。60 秒未満は「今」、60 分未満は「N分」、24 時間未満は「N時間」、ほかは「N日」（切り捨て）。
			- `findWorktree`：summary の schema が `orca-web.worktree-summary/v1` で worktrees が配列のときだけ探す。path は両方の末尾の `/` を除いて比べる。path を先に、なければ id で探す。見つからなければ null。
			- `buildMarks`：worktree の agents（配列でなければ空）を MarkView にし、いつも（max 以下でも）要対応（blocked、waiting）、working、unknown、done、sleeping の順に安定に並べ替える（同じ印の中は要約の並びのまま）。mark が MARKS にない値は unknown。detail は `/embed/agent?id=` で始まる文字列だけ（ほかは null）。label は「<種類の label>、<状態の名前>、<経過の文>」（経過の文は basis が state なら「この状態になって N分」、worktree-activity なら「最後の活動から N分」、経過がなければ省く）。`max` を超えたら、先頭の max−1 個を印にし、残りの数を overflow（label「ほか N 件」、表示「+N」）にする。切るのは並べ替えた後。
			"""
		satisfies: ["R-02", "R-03", "F-01", "F-02"]
	}
	"D-04": {
		title: "印の描画と要約の読みの輪（DOM）`web/embed/agent-marks.js`、`web/embed/agent-marks.css`"
		text: """
			SpecDock が import する入口。D-02、D-03 を再び export する。

			```js
			export function renderAgentMarks(container, worktree, { now = Date.now(), size = 'sm', max = 4, onSelect } = {})
			export function watchWorktreeSummary(base, { onDocument, onError, intervalMs = 10_000, fetchImpl = fetch, doc = document, setTimer = setTimeout, clearTimer = clearTimeout }) // → { stop() }
			```

			- `renderAgentMarks`：container の中を `<span class="orca-marks orca-marks--sm">` で作り直す。印ごとに、onSelect があれば `<button type="button">`、なければ `<span role="img">`。class は `orca-mark orca-mark--<mark>`、`aria-label` と `title` は MarkView の label。中身は SVG のアイコン（`aria-hidden`）と、経過があれば `<span class="orca-mark-time">`。スリープは月の小さな SVG を重ねる。overflow は `orca-mark orca-mark--more` に「+N」。ボタンを押すと `onSelect({ id, detail })`。文字は textContent、SVG は createElementNS だけ。
			- `watchWorktreeSummary`：`${base}/api/worktrees/summary` を `cache: 'no-store'` で読み、成功なら onDocument(JSON)、HTTP の誤りや例外なら onError(err)。すぐに1回読み、終わってから次を予約する（重ならない）。`doc.hidden` の間は読まずに予約だけを続け、`visibilitychange` で見えたらすぐ読む。stop の後は読まず、予約を消し、見え方の受け手を外す。
			- CSS：色は `:root` でなく `.orca-marks` に置くカスタムプロパティ `--orca-mark-working`（緑）、`--orca-mark-blocked`（赤）、`--orca-mark-waiting`（琥珀）、`--orca-mark-done`（青）、`--orca-mark-sleeping`（灰）、`--orca-mark-unknown`（灰）と、前景の `--orca-mark-fg`、アイコンの台 `--orca-mark-icon-bg`（白）と `--orca-mark-icon-fg`（濃い色。OpenAI のロゴの currentColor）。`prefers-color-scheme: dark` で暗い背景向けの値にする。小 16px・中 20px の高さ、角丸、間隔 2px、折り返しあり。unknown は破線の縁。ボタンは focus-visible の縁を持つ。
			"""
		satisfies: ["R-02", "R-03", "F-01"]
	}
	"D-05": {
		title: "部品のファイルの配りと読み取りの CORS `src/server/app.ts`"
		text: """
			配るファイルの表に `/embed/agent-marks.js`、`/embed/agent-marks-view.js`、`/embed/agent-marks-icons.js`、`/embed/agent-marks.css` を足し、この4つに `cors: 'read'` の印を付ける。印のあるファイルは、`readAccess(req)` が null（許さないオリジン）なら 403、OPTIONS は許したオリジンに 204（`/api/state` と同じ見出し。allow-methods は GET, HEAD）、GET・HEAD は `readAccess` の見出しを足して配る。印のないファイルの扱いは変えない（Origin を見ない）。
			"""
		satisfies: ["R-04"]
	}
	"D-06": {
		title: "試しの画面の描き直し `web/trial/`"
		text: """
			`trial.js` は試しの orca-web の `${base}/embed/agent-marks.js` を動的な import で読み、`${base}/embed/agent-marks.css` を `<link rel="stylesheet">` で足し、`watchWorktreeSummary` の1つの輪で要約を読む。同じ文書から：
			- 構造の図の箱の見本：幅 180px ほどの箱（worktree の名前、ブランチ）に印。
			- Issue の一覧の行の見本：1行（Issue の番号か worktree の名前、印）を、エージェントのいる worktree ごとに並べる。
			- 今の節の一覧（`sections`）も新しい印で描く。数の札（「作業中 2」などの文字）は、色の点と数だけにする。
			印を選ぶと、今と同じく詳細とチャットの iframe を開く。`trial-view.js` の経過と種類の文字の組み立ては部品に移し、重複を残さない。`phone.html`（390px の枠）でも同じ画面を見る。
			- 試しの静的なサーバー（`src/tools/trial-host.ts`）の HTML の CSP の `style-src` に、`script-src` と同じ試しの orca-web の基（bases）を足す（ほかの指示は変えない）。
			- 許さないオリジンの画面（`web/trial/forbidden.html`・`forbidden.js`）に、`${base}/embed/agent-marks.js` の動的な import を試す行を足し、拒まれた（import が失敗した）ことを示す。
			"""
		satisfies: ["R-02", "R-03", "R-04"]
	}
	"D-07": {
		title: "確かめと文書"
		text:  "README.md に部品の使い方（import の1行、`watchWorktreeSummary` と `renderAgentMarks` の例、CSS のカスタムプロパティ、アイコンの表の差し替え）と要約の新しい項目を、AGENTS.md の `web/embed/` と `src/summary/` の説明に部品と項目を書く。実機で要約の新しい項目の件数を数え（中身は書かない）、試しの画面を Mac の幅と 390px で写して report.md に残す（写しに個人のパスや IP が出ないよう、見本の名前を確かめる）。"
		satisfies: ["R-01", "R-02", "R-03", "R-04"]
	}
}

compatibility: "要約の文書は項目を足すだけで、版 v1 のまま。既存の受け手（試しの画面だけ）は描き直す。部品のファイル以外の配りは変わらない。"
risks: [
	"ロゴは各社の商標。本人の判断（無料で公開する個人の道具）で使う。出どころと商標を書き、表を1か所にして、外すときは小さな直しで済むようにする",
	"worktree の最後の活動の時刻はエージェントごとでなく worktree ごとなので、同じ worktree の複数のスリープは同じ経過になる。読み上げの名前で起点の違いを示す",
]
