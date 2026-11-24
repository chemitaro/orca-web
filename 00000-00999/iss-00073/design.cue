package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"Orca の再起動・版上げのあとに、orca-web を再起動しなくても機能の判定が正しくなる",
	"今の Orca が出す端末のタブの形（ptyId なし）でも、同一性を確かめたうえで送れる",
	"送信の門、再送しないこと、記録の形の約束を変えない",
]

current: "`CapabilityCache.get()` は、接続できて runtimeId のある報告なら `runtimeIdConsistent` に関わらず持ち、`orca-runtime.json` の runtimeId が報告の runtimeId と同じ間は返し続ける。`resolveTarget` は端末のタブの `ptyId` がなければ `identity_unavailable` を返し、`compareTargets` と `targetFingerprint` は `ptyId` を常に使う。"

target: "`CapabilityCache` は一致した報告だけを持つ。端末の宛先の `ptyId` は `string | null` で、必須の識別子は handle・incarnationId・agentType・providerSession。比べ方は handle・incarnationId の違いで `terminal_changed`、ptyId は両方にあるときだけ比べる。指紋は ptyId を含めない。"

design: {
	"D-01": {
		title: "CapabilityCache は runtime ID の一致した報告だけを持つ"
		text: """
			`src/orca/capabilities.ts` の `CapabilityCache.get()` で、持つ条件を `report.connection.state === 'connected' && report.runtimeId !== null && report.runtimeIdConsistent` にする。返す値は今のまま（一致しない報告もそのまま返し、各機能の `missing` に `runtime-id:consistent` が載る）。`get()` の入口の「持った報告の runtimeId が今の file の runtimeId と同じなら返す」は変えない（持つのが一致した報告だけなので、file・status・RPC の runtimeId が揃った報告だけが返し続けられる）。
			クラスの注に、一致しない報告を持たない理由（Orca の再起動の途中で status と file の runtimeId が食い違う一瞬の報告を持つと、file が新しい値になった後も使い続けてしまう）を書く。
			今の `SendService` は、`capabilities()` を呼ぶたびに `#rememberRuntime` で runtime を見て、runtimeId が変われば `#blocked` を消す。D-01 の後は、一致した報告が来た時点で `#gate` が通るので、サービスを作り直さずに戻る。
			"""
		satisfies: ["R-01", "F-02"]
	}
	"D-02": {
		title: "端末の宛先の ptyId を任意にし、同一性は handle と incarnationId で確かめる"
		text: """
			- `src/send/model.ts`：`TerminalSendTarget.ptyId` を `string | null` にする。
			- `src/send/target.ts` の `resolveTarget`：`ptyId = text(tab.ptyId)`（文字列で空でなければその値、ほかは null）。`identity_unavailable` の条件を `!handle || !incarnationId || !agentType` にする（ptyId を外す）。`no_session`（providerSession.id）と `asleep`（status が ready でない）の判定と順は変えない。
			- `compareTargets`：端末どうしで、leafId の違いは今のとおり `tab_changed`。`handle` か `incarnationId` が違えば `terminal_changed`。`ptyId` は両方が null でなく、違うときだけ `terminal_changed`。ほかの比べ方と順は変えない。
			- `targetFingerprint`：端末の指紋の項目から `ptyId` を外す（runtimeId、worktreeId、tabId、leafId、handle、incarnationId、agentType、providerSessionId）。指紋は送れるかの口と意図の間で宛先が変わっていないかを見るためのもので、`ptyId` が後から付いても指紋が変わらないようにする。
			- 端末の宛先を使う送信（`confirm`）、キーの組の答え（`answerConfirm` の keys）、端末の承認の1キー（`approvalConfirm` の promptId）は、どれも `resolveTarget` と `compareTargets` を通るので、ほかの変更は要らない。型が `string | null` になって型の誤りが出る箇所だけを直す。
			"""
		satisfies: ["R-02", "F-01"]
	}
	"D-03": {
		title: "送信の記録は ptyId に null を許し、schema は v1 のまま"
		text: "`src/send/journal.ts` の `parseRow` は `target` が物であることだけを見るので、`ptyId: null` の before の記録を今のまま読める。型（`BeforeRecord` の target）は D-02 の型に従う。schema の名前、行の形、`generation`（runtimeId と端末の incarnationId）は変えない。前の記録（ptyId が文字列）も読める。"
		satisfies: ["R-02"]
	}
	"D-04": {
		title: "send-live の端末の変化の場面は incarnationId を変える"
		text: "`src/tools/send-live.ts` の `ProbeTickets` の `change === 'terminal'` は、票の宛先の `incarnationId` に `-probe-changed` を足す（今は `ptyId`）。期待する拒みは今のまま `target_changed`／`terminal_changed` で、`terminal.send` は0回。`session` の場面と、ほかの場面・出力の形は変えない。`selectSendTargets` は変えない（端末の宛先だけ。構造化 Chat の実機の確かめは D-06 の試しの orca-web で行う）。"
		satisfies: ["F-03", "R-03"]
	}
	"D-05": {
		title: "Orca 1.4.272 の録画の fixture"
		text: """
			タスク担当が実物の Orca 1.4.272 から `RecordingRpcTransport` で録り、`sanitizeRecording` と `assertRecordingSafe` を通したファイルを `.workbench/diag/rec/rpc-orca-1.4.272-send.json` に置いた（`session.tabs.listAll` をこの worktree の snapshot だけに絞ったものと、`terminal.agentStatus`）。中身：構造化 Chat のタブ2つ、`ptyId` と `parentLayout.ptyIdsByLeafId` のない端末のエージェントのタブ1つ（`incarnationId`・`terminal`・`agentStatus.providerSession` あり）、`retiredTerminalSurfaces`。
			実装担当はこれを `test/fixtures/recordings/rpc-orca-1.4.272-send.json` に写してコミットし（中身は変えない）、テストで JSON を読んで使う（`test/orca/capabilities.test.ts` の読み方にならう）。`sanitize.test.ts` に録画の検査の対象として足すかは今の録画の扱いにならう。
			"""
		satisfies: ["R-02"]
	}
	"D-06": {
		title: "文書と実物の確かめ（タスク担当）"
		text: """
			- README.md の送信の節（送る経路の段）に、端末の宛先の同一性（handle・incarnationId・providerSession。ptyId はあるときだけ比べる）と、Orca の再起動のあとに機能の判定を確かめ直すこと（runtime ID が揃うまで送らない、揃えば orca-web の再起動なしに戻る）を書く。
			- 実物の確かめ：この worktree に自分で起動した使い捨ての宛先（端末の Claude Code と構造化 Chat）だけに、直したコードで送る。端末は `npm run send:live`、構造化 Chat は別のポート（8793 など）で起動した試しの orca-web（専用の `ORCA_WEB_SETTINGS_FILE` で `sendEnabled` 真、専用の `ORCA_WEB_SENDS_DIR`）の `/api/send/intent`・`confirm`。常駐の orca-web（8791）には書かない。結果を report.md に記録する。
			"""
		satisfies: ["R-03"]
	}
}

compatibility: "記録の schema は v1 のまま、前の記録を読める。指紋から ptyId を外すので、配った後に開きっぱなしの画面は、端末の宛先で一度だけ「宛先が変わりました」を出しうる（押せば新しい指紋で続けられる。常駐の orca-web を入れ替えるには再起動が要るので、その時に画面も読み直される）。送信の門の形は変えない。"

risks: [
	"同一性を緩めすぎる：handle と incarnationId は Orca が pty の今の持ち主ごとに出す値で、`terminal.inspectProcess` に `expectedIncarnationId` を付けて読むので、別の pty に変わったことはこの2つで分かる。ptyId は両方にあるときは今のとおり比べる",
	"一致しない状態が続くと、呼ぶたびに確かめ直す（CLI を3回起こす）。接続できないときの今の扱いと同じで、送らない",
]
