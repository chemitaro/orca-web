package spec

design: {
	"D-01": {
		title: "status の振り分け（`src/apex/build.ts`）"
		text: """
			`NEEDS_ACTION` を apex_blocked・apex_waiting・apex_closed の3つにする。`WORKING` に member_blocked・member_waiting・question・decision・stalled を足す（今の working・monitoring・members_working・live_work・member_grace・grace はそのまま）。failed はどちらにも入れない。
			judge の status の決め方（needs_action → working → 眠り → unknown → done の順）、REASONS・FRESH_ONLY・active・groupOf は変えない。理由の判定（judgeWork）も変えない。
			注記に「配下の待ち・問いは統括が扱う。対応が必要は頂点自身だけ（iss-00112）」と書く。
			"""
		satisfies: ["R-01"]
	}
	"D-02": {
		title: "列の間の線（`web/style.css`）"
		text:  "`@media (min-width: 900px)` の中に `body.apexes-page:not(.apexes--selected) .apex-column + .apex-column { border-left: 1px solid var(--line); padding-left: 16px; }` を足す（gap 16px は今のまま）。"
		satisfies: ["R-02"]
	}
	"D-03": {
		title: "説明（AGENTS.md）"
		text:  "`src/apex/` の項の「対応が必要の判定は A1・A2 に加えて A3…」の文を、status を needs_action にするのは A1 と A5 だけで、A2〜A4 は理由に出して status working、A6 は status を決めない、と直す。web の項の3列の説明に縦の線を足す。"
		satisfies: ["R-01", "R-02"]
	}
}

compatibility: "文書 `orca-web.apexes/v1` の形は変えない。status・group・counts の値の付き方だけが変わる。通知（`apexes-notify.js`）は group needs_action だけを見るので、配下の問いでは鳴らなくなる。"
risks: ["配下の作業者が止まったまま統括も止まっている場合（今回の指先）は、作業中の列に残り、人が気づくのは遅れる。利用者の方針どおり。理由の札（未回答の質問・配下が許可待ちなど）は行に出る。"]
