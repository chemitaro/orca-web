package spec

// 計画（Epic）。型 specdock/v1。

goal: "利用者が `/` を開くと頂点が3つの状態で並び、対応が必要な頂点に気づき、階層と対応を見て、同じ画面で頂点に指示できる。"

slices: {
	"iss-00076": {
		covers: ["R-01", "R-02", "R-03"]
		text:   "頂点の一覧（今ある項目だけ）：`src/apex/`、`GET /api/apexes`、一覧の画面。判定は A1・A2・作業中・不明の札、畳む段。行から既存のチャットを新しいタブで開く"
	}
	"iss-00077": {
		covers: ["R-06", "R-07", "F-02"]
		text:   "会話を同じ画面で開く：iframe の作り直し、embed だけに frame-ancestors 'self'、AGENTS.md の文言、見えない間の読みの停止、幅の扱い、新着の点"
		after:  ["iss-00076"]
	}
	"iss-00078": {
		covers: ["R-04", "R-05", "F-01"]
		text:   "結びと対応の判定の完成：読む項目の追加（新しい API の中だけ）、Run の世代と task の作成者、A3〜A6、残りの札、結べない仕事。先に読むだけの実機の確かめ"
		after:  ["iss-00076"]
	}
	"iss-00079": {
		covers: ["R-08"]
		text:   "チームの帯（字下げの木）と履歴の帯"
		after:  ["iss-00077", "iss-00078"]
	}
	"iss-00080": {
		covers: ["R-09"]
		text:   "対応のカード：メンバーの承認、質問・判断の下書き"
		after:  ["iss-00077", "iss-00078"]
	}
	"iss-00081": {
		covers: ["R-10", "F-04"]
		text:   "気づかせ方：題名の件数、favicon、デスクトップの通知"
		after:  ["iss-00076"]
	}
	"iss-00082": {
		covers: ["R-11", "F-03"]
		text:   "`/` の差し替え、受け箱を `/inbox`、リンクの修正、Run の木の結びの入れ替え、Orca 本体への要望の下書き（送るのは利用者の了承の後）"
		after:  ["iss-00079", "iss-00080", "iss-00081"]
	}
}

verification: "各 Issue が coding-task の関門（仕様のレビュー、区切りのレビュー、最終品質ゲート、CI）を通る。Epic の終わりに、常駐の orca-web で `/` を開き、実データの頂点が3つの状態で並ぶことを確かめる。"
exit:         "7つの Issue が完了し、`/` が指揮の画面になり、SpecDock の埋め込みが今のとおり動く。"

execution: {
	sessions: owner: {task: "Epic の統括とタスク担当（利用者との会話のセッション）", model: "opus", effort: "high", rationale: "本人の指示（2026-11-25、Opus 5.5 を積極的に使う）。Claude Code の会話のセッションの値の記録"}
}
