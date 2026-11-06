package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "読むだけ。誤りは表示で分かる。ただし別の会話を混ぜないことは要る"
}

purpose: """
	利用者が、Orca で動くエージェント（Claude Code、Codex、構造化 Chat）の会話のログを、orca-web のチャットの小窓で読めるようにする。
	会話のログの API（ページの読み取りと、変化を受ける口）と、`/embed/chat?agent=…` の画面の描画を作る。送信は作らない（iss-00013）。
	"""

background: """
	親の epic-00004 の切り分け（slices の iss-00012）を受け、epic-00004 の R-01 と F-05、D-01 を具体にする。D-05 のうち、小窓の画面の描画はこの Issue が持ち、
	iframe の埋め込みと受け入れは iss-00014 が持つ（epic-00004 の仕様のレビュー round 1 の P2）。
	iss-00005 の実機の確かめで、`nativeChat.readSession` は Claude 9 件と Codex 1 件のすべてで読めた。Orca のソースは、この Mac の版のタグ v1.4.251 を根拠にする。
	"""

includes: [
	"Orca が持つ会話の記録（通常の端末のエージェントは `nativeChat.readSession`、構造化 Chat は `agentSession.history`）を、エージェントの ID から読むアダプター",
	"会話の正規化（`orca-web.transcript/v1`）、`GET /api/transcript`（とページング）、変化を受ける口 `GET /api/transcript/events`（SSE）",
	"チャットの小窓 `/embed/chat?agent=…` の画面（読むだけ）と、状態の画面からの開き方",
	"この Mac の Orca での読むだけの実機の確かめと、report.md への記録",
]

excludes: [
	"送信、送る意図と確かめ、送信の記録（iss-00013）",
	"SpecDock の別のオリジンへの iframe の埋め込みの受け入れ、postMessage（iss-00014）。frame-ancestors は既存の画面と同じ扱いにとどめる",
	"ペアリングした WebSocket での購読（init-00002 の対象外）",
	"端末の画面（scrollback）からの会話の組み立て",
	"オーケストレーションの担当の `worker-read`",
]

requirements: {
	"R-01": {
		title: "利用者（と小窓）が、エージェントの ID で、その会話のログを正規化した形で読める"
		text: """
			`GET /api/transcript?agent=<状態の API のエージェントの id>` が、Orca が今そのエージェントに結んでいるセッションの会話の末尾を返す。
			`limit` で件数を選べ、`before`（前の応答が返した位置）と `session`（前の応答のセッションの鍵）で、より古いページを読める。
			各件は、役割（user、assistant、tool）、時刻、本文、ツールの呼び出しと結果、未対応の部分の印を持つ。
			思考（reasoning）は、印も付けずに出さない。並びは Orca の画面と同じ（Orca が返す順のまま）にする。
			セッションの識別子と記録のパスは Orca が持つものを使い、ファイルの名前から作らない。記録のパスと Orca の誤りの文は応答に出さない。
			"""
		acceptance: [
			"録画した会話の記録から、本文、折り畳むツールの呼び出しと結果、未対応の部分の印（画像、未知のブロック）が返り、思考の件が返らない",
			"`before` と `session` で、前のページと重ならない、より古いページが返る",
			"応答に、記録のパス、authToken、Orca の誤りの文が含まれない",
		]
	}
	"R-02": {
		title: "小窓が、会話の変化を、追記と置き換えに分けて受けられる"
		text: """
			`GET /api/transcript/events?agent=…`（Server-Sent Events）が、最初に今の窓（snapshot）を送り、その後は、末尾に足された件だけ（appended）か、
			窓の全体の置き換え（replacement。記録の書き換え、巻き戻し、別のセッションへの切り替え、読めない状態からの回復）を送る。
			読めなくなったら unavailable を送る。同じエージェントを見る小窓は、サーバーの1つの読みを共有し、見る人がいなくなったら読みを止める。
			"""
		acceptance: [
			"録画の再生で、件が足されると appended だけが届き、記録が書き換わると replacement が届き、古い表示の件が残らない",
			"同じエージェントの2つの購読が、Orca への読みを共有し、最後の購読が閉じると読みが止まる",
			"同時に見るエージェントの数と購読の数に上限があり、超えると理由を示して断る",
		]
	}
	"R-03": {
		title: "利用者が、チャットの小窓で、会話をチャットの形で読める"
		text: """
			`/embed/chat?agent=…` の画面が、指示と返答の本文を吹き出しで並べ、ツールの呼び出しと結果を折り畳んで示し、未対応の部分は「表示できない」と示す。
			本文は textContent で描き、HTML として解釈しない。前のページを読む操作がある。幅 390px で横にはみ出さずに読める。
			エージェントの種類、題名、セッションの短い識別子を見出しに示す。
			"""
		acceptance: [
			"録画した会話を描くと、本文の吹き出しと折り畳んだツールが出て、思考が出ない（画面の組み立ての純粋な関数のテスト）",
			"`<script>` や `<img onerror>` を含む本文が、文字のまま描かれ、要素にならない",
			"実機で、幅 390px の表示で横にはみ出さずに読める",
		]
	}
	"R-04": {
		title: "利用者が、状態の画面からエージェントを選び、チャットの小窓を開ける"
		text:  "状態の画面のエージェントの表に、会話を読める種類（端末のタブ、構造化 Chat のタブ）の行ごとに、小窓を開くリンクを置く。"
		acceptance: ["エージェントの表の端末のタブと構造化 Chat のタブの行に小窓へのリンクがあり、タブのない行にはない"]
	}
	"R-05": {
		title: "この Mac の Orca で、Claude Code と Codex の会話を、Orca の画面と同じ順で読めることが確かめられている"
		text: """
			読むだけの実機の確かめで、Claude Code と Codex の会話を API と小窓で読み、並びが Orca の画面と同じ（Orca の画面と同じ読み方で、Orca が返す順のまま）であることと、
			購読の口（`nativeChat.subscribe`）が Unix ソケットで使えないことを確かめ、件数と結論だけを report.md に書く。会話の中身は、録画、report.md、ログに写さない。
			"""
		acceptance: ["report.md に、Orca の版、読めた会話の数（Claude と Codex）、並びの確かめ、購読の口の確かめの結論が、件数だけで書かれている"]
	}
}

failures: {
	"F-01": {
		title: "会話の記録が読めないとき、空の会話ではなく「読めない」と理由を示す"
		text: """
			エージェントが見つからない、Orca がそのエージェントにセッションを結んでいない（スリープ中、まだ指示を受けていない）、記録のファイルがまだない、
			機能が使えない、Orca に届かない、読みが失敗した、知らない形の応答、のそれぞれを、区別できる誤りの code で返し、小窓は「読めない」と理由を示す。
			空の会話（0件）を示すのは、Orca が読めたうえで0件を返したときだけにする。
			"""
		impact:   "利用者が、読めないのを会話がないと取り違え、状態を誤って判断する"
		recovery: "理由を示し、Orca の画面で確かめるよう促す。読めるようになったら、小窓は全体を置き換えて描き直す"
	}
	"F-02": {
		title: "別の会話を混ぜない"
		text: """
			窓と差分は、エージェントの種類とセッションの識別子の組（セッションの鍵）ごとに持つ。同じ枠でセッションが変わったら、追記ではなく置き換えを送る。
			古いページの読みは、要求のセッションの鍵が今のセッションと違えば、読まずに断る（409）。小窓は、置き換えを受けたら、それまでの件（前のページを含む）をすべて捨てる。
			"""
		impact:   "別の会話の件が混ざり、利用者が誤った前提で判断や指示をする"
		recovery: "置き換えで描き直す。混ざった表示が見つかったら、小窓を開き直す"
	}
	"F-03": {
		title: "会話の本文とツールの出力を、信頼しないデータとして描く"
		text:  "本文、ツールの名前、入力、出力は textContent でだけ描く。小窓の画面は inline の script と style を許さない CSP で配る。会話の API は同じオリジンからだけ読ませ、読み取りの CORS を付けない。"
		impact:   "本文に紛れた HTML やスクリプトが動き、小窓の権限で操作が行われる"
		recovery: "描き方を直して配り直す"
	}
}

constraints: [
	"Orca には読む要求だけを送る（`session.tabs.listAll`、`nativeChat.readSession`、`agentSession.history`）。送信と開く口は呼ばない",
	"Orca の authToken、会話の記録のパス（家のディレクトリを含む）を、応答、画面、ログ、録画に出さない",
	"録画の fixture は、自分で作った仮の会話にする",
	"実行時の依存を足さない",
]

decisions: [
	"2026-11-06 小窓の画面の描画はこの Issue が持つ。iss-00014 は埋め込みと受け入れだけ（epic-00004 の仕様のレビュー round 1 の P2）",
	"2026-11-06 思考は印も付けずに出さない。「表示できない」の印は、未対応の部分（画像、未知のブロック、system の件など）だけに付ける（同 P3）",
	"2026-11-06 Orca 1.4.251 の Unix ソケットは streaming の method（`nativeChat.subscribe`、`agentSession.subscribe`）を `method_not_supported` で拒む（ソースの runtime-rpc-request-admission.ts と rpc-request-admission-prologue.ts）。購読はペアリングした WebSocket だけで、ペアリングは init-00002 の対象外。そこで、サーバーが `nativeChat.readSession`／`agentSession.history` の末尾を短い間隔で読み直し、前の窓との差から追記と置き換えを作って SSE で配る。epic-00004 D-01 の「サーバーが subscribe を購読する」は、この形で満たす",
	"2026-11-06 `nativeChat.readSession` に、Orca の画面と同じ `capabilities: { transcriptSourceOrder: 1 }` を渡し、Orca が返す順のまま並べる（時刻で並べ替えない）",
	"2026-11-06 会話の API は同じオリジンだけ（小窓は orca-web のオリジンの iframe の中から読む）。状態の API と違い、SpecDock のオリジンに読み取りの CORS を許さない",
	"2026-11-06 構造化 Chat の turn、agent-start、agent-handoff の件は会話の本文ではないので出さない。approval、question、status、diff は「表示できない」の印にする",
]
