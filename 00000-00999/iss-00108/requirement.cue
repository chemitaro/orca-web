package spec

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "Orca に送る操作は既存の session.tabs.activate（navigation は host・clients）のまま、選ぶタブだけを変える。新しい書き込みの経路を足さない。PR を戻せば元に戻る"
}

purpose: "「Orca で開く」で、構造化 Chat の会話（頂点・エージェント）を押したとき、ホストでもクライアントでも、その会話のタブを開く。"

background: """
	利用者の依頼（2026-11-26、会話）：ホストの Orca に Orca で接続しているクライアントの PC から orca-web の「Orca で開く」を押すと、JavaScript のエラーで止まる。クライアントでも Orca アプリを開き、接続している該当の会話を開きたい。ホストなら自分の Orca を開く。原因を調べ、直し、クライアント側に要る環境があれば述べる。
	タスク担当の調べ（2026-11-26、クライアントの Chrome から常駐の orca-web へ、このリポジトリの worktree の構造化 Chat の頂点で）：
	- `/api/open` は 200・ok・device `client`・route `tab-activate` で、押した端末をクライアントと正しく見分け、`navigation: "clients"` で送れている（232ms）。ホストの Orca のランタイムの websocket に、クライアント（tailnet のアドレス）からの確立した接続がある。
	- しかし `requestedAgentFound: false`・reason `last-tab`：頼んだ会話のタブを選べず、その worktree の最後のタブを開いた。原因は `src/orca/open-target.ts` の `chooseTarget` が、端末のタブを paneKey で探すことしかしないこと。構造化 Chat のエージェントの id は `chat:<タブの id>`（`src/state/normalize.ts`）で、タブの種類は `agent-session`。ホストでも同じく当たらない。
	- `/embed/agent` の見出しの開く先は、構造化 Chat では worktree だけを送る（`web/embed/agent-view.js`）。
	- 押した後、ブラウザは `orca://` へ移って押した端末の Orca を前に出す（`raiseThisDevice`）。Orca 1.4.277 は `orca://` を登録しており、中身のない `orca://` は deep link として扱わず、アプリを前に出すだけ（同梱のコードの open-url の扱いで確かめた）。利用者の言う JavaScript のエラーの画面そのものは、この調べでは再現できていない（エラーの文・どのアプリが出したかを利用者に確かめる）。
	"""

includes: ["`chooseTarget` で `chat:<タブの id>` の構造化 Chat のタブを選ぶ", "`/embed/agent` の見出しの開く先に、構造化 Chat のエージェントの id を付ける"]
excludes: ["Orca に送る操作の種類・navigation の値の変更", "押した端末の見分け（open-device.ts）", "`orca://` で前に出す処理の変更（JavaScript のエラーの文が分かってから別に扱う）"]

requirements: {
	"R-01": {
		title: "構造化 Chat の会話のタブを選ぶ"
		text:  "開く要求の agent が `chat:<T>` の形のとき、`session.tabs.list` の中で、種類が端末でなく id が T のタブを選び、`session.tabs.activate`（tabId T、leafId なし）で開く。理由は requested-agent、requestedAgentFound は真。当たらなければ今のとおり（最後のエージェント、最後のタブ…）で、requestedAgentFound は偽。端末の paneKey の要求は今のまま。navigation はホストなら host、クライアントなら clients（今のまま）。"
		acceptance: [
			"agent が `chat:agent-session:x` で、一覧に type `agent-session`・id `agent-session:x` のタブがあると、route tab-activate・tabId `agent-session:x`・reason requested-agent・requestedAgentFound 真",
			"一覧に当たるタブがなければ今の選び方で、requestedAgentFound 偽",
			"`chat:` の id が端末のタブの id と同じでも、端末のタブは選ばない",
		]
	}
	"R-02": {
		title: "埋め込みの見出しも会話を指す"
		text:  "`/embed/agent` の見出しの「Orca で開く」は、構造化 Chat のエージェントでは `{worktree, agent: <エージェントの id（chat:…）>}` を送る。端末は今のとおり paneKey、ほかは worktree だけ。"
		acceptance: ["buildDetail の open が、chat-tab では agent に `chat:` の id を持つ"]
	}
}

constraints: ["AGENTS.md：タブやファイルを作る操作を送る経路を足さない。開く口の実機の確かめはこのリポジトリの worktree だけ"]
decisions: [
	"クライアントでも、接続している Orca で該当の会話を開く（利用者、2026-11-26、会話）",
	"JavaScript のエラーの画面は再現できず、利用者にエラーの文と出したアプリを確かめる。この Issue では、確かに見つかった『会話のタブを選べない』原因を直す（タスク担当、2026-11-26）",
	"コーディングは Opus 5.5 で行う（利用者、2026-11-26、会話）",
]
