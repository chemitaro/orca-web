package spec

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "LaunchAgent の定義に ProcessType を1つ足すだけ。登録の入れ替えは利用者の install で行い、元の定義に戻せば元に戻る"
}

purpose: "Mac の負荷が非常に高いときでも、常駐の orca-web が Orca の orchestration（runs・tasks・workers）を時間内に読めるようにし、指揮の画面の判定が古いまま残らないようにする。"

background: """
	利用者の指摘（2026-11-27、会話）：指先（yubisaki）の統括の頂点が、iss-00065 の質問で「対応が必要（質問）」のままだが、統括に聞くと回答済み。以前（iss-00098）直したはずが再発している。
	タスク担当の調べ（2026-11-27、読むだけ）：
	- 頂点の questions は Dispatch ctx_d222f86ce2fa の ask で `answered: null`。その Run のやり取りを `orchestration inbox --run … --full`（読むだけ）で読むと、最新の質問（01:25Z）の後、02:16Z に宛先が本人の Dispatch の本当の返事がある。同じデータを `createThreadReader` に通すと `answered: true`。iss-00098 の判定は正しい。
	- 常駐の `/api/state` の取得元：workers の最後の成功が 01:54Z、tasks は 02:08Z、runs も 15 秒の時間切れを繰り返す（02:50Z 時点）。workers が古い間は memo の最後の判定（質問の返事の前）が残る。
	- 同じ命令（`orchestration worker-list --full --limit 100`）は、タスク担当のシェルからは 0.4〜1 秒で返る。常駐（launchd の LaunchAgent、spawn type daemon）とその子の CLI は優先度 PRI 20、タスク担当のシェルは 31。`taskpolicy -c utility`（PRI 20）で同じ命令を走らせると 0.5 秒→4.8 秒。load average 240〜270（指先の iss-00071・00072 の Python の処理）の下では 15 秒を超える。
	- 原因：LaunchAgent に ProcessType がなく、常駐が低い優先度で動くため、負荷の高いときに Orca の読みが時間切れになり、判定が古いまま残る。
	"""

includes: ["`src/service/launchd.ts` の plist に `ProcessType` `Interactive` を足す"]
excludes: ["Orca の読み方・時間切れの値・判定の変更", "利用者の launchd の登録の入れ替え（利用者が `npm run service:install` で行う）"]

requirements: {
	"R-01": {
		title: "常駐をアプリと同じ優先度で動かす"
		text:  "LaunchAgent の定義（renderPlist）に `<key>ProcessType</key><string>Interactive</string>` を足す。ほかのキーは今のまま。入れ替えた後、常駐とその子の CLI の優先度がアプリと同じ（PRI 31 程度）になり、負荷の高いときでも orchestration の読みが時間切れになりにくい。"
		acceptance: [
			"renderPlist の出力に ProcessType Interactive がある（ほかのキーと順は今のまま）",
			"install --dry-run の出力に ProcessType Interactive が出る",
			"入れ替えた後（利用者の install の後）、常駐の pid の PRI がタスク担当のシェルと同じ程度で、workers の取得元が新しくなり、指先の頂点の質問が answered 真（対応が必要でない）になる",
		]
	}
}

constraints: ["AGENTS.md：launchd の登録はエージェントが変えない（install は利用者が行う）"]
decisions: [
	"判定のずれの原因は判定ではなく、常駐の優先度による読みの時間切れ（タスク担当、2026-11-27、計測による）",
	"コーディングは Opus 5.5 で行う（利用者、2026-11-26、会話）",
]
