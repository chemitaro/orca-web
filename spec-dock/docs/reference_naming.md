# 命名と識別子（Current）

Scope IDはGitHub番号にkind prefix `init-`、`epic-`、`iss-` を付けた `<種類>-<番号5桁>` です（5桁を超える番号はそのまま。入力は0埋めしなくてよく、`iss-454` は `iss-00454`）。種類はGitHub Issueの種類のラベルで決まり、題名、親、依存の正本もGitHubです。新規ScopeにUUIDやlocal連番を追加しません。create/importが返すIDとpathを使い、Scope のディレクトリ（`spec-dock/initiatives/<区切り>/<ID>/`）を手で作りません。slugはありません。

branchの既定名は `<ID>` で、独自対応台帳は保存しません。ブランチ名とIDを照らすところでは、最後の `/` の後が `<ID>` か `<ID>-` で始まるものを、そのIDのブランチとして受け付けます。新規Startは--base REFが必要です。既存branchの再開は--branch NAMEを明示し、--baseを渡しません。branch create/show/switchの--nameとStartの--branchはGitで検証します。同一branchの同時checkoutはGitが、別branchの同一Scope重複はStartの観測・短い排他が防ぎます。

直接作業記録のtokenは捕捉した一fileの識別用です。Scope identity、GitHub番号、永続操作台帳ではありません。Finish/clearはその捕捉記録だけを解除し、後から始まった別対象を消しません。

ArtifactはCLIのID/pathを使います。createはtimestamp/type/title、import fileはtimestampと元basenameを基に一件のopaque fileを保存します。本文からauthorityを推測せず、採用内容をRequirement・Design・Planまたはaccepted ADRへ明示的に反映します。
