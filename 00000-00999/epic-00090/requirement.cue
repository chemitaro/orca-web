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
	reason: "利用で見つかった判定と表示の改善。読み取りと表示だけで、送信と Orca の状態は変えない"
}

purpose: "epic-00075 で作った指揮の画面を実際に使って見つかった、判定と表示の不足を直す。"

requirements: {
	"R-01": {title: "作業を続けている作業者の問いでは対応が必要にしない", acceptance: ["activity が working の Dispatch の ask・gate で頂点が対応が必要にならない"]}
	"R-03": {title: "状態の分からない頂点を不明に、プロセスのない Chat のタブを眠っているに分ける", acceptance: ["作業中の段に、動いていると分かる頂点だけが並ぶ"]}
	"R-04": {title: "配下のどのメンバーに対応が必要かを示す", acceptance: ["対応が必要なメンバーの節に印が出る"]}
	"R-05": {title: "未回答の判定を、やり取りと判断の門の事実で確かめる", acceptance: ["返事の付いた質問で対応が必要にならない"]}
	"R-02": {title: "頂点の行に稼働中のメンバーの内訳と多段の構成を出す", acceptance: ["稼働中のメンバーが行の下に深さに沿って出る"]}
}

decisions: ["利用者が 2026-11-26 に実際に使い、2つを Issue にして直すよう依頼した"]
