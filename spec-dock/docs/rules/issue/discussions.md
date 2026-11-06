# 議論ルール（discussions/rules.md）

このディレクトリは issue に紐づく legacy / historical discussion docs の preservation surface です。新規 working artifacts は対象 scope の `artifacts/` direct child に作成します。

- Artifact guidance: `spec-dock/docs/authoring/artifacts.md`
- Naming rules: `spec-dock/docs/reference_naming.md`
- Existing docs in this directory are timestamp-prefixed originals（標準: `<ts>-<kind>-<slug>.md` / same-second collision: `<ts>-<nn>-<kind>-<slug>.md`）。legacy sequential files は grandfathered で、自動 rename しません。
- Currentの新規作成catalogは`blank` / `research` / `interview` / `disc` / `decision-candidate` / `adr`だけです。新規working artifactは`artifacts/`直下へ保存します。
- Canonical `requirement.md` / `design.md` / `plan.md` / `report.md` はdurableな仕様・結果の正本です。legacy discussionやartifact draftはevidenceであり、採用した内容はRequirement、Design、Planまたはaccepted ADRへ明示的に再記述します。
- Canonical `report.md` は scope の実測記録です。legacy discussion-local report artifact は Current artifact catalog に含めません。
- Historical delegated-authoring manifest/Profile/probe/session artifacts は grandfathered evidence です。current delegated drafts が flat model を使うことだけを理由に削除、rename、validation failure 化しません。
- 実行場所: コマンドはリポジトリ root から実行してください。`./spec-dock/scripts/spec-dock ...` はその位置で保証される実行経路で、nested directory では相対 path が変わります。
- Historical discussion catalog（次のtypeは既存fileのvalidation用であり、このdirectoryへの新規作成routeではありません）:
  - `scratch`: raw capture。非 authoritative。未整理の発話、観察、思考、会話ログを置く。
  - `interview`: docs-aware clarification の正式質問シート。重要判断は一問一答で扱い、回答前に unanswered artifact を作成し、回答後に同じ artifact へ回答、採用判断、反映先を追記する。既存の複数質問 artifact は grandfathered で、自動分割や rename はしない。
  - `research`: source-grounded read。事実、推測、未検証、用語衝突、edge case、判断への含意を分ける。
  - `disc`: synthesis / 中間レポート / reflection proposal / ADR candidate triage。採否の最終証跡は canonical Requirement / Design / Plan または accepted ADR に明示的に再記述する。
  - `adr`: 意思決定記録。後から戻しにくく、将来の読者に意外性があり、実質的な tradeoff がある長期判断を固定する。
  - `pr-repair-batch`: PR repair workflow の observation、concern inventory、repair queue、merge-prepared gate を記録する。repair unit は `pr-repair-unit` type を作らず、必要な場合は ordinary `disc` を使う。
  - `draft-requirement`: scope kind に応じた canonical requirement template を直接 source として render する discussion-local draft。
  - `draft-design`: verified `authorized_profile` に対応する issue profile design template を source として render する discussion-local draft。
  - `draft-plan`: verified `authorized_profile` に対応する issue profile plan template を source として render する discussion-local draft。
- `note` は retired。既存 artifact は grandfathered です。future raw / untyped capture は `artifact create --scope TARGET --type blank --title TITLE` を使います。
- `disc` が大きくなりすぎたら、質問回答は `interview`、事実調査は `research`、生ログは `scratch`、長期判断は `adr` へ分割してください。`report.md` へ synthesis 本文を抱え込ませず、採用済み evidence と canonical 反映結果だけを残します。
- Do not create new files in this directory for routine work. New working artifacts use `spec-dock artifact create --scope TARGET --type TYPE --title TITLE` and target `artifacts/`.
- Historical creation command examples are intentionally omitted so this preservation surface is not advertised as a runnable path.
