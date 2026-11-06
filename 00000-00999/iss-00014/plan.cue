package spec

// 計画（Issue）。型 specdock/v1。
// 作業しながら、手順の追加、変更、status の更新を、このファイルに直接書く。

// 目標（任意）。
// goal: "..."

// 実装の手順。番号（S-01、…）をキーにし、番号の順に並べる。
// title と realizes（満たす要件・失敗の条件の番号）が必須。
// status は todo（既定）、doing、done、dropped。after は先に済ませる手順の番号。
// 1手順を1行に書き、status は title と realizes のすぐ後に置く。status の位置がそろうので一括で書き換えやすく、
// 同じ手順に status を2つ書く誤りも防げる（同じ値の2つは CUE が黙ってまとめ、違う値なら誤りになる）。
// すべての要件に、それを満たす手順が要る（dropped の手順は数えない）。
// strict 以上では、dropped でない手順のすべてが、いずれかの番号に結び付く。
steps: {
	// "S-01": {title: "〜を作る", realizes: ["R-01"], status: "todo", after: ["..."], session: "impl"}
}

// テスト。番号（T-01、…）をキーにする。title と verifies（確かめる要件・失敗の条件の番号）が必須。
// standard 以上では、すべての要件に、strict 以上では、すべての失敗の条件に、確かめるテストが要る。
tests: {
	// "T-01": {title: "〜を確かめる", verifies: ["R-01"]}
}

// 検証のしかた、戻し方、終わりの条件（任意）。critical では、手順があれば rollback が要る。
// verification: "..."
// rollback:     "..."
// exit:         "..."

// 実行の割り当て（任意）。手順の session は、実装のセッション（impl）を指す。
// セッションのモデルと推論は起動のときに決まるので、計画で選べるのは、計画の後に起動するセッション（実装担当）の値。
// 計画を書いたセッション（spec）の値は、事実として記録する。
// レビューの after は、どの手順の後かを指す。モデルと推論の名前は、どんな文字列でもよい。
// execution: {
// 	sessions: {
// 		spec: {task: "仕様化（起動した側が選んだ値の記録）", model: "...", effort: "...", rationale: "<起動した側と根拠>"}
// 		impl: {task: "実装", model: "...", effort: "...", rationale: "..."}
// 	}
// 	reviews: code: {role: "コードのレビュー", after: "S-01", model: "...", effort: "..."}
// }
