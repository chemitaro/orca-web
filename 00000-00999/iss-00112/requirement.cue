package spec

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "頂点の一覧の判定の振り分けと CSS の小さな変更。読むだけの画面で、Orca への送信は変えない"
}

purpose: "指揮の画面の「対応が必要」を、人が手を出すべき頂点（親のいない統括）自身の待ちに限り、配下の作業者の質問・待ち・失敗では頂点を対応が必要にしない。3列の板に縦の境界線を引いて列を見分けやすくする。"

background: """
	利用者の指摘（2026-11-27、会話）：指先（yubisaki）の統括の頂点が、また「対応が必要」になっている。配下の作業者の質問は統括が答えるもので、人が答えるものではない。対応が必要は、親のいない頂点に対応が必要なときに限るべき。3列の板は縦の境界線がなく分かりにくい。
	タスク担当の調べ（2026-11-27、読むだけ）：
	- 指先の頂点（構造化 Chat、mark done）の理由は question・members_working・live_work。questions は Dispatch ctx_26f3918c884d（iss-00074 段階1、codex）の ask で answered 偽・working 偽。
	- その Run のやり取り（`orchestration inbox --run … --full`、見出しだけ）：07:32:34Z の質問（宛先は配下の task 担当の Dispatch ctx_9f6b1e88c7c1）の後は Orca の自動の知らせ（Re: Question、8 秒後）だけで、作業者は Blocked と「Worker stopped without reporting」を出して止まった。質問の判定（iss-00098）は事実どおり。対応が必要になったのは、配下の問いを頂点の対応が必要の材料（A3）にしているため。
	- 今の判定（`src/apex/build.ts`）で対応が必要にする理由：A1 apex_blocked・apex_waiting、A2 member_blocked・member_waiting、A3 question・decision、A4 stalled、A5 apex_closed、A6 failed。
	"""

includes: [
	"`src/apex/build.ts` の status の振り分け（対応が必要にする理由の集まり）",
	"`web/style.css` の3列の板の列の間の縦の線",
	"AGENTS.md の判定の説明",
]
excludes: [
	"理由（reasons）の判定と文書の形の変更（今の理由はそのまま出す）",
	"受け箱（`/inbox`）・要約・Run の木の判定",
	"対応のカード・木の印・通知の作り（status が needs_action の頂点だけを数える今の作りのまま）",
]

requirements: {
	"R-01": {
		title: "対応が必要は頂点自身の待ちだけ"
		text: """
			頂点の status を needs_action にする理由は、頂点自身の apex_blocked・apex_waiting と、頂点の端末のタブが閉じたのに仕事が残る apex_closed だけにする。
			配下の待ち（member_blocked・member_waiting）、配下の問い（question・decision）、止まった仕事（stalled）は、配下の仕事が続いているものとして status working にする（統括が扱う）。
			新しい失敗（failed）は status を決めない（ほかの理由で決まる。完了なら札 failed_members が残る）。
			理由（reasons）は今と同じに出す。memo・段（group）・active の扱いは今のまま。
			"""
		acceptance: [
			"頂点が blocked・waiting のとき、また apex_closed のとき status needs_action",
			"頂点が done で、配下に猶予の外の許可待ち・入力待ちがあるとき、status working で reasons に member_blocked・member_waiting がある",
			"頂点が done で、配下の未回答の ask・未解決の gate があるとき、status working で reasons に question・decision がある",
			"stalled だけのとき status working",
			"頂点が done で failed だけのとき status done（段は完了）",
			"counts.needs_action と needs_action の段の数はこの status に従う",
		]
	}
	"R-02": {
		title: "3列の板の列の間に縦の線"
		text:  "幅 900px 以上・頂点を選んでいないときの3列の板で、2列目と3列目の左に縦の線（`var(--line)` の 1px）を引き、線と中身の間に余白を取る。選んだとき（1列）と幅 900px 未満では線を引かない。"
		acceptance: [
			"style.css の 900px 以上の塊に、選んでいないときの `.apex-column + .apex-column` の border-left 1px solid var(--line) と padding-left がある",
			"実物の画面（1280px 程度）で3列の間に縦の線が見え、列の中身が線に重ならない",
		]
	}
}

constraints: [
	"AGENTS.md：実行時の依存を足さない。判定は純粋な関数のまま。",
	"launchd の登録の入れ替え（service:restart）はエージェントがしない（利用者が行う）。",
]
decisions: [
	"対応が必要は親のいない頂点自身の待ちに限る（利用者、2026-11-27、会話）",
	"apex_closed は頂点自身のタブの問題で人が開き直すしかないので対応が必要に残す。stalled は配下の仕事の進みの問題として working、failed は status を決めない（タスク担当、2026-11-27、利用者の方針「配下の対応は人の対応でない」から）",
	"見た目の変更は線1本のため、試作の比べ（coding-task の prototype loop）は省く（タスク担当、2026-11-27）",
]
