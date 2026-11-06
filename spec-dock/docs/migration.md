# 導入・移行・保全（Current）

## 外部CLI

対応OSはLinuxとmacOS、Pythonは3.10以上です。Windowsを含む他のOSでは業務操作を開始せず `UNSUPPORTED_PLATFORM`（exit 3）を返します。help・version・completionはrepositoryなしでも利用できます。直接作業記録はPOSIX identityのみを受け付け、未知の記録を自動変換・削除しません。

package managerでレビュー・通常試験が済んだwheelをworktree外へ導入します。例えば `uv tool install /absolute/path/spec_dock-VERSION-py3-none-any.whl` です。PATH上の `spec-dock` が全コマンドの入口です。packageの更新とcheckoutのstatic資産更新は別操作です。

`spec-dock/scripts/spec-dock` はPATH上の外部consoleへ引数と終了値を渡すshimです。Git共有controlやcheckout内Pythonを探しません。旧branchの古いshimが戻っても外部 `spec-dock` は直接使えます。外部consoleがなければ導入/PATH確認へ戻り、自動installや旧engineへのfallbackはしません。

## canonical モードへの移行

SpecDock 0.5.0 は、`spec-dock/workspace.json` の `schema_version` が 4 のリポジトリ（canonical モード）だけを扱います。版3の宣言のリポジトリでは、`canonical check` のほかのどのコマンドも、何も書かずに `CANONICAL_NOT_MIGRATED`（終了コード3）で止まります（`canonical check` は版3の宣言を問題の1件として返します）。

版3のまま残ったリポジトリは、SpecDock 0.4.2（両方のモードを持つ最後の版）を入れ直し、版のタグ `v0.4.2` の `scripts/migrate-to-canonical/README.md` の手順で、リポジトリごとに一度だけ移します。移行のスクリプトは 0.5.0 のリポジトリから外したので、タグから取り出します（`git show v0.4.2:scripts/migrate-to-canonical/README.md`）。その手順書が「0.3.0」「`v0.3.0`」と書くところ（移行の前に上げる配布資産と、CI の SpecDock の固定の版、撤去の後の戻し方）は、「0.4.2」「`v0.4.2`」と読み替えます。移した後に 0.5.0 へ上げます（「0.5.0 への更新」）。

移行の後の使い方、ツールの設定の1行、同期が止まったときの扱いは[canonical モードの使い方](canonical.md)にあります。`installation init` は版4の宣言を置くので、新規導入のリポジトリは canonical モードで始まり、`spec-dock canonical link` が要ります。

## 0.4.0 への更新

0.4.0 は、canonical モード（宣言の版4）のリポジトリで、新しく作る Scope の要件・設計・計画を CUE で書く版です。版3のリポジトリの動きは変わりません。

- パッケージを 0.4.0 に上げた後、各リポジトリで `spec-dock installation update` を実行して配布資産を上げます。新しい雛形 `spec-dock/templates/cue/<種類>/`、デザインシステム `spec-dock/design-system/`、ガイド `spec-dock/docs/authoring/cue.md` と `explanation.md`、スキルが入ります。上げる前の配布資産のままだと、`scope create` と `scope import github` は GitHub に何も書かずに `SCOPE_TEMPLATES_OUTDATED` で止まります。
- CLI の契約の変更（版4だけ）：
  - `spec-dock scope create` と `spec-dock scope import github` に、`--assurance <light|standard|strict|critical>` と `--assurance-reason <理由>` が必須になりました。ないと何も読まず何も書かずに `ASSURANCE_REQUIRED`（終了コード2）で止まります。これらを呼ぶスクリプトや手順に、2つの引数を足します。版3のリポジトリで付けると `CANONICAL_NOT_MIGRATED` で止まります。
  - 新しい Scope は CUE の Scope（`requirement.cue`、`design.cue`、`plan.cue`、`explanation.html`、`report.md`）です。既存の Markdown の Scope は移さず、そのまま動きます。
  - 公開の葉が2つ増えて55になりました：`spec-dock scope check <ID>`（CUE の Scope を検査する）と `spec-dock scope render <ID>`（要件・設計・計画を HTML に描く）。
  - `spec-dock scope show --json` は、`data.result.assurance`（`level`、`reason`、`source`）を返します。
  - CUE の Scope の `spec-dock work finish` は、閉じる前に `scope check` と同じ検査を行い、誤りが残れば何も書かずに `SCOPE_CHECK_FAILED` で止まります。
- 道具：CUE の Scope の検査には `cue` v0.17.1 以上が PATH に要ります（例 `go install cuelang.org/go/cmd/cue@v0.17.1`）。ないと `CUE_NOT_FOUND` で止まります。Markdown の Scope と版3のリポジトリには要りません。
- 書き方は [CUE Authoring Guide](authoring/cue.md) と [Explanation Guide](authoring/explanation.md)、エラーと次の1手は [canonical モードの使い方](canonical.md) にあります。

## 0.4.1 への更新

0.4.1 は、0.4.0 の後に入れた CUE の書き方と検査の改善を届ける版です。動きの変更は小さく、版3のリポジトリには影響しません。

- パッケージを 0.4.1 に上げた後、各リポジトリで `spec-dock installation update` を実行して配布資産を上げます。0.4.0 の配布資産のままでも動きますが、ガイド（`authoring/cue.md`、`issue-plan.md`、`scope-layering.md`）、`canonical.md`、`reference_cli.md`、Issue の `plan.cue` の雛形が新しくなります。
- 主な改善：
  - 個別のコマンドの `--help` に、共通の引数が出ます。
  - 既定値のある列挙（手順の `status` など）に許されない値を書いたときの `CUE_INVALID` が1件にまとまり、`hint` が日本語になりました。
  - Issue の `plan.cue` の雛形は、1手順を1行にし、`status` を `title` と `realizes` のすぐ後に置きます。
- CLI の契約の変更（版4だけ）：
  - `spec-dock scope check`：`CUE_INVALID` に、既定値との衝突の行を残す `details.cue_related` が付きます。保証レベルが light でテストが1つもない Issue には、警告 `SPEC_NO_TESTS` が付きます（誤りではありません）。
  - `spec-dock scope render` に `--design-system <file|inline>` が付きました（既定は `file`）。`inline` は `ds.css`、`ds.js`、`marked` を HTML に埋め込み、デザインシステムがなければ `DESIGN_SYSTEM_MISSING`（終了コード3）で止まります。Python の入口 `render_scope_html` には `embed_design_system` が付きました。

## 0.4.2 への更新

0.4.2 は、0.4.1 の後に入れた canonical の同期と CI の見本の改善を届ける版です。動きの変更は小さく、版3のリポジトリには影響しません。

- パッケージを 0.4.2 に上げた後、各リポジトリで `spec-dock installation update` を実行して配布資産を上げます。0.4.1 の配布資産のままでも動きますが、`canonical.md`（「CI の費用と、見本の合わせ方」の節と、不要ファイルの説明）と CI の見本 `ci/spec-dock-check.yml`（費用と合わせ方の注記）が新しくなります。
- 主な改善：
  - OS が作る不要なファイル（`.DS_Store`、`._*` など）を、canonical の同期で保存しません。不要ファイルの削除は、大量削除の保留に数えません。
  - CI の見本に、費用と合わせ方の注記が付きました。
- CLI の契約の変更（版4だけ）：
  - `spec-dock canonical status` の `changes` に `junk_files` が付きます。前の版が保存してしまった不要ファイルの一覧で、カタログから消すと次の周期が削除を保存します。
  - `spec-dock canonical remove` は、保存しないファイルがカタログに残っていると、何も消さずに `CANONICAL_IGNORED_FILES_PRESENT`（終了コード3）で止まります。示されたファイルを消すか移してから、もう一度実行します。

## 0.5.0 への更新

0.5.0 は、従来モード（宣言の版3、`.meta.json`）を撤去し、canonical モードだけを持つ版です。すべてのリポジトリが版4に移った後に入れます。

- 上げる手順：使っているすべてのリポジトリ（とそのクローン）の `spec-dock/workspace.json` が `"schema_version": 4` であることを確かめてから、パッケージを 0.5.0 に上げ、各リポジトリで `spec-dock installation update --target <チェックアウト> --backup-dir <新しい外のディレクトリ> --yes` を実行して配布資産を上げ、通常の PR でコミットします。CI の見本は `spec-dock/system/spec-dock-version` の版（0.5.0）の SpecDock を入れて動きます。
- 撤去したもの：
  - 版3の宣言を読むと、`canonical check` のほかのどのコマンドも、何も読み書きせずに `CANONICAL_NOT_MIGRATED`（終了コード3）で止まり、`recovery` に「SpecDock 0.4.2 を入れ直し、版のタグ v0.4.2 の scripts/migrate-to-canonical/README.md に従って移す」を示します（「canonical モードへの移行」）。`installation` のコマンドと `workspace doctor --raw` も止まります。版5以上と壊れた宣言は、今までどおり `PRECONDITION_FAILED` です。
  - コマンド `spec-dock workspace migrate` と `spec-dock workbench copy` がなくなりました（引数の誤り、終了コード2）。公開の葉は 53 になりました。Scope の `.workbench/` はカタログの中にあり、どの worktree からも見えるので、写す必要はありません。
  - 引数 `workspace validate --ci`（CI では `spec-dock canonical check`）、`workspace sync --source local` と `dependency check --source local`（`--source` は `github` だけ。省くとスナップショットを読みます）、`scope create` と `scope import github` の `--slug` がなくなりました（引数の誤り）。`artifact create --slug` は残ります。
  - エラーのコード `CANONICAL_NOT_APPLICABLE` と `CANONICAL_WORKBENCH_SHARED` は、もう返りません。
  - `.md` の Scope の雛形 `spec-dock/templates/{initiative,epic,issue}/`（各 `requirement.md`、`design.md`、`plan.md`、`report.md`、`.workbench/README.md`）と、入れ子の置き場の `epics/rules.md`・`issues/rules.md` の先だった `spec-dock/docs/rules/initiative/epics.md`・`spec-dock/docs/rules/epic/issues.md` を外しました。`installation update` は、変えていなければ退避してから消します。変えていれば手で合わせるよう止まります（`legacy static resource is modified or unknown; merge manually`）。
  - CUE の雛形の `report.md`（`spec-dock/templates/cue/<種類>/report.md`）の前付けから `タイトル:` と `親:` の行を外し、作るときにその2行を除く処理と「詳細:」のリンクを書き換える処理をやめました。作られる `report.md` は 0.4.2 と同じです。0.4.2 の配布資産のまま 0.5.0 で作ると、その2行が残ります（正本ではありません）。`installation update` の後は残りません。
  - 移行のスクリプト `scripts/migrate-to-canonical/` を、spec-dock のリポジトリから外しました（版のタグ `v0.4.2` に残ります）。
- 0.4.2 の後に入った改善：
  - `installation update`（`--dry-run` と、途中で止まった場合を含む）が `.claude/skills/spec-dock*` の古い写しを外すとき、リンクがない枠ごとに、外枠の `warnings[]` に `CLAUDE_SKILL_LINK_MISSING`（`details`：`slot`、`link_target`、`command`）が出ます。終了コード、`status`、`effects`、`data.result` は変わりません。示された `command` でリンクを置きます（SpecDock はリンクを作りません）。
  - 配布する `spec-dock/.gitignore` に `!**/.workbench/` を足しました。ルートの `.gitignore` が `.workbench/` を無視していても、`spec-dock/` の下の `.workbench/README.md`（雛形の README を含む）がコミットの対象になります。ほかの中身は無視のままです。すでに使っているリポジトリは、更新の後に `git add spec-dock/templates` で、それまで無視されていた雛形の README を足してコミットします。
- 戻し方：0.5.0 に問題があれば、パッケージを 0.4.2 に戻します。0.4.2 は canonical モードと CUE の Scope を持つので、配布資産を 0.5.0 に上げる前のリポジトリはそのまま動きます。配布資産を 0.5.0 に上げた後なら、その更新の PR（版のファイル `spec-dock/system/spec-dock-version` を含む）を `git revert` して、配布資産を 0.4.2 のバイトに戻します。版のファイルだけを戻すと、0.4.2 の `canonical check` が 0.5.0 の資産を知らない変更として CI を止め、0.4.2 の `scope create` が外した `docs/rules/initiative/epics.md`・`docs/rules/epic/issues.md` を求めて止まります（0.4.2 の `installation update` も 0.5.0 のバイトを知らないので、戻す手段になりません）。

## 0.5.1 への更新

0.5.1 は、0.5.0 の後に入れた、確認と実行の間の変化・部分失敗の返し方・宣言の検査の直しを届ける版です。canonical モード（宣言の版4）だけの版で、コマンドと JSON の形は増えません。

- パッケージを 0.5.1 に上げた後、各リポジトリで `spec-dock installation update --target <チェックアウト> --backup-dir <新しい外のディレクトリ> --yes` を実行して配布資産を上げ、通常の PR でコミットします。0.5.0 の配布資産のままでも動きますが、`reference_cli.md`、`cli-redesign-guide.html`、スキル `SKILL.md`、`finalize-artifact.py`、この `migration.md` が新しくなります。CI の見本は `spec-dock/system/spec-dock-version` の版（0.5.1）の SpecDock を入れて動きます。
- 契約の変更：
  - `scope close --reason completed` と `work finish` は、子孫がすべて完了（completed）か不採用（not-planned）で閉じていれば親を閉じます。0.5.0 では不採用の子孫があると終了コード3で止まっていました。開いている子孫と状態が分からない子孫があれば、今までどおり `DESCENDANT_NOT_COMPLETED`（終了コード3）で止まります。
  - `canonical check` は、重複したキーを持つ宣言を `WORKSPACE_DECLARATION_INVALID`（`details.reason=duplicate-member`）の失敗1件にします。ほかのコマンドは、重複したキーを持つ宣言を版4として受け付けず、`PRECONDITION_FAILED`（終了コード3）で止まります。観測の間に消えた版3の worktree は、`workspace sync` と `work start` で unavailable の行になります。
- 確認と実行の間の変化（何も書かずに止まる）：
  - `scope close` と `scope reopen` は、端末での確認の後に直接の選択が変わっていれば、何も書かずに `PRECONDITION_FAILED`（終了コード3）で止まります。
  - `scope create` は、確認の後に `origin` が変わっていれば止まります。何も書いていなければ `PRECONDITION_FAILED`（終了コード3）、種類のラベルを作った後なら `CANONICAL_WRITE_INCOMPLETE`（`partial`、終了コード6）、Issue を作った後なら `SCOPE_PUBLICATION_INCOMPLETE`（`partial`、終了コード6）です。
  - `worktree remove` は、無視されたものが `spec-dock/initiatives` のリンクだけかを、削除の直前（`--unlock` なら unlock の後）まで繰り返し確かめます。確かめの後に無視されたファイルができていれば、`--discard-ignored` なしでは何も消さずに止まります。止まる時点で終了コードが違います：最初の判定では `PRECONDITION_FAILED`（終了コード3）、unlock の前の確かめでは `WORKTREE_REMOVE_FAILED`（`failed`、終了コード3）、unlock の後では `WORKTREE_REMOVE_FAILED`（`partial`、終了コード6）です。
- 部分失敗の返し方：
  - `artifact create` と `artifact import file` は、`artifacts/` を作った後の失敗を `ARTIFACT_PUBLICATION_INCOMPLETE`（`partial`、終了コード6）で返します。`effects` に `artifact.directory` が付き、作ったディレクトリは残ります。
  - `scope delete` は、途中で失敗したときの `effects` を起きたとおりに返します（例：`selection.clear` が succeeded、`scope.delete` が unknown）。
- スキル `spec-dock-grill-with-docs` の `finalize-artifact.py` は、`spec-dock/initiatives` のカタログへのリンク越しの Artifact のパスを受け付けます。契約の変更はありません。
- 戻し方：0.5.1 に問題があれば、パッケージを 0.5.0 に戻します。配布資産を 0.5.1 に上げた後なら、その更新の PR（版のファイル `spec-dock/system/spec-dock-version` を含む）を `git revert` して、配布資産を 0.5.0 のバイトに戻します。版のファイルだけを戻すと、0.5.0 の `canonical check` が 0.5.1 の資産を知らない変更として CI を止めます（0.5.0 の `installation update` も 0.5.1 のバイトを知らないので、戻す手段になりません）。

## 0.6.0 への更新

0.6.0 は、HTML のダッシュボードを届ける版です。canonical モード（宣言の版4）だけの版で、今までの Markdown・PlantUML のダッシュボードは撤去されました。

- パッケージを 0.6.0 に上げた後、各リポジトリで `spec-dock installation update --target <チェックアウト> --backup-dir <新しい外のディレクトリ> --yes` を実行して配布資産を上げ、通常の PR でコミットします。0.5.1 の配布資産のままでも動きますが、`reference_cli.md`、`canonical.md`、`cli-redesign-guide.html`、`docs/README.md`、`.gitignore`、この `migration.md` が新しくなります。CI の見本は `spec-dock/system/spec-dock-version` の版（0.6.0）の SpecDock を入れて動きます。
- 最初の1手：`spec-dock dashboard serve` を実行してブラウザーで開きます（既定は `http://127.0.0.1:47800`）。iPhone など別の端末からは `spec-dock dashboard serve --tailscale` で、Tailscale の住所にも待ち受けます。
- 新しいコマンド（公開のコマンドは 53 から 61 になります）：
  - `dashboard summary`（#528）：リポジトリの概況を JSON `specdock.dashboard-summary/v1` で返します。
  - `dashboard serve`・`dashboard hide`・`dashboard show`・`dashboard list`（#529）：利用者ごとに1つのサーバーを `127.0.0.1:47800` で前面で動かし、登録した全リポジトリを見るだけで配ります。`hide` と `show` はリポジトリの表示を切り替え、`list` は登録を示します。
  - `dashboard service install`・`dashboard service status`・`dashboard service uninstall`（#530）：ログインのときに起動する常駐を、明示して入れたときだけ入れます（macOS は launchd、Linux は systemd のユーザーの単位。定期の同期の常駐とは別のラベル）。`installation update` や `canonical link` は入れません。
  - 版の更新の後、常駐は起動し直します（サーバーが終了コード75で終わり、launchd と systemd が新しい版で起動し直す）。前面の `dashboard serve` は、利用者が起動し直します。
- 新しい契約：
  - 画面の道 `/r/<host>/<owner>/<name>/scopes/<ID>`、`?embed=1`、API、埋め込みの契約 `specdock.embed/v1`、`frame-ancestors`。CORS を許すのは `/ds/` と `/vendor/` だけです。詳しくは `reference_cli.md` の「ダッシュボードのサーバーの契約」。
  - 主な新しいエラーのコード（各コマンドのほかのコードは `reference_cli.md` のコマンド表にあります）：`DASHBOARD_SERVICE_UNSUPPORTED`・`DASHBOARD_SERVICE_FAILED`（終了コード3）、`DASHBOARD_STATE_ROOT_INVALID`（終了コード2）。
- 利用者の状態の置き場（`~/.local/state/spec-dock/`）に増えるもの：`dashboard/server.json`（`specdock.dashboard-server/v1`）、`dashboard/repositories.json`（`specdock.dashboard-repositories/v1`）、`dashboard/seen.json`（`specdock.dashboard-seen/v1`）、`dashboard/server.lock`。常駐を入れたときだけ、launchd の plist か systemd の単位が増えます。`dashboard/service.log` が増えるのは launchd のときだけで、systemd では出力が journal（`journalctl --user -u spec-dock-dashboard`）に出ます。
- 構造のスナップショットは版2になります（#537。PR の状態を持つ）。新しい版は版1も読みます。前の版に戻すと、一度取り直します。定期の同期は PR の状態を取るため、成功か rate limit の後はリポジトリごとに約2分に1回、ほかの失敗が続く間は60秒に1回、GitHub の GraphQL に問い合わせます（1回あたり約3ポイント）。
- Markdown・PlantUML のダッシュボードの撤去（#533）：
  - `canonical status` の JSON から `dashboard` の項目と、`CANONICAL_DASHBOARD_OCCUPIED`・`CANONICAL_DASHBOARD_FAILED` の警告が消えます。
  - `canonical sync` の `dashboards_written` は常に0です（後の版で消す予定）。
  - `canonical remove` は、5つのファイルを消しません。`state.json` に dashboard を書きません（前の版に戻しても読めます）。
  - 配布の `spec-dock/.gitignore` から、`dashboard.md`・`tree.puml`・`tree-all.puml`・`deps-issues.puml`・`deps-raw.puml` の5つの名前が外れます。`installation update` の後、残っているこれらのファイルが `git status` に出ます。使わないので、消してかまいません（Git で管理していなければ、ただ消します）。
- 戻し方：0.6.0 に問題があれば、常駐を入れていれば先に `spec-dock dashboard service uninstall` を実行し、パッケージを 0.5.1 に戻します。配布資産を 0.6.0 に上げた後なら、その更新の PR（版のファイル `spec-dock/system/spec-dock-version` を含む）を `git revert` して、配布資産を 0.5.1 のバイトに戻します。版のファイルだけを戻すと、0.5.1 の `canonical check` が 0.6.0 の資産を知らない変更として CI を止めます（0.5.1 の `installation update` も 0.6.0 のバイトを知らないので、戻す手段になりません）。

## 0.7.0 への更新

0.7.0 は、人のタスク（`spec-dock todo`）を届ける版です。canonical モード（宣言の版4）の版で、カタログの形式（format 1）、`workspace.json` の版（4）、構造のスナップショットは変わりません。

- パッケージを 0.7.0 に上げた後、各リポジトリで `spec-dock installation update --target <チェックアウト> --backup-dir <新しい外のディレクトリ> --yes` を実行して配布資産を上げ、通常の PR でコミットします。`todo` のコマンドはパッケージだけで使えますが、配布のスキルの「人のタスク」の規則は静的な資産なので、`installation update` で入れ替わります。0.6.0 の配布資産のままでも動きますが、スキル（`.agents/skills/spec-dock/SKILL.md`）、`docs/todo.md`（新しい）、`docs/README.md`、`docs/guide.md`、`canonical.md`、`reference_cli.md`、`cli-redesign-guide.html`、この `migration.md` が新しくなります。CI の見本は `spec-dock/system/spec-dock-version` の版（0.7.0）の SpecDock を入れて動きます。
- 最初の1手：`spec-dock todo list` を実行します。`todos/` は最初の `todo add` が作るので、それまでは空の一覧が返り、`todo check` は「記録がない」で成功します。使い方は `spec-dock/docs/todo.md` にあります。
- 新しいコマンド（公開のコマンドは 61 から 71 になります。#549・#550）：`todo add`・`todo list`・`todo show`・`todo update`・`todo done`・`todo snooze`・`todo cancel`・`todo reopen`・`todo check`・`todo settings`。
  - 人にしかできない判断・確認・操作を、そのリポジトリのカタログの `todos/<YYYY-MM>/t-xxxx.json` に1件1つの記録（`specdock.todo/v1`）として登録して追います。GitHub には何も送りません。
  - `todo list --all-repositories`・`--repository R`：この PC の登録簿にある全リポジトリの人のタスクを集めます（`specdock.todo-list/v1`、`mode: repository` か `all_repositories`）。`todo show <REF>`（`owner/name/t-xxxx`）は、チェックアウトの外から1件を返します。
  - `dashboard summary`（と API の `/api/v1/r/<repo>/summary`）に `todos`（`open`・`blocking`・`overdue`）の数が足されます。読めないときは `status: unavailable` で、要約は成功します。
  - 設定は3段です。初めの値 < 利用者の設定（`$XDG_CONFIG_HOME/spec-dock/config.json`、`specdock.config/v1`）< リポジトリの設定（`todos/settings.json`、`specdock.todo-settings/v1`）。SpecDock は設定のファイルを作りません。なくても初めの値で動きます。
  - `todo check` は、Python の検査に加えて、`cue`（v0.17.1 以上）があれば CUE の型でも確かめます。なければ警告 `TODO_CUE_SKIPPED` を出して Python の検査で決めます。
  - 主な新しいエラーのコード（全部は `reference_cli.md`）：`TODO_*`（`TODO_INVALID`、`TODO_NOT_FOUND`、`TODO_SUBTASKS_OPEN`、`TODO_CHECK_FAILED`、`TODO_REPOSITORY_UNREADABLE`、`TODO_REGISTRY_UNREADABLE` など）。`canonical.md` に次の1手があります。
- 配布するスキルと文書（#551）：スキルに「人のタスク」の規則（登録する場面としない場面、`todo add --by agent --role --kind`、束、`todo done --record` での閉じ方）が足されます。`docs/todo.md` が新しく配られ、`canonical.md`、`docs/README.md`、`docs/guide.md` が変わります。
- 構造の図（ホーム。#556・#560）：既定で、親が開いていれば終わった Scope も出し、図に出ている箱どうしの終わった依存も薄い線で出します。同じ段は活動順に並べます。配置は #560 で改まり、依存の矢印でつながったものは同じ行に左から右へ並び、つながっていないまとまりは画面の見える幅でまとまりの境目ごとに折り返して、ウィンドウの幅が変わると並べ直されます（#556 の「折り返さず右へ」を改めたものです。API と保存の形は変わりません）。ブラウザーの保存のキーが `specdock.graph.v1` から `specdock.graph.v2` になり、表し方・凡例などは引き継がれますが、「終わったものも」と依存の線の選択は一度だけ新しい既定に戻ります。構造の API の各 Scope に `active_at` が足されます。
- ダッシュボードに出すリポジトリの設定（#552）：利用者の設定 `config.json`（`specdock.config/v1`）の `dashboard` の節（`visible` と `repositories.<鍵>.visible`）と、カタログの根の `dashboard.json`（`specdock.dashboard-settings/v1`、`visible`）で決めます。優先は、初めの値（表示）< 利用者の `visible` < 利用者の `repositories` < リポジトリの `dashboard.json`。`dashboard hide` の印は常に隠します。壊れた設定は隠す側に倒れます（利用者の設定のファイルが壊れていると全リポジトリが隠れます）。
  - `dashboard list` の各行に `mark`・`config {visible, source}`・`hidden_by` が、data に `config_problems` が足されます。`dashboard hide`・`dashboard show` の data にも `mark`・`config`・`hidden_by` が足され、`show` は設定が隠すとき警告 `DASHBOARD_HIDDEN_BY_CONFIG` を出します。`dashboard summary` と `todo list` の `hidden` は設定を含む最終の値です。
  - 常駐の定義に、install のときの絶対の `XDG_CONFIG_HOME` が入ります。0.6.0 で常駐を入れ、`XDG_CONFIG_HOME` を使っている場合は、更新の後に `spec-dock dashboard service install` をやり直します。
- 前の版との同居：前の版の SpecDock が別の PC で同じカタログを同期しても、`todos/` はふつうのファイルとして保存と push がされ、検査に引っかかりません（前の版では `todo` のコマンドがないだけです）。
- 戻し方：0.7.0 に問題があれば、パッケージを 0.6.0 に戻します。配布資産を 0.7.0 に上げた後なら、その更新の PR（版のファイル `spec-dock/system/spec-dock-version` を含む）を `git revert` して、配布資産を 0.6.0 のバイトに戻します。版のファイルだけを戻すと、0.6.0 の `canonical check` が 0.7.0 の資産を知らない変更として CI を止めます（0.6.0 の `installation update` も 0.7.0 のバイトを知らないので、戻す手段になりません）。カタログの `todos/` のファイルは残してかまいません（前の版のほかのコマンドに影響せず、版を上げ直せばそのまま読めます）。

## 0.8.0 への更新

0.8.0 は、ダッシュボードの文書の描画（#535）と人のタスクの画面（#554）を届ける版です。コマンドの数（71）、カタログの形式（format 1）、`workspace.json` の版（4）は変わりません。足すものだけで、0.7.0 のコマンドと API は変わりません。

- パッケージを 0.8.0 に上げた後、各リポジトリで `spec-dock installation update --target <チェックアウト> --backup-dir <新しい外のディレクトリ> --yes` を実行して配布資産を上げ、通常の PR でコミットします。変わる配布資産は `docs/reference_cli.md`、`docs/authoring/cue.md`、Issue の計画の雛形 `templates/cue/issue/plan.cue`、この `docs/migration.md`、版のファイル `spec-dock/system/spec-dock-version`（0.8.0）の5つです。0.7.0 の配布資産のままでも動きます。CI の見本は版のファイルの版（0.8.0）の SpecDock を入れて動きます。
- 文書の描画（#535）：Scope の詳しい画面の「文書」のタブで、仕様をその場で描いて読めます。
  - 画面の道が足されます：`/r/<host>/<owner>/<name>/scopes/<ID>/doc`（`render_scope` の HTML）と `…/scopes/<ID>/doc/<道>`（`requirement.md`・`design.md`・`plan.md`・`report.md` と、`artifacts/`・`discussions/` の直下の名前に `adr-` を含む `.md`）。`sandbox="allow-scripts allow-popups"` の枠で示し、インターネットは使いません。
  - API の `/api/v1/r/<repo>/scopes/<ID>` の `details` に、`spec`・`check`（検査の結果）・`progress`（計画の進み具合）・`adrs` と、文書ごとの `view` が足されます（画面のための JSON で、契約にはしません）。`cue` がないなどで検査できないときは `check.status: failed` と次の1手を示します。
  - 前面の `serve` が古い版で動いていると、画面の上に起動し直しを促す帯（`SERVER_RESTART_REQUIRED`）が出ます。
- 人のタスクの画面（#554）：見るだけで、書く口や完了のボタンはありません。
  - API が足されます：`GET /api/v1/todos` と `GET /api/v1/r/<repo>/todos`（中身は `specdock.todo-list/v1`。`?status=open|snoozed|done|cancelled|all`、既定は `open`。ほかの値は 400 `DASHBOARD_TODO_FILTER_INVALID`）、`GET /api/v1/r/<repo>/todos/<ID>`（`todo show` と同じ1件の形。404 `TODO_NOT_FOUND`／`TODO_INVALID`、記録の誤りなどは 409 `TODO_RECORD_INVALID` など、503 はカタログが読めないとき）。`/api/v1/todos/revision` と、`structure`・`scopes/<ID>` の `todos` の項目は画面のためのもので、契約にしません。
  - 画面の道が足されます：`/todos`、`/r/<repo>/todos`、`/r/<repo>/todos/<ID>`。上の帯に「人のタスク」のタブが出ます。
  - 構造の図の箱、ボードのカード、詳しい画面の見出しに「人 n」の印（Epic と Initiative は配下も数えます）、詳しい画面に「人のタスク」のタブ、横断の概況の札に「人のタスク n」「期限切れ m」が出ます。`dashboard hide` やダッシュボードの設定で隠したリポジトリは、人のタスクの一覧と1件からも外れます。
- 配布の文書の例の直し（#567）：`docs/authoring/cue.md` の CUE の書き方と、Issue の計画の雛形 `templates/cue/issue/plan.cue` の `execution` の例が、仕様化（`spec`）と実装（`impl`）の2つのセッションに分けた例になります。型・CLI・検査は変わりません（例だけの変更です）。
- 古さの表示の直し（#568）：`dashboard summary` の `fetched_at`・`stale` と、API の `snapshot.fetched_at`・`age_seconds`・`stale` の意味が「最後に構造を確かめた時刻」（スナップショットの取得と、変更の確認（probe）のうち新しいほう）になります。構造に変化がない間に誤って「古い」と警告することがなくなります。欄の名前と型は変わりません。
- 常駐のダッシュボードは、パッケージの版の更新の後に、自動で起動し直します（60秒ごとの版の確認。`dashboard service install` のやり直しは要りません）。前面の `serve` は自分で起動し直します。
- 戻し方：0.8.0 に問題があれば、パッケージを 0.7.0 に戻します。配布資産を 0.8.0 に上げた後なら、その更新の PR（版のファイル `spec-dock/system/spec-dock-version` を含む）を `git revert` して、配布資産を 0.7.0 のバイトに戻します。版のファイルだけを戻すと、0.7.0 の `canonical check` が 0.8.0 の資産を知らない変更として CI を止めます。

## 0.9.0 への更新

0.9.0 は、ダッシュボードの状態の色と形（#574）、構造の図の並べ方の改善（#575・#578）、細かい直し（#572）を届ける版です。コマンドの数（71）、カタログの形式（format 1）、`workspace.json` の版（4）は変わりません。コマンドの引数と配布の文書の内容も変わらず、変わる配布資産は、この `docs/migration.md` と版のファイル `spec-dock/system/spec-dock-version`（0.9.0）の2つです。

- パッケージを 0.9.0 に上げた後、各リポジトリで `spec-dock installation update --target <チェックアウト> --backup-dir <新しい外のディレクトリ> --yes` を実行して配布資産を上げ、通常の PR でコミットします。0.8.0 の配布資産のままでも動きます。CI の見本は版のファイルの版（0.9.0）の SpecDock を入れて動きます。
- 状態の色と形（#574）：ダッシュボードの状態の印が変わります。
  - 着手できる＝深い青の再生の丸、作業中＝鮮やかな緑の区切りの輪、止められている＝黄色の一時停止の丸（赤から変更）、不明＝紫の「?」の丸（黄から変更）です。人のタスクが Scope を止めている印も黄色になります。
  - 作業中の輪は、Issue では `plan.cue` の手順（dropped を除く）の進み（終わった手順が太い緑）、Epic と Initiative では配下の Issue の終わった割合です。最後に動いてから30分以内なら次の区切りが点滅し、超えると「N分動きなし」と出ます。サーバーは `cue` で `plan.cue` を読み、更新の時刻と大きさで覚えます。
  - API：構造の API と詳しい画面の API の各 Scope に `progress`（作業中の Issue だけ。画面のための項目で、契約にはしません）が足されます。`revision` は、作業中の Issue の `plan.cue` の書き換えでも変わります。
- Initiative の横並び（#575）：構造の図の最上位を、全体を画面に収めたときの倍率が最大になる行の幅で並べます。ウィンドウの大きさが変わり終わったときだけ並べ直します。
- 構造の図の隙間の直し（#578）：左右・上下の広すぎる隙間を直します。配線の寄せと広げを通り道ごとに見積もり、線の多い入口の辺は 8px おきに置き、線が枠の外へ遠回りしません（図の検査に `frameExits` が足されます）。
- 細かい直し（#572）：`GET /favicon.ico` と `/assets/favicon.svg` が足されます（ファビコンの 404 がなくなります）。Scope が 0 件のリポジトリの札に「Scope はまだありません」と出ます。390px の幅で、帯の下の図の領域の線を直します。
- 0.8.0 の節の訂正：0.8.0 の節の冒頭は「足すものだけで、0.7.0 のコマンドと API は変わりません」と書いていますが、同じ節の古さの表示の直し（#568）は、既存の欄の意味を変えています。正しくは次のとおりです。`dashboard summary` の `fetched_at`・`stale` と、API の `snapshot.fetched_at`・`age_seconds`・`stale` は、構造の古さを `max(スナップショットの fetched_at, 確かめた checked_at)`（最後に構造を確かめた時刻）で表します。ただし、変更の確認（probe）が失敗中のとき、記録がないか壊れているとき、時刻が未来のときは、`fetched_at` だけで判定します。欄の名前と型は変わりません。0.8.0 の節の本文は、配布済みのバイトのまま残しています。
- 常駐のダッシュボードは、パッケージの版の更新の後に、自動で起動し直します（60秒ごとの版の確認。`dashboard service install` のやり直しは要りません）。前面の `serve` は自分で起動し直します。
- 戻し方：0.9.0 に問題があれば、パッケージを 0.8.0 に戻します。配布資産を 0.9.0 に上げた後なら、その更新の PR（版のファイル `spec-dock/system/spec-dock-version` を含む）を `git revert` して、配布資産を 0.8.0 のバイトに戻します。版のファイルだけを戻すと、0.8.0 の `canonical check` が 0.9.0 の資産を知らない変更として CI を止めます。

## 新規導入

```sh
spec-dock installation init /absolute/project --dry-run --json
spec-dock installation init /absolute/project --yes --json
spec-dock installation show --target /absolute/project --json
spec-dock --project /absolute/project workspace validate --json
```

対象は正確なGit worktree root一つです。initは新writerのworkspace宣言と静的資産だけを置き、既存の配布先fileがあれば書込み前に停止します。main/linkedを一括導入せず、runtime、直接作業記録、Git内の独自領域を作りません。

## static資産の更新・削除

```sh
spec-dock installation update --target /absolute/project --dry-run --json
spec-dock installation update --target /absolute/project --backup-dir /absolute/new-static-backup --yes --json
# 正確な対象のtool資産削除が許可されている場合だけ
spec-dock installation uninstall --target /absolute/project --backup-dir /absolute/new-uninstall-backup --yes --json
```

版4（新writer）のworkspaceで既知path/hashのstatic filesだけを変更します。更新は欠けたfileを補い、既知旧bytesを置換し、既知旧runtime filesと外した雛形を個別退役させます。削除も所有権検証を行い、workspace宣言・ignore規則・仕様・Artifact・Workbench・直接記録・directoryを残します。未知改変は人間によるmergeへ戻し、directoryごとの削除はしません。

旧static bytes/modeを `backup/static/<relative>` へ保存し、別の一時場所へ実際に復元して比較します。backup先は全clone worktree、Git metadata、installed packageの外で、既存の通常parent下の新しい絶対pathです。既存backupを再利用しません。

## 途中で停止した場合

dry-runは書込み・backup・GitHub更新・Start lockを行いません。適用途中のexit6は確認済み・unknown・未実施effectsを区別します。残った候補、backup、実体pathを保全し、観測してから新しい明示操作を判断します。自動巻戻しやjournal replayはありません。コードrevertはGitHubへの完了・作成効果を元へ戻しません。
