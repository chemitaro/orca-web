package spec

// 設計（Epic）。型 specdock/v1。

// 設計目標、今の状態と、この Epic の後の状態（任意）。
// goals: ["..."]
// current: "..."
// target:  "..."

// 設計の単位（責務、interface、data など）。番号（D-01、…）をキーにする。
// title と satisfies（満たす要件・失敗の条件の番号）が必須。
// standard 以上では、すべての要件に、それを満たす設計が要る。
design: {
	"D-01": {
		title:     "版上げの原因ごとに子の Issue で直す"
		text:      "読むだけの再現で Orca のどの変更か、orca-web のどこで落ちるかを証拠付きで特定し、送信の門の形を変えない最小の修正を子の Issue（iss-00073）で行う。詳しい設計は子の design.cue にある"
		satisfies: ["R-01"]
	}
}

// 移行・互換性、リスク（任意）。
// compatibility: "..."
// risks: ["..."]
