package spec

// 計画（Epic）。型 specdock/v1。
// Epic の計画は、子の Scope への切り分けを持つ。実装の手順とテストは子の Scope が持つので、
// steps と tests は書かない。

// 目標（任意）。
// goal: "..."

// 子の Scope への切り分け。子の ID（iss-00001 など）をキーにする。covers（子に任せる要件・失敗の条件の番号）が必須。
// すべての要件を、いずれかの子に任せる。standard 以上では、それが「確かめるテストがある」にも当たり、
// strict 以上では、すべての失敗の条件を任せ、どの子にも、任せる番号を書く。
// 子の題名は GitHub に、子の保証レベルは子の requirement.cue にあるので、ここには書かない。
goal: "Orca 1.4.272 で止まった送信を直し、常駐の orca-web で届くことを確かめる。"

slices: {
	"iss-00073": {
		covers: ["R-01"]
		text:   "機能の判定のキャッシュ（runtime ID の一致した報告だけを持つ）と、ptyId のない端末のタブの宛先の同一性（handle・incarnationId）を直す。PR #74（マージ ac35101）"
	}
}

// 検証のしかた、戻し方、終わりの条件（任意）。critical では、切り分けがあれば rollback が要る。
// verification: "..."
// rollback:     "..."
// exit:         "..."

// 実行の割り当て（任意）。切り分けの session は、ここのセッションの名前を指す。
// レビューの after は、どの切り分けの後かを指す。モデルと推論の名前は、どんな文字列でもよい。
// execution: {
// 	sessions: coord: {task: "統括", model: "...", effort: "...", rationale: "..."}
// 	reviews: gate: {role: "最終の確かめ", after: "iss-00001", model: "...", effort: "..."}
// }
