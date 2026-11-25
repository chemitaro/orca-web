package spec

goal: "対応のカードが出て、メンバーの許可待ちに同じ枠で答えられ、質問・判断が頂点の下書きになることが、テストで確かめられている。"

steps: {
	"S-01": {title: "compose=off と下書きの口（D-03、D-04）", text: "対象：`web/embed/agent-frame.js`、新しい `web/embed/draft-receiver.js`、STATIC_FILES、テスト（agent-navigation のテストが新しいファイルを読むなら合わせる）。確かめ：T-01・T-02", realizes: ["R-02", "R-03", "F-01"], session: "impl"}
	"S-02": {title: "カードとメンバーの枠（D-01、D-02）", text: "対象：新しい `web/apexes-cards-view.js`、`web/apexes.js`・`apexes-dom.js`・`style.css`、必要なら `src/apex/` の文書に Dispatch ごとの attention と題名、テスト、README。確かめ：T-03〜T-05。実装担当の最後の手順。区切りのレビュー：あり（cp1）", realizes: ["R-01", "R-02", "R-03"], after: ["S-01"], session: "impl"}
}

tests: {
	"T-01": {title: "compose=off：送る欄の要素が hidden で pollSend が始まらない。承認・質問のカードの答えの既存のテストが通る", verifies: ["R-02", "F-01"]}
	"T-02": {title: "acceptDraft：同じオリジン・親から・composeOn・phase が idle か ready・入力欄が空のときだけ text を返す。別のオリジン・親でない source・compose off・sending・書きかけ、のどれでも null。返しても送信の関数は呼ばない", verifies: ["R-03", "F-01"]}
	"T-03": {title: "カード：member_blocked のメンバー → 見て答える、attention input → 質問、approval → 判断、apex_waiting → 会話へ。対応がなければ空", verifies: ["R-01"]}
	"T-04": {title: "見て答える：枠が `/embed/agent?id=<メンバー>&compose=off` に作り直され、帯と頂点に戻るが出る。頂点に戻るで頂点の枠に戻る", verifies: ["R-02"]}
	"T-05": {title: "頂点に伝える：buildDraftText が決めた型の文と Dispatch の id を作り、postMessage の宛先のオリジンが自分のオリジン", verifies: ["R-03"]}
}

verification: """
	最後に `npm run lint`、`npm test`、`npm run build`（Node 24）。
	関門：
	- merge：agent
	- merge_permission：本人「ユーザーの許可なくマージする権限を付与します」（2026-11-25、利用者との Claude Code の会話。orca-web の PR を、最終品質ゲートと CI の合格を条件にエージェントがマージしてよいという許し。全文は公開しない）
	- 区切りのレビュー：cp1。最後の手順 S-02、code-reviewer（Opus 5.5 / medium）
	- 最終品質ゲート：範囲 `<開始のコミット>..HEAD`。追加の観点：security-baseline（postMessage の受け口、送る経路を足さない）。second_opinion：none
	- test_commands：`npm run lint`、`npm test`、`npm run build`
	- record_paths：なし
	"""
exit: "最終品質ゲートが合格し、PR の CI が通り、merge.md の条件でエージェントがマージした状態。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当）", model: "opus", effort: "high", rationale: "利用者が会話で起動したセッションの値の記録"}
		impl: {task: "実装（S-01・S-02。Claude の実装担当、Orca の worker）", model: "opus", effort: "medium", rationale: "provider: claude。本人の指示（Codex を使わず Opus 5.5）。方針 §2 フロントエンドの実装担当 standard"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー（code-reviewer）", after: "S-02", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-02", model: "opus", effort: "medium"}
	}
}
