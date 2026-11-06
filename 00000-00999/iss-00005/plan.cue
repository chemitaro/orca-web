package spec

// 計画（Issue）。型 specdock/v1。

goal: "雛形→CLI と RPC の境界→録画と再生→機能の確かめ→実機の確かめの順に、テスト先行で作り、PR をマージできる状態で止める。"

steps: {
	"S-01": {title: "雛形（package.json、tsconfig、Biome、CI、AGENTS.md、CLAUDE.md、src/server の最小の入口、web の入口）を作る", realizes: ["R-01"], status: "done", session: "impl"}
	"S-02": {title: "CLI の境界（CliRunner、NodeCliRunner、管理した環境変数、OrcaCli の封筒の解き方、ReadOnlyOrcaCli）を作る", realizes: ["R-02", "F-02"], status: "done", after: ["S-01"], session: "impl"}
	"S-03": {title: "RPC の境界（RuntimeLocator、UnixSocketRpc、ReadOnlyRpc、authToken の閉じ込め）と、それを検査する ReplayRpcServer を作る", realizes: ["R-03", "F-02"], status: "done", after: ["S-01"], session: "impl"}
	"S-04": {title: "録画と再生（録画の形、ReplayCliRunner、ReplayRpcTransport、Pseudonymizer、assertRecordingSafe、録画の包み）を作る", realizes: ["R-05", "F-03"], status: "done", after: ["S-02", "S-03"], session: "impl"}
	"S-05": {title: "機能の確かめ（probeCapabilities、CapabilityCache）を作る", realizes: ["R-04", "F-01", "F-02"], status: "done", after: ["S-04"], session: "impl"}
	"S-06": {title: "実機の確かめの道具（probe-live）を作り、この Mac で読むだけの確かめを行い、report.md に書く", realizes: ["R-06"], status: "done", after: ["S-05"], session: "impl"}
	"S-07": {title: "コードのレビューと最終品質ゲートを通し、PR を作って CI の通過を確かめる", realizes: ["R-01"], status: "doing", after: ["S-06"], session: "impl"}
}

tests: {
	"T-01": {title: "npm test、npm run lint、npm run build が通り、CI の定義が lint とテストを実行し、dependencies が空である", verifies: ["R-01"]}
	"T-02": {title: "NodeCliRunner が ORCA_ENVIRONMENT と ORCA_PAIRING_CODE を子に渡さず、相対パスを拒み、時間切れを区別する（偽の実行ファイルで確かめる）", verifies: ["R-02"]}
	"T-03": {title: "OrcaCli が ok、orca-error、exit-nonzero、timeout、invalid-json、spawn-failed を区別する", verifies: ["R-02", "F-02"]}
	"T-04": {title: "UnixSocketRpc が、分割された行と keepalive から結果を得て、method_not_found、時間切れ、接続断、不正な JSON、id の食い違いを区別する（ReplayRpcServer で確かめる）", verifies: ["R-03", "R-05"]}
	"T-05": {title: "どの結果、誤りの文、JSON にした値、inspect の出力にも authToken の値が出ない", verifies: ["R-03"]}
	"T-06": {title: "orca-runtime.json がない、unix の口がない、ソケットにつながらないときに unavailable や disconnected を返し、例外で落ちない", verifies: ["F-02"]}
	"T-07": {title: "ReadOnlyRpc が一覧にない method（session.tabs.activate など）を送らず、ReadOnlyOrcaCli が一覧にないコマンド（terminal switch、terminal send など）を呼ばずに誤りにする", verifies: ["R-03", "R-06"]}
	"T-08": {title: "Pseudonymizer が、同じ ID を同じ仮名に、パスの親子を保ち、合成の ID（repoId::path、tabId:leafId の paneKey、term_<uuid>）の中の対応も、ほかの項目の同じ値の仮名と一致させる", verifies: ["R-05"]}
	"T-09": {title: "sanitizeRecording が秘密の項目を消し、自由な文を置き換え、assertRecordingSafe が authToken、家のパス、orca://pair、自由な文の項目の本文、仮名にしていない文（stdout の JSON の中、stderr、JSON でない chunk の中も）の残る録画を拒み、手で書いた fixture がすべて検査を通る", verifies: ["R-05", "F-03"]}
	"T-10": {title: "ReplayCliRunner が argv の一致で録画を返し、遅延を再現し、一致しない argv を誤りにする", verifies: ["R-05"]}
	"T-11": {title: "揃った録画から、probeCapabilities が全機能の期待する結果（sendGuarded は使えない、openExistingTab の deferred）を返す", verifies: ["R-04"]}
	"T-12": {title: "capability かコマンドが欠けた録画、nativeChat.readSession が method_not_found の録画、タブの識別子が欠けた録画で、その機能だけが理由つきで使えない", verifies: ["R-04", "F-01"]}
	"T-13": {title: "runtime の ID が食い違うと書き込みの機能が使えず、CapabilityCache が ID の変化で確かめ直す", verifies: ["R-04"]}
	"T-14": {title: "Orca が動いていない録画（status が届かない、ソケットがない）で、connection が unreachable になり、readState などが理由つきで使えない", verifies: ["F-01", "F-02"]}
	"T-15": {title: "probe-live の集計が、録画から、結べた数、スリープの見え方、model と effort の有無を出し、本文、題名、パスを出さず、読む RPC と読む CLI のコマンドだけを呼ぶ", verifies: ["R-06"]}
	"T-16": {title: "report.md に、実機の4つの問いの答えと根拠、Orca の版が書かれている（人が読んで確かめる）", verifies: ["R-06"]}
}

verification: "`npm run lint`、`npm test`、`npm run build` と CI。実機の確かめは `npm run probe:live` の集計を report.md に写して確かめる。"
rollback:     "PR を戻す。利用者の環境と Orca には書き込まないので、戻すものはない。"
exit:         "PR がマージできる状態で、CI が通り、report.md に実機の確かめの結論と最終品質ゲートの合格の証拠がある。"

execution: {
	sessions: {
		spec: {task: "仕様化（起動した側が選んだ値の記録）", model: "opus", effort: "high", rationale: "統括が依頼で指定（新しいリポジトリの土台と、非公開の内部の口のアダプター）"}
		impl: {task: "実装", model: "opus", effort: "high", rationale: "統括が依頼で指定。仕様化と同じセッションで実装する"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-review、実装の前）", model: "opus", effort: "medium"}
		code: {role: "コードのレビュー（code-review）", after: "S-06", model: "sonnet", effort: "high"}
		gate: {role: "最終品質ゲート（final-quality-gate、1人）", after: "S-07", model: "opus", effort: "high"}
	}
}
