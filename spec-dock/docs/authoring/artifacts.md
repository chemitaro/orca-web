# Artifact Guide

Artifact は調査、対話、検討の evidence を残すための文書です。Artifact が存在することや type を選ぶことだけでは、内容は採用されません。

## Current creation catalog

新規作成に使う type は次の六つだけです。

| Type | 使う場面 | durable な反映先 |
|---|---|---|
| `blank` | 自由形式の evidence、メモ、図、リンクを残す | 必要な内容を Requirement / Design / Plan または accepted ADR に再記述する |
| `research` | 一つの source-grounded investigation を行う | 確認した facts / constraints を適切な正本へ再記述する |
| `interview` | 明示的な質問と回答を記録する | 採用する回答を Requirement / Design / Plan または accepted ADR に再記述する |
| `disc` | 複数の evidence を統合し、選択肢と trade-off を整理する | durable な結論を正本へ再記述する |
| `decision-candidate` | 未採用の decision option を比較する | 明示的な判断後に正本へ再記述する |
| `adr` | architecture decision candidate / record を残す | 明示的に accepted となった ADR だけが durable authority になり得る |

`research` は一つの source を根拠にした調査です。複数の source や回答を統合して結論と trade-off を扱うときは `disc` を使います。

`decision-candidate` は未採用の選択肢です。判断を固定する必要がある場合は、明示的な判断を Requirement / Design / Plan に反映するか、ADR を使います。ADR も作成直後は `authority: draft`、`mirror_eligible: false` であり、明示的に `accepted` となるまで authority ではありません。

## Stored Artifact validation

Current creation catalogは`artifact create --scope TARGET --type TYPE --title TITLE`で選べるtypeを閉じるための契約です。一方、保存済みArtifactのvalidationはopen-worldです。有効なlowercase UTC timestamp、任意の`01..99` suffix、安全なnon-empty basenameを持つMarkdownは、既知typeに一致しなくてもuntyped evidenceとして受理します。`analysis`、`report`、`review`などのtype風ラベルや未知ラベルだけを理由にmalformedにはしません。

untyped Artifactは後方互換のためruntime内部で`blank`と表現されますが、creation templateとしての`blank`とは別物です。known typed filenameはuntypedより先に認識され、ADR mirrorは明示的な`adr` filenameと必要なfrontmatter・eligibility条件を満たすものだけを対象にします。filenameがvalidであることやtype風ラベルを含むことは、内容の採用、review完了、canonical authorityを意味しません。

`artifact import file`は`<ts>--<normalized-basename>`形式で任意拡張子とsource bytesをopaque evidenceとして保持します。generic importのfilenameや本文からtype、authority、採用状態を推測しません。

## Authority flow

```text
Artifact evidence
  -> 人間または agent による synthesis / review
    -> Requirement / Design / Plan または accepted ADR
      -> implementation
        -> thin Report result summary
```

Artifact、外部 ZIP、delegated draft、ChatGPT output、Report は evidence です。これらは自動で durable authority に昇格せず、Report は durable decision store でもありません。採用する内容は上の正本へ明示的に再記述します。

## Historical retention

既存の template や artifact は互換性と証跡のため物理的に保持されることがあります。`analysis`、`draft-*`（`draft-requirement`、`draft-design`、`draft-plan` など）、`repair`、`pr-repair`、`profile` は Current creation route ではありません。template や ADR の初期状態としての `draft` は、これらHistorical routeとは別です。この Guide はそれらの削除、rename、rewrite を指示しません。
