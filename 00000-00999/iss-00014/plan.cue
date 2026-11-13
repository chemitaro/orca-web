package spec

// 計画（Issue）。型 specdock/v1。

goal: "`npm run trial` で試しの orca-web と試しの画面を起動し、Mac の幅と幅 390px で3つの部品が動き、許していないオリジンで拒まれることを確かめ、本人が開く URL と見てほしい点を渡す。"

// 開始のコミット：899491691d883d410dd42dee811b1bf86c0503ee（main と同じ。worktree iss-00014、ブランチ chemitaro/iss-00014）。
// 各手順はテスト先行（tdd）。仕様の読み方に迷ったら、直さずにタスク担当に問う。

steps: {
	"S-01": {
		title:    "試しの静的なサーバーと起動の道具（D-02、D-03）と、許しの確かめのテスト（D-04 のテスト）を作る"
		text:     "対象：`src/tools/trial-host.ts`、`src/tools/trial.ts`、`package.json`（`trial` の script）、`test/tools/trial-host.test.ts`、`test/tools/trial.test.ts`、`test/server/trial-origins.test.ts`。`web/trial/` のファイルはまだないので、サーバーのテストは一時のディレクトリに置いた仮のファイルで確かめる。確かめ：T-01、T-02、T-03、T-04。完了：`npm run lint`、`npm test`、`npm run build` が通り、`node src/tools/trial.ts --dry-run` が URL と環境を出す（実機の Orca に触れない）。区切りのレビュー：なし。止まって HEAD を報告する（セッション impl の最後）"
		realizes: ["R-04", "F-01", "F-02"]
		status:   "todo"
		session:  "impl"
	}
	"S-02": {
		title:    "試しの画面（D-01）を作る"
		text:     "対象：`web/trial/`（index.html、trial.js、trial-view.js、trial.css、phone.html、forbidden.html、forbidden.js）、`test/web/trial-view.test.ts`。S-01 のサーバーの表とファイル名を合わせる。確かめ：T-05。完了：`npm run lint`、`npm test`、`npm run build` が通る。`node src/tools/trial.ts --state-dir <一時のディレクトリ>` を起動し、Chrome で `/`、`/phone.html`、`/forbidden.html` を開いて描けることを見る（Orca で開くは押さない。送信は有効にしない）。終わったら止める。区切りのレビュー：なし。止まって HEAD を報告する"
		realizes: ["R-01", "R-02", "R-03", "F-01"]
		after:    ["S-01"]
		status:   "todo"
		session:  "ui"
	}
	"S-03": {
		title:    "実機の確かめ（D-04、D-05）と、見つかった不足の直し（D-06）"
		text:     "タスク担当が行う。`npm run trial -- --tailscale-ip <IP>` を裏で起動し、Chrome で Mac の幅の `/`、`/phone.html`、`/forbidden.html` を確かめ、写しを `.workbench/trial-evidence/` に置く。開くボタンは worktree `iss-00014`（このリポジトリ）でだけ押す。送信は D-05 のとおり試しの送り先の2つだけ。不足が見つかったら、テストで確かめられる直しは impl、画面の直しは ui のセッションに、新しい worker として依頼する（そのときは state と report に記録する）。確かめ：T-06、T-07、T-08。完了：report.md の Verification に結論と件数がある"
		realizes: ["R-01", "R-02", "R-03", "R-04", "F-01", "F-02", "F-03"]
		after:    ["S-02"]
		status:   "todo"
		session:  "doc"
	}
	"S-04": {
		title:    "README.md、AGENTS.md、report.md を書く（D-07）"
		text:     "タスク担当が行う（文書の手順）。確かめ：T-09。完了：README.md と AGENTS.md が出来上がったものと合い、report.md に開く URL、見てほしい点、止め方がある。`npm run lint` が通る"
		realizes: ["R-04"]
		after:    ["S-03"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "`buildTrialPlan`：既定で orca-web は 8792、`ORCA_WEB_READ_ORIGINS` は `http://127.0.0.1:47900` だけ。Tailscale の IP を渡すと `http://<IP>:47900` が足され、`ORCA_WEB_TAILSCALE_IP` が付く。47800 と 47901 のオリジンは入らない。設定と送信の記録は state-dir の下。呼んだ側の `ORCA_WEB_SETTINGS_FILE`・`ORCA_WEB_SENDS_DIR`・`ORCA_WEB_READ_ORIGINS` は引き継がず、`ORCA_BIN` は引き継ぐ。ポートが 8791・47800・重なり、state-dir が常駐の既定の置き場の下なら誤り。不正な IP は誤り", verifies: ["F-02", "R-04"]}
	"T-02": {title: "起動の道具：設定のファイルがなければ `sendEnabled: false` で作り、あれば変えない。state-dir は 0700。子の orca-web が health に答えないと子を止めて 1。ポートが使われていれば起動した分を止めて 1。SIGTERM で子に SIGTERM を送り、pid のファイルを消して 0（子のプロセスは仮の node のスクリプトで差し替える）", verifies: ["F-02", "R-04"]}
	"T-03": {title: "試しの静的なサーバー：表のファイルだけを返し、ほかは 404（`..` を含む道も）、GET・HEAD 以外は 405、許さない Host は 421。HTML の CSP の script-src・connect-src・frame-src に待ち受けのアドレスごとの orca-web の基の URL があり、ほかのオリジンがない。`/config.json` が orcaPort と highlight を返す。`Cache-Control: no-store`", verifies: ["R-04", "F-01"]}
	"T-04": {title: "許しの確かめ：`buildTrialPlan` の環境から組んだ orca-web で、47900 の要約の GET・OPTIONS は通り ACAO が付き、47901 と 47800 は 403。`/embed/agent` と `/embed/open-button` の `frame-ancestors` が試しのオリジンだけ。47901 の Origin の `POST /api/token`・`POST /api/send/intent` は 403 で、送信の口と Orca を呼ばない。orca-web は `/trial/index.html` を配らない（404）", verifies: ["F-01"]}
	"T-05": {title: "`buildTrialView`：`send-test` の節が先頭、ほかは要約の順。節の名前はパスの末尾、数は counts、丸は mark・種類・detail を持ち、知らない mark は unknown。worktree の id がなければパスを開くボタンに使う。stale と connection が `connected` でないときは帯の文を返す。題名や本文の項目を返さない", verifies: ["R-01", "R-02", "R-03"]}
	"T-06": {title: "実機（Mac の幅）：試しの画面の節とエージェントの数が同じ時の要約の API と合う。丸を選ぶと iframe に詳細と会話が出る。開くボタンが出て、worktree `iss-00014` で押すと Orca で前面に出る", verifies: ["R-01", "R-02", "R-03"]}
	"T-07": {title: "実機（幅 390px の枠）：節が1列で横にはみ出さず、開くボタンの iframe がなく、丸を選ぶと節の下に iframe が開き、詳細が畳まれ、iframe の中に Orca で開くが出ない。試しの送り先の Claude と Codex に iframe から1回ずつ送り（Mac の幅と枠のどちらかで）、結果と試しの `sends.jsonl` の行の数の増えが記録される", verifies: ["R-01", "R-02", "R-03", "F-03"]}
	"T-08": {title: "実機（許さないオリジン）：`http://127.0.0.1:47901/forbidden.html` で、要約の読み・トークン・送る意図が拒まれ、詳細とチャットの iframe とボタンが描かれない。常駐の 8791 の `/api/health` の pid が確かめの前と後で同じ", verifies: ["F-01", "F-02"]}
	"T-09": {title: "文書：README.md の試しの節の命令とポートが道具と合い、AGENTS.md に `web/trial/` と `src/tools/trial*.ts` がある。report.md に開く URL、見てほしい点、止め方があり、実際の Tailscale の IP がない", verifies: ["R-04"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。実機の確かめは件数と結論だけを report.md に書き、写しはコミットしない。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：agent（統括がマージする。タスク担当はマージしない）。merge_permission：統括の依頼書（2026-11-14）の「マージ（統括が行う）」
	- 区切りのレビュー：なし（足すだけの試しの道具と画面で、既存の API を変えない。最終品質ゲートで全体を見る）
	- 最終品質ゲート：範囲 `8994916..HEAD` の全体（`src/`、`web/`、`test/`、`package.json`、`README.md`、`AGENTS.md`）。観点は既定に、security-baseline（試しの orca-web が試しのオリジンだけを許す、0.0.0.0 で待ち受けない、常駐の設定と記録に触れない、秘密と実際の IP を出さない、試しの画面が textContent で描く）を足す。second_opinion：none（standard）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts` と `test/tools/trial*.test.ts`）
	- record_paths：なし（report.md は Git の外で、SpecDock が保存する）
	"""
rollback: "PR を戻せば `web/trial/`、`src/tools/trial*.ts`、`npm run trial` がなくなる。orca-web の API と常駐のサービスは変わらない。試しの置き場（`.workbench/trial/`）は消してよい。"
exit:     "最終品質ゲートが `8994916..HEAD` で合格し、実機の確かめが report.md にあり、PR の CI が通り、試しのサーバーが本人の確かめのために動いている。"

execution: {
	sessions: {
		spec: {task: "仕様化（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "medium", rationale: "統括の依頼書（2026-11-14）：Opus 5.5 / medium（方針の「タスク担当 × standard」から統括が選んだ）"}
		impl: {task: "試しの静的なサーバー、起動の道具、許しのテスト（S-01。Codex の実装担当、Orca の worker）", model: "gpt-6.1-sol", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：テストで確かめられるコードは Codex GPT-6.1 Sol / medium。方針 §2 の実装担当（バックエンド）× standard と同じ。provider: codex"}
		ui: {task: "試しの画面（S-02。Claude の実装担当、Orca の worker）", model: "claude-opus-5-5", effort: "medium", rationale: "本人の指示（2026-11-13、統括の依頼書）：試しの画面と埋め込みの見た目は Claude Opus 5.5 / medium。方針 §2 の実装担当（フロントエンド）× standard と同じ。provider: claude"}
		doc: {task: "実機の確かめと文書（S-03、S-04。タスク担当が自分で行う）", model: "opus", effort: "medium", rationale: "方針の §2 注記：文書を書く手順はタスク担当が書く。実機の確かめは送信の宛先の判断を含むので、タスク担当が自分で行う"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer）", model: "opus", effort: "high"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer）", after: "S-04", model: "opus", effort: "medium"}
	}
}
