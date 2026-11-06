package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "既存のタブを選ぶだけで、誤りは Orca の画面で戻せる。偽の要求の拒否は要る"
}

purpose: "SpecDock のダッシュボード（別のオリジン）に置いた「Orca で開く」のボタンから、この Mac の Orca の既存のタブを前面に出せるようにする。偽の要求（別のオリジン、許していない Host、トークンのない要求）は Orca に届かせない。"

background: """
	親の epic-00003 の slice（R-04、R-05、F-03、F-04）。土台（CLI と RPC の境界、機能の確かめ、録画と再生）は iss-00005 で作った。
	iss-00005 の実機の確かめで、端末は handle で結ぶこと（`terminal list` の tabId と leafId は 14件で仮の値）、スリープ中のタブは `pending-handle` で handle と agentStatus を持たないこと、
	エージェントの paneKey（`<parentTabId>:<leafId>`）は agentStatus と `worktree ps` で一致することが分かった。
	SpecDock のダッシュボードのオリジンは `http://127.0.0.1:47800` と Tailscale のアドレスの `:47800`（設定で変えられる）。
	"""

includes: [
	"書き込みの守り（Host の完全一致、POST と JSON、同じオリジンから得る短期のトークンの独自ヘッダー、Origin の完全一致、frame-ancestors、127.0.0.1 と指定の Tailscale の IP だけでの待ち受け）",
	"`POST /api/open`（既存のタブだけを選んで前面に出す）",
	"単独のボタンの部品（`/embed/open-button?worktree=…` の iframe の画面と、それを置く1行のスクリプト）",
	"実機の確かめの道具（orca-web のリポジトリの worktree だけを対象に、押す前と後のタブの集合を比べる）",
	"iss-00005 の最終品質ゲートの P3：FQG-001（RPC の `_meta.runtimeId` の食い違いのテスト）と FQG-002（keepalive が時間切れを延ばすテスト）",
]

excludes: [
	"状態の API（`/api/state`、`/api/fields`）と読み取りの CORS（iss-00006）",
	"launchd での常駐と、Mac とスマホでの実機の受け入れ（iss-00008）",
	"会話のログと送信（epic-00004）",
	"SpecDock 側の画面にボタンを置く変更（spec-dock の epic-00471）",
]

requirements: {
	"R-01": {
		title: "開く口が、指定の worktree の既存のタブを選んで、この Mac の Orca の前面に出す"
		text: """
			`POST /api/open` が `{ worktree, agent? }` を受ける。`worktree` は Orca の worktree の ID かパスで、最新の `orca worktree list` の1行に完全一致で解決する。`agent` はエージェントの paneKey（`<parentTabId>:<leafId>`）。
			最新の `session.tabs.list` から、次の順で1つのタブを選ぶ。

			1. `agent` があり、その paneKey の端末のタブがあれば、それ。
			2. agentStatus を持つ端末のタブ（エージェントと確かめられたタブ）のうち、`agentStatus.updatedAt` が最も新しいもの（最後に動いたエージェント）。
			3. worktree の中で最後に見ていたタブ（`isActive`、なければ `activeTabId`）。
			4. どれもなければ worktree だけ。

			選んだ先が、handle を持つ動いている端末なら CLI の `orca terminal switch --terminal <handle>`、ほかのタブ（スリープ中の端末、ファイル、ブラウザーなど）なら RPC の `session.tabs.activate`（`navigation: "host"`、`intent: "user"`）、
			worktree だけなら RPC の `worktree.activate`（`navigation: "host"`）を使う。スリープ中のエージェントは、Orca の通常の動きとして復元してよい（利用者の判断）。
			応答は、使った経路（`terminal-switch`、`tab-activate`、`worktree-activate`）と、選んだ理由（`requested-agent`、`last-agent`、`last-tab`、`worktree-only`）と、指定の `agent` が見つかったかを返す。
			"""
		acceptance: [
			"録画の再生で、指定のエージェント、最後に動いたエージェント、最後に見ていたタブ、スリープ中の端末、タブのない worktree のそれぞれで、期待する経路と引数（handle、tabId と leafId、`navigation: \"host\"`）で1回だけ呼ぶ",
			"この Mac の実機で、orca-web のリポジトリの worktree に対して開く口を呼ぶと Orca の前面がその worktree のタブに切り替わり、押す前と後のタブの集合が同じである",
		]
	}
	"R-02": {
		title: "開く口は、新しいタブやファイルを作る経路を持たない"
		text: """
			開く口が Orca に送れるのは、読む CLI と RPC（iss-00005 の一覧）に加えて、CLI の `terminal switch` と、RPC の `session.tabs.activate` と `worktree.activate`（どちらも `navigation: "host"` だけ）だけにする。
			`terminal create`、`file open`、`worktree create`、`session.tabs.create` などを呼ぶ経路をコードに持たず、門（gate）が一覧にない操作を送らずに拒む。失敗したときに、代わりに新しいタブを作る経路もない。
			"""
		acceptance: [
			"門が、一覧にない CLI のコマンドと RPC、`navigation` が host でない activate を送らずに拒む",
			"どの失敗の録画でも、開く口が送った書き込みは多くて1回で、新しいタブを作る操作を送らない",
		]
	}
	"R-03": {
		title: "「Orca で開く」のボタンを、単独で別のオリジンの画面に置ける"
		text: """
			`GET /embed/open-button?worktree=…&agent=…&theme=…&size=…` が、ボタンだけの小さな画面を返す。状態の画面やチャットを読み込まない。
			SpecDock の画面には1行のスクリプト（`<script src="<orca-web>/embed/open-button.js" data-worktree="…"></script>`）を置き、スクリプトが自分の位置に iframe を差し込む。
			親の画面の幅が 390px 以下のときは、iframe を出さない（読み込まない）。`theme`（light、dark、なければ親の色の明暗に従う）と `size`（sm、md）で、置き場の見た目に合わせる。
			押すと、iframe の中で同じオリジンから得た短期のトークンで開く口を呼び、結果（開いた、開いたか確かめられない、失敗とその理由）を短い文で示す。
			"""
		acceptance: [
			"別のオリジンの試しの画面にスクリプトの1行だけを置くと、ボタンが出て、押すと開く口が呼ばれる",
			"親の画面の幅が 390px のときはボタンが出ず、広げると出る",
			"ボタンの画面の応答が、frame-ancestors に SpecDock のオリジンだけを持つ",
		]
	}
	"R-04": {
		title: "書き込みは、許した Host、同じオリジン、短期のトークンの要求だけを受ける"
		text: """
			- 待ち受けは 127.0.0.1 と、設定した Tailscale の IP だけ（0.0.0.0 に代えない）。
			- すべての要求で、Host を、待ち受けのアドレスとポートの組（`127.0.0.1:<port>`、`<Tailscale の IP>:<port>`）との完全一致で確かめる。
			- 書き込み（`/api/open`）は、POST、`Content-Type: application/json`、4 KiB 以下の JSON の物、`Origin` が要求の Host の orca-web 自身のオリジン（`http://<Host>`）と完全一致、`Sec-Fetch-Site` があれば `same-origin`、独自ヘッダー `X-Orca-Web-Token` の有効なトークンを要する。
			- トークンは `POST /api/token`（同じ Host、Origin、Sec-Fetch-Site、JSON の確かめを通った要求だけ）が出す。256 ビットの乱数、有効は 10 分、メモリーにだけ持つ。CORS の許可を付けない。URL、ログ、親の画面に出さない。
			- ボタンの画面は、`Content-Security-Policy` の `frame-ancestors` に、設定した SpecDock のオリジン（既定は `http://127.0.0.1:47800` と `http://<Tailscale の IP>:47800`）だけを持つ。
			"""
		acceptance: [
			"HTTP のテストで、守りのそれぞれを1つずつ外した要求が拒まれ、開く処理が呼ばれない",
			"そろった要求だけが開く処理に届く",
		]
	}
	"R-05": {
		title: "iss-00005 の RPC の確かめの抜け（FQG-001、FQG-002）をテストで埋める"
		text:  "`session.tabs.listAll` の `_meta.runtimeId` が `orca status` と食い違うと書き込みの機能が使えないこと、keepalive の行が時間切れを延ばすことを、テストで確かめる。"
		acceptance: ["2つのテストが `npm test` で通る"]
	}
}

failures: {
	"F-01": {
		title: "書き込みを送った後の時間切れや結果不明では、別のタブへ切り替えず「開いたか確かめられない」と返す"
		text: """
			`terminal switch` の時間切れ、RPC の時間切れ、接続断、不正な応答では、その1回の後に Orca へ書き込みを送らず、HTTP 504 と `unconfirmed` を返す。
			Orca の読む口には「前面の worktree」を示す値がないので、時間切れの後に開いたかを読み直して確かめることはしない。
			"""
		impact:   "利用者は、Orca の画面を見て開いたかを確かめる"
		recovery: "もう一度押す"
	}
	"F-02": {
		title: "必要な機能が確かめられないときは、何もせずに理由を返す"
		text: """
			機能の確かめ（`openExistingTab`）が使えない（Orca につながらない、runtime の ID の食い違い、capability やコマンドの欠け）、
			`worktree list` が途中で切れている、`session.tabs.list` の形が未知、`session.tabs.list` の runtime の ID が確かめのときと違う、
			activate が `method_not_found` を返す、のどれかでは、書き込みを送らずに（`method_not_found` は送った1回の後に）理由つきで返す。
			"""
		impact:   "ボタンを押しても開かない"
		recovery: "Orca を起動し直すか、Orca の版に合わせて orca-web を直す"
	}
	"F-03": {
		title: "別のオリジン、許していない Host、トークンのない要求、JSON でない要求、GET の書き込みを拒む"
		text:  "拒んだ要求では、Orca に何も送らない。応答に Orca の authToken とトークンの値を出さない。"
	}
	"F-04": {
		title: "指定の worktree が見つからない、または指定のタブが消えていたときは、何もせずに理由を返す"
		text:  "worktree が一覧にない、2つ以上に当たるときは 404 で何も送らない。activate が `tab_not_found` を返したら、ほかのタブへ切り替えず 409 を返す。"
	}
	"F-05": {
		title: "開く要求が重なったときは、後の要求を断る"
		text:  "1つの開く処理が終わるまで、ほかの開く要求は 409 `busy` で断り、Orca に送らない。"
	}
}

constraints: [
	"Orca の authToken、ペアリングのコード、orca-web のトークンを、記録、URL、画面、ログ、録画に出さない",
	"実機の確かめは orca-web のリポジトリの worktree（作業の worktree と main のチェックアウト）だけを対象にし、ほかのリポジトリのタブを前面に出さない",
	"実行時の依存を足さない",
	"状態の API（`/api/state`、`/api/fields`）は作らない（iss-00006）。サーバーの組み立てを変えるときは小さくする",
]

decisions: [
	"エージェントの識別子は paneKey（`<parentTabId>:<leafId>`）にする。iss-00005 で agentStatus と `worktree ps` の両方で一致した。端末の handle は変わりうるので、入力には使わない。iss-00006 の状態の API は paneKey を返す前提にする",
	"指定の `agent` が最新の一覧にないと確かめられたときは、2 以降の順で選び、応答の `requestedAgentFound: false` で知らせる",
	"エージェントかどうか分からないタブ（agentStatus のない端末）は、エージェントと見なさない。最後に見ていたタブとしては選びうる",
	"トークンは1回ごとに使い捨てにせず、有効の間は何度でも使える（ボタンを何度も押すため）。期限切れの 401 では、iframe がトークンを取り直して1回だけ送り直す（拒まれた要求は Orca に届いていないので安全）",
	"開いたかの確かめは「送った書き込みが成功を返したか」で判断する。前面を読む口がないため",
]

questions: [
	"タブのない worktree で `worktree.activate` を呼ぶと、Orca の画面は最初の端末を自動で作る（v1.4.251 の `ensureWorktreeHasInitialTerminal`）。サイドバーで worktree を選んだときと同じ通常の動きとして許すか（統括に確かめる）",
]
