package spec

// 要件（Issue）。型 specdock/v1。書き方は spec-dock/docs/authoring/ のガイドにある。

// 型の版。消さない。
schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "会話の表示の描き方を変える。書き込みの経路は変えないが、エージェントの発言（外から来る文字）を DOM の要素にするので、HTML を解かない守り（textContent だけ）と、リンクの scheme の制限を保つ。誤っても表示が崩れるだけで、戻すときは PR を戻せば今の文字のままの表示に戻る"
}

purpose: """
	`/embed/agent`（エージェントの詳細とチャットの小窓。SpecDock の欄に埋め込む）で、エージェント（AI）側の発言の Markdown（よく使われる GFM の部分）を描く。
	描き方は、Markdown を DOM の要素（createElement と textContent）に変える小さな自前の部品で行い、innerHTML などの HTML を解く口を使わず、Markdown の中の生の HTML は文字として出す。
	"""

background: """
	本人の要望（2026-11-18）：Orca を使ったチャットで、エージェント側の発言はたいてい Markdown で書かれているのに、描かれずにそのままの文字で出ている。Markdown を描いてほしい。
	統括の決定（依頼書 owner-iss-00061.md、2026-11-18）：描くのはエージェント側の発言だけ。自前の部品で、innerHTML・outerHTML・insertAdjacentHTML を使わず、依存を足さない。描く範囲は見出し、段落、改行、太字・斜体・取り消し線、行内のコード、言語つきのコードの塊、箇条書き（入れ子、番号付き、チェック）、引用、表、横線、リンク（http・https だけ）。画像は描かずリンクにする。狭い枠（390px）と明暗で読め、長い会話でも重くならない。
	orca-web の今（main 0a55268、確かめた事実）：
	- `web/embed/agent-view.js` の buildChat は、発言の続いた text の部分を `\\n\\n` でつないで行 `{kind: 'bubble', key, role: 'user' | 'assistant', at, text, truncated}` にする（role system は notice）。
	- `web/embed/agent-dom.js` の renderChatRow は、bubble を `make(doc, 'div', row.text, 'bubble')`（textContent）で描く。CSS は `li.row > .bubble { white-space: pre-wrap; max-width: 92% }`。
	- `web/embed/agent-frame.js` の renderChat は、会話が変わるたびに `els.log.replaceChildren()` の後、buildChat の全部の行を renderChatRow で描き直す（質問・承認のカードの選択の変化は renderQuestionRow でその行だけ）。窓は最新の 40 件（`src/transcript/hub.ts` の limit）と「前を読む」で足した分。
	- 本文の長さは正規化で 100,000 字（MAX_TEXT_CHARS）までに切られ、切ったときは truncated 真。
	- `/embed/agent` の中のリンクは `agent-dom.js` の newTabLink だけで作る決まり（AGENTS.md。`_blank`、`noopener noreferrer`、印 LINK_ICONS）。
	- 画面のファイルは `src/server/app.ts` の STATIC_FILES に載せたものだけが配られる。
	"""

includes: [
	"Markdown を、決めた形の木（物と配列だけの値）に解く純な関数（新しいファイル）",
	"木を DOM の要素にする関数（新しいファイル。createElement・textContent・決めた属性だけ）",
	"小窓の会話の assistant の bubble をその部品で描き、同じ行を描き直さないこと",
	"agent.css の Markdown の見た目（狭い枠、明暗、横に長いコードと表は枠の中で横に動く）",
	"STATIC_FILES への新しいファイルの追加",
	"README.md と AGENTS.md の追記、描画の写し（偽の会話、Mac の幅と 390px、明暗）、試しのエージェントでの実機の写し",
]

excludes: [
	"本人の発言（role user。ほかのエージェントからの引用 fromAgent も含む）、system の notice、ツールの入力・出力、unsupported の行の描き方（今のまま文字）",
	"質問・承認のカードの中の文（問い、説明、選択肢のラベル、要約）の Markdown（今のまま文字。理由は decisions）",
	"コードの色付け、数式、脚注、HTML の実体参照（`&amp;` など）の解読、参照式のリンク（`[a][1]` と `[1]: url`）、Setext の見出し（下線の `===`）、字下げのコードの塊（4つの空白）",
	"画像を画像として描くこと（リンクとして出す）",
	"コピーのボタン（コードの塊は選んでコピーできればよい）",
	"受け箱（`/`）、Run の木、状態の画面の描き方",
	"会話の API（`orca-web.transcript/v1`）とサーバーの振る舞いの変更（STATIC_FILES の追加のほか）",
	"SpecDock 側の組み込み（spec-dock の epic-00471・00526）",
]

requirements: {
	"R-01": {
		title: "エージェントの発言の Markdown が、決めた範囲の構文で描かれる"
		text: """
			小窓の会話で、role assistant の bubble の本文を、次の構文で描く（ほかの行は今のまま文字）：
			- 見出し（ATX：行頭の `#` 1〜6個と空白。閉じの `#` は落とす）
			- 段落と改行（段落の中の1つの改行は、そのまま改行として描く。チャットで書いたとおりに読めるように）
			- 強調：太字（`**` `__`）、斜体（`*` `_`。語の中の `_` は強調にしない）、取り消し線（`~~`）、行内のコード（`` ` `` の数を合わせる）
			- コードの塊（`` ``` `` か `~~~` の柵。開きの柵の後の語を言語として、塊の上に小さく示す。閉じのない塊は本文の終わりまで）
			- 箇条書き（`-` `*` `+`、番号付きの `1.` `1)` と開始の番号、入れ子、チェック `[ ]` `[x]`）
			- 引用（`>`、入れ子、引用の中の箇条書きやコード）
			- 表（GFM：見出しの行と区切りの行 `|---|:---:|`、寄せ、セルの中の行内の構文、`\\|`）
			- 横線（`---` `***` `___`）
			- リンク（`[文字](url)`、`<url>`、本文の中の素の `http://`・`https://` の URL）と画像（`![alt](url)` はリンクとして描く）
			- 逆斜線の逃がし（ASCII の記号の前の `\\`）
			"""
		acceptance: [
			"各構文の Markdown を解いた木と、描いた DOM の要素（タグ、クラス、文字）が決めた形になる（単体のテスト）",
			"本人の発言、notice、ツールの行、質問・承認のカードは今のまま文字で描かれる（今のテストが通る）",
		]
	}
	"R-02": {
		title: "生の HTML と危ない URL は、要素にも属性にもならず、文字として出る"
		text: """
			Markdown の中の生の HTML（`<script>`、`<img onerror>`、`<a href>`、`<iframe>`、`<style>`、閉じていない `<` など）は、書いたとおりの文字として描く。
			リンクの URL は、`new URL()` で解け、protocol が `http:` か `https:` で、空白と制御文字を含まないときだけ、リンク（newTabLink：`target=_blank`、`rel=noopener noreferrer`）にする。ほか（`javascript:`、`data:`、`vbscript:`、`file:`、相対の URL、大文字・空白・制御文字・実体参照で隠した scheme など）は、元の Markdown の文字のまま描く。
			描く部品は、innerHTML・outerHTML・insertAdjacentHTML・document.write・on で始まる属性・style の属性を使わない。要素に入れる値は、textContent と、決めた属性（a の href・target・rel・title、input の type・disabled・checked、表のセルの寄せのクラス、コードの言語の data 属性）だけ。
			"""
		acceptance: [
			"XSS の表（`<script>`、`<img src=x onerror>`、`<a href=javascript:>`、`[x](javascript:alert(1))`、`[x](JaVaScRiPt:...)`、`[x]( javascript:...)`、`[x](java\\u0000script:)`、`[x](data:text/html,...)`、`[x](vbscript:...)`、`![x](javascript:...)`、`<javascript:alert(1)>`、`[x](https://a\" onmouseover=\"x)`、`[x](https://a) onerror=`、コードの塊の言語 `js\" onload=\"x` など）で、script・img・iframe などの要素ができず、a の href が http・https のほか（と、属性の差し込み）にならず、元の文字が textContent に残る（単体のテスト。偽の document は innerHTML などと on・style の属性で失敗する）",
		]
	}
	"R-03": {
		title: "壊れた・大きい・深い Markdown でも落ちず、重くならない"
		text: """
			閉じていない強調・コード・柵・リンク、表の列の数の違い、空の本文、切った本文（truncated）、深い入れ子（箇条書きと引用は合わせて 8 段まで。より深い分は文字として描く）でも、例外を出さずに描く。
			解く関数は、入力の長さにほぼ比例する時間で終わる（決めた病的な入力：同じ記号の長い並び、閉じない `[` や `` ` `` の長い並び、深い `>` の並びで、100,000 字を 1 秒より短く解く）。
			万一、解くか描くかで例外が出たら、その行は今のとおり本文を文字で描く（ほかの行は描き続ける）。
			"""
		acceptance: [
			"壊れた Markdown の表（閉じない `**`、`` ` ``、`` ``` ``、`[`、`](`、列の数の違う表、空、`\\` で終わる、深い入れ子）で例外を出さず、元の文字が欠けずに描かれる（単体のテスト）",
			"病的な入力 100,000 字を、それぞれ 1 秒より短く解く（単体のテスト）",
			"解く関数が例外を出すようにした偽の部品で、その行が文字で描かれる（単体のテスト）",
		]
	}
	"R-04": {
		title: "長い会話でも、同じ行の Markdown を解き直し・描き直さない"
		text: """
			会話が変わって小窓が描き直すとき、key と本文が前と同じ assistant の行は、前に描いた本文の要素をそのまま使い、解き直さない。本文が変わった行（置き換え）だけ解き直す。会話から消えた行の写しは捨てる（覚えておく数は、今の会話の行の数までに限る）。
			"""
		acceptance: [
			"同じ key と本文の行を2回描くと、解く関数の呼び出しが1回で、2回目は同じ要素が使われる。本文が変わると解き直す。消えた行の写しは次の描き直しで捨てられる（単体のテスト）",
		]
	}
	"R-05": {
		title: "狭い枠（SpecDock の欄、390px）と明暗で読め、コードと表は枠の中で横に動き、選んでコピーできる"
		text: """
			見出し・段落・箇条書き・引用・表・コードの字の大きさと余白は、小窓の本文と釣り合い（見出しは本文より少し大きい程度）、幅 390px で文書が横にはみ出さない。横に長いコードの行と広い表は、その塊の中だけで横に動く（overflow-x: auto）。長い URL や語は折り返す。
			色は agent.css の変数（`--chat-*`、`--ds-*`）を使い、明暗の両方（prefers-color-scheme と ?theme=）で読める。
			コードの塊は、普通の文字として選んでコピーできる（選べなくする規則を付けない）。
			"""
		acceptance: [
			"偽の会話（見出し・表・長いコード・入れ子の箇条書き・チェック・引用・リンク・横線を含む発言）を与えた一時の orca-web とヘッドレスの Chrome で、幅 1280px と 390px、明暗の4通りで、文書が横にはみ出さず、pre と表の枠だけが横に動き（scrollWidth > clientWidth のとき、その枠の overflow-x が auto）、写しを Scope の artifacts に残す",
			"agent.css の Markdown の規則が `var(--chat-…)` か `var(--ds-…, 既定)` の色を使い、pre と表の枠に overflow-x: auto があり、user-select: none がない（CSS を読むテスト）",
			"試しのエージェントに、見出し・表・コード・箇条書き・リンクを含む返事を書かせ、小窓（1280 と 390、明暗）で写しを撮る（タスク担当。業務の会話は写さない）",
		]
	}
}

failures: {
	"F-01": {
		title: "解くか描くかで例外が出たときは、その行だけ本文を文字で描き、小窓は描き続ける"
	}
	"F-02": {
		title: "リンクの URL が http・https と決められないときは、リンクにせず元の Markdown の文字で描く"
	}
	"F-03": {
		title: "決めた範囲のほかの構文（参照式のリンク、HTML、脚注など）は、解かずに文字で描く（欠けさせない）"
	}
}

constraints: [
	"実行時の依存を足さない（package.json の dependencies は空のまま）。素の ES Modules で、ビルドしない",
	"innerHTML・outerHTML・insertAdjacentHTML・document.write・DOMParser・on で始まる属性・style の属性を使わない（agent-dom.js の今の守り）",
	"`/embed/agent` の中のリンクは agent-dom.js の newTabLink だけで作る（AGENTS.md の決まり）",
	"会話の API とサーバーの振る舞いを変えない（STATIC_FILES に新しいファイルを載せるほか）",
	"本人の環境に特化した決まりを入れない。普遍的でシンプルな仕組みにする（本人の方針）",
]

decisions: [
	"描くのはエージェント側（role assistant の bubble）だけ。本人の発言は今のまま文字（統括の決定、2026-11-18）",
	"質問・承認のカードの中の文は Markdown にしない（タスク担当の判断、2026-11-18。統括は描いてよいとした）：選択肢のラベルと説明はボタンの中にあり、塊の要素（段落・表・コード）を入れられない。問いと要約は短い1文が多く、カードの見た目と押せる形（44px）を崩す危険の方が大きい。今の決まった見た目と守りを変えない方が安全で小さい",
	"段落の中の1つの改行は改行として描く（タスク担当の判断。GitHub の Issue のコメントと同じく、チャットで書いたとおりに読める）",
	"HTML の実体参照（`&amp;` など）は解読せず文字のまま（タスク担当の判断。生の HTML を文字で出す守りと同じ考えで、エージェントの発言ではまれ）",
	"チェックの印は、押せない（disabled）`input type=checkbox` で描く（タスク担当の判断。読み上げで状態が分かる）",
	"Markdown の中のリンクの文字は、行内の構文を落とした文字だけで描く（newTabLink が文字だけを受けるため。タスク担当の判断）",
	"依存を足さない（統括の決定）。自前の部品は、決めた範囲だけを、行ごとの単純な解き方で実装する",
]

questions: []
