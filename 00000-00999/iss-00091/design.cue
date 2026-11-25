package spec

design: {
	"D-01": {title: "activity を読む", text: "`src/orca/read-state.ts` の pickWorker に `activity: str(rec(p?.stage)?.activity)` を足し、`src/apex/extras.ts` の workers の値に `activity` を足す。状態の文書（normalize）には出さない。", satisfies: ["R-01", "F-01"]}
	"D-02": {title: "A3 の判定", text: "`src/apex/build.ts` の judgeWork で、asks・gates を作るときに activity が `working` の Dispatch を分ける。working のものは対応が必要の材料にせず、1つでもあれば found に `question_working` を足す。memo（鮮度が古い間）にも同じ理由が残る。`ApexReason` に `question_working` を足し、理由の順は question・decision の後。", satisfies: ["R-01", "R-02"]}
	"D-03": {title: "questions と画面", text: "questionsOf の各項目に `working: boolean`。`web/apexes-view.js` の理由の言葉に `question_working: '質問あり（作業は継続中）'`。`web/apexes-cards-view.js` は working のカードに「作業を続けながらの質問」を添える。", satisfies: ["R-02"]}
}
