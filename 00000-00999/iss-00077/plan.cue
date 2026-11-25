package spec

goal: "`/apexes` で頂点を選ぶと同じ画面に会話が出て送れ、見えない間は会話の接続が止まり、完了の新着が分かることが、テストと試しの orca-web で確かめられている。"

steps: {
	"S-01": {
		title:    "/embed/agent の frame-ancestors に 'self'（D-01）"
		text:     "対象：`src/server/app.ts`、`test/server/transcript-api.test.ts`・`test/server/app.test.ts`・`test/server/trial-origins.test.ts` の CSP の確かめ（/embed/agent は 'self' を含み、ほかは今のまま）。確かめ：T-01。完了：`npm run lint`、`npm test`、`npm run build`。コミットして次へ"
		realizes: ["R-03"]
		session:  "impl"
	}
	"S-02": {
		title:    "見えない間の停止（D-05）と送信の処理中の印（D-04 の agent-frame 側）"
		text:     "対象：新しい `web/embed/visibility-gate.js` と `test/web/visibility-gate.test.ts`、`web/embed/agent-frame.js`（EventSource を持ち閉じる、状態の読みの予約を止める、処理中の data 属性）、`src/server/app.ts` の STATIC_FILES、`test/web/agent-navigation.test.ts` が新しいファイルを読むなら合わせる、`test/web/agent-page.test.ts` の入口の確かめ。送信の流れ（send-view.js）を変えない。確かめ：T-02、T-03、T-11。完了：lint・test・build。コミットして次へ"
		realizes: ["R-04", "F-01", "F-02"]
		after:    ["S-01"]
		session:  "impl"
	}
	"S-03": {
		title:    "2ペイン、選択、枠の作り直し、切り替えの確かめ、幅（D-02〜D-04、D-07）"
		text:     "対象：`web/apexes.html`、`web/apexes.js`、`web/apexes-view.js`、`web/apexes-dom.js`、`web/style.css`、`test/web/apexes-view.test.ts`、`test/web/apexes-dom.test.ts`、必要なら新しい `test/web/apexes-navigation.test.ts`（既にある iframe の src や location を書き換えないことのソースの確かめ）。確かめ：T-04〜T-06、T-08。完了：lint・test・build。コミットして次へ"
		realizes: ["R-01", "R-02", "R-06", "F-01"]
		after:    ["S-02"]
		session:  "impl"
	}
	"S-04": {
		title:    "新着の点と見出しの数（D-06、D-09）"
		text:     "対象：`web/apexes-view.js`、`web/apexes.js`、`web/apexes-dom.js`、テスト。確かめ：T-07、T-10。完了：lint・test・build。実装担当 impl の最後の手順。止まって HEAD を報告する。区切りのレビュー：あり（cp1、開始のコミット..HEAD）"
		realizes: ["R-05", "R-08"]
		after:    ["S-03"]
		session:  "impl"
	}
	"S-05": {
		title:    "AGENTS.md・README と試しの orca-web での確かめ（タスク担当。D-08）"
		text:     "タスク担当が行う。AGENTS.md の文言と地図、README を直す。別のポートの試しの orca-web（送信は無効の既定）で、ブラウザで `/apexes` を開き、頂点を選んで会話が出ること、幅 390px の1列、別の頂点への切り替えで iframe が1つのままであることを確かめ、report.md に記録する（題名・会話・パスを書かない）。確かめ：T-09。完了：lint・test・build が通り、report.md に結論がある"
		realizes: ["R-07"]
		after:    ["S-04"]
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "CSP：/embed/agent の frame-ancestors が `'self' <SpecDock のオリジン>`、SpecDock のオリジンがなければ `'self'`。/embed/open-button と /、/apexes、/settings は今の値（SpecDock だけか 'none'）", verifies: ["R-03"]}
	"T-02": {title: "visibility-gate：hidden 29 秒で onPause なし、30 秒で1回。pause 前に visible で取り消し。pause の後の visible で onResume 1回。hidden と visible を繰り返しても onPause・onResume は対で、重ならない", verifies: ["R-04"]}
	"T-03": {title: "agent-frame（ソースの確かめか注入）：EventSource を変数に持ち、pause で close し、resume で新しい EventSource を1本作る。body の data-unsettled は、送る欄の sending・checking・unknown、質問のカードの送る途中・partial・結果不明、承認のカードの送る途中・結果不明の間だけ付き、送信の流れの関数を呼び替えていない", verifies: ["R-04", "F-01", "F-02"]}
	"T-11": {title: "状態の読みの停止と再開：pause の後は読みの予約がなく、読みの途中で pause してもその後に予約が作られない。resume で読みが1回すぐ起き、以後の輪は1本だけ（注入した時計と fetch で、予約の数を数える）", verifies: ["R-04", "F-02"]}
	"T-04": {title: "選択の純粋な関数：pickSelection（要求の id、items にない要求の id は missing 付きでそのまま、autoPick 真で needs_action の先頭、autoPick 偽なら null）。stale が偽で items が空でない最初の文書に `?apex=` の id がなければ選ばず `?apex=` を外す。stale か空の文書では外さず待つ（入口の注入した口で確かめる）。狭い幅で開くと何も選ばず、「← 一覧」の後の描き直しで選び直さない、selectionUrl（足す・替える・外す、ほかの引数を保つ）、frameSrc（id のエンコード）", verifies: ["R-01"]}
	"T-05": {title: "枠：mountAgentFrame を別の id で3回呼ぶと iframe は1つで src が最後の id。同じ id では作り直さない。apexes の web のソースに、既にある iframe の src の代入、location の代入・assign・replace、window.open がない", verifies: ["R-02", "F-02"]}
	"T-06": {title: "切り替えの確かめ：iframe の body に data-unsettled があれば確かめの文が出て、取り消せば替わらない。印がない・読めない（例外）なら替わる", verifies: ["F-01"]}
	"T-07": {title: "新着の点：done で見たことがない → 点。見た時刻より最後の活動が新しい → 点。古い → なし。working → なし。pruneSeen が 14 日より古いものを落とし、doc にない id は project が null・stale 偽・items が空でないときだけ落とす（project 付き・stale・空の文書では残る）。眠っている段の done には点を出さない。10 秒続けて出した後に seen が書かれ、9 秒で別の頂点に替えると書かれない（注入した時計）。localStorage が例外を投げても描画が続く", verifies: ["R-05"]}
	"T-08": {title: "幅：900px 未満で選択の class によって一覧と右のペインの片方だけが出る CSS があり、「← 一覧」で `?apex=` が外れる", verifies: ["R-06"]}
	"T-10": {title: "見出しの数：unverified で眠っているに入った頂点があっても、見出しの作業中の数が作業中の段の件数に等しい。対応が必要 0 で強調の class がない", verifies: ["R-08"]}
	"T-09": {title: "試しの orca-web（ブラウザ）：頂点を選ぶと会話が出る、3回替えて iframe が1つ、幅 390px で横のスクロールがない、AGENTS.md と README の文言が直っている", verifies: ["R-07", "R-01", "R-06"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門（coding-task の `## 関門`）：
	- merge：agent
	- merge_permission：本人「ユーザーの許可なくマージする権限を付与します」（2026-11-25、利用者との Claude Code の会話。orca-web の PR を、最終品質ゲートと CI の合格を条件にエージェントがマージしてよいという許し。全文は公開しない）
	- 区切りのレビュー：cp1。最後の手順 S-04、範囲 `<開始のコミット>..<S-04 の HEAD>`、レビュアー code-reviewer（Opus 5.5 / medium）。理由：CSP と埋め込みの規則と画面がまとまってから見る
	- 最終品質ゲート：範囲 `<開始のコミット>..HEAD` の全体。追加の観点：security-baseline（frame-ancestors を広げすぎない、同じオリジンの contentDocument の読みを送る欄の印だけに限る）、frontend-safety（innerHTML を足さない、localStorage を try/catch で包む）、reliability（古い接続を残さない）。second_opinion：none
	- test_commands：`npm run lint`、`npm test`、`npm run build`
	- record_paths：なし
	"""
rollback: "PR を戻せば、指揮の画面は一覧だけに戻り、/embed/agent の CSP と agent-frame は今のまま。localStorage の鍵は残るが読まれない。"
exit:     "最終品質ゲートが合格し、試しの orca-web での確かめが report.md にあり、PR の CI が通り、merge.md の条件でエージェントがマージした状態。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。利用者との会話のセッション）", model: "opus", effort: "high", rationale: "利用者が会話で起動した Claude Code のセッションの値の記録（本人の指示 2026-11-25）"}
		impl: {task: "実装（S-01〜S-04。Claude の実装担当、Orca の worker、この Issue の worktree）", model: "opus", effort: "medium", rationale: "provider: claude。本人の指示（2026-11-25：Codex を使わず Opus 5.5）。方針 §2 の実装担当（フロントエンドの設計と実装）standard"}
		doc: {task: "文書と試しの確かめ（S-05。タスク担当）", model: "opus", effort: "high", rationale: "方針 §2 の注記：文書はタスク担当が書く"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー（code-reviewer）", after: "S-04", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目なし）", after: "S-05", model: "opus", effort: "medium"}
	}
}
