package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "iss-00048 から分けた続き。今の答えの道（票、記録、照会、revision の比較）の上に、承認の表示と答えを足す。誤って許すと取り返しにくいので、常に許可には確かめの段を入れる"
}

purpose: """
	`/embed/agent`（エージェントの詳細とチャットの小窓）で、エージェントが本人に求める許可の確認（承認）を、何の許可か（道具、コマンド、ファイル、計画など Orca が示す中身）と選択肢の分かるカードとして出す。
	構造化 Chat（Orca のチャットのタブ）の承認には、Orca のチャットの画面で答えたときと同じ RPC（`agentSession.respondToApproval`、optionId）で、小窓から答えられるようにする。「常に許可」のような、後に続く確認を省く重い選択は、押したときにもう一度確かめる。
	端末のエージェント（Claude Code の permission prompt など）の許可の確認は、読めるならカードで読めるようにし、答えは Orca に任せる。
	"""

background: """
	本人の要望（2026-11-18）：チャットで ask に答えたい。質問（iss-00048、PR #52、マージ済み 3b7aece）から分けた続き。今は `src/transcript/normalize.ts` が構造化 Chat の journal の `approval` を `unsupported` にし、画面は「表示できない（許可の確認）」と出すだけ。

	Orca v1.4.261 のソース（stablyai/orca のタグ v1.4.261、`.workbench/orca-src/` に取得して読んだ。確かめた事実）：
	- 構造化 Chat の承認は journal の項目 `{kind: 'approval', title, displayName?, description?, decisionReason?, blockedPath?, matchedAskRule?, subject?, personOnly?, detail: string|null, options: [{id, label, description?, preview?, intent?}], resolution}`（`src/shared/agent-session/journal/agent-session-journal-types.ts`）。`intent` は `allow_once`・`allow_always`・`reject_once`・`reject_always` のどれかか、なし（止めるだけの選択）。`subject` は `{kind: 'plan', text, filePath?}`（計画の承認）、`{kind: 'url', url, completedAt?}`（Orca の外で開くページ。選択肢 `open`・`decline`）、それ以外は新しい Orca の知らない種類（Orca 自身も取り消しだけを許す）。`resolution` は質問と同じ `{state: 'pending'|'resolved'|'cancelled', selectedOptionId, resolvedBy, resolvedAt}`。項目には `itemId` と `revision` がある。
	- Claude の構造化 Chat の選択肢は `allow`（Allow、allow_once）・`allowForSession`（Allow for this session、allow_always）・`deny`（Deny、reject_once）、計画は `allow`（Approve plan）・`deny`（Keep planning）。Codex は決めた表から作る。
	- 答えは RPC `agentSession.respondToApproval`（`{envelope: {sessionId, clientOperationId, expectedRuntimeFence, payloadFingerprint}, itemId, expectedRevision, optionId}`、strict。optionId は 1〜1024 字）。指紋は `sha256(canonicalize({method: 'agentSession.respondTo:approval', sessionId, fields: {itemId, expectedRevision, optionId}}))`（`src/renderer/src/components/native-chat/prompts/structured-agent-session-prompt-response.ts`）。Orca は revision の比較で二重の答えを拒む。
	- Orca の承認のカード（`NativeChatApprovalCard.tsx`）は、題、説明、理由（decisionReason）、要るパス（blockedPath。ほかの文に出ていないときだけ）、計画の本文と計画のファイル、URL の行き先、操作の中身（detail。先頭 512 字・4 行の下見と「詳しく」）、選択肢のボタン（最初の選択肢が主）を出す。新しい種類の subject は選択肢を押せない。
	- 端末のエージェントの許可の確認は、フックの PermissionRequest で `agentStatus.interactivePrompt` に `{"approval": {"tool": <道具の名前>, "summary": <入力の要約>?}}` の JSON が入り、状態は blocked か waiting（`deriveInteractivePrompt`、`parseNativeChatApprovalEnvelope`、`readAgentPromptAnswers`）。`agentStatus` はタブの一覧（`session.tabs.listAll`）のタブに載る（載ることは S-04 の実機で確かめる）。答える RPC はなく、Orca 自身はキーの列（許すは Enter か数字、拒むは Escape）を `terminal.send` で打ち込む。
	統括の依頼（2026-11-18）：端末のエージェントの許可への答え（キーの列）は、iss-00049 の仕組みができた後の次の Issue の案として report.md に書く。
	"""

includes: [
	"会話の正規化（`orca-web.transcript/v1`）に承認の部分 `approval` を足す：構造化 Chat の journal の approval と、端末のエージェントの待っている許可の確認（タブの agentStatus の interactivePrompt）",
	"承認のカード（`web/embed/`）：題、道具、説明、理由、要るパス、計画、操作の中身、選択肢のボタン。常に許可の確かめの段。答え済み・取り消しの閉じた形。質問のカードと同じ見た目と流れ（意図、確定、結果不明の照会）",
	"構造化 Chat の承認に答える口（`POST /api/approval/intent`、`POST /api/approval/confirm`）と、送る門・送るアダプター・送信のサービスの追加（`agentSession.respondToApproval` だけ）",
	"送れるかの口（`GET /api/send/status`）に、承認に答えられるかの項目を足す",
	"README.md と AGENTS.md の説明、試しの画面（`npm run trial`）での写し（Mac の幅と 390px）と、試しのエージェントでの実機の確かめ",
	"端末のエージェントの許可への答え（キーの列）の、次の Issue の案を report.md に書く",
]

excludes: [
	"端末のエージェントの許可への答え（キーの列）。iss-00049 の仕組みができた後の次の Issue",
	"URL の承認（subject の kind が url）と、新しい Orca の知らない種類の承認への答え。読むだけにし、Orca で答える",
	"選択肢の preview の表示",
	"承認の取り消し（`agentSession.cancel` の prompt）",
	"今の送信（`/api/send/*`）と質問の答え（`/api/answer/*`）の意味の変更",
	"受け箱・Run の木・稼働の印での承認の表示",
	"SpecDock 側の組み込み（spec-dock の epic-00471・00526）",
]

requirements: {
	"R-01": {
		title: "会話の API が、承認を、何の許可か・選択肢・答えの状態の分かる部分として返す"
		text: """
			構造化 Chat の journal の `approval` は `{type: 'approval', source: 'chat', prompt: {itemId, revision}, title, tool, description, reason, blockedPath, plan, detail, options: [{id, label, description, intent}], answerable, state, selectedOptionId}` にする。`tool` は displayName、`reason` は decisionReason、`plan` は subject が plan のときの `{text, filePath}`。`answerable` は subject がないか plan のとき真、url か知らない種類なら偽（`unanswerableReason` に 'url' か 'newer_subject'）。`state` は resolution の pending→pending、resolved→answered、cancelled→cancelled。
			端末のエージェントの待っている許可の確認（会話の最新のページを読むとき、そのタブの agentStatus の state が blocked か waiting で、interactivePrompt が `{approval: {tool, summary?}}` の JSON のとき）は、会話の最後に `{type: 'approval', source: 'terminal', prompt: null, title: null, tool, description: summary, …, options: [], answerable: false, unanswerableReason: 'terminal', state: 'pending', selectedOptionId: null}` の部分を1つ持つ件を足す。待っていなければ足さない。古いページ（before のある読み）には足さない。
			文字は上限で切り、切ったら `truncated: true`。知らない形は今のまま unsupported（approval）。
			"""
		acceptance: [
			"構造化 Chat の approval（道具の承認、計画の承認、url、知らない subject、答え済み、取り消し、intent のない選択肢）が、決めた形の部分になる",
			"端末のエージェントが許可を待つときだけ、会話の最後に端末の approval の部分が出て、待ち終えると消える",
			"知らない形の approval は unsupported（approval）になる",
		]
	}
	"R-02": {
		title: "小窓が、承認をカードとして出し、答え済み・取り消しは結果を示して閉じる"
		text: """
			承認の部分を、会話の中のカードとして出す：題（なければ「許可の確認」）、道具、説明、理由、要るパス、計画の本文と計画のファイル、操作の中身（長ければ下見と「詳しく」で開く。計画の承認では計画の本文だけを描き、同じ文の操作の中身は重ねない）、選択肢のボタン（ラベルと説明。最初の選択肢が主）。
			答え済みは、題と選んだ選択肢のラベル（「許可しました」「拒否しました」など intent による言葉と、ラベル）を短く示して閉じた形にし、押すと開いて中身を読める（押せない形で）。取り消しは「取り消されました」と示して閉じる。
			"""
		acceptance: [
			"未回答の承認が、何の許可かと選択肢のボタンのあるカードで出る",
			"答え済みの承認が、選んだ選択肢を示して閉じた形で出、取り消しは「取り消されました」で閉じる",
			"文字は textContent だけで描かれ、HTML として解かれない",
		]
	}
	"R-03": {
		title: "利用者が、構造化 Chat の承認に答えられ、Orca のチャットで答えたのと同じ結果になる"
		text: """
			選択肢のボタンを押すと、サーバーは `agentSession.respondToApproval`（itemId、送る前に読んだ revision、optionId）を1回だけ送る。Orca が受けて resolved を返せば、カードは「答えました」と示し、会話の記録が答え済みに変わったら閉じた形になる。
			"""
		acceptance: [
			"押した選択肢の id が、Orca の respondToApproval の形と指紋で送られる",
			"試しのエージェント（構造化 Chat）の承認に小窓から答え、エージェントが続ける（許せば操作が進み、拒めば止まる）",
		]
	}
	"R-04": {
		title: "常に許可のような後の確認を省く選択は、押したときにもう一度確かめ、何が以後省かれるかを1行で示す"
		text: """
			intent が `allow_always` か `reject_always` の選択肢を押すと、すぐには送らず、確かめの段を出す：何が以後省かれるかの1行（選択肢の説明があればそれ、なければ「以後、同じ種類の確認が省かれ、自動で許可されます（<道具か題>）」、reject_always は「…自動で拒否されます」）と、「<ラベル> で答える」「やめる」のボタン。確かめて初めて送る。
			サーバーも、意図の要求に `confirmPersistent: true` がなければ、その選択肢を受けない（画面の誤りで確かめを飛ばさない）。
			"""
		acceptance: [
			"常に許可を押すと確かめの段と1行が出て、「やめる」で何も送らずに戻る",
			"確かめの段で答えると、初めて意図と確定が送られる",
			"confirmPersistent のない意図は、allow_always・reject_always の選択肢を invalid_answer で拒む",
		]
	}
	"R-05": {
		title: "承認の答えの送信が、今の送信と同じ守り方で、二重に送らず、記録に中身を残さない"
		text: """
			答えの口は、今の送信と同じ書き込みの守り（Host の完全一致、同じオリジンの JSON、短期のトークン、CORS なし）、`sendEnabled`、宛先の解決と指紋、意図で出す使い捨ての票、送る前の記録、1つの操作の ID、処理中の印を使う。確定は、宛先と承認（同じ itemId が pending で revision が同じ、答えられる種類）と選択肢（意図と同じ id で、今の選択肢にある）を確かめ直してから1回だけ送る。
			結果は今の5つの分け方で返す。unknown は自動で送り直さず、`GET /api/send/{操作の ID}?check=1` の照会で承認の今の状態を読んで確かめられる。
			送信の記録には、選択肢の id・ラベルと承認の中身（題、detail、計画）を書かない（digest、intent、itemId と revision だけ）。
			"""
		acceptance: [
			"送っている間の押しと、同じ票の2回目の確定は送らない。Orca に送る RPC は1つの操作で1回だけ",
			"承認が答え済みになったか revision が変わったら、送らずに理由を返す",
			"送信の記録の行に、選択肢の id・ラベル・題・detail が入らない",
			"結果不明の照会が、承認の今の状態（answered で同じ選択肢か別の選択肢か、pending、cancelled）から結果を返し、送り直さない",
		]
	}
	"R-06": {
		title: "答えられないときは、承認は読めるがボタンは押せず、理由を出す。端末の承認は「Orca で答える」と「Orca で開く」を出す"
		text: """
			`sendEnabled` が偽、Orca が承認の RPC か能力を持たない、宛先が送れない状態、url と知らない種類の承認では、カードは読めるが選択肢は押せず、理由を1行で示す（url・知らない種類は「Orca で答えてください」と「Orca で開く」）。
			端末のエージェントの承認は選択肢のボタンを出さず、「端末のエージェントの許可は、Orca で答えてください」と示し、「Orca で開く」（今の `createOpenControl`）を出す。
			"""
		acceptance: [
			"sendEnabled が偽の設定で、カードの中身と選択肢が読め、ボタンは押せず、理由が出る",
			"端末のエージェントの承認のカードに、答えるボタンがなく、理由と「Orca で開く」が出る",
		]
	}
	"R-07": {
		title: "狭い枠（SpecDock の欄、390px）でも読めて押せる"
		text:  "カードは枠の幅に合わせて折り返し、横にはみ出さない（操作の中身の等幅の塊は折り返すか枠の中で横に送る）。選択肢は縦に並ぶ全幅のボタンで、押せる高さを 44px 以上にする。色と字体は質問のカードと同じ変数（`--ds-*`）を先に使い、明暗の両方で読める。"
		acceptance: [
			"試しの画面で、Mac の幅と 390px、明暗で、カードが横にはみ出さず、選択肢と確かめの段のボタンが押せる（写しを report.md に残す）",
		]
	}
}

failures: {
	"F-01": {
		title: "答えの確定の応答を失ったとき、自動で送り直さず、結果不明として示す"
	}
	"F-02": {
		title: "別の画面（Orca や別の小窓）で先に答えられた承認には送らない（Orca の revision の比較で拒まれれば refused として示す）"
	}
	"F-03": {
		title: "Orca の応答や journal の形が知らない形なら、承認は unsupported（approval）に戻し、答えの口は unknown_shape で送らない"
	}
	"F-04": {
		title: "題・説明・detail・計画・ラベルに HTML や制御文字があっても、文字のまま描く"
	}
	"F-05": {
		title: "端末の interactivePrompt が読めない形（JSON でない、approval がない、tool が空）なら、端末の承認の部分を足さない（会話はそのまま出す）"
	}
}

constraints: [
	"実行時の依存を足さない。画面は素の ES Modules で、DOM は textContent と createElement だけで描く",
	"送る経路は `agentSession.respondToApproval` の決めた形だけを足す。再送の道を足さない。端末へのキーの列を送らない",
	"会話の API と答えの口は同じオリジンだけ（CORS なし）",
	"質問のカード（iss-00048）の部品と流れを使い、見た目と守りをそろえる。並行の iss-00049 が質問の端末の手段を差し替えるので、質問のカードの契約（answerer、answererFor）は変えない",
	"実機の確かめは試しのエージェントと試しの orca-web（別のポート、専用の settings）だけ。常駐の orca-web（8791）の設定を変えない",
	"本人の方針：本人の環境に特化した決まりを入れない、普遍的でシンプルな仕組みにする",
]

decisions: [
	"端末のエージェントの許可は読むだけにし、答え（キーの列）は iss-00049 の後の次の Issue の案として report.md に書く（統括の依頼書、2026-11-18）",
	"url と知らない種類の承認は読むだけにする（Orca の外のページを小窓から開かせない。知らない種類は Orca 自身も答えさせない）。タスク担当の判断、2026-11-18",
	"常に許可の確かめは allow_always と reject_always の両方にかける（どちらも後の確認を省く）。サーバーも confirmPersistent で守る。タスク担当の判断、2026-11-18",
	"承認の答えの口は、質問の `/api/answer/*` とは別の道（`/api/approval/*`）にし、票・記録・照会・処理中の印は SendService の中で共有する（照会は `GET /api/send/{操作の ID}` のまま）。タスク担当の判断、2026-11-18",
	"依頼書の「Orca で答える」は、端末と url・知らない種類の承認のカードの理由の言葉（「Orca で答えてください」）として示し、押す操作は今の「Orca で開く」1つにする（同じ所へ行く2つのボタンを置かない）。タスク担当の判断、2026-11-18",
	"記録の intent（allow_once など、決めた4つの値）は答えの中身ではないので記録に残す（後で何を許したかの種類を確かめるため）。選択肢の id とラベルは残さない。タスク担当の判断、2026-11-18",
]
