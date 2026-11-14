package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"利用者が見る画面は、普通のチャット（畳んだ詳細、会話、入力欄と送るボタン）だけにする",
	"iss-00013 で確かめたサーバーの守りと二重送信の契約は、HTTP の口の形を壊さずにそのまま使う",
	"画面が見ていた宛先と送る宛先が同じであることを、確認の画面の代わりに指紋で確かめる",
]

current: """
	画面（`web/embed/send-view.js` の reduceSend、phase は disabled・compose・checking・confirm・sending・result）は、「確かめる」で意図を送り、確認の画面（buildConfirm）と期限の時計を出し、「送る」で確定を送り、結果の画面（buildResult）から「新しく書く」「書く欄に戻る」で戻る。
	詳細（`agent.html` の `<details id="detail-box" open>`）は広い幅では開いて始まり、幅 390px 以下だけ `agent-frame.js` が畳む。
	`SendService.status` は `{enabled, available, route, reason}` を返す。`intent` は `{agent, text}` を受ける。
	"""

target: """
	画面は phase を disabled・compose・changed・sending・unknown・checking の6つにし、最初に送れると分かった時の宛先の指紋を固定し、1回の送る操作で意図と確定を続けて送る。確認の画面、期限の時計、結果の画面はなくし、結果は入力欄の上の短い知らせと、結果不明の帯で示す。
	詳細はいつも畳んで始める。入力欄は Enter で送り（タッチが主の端末は改行）、送るボタンを持つ。
	`status` は宛先の指紋 `target` と種類 `agentType` も返し、`intent` は任意の `target` を受けて比べる。iss-00013 の残りの P2/P3 を記録の読みと照会で直す。
	"""

design: {
	"D-01": {
		title: "宛先の指紋と、送れるかの口と送る意図の追加の項目"
		text: """
			`src/send/target.ts` に `targetFingerprint(target: SendTarget): string` を足す（純な関数）。項目を決めた順の配列にして JSON にし、sha256 の16進の頭 32 文字を返す。
			- 端末：`['terminal', runtimeId, worktreeId, tabId, leafId ?? '', handle, ptyId, incarnationId, agentType, providerSessionId]`
			- 構造化 Chat：`['chat', runtimeId, worktreeId, tabId, agentType, sessionId]`
			compareTargets が比べる項目と同じ集まり（agentId は tabId と leafId から決まるので入れない）。識別子そのものは応答に出さない。
			`SendService.status(agentId)` の応答に `target: string | null`（preflight が通ったときの指紋。通らなければ null）と `agentType: string | null`（通ったときの宛先の種類）を足す。ほかの項目と意味は変えない。
			`SendService.intent({agent, text, target?})`：preflight が通った後、`target` が与えられていて、その時の宛先の指紋と違えば、票を出さずに `{ok: false, error: 'target_changed', reason: 'changed_since_shown'}` を返す（HTTP 409。送る RPC は呼ばない。意図の拒みはこれまでどおり記録に書かない）。与えられなければ、これまでどおり。
			`src/server/app.ts` の送る意図の物の検査：許す鍵を `agent`、`text`、`target` にする。`target` があれば `/^[a-f0-9]{32}$/` の文字列でなければ 400 `invalid_request`。確定（`ticket`、`text`）の検査は変えない。
			"""
		satisfies: ["R-04", "R-06", "F-04"]
	}
	"D-02": {
		title: "iss-00013 の残りの P2 の直し（記録の読みと照会）"
		text: """
			R-07 の (b)〜(f) を、送る経路を変えずに直す。
			(b) `SendJournal.read`：結果は「照会の行のうち最後の、outcome が unknown でない行」、なければ after、なければ（before があれば）unknown `no_after_record`、なければ refused の順に採る（今は最後の照会の行だけを見る）。
			(c) `SendService.check`：`appendCheck` が偽を返したら、応答に `checkWarning: 'check_record_failed'` を付ける（CheckResult の recorded の形に任意の項目を足す）。
			(d) `SendJournal.read`：ファイルの読みが ENOENT 以外で失敗したとき、この起動のメモリーの行（after・check・refused）に、その操作の ID の行があれば、それだけで組み立てて返す。なければ投げる。`SendService.check` は投げられたら `{ok: false, error: 'record_unreadable'}` を返し、`app.ts` は 503 にする（SendFailure の error と SEND_ERROR_STATUS に足す）。照会は not_sent を返さない。
			メモリーに refused があればその ID は送る前に止まった（refused の後に before は書かれない）ので、refused と答えてよい。
			(e) `SendService.check`：照会が unsupported（method_not_found）を返したとき、`capabilities()` を読み、preflight と同じ規則で今の runtime の ID を覚え（違えば止めた経路の集まりを空にする）、記録の宛先の runtime の ID が今の runtime と同じなら、その経路を止める。読めなければ止めない（今と同じ）。runtime を覚える処理は preflight と同じ私的な関数にまとめる。
			(f) `createSendAdapter().checkChat`：history で、カード（queuedMessages）が見つからず、submission が clientMessageId では当たらず queuedMessageId でだけ当たり、その dispatchState が rejected なら、`{outcome: 'unknown', detail: {code: 'card_gone', dispatchState: 'rejected'}}` を返す（classifyChat の accepted `card` を通さない）。送る時の応答の分け方（chatReceipt）は変えない。
			"""
		satisfies: ["R-07", "F-05"]
	}
	"D-03": {
		title: "送る欄の状態と流れ（send-view.js の作り直し）"
		text: """
			`web/embed/send-view.js` の reduceSend、buildSendView、createSendFlow を作り直す（純な関数と、注入した口だけで送る流れ。DOM に触らない）。
			状態：`{phase, text, notice, reason, target, pendingTarget, agentType, operationId?, warnings?}`。target は画面が固定した「見ている宛先」の指紋、pendingTarget は固定と違う指紋を受けたときのその指紋（なければ null）。phase は
			- `disabled`：送れない（status を読む前、sendEnabled が偽、available が偽、status が読めない）。reason の言葉を1行で示す。入力欄は書けない。
			- `compose`：書ける。固定した target と `agentType` を持つ。
			- `changed`：固定した target と違う指紋を受けた。本文を残し、入力欄は書けるが Enter と送るボタンは送らない。『宛先が変わりました（別のセッションか端末になりました）。会話を確かめてから続けてください』と「新しい宛先で続ける」（data-action adopt）を出す。
			- `sending`：送る操作の後、意図と確定を待つ間。入力欄と送るボタンは止まる。
			- `unknown`：結果不明。本文を残し、帯（『届いたか分かりません。自動では送り直しません。』、「確かめる」、「閉じる」）を出す。
			- `checking`：結果不明の照会の間。
			出来事と移り方：
			- `status`：disabled・compose・changed のときだけ受ける。200 で enabled と available が真のとき：target をまだ固定していなければ、受けた指紋を固定して compose。固定した指紋と同じなら compose（changed のままなら changed）。違えば target を上書きせず、pendingTarget に受けた指紋を入れて changed。そうでなければ disabled（理由。固定した target は消さない）。sending・unknown・checking の間は捨てる。
			- `adopt`：changed のときだけ、pendingTarget を target に固定し直して compose（本文を残す）。
			- `input`：disabled・compose・changed のときだけ本文を変える。
			- `submit`：compose で本文が空白だけでなく、target を持つときだけ sending に進む。ほかは同じ物を返す（押しを捨てる）。
			- `intent`／`intent-failed`：sending の中で、意図の応答が 200 で ticket と operationId があり text が欄の本文と同じなら、operationId を覚えて sending のまま（流れが確定を送る）。送る前の拒みなら compose（本文を残し、notice に理由の1行）。ただし send_disabled は disabled、target_changed の changed_since_shown は changed（pendingTarget は流れの読み直しで入る）。どの送る前の拒みの後も、流れが status を1回読み直す。応答を受けられない・形が違うときは compose（何も送っていない。確定を送っていないので票は期限で消える）。
			- `confirmed`／`confirm-failed`：sending の中で、200 で outcome が accepted・input_accepted・submitted なら compose（本文を空にし、notice は info の『送りました（<outcome の言葉>）』、warnings に warning の言葉）。outcome が refused なら compose（本文を残し、notice に理由）。unknown、応答を受けられない、読めない、知らない形なら unknown（意図の operationId）。送る前の拒み（iss-00013 の SEND_ERRORS と GUARD_ERRORS の表）なら compose（本文を残す。send_disabled は disabled）で、流れが status を1回読み直す。
			- `query`：unknown のときだけ checking に進む。`queried`／`query-failed`：checking の中で、recorded の outcome が届いた3つなら compose（本文を空にし、『届いていました』の notice）、refused か not_sent なら compose（本文を残し、『送っていません』の notice）、unknown・in_progress・読めない・record_unreadable なら unknown に戻して notice に理由を出す。`checkWarning` があれば言葉を足す。
			- `dismiss`：unknown のときだけ compose（本文を残す）。
			createSendFlow：`submit()` は reduceSend が sending に進めたときだけ、`POST /api/send/intent` に `{agent, text, target}` を1回送り、受けた ticket で `POST /api/send/confirm` に `{ticket, text}` を1回送る（間に利用者の操作を挟まない）。時間切れ（意図 30 秒、確定 60 秒）と、401 の1回の取り直し（`write.js`）はこれまでどおり。自動で送り直さない。`query()` は `GET /api/send/<operationId>?check=1` を1回。`refreshStatus()` は disabled・compose・changed のときだけ読む。
			言葉：REASON_LABELS に `foreground_mismatch`（『端末の前面が、このエージェントではありません』）、`changed_since_shown`（『宛先が変わりました。会話を確かめてから、もう一度送ってください』）、`record_unreadable`、`card_gone`、`check_record_failed` を足す。期限・確認の票の言葉（expired など）は確定の拒みの理由として残してよいが、画面の中に期限の時計は出さない。
			知らせは1行（warnings は1つ1行）にし、なくした操作（「確かめる」で確かめ直す、確認の画面に戻る）を促す言葉を使わない（例：『宛先が変わったので送りませんでした。会話を確かめてから、もう一度送ってください』）。知らない code は code をそのまま添える。
			"""
		satisfies: ["R-03", "R-04", "R-05", "R-07", "F-02", "F-03", "F-04"]
	}
	"D-04": {
		title: "入力欄の鍵の扱い（純な関数）と、入力欄の伸び"
		text: """
			`send-view.js` に `composerKeyAction(event, {touchPrimary}): 'send' | null` を足す（event は key、shiftKey、altKey、ctrlKey、metaKey、isComposing、keyCode、repeat の形だけを読む）。
			- key が Enter でない、isComposing が真、keyCode が 229、repeat が真 → null（何もしない。既定の動きに任せる）
			- (ctrlKey か metaKey) で shiftKey も altKey もない → 'send'
			- touchPrimary が真 → null（改行）
			- shiftKey か altKey → null（改行）
			- ほか → 'send'
			`agent-frame.js` は textarea の keydown で呼び、'send' なら preventDefault して `flow.submit()` を呼ぶ（流れの状態が送れないときは何も起きない）。touchPrimary は `matchMedia('(hover: none) and (pointer: coarse)')` の matches（変われば読み直す）。
			入力欄は input のたびに高さを本文に合わせ、上限（広い幅は 8 行ほど、狭い幅は 5 行ほど）を超えると欄の中でスクロールする。送った後に空になったら1行に戻る。
			"""
		satisfies: ["R-02", "F-01"]
	}
	"D-05": {
		title: "画面の形（agent.html、agent.css、send-dom.js、agent-frame.js）"
		text: """
			`agent.html`：上から、題名の行（h1、「Orca で開く」、開いた結果の1行）、`<details id="detail-box">`（open の属性を付けない。summary は「詳細」）、会話（`#chat`）、送る欄（`#send`）。
			送る欄は、知らせの欄（`#send-panel`、aria-live）と、入力の箱（角の丸い枠の中に textarea `#send-text` と送るボタン `#send-button`（aria-label「送る」、矢印の字形）を横に並べる。Orca の入力欄に似せる）。
			placeholder は、キーボードが主の端末で『<種類> に送る（Enter で送信、Shift+Enter で改行）』、タッチが主の端末で『<種類> に送る』。種類が分からなければ『エージェントに送る』。送れないときは placeholder に理由を書かず、知らせの欄に理由を出す。
			`send-dom.js` の renderSendPanel：buildSendView の形から、notice の1行（p、data-kind）、warnings（ul と li）、結果不明の帯（p と「確かめる」「閉じる」のボタン、data-action は query と dismiss）だけを作る。textContent だけを使う。確認の画面（dl、期限）と結果の画面は作らない。
			`send-dom.js` は changed のとき、知らせの1行と「新しい宛先で続ける」のボタン（data-action adopt）も作る。
			`agent-frame.js`：詳細を幅で開け閉めする処理を消す（details は描き直しでも作り直さず、利用者の開け閉めがそのまま残る）。送るボタンの click で `flow.submit()`。`#send-panel` の click は data-action の query・dismiss・adopt を受ける。描くたびに、入力欄の disabled と値と placeholder、送るボタンの disabled（phase が compose で本文が空白だけでないときだけ押せる）を buildSendView の形から決める。
			`agent.css`：確認の画面と結果の画面の規則を消し、入力の箱と送るボタンと帯の規則を足す。幅 390px で横にはみ出さない。色は今の変数（明るい・暗いの両方）を使う。
			"""
		satisfies: ["R-01", "R-02", "R-03", "R-05", "F-06"]
	}
	"D-06": {
		title: "試しの画面での写しと、検証用の宛先への送信と、文書"
		text: """
			タスク担当が行う。`npm run trial` を起動し、試し専用の `.workbench/trial/settings.json` だけ `sendEnabled: true` にし、自分で起動したヘッドレスの Chrome（`--disable-features=MacAppCodeSignClone`、CDP の `Browser.close` で閉じる）で、試しの画面の send-test の Claude の詳細とチャットを幅 1280px と `phone.html`（390px）で開く。
			写す前に iframe の中の会話の欄（`#log`）に CSS の blur を当て、会話の本文が読めない写しにする。写しは Scope の `artifacts/` に置き、report.md から指す。
			詳細が畳まれていること、送るボタンがあること、横のはみ出しが 0 であることを DOM で数える。send-test の Claude（Mac の幅）と Codex（390px）に Enter で1回ずつ送り、outcome と試しの `sends.jsonl` の行の数を確かめる。送る前に、`orca terminal list` と状態の API で宛先の handle が許された2つであることを確かめる。
			README.md の「送信」の流れと前面の説明、AGENTS.md の `web/embed/send-view.js` の説明を、確認の画面のない流れに直す。
			"""
		satisfies: ["R-08", "R-01", "R-02", "R-03"]
	}
}

compatibility: """
	HTTP の口は形を保つ：`GET /api/send/status` は項目を足すだけ、`POST /api/send/intent` は任意の `target` を足すだけ、`POST /api/send/confirm` は変えない、照会は任意の `checkWarning` と、記録を読めないときの 503 `record_unreadable` を足すだけ。実機の確かめの道具（`send-live.ts`）は変えずに動く。
	送信の記録の形（`orca-web.send-record/v1`）は変えない。(b) の読み方の変更は、照会で確定した結果が後の unknown に隠れないだけで、記録の行は同じ。
	epic-00004 の文書は、統括の了承（2026-11-14、msg_745bb8dec9ff）を受け、requirement.cue の includes の2つ目、R-02、R-04 の text、F-01、decisions と、design.cue の D-02、D-05 を書き直す。F-06・R-03・D-03・D-04 は変えない。
	"""

risks: [
	"Orca のソースが手元にないので、(f) の Orca の withdrawn の状態の形は確かめていない。届いたとも送っていないとも言わない unknown にして、送り直しを誘わない",
	"画面が status を読んでから送るまでの間の宛先の入れ替わりは、意図の指紋の比べと確定の確かめ直しで止まる。確定と Orca の書き込みの間の隙は iss-00013 の risks のまま",
]
