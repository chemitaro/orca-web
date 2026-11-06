# CUE Authoring Guide

SpecDock 0.4.0 から、新しく作る Initiative、Epic、Issue の要件・設計・計画は、CUE で書きます。このガイドは、CUE の Scope を書き、検査し、作業しながら計画を更新するための1本の手引きです。型は SpecDock が配り（型の版 `specdock/v1`）、検査は `spec-dock scope check` が行います。人向けの説明は [Explanation Guide](explanation.md) の `explanation.html` に書きます。

CUE の Scope は、canonical モード（`spec-dock/workspace.json` の `schema_version` が 4）のリポジトリのものです。SpecDock 0.5.0 は版4のリポジトリだけを扱います（版3のリポジトリでは、どのコマンドも `CANONICAL_NOT_MIGRATED` で止まります）。

既存の Markdown の Scope（`requirement.md`、`design.md`、`plan.md`）は、そのまま残り、今までどおり動きます。Markdown の Scope の書き方は [Authoring Kit 概要](overview.md) からたどります。

## CUE の Scope とは

- `scope create` と `scope import github` は、Scope の直下に `requirement.cue`、`design.cue`、`plan.cue`、`explanation.html`、`report.md` の5つを雛形から置きます。雛形は `spec-dock/templates/cue/<種類>/` にあります。
- SpecDock は、`requirement.cue` があれば CUE の Scope、なければ Markdown の Scope と見分けます。`requirement.md` と `requirement.cue` の両方があると、正本を決められないので `SCOPE_FORMAT_CONFLICT` で止まります。片方を外します。
- 正本は3つの CUE のファイルです。`report.md` と ADR は Markdown のままです。Lean や PlantUML などのファイルは、任意で `artifacts/` に置きます。

## 評価の単位

SpecDock は、1つの Scope の3つのファイルを、配る型と一緒に、1つの CUE の評価にまとめます。

```text
cue export --out json -t kind=<initiative|epic|issue> \
  <パッケージ>/cue/<型の版>/*.cue      # SpecDock が配る型
  <リポジトリ>/spec-dock/cue/*.cue      # リポジトリが足す型（任意）
  <Scope>/requirement.cue <Scope>/design.cue <Scope>/plan.cue
```

- 3つのファイルは、どれも1行目を `package spec` にします。型は SpecDock が足すので、`import` を書きません。
- Scope の種類は、GitHub の種類のラベルから、タグ `-t kind=` で渡されます。種類を CUE に書きません。
- 型の版は `requirement.cue` の `schema`（今は `"specdock/v1"`）で決まります。雛形が書くので消しません。SpecDock が持っていない版を書くと `CUE_SCHEMA_UNSUPPORTED` で止まります。
- 型は、項目を足しても壊れないように開いています。型にない項目を、必要に応じて足してかまいません。ただし、番号の項目（`requirements` など）のキーは、決まった形の番号だけです。

## 保証レベル

保証レベル（Assurance Level、項目 `assurance`）は、その Scope で何をどれだけ確かめるかを決めます。値で、型の必須の項目と、つながりの規則が変わります。

```cue
assurance: {
	level:  "standard"   // light、standard、strict、critical のどれか
	reason: "公開の CLI の動きを変えるが、PR を戻せば元に戻る"
}
```

- **選び方**：失敗したときの影響と、回復の難しさで選びます。工数、作業の難しさ、優先度、ラベルだけでは選びません。目安は、局所的ですぐ戻せるなら `light`、普通の機能や修正なら `standard`、公開の契約、移行、互換性に関わり戻しにくいなら `strict`、安全・個人情報や、戻せない変更で、事故への対応が要るなら `critical` です。
- **作るときに必須**：`scope create` と `scope import github` には、`--assurance <値>` と、空白だけでない `--assurance-reason <理由>` が要ります。既定の値はありません。指定は `requirement.cue` の `assurance` に書かれます。
- **一段上で決める**：Issue のレベルは、Epic の計画で Issue に切り分けるときに決め、Epic のレベルは Initiative の計画で決めます。Initiative は作るときに決めます。親の計画（`slices`）には子の ID だけを書き、子のレベルは書きません。
- **正本は1か所**：`requirement.cue` の `assurance` だけが正本です。GitHub のラベル、親の計画、`design.cue`、`plan.cue` には写しません。
- **途中で変えてよい**：具体化や作業の途中で、上げても下げてもかまいません。`level` と `reason` を書き換えるだけです。専用のコマンドや承認はありません。下げると求める項目が減り、上げると、そのレベルで必須の項目が足りなければ検査が誤りを示します。変えた記録は、カタログの版の履歴に残ります。
- **読む**：`spec-dock scope show <ID> --json` の `data.result.assurance` が、`level`、`reason`、`source` を返します。`source` は `cue`（読めた）、`unset`（Markdown の Scope）、`unreadable`（文法の誤りなどで読めない。`problem` に理由）のどれかです。インターネットは要りません。
- SpecDock は、保証レベルから、エージェントのモデルや推論を選ぶ表を持ちません。それは利用者のワークフローの側で決めます。
- Markdown の Scope の Planning Level（`plan.md` の `## Planning Level`）は、CUE の Scope では、この保証レベルになりました。過去の「Assurance」（`.assurance.json`、旧 Profile）とは別のものです（[Historical authoring](historical.md)）。

## 文書と項目

番号の項目は、番号をキーにした構造で書きます。同じ番号は1つにまとまり、食い違えば CUE の誤りになります。番号は、ほかの項目から文字列で指します。

| ファイル | 項目 | 番号の形 | 必須の中身 |
|---|---|---|---|
| `requirement.cue` | `schema`、`assurance` | ― | `schema`、`assurance.level`、`assurance.reason` |
| `requirement.cue` | `requirements` | `R-01`、`R-02`、… | `title` |
| `requirement.cue` | `failures`（失敗・境界の条件） | `F-01`、… | `title` |
| `design.cue` | `design`（責務、interface、data などの単位） | `D-01`、… | `title`、`satisfies`（満たす要件・失敗の条件の番号） |
| `plan.cue`（Issue） | `steps`（実装の手順） | `S-01`、… | `title`、`realizes`（満たす要件・失敗の条件の番号） |
| `plan.cue`（Issue） | `tests` | `T-01`、… | `title`、`verifies`（確かめる要件・失敗の条件の番号） |
| `plan.cue`（Epic、Initiative） | `slices`（子の Scope への切り分け） | 子の ID（`iss-00123`、`epic-00045`） | `covers`（子に任せる要件・失敗の条件の番号） |
| `plan.cue` | `execution`（任意） | セッションとレビューの名前 | ― |

- 番号は、頭の文字と、2桁以上の数字です（`R-01`、`R-100`）。
- 任意の項目：`requirement.cue` の `purpose`、`background`、`includes`、`excludes`、`constraints`、`decisions`、`questions`。各要件の `text`、`acceptance`。各失敗の条件の `text`、`impact`、`recovery`。`design.cue` の `goals`、`current`、`target`、`compatibility`、`risks`。`plan.cue` の `goal`、`verification`、`rollback`、`exit`。手順の `text`、`status`、`after`、`session`。
- 題名（`title`）は1行の、空白だけでない文字列です。文章の項目は、空白だけでない文字列で、Markdown を書いてよく、描画で Markdown として描かれます。
- Issue の `plan.cue` に `slices`、Epic と Initiative の `plan.cue` に `steps` や `tests` を書くと、直し方を示す誤りになります。

保証レベルで必須になる項目：

| 項目 | light | standard | strict | critical |
|---|---|---|---|---|
| 各要件の `acceptance`（1つ以上） | 任意 | 必須 | 必須 | 必須 |
| 各失敗の条件の `impact`、`recovery` | 任意 | 任意 | 必須 | 必須 |
| `plan.cue` の `rollback`（手順か切り分けが1つ以上あるとき） | 任意 | 任意 | 任意 | 必須（規則 `rollback-missing`） |

## つながりの規則

形の誤り（必須の項目がない、値の形が違う）は CUE の評価の誤り（`CUE_INVALID`）になります。番号のつながりの抜けは、規則ごとの指摘（`SPEC_FINDINGS`）になります。どちらも、直す項目やファイルを名指す日本語の `hint` を持ちます（`CUE_INVALID` の `cue_message` は `cue` の原文のままです）。既定値のある項目（手順の `status` など）に許されない値を書くと、許す値を示す1件の `CUE_INVALID` になり、既定値との衝突の行（`conflicting values`）は、その `details.cue_related` に残ります。

| 規則 | 内容 | 出る段階 |
|---|---|---|
| `unknown-reference` | 存在しない番号への参照（`satisfies`、`realizes`、`verifies`、`covers`、`after`） | light から |
| `requirement-without-step` | 要件を満たす手順がない | light から |
| `requirement-without-design` | 要件を満たす設計がない | standard から |
| `requirement-without-test` | 要件を確かめるテストがない | standard から |
| `orphan-step` | どの要件・失敗の条件にも結び付かない手順 | strict から |
| `failure-without-test` | 失敗の条件を確かめるテストがない | strict から |
| `rollback-missing` | 戻し方（`rollback`）がない（手順か切り分けがあるときだけ） | critical |
| `execution-reference` | 手順が存在しないセッションを指す、レビューが存在しない手順を指す | どの段階でも（`execution` か手順の `session` を書いたときだけ） |

- 規則の「要件」は `requirements`（`R-` の番号）だけです。失敗の条件（`F-` の番号）は、`unknown-reference` の参照の先になるほかは、strict からの `failure-without-test` だけが調べます。standard 以下では、失敗の条件に設計や手順がなくても指摘になりません。
- `status` が `dropped` の手順は、要件を満たしたと数えません。参照の先は調べます。
- 形の誤りがある間は、評価が通らないので、つながりの指摘は出ません。形の誤りを直すと、指摘が初めて出ることがあります（保証レベルを上げた直後は、たいてい2回に分かれます）。
- 規則は、つながりの抜けだけを見ます。要件が1つもない文書も、誤りなしで通ります。雛形のままで検査に通っても、書き終えたことにはなりません。
- **Epic と Initiative**：手順とテストの代わりに `slices` を持ちます。`requirement-without-step`、`requirement-without-test`、`failure-without-test` は、その番号を `covers` に含む切り分けがあれば満たします。`orphan-step` は、`covers` が空の切り分けに当てはまります。`requirement-without-design` は Issue と同じです。
- 切り分けのキーが GitHub の本当の子かは、型では調べません。

## 計画の台帳

`plan.cue` の手順は、作業の台帳です。エージェントが、作業しながら `plan.cue` を直接書き換えて、手順の追加、変更、状態の更新を行います。専用のコマンドはありません。

- `status`：`todo`（既定）、`doing`、`done`、`dropped`。始めたら `doing`、終えたら `done`、やめたら消さずに `dropped` にします。
- `after`：先に済ませる手順の番号です。並びは番号の順です。
- 作業中に新しい要件や失敗の条件が見つかったら、手順だけでなく `requirement.cue` に番号を足し、それを満たす設計、手順、テストを足します（保証レベルが求めるつながりを検査が示します）。
- `dropped` にした理由は、その手順の `text` に書きます。専用の項目はありません。
- 計画を書き換えても、説明資料は自動では変わりません。人に伝えるべき変更なら、説明資料も直します。
- 書き換えたら `spec-dock scope check <ID>` で確かめます。ダッシュボードは、この構造から進み具合を描きます。
- Epic と Initiative の `slices` も、`after` と `session` を持てます。子の進み具合は、子の Scope の `plan.cue` と GitHub の状態で見ます。

## 実行の割り当て

`plan.cue` には、任意で、作業のセッションとレビューを書けます。

```cue
execution: {
	sessions: {
		spec: {task: "仕様化（起動した側が選んだ値の記録）", model: "<モデル>", effort: "<推論>", rationale: "<起動した側と根拠>"}
		impl: {task: "実装", model: "<モデル>", effort: "<推論>", rationale: "<選んだ根拠>"}
	}
	reviews: code: {role: "コードのレビュー", after: "S-02", model: "<モデル>", effort: "<推論>"}
}
steps: "S-01": {title: "...", realizes: ["R-01"], session: "impl"}
```

- 推論は手順ごとではなく、セッションごとに書きます。各手順の `session` は、実装のセッション（`impl`）を指します。仕様化のセッション（`spec`）は、手順が指さない記録です。
- セッションのモデルと推論は起動のときに決まるので、計画で選べるのは、計画の後に起動するセッション（実装担当）の値です。計画を書いたセッションの値は、事実として記録します。レビューの `after` は、どの手順（Epic と Initiative では切り分け）の後かを指します。
- SpecDock は、指す先があるか（規則 `execution-reference`）だけを調べます。モデルと推論の名前は、どんな文字列でもかまいません。

## リポジトリの型

リポジトリは、SpecDock の型を変えずに、自分の制約と規則を足せます。

- 置き場は `spec-dock/cue/*.cue`（既定のブランチに置くリポジトリの決まり）です。あれば、SpecDock がどの Scope の評価にも加えます。
- 1行目は `package spec` です。`_rank`（light=0 … critical=3）は読むだけにし、書き換えません。`_specdock` の下の名前は SpecDock の内部なので使いません。規則を足すときは、SpecDock の規則と重ならない名前にします。

```cue
package spec

// standard 以上の Issue では、計画に execution を求める（kind で絞らないと Epic と Initiative にも効く）
if kind == "issue" && _rank >= 1 {
	execution!: _
}
// 規則を足す
findings: "step-without-session": [for k, s in steps if s.session == _|_ {id: k, message: "\(k) に session がありません", hint: "plan.cue の steps.\"\(k)\".session を書く"}]
```

- リポジトリの型に誤りがあると、どの Scope の検査も、そのファイルの位置を示して止まります。

## 検査と表示

```sh
spec-dock scope check iss-00123          # 1つの Scope を検査する（何も書かない。インターネットは要らない）
spec-dock scope check iss-00123 --json   # 結果を JSON で
spec-dock scope show iss-00123 --json    # data.result.assurance に保証レベル
spec-dock scope render iss-00123 > /tmp/iss-00123.html   # 要件・設計・計画を HTML に描く（標準出力）
spec-dock scope render iss-00123 --design-system inline > page.html   # デザインシステムを埋め込む（別の PC でも崩れない）
```

- 全コマンドに共通の引数（`--json`、`--offline`、`--timeout <秒>`、`--project <チェックアウト>` など）は、葉の `--help`（例 `spec-dock scope check --help`）の一覧の「common options」に、その葉で使えるものだけが出ます（変えるコマンドの `--yes` など。[CLI 参照](../reference_cli.md)）。
- `scope check` は、Scope の種類を GitHub の構造（定期の同期が取るスナップショット）から読みます。CUE の評価は手元だけで行い、インターネットは要りません。GitHub に問い合わせられないときや、`--offline` のときは、保存したスナップショットを使い、警告 `GITHUB_SNAPSHOT_STALE` を出します。この警告は、スナップショットが新しいかで出たり出なかったりし、検査の結果（誤りと指摘）は変えません。テキストの要約の `warnings=N` は検査の警告（説明資料など）の数で、この警告は数えません。
- `scope check` は、`cue` の確かめ、`schema` の読み取り、評価、指摘の読み取り、説明資料の形の検査を行います。誤りがあれば終了コード7（`SCOPE_CHECK_FAILED`）で、誤りごとにファイル、行、項目、直し方を示します。警告だけなら成功です。Markdown の Scope では、検査をせずに成功します（「CUE の Scope ではない」）。
- `work finish` は、閉じる前（何かを書く前）に、閉じる Scope を同じく検査します。誤りがあれば何も書かずに止まります（終了コード3、`SCOPE_CHECK_FAILED`）。直して `spec-dock scope check <ID>` で確かめてから、もう一度 `spec-dock work finish <ID> --yes` を実行します。保存を待つ間に別のPCで開き直された場合は、終了コード6（partial）で止まります。Markdown の Scope は、今までどおり閉じます。
- `scope render` は、評価できないときは検査の結果だけを描き、警告 `SCOPE_RENDER_INCOMPLETE` を返します。Markdown の Scope は `SCOPE_NOT_CUE` で止まります。既定の HTML は、そのチェックアウトの `spec-dock/design-system/` を `file:` の道筋で読むので、手元で見る用です。別の PC に渡すときは `--design-system inline` を付けると、`ds.css`、`ds.js`、`marked` を HTML に埋め込みます（約 400KB。図の部品は今までどおり CDN から読みます）。デザインシステムがなければ `DESIGN_SYSTEM_MISSING` で止まります（終了コード3）。
- `workspace validate` と `workspace doctor` は、CUE の Scope には `requirement.cue`、`design.cue`、`plan.cue`、`report.md` を求めます。`cue` は呼びません。

`scope check` の結果のコード（`--json` の `data.result` の誤りと警告、`error.code`）：

| コード | 重さ | 意味と次の1手 |
|---|---|---|
| `CUE_INVALID` | 誤り | 形の誤り。`field` の項目を Scope の CUE のファイルで直す。`file` が SpecDock の型（`<spec_dock>/cue/v1/…`）を指すことがあるが、型は直さず、型が求める項目を Scope に書く |
| `SPEC_FINDINGS` | 誤り | つながりの指摘。`details.rule` の規則と `hint` のとおりに直す |
| `SPEC_NO_TESTS` | 警告 | light の Issue に、テストが1つもない（standard 以上では `requirement-without-test` が誤りとして示す）。確かめることがあれば `plan.cue` の `tests` に書く |
| `ASSURANCE_UNREADABLE` | 誤り | `requirement.cue` の `assurance` が読めない。`level` と `reason` を直す |
| `SCOPE_FORMAT_CONFLICT` | 誤り | `requirement.md` と `requirement.cue` の両方がある。片方を外す |
| `SCOPE_DOCUMENT_MISSING` | 誤り | 3つの CUE のファイルのどれかがない。足す |
| `EXPLANATION_MISSING` | Epic は誤り、ほかは警告 | `explanation.html` がない。雛形を写して書く（[Explanation Guide](explanation.md)） |
| `EXPLANATION_SKELETON` | Epic は誤り、ほかは警告 | 説明資料が雛形のまま。書き換えて、印の行を消す |
| `EXPLANATION_INVALID` | 誤り | 説明資料の形が壊れている。雛形の形に戻す |
| `CUE_SCHEMA_UNSUPPORTED` | 止まる（3） | `schema` の版を持つ SpecDock に上げる |
| `CUE_NOT_FOUND`、`CUE_VERSION_UNSUPPORTED` | 止まる（3） | `cue` v0.17.1 以上を PATH に入れる（下の「cue を入れる」） |
| `CUE_TIMEOUT`、`CUE_FAILED` | 止まる（5） | `--timeout` を延ばす。`cue version` が動くか確かめる |
| `SCOPE_CHECK_FAILED` | 止まる（7。`work finish` は3か6） | 上の誤りを直してから、もう一度実行する |

コマンドのほかのエラー（`ASSURANCE_REQUIRED`、`SCOPE_TEMPLATES_OUTDATED` など）は、[canonical モードの使い方](../canonical.md) の「エラーと次の1手」にあります。

## cue を入れる

- CUE の Scope を検査するには、`cue` v0.17.1 以上が PATH に要ります。ないか古いと、`scope check`、CUE の Scope の `work finish`、`scope render` は、入れ方を示して止まります。Markdown の Scope には要りません。
- 例：`go install cuelang.org/go/cmd/cue@v0.17.1`（Go 1.25 以上）。リリースの実行ファイルを使ってもかまいません。入れたら `cue version` で確かめます。
- `scope show` は `cue` がなくても動き、読めなければ `assurance.source` を `unreadable` にします。

## 書く順番

1. 親の計画を読み、任された要件（親の `slices` の `covers`）と保証レベルを確かめる。親が Markdown の Scope なら `slices` はないので、任された範囲は親の `plan.md`（とその Issue 本文）で確かめる。保証レベルは、作るときに決めて、子の `requirement.cue` の `assurance` が正本になる。
2. `spec-dock scope create issue --backend github --parent <Epic> --title <題名> --assurance <値> --assurance-reason <理由> --yes`（作る前に `spec-dock scope create issue --help` を読む）。
3. `requirement.cue` に要件と失敗の条件を書く。番号を振る。
4. `design.cue` に設計の単位を書き、`satisfies` で要件を指す。
5. `plan.cue` に手順とテストを書き、`realizes`、`verifies` で指す。
6. `spec-dock scope check <ID>` で、誤りと指摘がなくなるまで直す（要件を書かなくても通るので、通ったことだけで終えない）。
7. `explanation.html` を書き換え、印の行を消す（[Explanation Guide](explanation.md)）。
8. 作業しながら、手順の `status` を更新し、`scope check` で確かめる。
9. 終えるときは `spec-dock work finish <ID> --yes`。

## 見本（Issue、standard）

次の3つのファイルは、そのまま `scope check` に誤りも指摘もなく通ります（説明資料を書き換えた Issue で）。

```cue
// requirement.cue
package spec

schema: "specdock/v1"

assurance: {
	level:  "standard"
	reason: "新しいコマンドを足すが、既存のコマンドは変えず、PR を戻せば元に戻る"
}

purpose: "利用者が、設定を JSON に書き出せる"

requirements: {
	"R-01": {
		title: "設定を JSON に書き出せる"
		acceptance: ["書き出した JSON を、そのまま読み込める"]
	}
	"R-02": {
		title: "書き出す項目を選べる"
		acceptance: ["`--only` で選んだ項目だけが JSON に入る"]
	}
}

failures: {
	"F-01": {
		title: "書き出し先がすでにあるときは、何も書かずに止まる"
	}
}
```

```cue
// design.cue
package spec

design: {
	"D-01": {
		title:     "書き出しの部品"
		text:      "設定を読み、選んだ項目を JSON にする"
		satisfies: ["R-01", "R-02"]
	}
	"D-02": {
		title:     "書き出し先の確かめ"
		satisfies: ["F-01"]
	}
}
```

```cue
// plan.cue
package spec

steps: {
	"S-01": {title: "書き出しを作る", realizes: ["R-01"], status: "done", session: "impl"}
	"S-02": {title: "項目を選べるようにする", realizes: ["R-02"], status: "doing", after: ["S-01"], session: "impl"}
	"S-03": {title: "上書きを止める", realizes: ["F-01"], after: ["S-01"], session: "impl"}
}

tests: {
	"T-01": {title: "書き出して読み込める", verifies: ["R-01"]}
	"T-02": {title: "選んだ項目だけが入る", verifies: ["R-02"]}
	"T-03": {title: "既にあるときは止まる", verifies: ["F-01"]}
}

execution: sessions: {
	spec: {task: "仕様化（起動した側が選んだ値の記録）", model: "<モデル>", effort: "<推論>"}
	impl: {task: "実装", model: "<モデル>", effort: "<推論>"}
}
```
