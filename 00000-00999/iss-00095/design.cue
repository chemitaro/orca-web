package spec

design: {
	"D-01": {title: "プロセスの有無（`src/apex/build.ts`）", text: "純粋な関数 `processAbsent(apex, sources)`：chat-tab で paneKey が null かつ `sources.worktreePs` の lastSuccessAt があり stale が偽、または terminal-tab で terminal が null でも attached でもなく `sources.tabs` の stale が偽。どちらでもなければ偽（判定できないときも偽）。judge で、mark が unknown・静か（found に NEEDS_ACTION と WORKING の理由がない）・processAbsent のとき status done、found に sleeping、tags は空、judged に `asleep: true`。", satisfies: ["R-01"]}
	"D-02": {title: "段 unknown（`src/apex/model.ts`・`build.ts`）", text: "`ApexGroup` に `unknown`。groupOf の先頭（needs_action の後）で、judged.asleep なら `sleeping`。status が working で理由がなく札 unverified のもの（静かな unknown）は `unknown`。今の `judged.status === working && at < now - RECENT_MS → sleeping` の決まりを消す（awaiting-restore と done の 7 日の決まりは残す）。", satisfies: ["R-02"]}
	"D-03": {title: "画面（`web/apexes-view.js`）", text: "SECTION_ORDER の sleeping の後に unknown、COLLAPSED に unknown、段の言葉「不明」。行の札 unverified の言葉は今のまま。", satisfies: ["R-03"]}
}
