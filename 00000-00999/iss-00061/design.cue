package spec

// 設計（Issue）。型 specdock/v1。

goals: [
	"Markdown を、物と配列だけの決めた形の木に解く純な関数と、木を DOM の要素にする関数に分け、解き方はテストで、守り（HTML を解かない、決めた属性だけ）は描く側の1か所で確かめる",
	"小窓の assistant の bubble だけをその部品で描き、ほかの行と、質問・承認のカードは変えない",
	"同じ行は描いた要素をそのまま使い、長い会話でも解き直さない",
]

current: """
	`agent-dom.js` の renderChatRow は bubble を `make(doc, 'div', row.text, 'bubble')` で描く。`agent-frame.js` の renderChat は会話が変わるたびに全部の行を描き直す。CSS は `li.row > .bubble { white-space: pre-wrap }`。
	"""

target: """
	`web/embed/markdown.js`（解く。純な関数）と `web/embed/markdown-dom.js`（描く）を足す。renderChatRow は assistant の bubble を `div.bubble.md` にし、中身を options.markdown（agent-frame.js の写しの口）か、なければ直接の解き・描きで作る。例外のときは今の文字の bubble。agent.css に `.md` の規則を足す。
	"""

design: {
	"D-01": {
		title: "Markdown を木に解く純な関数（`web/embed/markdown.js`、新）"
		text: """
			`export function parseMarkdown(text: string): Block[]`。DOM に触らない。入力が文字でなければ `[]`。改行は `\\r\\n` と `\\r` を `\\n` にしてから、行ごとに解く。正規表現は行の頭の短い形の判定にだけ使い、入れ子の量指定子で後戻りする形を使わない。

			塊（Block）。どれも物と配列と文字・数・真偽・null だけ：
			- `{type: 'heading', level: 1..6, children: Inline[]}`：行頭の空白 0〜3、`#` 1〜6個、空白か行の終わり。閉じの `#` の並びは、空白の後に置かれ、その後に空白のほかがないときだけ落とす（`## C#` は `C#` のまま、`## 題 ##` は `題`、`### ###` は空の見出し）。末尾の空白を落とす。
			- `{type: 'paragraph', children: Inline[]}`：続いた行。空行、ほかの塊の始まり（見出し、柵、横線、引用、箇条書きの始まり、表）で終わる。
			- `{type: 'code', lang: string | null, text: string}`：行頭の空白 0〜3 の `` ``` `` か `~~~`（3つ以上）。lang は柵の後の最初の語（空白まで。60字で切る。なければ null）。本文は閉じの柵（同じ字で同じ数以上）まで。閉じがなければ入力の終わり（または入れ物の終わり）まで。開きの字下げ分の空白を各行の頭から落とす。
			- `{type: 'list', ordered: boolean, start: number | null, items: Item[]}`、`Item = {checked: boolean | null, children: Block[]}`：`-` `*` `+` か、1〜9桁の数と `.` `)` の後に空白。項目の中身は、印の後の幅だけ字下げした続きの行（空行をはさんでもよい）で、中身を再帰で解く（入れ子）。項目の最初が `[ ]`・`[x]`・`[X]` と空白なら checked を決めてその印を落とす。ordered のとき start は最初の数（9桁まで）、ほかは null。違う印の種類（`-` と `1.`）に変わったら別の list。
			- `{type: 'quote', children: Block[]}`：行頭の空白 0〜3 の `>`（後の空白1つを落とす）の続いた行。中身を再帰で解く。印のない続きの段落の行（lazy）は、引用の中の段落が開いているときだけ続きとする。
			- `{type: 'table', align: ('left' | 'center' | 'right' | null)[], head: Inline[][], rows: Inline[][][]}`：見出しの行（`|` を含む）の次の行が区切りの行（セルがどれも `:?-+:?`）で、見出しのセルの数と区切りのセルの数が同じとき。頭と尾の `|` は落とし、`\\|` はセルを分けない。本文の行は、空行か `|` を含まない行で終わる。本文の行のセルの数は見出しに合わせる（足りなければ空、多ければ落とす）。
			- `{type: 'hr'}`：行頭の空白 0〜3 で、`-` `*` `_` の同じ字が3つ以上（間の空白はよい）だけの行。段落の直後の `---` も横線とする（Setext の見出しは扱わない）。
			入れ子の深さ（list と quote を合わせた段）が 8 を超えたら、それより深い中身は解かずに paragraph の text として扱う。

			行内（Inline）：
			- `{type: 'text', text}`、`{type: 'break'}`（段落の中の改行。行末の2つ以上の空白と `\\` の改行も同じ）
			- `{type: 'strong', children}`、`{type: 'em', children}`、`{type: 'del', children}`：開きの記号（`**` `__` `*` `_` `~~`）の直後が空白でなく、閉じの記号の直前が空白でないものを、左から近い閉じと組む。`_` と `__` は、語の中では強調にしない：開きは直前が英数字のとき開きにせず、閉じは直後が英数字のとき閉じにしない（`_foo_`・`__bold__`・`(_a_)` は強調、`snake_case_name` は文字）。閉じが見つからない開きは文字。入れ子の深さは 8 まで（超えたら文字）。
			- `{type: 'code', text}`：同じ数の `` ` `` の並びで閉じる。中身の頭と尾の空白1つずつを、両方あり中身が空白だけでないとき落とす。中身では逃がしも強調も解かない。閉じがなければ開きの `` ` `` は文字。
			- `{type: 'link', href: string, children: Inline[]}`：`[文字](url)`、`[文字](url "題")`（題は捨てる）、`<url>`、素の URL。`![alt](url)` は `{type: 'link', href, children: [{type:'text', text: alt か alt が空なら url}], image: true}`。
			  url は `<...>` で囲んでよい。括弧は釣り合いを数える（深さ 8 まで）。safeHref（下）が null なら、リンクにせず、元の Markdown の文字（`[文字](url)` の全体）を text にする。
			  素の URL：語の境（行頭か、空白・`(`・`*`・`_`・`~` の後）で `http://` か `https://` が始まり、空白か `<` までを取る。尾の `.` `,` `:` `;` `!` `?` `'` `"` `*` `_` `~` と、釣り合わない `)` を落とす。
			- 逃がし：`\\` の後が ASCII の記号なら、その記号を文字にする。
			- 生の HTML は解かない（`<` はそのまま文字）。`<url>` の自動のリンクだけを見る（中に空白と `<` `>` がなく、safeHref が通るもの）。

			`export function safeHref(raw: string): string | null`：raw に ASCII の制御文字（0x00〜0x1f、0x7f）か空白があれば null。`new URL(raw)` で解け（例外なら null）、`protocol` が `http:` か `https:` のときだけ、`URL#href`（正規化した値）を返す。相対の URL（基準なしで解けないもの）は null。
			長さの守り：1つの段落の行内の解きは、記号ごとに閉じを探す走査の数を、決めた上限（その段落の長さの定数倍）までにし、超えたら残りを文字にする（病的な入力で時間が延びない）。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-02", "F-03"]
	}
	"D-02": {
		title: "木を DOM の要素にする関数（`web/embed/markdown-dom.js`、新）"
		text: """
			`export function renderMarkdown(doc, blocks: Block[], { link }: { link: (doc, text: string, href: string) => Element }): Element`。根は `div`（クラスは呼び手が付ける）。
			要素の対応：heading は `h1`〜`h6`（クラス `md-h`）、paragraph は `p`、code は `div.md-code`（言語があれば上に `div.md-code-lang` の文字と `data-lang` 属性）の中の `pre > code`（textContent に本文）、list は `ul` か `ol`（start が 1 でない数なら `start` の属性）と `li`（checked が真偽なら頭に `input`（type checkbox、disabled 真、checked）と、`li` にクラス `md-task`）、quote は `blockquote`、table は `div.md-table > table > thead > tr > th`・`tbody > tr > td`（寄せはクラス `md-left`・`md-center`・`md-right`）、hr は `hr`。
			行内：text は文字の節（`doc.createTextNode` があればそれ、なければ `span` の textContent）、break は `br`、strong・em・del・code はそれぞれ `strong`・`em`・`del`・`code`。link は `link(doc, 文字, href)`（文字は children の text と code の文字をつないだもの。image なら頭に「画像：」を付ける）。
			守り：使う口は `doc.createElement`、`doc.createTextNode`、`textContent`、`append`、`className`、`dataset`、`setAttribute`（`start`、`type` のためだけ）と input の `disabled`・`checked` のプロパティだけ。href は D-01 の safeHref を通った値だけが木にあるが、描く側でももう一度 safeHref を通し、null ならリンクにせず文字で描く（二重の守り）。木の知らない type は、その中の文字を集めて文字の節で描く（落とさない）。
			"""
		satisfies: ["R-01", "R-02", "F-02", "F-03"]
	}
	"D-03": {
		title: "小窓の会話の assistant の bubble を Markdown で描く（`web/embed/agent-dom.js`）"
		text: """
			`export function renderMarkdownBody(doc, text: string): Element`：`parseMarkdown` と `renderMarkdown(doc, blocks, {link: newTabLink})` で `div.bubble.md` を作る。どちらかが例外を出したら、今と同じ `make(doc, 'div', text, 'bubble')` を返す（F-01）。テストで例外を起こせるように、第3引数で `{ parse, render }` を差し替えられる（既定は本物）。
			renderChatRow：row.kind が bubble で role が assistant のとき、本文を `options.markdown ? options.markdown(row) : renderMarkdownBody(doc, row.text)` にする。user の bubble、notice、unsupported は今の `make(doc, 'div', row.text, …)` のまま。truncated の注記と時刻は今のまま。
			newTabLink は今のまま（Markdown のリンクにも同じ印と title が付く）。
			"""
		satisfies: ["R-01", "R-02", "R-03", "F-01"]
	}
	"D-04": {
		title: "描いた本文の写し（`web/embed/agent-dom.js` の `createMarkdownCache` と `web/embed/agent-frame.js`）"
		text: """
			`export function createMarkdownCache(doc, render = renderMarkdownBody)`：`{ body(row): Element, prune(keys: Set<string>): void }`。body は row.key の写しがあり本文が同じならその要素を返し、なければ render で作って覚える。prune は keys にない写しを捨てる。
			`agent-frame.js`：1つの写しを持ち、rowOptions に `markdown: (row) => cache.body(row)` を渡す。renderChat で buildChat の後に `cache.prune(new Set(rows.map((row) => row.key)))` を呼ぶ。renderChat は今のとおり `els.log.replaceChildren()` の後に行を作るが、assistant の本文の要素は写しのものを新しい li に移す（同じ要素を2つの場所に置かない。描き直しのたびに li は作り直すので、前の li からは外れる）。
			会話を切り替える（ほかのエージェントへは移らない決まりなので、同じ小窓では1つの会話）・読めなくなるときも、prune が今の行だけを残すので、覚える数は今の会話の行の数まで。
			"""
		satisfies: ["R-04"]
	}
	"D-05": {
		title: "見た目（`web/embed/agent.css`）"
		text: """
			`li.row > .bubble.md`：`white-space: normal`、`overflow-wrap: anywhere`、`min-width: 0`（今の吹き出しの線・背景・余白・max-width 92% はそのまま）。子の先頭の margin-top と末尾の margin-bottom を 0。
			`.md p`・`ul`・`ol`・`blockquote`・`.md-code`・`.md-table`・`hr` の上下の余白は 0.5em 程度。`.md-h` は本文より少し大きい程度（h1 1.2em、h2 1.12em、h3 1.05em、h4〜h6 1em、太字）。`ul`・`ol` の左の字下げは 1.4em 程度（入れ子で狭い枠からはみ出しにくい）。`li.md-task` は印を付けず（list-style none）、input の右に小さな間。
			`blockquote`：左の線（`var(--chat-border-strong)`）、文字は `var(--chat-muted)`。
			`.md-code`：線 `var(--chat-border)`、背景 `var(--chat-bg)`、角丸、`pre` は `overflow-x: auto`、`white-space: pre`、等幅、少し小さい字。`.md-code-lang` は小さい `var(--chat-muted)` の字。行内の `code` は背景 `var(--chat-bg)`、線、小さい角丸、`overflow-wrap: anywhere`。
			`.md-table`：`overflow-x: auto`、`max-width: 100%`。`table` は `border-collapse: collapse`、`th`・`td` は線 `var(--chat-border)`、余白 4px 8px、`white-space: nowrap` にしない（狭いときは折り返し、それでも広ければ枠が横に動く）。`.md-left`・`.md-center`・`.md-right` は text-align。
			`hr`：線 `var(--chat-border)`。リンクは今の `a.newtab` の規則のまま。
			色は今の `--chat-*` の変数だけを使い、明暗は今の変数の切り替えに従う（新しい色の値を足さない）。user-select を変えない。
			"""
		satisfies: ["R-05"]
	}
	"D-06": {
		title: "配る口（`src/server/app.ts` の STATIC_FILES）と文書"
		text: """
			STATIC_FILES に `/embed/markdown.js`（`embed/markdown.js`）と `/embed/markdown-dom.js`（`embed/markdown-dom.js`）を `text/javascript; charset=utf-8` で足す（今の embed の js と同じ守りの頭。CORS は付けない）。
			README.md と AGENTS.md に、小窓の assistant の発言を Markdown で描くこと、部品の場所（markdown.js は純な関数、markdown-dom.js は textContent と決めた属性だけ）、生の HTML と http・https のほかの URL は文字で出ること、範囲外の構文を書く。
			"""
		satisfies: ["R-01", "R-02"]
	}
}

compatibility: """
	会話の API、送信、カードは変えない。user の発言と、ほかの行の描き方は今のまま。assistant の bubble の textContent は、Markdown の記号を落とした文字になる（今の bubble の文字を比べるテストは、assistant の行で記号を含まないものは通る。含むものは期待値を直す）。
	"""

risks: [
	"自前の解き方は CommonMark と細部が違う（参照式のリンク、Setext の見出し、字下げのコード、実体参照、lazy の続きの細部）。範囲外は文字で出るので欠けないが、ほかの描き方と見え方が違うことがある",
	"newTabLink の印（外へ開く印）が本文の中のリンクごとに付き、リンクの多い発言では少しにぎやかになる",
	"描き直しのたびに li を作り直す今の方式のまま、本文の要素だけを使い回すので、描き直しの間に本文の中で選んでいた範囲は今と同じく外れることがある",
]
