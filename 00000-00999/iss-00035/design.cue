package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"開くボタンの見た目、状態の示し方、結果の言葉を1つの部品に集め、3か所で二重に持たない",
	"開く操作と守りに触れない（部品は今の `createWriter().send('/api/open', …)` を呼ぶだけ）",
]

current: "埋め込みのボタン（open-button.html・open-button-frame.js・open-button.css）、詳細の見出し（agent.html の #open と #open-status、agent-frame.js）、受け箱（inbox-dom.js の renderItem、inbox.js の openInOrca）が、それぞれボタンと結果の文字と言葉の表を持つ。"
target:  "ロゴは `agent-marks-icons.js` の `APP_ICONS.orca` の1か所。純粋な組み立て `open-control-view.js`、DOM と押したときの流れ `open-control.js`、見た目 `open-control.css` を3か所が使う。"

design: {
	"D-01": {
		title: "Orca のロゴの表（APP_ICONS）"
		text: """
			`web/embed/agent-marks-icons.js` に `export const APP_ICONS = { orca: { label: 'Orca', viewBox, paths } }` を足す。値は stablyai/orca の `resources/logo.svg`（タグ v1.4.258、コミット c91a7a6ee3dc76090cafb33943961ae2235246d6）の1つの path の d をそのまま写し、viewBox は transform translate(-6.6666669,-70.666669) を吸収した `6.6666669 70.666669 318.60232 202.66667`、fill は `currentColor`（元は #ffffff）、fillRule なし。表の上に、出どころ（リポジトリ、ファイル、コミット、MIT）と「ロゴは Orca（Lovecast Inc.）の商標」の1行を書く。
			SVG は `agent-marks.js` の今の私的な `svg(doc, shape, className)` を `appIcon(doc, key, className)` として出して使う（`stateIcon` と同じ形）。新しい SVG の組み立てを作らない。
			"""
		satisfies: ["R-01"]
	}
	"D-02": {
		title: "純粋な組み立て open-control-view.js"
		text: """
			`web/embed/open-control-view.js`（DOM に触れない）：
			- `OPEN_MESSAGES`：誤りの鍵 → 言葉。今の open-button-frame.js の表（busy、worktree_not_found、target_gone、unavailable、runtime_changed、unsupported、unknown_shape、orca_error、unconfirmed）と同じ言葉。3か所の表はこれ1つにする。
			- `openResult(outcome)`：`{ kind: 'response', status, body }` か `{ kind: 'network' }` を受け、`{ state: 'done' | 'error', message }` を返す。body.ok === true なら done で「開きました」、mayCreateInitialTerminal が真なら「開きました（Orca が端末を作ることがあります）」。誤りの鍵が表にあればその言葉、なければ「開けません（<status>）」。network は「orca-web につながりません」。Orca の応答の文字は使わない（F-01）。
			- `openControlView(state, { label, message })`：state は idle・busy・done・error・missing（worktree の指定がない）。label は 'text'（既定）か 'none'。返すのは `{ text, ariaLabel, title, icon, disabled, busy, tone, status }`。
			  - text：label が text なら 'Open'、none なら null。
			  - ariaLabel：text なら『Open（Orca で開く）』、none なら『Orca で開く』（統括の答え）。
			  - title：idle は『Orca で開く』、busy は『開いています…』、done・error は message、missing は『worktree の指定がありません』。
			  - icon：idle・error・missing は 'orca'、busy は 'spinner'、done は 'check'。
			  - disabled：busy と missing で真。busy：busy で真。tone：error と missing で 'warn'、ほかは null。
			  - status（読み上げの領域の言葉）：idle は ''、busy は『開いています…』、done・error・missing は title と同じ。
			- `OPEN_DONE_MS = 2000`：done から idle に戻すまでの時間。
			"""
		satisfies: ["R-01", "R-03", "R-05", "F-01", "F-02"]
	}
	"D-03": {
		title: "DOM と押したときの流れ open-control.js"
		text: """
			`web/embed/open-control.js`：
			- `createOpenControl(doc, { size = 'sm', label = 'text' })` が `{ root, button, setState(state, message?) }` を返す。root は `span.orca-open`（data-size、data-label、data-tone を持つ）。中に `button.orca-open-button`（type=button）、その中にアイコンの置き場 `span.orca-open-icon`（ロゴの svg、回る印、チェックの svg を状態で差し替える。どれも aria-hidden）と、label が text のときだけ `span.orca-open-text`（textContent 'Open'）。root の中に目に見えない `span.orca-open-status`（role=status、aria-live=polite、見えない形の CSS）。aria-label、title、disabled、aria-busy は `openControlView` の値だけで入れる。文字は textContent、SVG は createElementNS（agent-marks.js の appIcon。回る印とチェックは自前の小さな形をこのファイルか APP_ICONS の隣の表に置く。どちらにしても1か所）。
			- `runOpen(control, send)`：`send()` は `writer.send('/api/open', 'POST', body)` を呼ぶ関数（呼び手が本体を決める。今の本体のまま：埋め込みは worktree と agent、詳細は detail.open、受け箱は worktree と agent）。busy にし、結果を `openResult` で done か error にし、done は OPEN_DONE_MS の後に idle に戻す（その間にまた押されたら古い時計を消す）。二重に押されても busy の間は送らない。
			- 受け箱は描き直しで要素が作り直されるので、今の openNotes の代わりに、最後の結果（error の言葉と状態）を agentId ごとに持ち、作り直した部品に setState で戻す（done は時計が切れていれば idle）。
			"""
		satisfies: ["R-01", "R-03", "R-05", "R-06", "F-01", "F-02"]
	}
	"D-04": {
		title: "見た目 open-control.css"
		text: """
			`web/embed/open-control.css`。変数は SpecDock の変数を先に使い、ないときは app.css と同じ既定に戻る：線 `var(--ds-border, #dfe3e9)`、hover の線 `var(--ds-border-2, #848d9c)`、字 `var(--ds-text, #1c2230)`、琥珀 `var(--ds-warn, #a87400)`、フォーカス `var(--ds-focus, #1a56c4)`、角丸 `var(--ds-radius-s, 4px)`、字体 `var(--ds-font-sans, <app.css の並び>)`。暗い値（`#2b313c`、`#6f7889`、`#e6e9ef`、`#e0a83a`、`#8fb4ff`）を prefers-color-scheme（`:root:not([data-theme="light"])`）と `:root[data-theme="dark"]` の両方で置く。新しい色を足さない。
			ボタン：inline-flex、中央そろえ、gap 4px、背景 transparent、1px の線、字の太さ 700、行の高さ 1、white-space nowrap、cursor pointer。sm：高さ 24px、アイコン 14px、字 12px、左右の余白 6px。md：高さ 28px、アイコン 16px、字 13px、左右の余白 8px。アイコンだけ（data-label=none）：幅＝高さの正方形、余白 0。ロゴは 14px（16px）の正方形の箱に preserveAspectRatio meet で収める。
			hover：線を border-2 に。focus-visible：`outline: 2px solid var(--ds-focus)` を `outline-offset: -2px`（iframe で切れないよう内側に描く）。disabled：cursor default、不透明度 0.6（busy の間の回る印は不透明度を下げない）。data-tone=warn：線とアイコンの色を琥珀に。回る印は 0.8s の回転、`prefers-reduced-motion: reduce` では回さない。見えない status は clip の型の視覚的に隠す CSS。
			部品の CSS はこの1つで、3か所が同じファイルを読む（agent.html と open-button.html と index.html の link）。古い `#open` `.open` `.open-status` `#open-status` の見た目の規則と open-button.css の中のボタンの規則は消す（open-button.css は iframe の文書の背景透明・余白 0・はみ出しを隠すだけに減らすか、open-control.css に寄せて消す）。
			"""
		satisfies: ["R-02", "R-03"]
	}
	"D-05": {
		title: "3か所の置き換えと iframe の大きさ"
		text: """
			- 埋め込み：open-button.html の body は空の置き場と module の読み込みだけ。open-button-frame.js が `?size=`・`?label=`・`?theme=` を読み、`createOpenControl` を置き、worktree がなければ missing。押すと `runOpen`。`/embed/open-button.js` は `data-label="none"` を `label=none` として渡し、iframe の既定の大きさを形と大きさで決める：高さは sm 24・md 28、幅は文字ありで sm 64・md 76 を目安に、描画で測ってボタンが切れない最小の整数にした定数、アイコンだけは高さと同じ。`data-width` の上書きは残す。iframe の title は『Orca で開く』のまま。390px 以下で隠して読み込まないのは今のまま。
			- 詳細の見出し：agent.html の `#open` と `#open-status` を置き場 `#open-slot` に替え、agent-frame.js が md で部品を置く（大きさは見出しに合わせて md、題名の行の右端）。390px 以下と agentId がないときに隠すのは今のまま（置き場ごと）。
			- 受け箱：inbox-dom.js の renderItem が、showOpen と item.open のときだけ sm の部品を置く（`options.onOpen(target, control)` に替える）。inbox.js が runOpen で送る。390px 以下で出さないのは今のまま。
			- 試しの画面：変えない（埋め込みのボタンを使うので新しい形になる）。forbidden.html の(3)は今のまま。
			"""
		satisfies: ["R-01", "R-04", "R-06", "F-02"]
	}
	"D-06": {
		title: "配ること"
		text: "`src/server/app.ts` の STATIC_FILES に `/embed/open-control.js`、`/embed/open-control-view.js`、`/embed/open-control.css` を足す（CORS は付けない。同じオリジンの画面と iframe だけが読む）。open-button.css を消すなら道も消す。CSP は変えない。"
		satisfies: ["R-06"]
	}
}

compatibility: "埋め込みの1行のスクリプトの属性（data-worktree、data-agent、data-theme、data-size、data-width）は今のまま読み、data-label を足すだけ。既定の幅が狭くなるので、260 を前提にした置き場は data-width で戻せる。"
risks: [
	"Orca のロゴは横長（約 1.57:1）なので、14px の正方形の箱では高さが 9px ほどになる。試しの画面の写しで見て、小さすぎれば統括に問う",
]
