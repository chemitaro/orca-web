package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"Orca の会話の記録を、エージェントの id から、取り違えずに読む",
	"変化を、追記と置き換えに分けて、別の会話を混ぜずに配る",
	"信頼しない本文を、文字としてだけ描く",
	"詳細とチャットを1つの画面にし、単独の画面と SpecDock の埋め込みの両方で使う",
]

current: "状態の API と開く口とボタンの部品はある。会話の記録は、機能の確かめが口の有無を見るだけで、API も画面もない。"
target:  "`/api/transcript` と `/api/transcript/events` が会話を配り、`/embed/agent?id=…` が詳細と読むだけのチャットを描く。状態の画面から開ける。"

design: {
	"D-01": {
		title: "会話の取得元のアダプター（`src/orca/read-transcript.ts`）"
		text: """
			`createTranscriptReader({ rpc, capabilities })` が2つの操作を持つ。読む口は `ReadOnlyRpc` だけ（`READ_METHODS` に `agentSession.history` を足す）。

			- `resolve(agentId)`：Orca に届かなければ（機能の確かめの connection が connected でない）`unreachable`、機能 `readTranscript` が使えなければ `unsupported`。`session.tabs.listAll` を読み（1秒の間は同じ結果を共有する）、状態の API と同じ規則でエージェントの id のタブを探す。
			  端末のタブは id が paneKey（`<parentTabId>:<leafId>`）かタブの id、構造化 Chat のタブは `chat:<タブの id>`。
			  端末のタブは、Orca の画面（`resolveNativeChatSession`）と同じく、`agentStatus.agentType`（なければ `launchAgent`）と `agentStatus.providerSession` の `id` と `transcriptPath` を使う。
			  構造化 Chat は、タブの `agent` と `sessionId` を使う。
			  結果は `TranscriptTarget`（agentId、source：`nativeChat` か `agentSession`、エージェントの種類、セッションの識別子、記録のパス、セッションの鍵）か、誤り：
			  `agent_not_found`（タブがない）、`no_session`（セッションの識別子かエージェントの種類がない）、`unreachable`、`unsupported`、`read_failed`、`unknown_shape`。
			- `read(target, { limit, before })`：`nativeChat.readSession`（`agent`、`sessionId`、`transcriptPath`、`limit`、`beforeOffset`、`capabilities: { transcriptSourceOrder: 1 }`）か、
			  `agentSession.history`（`sessionId`、`direction`：`tail` か `before`、`cursor`、`limit`）。Orca が `{ error, notFound }` を返したら `transcript_not_found`（notFound）か `read_failed`。
			  `agentSession.history` は `ok: true` の `page` だけを使い、`ok: false`（reset。添えられた末尾のページを含む）は `read_failed` にする（古いページの代わりに末尾を返さない）。
			  RPC の誤りは、届かない（`unavailable`、`timeout`、`disconnected`）を `unreachable`、`method_not_found` を `unsupported`、ほかの Orca の誤りを `read_failed`、形の誤りを `unknown_shape` にする。
			  Orca の誤りの文は捨て、code だけを返す。結果は Orca の件の並びと、より古いページの位置（nativeChat は beforeOffset、agentSession は window.oldest）と hasMore。

			セッションの鍵（`key`）は、エージェントの id、source、エージェントの種類、セッションの識別子を NUL でつないだ文字の sha256 の先頭16桁。短い識別子（`short`）はセッションの識別子の先頭8文字。
			記録のパスは `TranscriptTarget` の中だけに持ち、正規化した文書と誤りに出さない。
			"""
		satisfies: ["R-01", "F-01", "F-02"]
	}
	"D-02": {
		title: "会話の正規化（`src/transcript/normalize.ts`、`orca-web.transcript/v1`）"
		text: """
			Orca の件（NativeChatMessage、AgentJournalRenderItem）を、`{ id, role, at, parts }` の件に減らす。`role` は `user`、`assistant`、`tool`、`system`。
			`parts` は `text`（text）、`tool-call`（name、input を JSON にした文字、callId）、`tool-result`（output、isError、callId）、`unsupported`（what）。各部品は切ったら `truncated: true`。

			- 思考（role が `reasoning`）は件ごと落とし、印を付けない。
			- `image-ref`、`subagent-group`、`subagent`、`background-task`、知らないブロックは `unsupported` の印にする。role が `system` の件（Orca の知らせ）は、本文を残し、ほかの部分は同じく印にする。知らない role は `assistant` にし、部品はすべて印にする。
			- `unsupported` の `what` は決めた名前（image、subagent、background-task、diff、approval、question、status、unknown）だけにし、Orca の文字をそのまま入れない。
			- 構造化 Chat の `message` は同じ扱い。`tool-call` は role `tool` の件で、呼び出しと（あれば）出力の `head`（`truncated` を引き継ぐ）。`turn`、`agent-start`、`agent-handoff` は出さない。
			  `diff`、`approval`、`question`、`status`、知らない kind は `unsupported`。並びは（sequence、sequenceIndex）の順。
			- 端末のエージェントの件は並べ替えない（Orca が返す順のまま）。
			- 本文は 100,000 文字、ツールの入力は 4,000 文字、出力は 8,000 文字で切る。Orca の `shortened`、bounded payload の `truncated` も `truncated` にする。
			- 時刻は epoch ms を ISO にし、なければ null。部品が1つもない件は落とす。

			文書：`{ schema, ok: true, agent: { id, agentType }, session: { key, short, source }, messages, hasMore, before, readAt }`。
			`before` は、セッションの鍵と古いページの位置を JSON にして base64url にした不透明な文字（なければ null）。
			"""
		satisfies: ["R-01", "F-03"]
	}
	"D-03": {
		title: "窓の差分（`src/transcript/diff.ts`）"
		text: """
			`diffWindow(prev, next)` が、前の窓と今の窓（どちらも正規化した件の並び）を比べ、`none`、`appended`（`items`：足された件、`updated`：同じ位置で中身が変わった件）、`replacement` のどれかを返す。
			前の窓が空なら、今の窓の全体を appended にする。そうでなければ、前の窓の後ろの部分（offset o から）の id の並びが、今の窓の先頭と一致する最小の o を探す（窓が前に進むと、先頭の件が窓から外れる）。
			見つからなければ（件が消えた、並びが変わった、窓より多い追記）replacement。見つかれば、重なりの中で中身（正規化した件の JSON）が違う件を updated に、重なりの後ろを items にする。両方が空なら none。
			セッションの鍵が違う窓は比べず、呼ぶ側が replacement にする。
			"""
		satisfies: ["R-02", "F-02"]
	}
	"D-04": {
		title: "共有の見張り（`src/transcript/hub.ts`）"
		text: """
			`TranscriptHub` が、エージェントの id ごとに1つの見張り（watch）を持ち、購読者に出来事を配る。

			- 見張りは、1.5秒ごとに末尾（40 件）を読み、5秒ごとにエージェントからセッションを解き直す。読みは重ねない。
			- 最初の成功で snapshot を窓として持つ。後の読みは D-03 で比べ、appended か replacement を配る。セッションの鍵が変わったら replacement（reason `session-changed`）。
			- 読めなければ unavailable（誤りの code）を、code が変わったときだけ配り、窓を捨てる。次に読めたら replacement（reason `recovered`）。
			- 新しい購読者には、持っている窓（snapshot）か unavailable をすぐ送る。まだどちらもなければ、最初の読みの結果を送る。
			- 上限：見張り 8、購読者 32。超えたら `busy`。最後の購読者が抜けたら見張りを止めて捨てる。`close()` で、すべての購読を閉じる。
			- 時計は差し替えられる（テストは `tick()` を直接呼ぶ）。
			"""
		satisfies: ["R-02", "F-01", "F-02"]
	}
	"D-05": {
		title: "会話の HTTP の道（`src/server/app.ts`）"
		text: """
			- `GET /api/transcript?agent=&limit=&before=`：その場で解いて読む。`limit` は 1〜200（既定 40）。`before` のセッションの鍵が今の鍵と違えば 409 `session_changed`。
			  誤りの状態：400 `invalid_request`、404 `agent_not_found`・`no_session`・`transcript_not_found`、409 `session_changed`、501 `unsupported`、503 `unreachable`・`busy`、502 `read_failed`・`unknown_shape`。
			  誤りの本文は `{ ok: false, error }`。Orca の誤りの文は返さない。
			- `GET /api/transcript/events?agent=`：`text/event-stream`。`retry: 5000`、15秒ごとの注釈の行。出来事（`event:` の名前と、`data:` の JSON）：
			  `snapshot`（`{ document }`。document は D-02 の文書で、session の鍵、messages、hasMore、before を持つ）、`replacement`（`{ reason, document }`）、
			  `appended`（`{ session: { key }, items, updated }`）、`unavailable`（`{ error }`）。画面の「前を読む」は、最後に受けた document の before を使う。
			  見張りの上限では `unavailable`（`busy`）を送って閉じる。
			- どちらも Host を確かめ、Origin があれば同じオリジン（`http://<Host>`）だけを通す（ほかは 403）。CORS を付けない。GET のほかは 405。
			- `/embed/agent` と、その script と css を静的なファイルとして配る。画面は既存の埋め込みの画面と同じ CSP（`default-src 'none'`、`script-src 'self'`、`style-src 'self'`、
			  `connect-src 'self'`、frame-ancestors は読み取りのオリジンだけ、なければ 'none'）。
			- 起動（`main.ts`）が読み手と `TranscriptHub` を組み立て、終わるときに閉じる。
			"""
		satisfies: ["R-01", "R-02", "R-05", "F-01", "F-02", "F-03"]
	}
	"D-06": {
		title: "詳細とチャットの画面（`web/embed/agent.html`、`agent-frame.js`、`agent-view.js`、`agent-dom.js`、`agent.css`）"
		text: """
			素の ES Modules。`agent-view.js` は純粋な関数で、DOM に触らない。

			- `buildDetail(state, agentId)`：状態の文書から、エージェント、worktree、親（parentPaneKey が指すエージェント）、子（parentPaneKey がこのエージェントの paneKey のエージェント）を引き、
			  詳細の行（題名、worktree、種類、状態と開始時刻、モデルと推論（値の意味の名前）、親、子、PR、CI）と、Orca で開く要求（`{ worktree, agent? }`。agent は端末のタブの paneKey だけ）を作る。
			  見つからなければ `null`。取れない値は「—」と欠けた理由。PR のリンクは `https:` の URL のときだけ。値は view.js の `formatValue` を使う。
			- `buildChat(messages)`：正規化した件から、描く行（吹き出し、ツールの折り畳み、表示できない印、system の本文の知らせの行（中央の小さな文字で、吹き出しにしない））を作る。ツールの結果は、同じ `callId` の呼び出しの行に入れる（なければ単独の行）。

			`agent-dom.js` が行を DOM の要素にし、文字をすべて textContent で入れる（innerHTML を使わない）。`agent-frame.js` が読み込みと出来事の扱いを持ち、描くのは `agent-dom.js` に任せる。

			- `/api/state` を5秒ごとに読み、詳細を描き直す。「Orca で開く」は `write.js` の短期のトークンで `/api/open` を送る。`matchMedia('(max-width: 390px)')` の間は出さない。
			- `EventSource('/api/transcript/events?agent=…')` を開き、snapshot と replacement で全体を描き直し（前のページも捨てる）、appended で updated を同じ id の行に差し替え、items を末尾に足す。
			  末尾を見ていたときだけ末尾へ送る。unavailable では「読めない」と理由を示し、Orca の画面で確かめるよう促す。
			- 「前を読む」で `GET /api/transcript?before=` を読み、上に足す。足すのは、応答の session の鍵が今の鍵と同じで、要求を送った後に snapshot も replacement も受けていないときだけ（受けていれば応答を捨てる）。409 なら置き換えを待つ。
			- 幅 390px で読める（`overflow-wrap: anywhere`、ツールの入出力は折り返す `pre`）。明暗の配色。送信の欄は置かない。
			"""
		satisfies: ["R-03", "F-01", "F-02", "F-03"]
	}
	"D-07": {
		title: "状態の画面からの開き方（`web/view.js`、`web/main.js`）"
		text: "`buildView` が、エージェントの表の行に `link`（`/embed/agent?id=<id を URL の符号にしたもの>`）を付ける。画面はエージェントの表の行の見出しをリンクにし、新しいタブで開く（`rel=noopener`）。ほかの表は変えない。"
		satisfies: ["R-04"]
	}
	"D-08": {
		title: "実機の確かめの道具（集計の純な部分は `src/tools/live-transcript.ts`、入口は `src/tools/transcript-live.ts`、`npm run transcript:live`）"
		text: """
			実物の Orca の読む口だけで、状態の API と同じ規則でエージェントを集め、D-01 と D-02 で読み、件数だけを出す：取得元とエージェントの種類ごとの、解けた数、読めた数、誤りの code ごとの数、
			役割と部品の種類ごとの件数、落とした思考の件数、Orca の返す順で `transcriptOrder` が減らないか、2回の読みの差分の種類、前のページの読みが重ならないか。
			本文、題名、パス、セッションの識別子は出さない。購読の口は送らない。
			"""
		satisfies: ["R-06"]
	}
}

compatibility: "既存の API と画面の契約は変えない。`READ_METHODS` に `agentSession.history` を足す（`ReadOnlyRpc` は引き続き streaming の method を送らない）。状態の画面のエージェントの表の行の見出しがリンクになる。"

risks: [
	"`nativeChat.readSession` と `agentSession.history` は非公開の口。Orca の版が変わったら `npm run transcript:live` で確かめ直す",
	"読み直しの間隔（1.5秒）の分だけ、Orca の画面より表示が遅れる。読みの負荷は、見張りの上限と、見る人がいないときに止めることで抑える",
	"窓（40 件）より多い件が1回の間隔で足されると、追記ではなく置き換えになる（表示は正しい。前のページは読み直しになる）",
	"構造化 Chat の件の形は、手元に1つの会話しかないため、実機では少数しか確かめられない",
]
