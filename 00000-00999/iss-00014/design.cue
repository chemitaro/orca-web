package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"3つの部品を、SpecDock と同じ使い方（別のオリジンの画面から、読み取りの CORS、1行のスクリプト、iframe）で試す",
	"常駐の orca-web と本物の SpecDock に触れずに、本人が Mac とスマホから確かめられる試しを1つの命令で起動し、止める",
]

current: "3つの部品はあり、単体のテストと、iss-00019 までの実機の確かめ（一時の port の `npm start`）で動く。別のオリジンの画面の中に置いて、Mac とスマホの幅で通して確かめたことはない。"
target:  "`npm run trial` で、試しの orca-web（8792）、試しの画面（47900）、許さないオリジンの画面（47901）が起動し、試しの画面で3つの部品が動き、許さないオリジンでは拒まれる。"

design: {
	"D-01": {
		title: "試しの画面（`web/trial/`）"
		text: """
			ファイル：`web/trial/index.html`（本体）、`web/trial/trial.js`（読みと DOM）、`web/trial/trial-view.js`（要約の文書から描くものを組む純粋な関数）、`web/trial/trial.css`、
			`web/trial/phone.html`（幅 390px・高さ 844px の iframe に `./index.html` を入れる枠）、`web/trial/forbidden.html` と `web/trial/forbidden.js`（許さないオリジンで3つの部品を試す画面）。
			設定：画面は同じオリジンの `./config.json`（D-02 のサーバーが返す）から `orcaPort` を読み、orca-web の基の URL を `http://${location.hostname}:${orcaPort}` にする（127.0.0.1 で開けば 127.0.0.1、tailnet の IP で開けばその IP。orca-web の Host の許しと合う）。
			本体の描き方（画面案 A に倣う）：
			- 要約を 10 秒ごとに読む（見えない間は読まない）。読めない（CORS で拒まれる、届かない）ときと、`stale`・`connection.state` が `connected` でないときは、上の帯に理由を示す。
			- `trial-view.js` の `buildTrialView(summary, {highlight})`：worktree の節の並び（パスの末尾が `highlight` の `send-test` の節を先頭に、ほかは要約の順）、節ごとの名前（パスの末尾）、ブランチ、プロジェクト名、状態ごとの数、
			  エージェントごとの丸（mark、種類、since からの経過、iframe の URL の道 `detail`）を組む。知らない mark は unknown として扱う。
			- 丸は `<button>`（mark の色と、色に頼らない文字の札）。押すと選び、`<iframe src="<基の URL><detail>&theme=…">` を開く。幅 720px より広いときは節の一覧の横の欄、狭いときは選んだ節のすぐ下に開く。同じ丸をもう一度押すと閉じる。
			- 節ごとに `open-button.js` の `<script>` を作り、`data-worktree`（worktree の id。id がなければパス）と `data-agent`（その節で選んだエージェントがあればその id）を付けて差し込む。選び直したら、その節のボタンを作り直す。
			- 文字はすべて textContent で入れる。要約の文書の項目を HTML として解かない。
			許さないオリジンの画面（`forbidden.html`）：同じ形の基の URL に対して、(1) `fetch('/api/worktrees/summary')`、(2) `/embed/agent?id=…` の iframe、(3) `open-button.js` のボタン、
			(4) `POST /api/token`（`Content-Type: application/json`）と (5) `POST /api/send/intent` を試し、(1)(4)(5) の結果（読めた、拒まれた）を textContent で示す。(2)(3) は iframe が描かれないことを写しで見る。
			スタイル：画面案 A の色（working 緑、waiting・blocked 黄と赤、done 灰、sleeping 紫）と明暗の両方。幅 390px で1列、横にはみ出さない。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01"]
	}
	"D-02": {
		title: "試しの静的なサーバー（`src/tools/trial-host.ts`）"
		text: """
			`createTrialHostHandler({ root, orcaPort, allowedHosts, highlight })`：決めたファイルの表（`/` と `/index.html`、`/phone.html`、`/forbidden.html`、`/trial.js`、`/trial-view.js`、`/forbidden.js`、`/trial.css`）だけを `web/trial/` から返し、
			`/config.json` で `{ orcaPort, highlight }` を返す。orca-web 自身は `/trial/*` を配らない（`STATIC_FILES` に足さない。テストで 404 を確かめる）。ほかの道は 404、GET と HEAD 以外は 405。すべての要求で Host を許す Host（`127.0.0.1:<port>` と、指定したときは `<Tailscale の IP>:<port>`）と完全一致で確かめ、違えば 421（DNS rebinding よけ）。`localhost` は許さない（試しの orca-web は `http://localhost:47900` のオリジンを許さず、CSP の基の URL にも入らないので、localhost で開くと部品が動かずに許しの不備と見分けにくい。421 で早く分かるようにする）。
			HTML には CSP を付ける：`default-src 'none'; script-src 'self' <orca-web の基の URL たち>; style-src 'self'; connect-src 'self' <基の URL たち>; frame-src 'self' <基の URL たち>; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`。
			基の URL たちは、待ち受けるアドレスごとの `http://<アドレス>:<orcaPort>`。`Cache-Control: no-store`。
			待ち受けは `src/server/listen.ts` の `startListeners` をそのまま使う（127.0.0.1 と、指定したときは Tailscale の IP。0.0.0.0 にしない）。
			"""
		satisfies: ["R-01", "R-04", "F-01"]
	}
	"D-03": {
		title: "試しの起動の道具（`src/tools/trial.ts`、`npm run trial`）"
		text: """
			引数：`--tailscale-ip <IPv4>`（任意。なければ環境変数 `ORCA_WEB_TAILSCALE_IP`、どちらもなければ 127.0.0.1 だけ）、`--state-dir <パス>`（既定 `.workbench/trial`）、`--orca-port`（既定 8792）、`--page-port`（既定 47900）、`--forbidden-port`（既定 47901）、`--dry-run`。
			純粋な関数 `buildTrialPlan({ tailscaleIp, stateDir, ports, env })` が、試しの orca-web の環境変数と、2つの静的なサーバーの設定を組む：
			- 試しの orca-web：`PORT=<orca-port>`、`ORCA_WEB_READ_ORIGINS=http://127.0.0.1:<page-port>`（Tailscale の IP があれば `,http://<IP>:<page-port>` を足す。47800 も forbidden のオリジンも入れない）、
			  `ORCA_WEB_TAILSCALE_IP`（あれば）、`ORCA_WEB_SETTINGS_FILE=<state-dir>/settings.json`、`ORCA_WEB_SENDS_DIR=<state-dir>/sends`。`ORCA_BIN` と `ORCA_WEB_STALL_MINUTES` は呼んだ側の環境を引き継ぎ、ほかの `ORCA_WEB_*` は引き継がない。
			- ポートが 8791 か 47800 のとき、ポートが重なるとき、`--state-dir` が常駐の既定の置き場（`~/Library/Application Support/orca-web` の下）のときは、誤り（終了コード 2）にする。
			`--dry-run` は組んだ設定（環境変数の名前と値。IP は伏せない。画面にだけ出し、ファイルに書かない）と URL を出して終わる。
			起動：state-dir を作り（0700）、設定のファイルがなければ `{ "version": 1, "fields": <src/state/fields.ts の DEFAULT_SELECTED>, "sendEnabled": false }` を書く（`SettingsStore.load` が受ける形。あれば触らない。送信を有効にするのは人が手で書く）。
			試しの orca-web を子のプロセス（`process.execPath src/server/main.ts`、組んだ環境）で起動し、`/api/health` が答えるまで待つ（上限 15 秒。答えなければ子を止めて終了コード 1）。
			次に許すオリジンの静的なサーバー（page-port）と、許さないオリジンの静的なサーバー（forbidden-port）を起動する。どれかのポートが使われていれば、起動した分を止めて終了コード 1。
			開く URL（127.0.0.1 と、あれば Tailscale の IP の、`/`、`/phone.html`、forbidden の `/forbidden.html`）を標準出力に出し、`<state-dir>/trial.pid` に自分の pid を書く。
			止め方：SIGTERM か SIGINT で、静的なサーバーを閉じ、子に SIGTERM を送って終わりを待ち（5 秒で SIGKILL）、pid のファイルを消して 0 で終わる。子が先に終われば、静的なサーバーを閉じて 1 で終わる。
			`package.json` に `"trial": "node src/tools/trial.ts"` を足す。
			"""
		satisfies: ["R-04", "F-01", "F-02"]
	}
	"D-04": {
		title: "許しの確かめ（テストと実機）"
		text: """
			テスト：`buildTrialPlan` の環境を `loadConfig` に通し、`createAppHandler` で組んだ試しの orca-web に対して、
			試しのオリジンからの要約の GET と OPTIONS が通り ACAO が付く、47901 と 47800 からは 403、`/embed/agent` と `/embed/open-button` の CSP の `frame-ancestors` が試しのオリジンだけ、
			47901 の Origin の `POST /api/token`・`POST /api/send/intent` は 403 で、Orca に何も送らない、を確かめる（既存の `test/server/*` の組み立てを使う）。
			実機：Chrome（Claude in Chrome）で、Mac の幅（1280px 前後）の `/` と、`/phone.html`、`/forbidden.html` の写しを取る。写しは `.workbench/trial-evidence/` に置き、コミットしない。
			会話の中身が写る写しは report.md に貼らない。report.md には何を見たかの結論だけを書く。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01"]
	}
	"D-05": {
		title: "試しの送信の確かめ"
		text: """
			試し専用の `settings.json` に `"sendEnabled": true` を手で書き、試しの画面で worktree `send-test` の節の丸（Claude、Codex）を選び、iframe の送る欄から短い決めた文（例：『orca-web の試しの送信です。返事は要りません』）を確かめて送る。
			送ってよいのは F-03 の2つの handle だけ。確認の画面には handle が出ないので、送る直前に、読むだけの `orca terminal list --worktree path:<send-test のパス> --json` と状態の API で、選んだエージェント（paneKey）の端末の handle が F-03 の2つのどちらかで、種類（Claude、Codex）が合うことを確かめ、確認の画面の worktree が `send-test`、種類が同じであることを見る。合わない（handle が変わった、別のエージェントがいる）ときは送らずに統括に問う。結果と、試し専用の `sends.jsonl` の行の数（送る前と後）だけを記録する。
			確かめた後も、本人の確かめのために `sendEnabled` は真のまま残す（本人の確かめが終わったら偽にする、と report.md に書く）。
			"""
		satisfies: ["R-02", "F-02", "F-03"]
	}
	"D-06": {
		title: "見つかった不足の直し方"
		text: """
			確かめで部品の不足が見つかったら、`src/`、`web/` の中で、API の形を変えずに直す。直すたびに、その振る舞いのテストを足す（tdd）。
			直しが API の形や意味を変える、または SpecDock の側の決めごとに及ぶときは、直さずに統括に問う。直したことと理由は report.md の `### 逸脱と判断` に書く。
			"""
		satisfies: ["R-01", "R-02", "R-03"]
	}
	"D-07": {
		title: "文書と本人への渡し方"
		text: """
			README.md の「SpecDock のダッシュボードに置く」の節に「試しの画面で確かめる」を足す（`npm run trial` の使い方、ポート、止め方、送信を有効にする手順）。AGENTS.md の形の説明に `web/trial/` と `src/tools/trial*.ts` を足す。
			report.md に、本人が開く URL（`http://127.0.0.1:47900/`、`http://<Tailscale の IP>:47900/`、`/phone.html`、`http://127.0.0.1:47901/forbidden.html`）、見てほしい点の一覧、止め方（`kill -TERM $(cat .workbench/trial/trial.pid)` と、送信を偽に戻すこと）を書く。
			`## 本人の確かめ` の欄（R-05）を空で用意し、統括への報告で『本人の答えを受けたら統括かタスク担当がこの欄に書き、欄が埋まるまで Issue を閉じない』と伝える。
			"""
		satisfies: ["R-04", "R-05"]
	}
}

compatibility: "orca-web の API と部品は変えない（D-06 の直しを除く）。`web/trial/` と `src/tools/trial*.ts` は足すだけで、常駐の起動（`src/server/main.ts`、launchd）に入らない。"

risks: [
	"詳細とチャットの iframe は、自分の幅（iframe の幅）が 390px 以下なら『Orca で開く』を出さない。Mac で SpecDock が狭い欄に置くと、Mac でも出なくなる。試しの画面は Mac で 420px 以上の欄を取る。SpecDock での欄の幅は epic-00526 で決める（report.md の次の提案に書く）",
	"Chrome の窓は 390px より狭くできないことがあるため、幅 390px は枠の画面で確かめる。実物の iPhone の Safari は本人の確かめで見る",
]
