# Explanation Guide

説明資料（`explanation.html`）は、CUE の Scope の要件・設計・計画を、人に説明する HTML です。中に Markdown を1本書けば、SpecDock が配るデザインシステムが資料として描きます。CUE の書き方は [CUE Authoring Guide](cue.md) にあります。

## 置き場と名前

- 各 Scope の直下の `explanation.html` の1つです。`scope create` と `scope import github` が、雛形から置きます。名前を変えません（ダッシュボードは、この名前で見分けます）。
- 雛形の元は `spec-dock/design-system/explanation-skeleton.html` です。消してしまったら、これを写して書き直します。

## 薄い形

説明資料は、デザインシステムを内蔵せず、共有のファイルを読む薄い HTML です。検査は、次の3つを確かめます。

1. `<script type="text/markdown" id="ds-source">` がちょうど1つあり、中の Markdown の先頭の前付け（`---` で囲む）に `title` がある。
2. `<link rel="stylesheet" href="../../../design-system/ds.css">` と `<script src="../../../design-system/ds.js"></script>` の2つの読み込みがある。
3. 書き換えた後は、雛形の印 `<!-- spec-dock:explanation-skeleton -->` が残っていない。

- 書き換えるのは `ds-source` の中の Markdown だけです。ほかの行は雛形のままにします。`<head>` の `<title>説明資料</title>` も残してかまいません。描くときに、前付けの `title` がページの題名になります。
- 印の行の次にある案内のコメント（「雛形から書き換えたら…」）は、印と一緒に消してかまいません。
- 相対の道筋 `../../../design-system/` は、`spec-dock/initiatives/<区切り>/<ID>/` からも、カタログ（`spec-dock/.canonical/<区切り>/<ID>/`）からも、`spec-dock/design-system/` に届きます。Scope のファイルにデザインシステムを写しません。
- 前付けには、`title` のほか、`lead`（1〜2文の要約）、`category`、`audience`、`status` を書けます。

## CUE との関係

- 正本は CUE の3つのファイルです。説明資料は、それを人に説明する側です。
- 人との議論が先に立つときは、説明資料が下書きとして先に進んでかまいません。CUE を書いた後は、CUE に合わせて説明資料を直します。
- 説明資料に書いた判断は、CUE（または ADR）に書き写すまで正本になりません。

## 書く内容

- SpecDock は形と仕組みだけを決め、内容は決めません。読み手（初めて読む人）に合わせ、背景、仕組み、失敗したときの動き、確かめ方のうち、伝えたい点を選びます。
- 抽象的な Initiative（バグ修正の集まりなど）や小さな Issue なら、短い説明でかまいません。Epic は、必ず雛形から書き換えます。
- 雛形の `:::summary` などの囲みは、デザインシステムの部品です。使わなくてもかまいません。

## 検査

`spec-dock scope check <ID>` と、CUE の Scope の `spec-dock work finish` が、CUE と一緒に説明資料の形を検査します。既定のブランチの CI では検査しません。

| コード | Epic | Initiative、Issue |
|---|---|---|
| `EXPLANATION_MISSING`（`explanation.html` がない） | 誤り | 警告 |
| `EXPLANATION_SKELETON`（印が残っていて、雛形のまま） | 誤り | 警告 |
| `EXPLANATION_INVALID`（上の1か2を満たさない、UTF-8 で読めない） | 誤り | 誤り |

警告は `work finish` を止めません。誤りは止めます。

## 図とコード

- 図は、コードの囲み ```` ```plantuml ```` に PlantUML を書きます。コードの囲みには言語の名前を書くと、色が付きます。
- 図の部品（`@plantuml/core`、highlight.js）は、ページの `<meta name="ds-vendor-base" content="<URL>">` が示す手元の場所を先に試し、なければ CDN から読みます。ファイルを単独で開いたときは CDN から読むので、インターネットがないと、本文は描けても図は描けません（図の位置に理由が出ます）。ダッシュボードのサーバーは、同梱の部品を手元から配ります。

## ブラウザーでの確かめ

- ブラウザーでの描画の確かめは、手元で任意に行います。ファイルを開き、本文、図、スマートフォンの幅（390px）で横にはみ出さないことを見ます。
- SpecDock の提供側のリポジトリには、ネットワークを止めて確かめる道具（`tests/browser/explanation-check.mjs`）があります。

## scope render との違い

`spec-dock scope render <ID>` は、CUE の3つのファイルから、要件・設計・計画のページをその場で描きます（何も書きません）。説明資料は人が書く説明で、描画のページは CUE をそのまま見せるものです。両方とも同じデザインシステムを使います。
