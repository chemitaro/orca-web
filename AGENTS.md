# AGENTS.md

orca-web は、この Mac の Orca（stablyai/orca のデスクトップアプリ）の状態を読み、既存のタブを前面に出し、後には会話を読んで指示を送る、小さな Web サービスです。SpecDock のダッシュボードに部品として埋め込みます。

## プロジェクトの形

- Node.js 24（LTS、版は `.node-version`）と TypeScript。TypeScript は Node の型の剥がしで直接動かします。erasable な構文だけを使います（`enum`、`namespace`、引数のプロパティは使わない）。相対の import は `.ts` の拡張子を付けます。
- `src/orca/`：Orca のアダプター。Orca に触るのはここだけです。
  - `cli.ts`：CLI の境界（`CliRunner`、`NodeCliRunner`、`buildManagedEnv`）。絶対パス、引数の配列、管理した環境変数で呼びます。
  - `orca-cli.ts`：`--json` の封筒を型の結果（`CliOutcome`）に解く `OrcaCli`。
  - そのほか、RPC の境界、機能の確かめ、録画と再生（後の手順で足します。各ファイルの先頭の説明を読む）。
- `src/server/`：HTTP の入口（今は `/api/health` だけ）。
- `src/tools/`：実機の確かめと録画の道具。
- `web/`：画面（素の ES Modules。ビルドしない）。
- `test/`：`node:test` のテストと、録画の fixture（`test/fixtures/`）。
- 依存は devDependencies（`typescript`、`@types/node`、`@biomejs/biome`）だけです。実行時の依存を足さないでください。

## テストの実行

```sh
npm ci
npm test            # node --test "test/**/*.test.ts"
npm run lint        # biome check と tsc --noEmit（型の検査）
npm run build       # tsc で dist/ に出す
npm run format      # biome で整形する
npm run probe:live  # この Mac の Orca で読むだけの確かめ（集計だけを出す）
```

1つのファイルだけを走らせるときは `node --test test/orca/cli-runner.test.ts` のように呼びます。テストは Orca を起動しません。Orca の応答は録画の再生で与えます。CI（`.github/workflows/ci.yml`）は PR と main への push で lint、テスト、ビルドを走らせます。

## 守ること

- Git：コミットは `git-commit` スキル（`git add -- <パス>` の後に `git-autocommit`）。日本語の Conventional Commits。`git config user.name`／`user.email` が `chemitaro`／`84865385+chemitaro@users.noreply.github.com` であることを確かめる。`--no-verify`、強制 push、履歴の書き換え、マージ、`main` への直接の push、タグの作成をしない。PR は `Refs #<番号>`（自動で閉じる語は使わない）。
- リポジトリは公開。秘密、トークン、`.env`、利用者の私的なプロンプトの文、絶対パスの個人の情報を、コミット、録画、ログに入れない。
- 利用者の環境（`~/.claude/settings.json`、`~/.codex/config.toml`、`~/.agents/`、`~/.local/state/spec-dock/`、launchd の登録、Orca の設定）とほかのリポジトリを変えない。Orca には、許された操作のほかは読む要求だけを送る。
- Orca の authToken とペアリングのコードを、記録、URL、画面、ログ、録画に出さない。
- 判断に迷ったら、統括（Orca の `ask`）か利用者に聞く。PR のマージは利用者が行う。
- 裏で走らせた処理を待つときも、自分の番を終えて止まらず、終わったらそのまま次の手順に進む。

## 仕様の扱い

`spec-dock/workspace.json` の `schema_version` が 4 のリポジトリでは、次に従う。

- 仕様は `spec-dock/initiatives/` にある。普通のファイルとして読み書きする。
- 仕様は Git で扱わない（`git add`、`commit`、`stash`、`reset`、`checkout`、`clean` を仕様に使わない）。保存と共有は、1〜2分のうちに自動で行われる。
- 仕様が見えない、またはリンクの異常を示されたときは、`spec-dock canonical link` を実行する。サンドボックスの中で拒否されたら、利用者に、普通の端末での実行を頼む。
- 読み書きを拒否されたときは、`spec-dock canonical status` が示す1行の設定を、利用者に伝える。自分でツールの設定を変えない。
- 検索では、パスを明示する（`rg 語 spec-dock/initiatives/`、コードと一緒なら `rg 語 . spec-dock/initiatives/`）。
- Scope のディレクトリは `spec-dock/initiatives/<区切り>/<ID>/`（区切りは番号の千ごとの範囲。例 `spec-dock/initiatives/00000-00999/iss-00454/`）に平らに並ぶ。場所は `spec-dock scope show <ID> --json` の `path` で確かめる。親、子、依存は、ディレクトリの位置ではなく `spec-dock scope show <ID> --json` で確かめる。
- ID は `<種類>-<番号5桁>` で、コマンドの入力は0埋めしなくてよい（`iss-454` は `iss-00454`）。slug はなく、`scope create` と `scope import github` に `--slug` を付けない。題名は GitHub の題名が正本で、どの言語でもよい。既定のブランチ名は `<ID>`。
- 構造（作成、親子、依存、状態、題名、種類）は、SpecDock のコマンドだけで変える。Scope のディレクトリの名前を変えたり、別のディレクトリの下へ動かしたりしない。親の付け替えは `spec-dock scope move <ID> --parent <親>`（GitHub の親だけが変わり、ディレクトリは動かない）。
- `SCOPE_KIND_CHANGED` で止まったら、種類のラベルを戻すか作り直すかを利用者に確かめ、`recovery` の手順に従う。`work start` が警告 `SCOPE_IN_PROGRESS` を返したら、別のPCで作業中でないかを利用者に確かめる。
- `*.conflict-*` のファイルがあれば、中身を元のファイルに統合してから、そのファイルを消す。
- Claude Code の隔離セッション（`--worktree`）では、仕様を読むだけにする。
- 作業を終えるときは `spec-dock work finish` を使う。保存が確かめられるまで（最大180秒）待つ。確かめられずに止まったら、`spec-dock canonical status` を見る。
- リンクを消すときは `rm spec-dock/initiatives` と書く。末尾に `/` を付けない。mainのチェックアウトで `git clean -ff` を使わない。

利用者向けの用意、ツールの設定の1行、同期が止まったときの扱いは `spec-dock/docs/canonical.md` にある。
