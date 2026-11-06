package spec

// 計画（Initiative）。型 specdock/v1。

goal: "状態の口と「Orca で開く」を先に出し、SpecDock の epic-00471 を進められるようにしてから、チャットの小窓を作る。"

slices: {
	"epic-00003": {
		covers: ["R-01", "R-02", "R-03", "R-04", "R-08", "F-01", "F-02", "F-04"]
		text:   "接続の土台、状態の API、安全な書き込みの境界、「Orca で開く」と単独のボタン、launchd での常駐"
	}
	"epic-00004": {
		covers: ["R-05", "R-06", "R-07", "F-03"]
		text:   "会話のログ、確認つきの送信と記録、SpecDock への埋め込みの受け入れ"
		after: ["epic-00003"]
	}
}

verification: "各 Epic の Issue で、録画と再生のテストと、この Mac の実機での確かめを行う。"
exit:         "両方の Epic が完了し、SpecDock のダッシュボードから状態を見て、開いて、送れる。"
