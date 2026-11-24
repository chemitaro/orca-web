package spec

// 要件（Epic）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。
// 文章の項目には Markdown を書いてよい。型にない項目は、必要に応じて足してよい。

// 型の版。消さない。
schema: "specdock/v1"

// 保証レベル（light、standard、strict、critical）と、その理由。
// 失敗したときの影響と回復の難しさで選ぶ（工数や作業の難しさでは選ばない）。
// 具体化や作業の途中で、上げても下げてもよい。正本はここだけで、ほかの場所に写さない。
assurance: {
	level:  "standard"
	reason: "Orca の版上げで壊れた orca-web の機能を、既存の契約と安全の制約を保って直す。範囲は orca-web の中で、版を戻せばすぐ戻せる"
}

// 目的と背景（任意）。
// purpose:    "この Epic が実現する価値"
// background: "解く問題と、関係者"

// 対象と対象外（任意）。
// includes: ["..."]
// excludes: ["..."]

// 観測できる要件。番号（R-01、R-02、…）をキーにする。
// title は必須。acceptance（観測できる受け入れの条件）は standard 以上で必須。
purpose: "Orca の版上げで壊れた orca-web の機能を、既存の契約と安全の制約を保って直し、今の Orca で使える状態に戻す。"
background: "Orca を v1.4.272 に上げた後、orca-web からエージェントへのチャットの送信が止まった（2026-11-24 に統括が依頼）。"

requirements: {
	"R-01": {
		title: "今の Orca（1.4.272）で、orca-web からエージェントへの送信と質問の答えが届く"
		text:  "構造化 Chat と端末のエージェントの両方。送信の門の安全の制約（送る経路と再送の道を足さない）を保つ。"
		acceptance: [
			"常駐の orca-web で、検証用の端末と構造化 Chat の宛先への送信が届き、返事が来る",
			"Orca の再起動のあと、orca-web の再起動なしに送れる状態へ戻る（テスト）",
		]
	}
}

// 失敗・境界の条件。番号（F-01、…）をキーにする。
// title は必須。impact（起きたときの影響）と recovery（回復のしかた）は strict 以上で必須。
failures: {
	// "F-01": {
	// 	title:    "〜のときは、何も書かずに止まる"
	// 	impact:   "〜"
	// 	recovery: "〜"
	// }
}

// 制約・前提、合意した判断、未解決事項（任意）。
// constraints: ["..."]
// decisions: ["..."]
// questions: ["..."]
