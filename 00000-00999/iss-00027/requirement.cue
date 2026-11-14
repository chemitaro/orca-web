package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "表示だけを変え、送信や書き込みには触れない。読み取りの CORS を静的な部品の2〜3のファイルに広げるが、許すオリジンは状態の API と同じ。誤りは表示で分かり、直せる"
}

purpose: "（2026-11-14 に R-05・R-06 を追記：色とスタイルを SpecDock に合わせ、作業中に回る動きを付ける。）SpecDock の狭い枠（構造の図の箱、Issue の一覧の行）に置く worktree ごとのエージェントの印を、種類はアイコン、稼働の状態は色、経過の時間（分・時間・日）で小さく見せる部品にする。SpecDock は要約を1回読めば、多くの箱や行に描ける。"

background: """
	本人の確かめ（2026-11-14、iss-00014 の report.md の『## 本人の確かめ』）：試しの画面の稼働の印は動くが、種類（Codex・Claude）と状態とスリープが文字で、狭い枠に向かない。種類はアイコン、状態は色、スリープも文字でなく、経過の時間を出す。
	今の印（iss-00014 の `web/trial/`）は「Claude 作業中 3分」の文字の丸。要約の API（iss-00019、`GET /api/worktrees/summary`、`orca-web.worktree-summary/v1`）は、エージェントごとに mark、agentType、since（状態の始まりの時刻）を返す。
	実機の値（2026-11-14、読むだけ、一時の port の `npm start`）：エージェント 57 のうち、スリープ 43 と不明 3 は since がない（Orca の agentStatus がない）。worktree の `lastActivityAt` は 1 つを除いてある。エージェントの種類の値は `claude` と `codex`。
	Orca のアプリ（stablyai/orca、MIT）は、`AgentIcon.tsx` で claude に Claude のロゴ、codex に OpenAI のロゴの SVG を描く。ロゴは各社の商標で、MIT の許諾に含まれない。
	SpecDock 側の組み込みは spec-dock の epic-00471（構造の図）と epic-00526（詳細の画面）で後に行う。SpecDock のリポジトリは変えない。
	"""

includes: [
	"要約の文書に、エージェントごとの経過の時間の起点（`elapsedFrom`）とその種類（`elapsedBasis`）を足す（版は v1 のまま、項目を足すだけ）",
	"SpecDock が別のオリジンから import できる、印を描く ES Module の部品（種類のアイコンの表、純粋な組み立て、DOM の描画、要約の読みの輪）と CSS",
	"部品の JS と CSS への、状態の API と同じ読み取りの CORS",
	"試しの画面（`web/trial/`）を新しい部品で描き直し、狭い枠（構造の図の箱、Issue の一覧の行）の見本を置く",
	"README.md と AGENTS.md の更新",
]
excludes: [
	"SpecDock 側の組み込み（spec-dock の epic-00471・epic-00526。SpecDock のリポジトリは変えない）",
		"エージェントの状態の決め方（`agentMark`）と受け箱の段の変更",
	"状態の API（`orca-web.state/v1`）の変更、Orca への新しい命令",
	"チャットと詳細の画面の直し（iss-00028）",
]

requirements: {
	"R-01": {
		title: "要約の API が、エージェントごとに経過の時間の起点とその種類を返す"
		text: """
			`GET /api/worktrees/summary` のエージェントごとに、`elapsedFrom`（ISO 8601 か null）と `elapsedBasis`（`state`・`worktree-activity`・null）を足す。
			- 状態の始まりの時刻（`since`）があれば、それを起点にし、種類は `state`（その状態になってから）。
			- `since` がなく、印が `sleeping` か `unknown` なら、その worktree の最後の活動の時刻（状態の文書の worktree の `lastActivityAt`）を起点にし、種類は `worktree-activity`。
			- どちらもなければ、両方 null。
			既存の項目（`since` を含む）の値と意味は変えない。文書の版は `orca-web.worktree-summary/v1` のまま。
			"""
		acceptance: [
			"手書きの状態の文書で、since のあるエージェントは state、since のないスリープと不明は worktree-activity、worktree に時刻がないか worktrees にない worktree のエージェントは null になる（テスト）",
			"実機で、スリープのエージェントの大半に `elapsedFrom` が入り、`since` のあるエージェントの `elapsedFrom` が `since` と同じ",
		]
	}
	"R-02": {
		title: "種類はアイコンで、状態は色で、経過の時間は短い文字で、狭い枠に収まる印を描ける"
		text: """
			部品は、要約の worktree の1つを受け、エージェントごとに1つの小さな印（チップ）を描く。
			- 種類：アイコン（SVG）で示し、文字の名前を見せない。claude（と claude-agent-teams）、codex、それ以外の種類、種類がない、を形で区別する。アイコンは、claude と codex は各社の実物のロゴ（Orca のアプリの `ClaudeIcon`・`OpenAIIcon` と同じ絵）、それ以外の種類と種類がないは中立の丸。種類ごとの SVG の表は1か所（1つのファイルの1つの表）にまとめ、表の近くに出どころ（Orca の MIT のファイルから写したこと、ロゴは各社の商標であること）を1行書く。
			- 状態：色で示す。working・blocked・waiting・done・sleeping・unknown がそれぞれ別の色。スリープは月の小さな印を足し、文字を見せない。色と形は R-05。
			- 経過の時間：`elapsedFrom` から今までを短い文字で示す。起点がなければ出さない。表記は R-07（now・Nm・Nh・Nd）。
			- 色にだけ頼らないよう、各印は種類、状態、経過の時間とその起点の言葉を、読み上げの名前（aria-label）と title に持つ。
			- 1つの印の高さは小 16px、中 20px。表示の数の上限を超えるエージェントは「+N」の1つの印にまとめる。
			- 色は CSS のカスタムプロパティで、SpecDock の側で変えられる。明るい背景と暗い背景の両方で読める。
			"""
		acceptance: [
			"組み立ての純粋な関数が、手書きの要約から、エージェントごとの種類のアイコンの鍵、状態、経過の文字、読み上げの名前、上限を超えた分の数を期待どおりに返す（テスト）",
			"経過の文字の境目（59秒、59分、23時間59分、24時間、起点が未来、解けない値）が R-07 の表記で期待どおり（テスト）",
			"種類のアイコンの表が1つのファイルにだけあり、知らない種類はそれ以外の種類のアイコンになる（テスト）",
			"試しの画面で、Mac の幅と 390px の枠の両方で、構造の図の箱と Issue の一覧の行の見本に印が収まって見える（写しを report.md に残す）",
		]
	}
	"R-03": {
		title: "SpecDock は要約を1回読めば、多くの箱や行に印を描け、選んだ印から詳細を開ける"
		text: """
			部品は、SpecDock のオリジンから `import` できる ES Module として orca-web が配る。
			- worktree をパスか id で要約の文書から探す関数を持つ（パスの末尾の `/` の違いは同じとみなす）。
			- 要約を決めた間隔（既定 10 秒）で読み、画面が見えない間は読まず、新しい文書を受け手に渡す輪を持つ。輪は止められる。
			- 描く関数は、受け手が渡した文書と今の時刻で、置き場の中を作り直す。受け手が選んだときの処理を渡せば印はボタンになり、選ぶと、そのエージェントの詳細の道（要約の `detail`）を渡す。渡さなければ、ただの印。
			- DOM は textContent と createElementNS で作り、受けた文字を HTML として解かない。要約の値は信頼しないデータとして決めた項目だけを拾う。
			"""
		acceptance: [
			"worktree の探し方：パスの一致、末尾の `/` の違い、id の一致、見つからないときの null（テスト）",
			"読みの輪：決めた間隔で読み、見えない間は読まず、止めた後は読まない。読みの誤りは受け手の誤りの処理に渡し、輪は続く（テスト。fetch と時計と見え方を差し替える）",
			"試しの画面が、要約を1回読んで、すべての見本の箱と行を同じ文書から描き、印を選ぶと詳細とチャットが開く",
		]
	}
	"R-04": {
		title: "部品の JS と CSS は、SpecDock のオリジンと自分のオリジンにだけ読ませる"
		text: """
			部品の ES Module のファイルと CSS に、状態の API と同じ読み取りの CORS（`ORCA_WEB_READ_ORIGINS` の正確なオリジンに `Access-Control-Allow-Origin` と `Vary: Origin`）を付ける。Origin がないか自分のオリジンなら付けずに配る。ほかのオリジンは 403。GET と HEAD のほかは 405（OPTIONS は状態の API と同じく許したオリジンに 204）。ほかの配るファイルの扱いは変えない。
			"""
		acceptance: [
			"部品のファイルに、許したオリジンで CORS の見出しが付き、ポートやスキームだけ違うオリジンは 403、Origin なしは CORS なしで 200、ほかの配るファイル（例 `/embed/open-button.js`）は今までどおり（テスト）",
			"試しの画面（別のオリジン 47900）が部品を import して描け、許さないオリジン（47901）の import は失敗する",
		]
	}
	"R-05": {
		title: "印の色と形と字体が SpecDock のダッシュボードのデザインシステムに合う"
		text: """
			本人の要望（2026-11-14、PR #29 のマージ後、統括の依頼）：印は SpecDock に埋め込むので、色とスタイルを SpecDock のダッシュボードのデザインシステムに合わせる。
			正本は spec-dock のリポジトリの `src/spec_dock/assets/dashboard/core/ui.js`（`STATES`、`stateIcon`、`chip`）と `app.css`（`--ds-*`、`--sd-*` の色の変数、明暗の両方、`.chip`、`.st-ico`）。SpecDock のリポジトリは変えない。
			- 状態の色：SpecDock に同じ意味の状態があればその色の組（主の色、背景、線、文字の色）を使う：working → doing、blocked → blocked、unknown → unknown、done → done。SpecDock に同じ意味がない waiting とスリープは、SpecDock の色の中から選び、理由を report.md に書く（waiting → ready、スリープ → track の灰。D-08）。
			- 印の形：SpecDock の `.chip` に合わせる（角丸 4px、1px の線、背景は状態の薄い色、文字は状態の濃い色、太さ 700、字体は SpecDock の `--ds-font-sans`）。
			- SpecDock の中に置かれたときは SpecDock の変数（`--sd-*`、`--ds-*`）をそのまま使い、SpecDock の明暗の切り替え（`data-theme` と OS の設定）に従う。SpecDock の外では、同じ値の既定を持つ（明暗の両方）。
			- 突き合わせの表（状態ごとの色、形、太さ、角丸、字体）を report.md に書く。
			"""
		acceptance: [
			"CSS の各状態の色が SpecDock の変数を先に使い、既定の値が SpecDock の明暗の値と同じ（テスト）",
			"report.md に、状態ごとの色・形・太さ・角丸・字体の突き合わせの表と、SpecDock にない状態の色の理由がある",
			"試しの画面と SpecDock のダッシュボード（127.0.0.1:47800）を並べた写しで、作業中・完了などの色が同じ系統に見える（report.md に残す）",
		]
	}
	"R-06": {
		title: "作業中（working）の印は、回る動きで示し、動きを減らす設定では止まる"
		text: """
			本人の要望（2026-11-14）：working は色だけでなく、ぐるぐる回るような動きを付ける。SpecDock の作業中の印の動きは、次の区切りの点滅（`sd-next`、2 秒）で、回る動きはない（D-09）。本人の言葉に合わせて回る動きにし、SpecDock の点滅の周期（2 秒）とは別に、回る弧の周期を決める。
			- 動きは CSS のアニメーションで、transform（rotate）だけを動かす（再配置や再描画を起こさない）。多くの行に並んでも JS の時計を使わない。
			- `prefers-reduced-motion: reduce` では止め、止まった弧の形だけを残す。
			- working 以外の印は動かない。
			"""
		acceptance: [
			"working の印にだけ回る要素があり、その keyframes が transform だけを動かし、`prefers-reduced-motion: reduce` で animation が none になる（テスト）",
			"試しの画面で working の印が回り、動きを減らす設定で止まる（ヘッドレスの Chrome の emulation で確かめ、結論を report.md に書く）",
		]
	}
	"R-07": {
		title: "経過の時間は英語の短い形（now、5m、3h、2d）で示し、読み上げは読める形にする"
		text: """
			本人の指摘（2026-11-14）：経過の『今』は見た目がよくない。日本語にこだわらない。統括の決定（task_27eff0d07653）：
			- 印に見せる経過は英語の短い形に統一する：1分未満は `now`、60分未満は `<N>m`、24時間未満は `<N>h`、それ以上は `<N>d`（数字と m・h・d の間に空白なし、切り捨て、tabular-nums）。週や月には上げない（30日は `30d`）。未来、解けない値、起点がないときは出さない（今までどおり）。
			- aria-label と title は読める形（日本語の文でよい。例「Claude、作業中、この状態になって 3時間」）。短い形をそのまま読ませない。
			- 表記の関数は1か所（1つのファイル）にまとめ、iss-00028 のチャットからも使える形で export する。印の部品、試しの画面、受け箱（`web/inbox-view.js`）と Run の木（`web/runs-view.js`）の経過もその関数を使い（統一）、ほかに同じ規則の分岐を持たない。受け箱と Run の木は、未来の時刻（時計のずれ）を今までどおり1分未満（`now`）として示す（関数の選択肢で決める）。
			"""
		acceptance: [
			"表記の関数が 59 秒で now、60 秒で 1m、59 分で 59m、60 分で 1h、23 時間 59 分で 23h、24 時間で 1d、30 日で 30d、400 日で 400d を返し、未来・解けない値・数でない now で null（テスト）",
			"印の表示の経過が短い形で、aria-label と title が読める形（『今』や短い形の m・h・d を含まない）（テスト）",
			"表記の関数のファイルが別のオリジン（SpecDock）からも import でき、印の部品と同じ読み取りの CORS で配られる（テスト）。経過の規則（60_000 などの境目）が web/ の中でそのファイルにだけある（テスト）",
			"試しの画面（tailnet でも）で、印の経過が now・Nm・Nh・Nd で見える（写しを report.md に残す）",
		]
	}
}

failures: {
	"F-01": {
		title: "要約が読めない、古い、形が違うときも、印は推測で描かない"
		text:  "要約が読めないときは、輪は受け手の誤りの処理に渡すだけで、前の描画を消さない。文書の形が違えば、組み立ては印を返さない。`stale` の文書は、受け手が古いことを示せるよう、そのまま渡す（試しの画面は帯で示す）。"
	}
	"F-02": {
		title: "知らない種類、知らない状態、解けない時刻を推測で埋めない"
		text:  "知らない種類はそれ以外の種類のアイコン、知らない状態は unknown の色にする。解けない時刻と未来の時刻は、「今」とせずに経過を出さない。"
	}
}

constraints: [
	"実行時の依存を足さない。部品は素の ES Modules で、ビルドしない",
	"Orca に新しい命令を送らない。要約は既存の共有のポーリングの状態の文書から組む",
	"要約の文書の版は v1 のまま。項目を足すだけで、既存の項目を変えない",
	"ロゴの SVG は Orca（stablyai/orca、MIT）の決めたコミットのファイルから path の値だけを写し、出どころと商標の1行を表の近くに書く",
	"記録、録画、ログ、写しに、会話や連絡の中身、authToken、個人の絶対パス、実際の IP を入れない",
]

decisions: [
	"アイコンは案B：Codex と Claude は各社の実物のロゴを SVG のまま使う（Orca の AgentIcon.tsx の ClaudeIcon・OpenAIIcon と同じ絵）。その他の種類は中立の丸。種類ごとの SVG の表は1か所、aria-label に種類の名前。出どころ（Orca の MIT のファイルから写したこと、ロゴは各社の商標であること）を表の近くのコメントか README に1行書く（本人の決定、統括の伝言 msg_59c9286c72c4、2026-11-14。本人の理由：無料で公開し、個人で使う道具なので問題ない。先の統括の答え msg_8fb42dcb5148 の案A を置き換える）",
	"経過の時間の起点：状態の始まり（`since`）があればそれ（その状態になってから）。スリープと不明で since がなければ、worktree の最後の活動の時刻で代える（実機でスリープ 43 件すべてに since がなかったため。タスク担当、2026-11-14）",
	"描き方：SpecDock が import する ES Module と CSS の部品（iframe でなく）。Issue の一覧の行のように多くの置き場に描くとき、要約を1回読んで済み、iframe の数だけ読みが増えない（タスク担当、2026-11-14。統括が範囲として了承、msg_8fb42dcb5148）",
	"別のオリジンからの ES Module の import には CORS が要るので、部品のファイルにだけ状態の API と同じ読み取りの CORS を付ける（タスク担当、2026-11-14）",
	"経過の時間は日本語の短い文字（今、N分、N時間、N日）。本人の言葉「何分、何時間、何日」に合わせる（タスク担当、2026-11-14）",
	"スリープは灰色と月の印、不明は灰色の破線の縁。色だけに頼らないよう、読み上げの名前と title に文字を持たせる（タスク担当、2026-11-14。R-05 で色は SpecDock の色に、不明の破線は SpecDock の不明の色に改める）",
	"色とスタイルを SpecDock のダッシュボードのデザインシステムに合わせ、working に回る動きを付け、動きを減らす設定では止める（本人の要望、統括の依頼 task_719d89144ea2、2026-11-14。PR #29 のマージの後の続きとして、新しい PR にする）",
	"waiting（入力待ち）は SpecDock の ready（着手できる、青）の色にする。利用者が動けば進む状態で、SpecDock の『着手できる』と同じく『こちらの番』を示し、blocked（許可待ち、琥珀）と見分けられるため。スリープは SpecDock の track の灰（`--sd-track`）にし、背景は塗らない。終わった（done、`--ds-faint` の灰の塗り）より控えめで、休んでいることを示すため（タスク担当、2026-11-14）",
	"経過の時間の表記は英語の短い形（now、5m、3h、2d、日より上に上げない）に統一し、読み上げは読める日本語の文にする。表記の関数は `web/embed/elapsed.js` の1か所にし、iss-00028 のチャットからも import できる（本人の指摘と統括の決定、task_27eff0d07653、2026-11-14。R-02 の『今・N分・N時間・N日』を置き換える）",
	"回る動きは SpecDock にない（SpecDock の作業中は点滅）。本人の言葉どおり回る動きにする。周期は 1.2 秒の等速（タスク担当、2026-11-14）",
]

questions: []
