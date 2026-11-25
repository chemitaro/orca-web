package spec

design: {
	"D-01": {title: "カードの組み立て（`web/apexes-cards-view.js` 純粋な関数）", text: "頂点の一覧の文書の頂点（reasons、members、iss-00078 の束の問い）から R-01 のカードの配列を作る。問いの節は iss-00078 が文書に出す attention（iss-00079 の team の節があればそれを使い、なければ iss-00078 の文書に Dispatch ごとの `attention` と task の題名を足す）。", satisfies: ["R-01"]}
	"D-02": {title: "メンバーの枠（`web/apexes.js`・`apexes-dom.js`）", text: "iss-00077 の `mountAgentFrame` に引数 `{ compose: false }` を足し、src に `&compose=off`。見出しの帯と［頂点に戻る］。選択の状態に `memberId` を持つ（URL には出さない）。", satisfies: ["R-02"]}
	"D-03": {title: "`compose=off`（`web/embed/agent-frame.js`）", text: "`params.get('compose') === 'off'` なら送る欄の要素を hidden にし、送信の状態の読み（pollSend）を始めない。質問・承認のカードと会話は今のまま。", satisfies: ["R-02", "F-01"]}
	"D-04": {title: "下書きの口（`web/embed/draft-receiver.js` 純粋な判定と、agent-frame の配線）", text: "`acceptDraft({ origin, source, data }, { selfOrigin, parent, composeOn, sendPhase, currentText })` が、R-03 の条件のときだけ `{ text }` を返す（text は 1,000 字まで、制御文字を除く）。agent-frame は返されたときだけ `sendFlow.input(text)` と描き直し。親の側は `buildDraftText(card)` で決めた型の文を作る。", satisfies: ["R-03", "F-01"]}
}
