package spec

// 計画（Epic）。型 specdock/v1。

goal: "土台→状態の API と開く口（並行）→常駐と実機の受け入れの順で、SpecDock の epic-00471 が使える状態の API と開くボタンを出す。"

slices: {
	"iss-00005": {
		covers: ["F-02"]
		text:   "雛形、テストと lint、Orca のアダプター（CLI と RPC）、機能の確かめ、録画と再生の基盤。実機で、モデルと推論、スリープ、タブの識別子が取れるかを確かめて記録する"
	}
	"iss-00006": {
		covers: ["R-01", "R-02", "R-03", "F-01"]
		text:   "状態の API、項目の一覧と選択、読み取りの CORS"
		after: ["iss-00005"]
	}
	"iss-00007": {
		covers: ["R-04", "R-05", "F-03", "F-04"]
		text:   "書き込みの守り、開く口、単独のボタンの部品"
		after: ["iss-00005"]
	}
	"iss-00008": {
		covers: ["R-06"]
		text:   "launchd での常駐、待ち受けのアドレス、Mac とスマホでの実機の受け入れ"
		after: ["iss-00006", "iss-00007"]
	}
}

verification: "各 Issue で録画と再生のテストを書き、iss-00008 でこの Mac の実機で通して確かめる。"
exit:         "SpecDock の別のオリジンの画面から、状態を読み、ボタンだけで Orca の該当のタブを前面に出せる。"
