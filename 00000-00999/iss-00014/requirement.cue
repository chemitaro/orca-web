package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "埋め込みの誤りは画面で分かり、直せる"
}

purpose: "SpecDock に渡す3つの部品（稼働の印の要約 `GET /api/worktrees/summary`、Orca で開くボタン `open-button.js`、詳細とチャットの iframe `/embed/agent?id=…`）を、SpecDock とは別のオリジンの試しの画面に置き、Mac とスマホ（幅 390px）で読んで、開いて、確かめて送れることと、許していないオリジンからは読めない・置けない・送れないことを確かめ、本人の確かめに出せる状態にする。"

background: """
	親の epic-00004 の slice iss-00014（R-04、F-06）と、init-00002 の R-07（渡すのは3つ。ボタンは iPhone で出さない。組み込みの前に本人が確かめる。2026-11-13 の本人の判断）を受ける。
	部品はできている：要約の API（iss-00019）、開くボタン（iss-00007。親の画面の幅が 390px 以下なら出さない）、詳細とチャットの iframe（iss-00012、送る欄は iss-00013）。
	埋め込みの許しは `ORCA_WEB_READ_ORIGINS`（既定 `http://127.0.0.1:47800`）の1つの設定が、読み取りの CORS と画面の `frame-ancestors` の両方を決める。書き込みは同じオリジンの JSON と短期のトークンだけ（epic-00003）。
	本物の SpecDock のダッシュボード（47800）と常駐の orca-web（8791、launchd）は今この Mac で動いている。どちらも使わず、変えない（統括の依頼書、2026-11-14）。
	画面の形は、本人に見せた画面案（案 A：構造の図の節に印を付け、選ぶと横の欄に詳細とチャット。スマホは縦に並べ、押すと下に開き、Orca で開くを出さない）に倣う。
	"""

includes: [
	"試しの画面（静的な HTML・CSS・素の ES Modules。リポジトリの `web/trial/`）：要約から worktree ごとの印を描き、印を選ぶと詳細とチャットの iframe を開き、worktree ごとに開くボタンを置く。幅 390px の見え方を Mac の上で確かめる枠の画面と、許していないオリジンから3つの部品を試す画面を含む",
	"試しの起動の道具（`src/tools/trial.ts`、`npm run trial`）：試し用の orca-web（別のポート、試しの画面のオリジンだけを許す、試し専用の設定と送信の記録）と、試しの画面の小さな静的なサーバー（許すオリジンと許さないオリジンの2つ）を起動し、まとめて止める",
	"Mac とスマホの幅での実機の確かめ（読む、開く、試しの送り先への送信）と、許していないオリジンの拒否の確かめ。写しと件数と結論だけを report.md に書く",
	"確かめの中で見つかった、3つの部品の埋め込みの不足の修正（`src/`、`web/` の範囲）",
	"README.md と AGENTS.md の更新",
]

excludes: [
	"SpecDock のリポジトリの変更と、SpecDock への組み込み（spec-dock の epic-00471・epic-00526。本人の確かめの後）",
	"常駐の orca-web（8791）の登録と設定（`service:*`、常駐の settings.json）の変更",
	"本物の SpecDock のダッシュボード（47800）の利用",
	"状態・要約・会話・送信の API の形と意味の変更（不足の修正で要るときは、その理由を report.md に書く）",
	"Orca への新しい命令",
	"本人の確かめそのもの（この Issue は、本人が確かめられる状態と、見てほしい点の一覧までを作る）",
]

requirements: {
	"R-01": {
		title: "利用者が、別のオリジンの試しの画面で、worktree ごとの稼働の印を見られる"
		text: """
			試しの画面は、試し用の orca-web の `GET /api/worktrees/summary` を読み取りの CORS で読み、エージェントのいる worktree ごとに、名前（パスの末尾）、ブランチ、
			エージェントごとの丸（mark の6つの状態を色と文字で区別）と状態ごとの数を描く。読み直しは定期に行う。Orca に届かない（`stale`、`connection.state`）ときは、その旨を示す。
			試しの送り先の worktree（パスの末尾が `send-test`）を先頭に置き、試しの送り先と分かる札を付ける。
			"""
		acceptance: [
			"Mac の幅で、試しの画面に worktree の節と丸が出て、数が同じ時の要約の API と合う",
			"幅 390px で、節が縦に1列に並び、横にはみ出さない",
		]
	}
	"R-02": {
		title: "利用者が、試しの画面の印から、詳細とチャットの iframe を開き、読んで送れる"
		text: """
			丸（エージェント）を選ぶと、要約の `detail`（`/embed/agent?id=…`）を試し用の orca-web のオリジンに付けた iframe を開く。Mac の幅では節の横の欄、幅 390px 以下では節の下に開く。
			iframe の中で会話を読み、試し専用の設定で送信を有効にしたときは、確かめて送れる。
			"""
		acceptance: [
			"Mac の幅と幅 390px で、iframe に詳細と会話が出る",
			"試しの送り先（Claude と Codex の2つ）に、試しの画面の iframe から確かめて送り、結果が `submitted` か `accepted` になり、送信の記録が試し専用の置き場に残る",
		]
	}
	"R-03": {
		title: "利用者が、試しの画面の開くボタンで、Mac の Orca の既存のタブを前面に出せる。幅 390px 以下ではボタンが出ない"
		text:  "worktree の節ごとに、`open-button.js` の1行のスクリプトで開くボタンを置く（`data-worktree` は要約の worktree の id、`data-agent` は選んだエージェント）。"
		acceptance: [
			"Mac の幅で、ボタンが出て、押すとこのリポジトリの worktree のタブが Orca で前面に出る",
			"幅 390px で、ボタンの iframe が出ない（読み込まれない）",
		]
	}
	"R-04": {
		title: "本人が、試しの画面を Mac とスマホ（tailnet）から開いて確かめられる"
		text: """
			試しの起動の道具は、試し用の orca-web と試しの画面を、127.0.0.1 と、指定したときは Tailscale の IP の両方で待ち受ける（0.0.0.0 にしない）。
			本人が開く URL、見てほしい点の一覧、止め方を report.md と統括への報告に書く。公開のリポジトリと report.md には実際の Tailscale の IP を書かない（`<Tailscale の IP>` と書く）。
			"""
		acceptance: [
			"Tailscale の IP を指定して起動すると、`http://<Tailscale の IP>:47900/` で試しの画面が開き、3つの部品が動く",
			"report.md に、開く URL、見てほしい点、止め方がある",
		]
	}
}

failures: {
	"F-01": {
		title: "許していないオリジンの画面からは、要約を読めず、詳細とチャットとボタンを置けず、送れない"
		text: """
			試しの orca-web は、試しの画面のオリジン（`http://127.0.0.1:47900` と、指定したときは `http://<Tailscale の IP>:47900`）だけを許す。
			別のオリジン（`http://127.0.0.1:47901`、本物の SpecDock の `http://127.0.0.1:47800` を含む）からの要約の読み取りは 403、`/embed/agent` と `/embed/open-button` は `frame-ancestors` で置けず、
			トークンと送信の口は書き込みの守りで拒む（epic-00004 の F-06）。
			"""
		impact:   "悪意のある画面や別の画面から、エージェントの一覧を読まれ、利用者の意図しない指示が送られる"
		recovery: "拒んだことを示し、許したオリジンの画面から開き直す"
	}
	"F-02": {
		title: "試しの起動は、常駐の orca-web と本物の SpecDock に触れない"
		text: """
			試し用の orca-web は 8791 を使わず、常駐の設定のファイルと送信の記録の置き場を使わない（`ORCA_WEB_SETTINGS_FILE`、`ORCA_WEB_SENDS_DIR` を試し専用の置き場にする）。
			ポートが使われていれば起動せずに止まる。`sendEnabled` を真にするのは試し専用の設定のファイルだけで、道具は自分で真にしない。
			"""
		impact:   "常駐の設定が書き換わる、本物の送信の記録に試しが混ざる、常駐のサービスが止まる"
		recovery: "道具を止め、試し専用の置き場を消す。常駐のサービスは変わっていない"
	}
	"F-03": {
		title: "試しの送信は、試しの送り先の2つだけに送る"
		text:  "実機の確かめで送ってよい宛先は、worktree `send-test` の Claude（handle `term_33f82ee2-e06e-4e28-aee7-c2530fb4b062`）と Codex（handle `term_0787c5d8-a3c7-4028-8340-c63ec55a4e29`）だけ。業務中のエージェントには送らない。記録には件数と結論だけを書き、送った文と会話の中身を写さない。"
		impact:   "業務中のエージェントの作業を壊す"
		recovery: "送ってしまったら、送信の記録から宛先を特定して統括に知らせる"
	}
}

constraints: [
	"実行時の依存を足さない。試しの画面も素の ES Modules で、ビルドしない",
	"Orca の authToken、ペアリングのリンク、短期のトークン、実際の Tailscale の IP を、コミット、記録、写しに出さない",
	"試しの画面の文字は textContent で描く（要約の項目は信頼しないデータ）",
	"SpecDock のリポジトリ、常駐の orca-web の登録と設定、Epic と Initiative の文書を変えない",
]

decisions: [
	"2026-11-14 試しの画面のオリジンは `http://127.0.0.1:47900`（と `http://<Tailscale の IP>:47900`）、許さないオリジンの確かめは 47901、試しの orca-web は 8792（タスク担当。統括の依頼書の『本物の 47800 は使わない、別のポートで試しの静的な画面を出す』による）",
	"2026-11-14 試しの画面は `web/trial/` に置く。orca-web は配るファイルの表（`src/server/app.ts` の `STATIC_FILES`）にないものを配らないので、`/trial/*` は orca-web から出ず、試しの静的なサーバーだけが配る。`web/` の下にすると、既存の biome と tsc の対象に入る（設定のファイルを変えずに済む）（タスク担当）",
	"2026-11-14 幅 390px の確かめは、試しの画面を幅 390px の iframe に入れた枠の画面（`/phone.html`）で行う。枠の中の画面の幅が 390px になるので、ボタンの隠し方と iframe の折り畳みは本物のスマホと同じ条件で動く。本人には実物のスマホ（tailnet）でも見てもらう（タスク担当）",
	"2026-11-14 実装は、テストで確かめられるコード（起動の道具、静的なサーバー、許しの確かめのテスト）を Codex GPT-6.1 Sol / medium、試しの画面の見た目（HTML・CSS・画面の JavaScript）を Claude Opus 5.5 / medium（本人の指示、2026-11-13、統括の依頼書）",
]

questions: []
