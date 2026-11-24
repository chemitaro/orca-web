package spec

// 計画（Issue）。型 specdock/v1。

goal: "今の Orca（1.4.272）で、端末（ptyId のないタブ）と構造化 Chat の検証用の宛先に orca-web から送れ、Orca の再起動のあとに orca-web の再起動なしで機能の判定が戻ることが、テストと実物の記録で示されている。"

steps: {
	"S-01": {
		title:    "CapabilityCache が一致した報告だけを持つ（D-01）"
		text:     "対象：`src/orca/capabilities.ts`（`CapabilityCache` だけ）、`test/orca/capabilities.test.ts`、`test/send/service.test.ts`（または送信のサービスの近いテストのファイル）。確かめ：T-01、T-02。完了：`npm run lint`、`npm test`、`npm run build` が通り、T-01・T-02 があり、今のテストの振る舞いの主張を変えずに通す。コミットして次へ進む（区切りのレビューなし）"
		realizes: ["R-01", "F-02"]
		status:   "done"
		session:  "impl"
	}
	"S-02": {
		title:    "端末の宛先の ptyId を任意にし、send-live と録画の fixture を合わせる（D-02〜D-05）"
		text:     "対象：`src/send/model.ts`、`src/send/target.ts`、型の誤りが出る `src/send/` と `src/orca/send.ts` の箇所だけ、`src/tools/send-live.ts`（`ProbeTickets` の terminal の場面だけ）、`test/send/target.test.ts`、`test/send/service.test.ts`・`test/send/terminal-approval-service.test.ts`・`test/send/journal.test.ts` のうち要るもの、`test/tools/send-live.test.ts`、`test/fixtures/recordings/rpc-orca-1.4.272-send.json`（`.workbench/diag/rec/rpc-orca-1.4.272-send.json` を中身を変えずに写す）。送信の門 `src/orca/send-gates.ts` と `web/` は変えない。確かめ：T-03〜T-06。完了：`npm run lint`、`npm test`、`npm run build` が通り、T-03〜T-06 のテストがある。実装担当 impl の最後の手順。止まって HEAD を報告する。区切りのレビュー：あり（cp1、`3204e6d..HEAD`）"
		realizes: ["R-02", "F-01", "F-03"]
		after:    ["S-01"]
		status:   "done"
		session:  "impl"
	}
	"S-03": {
		title:    "README の送信の節と、実物の確かめの記録（タスク担当。D-06）"
		text:     "タスク担当が行う。README.md の送る経路の段に、端末の宛先の同一性と、Orca の再起動のあとの機能の判定の確かめ直しを書く。直したコードで、この worktree の使い捨ての検証用の宛先だけに送って確かめ（端末は send:live、構造化 Chat は別のポートの試しの orca-web）、report.md に記録する（会話の中身、id、個人のパスを書かない）。PR の直前に origin/main を取り込み直す。確かめ：T-07。完了：report.md の Verification に結論があり、`npm run lint`、`npm test`、`npm run build` が通る"
		realizes: ["R-03"]
		after:    ["S-02"]
		status:   "todo"
		session:  "doc"
	}
}

tests: {
	"T-01": {title: "CapabilityCache：probe が `runtimeIdConsistent` 偽の（接続でき runtimeId のある）報告を返すと、その報告を返したうえで、次の `get()` で probe をもう一度呼ぶ。一致した報告は同じ runtime の間 probe 1回（今のテスト）。順に「一致（uuid-1）→ 不一致（status uuid-2・file uuid-1）→ 不一致（status uuid-1・file uuid-2）→ 一致（uuid-2）」を返すとき、4回目の後の `get()` は probe を呼ばずに一致した uuid-2 の報告を返す", verifies: ["R-01", "F-02"]}
	"T-02": {title: "SendService と CapabilityCache を一緒に使い、probe の返す報告を不一致から一致に替える（listAll の runtimeId も合わせる）と、同じサービスの `status()` が、作り直しなしに、構造化 Chat と端末の宛先で reason unsupported から available に変わる。不一致の間の `intent` は `unsupported`（missing に `runtime-id:consistent`）で、書く RPC（terminal.send・agentSession.send）を0回", verifies: ["R-01", "F-02"]}
	"T-03": {title: "resolveTarget：`ptyId` がない・空・文字列でないタブで `ok: true`、`route: terminal`、`ptyId: null` の宛先を返す。`ptyId` があればその値。`terminal`・`incarnationId` がない・空・文字列でない、agentType がないと今のとおり `identity_unavailable`、providerSession.id がないと `no_session`。録画 `rpc-orca-1.4.272-send.json` の listAll の端末のタブ（仮名の id）で `ptyId: null` の宛先を返す", verifies: ["R-02", "F-01"]}
	"T-04": {title: "compareTargets：handle の違い・incarnationId の違いで `terminal_changed`。ptyId が両方にあって違えば `terminal_changed`。片方が null（null と文字列、文字列と null）と、両方 null では null（変化なし）。leafId の違いは今のとおり `tab_changed`。targetFingerprint は ptyId だけが違う（null と文字列を含む）宛先で同じ値、handle か incarnationId が違えば違う値", verifies: ["F-01"]}
	"T-05": {title: "SendService：ptyId のない端末のタブ（録画の形）で、`status()` が available、`intent`・`confirm` が `terminal.send` を今の決めた形（agentPrompt、要求の封筒）で1回送り、送る前の記録の target の ptyId が null、`check` がその記録を読む。意図と確定の間に incarnationId か handle が変わると `target_changed`／`terminal_changed` で `terminal.send` 0回。キーの組の答え（callId）と端末の承認（promptId）の意図が、ptyId のない宛先でも宛先の解決で拒まれない（今のテストの組み立てを ptyId なしでも通す）", verifies: ["R-02", "F-01"]}
	"T-06": {title: "send-live の probeSends（偽の Orca）：ptyId が null の端末の宛先で、targetChanged の場面の terminal_changed が incarnationId の変化で起き、その場面の送信の呼び出しが0回。ほかの場面の数と出力の形は今のまま", verifies: ["F-03"]}
	"T-07": {title: "実物（タスク担当）：Orca 1.4.272 で、`orca agent launch` で起動した ptyId のない端末の Claude Code に `npm run send:live` が成功し、宛先が返事をする。構造化 Chat の検証用の宛先に、別のポートの試しの orca-web から送信が accepted か submitted で届き、返事をする", verifies: ["R-03"]}
}

verification: """
	各手順で、その手順のテストを通す。最後に `npm run lint`、`npm test`、`npm run build` を通す。
	関門（coding-task の `## 関門` に当たる。CUE に専用の項目がないので、ここに書く）：
	- merge：owner（統括の依頼による coordinated の使い方なので、マージは統括が行う。タスク担当はマージしない）
	- 区切りのレビュー：cp1。最後の手順 S-02、範囲 `3204e6d..<S-02 の HEAD>`、レビュアー code-reviewer（Opus 5.5 / medium、方針の standard）。理由：宛先の同一性という送信の安全の規則を変える唯一のコードの変更なので、文書と実物の確かめの前に見る
	- 最終品質ゲート：範囲 `3204e6d..HEAD` の全体（`src/`、`test/`、`README.md`）。PR の直前に `origin/main` を取り込み直したときは、取り込んだ後のコミットでやり直す。追加の観点：security-baseline（宛先の同一性を緩めすぎない、送信の門を広げない、録画に秘密や個人の値を入れない）、reliability-recovery（拒みで送らない、二重に送らない、Orca の再起動から戻る）。second_opinion：none（standard の既定）
	- test_commands：`npm run lint`、`npm test`、`npm run build`（結合のテストは `npm test` の中の `test/server/*.test.ts`、`test/tools/*.test.ts`）
	- record_paths：なし（記録の report.md は Git の外で、SpecDock が保存する）
	"""
rollback: "PR を戻せば今の振る舞いに戻る（ptyId のない端末の宛先は identity_unavailable、runtime の変化の途中の判定を持ち続けうる）。記録の形と設定は変えない。"
exit:     "最終品質ゲート（`3204e6d..HEAD`、または取り込み後の HEAD）が合格し、実物の確かめが report.md にあり、PR の CI が通って、統括がマージできる状態になっている。"

execution: {
	sessions: {
		spec: {task: "仕様化と調査（タスク担当。統括が選んだ値の記録）", model: "opus", effort: "high", rationale: "統括の依頼書（2026-11-24）：claude-opus-5-5 / high（本人の指示「Opus は具体化と調査分析」、方針 §3 の設計・曖昧な調査・判断）"}
		impl: {task: "実装（S-01・S-02。サーバーのコードとテスト。Codex の実装担当、Orca の worker、この worktree）", model: "gpt-6.2-sol", effort: "medium", rationale: "本人の指示（統括の依頼書 2026-11-24：コーディングは Codex の GPT-6.2 Sol、--agent codex --model gpt-6.2-sol --effort medium）と方針の実装担当（テストで確かめられる実装）の行。provider: codex。Codex が確認の画面で止まったとき・入れ子の起動を拒まれたときは coding-task の手順5（タスク担当が引き継ぐ）"}
		doc: {task: "文書と実物の確かめ（S-03。タスク担当が自分で行う）", model: "opus", effort: "high", rationale: "方針 §2 の注記：文書を書く手順はタスク担当が書く。実物の確かめは自分で用意した検証用の宛先を使うタスク担当の役"}
	}
	reviews: {
		spec: {role: "仕様のレビュー（spec-reviewer。standard なので1人）", model: "opus", effort: "high"}
		cp1: {role: "区切りのレビュー（code-reviewer）", after: "S-02", model: "opus", effort: "medium"}
		gate: {role: "最終品質ゲート（quality-gate-reviewer。2人目なし）", after: "S-03", model: "opus", effort: "medium"}
	}
}
