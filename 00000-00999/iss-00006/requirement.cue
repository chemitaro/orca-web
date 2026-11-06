package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "読むだけ。誤りは表示で分かり、直せる"
}

purpose: """
	orca-web の状態の API を作る。SpecDock のダッシュボード（epic-00471 の図への状態の重ね）と orca-web の簡単な画面が、
	Orca の repo・worktree・エージェント・オーケストレーションの状態を、値の意味、取得元、鮮度、欠けた理由つきの小さな JSON として読めるようにする。
	表示する項目を利用者が選べるようにし、SpecDock の正確なオリジンにだけ読み取りを許す。
	"""

background: """
	親の epic-00003 の切り分け（slices の iss-00006）を受け、epic-00003 の R-01、R-02、R-03、F-01 と D-03 を具体にする。
	土台（`src/orca/` の CLI と RPC の境界、機能の確かめ、録画と再生）は iss-00005 で作った。iss-00005 の実機の確かめ（report.md）で、
	次が分かっている。`agentStatus.model` は Claude Code でも Codex でも出ない。モデルが取れるのはオーケストレーションの担当の `worker-show` の
	起動時の値（requested と effective）だけ。`providerSession.effort` は Claude Code だけが出す。スリープ中（または復元前）のタブは `pending-handle` で、
	端末の handle と agentStatus を持たず、エージェントと分かるのは `launchAgent` だけ。端末は handle で結ぶ（`terminal list` の tabId と leafId は仮の値になりうる）。
	2026-11-06 の手元の Orca 1.4.251 で、読むだけのコマンドの形を確かめた：`session.tabs.listAll` は1回で全 worktree のタブを返す（約 30ms）。
	`orchestration run-list` は `nextCursor`、`worker-list` は `page.hasMore` と `nextCursor`（`--limit` は 100 まで）でページを分ける。
	`worktree list`、`worktree ps`、`terminal list` はカーソルを持たず、`--limit` と `truncated`、`totalCount` を返す。
	"""

includes: [
	"`GET /api/state`：repo、worktree、エージェント、オーケストレーション（Run、Task、担当）の正規化した JSON",
	"モデルと推論レベルの、値の意味と取得元",
	"各項目の取得元と欠けた理由、取得元ごとの鮮度と誤り、接続の状態",
	"共有のポーリング（要求をまとめ、見る人がいなければ遅くする）と、取得元ごとの最後に読めた値",
	"`GET /api/fields`（取れる項目の一覧と選んだ項目）、`PUT /api/settings/fields`（選択の保存）",
	"SpecDock の正確なオリジンへの、読み取りの CORS（オリジンは設定で変えられる）",
	"選んだ項目だけを表示する、簡単な状態の画面（`web/`）",
	"AGENTS.md の古い一文（iss-00005 の FQG-003）を今の形に合わせる",
]

excludes: [
	"開く口（`/api/open`）、書き込みの守りの土台（短期のトークン、Host の完全一致の一般の仕組み）、ボタンの部品（iss-00007）",
	"launchd での常駐と、待ち受けのアドレス（127.0.0.1 と Tailscale の IP）の設定（iss-00008）",
	"会話のログと送信（epic-00004）。この Issue は `nativeChat.readSession` を呼ばない",
	"構造化 Chat のタブのモデルと推論（`agentSession.options`）。この Issue では確かめず、取れないと返す",
	"WebSocket（ペアリング）での購読。状態はポーリングで読む",
	"Scope と worktree の対応の決定（SpecDock が決める）",
	"サーバーの再起動をまたいだ、最後に読めた状態の保存（再起動の後は、最初の取得まで空で返す）",
]

requirements: {
	"R-01": {
		title: "`GET /api/state` が、repo・worktree・エージェント・オーケストレーションの状態を、正規化した JSON で返す"
		text: """
			- repo：識別子、表示名、パス、remote の鍵（`github.com/<owner>/<name>` の形）。
			- worktree：識別子、repo の識別子、パス、ブランチ、表示名、main か、アーカイブか、親子の worktree、状態、最後に動いた時刻、最後の出力の時刻、PR（番号、状態、題名、URL）と CI（状態と件数）。
			- エージェント：種類（Claude Code、Codex など）、置き場（端末のタブ、構造化 Chat のタブ、タブのない行）、状態、状態の開始時刻、最後の出力の時刻、題名、
			  親のエージェント（parentPaneKey）、端末（つながっている、復元待ち）、担当なら Dispatch・Task・Run の識別子。
			- オーケストレーション：Run（識別子、題名）、Task（識別子、Run、親、依存、題名、状態、作った時刻、終えた時刻）、担当（Dispatch、Task、Run、状態、生きているか、端末の handle、worktree）。
			- 時刻は ISO 8601 の UTC の文字列にそろえる。
			- 各項目は、値、取得元、欠けた理由を持つ。鮮度は、取得元ごとの取得の時刻、最後に成功した時刻、古いか、誤りで返す。
			- ページングは最後まで読む。カーソルのない一覧は、`truncated` なら上限を上げて読み直し、それでも切れたら取得元に「切れた」と示す。
			- プロンプト、ツールの入力、最後の応答の本文、Task の spec と result、会話の本文、端末の画面、authToken、transcript のパスは返さない。
			"""
		acceptance: [
			"録画した Orca の応答（CLI と RPC）から、期待する正規化した JSON が得られる（テストで全体を比べる）",
			"録画にプロンプト、ツールの入力、最後の応答、Task の spec と result が入っていても、`/api/state` の応答の文字列に現れない",
			"`run-list` と `worker-list` の2ページ目以降の項目が応答に入り、`truncated` の一覧は上限を上げて読み直される",
			"この Mac の実機で、動いている Claude Code（とあれば Codex）とオーケストレーションの担当が返る（report.md に件数で書く）",
		]
	}
	"R-02": {
		title: "モデルと推論レベルを、値の意味と取得元を付けて返し、取れないときは null と欠けた理由で返す"
		text: """
			値の意味は、起動の要求（`launch-requested`）、起動時の解決（`launch-resolved`）、現在の選択（`current-selection`）、最後の観測（`last-observed`）の4つ。
			取得元：担当の `worker-show` の `startOptions.launch.requested` と `effective`、タブの `agentStatus.model`（最後の観測）、
			タブの `agentStatus.providerSession.effort`（Claude Code の現在の選択）。読めた値はすべて `readings` に並べ、先頭を代表の値にする（現在の選択、最後の観測、起動時の解決、起動の要求の順）。
			別の項目、ほかのエージェントの値、設定の既定値から値を作らない。
			"""
		acceptance: [
			"担当のエージェントで、モデルと推論が `launch-resolved` と `launch-requested` の意味と `worker-show` の取得元つきで返る",
			"Claude Code のふつうのエージェントで、推論が `current-selection` で返り、モデルは null と欠けた理由（Orca が報告しない）で返る",
			"Codex のふつうのエージェントで、モデルと推論の両方が null と欠けた理由で返る",
		]
	}
	"R-03": {
		title: "利用者が表示する項目を選べ、選択が再起動の後も残り、状態の画面は選んだ項目だけを表示する"
		text: """
			`GET /api/fields` は、取れる項目の一覧（識別子、対象、名前、説明、既定で選ぶか）と、いま選んでいる項目を返す。
			`PUT /api/settings/fields` は、選んだ項目の識別子の一覧を受けて、この Mac の利用者の設定のファイルに保存する。
			知らない識別子は拒む。書き込みは同じオリジンからだけ受け、iss-00007 の書き込みの守りと衝突しない小さな形にする。
			"""
		acceptance: [
			"`PUT /api/settings/fields` で選ぶと、`GET /api/fields` の選択が変わり、サーバーを作り直しても（同じ設定のファイルで）残る",
			"知らない識別子、JSON でない本文、別のオリジンからの書き込みは 4xx で拒まれ、設定のファイルは変わらない",
			"状態の画面が、選んだ項目の列だけを表示する（表示の組み立てのテストと、実機のブラウザーで確かめる）",
		]
	}
	"R-04": {
		title: "SpecDock が worktree を Scope に結び付けられ、SpecDock の正確なオリジンからだけ状態を読める"
		text: """
			worktree ごとに、パス、ブランチ、識別子、repo の remote の鍵を返す。
			`/api/state` と `/api/fields` の GET に、許したオリジン（既定は `http://127.0.0.1:47800`。環境変数で Tailscale のアドレスの `:47800` などを足せる）
			と完全に一致する Origin のときだけ `Access-Control-Allow-Origin` にそのオリジンを返す。ほかのオリジンの Origin つきの要求は 403 で拒む。
			Origin のない要求（同じオリジンの GET、curl）は通す。
			"""
		acceptance: [
			"許したオリジンの Origin で `Access-Control-Allow-Origin` がそのオリジンになり、`Vary: Origin` が付く",
			"許していないオリジン（ポートやスキームだけが違うものを含む）の Origin では 403 になり、状態を返さない",
			"許すオリジンを環境変数で変えられる",
		]
	}
	"R-05": {
		title: "状態はサーバーの中の共有のポーリングで読み、要求の数に比例して Orca を呼ばない"
		text: """
			取得元ごとに間隔を持つ（タブ・worktree ps・端末は 5秒、オーケストレーションは 10秒、repo と worktree list は 60秒）。
			最後の `/api/state` の要求から 60秒を過ぎたら、見る人がいないとみなし、間隔を遅くする（30秒と 120秒）。要求が来たら、すぐ元に戻す。
			同時の要求は同じ取得を待ち、取得の途中に同じ取得を重ねない。担当の `worker-show` の起動時の値は Dispatch ごとに覚え、同じ Dispatch を呼び直さない。
			"""
		acceptance: [
			"`/api/state` を続けて何回呼んでも、間隔の中では Orca の呼び出しが増えない（テストで呼び出しを数える）",
			"見る人がいないときに間隔が遅くなり、要求が来ると元に戻る（偽の時計で確かめる）",
			"同じ Dispatch の `worker-show` は1回しか呼ばない",
		]
	}
}

failures: {
	"F-01": {
		title: "Orca が動いていない、つながらないときは、「接続できない」と最後に読めた状態を鮮度つきで返し、API と画面を止めない"
		text: """
			`/api/state` は 200 で、`connection.state` を `unreachable`（理由つき）にし、取得元ごとに最後に成功した値と時刻を返し、`stale` を真にする。
			一度も読めていなければ、空の一覧と理由を返す。画面は「接続できない」と最後の時刻を示し、ポーリングを続ける。
			"""
	}
	"F-02": {
		title: "一部の取得元だけが失敗したとき（時間切れ、形の違い、機能の欠け）は、その取得元の前の値を古いと示して使い、ほかの取得元は新しい値で返す"
		text: """
			取得元の誤りは種類（時間切れ、Orca の誤り、形の違い、機能が使えない）と短い文で返し、authToken や本文を含めない。
			`readTabs` が使えないときは、タブからの項目を欠けた理由つきで返し、worktree ps のエージェントで続ける。
			"""
	}
	"F-03": {
		title: "設定のファイルが壊れている、読めない、書けないときは、既定の選択で動き、保存の失敗を誤りとして返し、サーバーは落ちない"
	}
}

constraints: [
	"Orca には読む要求だけを送る（`ReadOnlyOrcaCli` と `ReadOnlyRpc` だけを使う）",
	"Orca の authToken とペアリングのコードを、応答、記録、URL、画面、ログ、録画に出さない",
	"表示する題名は信頼しないデータとして扱い、画面では文字として描く（HTML として解かない）",
	"テストの録画は、手で書いた仮名の値だけにする。利用者の私的なプロンプトの文、実機の録画をコミットしない",
	"実行時の依存を足さない",
]

decisions: [
	"2026-11-06 鮮度は項目ごとではなく取得元ごとに持ち、各項目は取得元の名前で指す（同じ取得元の項目は同じ時刻に読むため。JSON を小さくする）",
	"2026-11-06 シェルかエージェントか分からない端末（agentStatus も launchAgent もないタブ）は、エージェントに入れない",
	"2026-11-06 `pending-handle` のタブは「端末なし（復元待ち）」と示し、スリープと断定しない",
	"2026-11-06 担当の `worker-show` は、終わっていない担当と、端末を持ち続けている担当だけを呼ぶ（終わって端末を返した担当のモデルは、呼ばずに「読まない」と示す）",
]
