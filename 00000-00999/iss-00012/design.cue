package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"Orca の会話の記録を、エージェントの ID から、取り違えずに読む",
	"変化を、追記と置き換えに分けて、別の会話を混ぜずに配る",
	"信頼しない本文を、文字としてだけ描く",
]

current: "状態の API と開く口はある。会話の記録は、実機の確かめの道具が件数を数えるだけで、API も画面もない。"
target:  "`/api/transcript` と `/api/transcript/events` が会話を配り、`/embed/chat?agent=…` の小窓が読むだけのチャットを描く。状態の画面から開ける。"

design: {
	"D-01": {
		title: "会話の取得元のアダプター（`src/orca/read-transcript.ts`）"
		text: """
			`createTranscriptReader(rpc)` が2つの操作を持つ。読む口は `ReadOnlyRpc`（`READ_METHODS` に `agentSession.history` を足す）だけ。

			- `resolve(agentId)`：`session.tabs.listAll` を読み、状態の API のエージェントの id でタブを探す。端末のタブは paneKey（`<parentTabId>:<leafId>`）かタブの id、
			  構造化 Chat のタブは `chat:<タブの id>`。端末のタブは `agentStatus.providerSession` の `id` と `transcriptPath`、エージェントの種類は
			  `agentStatus.agentType`（なければ `launchAgent`）を使う。構造化 Chat は、タブの `sessionId` と `agent` を使う。
			  結果は `TranscriptTarget`（source：`nativeChat` か `agentSession`、エージェントの種類、セッションの識別子、記録のパス、worktree の id、題名）か、
			  `agent_not_found`（タブがない）、`no_session`（セッションの識別子がない）、`unreachable`、`read_failed`、`unknown_shape`。
			- `read(target, { limit, before })`：`nativeChat.readSession`（`agent`、`sessionId`、`transcriptPath`、`limit`、`beforeOffset`、
			  `capabilities: { transcriptSourceOrder: 1 }`）か、`agentSession.history`（`sessionId`、`direction`：`tail` か `before`、`cursor`、`limit`）。
			  Orca が `{ error, notFound }` を返したら `transcript_not_found`（notFound）か `read_failed`。Orca の誤りの文は捨て、code だけを返す。

			セッションの鍵（`session.key`）は、source、エージェントの種類、セッションの識別子から作る sha256 の先頭16桁。短い識別子（`session.short`）はセッションの識別子の先頭8文字。
			記録のパスは `TranscriptTarget` の中だけに持ち、正規化した文書と誤りに出さない。
			"""
		satisfies: ["R-01", "F-01", "F-02"]
	}
	"D-02": {
		title: "会話の正規化（`src/transcript/normalize.ts`、`orca-web.transcript/v1`）"
		text: """
			Orca の件（NativeChatMessage、AgentJournalRenderItem）を、`{ id, role, at, parts }` の件に減らす。`role` は `user`、`assistant`、`tool`。
			`parts` は `text`、`tool-call`（name、input を JSON にした文字）、`tool-result`（output、isError）、`unsupported`（what）。
			ツールの呼び出しと結果は `callId` を持てば残す（画面が組にする）。

			- 思考（role が `reasoning`）は件ごと落とし、印を付けない。
			- `system` の件、`image-ref`、`subagent-group`、`subagent`、`background-task`、知らないブロックは `unsupported` の印にする。
			- 構造化 Chat の `message` は同じ扱い。`tool-call` は呼び出しと（あれば）出力の `head`。`turn`、`agent-start`、`agent-handoff` は出さない。
			  `approval`、`question`、`status`、`diff`、知らない kind は `unsupported`。
			- 本文は 100,000 文字、ツールの入力は 4,000 文字、出力は 8,000 文字で切り、`truncated` を付ける。Orca の `shortened` も `truncated` にする。
			- 並べ替えない。時刻は epoch ms を ISO にし、なければ null。

			文書：`{ schema, ok: true, agent: { id, kind, agentType, worktreeId, title }, session: { key, short, source }, messages, hasMore, before, readAt }`。
			`before` は古いページの位置（`nativeChat` は beforeOffset、`agentSession` は window.oldest のカーソル）を JSON にして base64url にした不透明な文字。
			"""
		satisfies: ["R-01", "F-03"]
	}
	"D-03": {
		title: "窓の差分（`src/transcript/diff.ts`）"
		text: """
			`diffWindow(prev, next)` が、前の窓と今の窓（どちらも正規化した件の並び）を比べ、`none`、`appended`（足された件）、`replacement` のどれかを返す。
			前の窓の最後の件の id を今の窓に探し、見つかった位置までの今の窓の件が、前の窓の末尾と、id と中身（正規化した件の JSON）で1件ずつ一致するときだけ、
			その後ろを appended にする。前の窓が空なら今の窓の全体を appended にする。一致しなければ（書き換え、巻き戻し、窓より多い追記）replacement にする。
			セッションの鍵が違う窓は比べず、呼ぶ側が replacement にする。
			"""
		satisfies: ["R-02", "F-02"]
	}
	"D-04": {
		title: "共有の見張り（`src/transcript/hub.ts`）"
		text: """
			`TranscriptHub` が、エージェントの id ごとに1つの見張り（watch）を持ち、購読者に出来事を配る。

			- 見張りは、1.5秒ごとに末尾（既定 40 件）を読み、5秒ごとにエージェントからセッションを解き直す。読みは重ねない。
			- 最初の成功で snapshot を窓として持つ。後の読みは D-03 で比べ、appended か replacement を配る。セッションの鍵が変わったら replacement（reason `session-changed`）。
			- 読めなければ unavailable（誤りの code）を、code が変わったときだけ配り、窓を捨てる。次に読めたら replacement（reason `recovered`）。
			- 新しい購読者には、持っている窓（snapshot）か unavailable をすぐ送る。
			- 上限：見張り 8、購読者 32。超えたら `busy`。最後の購読者が抜けたら見張りを止めて捨てる。`close()` で、すべての購読を閉じる。
			- 時計と待ちは差し替えられる（テストは `poll()` を直接呼ぶ）。
			"""
		satisfies: ["R-02", "F-01", "F-02"]
	}
	"D-05": {
		title: "会話の HTTP の道（`src/server/app.ts`）"
		text: """
			- `GET /api/transcript?agent=&limit=&before=&session=`：その場で解いて読む。`before` を渡すときは `session` が要り、今の鍵と違えば 409 `session_changed`。
			  誤りの状態：400 `invalid_request`、404 `agent_not_found`・`no_session`・`transcript_not_found`、409 `session_changed`、503 `unavailable`（`readTranscript` の機能が使えない、
			  Orca に届かない）、502 `read_failed`・`unknown_shape`。誤りの本文は `{ ok: false, error, message }`（message は orca-web の決まった文）。
			- `GET /api/transcript/events?agent=`：`text/event-stream`。`retry: 5000`、15秒ごとの注釈の行。出来事は `snapshot`、`appended`、`replacement`、`unavailable`。
			  見張りの上限では、`unavailable`（`busy`）を送って閉じる。
			- どちらも Host を確かめ、Origin があれば同じオリジン（`http://<Host>`）だけを通す（ほかは 403）。CORS を付けない。
			- `/embed/chat` と、その script と css を静的なファイルとして配る。画面は埋め込みの画面と同じ CSP（`default-src 'none'`、`script-src 'self'`、`style-src 'self'`、
			  `connect-src 'self'`、frame-ancestors は既存の画面と同じ）。
			- 起動（`main.ts`）が `TranscriptHub` を組み立て、終わるときに閉じる。
			"""
		satisfies: ["R-01", "R-02", "F-01", "F-02", "F-03"]
	}
	"D-06": {
		title: "チャットの小窓の画面（`web/embed/chat.html`、`chat-frame.js`、`chat-view.js`、`chat.css`）"
		text: """
			素の ES Modules。`chat-view.js` は純粋な関数で、正規化した件の並びから、描く行（吹き出し、ツールの折り畳み、表示できない印）を組み立てる。
			ツールの結果は、同じ `callId` の呼び出しの行に入れる（なければ単独の行）。`chat-frame.js` は DOM を作り、文字をすべて textContent で入れる。

			- `EventSource('/api/transcript/events?agent=…')` を開き、snapshot と replacement で全体を描き直し（前のページも捨てる）、appended で末尾に足す。
			  末尾を見ていたときだけ末尾へ送る。unavailable では「読めない」と理由を示し、Orca の画面で確かめるよう促す。
			- 「前を読む」で `GET /api/transcript?before=&session=` を読み、上に足す。409 なら描き直しを待つ。
			- 見出しに、エージェントの種類、題名、セッションの短い識別子、接続の状態。
			- 幅 390px で読める（`overflow-wrap: anywhere`、ツールの入出力は折り返す `pre`）。明暗の配色。
			"""
		satisfies: ["R-03", "F-01", "F-02", "F-03"]
	}
	"D-07": {
		title: "状態の画面からの開き方（`web/view.js`、`web/main.js`）"
		text: "`buildView` が、エージェントの表の行に `chat`（端末のタブと構造化 Chat のタブなら `/embed/chat?agent=<id を URL の符号にしたもの>`、ほかは null）を付ける。画面はエージェントの表に「会話」の列を足し、新しいタブで開くリンク（`rel=noopener`）を置く。"
		satisfies: ["R-04"]
	}
	"D-08": {
		title: "実機の確かめの道具（`src/tools/transcript-live.ts`、`npm run transcript:live`）"
		text: """
			実物の Orca の読む口だけで、セッションのあるエージェントを解き、D-01 と D-02 で読み、件数だけを出す：エージェントの種類ごとの読めた数と誤りの code、
			役割と部品の種類ごとの件数、`transcriptOrder` が Orca の返す順で減らないか、2回の読みの差分の種類。`nativeChat.subscribe` を、この道具の中だけの口（その method だけを送る）で、存在しないセッションの引数で1回送り、
			`method_not_supported` が返るかを記録する（読む要求。返った応答の1行で接続を閉じる）。本文、題名、パス、セッションの識別子は出さない。
			"""
		satisfies: ["R-05"]
	}
}

compatibility: "既存の API と画面の契約は変えない。`READ_METHODS` に `agentSession.history` を足す（`ReadOnlyRpc` は引き続き `nativeChat.subscribe` を送らない）。状態の画面の表に列が1つ増える。"

risks: [
	"`nativeChat.readSession` と `agentSession.history` は非公開の口。Orca の版が変わったら `npm run transcript:live` で確かめ直す",
	"読み直しの間隔（1.5秒）の分だけ、Orca の画面より表示が遅れる。読みの負荷は、見張りの上限と、見る人がいないときに止めることで抑える",
	"窓（40 件）より多い件が1回の間隔で足されると、追記ではなく置き換えになる（表示は正しい。前のページは読み直しになる）",
]
