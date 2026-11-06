package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "土台の誤りは後の Issue のテストで見つかり、直せる"
}

purpose: """
	orca-web の土台を作る。後の Issue（状態の API、開く口、会話のログと送信）が乗る、プロジェクトの雛形、
	Orca のアダプター（CLI と内部の Unix ソケットの RPC）、機能ごとの確かめ、録画と再生のテストの基盤を用意し、
	この Mac の Orca で、モデルと推論、スリープ、タブの識別子、会話の読み取りが取れるかを確かめて記録する。
	"""

background: """
	親の epic-00003 の切り分け（slices の iss-00005）を受け、epic-00003 の F-02 と D-01・D-02 を具体にする。
	調査と ChatGPT の設計の相談は orca-web の `.workbench/research-20261106/`（Git の管理外）にある。
	Orca のソースは公開の stablyai/orca のタグ v1.4.249 を根拠にし、この Mac の Orca の版（1.4.251）は確かめの結果に記録する。
	"""

includes: [
	"TypeScript の Node.js（LTS）のプロジェクトの雛形、テスト、lint（型の検査を含む）、CI",
	"AGENTS.md と CLAUDE.md",
	"Orca のアダプター：CLI の呼び出しと、内部の RPC の単発の呼び出し",
	"機能ごとの確かめ（readState、readTabs、openExistingTab、readTranscript、sendGuarded）",
	"CLI と RPC の録画と再生、録画の仮名化と秘密の検査",
	"この Mac の Orca での読むだけの実機の確かめと、report.md への記録",
]

excludes: [
	"状態の API、項目の選択、CORS（iss-00006）",
	"開く口、書き込みの守り、ボタンの部品（iss-00007）。この Issue は書き込みの RPC（activate、send）を呼ばない",
	"launchd での常駐と待ち受けのアドレス（iss-00008）",
	"会話のログの表示と送信（epic-00004）",
	"WebSocket（ペアリング）での購読",
]

requirements: {
	"R-01": {
		title: "開発者が、雛形の上で test・lint・build を実行でき、CI で lint とテストが走る"
		text: """
			Node.js（LTS）と TypeScript。`src/server/`、`src/orca/`、`web/`、`test/` を持つ。依存は開発用の少数（TypeScript、Node の型、lint の道具）に限り、
			実行時の依存を持たない。`AGENTS.md` にプロジェクトの形、テストの実行、守ること、仕様の扱いを書き、`CLAUDE.md` は `@AGENTS.md` だけにする。
			"""
		acceptance: [
			"`npm test`、`npm run lint`（型の検査を含む）、`npm run build` が成功する",
			"GitHub Actions が PR で lint とテストを実行し、通る",
			"`package.json` の `dependencies` が空である",
		]
	}
	"R-02": {
		title: "アダプターが、Orca の CLI を、絶対パス・引数の配列・管理した環境変数で呼ぶ"
		text: """
			シェルを通さず、絶対パスの実行ファイルに引数の配列を渡す。環境変数は許した名前だけを渡し、`ORCA_ENVIRONMENT` と `ORCA_PAIRING_CODE`
			（と、ほかの `ORCA_` の変数）を引き継がない。作業ディレクトリを固定し、時間切れを持つ。結果は終了コード、stdout、stderr、所要時間で返し、
			`--json` の応答は `ok` と `result`、または `error` に分けて返す。
			"""
		acceptance: [
			"親の環境に `ORCA_ENVIRONMENT` と `ORCA_PAIRING_CODE` があっても、子の環境に渡らないことがテストで観測できる",
			"相対パスの実行ファイルを渡すと、呼ばずに誤りになる",
			"時間切れ、0 でない終了コード、JSON でない stdout が、それぞれ区別できる型の結果になる",
		]
	}
	"R-03": {
		title: "アダプターが、内部の Unix ソケットの RPC を、NDJSON の単発の要求で呼び、authToken を外に出さない"
		text: """
			`orca-runtime.json` から unix の口と authToken を読み、1回の接続で1つの要求を送り、同じ id の応答を1つ受けて閉じる。
			分割されて届く NDJSON をつなぎ、`_keepalive` の行を読み飛ばす。`ok: false` の応答は Orca の `error.code`（`method_not_found` など）で返す。
			応答の `_meta.runtimeId` を返す。authToken は、アダプターの戻り値、誤りの文、ログ、録画に現れない。
			"""
		acceptance: [
			"録画した、分割された応答と keepalive を含む応答から、正しい結果が得られる",
			"`method_not_found`、時間切れ、接続断、不正な JSON、id の食い違いが、区別できる型の誤りになる",
			"テストで、どの結果と誤りの文にも authToken の値が含まれない",
		]
	}
	"R-04": {
		title: "アダプターが、Orca の機能を確かめ、機能ごとに使えるかと理由を返す"
		text: """
			CLI の版、runtime の ID（`status` と `orca-runtime.json` と RPC の `_meta` の一致）、`orca status --json` の capabilities、
			`orca agent-context --json` の必要なコマンドとフラグ、読む RPC の有無を確かめる。結果は機能（`readState`、`readTabs`、`openExistingTab`、
			`readTranscript`、`sendGuarded`）ごとに、使えるか、満たした確かめ、欠けた確かめ、呼ぶときまで確かめられないことを返す。
			書き込みの RPC は確かめのために呼ばない。runtime の ID が変わったら、前の結果を使わず確かめ直す。
			"""
		acceptance: [
			"録画した応答から、期待する機能ごとの結果が得られる",
			"必要な capability かコマンドが欠けた録画では、その機能だけが使えないと理由つきで返り、ほかの機能は使えるままである",
			"runtime の ID が変わった録画では、前の結果を使わずに確かめ直す",
		]
	}
	"R-05": {
		title: "開発者が、CLI と RPC の境界を差し替え、録画と再生で Orca なしにテストできる"
		text: """
			CLI の境界は argv、終了コード、stdout、stderr、遅延を、RPC の境界は要求と応答の行、分割、keepalive、不正な JSON、接続断を、録画して再生できる。
			録画は、パス、ID（worktree、タブ、leaf、端末、セッション、run、task、dispatch など）、自由な文を一貫した仮名に置き換え、
			同じ値は同じ仮名に、パスの親子は仮名でも親子になるように保つ。authToken、ペアリングのコード、プロンプトや会話の本文を入れない。
			"""
		acceptance: [
			"録画を再生するテストが、Orca を起動せずに通る",
			"仮名化の後も、同じ ID は同じ仮名で、パスの前方一致（親子）が保たれることがテストで確かめられる",
			"秘密や本文を含む録画を保存しようとすると、検査が止める",
		]
	}
	"R-06": {
		title: "この Mac の Orca で、読むだけの実機の確かめを行い、結論を report.md に記録する"
		text: """
			次の4つを確かめる。(1) ふつうの Claude Code と Codex のエージェントで、`session.tabs.list` の `agentStatus.model` と
			`agentStatus.providerSession.effort` が値として出るか。(2) スリープ中のエージェントが一覧でどう見えるか。
			(3) worktree → タブ → leaf → 端末 → provider のセッションを、取り違えずに結べるか。(4) `nativeChat.readSession` が読めるか。
			書き込みの RPC（activate、send）は呼ばない。会話の中身、プロンプト、authToken を記録に残さない。
			"""
		acceptance: [
			"report.md に、4つの問いの答えと根拠（件数、項目の有無、Orca の版）が書かれている",
			"実機の確かめの道具が呼ぶ RPC と CLI のコマンドが、読むものだけであることがテストで確かめられる",
		]
	}
}

failures: {
	"F-01": {
		title: "必要な機能が確かめられないとき（method_not_found、識別子の欠け、未知の形）は、その機能だけを使えないとして理由を返し、ほかの機能は続ける"
		text:  "epic-00003 の F-02 を受ける。書き込みの機能（openExistingTab、sendGuarded）は、確かめられない限り使えるとしない。"
	}
	"F-02": {
		title: "Orca が動いていない、`orca-runtime.json` がない、ソケットにつながらないときは、例外で落ちず「接続できない」を型の結果で返す"
		text:  "epic-00003 の F-01 の下地。状態の API（iss-00006）が、最後に読めた状態と並べて示せるようにする。"
	}
	"F-03": {
		title: "録画に秘密や本文が残るおそれがあるときは、保存せずに止まる"
		text:  "リポジトリは公開。authToken、ペアリングのコード、利用者の家のパス、プロンプトの本文が残る録画は、書き出す前の検査で拒む。"
	}
}

constraints: [
	"Orca には読む要求だけを送る。書き込みの RPC（session.tabs.activate、worktree.activate、terminal.send など）を、この Issue のコードと確かめで呼ばない",
	"Orca の authToken とペアリングのコードを、記録、URL、画面、ログ、録画に出さない",
	"利用者の環境（Claude Code、Codex、Orca の設定、launchd）とほかのリポジトリを変えない",
	"Orca の内部の RPC は非公開で、版で変わりうる。根拠はタグ v1.4.249 のソースと、この Mac での確かめ",
]

decisions: [
	"2026-11-06 テストは Node の標準のテスト（node:test）で、TypeScript は Node の型の剥がしで直接動かす。lint は Biome と `tsc --noEmit`",
	"2026-11-06 書き込みの機能の RPC の有無は、確かめのために呼ばない。呼ぶときの method_not_found で、何もせずに理由を返す（iss-00007）",
	"2026-11-06 sendGuarded は、保護された送信の経路を orca-web が確かめるまで（epic-00004）、使えないと返す",
]
