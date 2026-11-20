package spec

// 要件（Issue）。型 specdock/v1。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "状態の読み取りに項目を足すだけで、Orca やエージェントへ書き込まない。誤りは表示の誤りにとどまる"
}

purpose: """
	Orca が Antigravity（と Gemini）のエージェントのモデルと推論の深さを出していれば、状態の文書の各エージェントの `model`・`effort` に出す（epic-00065 の R-04）。
	"""

background: """
	実物で確かめた事実（2026-11-20、orca-web main 58275ea、Orca 1.4.263、agy 1.5.12。タスク担当が確かめた）：
	- Antigravity のエージェントは、Orca で構造化 Chat（タブの type `agent-session`、`agent: "antigravity"`）として動く。統括が立てた試しの worker（`--agent antigravity --model gemini-3.8-flash-low --effort low`）と、タスク担当が立てて止めた試しの worker の両方で同じ。
	- そのタブ（`session.tabs.listAll`）の項目は type・id・title・sessionId・agent・isActive・chatStatus（state、mainAgent、updatedAt など）だけで、モデルと推論の深さはない。`agentStatus`・`providerSession` もない。
	- `orca worktree ps` の Antigravity の行にも、モデルと推論の深さの項目はない。
	- worker として起動したものは、`orchestration worker-show --dispatch <id> --full` の `startOptions.launch.requested`・`effective` に `{agent: "antigravity", model: "gemini-3.8-flash-low", effort: "low"}` が出る。
	- `agentSession.history` の利用者の送信（submissions）の `options` に、画面で選んだ推論の深さ（例 `effort: "medium"`）が出ることがある。モデルは出ていない。状態のポーリングは会話の記録を読まない。
	- `agy models` のモデルの id は推論の深さを含む形（`gemini-3.8-flash-low`、`claude-opus-5-5-medium` など）。Antigravity は Gemini のほかに Claude・GPT-OSS のモデルも動かす。
	- Gemini CLI はこの PC に入っていない。Orca の worker-start の説明では、`--model` を受けるのは Claude・Codex・Cursor・Antigravity・Grok・Muse などで、ほかの道具は自分の設定のモデルで動く。
	- 今の orca-web：ポーリング（`poller.ts`）は種類によらず、生きている worker の起動の記録を読む。端末のタブ（terminal-tab）は `agentStatus.model`・`agentStatus.providerSession.effort` と起動の記録から `model`・`effort` を作る。構造化 Chat のタブ（chat-tab）は worker に結ばれていても、`model`・`effort` をいつも『出どころなし』（no-source）にしている（`normalize.ts` の chatTab）。そのため Antigravity の worker のモデルが出ない。
	"""

includes: [
	"worker に結ばれた chat-tab（構造化 Chat）の `model`・`effort` を、その worker の起動の記録から出す（出どころの名前つき）",
	"種類によらない形にする。Antigravity のほか、構造化 Chat の Claude・Codex などの worker にも効く（Epic の R-04 を超える広がり。統括が了承、2026-11-20）",
]

excludes: [
	"端末のタブ（terminal-tab）の読み取りの変更",
	"worker でない chat-tab（利用者が開いた構造化 Chat）のモデルと推論（Orca がタブに出さないので、今どおり出どころなし）",
	"会話の記録（agentSession.history の submissions の options）から推論の深さを読むこと（ポーリングは会話を読まない）",
	"モデルの id を名前（例 Gemini 3.8 Flash）や推論の深さに分けて解くこと（id は Orca の出すまま）",
	"画面（印、送信の欄、チャット）の表示の変更",
]

requirements: {
	"R-01": {
		title: "worker に結ばれた chat-tab の model・effort が、起動の記録から出る"
		text: """
			chat-tab に worker が結ばれ（今の `structuredWorker` のとおり、タブの sessionId の worker の行がちょうど1つ）、その worker の起動の記録があれば、`model`・`effort` に値を出す。
			値の選び方と出どころの名前は、端末のタブの起動の記録の読み取りと同じ（`startOptions.launch.effective.<key>` を launch-resolved、`startOptions.launch.requested.<key>` を launch-requested。effective を優先し、両方を readings に並べる）。
			"""
		acceptance: [
			"起動の記録に effective と requested がある Antigravity の chat-tab で、`model.value` が effective の値、`source` が `workerLaunch`、`field` が `startOptions.launch.effective.model`、`meaning` が `launch-resolved` で、readings に launch-resolved と launch-requested の2つが並ぶ（effort も同じ）",
			"effective がなく requested だけのとき、値は requested の値で `meaning` が `launch-requested`",
			"実物の Orca 1.4.263 の Antigravity の worker（統括の試しの送り先）で、試しの orca-web の `/api/state` の chat-tab に `model: gemini-3.8-flash-low`・`effort: low` が出たことが report.md にある",
		]
	}
	"R-02": {
		title: "値がないときは、欠けた理由を今の形で出す"
		text: """
			worker に結ばれた chat-tab で起動の記録の値がないときは、端末のタブと同じ `launchMissing` の理由（記録はあるが値がない not-provided、settled で読まない not-fetched、読めなかった source-failed）を出す。
			worker のない chat-tab は、今どおり no-source。
			"""
		acceptance: [
			"起動の記録に model・effort がない（Gemini のように Orca がモデルを受けない道具の worker）とき、`missing` が `not-provided`、`source` が `workerLaunch`",
			"終わって端末が放された worker（読まない）では `not-fetched`、起動の記録を読めなかったときは `source-failed`",
			"worker のない Antigravity・Gemini の chat-tab は `missing: no-source`、readings は空",
		]
	}
	"R-03": {
		title: "端末のタブの読み取りは変わらない"
		text:  "端末のタブ（Claude・Codex など）の `model`・`effort` の値、出どころ、欠けた理由は今のまま。"
		acceptance: [
			"今の状態の API のテスト（`test/state/` の端末のタブの model・effort の期待）が、期待を変えずにそのまま通る",
		]
	}
}

failures: {
	"F-01": {
		title: "結べない、または同じセッションの worker が2行以上のときは、値を出さない"
		text:  "chat-tab に worker が結ばれない（今の `structuredWorker` が null）ときは、ほかの worker の起動の記録を推測で使わず、no-source のままにする。"
	}
	"F-02": {
		title: "chat-tab のタブの agentStatus は読まない"
		text:  "Orca 1.4.263 の agent-session のタブには agentStatus がない。仮にあっても chat-tab では読まず、起動の記録だけを出どころにする（出どころの名前が実物と食い違わないように）。"
	}
}

constraints: [
	"Claude・Codex の端末のタブの読み取りは変えない（統括の条件1）",
	"出どころの名前（source、field、meaning）を今の形で残す（統括の条件3）",
	"本人の方針：本人の環境に特化した決まりを入れない、普遍的でシンプルな仕組みにする",
	"Orca には読む要求だけを送る",
]

decisions: [
	"2026-11-20 統括：chat-tab の読み取りに起動の記録（effective を優先、なければ requested）を、種類によらない形で足してよい。構造化 Chat の Claude・Codex の worker にも効くのは本人の方針に合う。条件：端末の Claude・Codex の読み取りと出力を変えない、Claude の chat-tab で providerSession.effort と起動の記録の両方があるときの優先の順を設計に書いてテストする、出どころの名前を今の形で残す、広がりを requirement の範囲と report.md に明記する（Orca の reply、msg_741db28b1e19）",
	"2026-11-20 タスク担当：統括の条件2は、chat-tab ではタブの agentStatus（providerSession.effort を含む）を読まず、起動の記録だけを出どころにする形で満たす（F-02、D-01）。実物の agent-session のタブにその項目がないため",
]
