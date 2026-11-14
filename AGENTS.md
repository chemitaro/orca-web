# AGENTS.md

orca-web は、この Mac の Orca（stablyai/orca のデスクトップアプリ）の状態を読み、既存のタブを前面に出し、後には会話を読んで指示を送る、小さな Web サービスです。SpecDock のダッシュボードに部品として埋め込みます。

## プロジェクトの形

- Node.js 24（LTS、版は `.node-version`）と TypeScript。TypeScript は Node の型の剥がしで直接動かします。erasable な構文だけを使います（`enum`、`namespace`、引数のプロパティは使わない）。相対の import は `.ts` の拡張子を付けます。
- `src/orca/`：Orca のアダプター。Orca に触るのはここだけです。
  - `cli.ts`：CLI の境界（`CliRunner`、`NodeCliRunner`、`buildManagedEnv`）。絶対パス、引数の配列、管理した環境変数で呼びます。
  - `orca-cli.ts`：`--json` の封筒を型の結果（`CliOutcome`）に解く `OrcaCli`。
  - `runtime.ts`、`rpc.ts`：`orca-runtime.json` の口と、内部の Unix ソケットの RPC の境界（`UnixSocketRpc`、読む RPC だけを送る `ReadOnlyRpc`）。authToken は `RuntimeEndpoint` の中だけに持つ。
  - `capabilities.ts`：機能ごとの確かめ（`probeCapabilities`、runtime の ID ごとに覚える `CapabilityCache`）。
  - `read-state.ts`：状態の API のための読み取り。取得元ごとに読み、ページを最後まで読み、決めた項目だけに減らす（プロンプトや本文は拾わない）。エージェントの `workingMode` は、状態の値と同じ取得元（タブの agentStatus・chatStatus か ps）から正規化（`normalize.ts`）で事実にする。
  - `open-target.ts`、`open-gates.ts`、`open.ts`：「Orca で開く」。タブの選び方（純な関数）、門（`OpenOrcaCli`、`OpenRpc`。読む操作と、`terminal switch`・`session.tabs.activate`・`worktree.activate` の `navigation: "host"` だけを通す）、開く処理（`OpenService`）。タブやファイルを作る操作を送る経路を足さないでください。
  - `read-mail.ts`：受け箱のための、統括あての連絡（`orchestration check --peek --terminal run:<id>`）と待っている判断の門（`gate-list --run`）の読み取り。決めた項目だけを拾い（本文、質問の本文、options、reportPath は拾わない）、worker_done は本文の PR の URL だけを拾う。`ReadOnlyOrcaCli` は `--peek` のない check と `--ack`・`--all`・`--unread`・`--wait`・`--retry-request` を拒む。統括の連絡を既読にする読み方を足さないでください。
  - `read-transcript.ts`：会話の記録の読み取り（`createTranscriptReader`）。エージェントの id から、Orca がタブに持つセッションの識別子と記録のパスを解き、`nativeChat.readSession`（端末）か `agentSession.history`（構造化 Chat）で読む。タブのない（状態の API で `untabbed` の）エージェントは `no_session`。記録のパスは応答に出さない。
  - `send-gates.ts`、`send.ts`：送信。門（`SendRpc`。読む RPC に `terminal.agentStatus`・`terminal.inspectProcess`・`orchestration.requestShow`・`agentSession.sendRecorded` を足し、書き込みは決めた形の `terminal.send`（`agentPrompt`、要求の封筒の `orchestrationRequestId`）と `agentSession.send`（text の block だけ）だけを通す）と、送る経路のアダプター（送る前の読み、1回だけの送信、結果の5つの分け方、構造化 Chat の指紋、読むだけの照会）。送る経路を足したり、再送の道を足したりしないでください。
  - `wiring.ts`：実物の Orca につなぐ組み立て（サーバーと実機の確かめの道具が共有する）。
  - `replay/`：録画と再生（`ReplayCliRunner`、`ReplayRpcTransport`、仮名化と検査の `sanitize.ts`）。
- `src/state/`：状態の API の中身。`normalize.ts`（正規化した文書 `orca-web.state/v1` の組み立て。型は `model.ts`）、`poller.ts`（共有のポーリング。Orca を読むのはここだけ）、`fields.ts`（表示できる項目の一覧）、`settings.ts`（項目の選択の保存と、`sendEnabled` の読み。`sendEnabled` を HTTP から変える口を作らないでください）。
- `src/send/`：送信の中身。`target.ts`（宛先の解決と比べ方、確認の項目。純な関数）、`ticket.ts`（本文の確かめ、操作の ID、使い捨ての票 `TicketStore`）、`journal.ts`（送信の記録 `orca-web.send-record/v1`。送る前の記録を書けなければ送らない）、`service.ts`（`SendService`：意図、確定、送れるか、照会。票の取り出しと処理中の印は同じ同期の処理で行う）、`model.ts`（型）。
- `src/transcript/`：会話の API の中身。`normalize.ts`（正規化した文書 `orca-web.transcript/v1`。思考は落とす）、`diff.ts`（窓の差分：追記と置き換え）、`hub.ts`（エージェントごとの共有の見張り。Unix ソケットは購読の口を受けないので末尾を読み直す）。
- `src/inbox/`：受け箱の中身。`classify.ts`（`buildInbox` と、エージェントの状態の決め方 `agentMark`。`buildInbox` は状態の文書と連絡の写しと時刻から、段 needs_action・stalled・running・unknown・finished に分ける純粋な関数。`agentWorkingMode` は Orca が state working・workingMode monitoring とするときだけ monitoring を返す1か所の判定で、要約と木も使う。monitoring は出力が止まった（stalled）にしない）、`model.ts`（文書 `orca-web.inbox/v1` の型）。連絡の写しはポーリング（`poller.ts`）が、受け箱を見る人がいる間だけ読む。読む Run は `select-runs.ts`（`selectMailRuns`。最近の Run と、生きている worker・今ある統括の端末・最近の task のある Run）が選ぶ。最後の一言（`lastAssistantMessage`）は受け箱の文書にだけ出し、状態の API には出さない。
- `src/runs/`：木と一覧の中身。`tree.ts`（`buildRunTree`、`buildRunList`。状態の文書だけから、統括を根に worker を task の親子で組み、プロジェクトの札、親が分からない節の `orphan`、一覧の絞り込みと並びを決める純粋な関数）、`model.ts`（文書 `orca-web.run-tree/v1`、`orca-web.runs/v1` の型）。今の統括の端末（`activeCoordinatorHandle`）は状態の正規化（`normalize.ts`）が決める。
- `src/summary/`：稼働の印の要約の中身。`build.ts`（`buildWorktreeSummary`。状態の文書から、エージェントのいる worktree ごとの数と状態の文書 `orca-web.worktree-summary/v1` を組む純粋な関数。状態の決め方は受け箱の `agentMark` と同じ。Orca の working の中の monitoring は `agentWorkingMode` で `workingMode` に出し、mark は working のまま）、`model.ts`（型）。エージェントごとの経過の起点 `elapsedFrom`・`elapsedBasis`（状態の始まり、なければスリープと不明は worktree の最後の活動）もここで決める。
- `src/server/`：HTTP の入口。
  - `app.ts`：道。`GET /api/health`（`pid` と待ち受けの状態）、`GET /api/state`、`GET /api/fields`、`GET /api/worktrees/summary`（稼働の印の要約。状態の API と同じ読み取りの CORS）、`/embed/agent-marks*.js`・`/embed/agent-marks.css`・`/embed/elapsed.js`（印の部品と経過の表記。同じ読み取りの CORS）、`PUT /api/settings/fields`、`POST /api/token`、`POST /api/open`、`GET /api/transcript`、`GET /api/transcript/events`（SSE。同じオリジンだけ）、`GET /api/inbox`（受け箱。同じオリジンだけ、`?project=`）、`GET /api/runs`（Run の一覧。同じオリジンだけ、`?project=`）、`GET /api/runs/<id>/tree`（木。同じオリジンだけ）、`POST /api/send/intent`・`POST /api/send/confirm`（送信。書き込みの守りとトークン）、`GET /api/send/status`・`GET /api/send/<操作の ID>`（送れるかと送信の照会。同じオリジンだけ）、`/runs`・`/runs/<id>`・`/projects/<id>` の画面、`/embed/*`、静的な画面。
  - `guard.ts`：書き込みの守り（Host の完全一致、同じオリジンの JSON、短期のトークン `TokenStore`）。すべての道で Host を確かめ、書き込みに CORS を付けない。
  - `config.ts`：環境変数（`PORT`、`ORCA_BIN`、`ORCA_WEB_TAILSCALE_IP`、`ORCA_WEB_READ_ORIGINS`、`ORCA_WEB_SETTINGS_FILE`、`ORCA_WEB_STALL_MINUTES`、`ORCA_WEB_SENDS_DIR`）を読み、誤りは `ConfigError`。
  - `listen.ts`：待ち受け。127.0.0.1 と Tailscale の IP の2つだけで、いつもアドレスを付けて listen する（0.0.0.0 や `::` にしない）。Tailscale の IP で待ち受けられなければ 127.0.0.1 だけで続けて試し直す。
  - `main.ts`：起動（設定の誤りは終了コード2、127.0.0.1 で待ち受けられなければ 1、SIGTERM と SIGINT で 0）。
- `src/service/launchd.ts`：LaunchAgent（ラベル `io.github.chemitaro.orca-web`）の定義の組み立てと操作（`ServiceManager`）。入口は `src/tools/service.ts`。
- `src/tools/`：実機の確かめ（`probe-live.ts`、`open-live.ts`、`transcript-live.ts`、`send-live.ts`）、録画、常駐の命令（`service.ts`）、SpecDock に渡す部品の試し（`trial.ts`：試し用の orca-web と試しの画面を起動してまとめて止める。`trial-host.ts`：`web/trial/` を決めた表だけ配る静的なサーバー）の道具。
- `web/`：受け箱の画面（`/`。`index.html`、`inbox.js`、組み立ては純粋な関数の `inbox-view.js`、DOM は `inbox-dom.js`）と、状態の画面（`/settings`。`settings.html`）と、木・一覧・プロジェクトの画面（`/runs/<id>` は `run.html`・`run.js`、`/runs` は `runs.html`・`runs.js`、`/projects/<id>` は `project.html`・`project.js`。組み立ては純粋な関数の `runs-view.js`、DOM は textContent だけで描く `runs-dom.js`）（素の ES Modules。ビルドしない）。表の組み立ては純粋な関数の `view.js`、書き込みのトークンの扱いは `write.js`。「Orca で開く」のボタンは、Orca のロゴと Open の共有の部品1つ（`web/embed/open-control.js` の `createOpenControl`・`runOpen`、見た目 `open-control.css`、表示の値と結果の言葉の表は純粋な関数の `open-control-view.js` の1か所。ロゴは `agent-marks-icons.js` の `APP_ICONS`）で、埋め込みのボタン、`/embed/agent` の見出し、受け箱が使う。二重に持たない。埋め込みのボタンは `web/embed/`（1行のスクリプト `open-button.js` と、iframe の `open-button.html`・`open-button-frame.js`・`open-button.css`）。Run の木とプロジェクトの画面には開く操作を置かない。エージェントの詳細とチャットは `web/embed/agent.*`（組み立ては純粋な関数の `agent-view.js`、DOM は textContent だけで描く `agent-dom.js`）。稼働の印の部品は `web/embed/agent-marks*.js` と `agent-marks.css`（SpecDock が別のオリジンから import する ES Module。種類のアイコンの表は `agent-marks-icons.js` の `AGENT_ICONS` の1か所だけ、状態の印（monitoring の脈の線、lucide の Activity）は同じファイルの `STATE_ICONS` の1か所だけ（受け箱と Run の木も `agent-marks.js` の `stateIcon` で描く）。組み立ては純粋な関数の `agent-marks-view.js`、DOM は textContent と createElementNS だけで描き、要約の読みの輪 `watchWorktreeSummary` を持つ。経過の表記（now・5m・3h・2d と読める形）は `elapsed.js` の1か所で、受け箱と Run の木とチャットも使う。この5つのファイルだけに、要約と同じ読み取りの CORS を付けて配る）。送る欄は `web/embed/send-view.js`（状態の移り変わり、入力欄の鍵の扱い `composerKeyAction`、送る流れ。純粋な関数と注入した口だけ。意図と確定を続けて送り、宛先の指紋を固定し、自動で送り直さない）と `send-dom.js`（知らせ、宛先が変わった帯、結果不明の帯。textContent だけ）。見た目は `agent.css` が SpecDock のデザインシステムの変数（`--ds-*`・`--sd-*`）を先に使う。
- `web/trial/`：SpecDock とは別のオリジンの試しの画面（`index.html`、`trial.js`、組み立ては純粋な関数の `trial-view.js`、幅 390px の枠 `phone.html`、許していないオリジンの確かめ `forbidden.html`・`forbidden.js`）。orca-web 自身は配らない（`STATIC_FILES` にない）。`npm run trial` の静的なサーバーだけが配る。
- `test/`：`node:test` のテストと、録画の fixture（`test/fixtures/`、状態の API の手書きの録画は `test/state/fixture.ts`、会話の仮の Orca は `test/transcript/fixture.ts`）。
- 依存は devDependencies（`typescript`、`@types/node`、`@biomejs/biome`）だけです。実行時の依存を足さないでください。

## テストの実行

```sh
npm ci
npm test            # node --test "test/**/*.test.ts"
npm run lint        # biome check と tsc --noEmit（型の検査）
make -s lint-quick FILES="<相対パス…>"  # 編集した分だけの biome check。編集時のフックが自動で呼ぶ
npm run build       # tsc で dist/ に出す
npm run format      # biome で整形する
npm run probe:live  # この Mac の Orca で読むだけの確かめ（集計だけを出す）
npm run open:live   # この Mac の Orca で開く口を確かめる（前面を切り替える。このリポジトリの worktree だけ）
npm run send:live -- --worktree <パス> --handle <handle>  # 実物の Orca に送る確かめ。統括か利用者が用意した検証用の宛先だけに使う
npm run transcript:live  # この Mac の Orca で会話を読むだけで確かめる（件数と結論だけ。会話の中身は出さない）
npm start           # http://127.0.0.1:8791/ で状態の API、画面、開く口を出す
npm run trial       # 試し用の orca-web（8792）と試しの画面（47900、許さないオリジン 47901）を起動する。止めるのは kill -TERM $(cat .workbench/trial/trial.pid)
node src/tools/service.ts install --dry-run   # LaunchAgent の定義と命令を見るだけ（ビルドせず、何も書かない）
```

`npm run service:install`、`service:uninstall`、`service:restart` は利用者の launchd の登録を変えます。エージェントは実行しないでください（`node src/tools/service.ts install --dry-run` と `service:status` は読むだけ。`npm run service:install -- --dry-run` は先にビルドして `dist/` を書き換える）。本物の登録は利用者か統括が行います。

1つのファイルだけを走らせるときは `node --test test/orca/cli-runner.test.ts` のように呼びます。テストは Orca を起動しません。Orca の応答は録画の再生で与えます。CI（`.github/workflows/ci.yml`）は PR と main への push で lint、テスト、ビルドを走らせます。

## 守ること

- Git：コミットは `git-commit` スキル（`git add -- <パス>` の後に `git-autocommit`）。日本語の Conventional Commits。`git config user.name`／`user.email` が `chemitaro`／`84865385+chemitaro@users.noreply.github.com` であることを確かめる。`--no-verify`、強制 push、履歴の書き換え、マージ、`main` への直接の push、タグの作成をしない。PR は `Refs #<番号>`（自動で閉じる語は使わない）。
- リポジトリは公開。秘密、トークン、`.env`、利用者の私的なプロンプトの文、絶対パスの個人の情報を、コミット、録画、ログに入れない。
- 利用者の環境（`~/.claude/settings.json`、`~/.codex/config.toml`、`~/.agents/`、`~/.local/state/spec-dock/`、launchd の登録と `~/Library/LaunchAgents`、Orca の設定）とほかのリポジトリを変えない。Orca には、許された操作のほかは読む要求だけを送る。開く口の実機の確かめ（`open:live`）は、このリポジトリの worktree だけを対象にする。送信の実機の確かめ（`send:live`）は、統括か利用者が用意した検証用の宛先だけに送り、業務中のエージェントには送らない。
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
