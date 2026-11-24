package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "送信の門の安全の制約を保ったままの互換の修正。誤れば送信が止まるか宛先の確かめが緩むが、範囲は orca-web の中で、版を戻せばすぐ戻せる"
}

purpose: "Orca を v1.4.272 に上げた後、orca-web からエージェントへ送れなくなった（構造化 Chat も端末も）。原因の2つを直し、今の Orca で、送信の門の安全の制約を保ったまま、また送れるようにする。"

background: """
	タスク担当が 2026-11-24 に読むだけで再現した（証拠はタスク担当の Workbench `.workbench/diag/` と report.md の Verification）。

	1. 機能の判定のキャッシュ：常駐の orca-web（2026-11-20 に起動）は、Orca の版上げ（2026-11-23、runtime ID が変わった）の再起動の途中で、`orca status` の runtime ID と `orca-runtime.json` の runtime ID が一致しない一瞬の機能の判定（`runtimeIdConsistent` 偽）を `CapabilityCache` に持った。持った報告の runtimeId（status の値）が、後で書き換わった `orca-runtime.json` の値と一致するので、その報告を捨てずに使い続ける。そのため送信・質問の答え・承認がすべて `unsupported`（`missing: ['runtime-id:consistent']`）で止まっている。今の `probe:live` では一致していて、同じコードを新しく起動した試しの orca-web からは、構造化 Chat への送信が `accepted` で届いた。
	2. 端末の宛先の `ptyId`：Orca の `orca agent launch`（端末）で起動した端末のエージェントのタブは、`session.tabs.listAll` に `ptyId` を持たない（`parentLayout.ptyIdsByLeafId` もない）。`orca terminal create` のタブは持つ。この形は Orca 1.4.263 でも観察されている（iss-00067 の report.md）。`resolveTarget` が `ptyId` を宛先の必須の識別子にしているので、`identity_unavailable` で送らない。Orca 1.4.272 の投影（`runtime-mobile-session-projection.ts`）は、端末の同一性を「handle の今の持ち主」の `incarnationId` に結ぶ（`ptyId` は元の写しにあるときだけ写す）。診断で `ptyId` を補うと、`terminal.send` は `submitted`（`input_accepted`、`turn_started`）まで通り、ほかの読みや門の形は今の Orca でも通る。
	"""

includes: [
	"`CapabilityCache` が runtime ID の一致しない報告を持たない（src/orca/capabilities.ts）",
	"端末の宛先の `ptyId` を任意にする（src/send/model.ts、src/send/target.ts と、それを使う送信・キーの組の答え・端末の承認）",
	"実機の確かめの道具 `send-live` の宛先の変化の場面の手直し（src/tools/send-live.ts）",
	"Orca 1.4.272 の録画の fixture（仮名）とテスト",
	"README の送信の節の追記と、実物の確かめの記録",
]
excludes: [
	"送信の門 `SendRpc` の許す RPC と引数の形の変更（新しい RPC を通さない）",
	"送り直しの道、自動の再送",
	"記録の schema（`orca-web.send-record/v1`）の版の変更",
	"`SendService` の method_not_found による止め（`#blocked`）の扱いの変更（runtime ID が変われば今も消える。今回の再現では関わっていない）",
	"常駐の orca-web の再起動と launchd の登録（利用者か統括が行う）",
	"構造化 Chat の送信の経路そのもの（今の Orca でも通ることを確かめた）",
]

requirements: {
	"R-01": {
		title: "Orca の runtime が変わった後、機能の判定が orca-web の再起動なしに今の runtime の判定に戻る"
		text:  "`CapabilityCache` は、接続できて runtime ID があり、かつ runtime ID が一致した（`runtimeIdConsistent` 真の）報告だけを持つ。一致しない報告は返すが持たず、次の `get()` で確かめ直す。一致した報告は、今のとおり同じ runtime の間は使い続ける。"
		acceptance: [
			"`runtimeIdConsistent` 偽の報告を probe が返した後の `get()` が、もう一度 probe を呼ぶ（テストで probe の回数を数える）",
			"一致した報告は、runtime ID が同じ間は probe を1回しか呼ばない（今のテストのまま通る）",
			"probe が「古い runtime で一致 → 再起動の途中で不一致（status 新・file 旧、または status 旧・file 新）→ 新しい runtime で一致」の順に返すとき、同じ `CapabilityCache` と同じ `SendService` が、作り直しなしに、送信の状態を unsupported から available に戻す（常駐の再起動なしで直ることの確かめ）",
		]
	}
	"R-02": {
		title: "タブに ptyId のない端末のエージェントに、送信・キーの組の答え・端末の承認の1キーを送れる"
		text:  "`resolveTarget` は端末のタブの `ptyId` を任意の値として読み（文字列でなければ null）、宛先の必須の識別子は handle（`terminal`）、`incarnationId`、`agentStatus.agentType`、`agentStatus.providerSession.id` にする。`ptyId` があれば宛先と記録に持つ。"
		acceptance: [
			"Orca 1.4.272 の録画（仮名）の、`ptyId` のない端末のタブで、`resolveTarget` が `route: terminal`・`ptyId: null` の宛先を返す",
			"そのタブの宛先で、送れるかの状態が available（answerKeys も、エージェントの種類が対応していれば available）になり、意図と確定で `terminal.send` を決めた形で1回だけ送り、結果を今の5つの分け方で返す",
			"送る前の記録の target に `ptyId: null` が書け、照会（`check`）と、送り始めた callId・promptId の確かめ（`hasAnswer`・`hasApproval`）がその記録を読める。`ptyId` が文字列の前の記録も今のとおり読める",
		]
	}
	"R-03": {
		title: "今の Orca（1.4.272）の実物で、端末と構造化 Chat の検証用の宛先に送信が届く"
		text:  "タスク担当が、この worktree に自分で起動した使い捨ての検証用の宛先だけで確かめる。業務中のエージェントと常駐の orca-web（8791）には送らない。"
		acceptance: [
			"端末（`orca agent launch` で起動した、タブに ptyId のない Claude Code）：`npm run send:live -- --worktree <この worktree> --handle <handle>` が成功し、sent・recorded・responseLost・targetChanged・notSent の各場面が期待どおりで、宛先が返事をする",
			"構造化 Chat：直したコードで別のポートに起動した試しの orca-web（専用の settings と送信の記録の場所）で、`/api/send/intent`・`confirm` が accepted か submitted を返し、宛先が返事をする",
			"結果を report.md の Verification に、会話の中身・id・個人のパスを書かずに記録する",
		]
	}
}

failures: {
	"F-01": {
		title: "端末の宛先の同一性を緩めすぎない：handle・incarnationId が変われば送らず、ptyId が両方にあって違えば送らない"
		text:  "handle、`incarnationId`、`agentType` がなければ今のとおり `identity_unavailable`、`providerSession.id` がなければ `no_session`。意図と確定の間で handle か `incarnationId` が変われば `terminal_changed`。`ptyId` が両方にあって違えば `terminal_changed`。片方にしかない（後から付いた、消えた）ことだけでは変化とみなさない。どの拒みでも `terminal.send` を呼ばない。"
	}
	"F-02": {
		title: "runtime ID が一致しない間は、今のとおり送らない"
		text:  "確かめ直しても一致しない間は、送信・答え・承認を今のとおり `unsupported`（`missing` に `runtime-id:consistent`）で拒み、Orca に書く RPC を送らない。持たない報告は接続できないときと同じく、呼ぶたびに確かめ直す。"
	}
	"F-03": {
		title: "実機の確かめの道具の宛先の変化の場面が、ptyId のない宛先でも送らずに terminal_changed を確かめる"
		text:  "`send-live` の terminal の変化の場面は、票の宛先の `incarnationId` を変えて確かめる（`ptyId` が null の宛先では ptyId の変化は比べないため）。この場面の `terminal.send` は0回。"
	}
}

constraints: [
	"送信の門 `SendRpc`（src/orca/send-gates.ts）の許す RPC と形を変えない。送る経路と再送の道を足さない（AGENTS.md）",
	"記録の schema は `orca-web.send-record/v1` のまま。前の記録を読めなくしない",
	"実行時の依存を足さない。erasable な TypeScript だけ",
	"録画の fixture は `sanitize.ts` の仮名化と検査を通したものだけ。秘密・トークン・利用者の文・個人のパスを入れない",
	"常駐の orca-web の再起動、`service:install`・`uninstall`・`restart`、Orca を止めることをしない",
]

decisions: [
	"Scope：init-2 の下の新しい Epic epic-00072「Orca の版上げへの追随（互換の修正）」の下の、この1つの Issue で2つの原因を直す（統括、2026-11-24、msg_0f6999766653。分けるかはタスク担当に任された。2つとも小さく、同じ「送れない」の受け入れで確かめるので1つにした）",
	"保証レベル standard（統括の依頼書、2026-11-24）",
	"①の受け入れに「常駐の再起動なしで直ること」を含める（統括、2026-11-24、msg_0f6999766653）。今動いている常駐の orca-web は古いコードなので、直したコードを読み込ませるには一度の再起動が要る。これは利用者か統括の操作で、受け入れは直したコードが以後の Orca の再起動から自力で戻ることを指す（タスク担当の解釈）",
	"`ptyId` を必須から外し、同一性は handle と incarnationId（と providerSession）で確かめる（タスク担当。根拠：Orca 1.4.272 の投影が同一性を handle の今の持ち主の incarnationId に結ぶこと、`terminal.inspectProcess` に `expectedIncarnationId` を付けて読むので Orca も別の pty を拒むこと）",
	"実装担当は Codex GPT-6.2 Sol / medium（本人の指示、統括の依頼書）",
]

questions: [
	"Orca の画面がタブを描いた後に、agent launch の端末のタブに `ptyId` が付くかは未確認（直したコードはどちらでも送れる）",
]
