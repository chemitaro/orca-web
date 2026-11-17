package spec

goal: "開く口を、押した端末で worktree を先に表示してからタブを選ぶ形に直し、端末の見分けと前面に出すことを足し、ボタンの言葉と文書を直し、実機で確かめて閉じる。"

steps: {
	"S-01": {title: "開く口の送る順・門・端末の見分け・前面に出す（D-01、D-02、D-03、D-04 のサーバー、D-05 のサーバー）", realizes: ["R-01", "R-02", "R-03", "R-04", "R-05", "F-01", "F-02"], status: "todo", session: "impl"
		text: "対象：`src/orca/open.ts`・`open-gates.ts`・`open-target.ts`、新しい `src/orca/open-device.ts`・`src/orca/raise.ts`、`src/orca/wiring.ts`、`src/server/app.ts`（handleOpen と OPEN_ERROR_STATUS だけ）・`main.ts`、`test/` の下（開く口・門・選び方の既存のテスト、新しい `test/orca/open-device.test.ts`・`test/orca/raise.test.ts`、開く道のテスト）。lsof と open は注入した runner でだけ呼び、テストは実物を呼ばない。既存のテストの期待は、送る順が変わった分（worktree.activate が先）だけを直す。確かめ：T-01〜T-06。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットして止まり HEAD を報告する"
	}
	"S-02": {title: "ボタンの言葉とクライアントで前面に出す口（D-04 の画面、D-05 の画面）", realizes: ["R-04", "R-05"], status: "todo", after: ["S-01"], session: "ui"
		text: "対象：`web/embed/open-control-view.js`（openResult、OPEN_MESSAGES）、`web/embed/open-control.js`（runOpen の raiseClient）、`web/embed/open-button.js`（sandbox の印）、`test/web/` の開くボタンのテスト。見た目（CSS）は変えない。確かめ：T-07、T-08、T-11。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットして止まり HEAD を報告する"
	}
	"S-03": {title: "文書と実機の確かめ（D-06）", realizes: ["R-01", "R-02", "R-04"], status: "todo", after: ["S-02"], session: "doc"
		text: "タスク担当が行う。README.md と AGENTS.md を D-06 のとおり直す。一時の orca-web で、作業の済んだこのリポジトリの worktree へ開き、前と後を report.md に残して元へ戻す。試しの画面（`npm run trial`）を Mac の幅と 390px で写す。Chrome と Safari で、埋め込みのボタンの iframe から `orca://` へ移れるかを確かめる（ホストの Mac で、結果を client に見立てた一時の確かめ用のページで移る口だけを試す）。クライアントの確かめは統括に ask で頼む。確かめ：T-09、T-10。完了：`npm run lint`、`npm test`、`npm run build` が通り、コミットする"
	}
}

tests: {
	"T-01": {title: "OpenService：host で agent-session のタブ → worktree.activate、session.tabs.activate の順、どちらも navigation host。端末（ready・handle）→ worktree.activate、terminal switch。タブなし → worktree.activate だけ", verifies: ["R-01"]}
	"T-02": {title: "OpenService：client → worktree.activate と session.tabs.activate を navigation clients で送り、端末のタブも tabId・leafId で session.tabs.activate、terminal switch を呼ばない", verifies: ["R-02"]}
	"T-03": {title: "OpenService：1 が rpc の失敗・時間切れ（unconfirmed）なら 2 を送らずその誤り。2 の失敗は ok:false と worktreeShown:true。成功は device・screen:unverified を持つ", verifies: ["R-05"]}
	"T-04": {title: "open-device：normalizeAddress（::ffff:、zone、大文字）、classifyOrigin（loopback、ホストの口、remote、undefined）、resolveOpenDevice（host は peers を呼ばない、peers の失敗は device_unknown、集合にあれば client、なければ device_not_connected）", verifies: ["R-03", "F-01"]}
	"T-05": {title: "RuntimePeers：lsof の -F n の出力（v4、[v6]、複数、LISTEN の行がない）を解く、終了コード 1 で空は空の集合、ほかの失敗・時間切れは ok:false、websocket がない runtime は空の集合、authToken を読まない・出さない。引数の配列と絶対パス", verifies: ["R-03"]}
	"T-06": {title: "前面に出す：host の成功で1回だけ raise を呼び raised を入れる、raise が false でも ok、client と失敗では呼ばない。raiseOrca は /usr/bin/open -b com.stablyai.orca を引数の配列で呼び、終了コードで true・false。門は host と clients を通し all・caller・なしを拒む。app の handleOpen は req.socket.remoteAddress を渡し、新しい誤りの HTTP の状態が 409・503", verifies: ["R-04", "F-02"]}
	"T-07": {title: "openResult：host と client の成功の言葉、mayCreateInitialTerminal の注記、worktreeShown の失敗、device_not_connected・device_unknown の言葉", verifies: ["R-05"]}
	"T-08": {title: "runOpen：done で device client のときだけ raiseClient を1回呼ぶ、host・失敗では呼ばない、raiseClient が投げても結果は done のまま", verifies: ["R-04"]}
	"T-09": {title: "README.md と AGENTS.md に、端末の決め方・clients の制約・relay・前面・sandbox の印・screen unverified・新しいモジュールがあり、『navigation: \"host\" だけ』の古い記述がない（rg）", verifies: ["R-02", "R-04"]}
	"T-11": {title: "open-button.js の iframe の sandbox が allow-scripts allow-same-origin allow-top-navigation-to-custom-protocols", verifies: ["R-04"]}
	"T-10": {title: "実機：ホストで開いた前と後の左の一覧・タブの帯の写しと、元へ戻したことが report.md にある。クライアントの確かめの結果（本人）か、未実施の理由がある", verifies: ["R-01", "R-02"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門：
	- merge：owner（統括が行う。タスク担当はマージしない）
	- 区切りのレビュー：なし（S-01・S-02 は小さく、final-quality-gate で全体を見る）
	- final-quality-gate：S-03 の後、範囲 `27b01fe..HEAD`。レビュアー quality-gate-reviewer（Claude Opus 5.5 / medium）。観点 functional-correctness、requirements-closure、test-adequacy、security-baseline（門が host と clients の activate だけを通す。タブやファイルを作る操作を足さない。authToken を読まない・出さない。lsof と open は絶対パスと引数の配列。要求の元の見分けに頭を使わない）。second_opinion：chatgpt（`chatgpt-final-quality-gate-strict`、ChatGPT GPT-6 / Extra High。統括の補足）。test_commands：`npm run lint`、`npm test`、`npm run build`。record_paths：`spec-dock/initiatives/00000-00999/iss-00047/`（Git の外）
	"""

rollback: "PR を戻す（開く口は前の1回だけ送る形に戻り、ホストで agent-session のタブの worktree へは切り替わらない不具合に戻る）。"

exit: "PR を開き、CI が通り、統括に PR と合格のコミットと closure.md を報告した状態。"

execution: {
	sessions: {
		spec: {task: "仕様化とタスク担当", model: "claude-opus-5-5", effort: "medium", rationale: "統括が依頼書で選んだ（事実の記録）"}
		impl: {task: "S-01 開く口のサーバーとテスト", model: "gpt-6.1-sol", effort: "medium", rationale: "依頼書の本人の指示（テストで確かめられるので Codex GPT-6.1 Sol / medium）。provider codex。chat-scratch の symlink の拒否や確認の画面で止まったら待たずに worker-stop し Claude Opus 5.5 / medium に切り替える（統括が了承済み。逸脱として記録）"}
		ui:   {task: "S-02 ボタンの言葉と前面に出す口", model: "claude-opus-5-5", effort: "medium", rationale: "画面の JavaScript（依頼書の本人の指示、方針のフロントエンドの standard）。provider claude"}
		doc:  {task: "S-03 文書と実機の確かめ", model: "claude-opus-5-5", effort: "medium", rationale: "実機の確かめと文書はタスク担当が行う（文書の手順の同じセッションの例外）"}
	}
	reviews: {
		spec:  {role: "spec-reviewer", model: "claude-opus-5-5", effort: "high"}
		final: {role: "final-quality-gate", after: "S-03", model: "claude-opus-5-5", effort: "medium", second_opinion: "chatgpt-final-quality-gate-strict（ChatGPT GPT-6 / Extra High）"}
	}
}
