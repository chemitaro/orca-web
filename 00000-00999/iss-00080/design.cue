package spec

design: {
	"D-00": {title: "文書の追加（`src/apex/`）", text: "各頂点に `waitingMembers`（`{ id, title, mark }`。build の member_blocked・member_waiting の判定と同じ関数で当たったメンバー）と `questions`（`{ dispatchId, taskTitle, kind }`。A3 と同じ束の Dispatch の attention の input→ask、approval→gate。A3 の猶予や頂点の状態に関わらず、問いがあれば出す）を足す。", satisfies: ["R-01"]}
	"D-01": {title: "カードの組み立て（`web/apexes-cards-view.js` 純粋な関数）", text: "頂点の reasons・waitingMembers・questions から R-01 のカードの配列を作る。", satisfies: ["R-01"]}
	"D-02": {title: "メンバーの枠（`web/apexes.js`・`apexes-dom.js`）", text: "iss-00077 の `mountAgentFrame` に引数 `{ compose: false }` を足し、src に `&compose=off`。見出しの帯と［頂点に戻る］。選択の状態に `memberId` を持つ（URL には出さない）。", satisfies: ["R-02"]}
	"D-03": {title: "`compose=off`（`web/embed/agent-frame.js`）", text: "`params.get('compose') === 'off'` なら送る欄の要素を hidden にするだけ。送信の状態の読み（pollSend）は今のとおり始める（カードの答えられるかに要る）。質問・承認のカードと会話は今のまま。", satisfies: ["R-02", "F-01"]}
	"D-04": {title: "下書きの口（`web/embed/draft-receiver.js` 純粋な判定と、agent-frame の配線）", text: "`acceptDraft({ origin, source, data }, { selfOrigin, parent, composeOn, sendPhase, currentText })` が `{ ok: true, text }` か `{ ok: false, reason }` を返す（R-03 の条件。phase は compose・changed だけ受ける。text は改行（\\n）のほかの制御文字を除き、1,000 字を超えれば受けない reason too_long）。agent-frame は ok のときだけ `sendFlow.input(text)` と描き直し、結果を親に `orca-web:draft-result` で返す。受け口を登録し最初の送信の状態を読んだ後に `orca-web:ready` を親に1回送る。親の側は `buildDraftText(card)` で決めた型の文を作り、`createDraftSender`（枠を作るたびに `frameCreated(frame)` で準備の印を戻し、今の枠からの ready だけを覚える。送る時に準備できていればすぐ、まだなら ready を待つ。10 秒の上限、結果の帯）で送る。", satisfies: ["R-03", "F-01"]}
}
