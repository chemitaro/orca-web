package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"Orca の選択肢とキーをそのまま写し、端末のエージェントの許可の確認への答えを、Orca が送るのと同じ1キーで1回だけ送る",
	"許可の確認の同一性（promptId）を1つの純な関数で決め、会話の正規化と送る前・送る直前の確かめと照会が同じ値を使う",
	"iss-00049 の守りの層（門のキーの組、票、送る前の記録、処理中の印、二度と送らない、照会、sendEnabled、書き込みの守り）と、iss-00050 の承認のカードの部品を共有し、端末の手段（approver）だけを差し替える",
]

current: """
	会話の読み（`src/orca/read-transcript.ts`）は、端末の最新のページにタブの agentStatus の state・interactivePrompt・stateStartedAt を `terminalPrompt` として添え、正規化（`src/transcript/normalize.ts` の terminalApprovalMessage）は、待っている承認の封筒を件 `pending-approval` の承認の部分（source terminal、prompt null、options []、answerable 偽、unanswerableReason 'terminal'）にする。
	答えの口 `POST /api/approval/intent`（`{agent, prompt: {itemId, revision}, optionId, confirmPersistent?, target?}`）と confirm（`{ticket, optionId}`）は、構造化 Chat だけ（端末は not_sendable terminal_route）。
	端末のキーの組（iss-00049）は、門 `SendRpc` の terminalKeyGroup（決めたキーの表 ANSWER_KEYS、制御文字のない文、括弧付きの貼り付け）、アダプターの sendGroup・answerKeys、サービスの preflight の mode 'keys'（端末、claude・codex、能力 answerKeys、permission を拒まない、前面がエージェント）、記録の hasAnswer。
	画面（`web/embed/approval-view.js`）の `approverFor` は source terminal に `approvers.terminal ?? approvers.readOnly` を返し、`agent-frame.js` は terminal を渡していない（読むだけ）。
	"""

target: """
	端末の承認の部分は promptId と2つの選択肢（allow_once、reject_once）を持ち、答えられる。`/api/approval/intent` は `{agent, promptId, optionId, confirmPersistent?, target?}` も受け、サーバーはタブの agentStatus で同じ promptId の許可の確認が待っていることを確かめ、送る前の記録の後、送る直前にもう一度確かめてから、Orca と同じ1キーを1組だけ `terminal.send` で送る。
	画面は source terminal の承認に端末の手段を使い、結果不明と押し直せない拒みは帯と「Orca で開く」にする。
	"""

design: {
	"D-01": {
		title: "端末の許可の確認の読みと同一性（`src/transcript/terminal-approval.ts`（新。純な関数））と、正規化の端末の承認の部分（`src/transcript/normalize.ts`）"
		text: """
			`src/transcript/terminal-approval.ts`（会話の正規化と送信の両方が使う。送信の層は transcript の層を import してよい。逆はしない）：
			- `TERMINAL_APPROVAL_OPTIONS`：`[{id: 'allow_once', label: 'Allow once', description: null, intent: 'allow_once'}, {id: 'reject_once', label: 'Reject', description: null, intent: 'reject_once'}]`（Orca の readAgentPromptAnswers と同じ id とラベル。型は ApprovalOptionView）。
			- `terminalApprovalId(interactivePrompt: string, stateStartedAt: unknown): string`：`'ta_'` と、`sha256(JSON.stringify([interactivePrompt, startedAt]))` の16進の先頭20字（startedAt は stateStartedAt が数か文字ならその値、ほかは null）。
			- `readTerminalApproval(status: {state: unknown, interactivePrompt: unknown, stateStartedAt: unknown} | null): TerminalApprovalRead`。結果は次のどれか：
			  - `{kind: 'unverified'}`：status が null か物でない、または state が blocked・waiting で interactivePrompt が空でない文字でない。
			  - `{kind: 'not_waiting'}`：state が blocked でも waiting でもない。
			  - `{kind: 'other'}`：待っていて、interactivePrompt が JSON の物でない、または `approval` の鍵が物でない（質問などの別の封筒）、または `approval.tool` が空でない文字でない。
			  - `{kind: 'approval', promptId, tool, summary: string | null, truncated: boolean}`：Orca の parseNativeChatApprovalEnvelope と同じ規則で読めた（summary は空でない文字のときだけ）。truncated は tool が 500 字（MAX_APPROVAL_LABEL_CHARS）か summary が 2,000 字（MAX_APPROVAL_DESCRIPTION_CHARS）を超えるとき真。上限の値は normalize.ts の今の値と同じものを1か所から使う（この新しいファイルに移して normalize.ts が import してよい）。
			- `matchTerminalApproval(status, promptId): 'match' | 'unverified' | 'gone' | 'mismatch' | 'truncated'`：readTerminalApproval が unverified なら unverified、not_waiting なら gone、other なら mismatch、approval で promptId が違えば mismatch、同じで truncated なら truncated、同じなら match。
			正規化の terminalApprovalMessage は readTerminalApproval を使う（kind が approval のときだけ件を足す。今の F-05 の振る舞いは同じ）。部分は今の項目に加えて `promptId`（ApprovalPart に `promptId: string | null` を必ず付ける。構造化 Chat の部分は null）、options は TERMINAL_APPROVAL_OPTIONS の写し、answerable は truncated でなければ真（unanswerableReason null）、truncated なら偽（unanswerableReason 'terminal'）。件の id は今の 'pending-approval' のまま。
			会話の API の schema は `orca-web.transcript/v1` のまま。
			"""
		satisfies: ["R-01", "R-04", "F-03"]
	}
	"D-02": {
		title: "承認のキー（`src/send/keys.ts`）と、宛先のペインの agentStatus の読み（`src/send/target.ts`）"
		text: """
			`approvalKey(agentType: string, optionId: string): string | null`：agentType が claude か codex で、optionId が allow_once なら `'1'`（Orca の nativeChatApprovalAcceptKey）、reject_once なら `'\\u001b'`（denySend）。ほかは null。写した元の名前を注に書く。
			`terminalStatusOf(listAll, target: Pick<TerminalSendTarget, 'tabId' | 'leafId'>): {state, interactivePrompt, stateStartedAt} | null`（target.ts）：今の terminalPromptOf と同じ照合（id と leafId）で、agentStatus の3つの値を手を加えずに返す（read-transcript.ts の terminalPromptFromTabs と同じ形。readTerminalApproval に渡す）。terminalPromptOf は変えない。
			"""
		satisfies: ["R-02", "R-04"]
	}
	"D-03": {
		title: "門とアダプター（`src/orca/send-gates.ts`、`src/orca/send.ts`）"
		text: """
			門：terminalKeyGroup の決めたキーの表 ANSWER_KEYS に ESC だけの `'\\u001b'` を足す。ほかは変えない（ESC で始まる決めていない列は今のとおり isPlainText で拒む）。
			アダプターに2つを足す：
			- `answerApprovalKey(target: TerminalSendTarget, bytes: string, promptId: string): Promise<SendResult>`：送る直前に (1) 前面のプロセス（今の readForeground。宛先の incarnation と種類）を読み、読めない・シェル・違うプロセスなら送らず refused（code not_sent）、(2) `session.tabs.listAll` を読み、terminalStatusOf と matchTerminalApproval が match でなければ送らず refused（code not_sent）。通れば今の sendGroup で1回だけ送る。accepted は `input_accepted`（code keys_sent、sentGroups 1、totalGroups 1）、refused は refused（code not_sent、method_not_found なら code method_not_found と method terminal.send、sentGroups 0、totalGroups 1）、unknown は unknown（code unconfirmed、sentGroups 0、totalGroups 1）。送り直さない。
			- `checkTerminalApproval(target: TerminalSendTarget, promptId: string): Promise<SendRead<SendResult>>`：listAll を1回読み（失敗は今の readFailure）、matchTerminalApproval が match なら unknown（prompt_pending）、unverified なら unknown（prompt_unverified）、ほか（gone・mismatch・truncated）なら unknown（resolved_unverified）。送らない。
			能力は今の answerKeys を使う（新しい能力の名前を足さない）。
			"""
		satisfies: ["R-02", "R-04", "R-05", "F-02", "F-03", "F-04"]
	}
	"D-04": {
		title: "端末の承認の答えのサービス・票・記録（`src/send/service.ts`、`src/send/ticket.ts`、`src/send/journal.ts`）"
		text: """
			`approvalIntent` は `{agent, promptId, optionId, confirmPersistent?, target?}` も受ける（prompt と promptId はちょうど片方）。promptId の流れ：
			1. sendEnabled（偽なら send_disabled）。
			2. preflight の mode 'keys'（端末でなければ not_sendable chat_route、claude・codex でなければ agent_keys_unknown、能力 answerKeys、端末の status の permission を拒まない、前面がエージェント）。target の指紋の比べ（今と同じ）。
			3. `matchTerminalApproval(terminalStatusOf(checked.listAll, target), promptId)`：unverified は `not_sendable`（prompt_unverified）、gone は `target_changed`（question_gone）、mismatch は `target_changed`（prompt_mismatch）、truncated は `not_sendable`（prompt_unsupported）。タブに agentStatus がなければ、手順 2 の宛先の解決（resolveTarget）が not_sendable（no_session）で先に止める。
			4. 送り始めた記録（サービスの中の集まりと、記録の `hasApproval(agentId, promptId)`）があれば `not_sendable`（already_sent）。記録が読めなければ record_unreadable。
			5. `checkOption({options: TERMINAL_APPROVAL_OPTIONS, answerable: true}, optionId, confirmPersistent)`（誤りは invalid_answer とその reason）。`approvalKey(agentType, option.id)` が null なら not_sendable（agent_keys_unknown）。
			6. 票を出す。`TicketInput` に任意の `terminalApproval: {promptId, optionId, intent}` を足す（キーは持たない）。digest は `digestOption(optionId)`。応答は今の ApprovalIntentResult（`{ticket, expiresAt, operationId, preview, digest, intent}`）。
			`approvalConfirm` は票が terminalApproval を持てば promptId の流れにする：busy・sendEnabled・票の取り出しと処理中の印（同じ同期の処理）・optionId が票と同じか（違えば target_changed answer_changed）は今と同じ順。続けて 2（preflight の拒みは今の confirmRefusal）・compareTargets・3・4・5 を確かめ直し、5 の intent が票と違えば target_changed（question_changed）。送る前の記録を書き（書けなければ record_failed で送らない）、送り始めた集まりに `<agentId>\\u0000approval:<promptId>` を足してから、`adapter.answerApprovalKey(target, key, promptId)` を1回だけ呼び、後の記録を書く。
			票の種類を取り違えない：今の confirm・answerConfirm は terminalApproval の票を wrong_kind で拒み、承認の構造化 Chat の流れは terminalApproval の票を受けず、promptId の流れは approval・prompt・call の票を受けない。
			記録：before の行 `TerminalApprovalBeforeInput = {action: 'approval', mode: 'keys', route: 'terminal', target, promptId, intent, digest, totalGroups: 1, generation: {runtimeId, incarnationId}}`。optionId、ラベル、キー、道具の名前、要約を書かない。parseRow は action approval の before で、mode が keys なら route が terminal、promptId が `ta_` と16進20字、intent が4つの値か null、totalGroups が 1 のときだけ読む（mode がなければ今の構造化 Chat の行の規則）。`SendJournal.hasApproval(agentId, promptId): Promise<boolean>`（before の行を読む。読めなければ投げる）を足す。SendDeps の journal の Pick に hasApproval を足す。
			照会 `check`：before が action approval で mode keys なら `adapter.checkTerminalApproval(target, promptId)`。ほかは今のまま。
			status：変えない（端末の承認の画面は answerKeys を使う）。
			"""
		satisfies: ["R-02", "R-03", "R-04", "R-05", "F-01", "F-02"]
	}
	"D-05": {
		title: "答えの HTTP の口（`src/server/app.ts`）"
		text: """
			`POST /api/approval/intent`：物は `{agent, prompt, optionId, confirmPersistent?, target?}` か `{agent, promptId, optionId, confirmPersistent?, target?}` の鍵だけ（prompt と promptId の両方か、どちらもないのは 400 invalid_request。promptId は `/^ta_[0-9a-f]{20}$/` の文字）。confirm は今のまま `{ticket, optionId}`。守り（同じオリジンの JSON、トークン、本文の上限、CORS なし）と誤りの HTTP の状態は今のまま。
			"""
		satisfies: ["R-02", "R-06"]
	}
	"D-06": {
		title: "承認のカードの端末の手段（`web/embed/approval-view.js`、`approval-dom.js`、`agent-view.js`、`agent-frame.js`、`agent.css`）"
		text: """
			`createTerminalApprover({agentId, writer, read?})`（approval-view.js）：
			- availability(part, status)：part.promptId が文字でなければ `{ok: false, reason: unknown_shape の言葉, open: true}`、part.answerable が真でなければ `{ok: false, reason: TERMINAL_APPROVAL_REASON, open: true}`、status が null・undefined なら loading、物でなければ status_unavailable、enabled が真でなければ send_disabled、`status.answerKeys` がなければ unknown_shape、available が偽なら `reasonText(answerKeys.reason)`。読み込み中のほかの押せない形はどれも `open: true`。通れば `{ok: true}`。
			- submit(part, optionId, {confirmPersistent})：`/api/approval/intent` に `{agent, promptId, optionId, confirmPersistent}`、続けて `/api/approval/confirm` に `{ticket, optionId}` を1回ずつ送る（今の sendIntentConfirm）。結果：確定の 200 で outcome が input_accepted（または DELIVERED の値）なら done（知らせ「答えを送りました。エージェントの続きを待っています」）、200 の refused は blocked（理由「送っていません。この許可の確認には、ここからはもう送れません。Orca で答えてください」）、200 の unknown・確定の応答の欠け・通信の誤りは partial（「届いたか分かりません。Orca で確かめてください」）。意図の拒みの reason が already_sent・question_answered・question_gone・prompt_mismatch・prompt_unsupported・agent_keys_unknown なら blocked（確定の拒みでも同じ reason なら blocked）（その理由の言葉）、ほか（prompt_unverified、busy、unreachable など）は今の refused（押し直せる）。check は持たない（結果不明の帯から照会しない。送り直さない）。
			`agent-frame.js` は承認の板の approvers に `terminal: createTerminalApprover({agentId, writer, read})` を渡す。readOnly は今のまま残す（構造化 Chat の答えられない承認）。
			`buildApprovalCard`：phase partial・blocked を描く物に足す（partial は帯の文、blocked は理由。どちらも選択肢を押せず、`open` 真）。source terminal の未回答のカードは、押せるときも `open` を真にする（端末で確かめられるように「Orca で開く」をいつも出す）。flow の done の知らせは、結果の note があればそれ。
			板のキー：`agent-view.js` の buildChat は、source terminal の承認の行の key に promptId を含める（例 `<件の key>:<promptId>`。新しい許可の確認に前の確認の流れの状態を持ち越さない）。
			`approval-dom.js`：partial の帯と blocked の理由を textContent だけで描き、今の `createOpenControl` で「Orca で開く」を出す。`agent.css`：帯の見た目（iss-00049 の質問のカードの帯と同じ規則・変数を使い、`--ds-*` を先に、明暗、390px で折り返す）。
			言葉は APPROVAL_REASONS の1か所に足す（「質問」の字を出さない）。question-view.js の契約（answerer、answererFor、export）は変えない。
			"""
		satisfies: ["R-02", "R-03", "R-04", "R-05", "R-06", "R-07"]
	}
	"D-07": {
		title: "文書と実機の確かめ"
		text: """
			README.md と AGENTS.md に、端末の承認の答え（選択肢、キー、promptId、送る前と送る直前の確かめ、二度と送らない、照会、記録）を書く。
			実機：端末のエージェントへの答えは本人の確かめに残す（依頼書の4。iss-00049 と同じ事情）。report.md に、本人の確かめの手順（試しの端末の Claude Code に無害な permission prompt を出させ、試しの orca-web（別のポート、専用の settings で sendEnabled 真）の小窓から「Allow once」と、別の確認で「Reject」で答え、操作が進む・止まることと、カードが消えること）と、残る危険（interactivePrompt がタブの一覧に出なければカードが出ない、送る直前の読みと書き込みの間の隙間）を書く。
			描画：画面の実装担当が、偽の会話（端末の承認の件）の一時の orca-web とヘッドレスの Chrome で、幅 1280px と 390px、明暗の写しを撮る。タスク担当は `npm run trial` の試しの画面で、sendEnabled 偽の構造化 Chat の承認のカードが今のまま見えることを見る（iss-00050 の部品が壊れていないこと）。写しの置き場所を report.md に書く。
			"""
		satisfies: ["R-02", "R-07"]
	}
}

compatibility: """
	会話の文書は schema `orca-web.transcript/v1` のまま、承認の部分に promptId が増え、端末の承認の options と answerable が変わる。画面は同じサーバーが配る。
	`/api/approval/intent` は今の物（prompt）をそのまま受ける。送信の記録は before の行に action approval・mode keys の物が増える。今の行の形は変えない。戻した版は mode keys の承認の行を、構造化 Chat の承認の行として読みうる（prompt がないので parseRow が捨てるかを確かめる。捨てなければ照会が誤る。戻すときは端末の承認の照会を信じず、Orca の画面で確かめる）。
	"""

risks: [
	"タブの agentStatus に interactivePrompt が出ない Orca では、端末の承認のカードはそもそも出ない（今と同じ。安全側。実機の確かめは本人の確かめに残す）",
	"送る直前の読み（listAll）と terminal.send の書き込みの間に、許可の確認が別の確認に変わると、`1` が別の確認を許しうる。Orca 自身は同じ処理の中で同期して読み直す（fence）が、orca-web は RPC の往復の分だけ隙間が広い。前面の確かめと promptId（stateStartedAt を含む）で狭める。隙間の間に許可の確認が Orca 側で答えられてエージェントが動き出すと、reject_once の ESC はそのターンを止め（claude と codex の停止は ESC 1つ）、allow_once の `1` は入力欄に残りうる",
	"Claude Code の permission prompt の番号の意味が後の版で変わると、`1` の意味が変わりうる（Orca 自身も同じ前提）",
	"orca-web が desktop のクライアントとして送るので、Orca は答えたことを入力から推さない。カードは許可の確認が消えたときに消える",
]
