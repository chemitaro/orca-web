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

			図形：claude と codex は各社の実物のロゴ。Orca（stablyai/orca、MIT、コミット `80a514cfb6ac169ef311e70ea2b8a07b961416d8`）の `src/renderer/src/components/status-bar/icons.tsx` の `ClaudeIcon`（viewBox `0 0 24 24`、path 1本、fill `#D97757`、fillRule nonzero）と `OpenAIIcon`（viewBox `0 0 24 24`、path 1本、fill `currentColor`、fillRule evenodd）から、viewBox、path の `d`、fill、fillRule の値だけを写す（タスク担当がそのコミットのファイルを `.workbench/orca-icons.tsx` に置いた。実装担当はそこか、`gh api` で同じコミットから読む）。表のすぐ上に、出どころ（Orca の MIT のファイルのパスとコミットから写したこと）と、ロゴは Anthropic・OpenAI の商標であることを1行のコメントで書き、README にも1行書く。other は中立の丸の縁に点、none は破線の丸（どちらも自前、16×16 か 24×24 の viewBox、`currentColor`）。label は claude → `Claude`、codex → `Codex`、other → 種類の値をそのまま（長さは 40 字まで）、none → `エージェント`。表の値は SVG の文字列でなく、viewBox と path の `d`・fill・fillRule・stroke などの決めた項目だけ（DOM は createElementNS で作り、innerHTML を使わない）。アイコンの置き方と色は D-08（台を置かず、状態の薄い背景の上にロゴを直接置く。OpenAI の currentColor は状態の文字の色）。
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
			export function formatElapsed(from, now) // D-11 の elapsed.js から再び export する。'now' | 'Nm' | 'Nh' | 'Nd' | null
			export function findWorktree(summary, { path, id }) // → worktree | null
			export function buildMarks(worktree, { now, max = 4 }) // → { marks: MarkView[], overflow: { count, label } | null }
			// MarkView = { id, mark, icon: <AGENT_ICONS の鍵>, typeLabel, elapsed: string | null, label: string, detail: string | null }
			```

			- `formatElapsed`：D-11 の `web/embed/elapsed.js` のものを使う（このファイルに規則を持たない）。
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
			- CSS：色と形と動きは D-08・D-09 のとおり（`.orca-marks` に置く状態ごとの4つのカスタムプロパティ、SpecDock の `.chip` の形、working の回る弧）。
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
	"D-08": {
		title: "印の色と形を SpecDock のデザインシステムに合わせる `web/embed/agent-marks.css`"
		text: """
			正本：spec-dock の `src/spec_dock/assets/dashboard/app.css`（読んだ版：spec-dock の main の `928460f48`）と `core/ui.js`。

			状態ごとの色の組（主の色 `--orca-mark-<state>`、背景 `-bg`、線 `-line`、文字 `-ink`）を `.orca-marks` に置き、値は SpecDock の変数を先に、なければ同じ値の既定を使う（例 `--orca-mark-working: var(--sd-doing, #0b8a4a)`）。SpecDock の中では SpecDock の明暗（`data-theme` と OS の設定）にそのまま従い、外では `prefers-color-scheme: dark` で暗い既定に替える。

			| orca-web の状態 | SpecDock の変数 | 明るい（主・背景・線・文字） | 暗い（主・背景・線・文字） |
			|---|---|---|---|
			| working | `--sd-doing*` | #0b8a4a・#e7f6ee・#b3e0c6・#0a6b3a | #3ddc84・rgb(61 220 132 / 10%)・rgb(61 220 132 / 28%)・#7ce8ab |
			| blocked | `--sd-blocked*` | #a86e00・#fff6dc・#efd595・#7a5000 | #ffc93c・rgb(255 201 60 / 10%)・rgb(255 201 60 / 28%)・#ffd978 |
			| waiting | `--sd-ready*` | #2457c5・#edf2fc・#c3d3f3・#1d469f | #6f9dff・rgb(111 157 255 / 10%)・rgb(111 157 255 / 28%)・#a8c3ff |
			| done | `--sd-done*`（= `--ds-faint`・`--ds-tip-bg`・`--ds-tip-line`・`--ds-tip-ink`） | #7d8696・#f3f5f8・#d6dbe3・#343c4a | #7f889a・rgb(163 172 187 / 9%)・rgb(163 172 187 / 26%)・#d0d6df |
			| unknown | `--sd-unknown*` | #7048c0・#f3effc・#d6c8f2・#5b37a6 | #b79bff・rgb(183 155 255 / 10%)・rgb(183 155 255 / 28%)・#d2c0ff |
			| sleeping | `--sd-track`（= `--ds-border-2`）と `--ds-muted` | 主・線 #848d9c、背景 transparent、文字 #5a6372 | 主・線 #6f7889、背景 transparent、文字 #98a1b2 |
			| +N（overflow） | done と同じ組 | done と同じ | done と同じ |

			形（SpecDock の `.chip` に合わせる）：角丸 4px（`--ds-radius-s`）、線 1px solid `-line`、背景 `-bg`、文字 `-ink`、太さ 700、字体 `var(--ds-font-sans, "BIZ UDPGothic", -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif)`、経過の数字は tabular-nums。高さは小 16px・中 20px のまま。アイコンの白い台はやめ、ロゴを状態の薄い背景の上にそのまま置く（Claude の橙はそのまま、OpenAI の currentColor は `-ink`）。不明の破線の縁はやめ、SpecDock の不明の紫で示す。スリープは月の印（`-ink`）。フォーカスの縁は SpecDock の `--ds-focus`（既定 #1a56c4、暗い #8fb4ff）の 2px。
			試しの画面（`web/trial/trial.css`）の数の札の色の点も、同じ `--orca-mark-<state>` を使う。
			README の CSS のカスタムプロパティの説明を、新しい名前（状態ごとの4つ）に改める。
			"""
		satisfies: ["R-05"]
	}
	"D-09": {
		title: "作業中の回る動き `web/embed/agent-marks.css`（必要なら `agent-marks.js`）"
		text: """
			SpecDock の作業中の動きは `.st-ico[data-live="1"] .sd-nx` の点滅（`@keyframes sd-next`、opacity、2 秒、ease-in-out）で、回る動きはない。本人の要望どおり回る動きにする。
			- working の印のアイコンのまわりに、SpecDock の作業中の輪（`progressRing`：track の細い輪と、主の色の太い弧）に似た輪を描く：静かな輪（線 `--orca-mark-working-line`）と、その上の 1/4 ほどの弧（`--orca-mark-working`）。弧は疑似要素（`::after` の border の一部の色）か、小さな SVG で作る。
			- 弧だけを `@keyframes orca-mark-spin { to { transform: rotate(360deg); } }` で 1.2 秒の等速（linear、infinite）で回す。keyframes は transform のほかを動かさない。JS の時計を使わない。
			- `@media (prefers-reduced-motion: reduce)` では `animation: none`（弧は止まったまま見える）。
			- working のほかの印には回る要素も animation もない。
			"""
		satisfies: ["R-06"]
	}
	"D-10": {
		title: "突き合わせの記録と確かめ（report.md、写し）"
		text: "タスク担当が、D-08 の表を report.md に写し（形・太さ・角丸・字体の行を足す）、SpecDock にない状態（waiting、スリープ、+N）の色の理由を書く。試しの画面（tailnet でも）と SpecDock のダッシュボード（127.0.0.1:47800）を明暗の両方で並べて写し、report.md に残す（写しは `.workbench/trial-evidence/iss-00027/`、コミットしない）。動きを減らす設定は、ヘッドレスの Chrome の `Emulation.setEmulatedMedia`（prefers-reduced-motion: reduce）で working の弧の animation-name が none になることを確かめる。"
		satisfies: ["R-05", "R-06"]
	}
	"D-11": {
		title: "経過の表記の関数 `web/embed/elapsed.js`（1か所）"
		text: """
			純粋な ES Module。DOM、時計、fetch に触らない。iss-00028 のチャットや SpecDock からも import できる。

			```js
			/** from（ISO 8601 の文字列、またはミリ秒の数）から now（ミリ秒）までの経過のミリ秒。未来・解けない値・数でない now は null。 */
			export function elapsedMs(from, now)
			/** 短い形：'now' | '<N>m' | '<N>h' | '<N>d' | null（1分未満 now、60分未満 m、24時間未満 h、ほか d。切り捨て。週・月に上げない） */
			export function formatElapsed(from, now)
			/** 読める形（日本語）：'1分未満' | '<N>分' | '<N>時間' | '<N>日' | null。aria-label と title の文に使う */
			export function describeElapsed(from, now)
			```

			- 選択肢：`formatElapsed(from, now, { clampFuture = false } = {})`、`describeElapsed` も同じ。`clampFuture: true` のときは、未来の時刻を 0 の経過（短い形 `now`、読める形 `1分未満`）にする。解けない値と数でない now はいつも null。
			- 境目（60_000、60、24）はこのファイルにだけ置く（`web/embed/send-view.js` の別の意味の 60_000 は経過の規則でないので対象外）。
			- 受け箱：`web/inbox-view.js` の `formatElapsed` を消し、`./embed/elapsed.js` の `formatElapsed(since, now, { clampFuture: true })` を使う。`web/runs-view.js` も同じ関数を `./embed/elapsed.js` から import する（`inbox-view.js` から import しない）。受け箱と Run の木の経過は短い形になる（未来は now）。
			- `web/embed/agent-marks-view.js` は `formatElapsed` をここから import して再び export し（既存の import の口を保つ）、MarkView の `elapsed` に短い形を入れる。label の経過の文は `describeElapsed` で作る：basis が state なら「この状態になって <読める形>」（1分未満なら「この状態になったばかり」）、worktree-activity なら「最後の活動から <読める形>」（1分未満なら「最後の活動は1分未満前」）、ほかは「経過 <読める形>」。短い形（now・m・h・d）を label に入れない。
			- `web/embed/agent-marks.js` が DOM に `title` と `aria-label` として label を入れるのは今のまま。
			- `src/server/app.ts` の配る表に `/embed/elapsed.js` を足し、印の部品と同じ `cors: 'read'` を付ける（別のオリジンから import される agent-marks-view.js が import するため）。
			- 試しの画面（`web/trial/`）に経過の文字の組み立てがあれば、この関数に替える。
			- README の印の説明の経過の表記と、部品のファイルの一覧（5つになる）を改める。AGENTS.md の `web/embed/` の説明に `elapsed.js` を足す。
			"""
		satisfies: ["R-07"]
	}
	"D-12": {
		title: "読み取りと状態の文書の2つの事実 `src/orca/read-state.ts`、`src/state/model.ts`、`src/state/normalize.ts`、`src/state/fields.ts`"
		text: """
			読み取り（今の読みの結果から拾う項目を足すだけ。命令は増やさない）：
			- `OrcaAgentStatus` に `workingMode`（`agentStatus.workingMode`）と `mainAgentStateStartedAt`（`agentStatus.mainAgent.stateStartedAt`）。
			- `OrcaTab` に `chatWorkingMode`（`chatStatus.workingMode`）。主エージェントの始まりは今の `chatStateStartedAt`（`chatStatus.mainAgent.stateStartedAt`）を使う。
			- `OrcaPsAgent` に `workingMode`（`agents[].workingMode`）と `mainAgentStateStartedAt`（`agents[].mainAgent.stateStartedAt`）。
			値は文字（`str`）と数（`num`）でそのまま拾い、意味は付けない。
			状態の文書（`AgentState`）に `workingMode: Fact<string>` と `mainAgentStateStartedAt: Fact<string>`（ISO 8601）を足す。取得元は状態（`state`）と同じ：
			- 端末のタブ：`agentStatus.state` があれば両方とも tabs の `agentStatus.workingMode`・`agentStatus.mainAgent.stateStartedAt`。なく ps の state を使うなら、ps の `agents.workingMode`・`agents.mainAgent.stateStartedAt`。違う取得元を混ぜない（片方の state と、もう片方の workingMode を組にしない）。
			- 構造化 Chat：tabs の `chatStatus.workingMode`・`chatStatus.mainAgent.stateStartedAt`。
			- タブのない ps：ps の2つ。
			値がなければ今の決まり（`missingFact`、取得元を読めたが値がない `not-provided` など）。`fields.ts` に `agent.workingMode`（「動きの種類」：Orca の workingMode。monitoring は背後の作業の待ち）と `agent.mainAgentStateStartedAt`（「主エージェントの状態の開始時刻」）を足す（既定は選ばない）。状態の文書の版は v1 のまま。
			"""
		satisfies: ["R-08", "F-03"]
	}
	"D-13": {
		title: "印の決め方と要約・受け箱・Run の木 `src/inbox/classify.ts`、`src/inbox/model.ts`、`src/summary/*`、`src/runs/tree.ts`"
		text: """
			- `AgentMark` に `background` を足す。`agentMark`：`state.value === 'working' && workingMode.value === 'monitoring'` なら `background`（D-12 で取得元は揃っている）。ほかは今のまま。
			- 経過の起点の関数を1つにする（`src/summary/build.ts` か新しい純粋な関数。要約と Run の木が使う）：background なら `mainAgentStateStartedAt` → basis `wait`、なければ worktree の `lastActivityAt` → `worktree-activity`、どちらもなければ null。ほかの印は今の規則（since → state、スリープと不明は worktree-activity）。
			- 要約：`counts` に `background`、`elapsedBasis` の型に `'wait'`。`since` は変えない。版 v1 のまま。
			- 受け箱：`InboxReason` に `background`。段は running・理由 background。`no_output` は今のとおり mark が working のときだけ（background は当たらない）。`terminal_ended` は今のまま（background でも当たる）。並びは今の段の中の並びのまま。
			- Run の木：節の `state` は、エージェントがあり `agentMark` が background なら `'background'`、ほかは今のまま。`since` は background のとき経過の起点の関数の値（待ちの始まり、なければ worktree の最後の活動）、ほかは今のまま。
			"""
		satisfies: ["R-10", "F-03"]
	}
	"D-14": {
		title: "電気の印の SVG と印の部品 `web/embed/agent-marks-icons.js`、`agent-marks-view.js`、`agent-marks.js`、`agent-marks.css`"
		text: """
			- `agent-marks-icons.js` に `STATE_ICONS.background`（`AGENT_ICONS` と同じ形の `{ label, viewBox: '0 0 24 24', paths: [{ d, fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }] }`）を足す。d は lucide-react 0.577.0 の `dist/esm/icons/activity.js` の値 `M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2`。表の近くに1行：lucide（ISC、lucide-react 0.577.0。Orca 1.4.258 の AgentStateDot の monitoring の印）から写した。描画の部品が path の stroke の属性（linecap、linejoin）も createElementNS で付けられるようにする。
			- `agent-marks-view.js`：MARKS に background（working の次）、`MARK_LABELS.background = '背後の作業を監視中'`、並びは要対応 0、working 1、background 2、unknown 3、done 4、sleeping 5。label の経過の文：basis `wait` は「待ちになって <読める形>」（1分未満なら「待ちになったばかり」）。
			- `agent-marks.js`：background の印は、種類のロゴの前（左）に電気の印の SVG（class `orca-mark-state`、aria-hidden）を置く（Orca の行の並び：状態の印、種類のロゴ）。重ねない。
			- `agent-marks.css`：`--orca-mark-background*` の4つの変数を working と同じ SpecDock の doing（`var(--sd-doing, …)` など、明暗とも working と同じ既定）にする。電気の印は小で 11px ほど、中で 13px ほど（ロゴと同じ高さの枠に収まり、線が読める）、色は主の色。background には回る弧（`::after`）も animation もない。
			"""
		satisfies: ["R-09"]
	}
	"D-15": {
		title: "受け箱・Run の木の画面と試しの画面 `web/inbox-view.js`、`web/runs-view.js`、`web/runs-dom.js`、`web/trial/*`"
		text: """
			- 受け箱：`REASON_LABELS.background = '背後の作業を監視中'`。
			- Run の木：`STATE_LABELS.background = '背後の作業を監視中'`。行の組み立てに状態の鍵（例 `stateKey: 'background'`）を持たせ、`runs-dom.js` は background の節の状態の文の前に、`STATE_ICONS.background` の SVG を createElementNS で描く（aria-hidden。文字は textContent）。色は working の節と同じ系統の緑（`web/` の画面の CSS）。
			- 試しの画面：数の札の並びに background（working の次）。背後の待ちの実例が手元にないときでも写せるよう、手で作った worktree の見本（working・background・done の3つ、経過は決めた値）を部品で描く小さな節「状態の見本」を足す（見本と分かる見出し。実機の値と混ぜない）。
			"""
		satisfies: ["R-09", "R-10"]
	}
}

compatibility: "要約の文書は項目を足すだけで、版 v1 のまま（R-10 で counts.background、elapsedBasis の値 wait、印の値 background が増える。部品は知らない印を unknown にするので、古い部品も壊れない）。状態の文書も v1 のまま、エージェントに2つの事実が増える（R-08）。既存の受け手（試しの画面だけ）は描き直す。部品のファイル以外の配りは変わらない。D-08 で CSS のカスタムプロパティの名前を状態ごとの4つ（主・背景・線・文字）に改める（受け手はまだ試しの画面だけなので、古い名前の互換は持たない）。"
risks: [
	"Orca の workingMode の意味が後の版で変わると、background の判定がずれる。値がちょうど monitoring で state が working のときだけにし、ほかは今の印に落とす（F-03）",
	"ロゴは各社の商標。本人の判断（無料で公開する個人の道具）で使う。出どころと商標を書き、表を1か所にして、外すときは小さな直しで済むようにする",
	"worktree の最後の活動の時刻はエージェントごとでなく worktree ごとなので、同じ worktree の複数のスリープは同じ経過になる。読み上げの名前で起点の違いを示す",
]
