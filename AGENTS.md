# AGENTS.md

orca-web は、この Mac の Orca（stablyai/orca のデスクトップアプリ）の状態を読み、既存のタブを前面に出し、後には会話を読んで指示を送る、小さな Web サービスです。SpecDock のダッシュボードに部品として埋め込みます。

## プロジェクトの形

- Node.js 24（LTS、版は `.node-version`）と TypeScript。TypeScript は Node の型の剥がしで直接動かします。erasable な構文だけを使います（`enum`、`namespace`、引数のプロパティは使わない）。相対の import は `.ts` の拡張子を付けます。
- `src/orca/`：Orca のアダプター。Orca に触るのはここだけです。
  - `cli.ts`：CLI の境界（`CliRunner`、`NodeCliRunner`、`buildManagedEnv`）。絶対パス、引数の配列、管理した環境変数で呼びます。
  - `orca-cli.ts`：`--json` の封筒を型の結果（`CliOutcome`）に解く `OrcaCli`。
  - `runtime.ts`、`rpc.ts`：`orca-runtime.json` の口と、内部の Unix ソケットの RPC の境界（`UnixSocketRpc`、読む RPC だけを送る `ReadOnlyRpc`）。authToken は `RuntimeEndpoint` の中だけに持つ。
  - `capabilities.ts`：機能ごとの確かめ（`probeCapabilities`、runtime の ID ごとに覚える `CapabilityCache`）。
  - `read-state.ts`：状態の API のための読み取り。取得元ごとに読み、ページを最後まで読み、決めた項目だけに減らす（プロンプトや本文は拾わない）。
  - `open-target.ts`、`open-gates.ts`、`open.ts`：「Orca で開く」。タブの選び方（純な関数）、門（`OpenOrcaCli`、`OpenRpc`。読む操作と、`terminal switch`・`session.tabs.activate`・`worktree.activate` の `navigation: "host"` だけを通す）、開く処理（`OpenService`）。タブやファイルを作る操作を送る経路を足さないでください。
  - `wiring.ts`：実物の Orca につなぐ組み立て（サーバーと実機の確かめの道具が共有する）。
  - `replay/`：録画と再生（`ReplayCliRunner`、`ReplayRpcTransport`、仮名化と検査の `sanitize.ts`）。
- `src/state/`：状態の API の中身。`normalize.ts`（正規化した文書 `orca-web.state/v1` の組み立て。型は `model.ts`）、`poller.ts`（共有のポーリング。Orca を読むのはここだけ）、`fields.ts`（表示できる項目の一覧）、`settings.ts`（項目の選択の保存）。
- `src/server/`：HTTP の入口。
  - `app.ts`：道。`GET /api/health`（`pid` と待ち受けの状態）、`GET /api/state`、`GET /api/fields`、`PUT /api/settings/fields`、`POST /api/token`、`POST /api/open`、`/embed/*`、静的な画面。
  - `guard.ts`：書き込みの守り（Host の完全一致、同じオリジンの JSON、短期のトークン `TokenStore`）。すべての道で Host を確かめ、書き込みに CORS を付けない。
  - `config.ts`：環境変数（`PORT`、`ORCA_BIN`、`ORCA_WEB_TAILSCALE_IP`、`ORCA_WEB_READ_ORIGINS`、`ORCA_WEB_SETTINGS_FILE`）を読み、誤りは `ConfigError`。
  - `listen.ts`：待ち受け。127.0.0.1 と Tailscale の IP の2つだけで、いつもアドレスを付けて listen する（0.0.0.0 や `::` にしない）。Tailscale の IP で待ち受けられなければ 127.0.0.1 だけで続けて試し直す。
  - `main.ts`：起動（設定の誤りは終了コード2、127.0.0.1 で待ち受けられなければ 1、SIGTERM と SIGINT で 0）。
- `src/service/launchd.ts`：LaunchAgent（ラベル `io.github.chemitaro.orca-web`）の定義の組み立てと操作（`ServiceManager`）。入口は `src/tools/service.ts`。
- `src/tools/`：実機の確かめ（`probe-live.ts`、`open-live.ts`）、録画、常駐の命令（`service.ts`）の道具。
- `web/`：状態の画面（素の ES Modules。ビルドしない）。表の組み立ては純粋な関数の `view.js`、書き込みのトークンの扱いは `write.js`。ボタンの部品は `web/embed/`（1行のスクリプト `open-button.js` と、iframe の `open-button.html`・`open-button-frame.js`・`open-button.css`）。
- `test/`：`node:test` のテストと、録画の fixture（`test/fixtures/`、状態の API の手書きの録画は `test/state/fixture.ts`）。
- 依存は devDependencies（`typescript`、`@types/node`、`@biomejs/biome`）だけです。実行時の依存を足さないでください。

## テストの実行

```sh
npm ci
npm test            # node --test "test/**/*.test.ts"
npm run lint        # biome check と tsc --noEmit（型の検査）
npm run build       # tsc で dist/ に出す
npm run format      # biome で整形する
npm run probe:live  # この Mac の Orca で読むだけの確かめ（集計だけを出す）
npm run open:live   # この Mac の Orca で開く口を確かめる（前面を切り替える。このリポジトリの worktree だけ）
npm start           # http://127.0.0.1:8791/ で状態の API、画面、開く口を出す
npm run service:install -- --dry-run   # LaunchAgent の定義と命令を見るだけ（何も書かない）
```

`npm run service:install`、`service:uninstall`、`service:restart` は利用者の launchd の登録を変えます。エージェントは実行しないでください（`--dry-run` と `service:status` は読むだけ）。本物の登録は利用者か統括が行います。

1つのファイルだけを走らせるときは `node --test test/orca/cli-runner.test.ts` のように呼びます。テストは Orca を起動しません。Orca の応答は録画の再生で与えます。CI（`.github/workflows/ci.yml`）は PR と main への push で lint、テスト、ビルドを走らせます。

## 守ること

- Git：コミットは `git-commit` スキル（`git add -- <パス>` の後に `git-autocommit`）。日本語の Conventional Commits。`git config user.name`／`user.email` が `chemitaro`／`84865385+chemitaro@users.noreply.github.com` であることを確かめる。`--no-verify`、強制 push、履歴の書き換え、マージ、`main` への直接の push、タグの作成をしない。PR は `Refs #<番号>`（自動で閉じる語は使わない）。
- リポジトリは公開。秘密、トークン、`.env`、利用者の私的なプロンプトの文、絶対パスの個人の情報を、コミット、録画、ログに入れない。
- 利用者の環境（`~/.claude/settings.json`、`~/.codex/config.toml`、`~/.agents/`、`~/.local/state/spec-dock/`、launchd の登録と `~/Library/LaunchAgents`、Orca の設定）とほかのリポジトリを変えない。Orca には、許された操作のほかは読む要求だけを送る。開く口の実機の確かめ（`open:live`）は、このリポジトリの worktree だけを対象にする。
- Orca を止めて確かめない（ほかのエージェントが止まる）。Orca に届かないときは、`ORCA_BIN` を存在しないパスにした一時の起動で確かめる。
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
