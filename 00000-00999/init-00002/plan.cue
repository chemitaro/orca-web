package spec

// 計画（Initiative）。型 specdock/v1。

goal: "作る順：詳細とチャット（読む）→ 受け箱 → 木とプロジェクトの画面 → 確かめて送る → 稼働の印 → 利用者の確かめ → SpecDock への組み込み（spec-dock の epic-00471・00526）。"

slices: {
	"epic-00003": {
		covers: ["R-01", "R-02", "R-03", "R-04", "R-08", "F-01", "F-02", "F-04"]
		text:   "接続の土台、状態の API、安全な書き込みの境界、「Orca で開く」と単独のボタン、launchd での常駐"
	}
	"epic-00004": {
		covers: ["R-05", "R-06", "R-07", "F-03"]
		text:   "エージェントの詳細とチャット（読む、確かめて送る）、稼働の印の要約の API、SpecDock への3つの部品の受け入れ"
		after: ["epic-00003"]
	}
	"epic-00016": {
		covers: ["R-09", "R-10"]
		text:   "単独の画面：要対応の受け箱（入口）、オーケストレーションの木とプロジェクトの画面"
		after: ["epic-00003"]
	}
}

verification: "各 Epic の Issue で、録画と再生のテストと、この Mac の実機での確かめを行う。"
exit:         "両方の Epic が完了し、SpecDock のダッシュボードから状態を見て、開いて、送れる。"
