package spec

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "Orca から読む項目を足し判定を広げる。読むだけで、誤りは表示に留まり、PR を戻せば元に戻る"
}

purpose: "頂点と配下を、子のタブが閉じた後も Run の世代と task の作成者で結び、対応が必要の理由（未回答の質問・未解決の判断・止まった仕事・新しい失敗・統括のタブが閉じたのに仕事が残る）を判定し、完了に残りの札を付ける。"

background: """
	Epic epic-00075 の切り分け（R-04、R-05、F-01）。iss-00076 の `src/apex/` を広げる。
	2026-11-25 の読みだけの確かめ（Orca v1.4.272、`orchestration run-list --full`・`task-list --full`・`worker-list --full`）：
	- run の記録に `consumer_generation`（整数）がある。orca-web は拾っていない（`src/orca/read-state.ts` の runs の pick）。
	- task の記録に `created_by_pane_key`、`created_by_process_incarnation`、`created_by_run_generation`（整数）がある。orca-web は `created_by_terminal_handle` だけを拾う（`pickTask`）。
	- worker の記録に `workerState`、`projection.attention.categories`（`input`＝その Dispatch の未回答の ask、`approval`＝その task の未解決の gate、ほかに `guidance`・`failure`・`interruption`・`stale`・`unverifiable`・`root_completion`）、`projection.attention.requiresAction`、`projection.parent.taskId` がある。orca-web は `attention` を拾わない（`pickWorker`）。
	- Fable 5.2 の実機の集計（同日）：根の task 357 のうち 169 は作成者の handle と paneKey を持ち、188 は3項目とも null（構造化 Chat の統括）。（Run、世代）ごとに根の task の作成者は1つ。`coordinatedFrom` は全件 null で頂点の材料にならない。
	- Opus 5.5 のレビュアーの指摘：`requiresAction` は failure でも真になる。未完の task（blocked 60・ready 8 など）は放置された古い Run に残る。dispatchStatus の failed は stopped・abandoned を含む（workerState の failed は 30）。
	"""

includes: [
	"Orca から読む項目の追加（run の consumer_generation、task の created_by_pane_key・created_by_run_generation、worker の attention.categories。worker の workerState は既に `workers[].state` にある）。`/api/state` の JSON には出さない",
	"頂点と配下の結び（生きた辺、端末の統括の task の作成者、構造化 Chat の統括のメモリの対応表）",
	"対応が必要の判定 A3〜A6 と、鮮度の扱い、データの時刻の起点",
	"完了の残りの札、結べない仕事の絞り込み",
	"画面の理由の札の言葉と、チームの数の表示の更新",
]
excludes: [
	"チームの階層の図と履歴の帯（iss-00079）",
	"対応のカードと答える操作（iss-00080）",
	"通知（iss-00081）",
	"Run の木（`src/runs/`）の結びの入れ替え（iss-00082）",
	"`orca-web.state/v1` の項目の追加",
	"Orca に読む要求のほかを送ること、統括の連絡を既読にすること",
]

requirements: {
	"R-01": {
		title: "足りない項目を Orca から読み、新しい API の中だけで使う"
		text:  "run の `consumer_generation`、task の `created_by_pane_key`・`created_by_run_generation`、worker の `projection.attention.categories` を（worker の `workerState` は既に `workers[].state` として読んでいるのでそれを使う）、今の読み（`run-list --full`・`task-list --full`・`worker-list --full`）の応答から拾う。新しい CLI の命令は足さない。`/api/state` の文書（`orca-web.state/v1`）には出さず、頂点の一覧の組み立てだけが使う。"
		acceptance: [
			"録画の再生で、拾った値が頂点の一覧の組み立てに届く",
			"`/api/state` の JSON の形が今のまま（新しい鍵がない）",
		]
	}
	"R-02": {
		title: "頂点と配下を、閉じた子も含めて結ぶ"
		text: """
			「束」＝（Run の id、世代）の task の集まり。
			1. 生きた辺（iss-00076 のまま）：`parentPaneKey`＝`paneKey`。
			2. 端末の統括：束の根の task（`parent_id` なし）の `created_by_pane_key` が頂点の `paneKey` に一致すれば、その束は頂点のもの。
			3. 構造化 Chat の統括：1 で頂点に結べたメンバーの `worker`（dispatchId・taskId・runId）から task をたどり、その task の束を頂点に結ぶ。この対応（束 → 頂点の id）をメモリだけに持ち、メンバーのタブが閉じた後も使う。
			4. 束の生きた仕事は、Run の今の世代（`consumer_generation`）の束の頂点にだけ結ぶ。古い世代の束の頂点には、終わった履歴だけを結ぶ。
			5. `worker` があり親の見つからないエージェント（iss-00076 の worker_without_parent）は、その task の束の頂点が分かれば、その頂点のメンバーにする。
			6. 1つのエージェントは1つの頂点にだけ入る（生きた辺が先）。1つの Dispatch は1つの頂点にだけ数える：生きた辺のメンバーのエージェントの Dispatch（`agent.worker.dispatchId`）は、そのメンバーの頂点に数え、4 の付け替えをしない。4 は、タブのあるエージェントに結ばれていない生きた Dispatch にだけ当てる。
			7. 配下の数（counts）は、生きた辺のメンバーと束の Dispatch を、Dispatch の id で重ねずに数える（メンバーのエージェントと同じ Dispatch は1つ）。
			"""
		acceptance: [
			"端末の統括が頂点のとき、子のタブがない束の task と Dispatch が、その頂点の配下の数（全体）に入る",
			"構造化 Chat の統括は、メンバーのタブがあるうちに一度結べば、タブが閉じた後もその束が頂点に結ばれる（同じプロセスの間）",
			"run-use で世代が上がった Run では、タブのあるエージェントに結ばれていない生きた Dispatch は、今の世代の束の頂点にだけ数えられる",
			"タブのある作業者は、生きた辺のメンバーとしても束の Dispatch としても1回だけ数えられる",
		]
	}
	"R-03": {
		title: "対応が必要の理由を広げる（A3〜A6）"
		text: """
			前提：鮮度 F ＝ 状態の文書の取得元のうち tasks と workers がどちらも stale でない。生きた仕事 ＝ 頂点に結んだ束の Dispatch で、`workerState` が終わっていない（succeeded・failed・stopped・abandoned・cancelled でない）もの。動いている ＝ state が working（monitoring を含む）。時刻はすべてデータの値から測り、猶予 G ＝ 90 秒。
			iss-00076 の A1・A2 の後に、次の順で見る。どれも F が真のときだけ新しく当たる。
			- A3 問い：束の Dispatch の attention に `input`（未回答の ask）か `approval`（未解決の gate）があり、ask なら頂点が動いていない、gate なら頂点が「monitoring を除く working」でない状態が、max(頂点の stateStartedAt, その Dispatch の task の作成の時刻) から G を超えた。理由 `question`・`decision`。
			- A4 止まった仕事：生きた仕事があり、頂点もチームのメンバーも誰も動いていない状態が、max(頂点の stateStartedAt, メンバーの stateStartedAt の最大) から G を超えた。理由 `stalled`。
			- A5 統括のタブ：頂点が端末のタブ（kind `terminal-tab`）で、`terminal` が null でも `attached` でもない値（`awaiting-restore` を含む）で、生きた仕事か問いがある。構造化 Chat とタブのない行には当てない（terminal の取得元がない）。理由 `apex_closed`。
			- A6 新しい失敗：束の task ごとに最後の Dispatch（worker-list の並びで最後）の `workerState` が `failed` で、その task の `completed_at` と頂点の stateStartedAt の両方が読めて、completed_at が後で、頂点が動いていない状態が completed_at から G を超えた。どちらかが読めなければ当てない。理由 `failed`。
			- A3 の起点は、頂点の stateStartedAt とその task の createdAt のうち読めるものの最大。どちらも読めなければ猶予なし。A4 の起点は、頂点とメンバーの stateStartedAt のうち読めるものの最大。どれも読めなければ当てない。
			- 鮮度 F が偽の間：A3〜A6 を新しく判定せず、F が真だった最後の判定でその頂点に当たっていた A3〜A6 の理由をそのまま使う（その頂点が文書にある間）。F が偽の間に、A3〜A6 だけで対応が必要だった頂点が完了へ移ることはない。最後の判定はメモリだけに持つ（F-01 と同じく捨てる）。
			作業中には、生きた仕事がある、または A3・A4・A6 の猶予の中、を足す（理由 `live_work`・`grace`）。
			"""
		acceptance: [
			"頂点が done で、未回答の ask の Dispatch があり 90 秒たつと対応が必要（question）。89 秒なら作業中",
			"頂点が monitoring で未解決の gate があると、90 秒で対応が必要（decision）。ask だけなら monitoring の間は作業中",
			"生きた Dispatch があり誰も動いていない状態が 90 秒続くと対応が必要（stalled）",
			"頂点のタブが復元待ちで生きた仕事があると対応が必要（apex_closed）",
			"頂点の状態が始まった後に failed になった Dispatch があり頂点が動いていないと、90 秒で対応が必要（failed）。始まる前の失敗では当たらない",
			"tasks か workers の取得元が stale の間は A3〜A6 に新しく当たらず、その前に A3〜A6 で対応が必要だった頂点は対応が必要のまま（完了へ移らない）",
			"構造化 Chat の頂点は、生きた仕事があっても apex_closed にならない",
		]
	}
	"R-04": {
		title: "放置された古い task だけでは対応が必要にしない"
		text:  "ready・pending の task と、gate のない blocked の task、生きた Dispatch のない古い世代の束は、A3〜A6 の材料にしない。完了の頂点の札（残りの task n）にだけ使う。"
		acceptance: [
			"blocked・ready の task だけが残る束を持つ done の頂点は完了で、札「残りの task n」が付く",
		]
	}
	"R-05": {
		title: "完了の頂点に残りの札を付ける"
		text:  "完了の頂点の札：`merge_pending`（頂点かメンバーの worktree の PR が open で CI が success か未設定）、`ci_failed`（PR が open で CI が failure）、`failed_members`（束の failed の Dispatch の数）、`remaining_tasks`（束の終わっていない task の数）。札は毎回データから出し、直れば消える。"
		acceptance: [
			"PR が open で CI が failure の worktree にいる完了の頂点に札 ci_failed が付き、CI が通ると消える",
		]
	}
	"R-06": {
		title: "結べない仕事を絞る"
		text:  "結べない仕事の段には、iss-00076 の結べないエージェントに加え、どの頂点にも結べない束のうち、生きた Dispatch か問いがあるものだけを出す（束の Run の目的の1行、生きた数、問いの数）。`?project=` のときは、束の Dispatch の worktree（`workers[].worktreeId`）のどれかがその repo にある束だけを出す。"
		acceptance: [
			"終わった Dispatch しかない結べない束は段に出ない",
		]
	}
	"R-07": {
		title: "画面に新しい理由と札、配下の数を出す"
		acceptance: [
			"理由 question・decision・stalled・apex_closed・failed・live_work と札 merge_pending・ci_failed・failed_members・remaining_tasks に日本語の言葉が付いて行に出る",
			"行の配下の数が、生きた辺のメンバーと結んだ束の Dispatch を合わせた「動いている/全体」になる",
		]
	}
}

failures: {
	"F-01": {
		title: "メモリの対応表を捨てる"
		text:  "束 → 頂点の対応表は、Orca の読みの世代（ポーラーが新しく読み終えた回）ごとに1回だけ掃除する（同じ世代の文書を何度読んでも1回）。頂点が、tabs の取得元が stale でなく接続が connected の文書で2世代続けて消えたとき、束の task がすべて終わって 24 時間たったとき、プロセスが終わったときに捨てる。ファイルに書かない。上限 1,000 件を超えたら古い順に捨てる。"
	}
	"F-02": {
		title: "読めないときに誤って鳴らさない"
		text:  "鮮度 F が偽の間は A3〜A6 に新しく当たらない。orca-web の再起動の後は、構造化 Chat の束はメンバーのタブで結び直すまで結べない仕事に出る（利用者の 2026-11-25 の判断で受け入れ、Orca 本体への要望は iss-00082）。"
	}
}

constraints: [
	"実装は iss-00077 が main に入った後に、その main から始める（同じ `web/apexes*.js` と README・AGENTS.md を変えるため。iss-00077 の2ペインの描き方の上に札と結べない束を足す）",
	"AGENTS.md の守ること（Orca には読む要求だけ。`orchestration check` を使わない。統括の連絡を既読にしない）",
	"`orca-web.state/v1`・`/embed/*`・`/api/worktrees/summary` を変えない",
	"判定は `src/apex/` の1か所に置く",
]

questions: [
	"Epic の問い「構造化 Chat の /clear で paneKey が変わるか」は、読むだけの確かめでは起こせないので、この Issue では決めない。対応表は paneKey でなく頂点のエージェントの id で持つので、paneKey が変わっても対応表は保たれる（生きた辺は新しい paneKey で結び直す）。残りは Epic の未決として残す",
]

decisions: [
	"Epic epic-00075 の decisions を引き継ぐ",
	"猶予 G＝90 秒、時刻はデータの値から測り、鮮度が偽の間は新しく鳴らさない（Opus 5.5 のレビュアーの提案をタスク担当が採用、2026-11-25）",
	"未完は生きた Dispatch と問いだけで数え、放置された task は札だけにする（同上）",
	"生きた仕事は Run の今の世代の束の頂点に結ぶ（同上。run-use の引き継ぎに合わせる）",
]
