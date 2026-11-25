# orca-web

Orca（stablyai/orca のデスクトップアプリ）の状態を読み、既存のタブを前面に出す、この Mac の小さな Web サービス。
SpecDock のダッシュボードに部品として埋め込む。

- 要対応の受け箱（`/`）：全プロジェクトのエージェントと統括あての連絡を、要対応（許可待ち・入力待ち、統括あての未読の質問と判断の依頼、マージ待ちの PR）、止まっている（CI の失敗、長く出力のない作業中（バックグラウンドタスクの監視中は除く）、終了した端末）、動いている、不明、終わった（畳む）の段に分ける。プロジェクトで絞り込め（`?project=<repo の id>`）、各項目から詳細とチャット、Orca で開く（Mac だけ）、PR へ進める。許可の承認や返事はしない（Orca で開いて答える）。
- 指揮の画面（`/apexes`）：親のない頂点のエージェント（統括や単独のエージェント）だけを、対応が必要（頂点か、端末が開いているメンバーの許可待ち・入力待ち。メンバーは 20 秒の猶予の後）、作業中（チームの誰かが動いている。頂点が終わっていても配下が動いていれば作業中）、完了の3つで並べる。完了は最近（24 時間以内）、以前の完了、眠っている（復元待ちか、7 日動きがない）に分けて畳む。状態が分からない頂点は完了にせず「確かめられない」の札を付ける（24 時間動きがなければ眠っている）。配下（`parentPaneKey` でたどれるメンバー）の数と、親の見つからないエージェント（結べない仕事）を出す。子のタブが閉じた後も、Run と世代ごとの task の束で配下を結び、配下の数に含める（構造化 Chat の統括は、orca-web を起動し直すと、子のタブが残っていない束を結べず「結べない仕事」に出る）。対応が必要には、配下の答えていない質問・判断、止まった仕事、統括のタブが閉じたのに仕事が残る、新しい失敗も入る（Orca の読みが古い間は最後の判定を保つ）。完了の頂点には、マージ待ちの PR、CI の失敗、失敗した作業者、残りの task の札を付ける。行を押すと、同じ画面の右に頂点の詳細とチャットが出て、そのまま頂点に送れる（幅 900px 未満は1列で、選ぶと会話が全面に出て「← 一覧」で戻る。行の小さなリンクから新しいタブでも開ける）。選んだ頂点は `?apex=<id>` で覚える。会話の上には、チームのある頂点だけ「チーム n（作業中 a・待ち b・完了 c・失敗 d）」の畳める帯を出す（状態の分からないメンバーがいれば「不明 e」を足す）。開くと、配下の Dispatch を作られた順に1つずつの小さな四角で並べた履歴の帯（押すとその節へ）と、配下の階層（途中のタスク担当を含む）の字下げの木（状態、題名、経過）が出る。木には、動いている・待っている・状態の分からない節と 24 時間以内の失敗（とその祖先）だけを出し、ほかの終わった節は親ごとに「完了 n」にまとめて押すと開く。エージェントの節を押すと、その会話を新しいタブで読める。完了してまだ見ていない頂点に新着の点を出す（頂点を 10 秒以上出し続けると消える。見た記録はブラウザの中だけ）。見出しの数は段の件数。`?project=<repo の id>` で絞り込める。タブの題名に対応が必要の数を出し、対応が必要が1つ以上なら favicon に赤い印を付ける。見えない間は読まない。通知を許可したタブ（`https` か `localhost` の安全なコンテキストのブラウザだけ。見出しの「通知を許可」を押すと聞かれる。Tailscale の `http` では出ない）では、見えない間も 30 秒ごとに読み、隠れている間に対応が必要に入った頂点を、頂点と理由の組ごとに1回だけデスクトップに通知する（本文は頂点の題名と理由の言葉だけ。押すとその頂点を選ぶ）。開いた時に既に対応が必要だった頂点、1回の読みだけのもの、Orca を読めない（古い値）か読みに失敗した直後は通知しない。通知は画面を開いている間だけ。
- オーケストレーションの木（`/runs/<id>`）と Run の一覧（`/runs`）：Run ごとに、統括を根に作業者の親子（task の親子）を1本の木で出す。各節に役割、Issue、題名、種類、モデル（作業者は起動時の値）、推論、状態、経過、プロジェクトを出し、取れない値は「—」。作業者の worktree が統括と別のプロジェクトなら札を付ける。オーケストレーションで起動していないエージェントは入れない。統括は、Run の `coordinator_handle` が閉じた端末なら、親のない task を最近作った今ある端末から決める。
- プロジェクトの画面（`/projects/<repo の id>`）：そのプロジェクトの受け箱と、そこに節が1つでもある Run。統括が別のプロジェクトにいる Run に「<プロジェクト> の統括から」の札を付ける。
- 状態の API と画面（`/settings`）：repo・worktree・エージェント・オーケストレーションの状態（種類、状態、時刻、親子、PR と CI、取れるときのモデルと推論）。表示する項目を選べる。
- 「Orca で開く」：この Mac の Orca で、指定の worktree の既存のタブを前面に出す。別の画面に1行で置けるボタンの部品がある。
- エージェントの詳細とチャット：`/embed/agent?id=…` で、エージェントの詳細と会話のログを読み、普通のチャットのように入力欄から指示を送る（送信は設定で有効にしたときだけ。宛先は内部で確かめる）。受け箱の項目と、状態の画面のエージェントの行から開ける。エージェント（AI）側の発言は Markdown（見出し、段落と改行、太字・斜体・取り消し線、行内のコード、言語つきのコードの塊、入れ子・番号付き・チェックの箇条書き、引用、GFM の表（セルの中の `\|` は、行内のコードの中でも文字の `|`。GitHub の GFM と同じ）、横線、リンク）として描く。描く部品は自前の小さなもので、HTML を解かず（要素は createElement と textContent で作る）、Markdown の中の生の HTML と、http・https のほかの URL（`javascript:`、`data:` など）は文字のまま出す。画像はリンクとして出す。本人の発言、ツールの行と道具の出力（会話の role tool の件の本文）、質問・承認のカードは今のとおり文字で出す。参照式のリンク、Setext の見出し、字下げのコード、HTML の実体参照、コードの色付けは扱わない（文字のまま出る）。

## 必要なもの

- macOS と Orca のデスクトップアプリ（CLI は `/Applications/Orca.app/Contents/Resources/bin/orca`）
- Node.js 24（版は `.node-version`）
- 任意：Tailscale（tailnet の自分の端末から読むとき）

## 手元で動かす

```sh
npm ci
npm start           # http://127.0.0.1:8791/ が受け箱、/settings が状態の表（ターミナルを閉じると止まる）
```

## 常駐させる（launchd）

この Mac の利用者のサービス（LaunchAgent、ラベル `io.github.chemitaro.orca-web`）として常駐させる。ログインのときに起動し、止まったら 10 秒の後に起動し直す。
**main のチェックアウトから入れる**（定義は、入れたチェックアウトの `dist/server/main.js` と、入れたときの node の絶対パスを指す。消す予定の worktree から入れない）。

```sh
npm ci
node src/tools/service.ts install --dry-run   # 書く定義と送る命令を見るだけ（ビルドせず、何も書かない。dist/ がなければ先に npm run build）
npm run service:install                # ビルドして、定義を書き、読み込み、/api/health を待つ
npm run service:status                 # 読み込みの状態（state、pid、last exit code）と待ち受けの状態
npm run service:restart                # ビルドして、起動し直す（コードを更新した後）
npm run service:uninstall              # 外して定義を消す（ログと項目の選択の設定は残す）
```

- 定義：`~/Library/LaunchAgents/io.github.chemitaro.orca-web.plist`
- ログ：`~/Library/Logs/orca-web/service.log`（起動、待ち受けの変化、設定の誤りだけを書く。要求の中身やトークンは書かない）
- 項目の選択の設定：`~/Library/Application Support/orca-web/settings.json`
- `install` は、同じポートの別のプロセスの答えを成功と見なさない（`/api/health` の `pid` と launchd のサービスの pid を照らす）。答えないときはログの置き場を示して失敗する。
- node の版を替えた（nodenv などで古い版を消した）とき、Tailscale の IP が変わったとき、リポジトリを動かしたときは、`npm run service:install` で入れ直す。

### 入れるときの引数

| 引数 | 既定 | 意味 |
|---|---|---|
| `--port N` | 8791 | 待ち受けのポート |
| `--tailscale-ip IP\|auto\|none` | `auto` | Tailscale の IPv4。`auto` は `tailscale ip -4` の 100.64.0.0/10 のアドレス。取れなければ 127.0.0.1 だけで待ち受ける定義にし、そう出す |
| `--read-origins O,...` | （サーバーの既定） | SpecDock のオリジン。書けば `ORCA_WEB_READ_ORIGINS` になる |
| `--orca-bin PATH` | Orca.app の CLI | Orca の CLI の絶対パス |
| `--settings-file PATH` | （サーバーの既定） | 項目の選択の保存先の絶対パス |
| `--dry-run` | ― | 定義と命令を出すだけ |

値はサーバーと同じ規則で確かめ、誤りなら何も書かずに止まる（終了コード2）。

## 設定（環境変数）

サーバーは環境変数で設定を受ける。常駐では、定義の `EnvironmentVariables` に書かれる。

| 変数 | 既定 | 意味 |
|---|---|---|
| `PORT` | 8791 | 待ち受けのポート |
| `ORCA_WEB_TAILSCALE_IP` | なし | Tailscale の IPv4。あれば 127.0.0.1 と並べて待ち受け、その Host を許す。0.0.0.0、ループバック、IPv6 は拒む |
| `ORCA_WEB_READ_ORIGINS` | `http://127.0.0.1:47800`（と `http://<Tailscale の IP>:47800`） | SpecDock のオリジン（カンマ区切りの正確なオリジン）。読み取りの CORS と、画面とボタンの `frame-ancestors` に使う |
| `ORCA_BIN` | `/Applications/Orca.app/Contents/Resources/bin/orca` | Orca の CLI の絶対パス |
| `ORCA_WEB_SETTINGS_FILE` | `~/Library/Application Support/orca-web/settings.json` | 項目の選択と、送信の有効・無効（`sendEnabled`）の置き場 |
| `ORCA_WEB_SENDS_DIR` | `~/Library/Application Support/orca-web/sends/` | 送信の記録の置き場（ディレクトリ 0700、`sends.jsonl` は 0600） |
| `ORCA_WEB_STALL_MINUTES` | 30 | 受け箱で、最後の出力からこの分数を過ぎた作業中のエージェントを「止まっている」にする（1〜1440 の整数） |

## 待ち受けと守り

- 待ち受けは 127.0.0.1 と `ORCA_WEB_TAILSCALE_IP` の2つだけ。0.0.0.0 や `::` では待ち受けない。
- 127.0.0.1 で待ち受けられない（ポートの使用中など）ときは、ログに書いて終了コード1で止まる（launchd が起動し直す）。
- Tailscale の IP で待ち受けられない（ログインの直後で Tailscale がまだ動いていないなど）ときは、127.0.0.1 だけで動き、ログに1行を書き、30 秒ごとに試し直す。`GET /api/health` の `listeners` に、アドレスごとの状態（`listening`、`retrying` と誤りの種類）が出る。
- すべての要求で Host を完全一致で確かめる（`127.0.0.1:<port>`、`localhost:<port>`、`<Tailscale の IP>:<port>`。違えば 421）。
- 書き込み（`POST /api/open`、`PUT /api/settings/fields`）は、同じオリジンの JSON と、`POST /api/token` が出す短期のトークン（`X-Orca-Web-Token`）を要する。書き込みに CORS は付けない。
- 会話の API（`GET /api/transcript`、`GET /api/transcript/events`）と受け箱の API（`GET /api/inbox`）、頂点の一覧の API（`GET /api/apexes?project=`）、木と一覧の API（`GET /api/runs?project=`、`GET /api/runs/<id>/tree`）は同じオリジンだけに読ませ、CORS を付けない（別のオリジンは 403）。
- 受け箱は、オーケストレーションの連絡を `orca orchestration check --peek --terminal run:<id>` だけで読み、判断の門を `gate-list` で読む。統括の連絡を既読にしない（読む口は `--peek` のない check と `--ack`・`--all` などを送らずに拒む）。連絡は受け箱を見る人がいる間だけ読む。読む Run は、`updated_at` が7日以内の Run に加えて、生きている worker がいる Run、統括の端末が今ある Run、task の作成か完了が7日以内の Run（最大 50。動いている Run を先に選ぶ）。連絡と判断の門の時刻は ISO 8601 の UTC にそろえる。
- 送信の口（`POST /api/send/intent`、`POST /api/send/confirm`）は、書き込みと同じ守り（同じオリジンの JSON と短期のトークン）を要し、CORS を付けない。送れるかの口（`GET /api/send/status`）と送信の照会（`GET /api/send/<操作の ID>`）は同じオリジンの読みだけ（`Sec-Fetch-Site` が cross-site・same-site なら 403）。守りで拒んだ送信の要求は送信の記録に書かず、件数だけをログに出す。
- Orca の authToken と書き込みのトークンを、ログ、URL、画面に出さない。会話の記録のパスを応答に出さない。サーバーのログに送った本文を出さない。

## SpecDock のダッシュボードに置く

### 状態を読む

SpecDock の画面（`ORCA_WEB_READ_ORIGINS` のオリジン）から、読み取りの CORS で読める。SpecDock の画面と同じ名前（127.0.0.1 か Tailscale の IP）の orca-web を読む。

```js
const res = await fetch('http://127.0.0.1:8791/api/state');   // Tailscale なら http://<IP>:8791/api/state
const state = await res.json();   // schema: "orca-web.state/v1"。worktree ごとに path、branch、id。エージェントは paneKey
```

- `GET /api/fields`：表示できる項目の一覧と、選んだ項目。
- Orca に届かないときも 200 で、`connection.state: "unreachable"` と、取得元ごとの最後に読めた時刻（鮮度）を返す。

### 稼働の印（worktree ごとの要約）

`GET /api/worktrees/summary` は、エージェントが1つ以上いる worktree ごとに、エージェントの数と状態を返す小さな文書（`orca-web.worktree-summary/v1`）。SpecDock の構造の図に丸を描くために使う。読み取りの CORS は `/api/state` と同じ（`ORCA_WEB_READ_ORIGINS` のオリジンだけ。ほかのオリジンは 403）。

```js
const res = await fetch('http://127.0.0.1:8791/api/worktrees/summary');
const summary = await res.json();
// summary.worktrees[i]: { id, path, branch, project: {id, name} | null, issue, main, counts, agents }
// counts: { working, blocked, waiting, done, sleeping, unknown, total }
// agents[j]: { id, mark, workingMode, agentType, since, detail, elapsedFrom, elapsedBasis, parent, startedAt }   detail は /embed/agent?id=… の道
// parent: null | { id: string | null, worktreeId: string | null }
```

- `mark` は `working`・`blocked`・`waiting`・`done`・`sleeping`（状態がなく、端末が復元待ち）・`unknown`（知らない値や欠け）。受け箱と同じ決め方。
- `workingMode` は Orca の working の中の形。Orca が `state: working` かつ `workingMode: monitoring`（主エージェントの番は終わり、自分で起こしたシェルのコマンドや Monitor だけを待っている。Orca の画面では「バックグラウンドタスクを監視中」の脈の線の印）とするときだけ `"monitoring"`、ほかは null。`mark` は `working` のままで、`counts.working` に入る。`orca orchestration check --wait` で worker を待つ間は、Orca と同じくただの working。
- `since` はその状態になった時刻（ISO 8601）。作業を終えてからの待ち時間の起点に使える。
- `elapsedFrom` と `elapsedBasis` は経過の時間の起点。`since` があればそれ（`state`：その状態になってから）。スリープと不明で `since` がなければ、その worktree の最後の活動の時刻（`worktree-activity`）。どちらもなければ null。
- `main` は、その worktree がリポジトリの main の worktree か（Orca の `isMainWorktree`）。分からなければ null。
- `parent` は指揮の親。Orca の `worktree ps` の `parentPaneKey` が指すエージェント（その `paneKey` を持つ、自分でないエージェントがちょうど1つ）の `id` と、そのいる worktree の `worktreeId`（同じ要約の `worktrees[].id`）。Orca が親を出していなければ null。親を出しているのに見えない（一致がない、2つ以上ある）ときは `{ id: null, worktreeId: null }`。推測で結ばない。
- `startedAt` は状態が変わっても動かない開始の時刻（ISO 8601）。Orca の端末のタブの `firstStateStartedAt`（なければ状態の履歴の先頭）、それがない構造化 Chat などは orca-web が初めて見たときの状態の始まりの時刻（orca-web を立て直すと覚え直す）。どちらもなければ null。
- 会話や連絡の本文、タブの題名、最後の一言は返さない。Orca に届かないときも 200 で、`stale` と `connection.state` で示す。

### 「Orca で開く」のボタン

SpecDock の画面に1行のスクリプトを置く。スクリプトが自分の位置に iframe のボタンを差し込む。状態の画面やチャットは読み込まない。

```html
<script src="http://127.0.0.1:8791/embed/open-button.js"
        data-worktree="<worktree の ID かパス>" data-agent="<paneKey（任意）>"
        data-theme="dark" data-size="sm" data-label="none"></script>
```

- `data-worktree`（必須）：Orca の worktree の ID かパス。`data-agent`（任意）：エージェントの paneKey（`<parentTabId>:<leafId>`）。なければ最後に動いたエージェント、最後に見ていたタブ、worktree だけ、の順に選ぶ。
- `data-theme`（`light`、`dark`、なければ親の色の明暗）、`data-size`（`sm`、`md`。既定 `md`）、`data-label`（`none` ならアイコンだけの正方形）、`data-width`（幅の上書き）。
- 見た目は Orca のロゴと `Open` の小さなボタン1つ（SpecDock の `.chip` の仲間。1px の線、角丸 `--ds-radius-s`、字の太さ 700、背景は透明）。iframe の既定の大きさは、文字ありで sm 72×24・md 82×28、アイコンだけで sm 24×24・md 28×28。読み上げの名前は「Open（Orca で開く）」（アイコンだけは「Orca で開く」）、title は「Orca で開く」。
- 押すと、途中は回る印、開けたらチェックの印（2秒で戻る）、開けなかったら線とロゴが琥珀になり title に理由が出る（横に文字を出さない。読み上げには目に見えない status の領域で伝える）。
- 置ける画面は `ORCA_WEB_READ_ORIGINS` のオリジンだけ（`frame-ancestors`）。
- 親の画面の幅が 390px 以下の間は、ボタンを出さず、読み込まない（スマホでは出ない）。
- 押すと、押した端末の Orca で、その worktree を表示してから既存のタブを選ぶ（Orca の左の一覧を押してからタブを押すのと同じ順。`worktree.activate` の後に `terminal switch` か `session.tabs.activate`）。新しいタブやファイルは作らない（スリープ中のエージェントの復元と、タブのない worktree を選んだときに Orca が作る最初の端末は、Orca の通常の動きとして起こりうる）。
- 押した端末は、`POST /api/open` の TCP の元のアドレスで決める（頭は使わない）。
  - loopback か、ホストのネットワークの口が持つアドレス（tailnet のアドレスを含む）なら、ホストの Orca（`navigation: "host"`）。開いた後に `open -b com.stablyai.orca` で Orca を前面に出す（結果の `raised`）。
  - そうでなく、Orca のランタイムの websocket の口に、そのアドレスから確立した接続がある（lsof で読む）なら、接続中のクライアントの Orca（`navigation: "clients"`）。ホストの画面は動かさない。**`clients` は、ホストのランタイムに接続中のすべての端末（ほかのクライアントの PC、iPhone のアプリ）を動かす**（Orca に1台に絞る引数がない）。ボタンは開いた後に `orca://` へ移り、その端末の macOS に Orca を前面に出させる（デスクトップ版の `orca://` は worktree を開かず、前面に出すだけ）。
  - どちらでもなければ開かず `device_not_connected`（「この端末から Orca のホストへの接続が見つかりません」）、接続を読めなければ `device_unknown`。relay で接続する端末と、orca-web を開いたアドレスと違うアドレス（同じ Wi-Fi の LAN、tailnet の IPv6 など）で接続する端末は見分けられない。
- ボタンの iframe は `open-button.js` が作り、sandbox は `allow-scripts allow-same-origin allow-top-navigation-to-custom-protocols`（外部の protocol への移動だけを足す。上の窓のページは移さない）。置く側の画面に sandbox を足す必要はない。
- 結果の文書は `{ok: true, status: "opened", route, reason, worktreeId, device: "host" | "client", screen: "unverified", raised?}`。Orca には窓の今の worktree を読む口がないので、orca-web は切り替わったかを確かめない（`screen: "unverified"`）。ボタンの言葉も「Orca に切り替えを送りました」（クライアントは「この端末の Orca に…」）。worktree の表示の後にタブを選べなかったときは `ok: false` と `worktreeShown: true`。

### エージェントの詳細とチャット

SpecDock の画面に iframe で置く。iframe の中は orca-web のオリジンなので、会話の API を同じオリジンで読む。

```html
<iframe src="http://127.0.0.1:8791/embed/agent?id=<エージェントの id を URL の符号にしたもの>"
        title="エージェント" style="border:0;width:100%;height:640px"></iframe>
```

- `id`：状態の API のエージェントの `id`（端末のタブは paneKey、構造化 Chat は `chat:<タブの id>`）。`theme`（`light`、`dark`）も渡せる。
- 構造化 Chat の1人は、Orca のタブと `worktree ps` の行（paneKey `structured-agent-session-…`）を1つのエージェント `chat:<タブの id>` にまとめて出す（要約、受け箱、Run の木、稼働の印でも1人）。古い形の `id=structured-agent-session-…` は、まとめたエージェントの id へ 302 で転送する。会話と送信の API は `chat:` の id で呼ぶ（古い id には `agent_not_found` を返す）。
- Run の木では、構造化 Chat の作業者の節を、worker-list の `resource.endpointIncarnation`（`structured:<セッション>`）とタブのセッションが同じ chat-tab に結ぶ（同じセッションの worker が2つ以上なら結ばない）。統括の端末が分からない Run の根は、根の task の作業者の `parentPaneKey` が指すエージェント（構造化 Chat の統括）に結ぶ。どちらも結べなければ `agentId` は null のまま。
- 上に題名と「Orca で開く」（埋め込みのボタンと同じ Orca のロゴと `Open` の部品。md）、その下に詳細（worktree、種類、状態、モデルと推論とその意味、親と子、PR と CI）。詳細は幅によらず畳んで始め、押すと開く。詳細の見出しには、稼働の印の部品（`agent-marks.js`）でこのエージェントの状態と種類の印を出す（経過は出さない）。下に会話。幅 390px 以下では Orca で開くを出さない。
- 詳細の中のリンク（親、子、PR）は、どれも新しいタブで開く（`target="_blank"`、`rel="noopener noreferrer"`、新しいタブの小さな印と title「新しいタブで開く」）。iframe の中で別のエージェントの詳細に移らないので、置いた画面が選んだ相手と iframe の中の相手が食い違わない。新しいタブでは iframe でない単独の詳細として開く。
- 見た目は SpecDock のダッシュボードのデザインシステムに合わせる（`--ds-*`・`--sd-*` を先に使い、なければ SpecDock の app.css と同じ値。明暗の両方と `?theme=`）。会話の時刻は `elapsed.js` の短い形（now・5m・3h・2d）で、元の時刻は `title` にある。
- 会話は、指示と返答の吹き出し、折り畳んだツール、Orca の知らせの行、質問のカード（次の節）。思考は出さない。画像と未知の部分は「表示できない」と示す。許可の確認（承認）はカードで出す（下の節）。読めないときは、空の会話ではなく理由を示す。
- 会話の下に入力欄と送るボタンがある（次の節）。送信が止まっている、送る経路が確かめられない、宛先が送れない状態のときは、欄を止めて理由を1行で示す。
- 置ける画面は `ORCA_WEB_READ_ORIGINS` のオリジンだけ（`frame-ancestors`）。

会話の API：

- `GET /api/transcript?agent=<id>&limit=<1〜200>&before=<前の応答の before>`：会話の末尾（`schema: "orca-web.transcript/v1"`）。`before` で古いページを読む。セッションが変わっていれば 409 `session_changed`。読めないときは `agent_not_found`・`no_session`・`transcript_not_found`（404）、`unsupported`（501）、`unreachable`・`busy`（503）、`read_failed`・`unknown_shape`（502）。
- `GET /api/transcript/events?agent=<id>`：Server-Sent Events。`snapshot`（文書）、`appended`（足された件と、同じ id で中身が変わった件）、`replacement`（全体の置き換え。前のページも捨てる）、`unavailable`（読めない理由）。Orca の Unix ソケットは購読の口を受けないので、サーバーが 1.5 秒ごとに末尾を読み直して差を作る。同じエージェントを見る画面は読みを共有する。

### 送る

送信は既定で止まっている。設定のファイル（`ORCA_WEB_SETTINGS_FILE`）に `"sendEnabled": true` を手で書いたときだけ送れる。HTTP からは変えられない。

```json
{ "version": 1, "fields": [ ... ], "sendEnabled": true }
```

- 止める：`sendEnabled` を `false` にするか消す。再起動は要らない（意図と確定と送れるかの口のたびに読み直す）。止めた後、画面の送る欄が止まって理由が出ることを確かめる（項目の選択の保存がちょうど同じ瞬間に重なると、手の書き換えが上書きされうるため）。
- 書き方：Mac などキーボードが主の端末は Enter で送り、Shift+Enter で改行する（Cmd/Ctrl+Enter も送る）。日本語の変換中の Enter では送らない。タッチが主の端末（`(hover: none) and (pointer: coarse)`）は Enter で改行し、送るボタン（または外付けのキーボードの Cmd/Ctrl+Enter）で送る。
- 流れ：画面は、送れるかの口（`GET /api/send/status`）が返す宛先の指紋（`target`。宛先の識別子から作る sha256 の頭 32 文字）を、最初に送れると分かった時に固定する。送る操作の1回で、`POST /api/send/intent`（`{agent, text, target}`。Orca を読み直し、宛先の指紋が固定と違えば 409 `target_changed`／`changed_since_shown` で送らない）と `POST /api/send/confirm`（宛先、Orca の世代、本文、送れる状態を確かめ直し、同じなら1回だけ送る）を続けて送る。意図が返す使い捨ての票と期限は内部だけ。拒まれたら本文を欄に残して理由を1行で示し、送れるかを読み直す。
- 宛先が変わったとき：書いている間に送れるかの口が別の指紋を返すと（同じタブで別のセッション、端末の作り直し、Orca の再起動）、送れなくして「宛先が変わりました」と「新しい宛先で続ける」を出す。押すまで送らない。
- 送る経路：端末の Claude Code、Codex、Antigravity は、Orca CLI の `terminal send --text --enter` と同じ耐久の経路（要求の ID つき）。送る直前に、エージェントがいて権限の確認待ちでないこと、前面のプロセスが宛先のエージェントそのもの（シェルや別のプログラムでない）であること、タブ・端末・セッションが意図のときと同じことを確かめる。前面のプロセスの名前は、Claude は `claude`、Codex は `codex`（`codex-` で始まる名前を含む）、Antigravity は `antigravity`（`agy` の wrapper が起こす本体。Orca 1.4.263・agy 1.5.12 で確かめた）とだけ照合し（`src/orca/send.ts` の1か所の表）、ほかの名前（`agy` を含む）では送らない。端末の宛先にはタブの `providerSession` が要る（Orca の agent launch で起動していない端末は `no_session` で送らない）。端末が意図のときと同じかは、タブの handle（`terminal`）と `incarnationId`（Orca が端末の今の持ち主ごとに出す値）で確かめ、どちらかが変われば送らない。`ptyId` は任意で、意図のときと送る直前の両方にあるときだけ比べる（Orca 1.4.263〜1.4.272 の agent launch で起動した端末のタブは `ptyId` を持たない）。Orca 1.4.263 は端末の Antigravity への送信の受け取りを `provider: unsupported`（エージェントとして確かめない）で返すので、届いても結果はいつも下の「要確認」（結果不明）になる。構造化 Chat は `agentSession.send`（Orca の既定。作業中なら今の turn に合流する）。権限の承認、割り込み、シェルへの代わりの送信はしない。
- 結果は5つ：受け付けた（accepted）、入力を受けた（input_accepted）、送信を確かめた（submitted）、結果不明（unknown）、拒んだ（refused）。端末で Orca がエージェントを確かめずに書いたかもしれないとき、確かめたのと別のエージェントの receipt が返ったときは「要確認」として結果不明にする。
- 届いたら入力欄が空になり「送りました（<結果>）」と出る。要確認の知らせがあれば1行ずつ出る。
- 結果不明は自動で送り直さない。画面は「届いたか分かりません」の帯を出し、帯の間は Enter でも送るボタンでも送らない。帯の「確かめる」（`GET /api/send/<操作の ID>?check=1`）が、端末は `orchestration.requestShow`、構造化 Chat は `agentSession.sendRecorded` で、読むだけの照会をする。記録のない ID は、確定が処理中なら `in_progress`、そうでなければ票を取り消してから `not_sent`（送っていない。後から確定が届いても送らない）。記録のファイルを読めず、この起動のメモリーでも答えられないときは 503 `record_unreadable`（送っていないとは示さない）。照会の結果を記録に書けなかったときは `checkWarning: "check_record_failed"`。帯の「閉じる」は本文を残して書けるように戻す（送り直すかは利用者が決める）。
- Orca の再起動：送る前に、Orca の機能と runtime ID（`orca status`、`orca-runtime.json`、RPC の応答の3つ）が揃っていることを確かめる。揃っていない間（Orca の再起動の途中など）は `unsupported` で送らず、確かめの結果を覚えないので、揃えば orca-web を再起動しなくても送れるようになる。
- 記録：送るたびに、送る前（操作の ID、宛先、本文、時刻、世代）と送った後（結果）を `ORCA_WEB_SENDS_DIR` の `sends.jsonl` に1行ずつ追記する。送る前の記録を書けなければ送らない。記録は自動では消えない。要らなくなったら、サーバーを止めてからファイルを消す。

### 質問に答える

エージェントが選択肢で問う質問（Claude Code の AskUserQuestion、Codex の request_user_input と request_user_input_async）を、会話の中のカードで出す。会話の質問の部分は答え方 `answerVia` を持つ：`rpc`（構造化 Chat の質問）、`keys`（端末のエージェントの質問。キーの列で答える）、`message`（`request_user_input_async`。後の発言で答える）。

- カード：見出し、問い、選択肢（ラベルと説明）、複数選べるかの印、その他の自由入力の欄、「答える」。複数問は1枚に並ぶ。答え済みは選んだ答えを示して閉じ、取り消された質問は「取り消されました」と示して閉じる。選択肢は縦に並ぶ全幅のボタンで、狭い枠や 390px でも押せる。
- 構造化 Chat（Orca のチャットのタブ）の質問は、カードから答えられる。Orca のチャットの画面と同じ RPC `agentSession.respondToQuestion`（項目の itemId と revision の比較つき）で1回だけ送る。単一選択は1つ（その他の文を選ぶと選択を外す）、複数選択は1つ以上、全部の問いに答えがあるときだけ「答える」が押せる。
- 構造化 Chat の Antigravity の質問（質問の道具の呼び出しが Orca の journal の question になる）も、同じ RPC で答える。単一選択、複数選択、その他の文で、答えが届いて作業が続くことを Orca 1.4.263・agy 1.5.12 で確かめた。
- 端末のエージェント（Claude と Codex）の質問は、Orca 自身（デスクトップとモバイル）が打ち込むのと同じキーの列（数字、矢印、Enter、Tab、その他の文の貼り付け）を、Orca と同じ間（1組ごとに 1000ms）で `terminal.send` で1組ずつ送って答える。列は Orca v1.4.261 の `buildAskAnswerKeys`（Claude）と `buildCodexAskAnswerKeys`（Codex）を写した `src/send/keys.ts`。全部の問いに答えがあるときだけ送る。Codex の複数選択と preview の問い、2桁の番号になる問いは答えない（理由と「Orca で開く」）。その他の文は1行で、制御文字を含められない。
  - 送る前に確かめる：会話の記録で同じ callId のツールの結果がないこと、タブの agentStatus（state が waiting か blocked、toolName、interactivePrompt）が同じ質問を出していること、前面のプロセスがそのエージェントであること、同じ質問に前に送り始めた記録がないこと。どれかが外れたら1組も送らない。1組目を含む各組の直前にも、前面のプロセスと画面の質問を読み直し、外れたらそこで止める。
  - 送る途中で組が受けられないか届いたか分からなければ、それ以上送らず、「途中まで送りました（届いたか分かりません）。Orca で確かめてください」と「Orca で開く」を出す。送り始めた質問には、結果によらず二度と送らない（記録から分かるので、起動し直しても同じ）。
  - Orca の画面で同じ質問を途中まで答えた（1問目だけ答えた、行を動かした、文を書きかけた）ことは見分けられない。カードの注に従い、その質問は Orca で続ける。
  - 実機で未確認の前提：画面がその質問を出しているかは、`session.tabs.listAll` のタブの agentStatus の `interactivePrompt` と `toolName`（Orca のソースの型にある）で確かめる。質問を待つ端末のタブでこれが出ることは、実機ではまだ確かめていない。出ない Orca では、端末の質問にはいつも「端末がこの質問を出しているか確かめられません」（`prompt_unverified`）と示し、1組も送らずに止まる（送ったと示さない）。
  - 全部の組が受けられたら「答えを送りました」と示し、同じ callId のツールの結果が現れたら閉じる。結果が失敗（isError）なら「答えずに閉じられた質問」として閉じる。
- 端末の Antigravity の質問には答えない。Orca 1.4.263 自身も Antigravity のキーの列を持たず（端末の Antigravity の待っている問いを答えられない形にする）、Orca の native chat も Antigravity の会話を読まないので、写す元も確かめる手段もない。推測した列は送らず、送れるかの口の `answerKeys` は `agent_keys_unknown` を返す。
- Codex の `request_user_input_async`（すぐ受付を返し、答えを後の発言で受ける質問。端末と構造化 Chat の両方）は、Orca の `formatAskAnswer` と同じ形の発言（答えた問いごとに『> 問い』、空行、答え）を、今の送信の経路で1回送って答える。後の利用者の発言にその引用が現れたら答え済みにする。
- 承認は次の節。
- 答えられないとき（`sendEnabled` が偽、Orca が答えの能力 `agent-session.question-answers.v1` を持たない、宛先が送れない状態）は、カードは読めるが押せず、理由を1行で示す。
- 送る流れ：意図は 30 秒、確定は 60 秒（キーの列は組の間を空けるので 5 分）で時間切れにする。意図の時間切れは送っていないとして押し直せ、確定の時間切れは結果不明（キーの列は「途中まで送りました」の形）にする。確定の応答が 5xx で、送る前の拒みと分かる識別子（`unsupported`・`unknown_shape`・`unreachable`・`record_failed`・`record_unreadable`）でなければ（`internal_error` など）、押し直せる形にせず結果不明にする。
- その他の文は1つ 64KiB まで（Orca と同じ）。答えの口の本文は 640KiB まで受け、画面は答えの JSON が 512KiB を超えるときは送らず「答えが長すぎます（その他の文の合計を短くしてください）」と示す。
- 答える手段は `answerVia` で選ぶ（`web/embed/question-view.js` の `answererFor`：構造化 Chat の手段、キーの列と後の発言の手段 `createCallAnswerer`）。

答えの API（送信と同じ守り：同じオリジンの JSON と短期のトークン、CORS なし、`sendEnabled`）：

- `POST /api/answer/intent`：`{agent, prompt: {itemId, revision}, answers: [{questionId, optionIds, other?}], target?}`。宛先を解き、Orca の会話を読み直して、質問が同じ revision で未回答なこと、答えが問いに合うこと（Orca と同じ条件）を確かめ、使い捨ての票を返す。答え済み・revision 違いは 409 `target_changed`（`question_changed`・`question_gone`）、答えの誤りは 400 `invalid_answer`、端末の宛先は 409 `not_sendable`（`terminal_route`）。
  端末と後の発言の質問は `{agent, callId, answers, target?}`（prompt と callId はちょうど片方）。会話の記録から callId の質問を読み、上の確かめを通ったら票を返す。拒みの理由は `question_gone`・`question_answered`・`prompt_mismatch`（409 `target_changed`）、`already_sent`・`prompt_unverified`・`prompt_unsupported`・`agent_keys_unknown`・`chat_route`（409 `not_sendable`）など。
- `POST /api/answer/confirm`：`{ticket, answers}`。宛先、質問、答えの digest を確かめ直し、送る前の記録を書いてから1回だけ送る。結果は送信と同じ5つ（Orca が答えを付けたら submitted、`agent_session_already_resolved` などで拒めば refused）。
- 照会は送信と同じ `GET /api/send/<操作の ID>?check=1`。質問の今の状態を読み、記録の答えと同じ答えが付いていれば submitted、別の答えなら refused（`resolved_by_other`）、まだ未回答なら unknown（`prompt_pending`）。自動で送り直さない。
- 送れるかの口 `GET /api/send/status` は `answer`（構造化 Chat の RPC）、`answerKeys`（キーの列）、`answerMessage`（後の発言）をそれぞれ `{available, reason}` で返す。`answerKeys` は、Orca が method_not_found を返した RPC のうち、キーの列が使うもの（`terminal.send`・`terminal.agentStatus`・`terminal.inspectProcess` など）だけで止まる（今の送信の照会の `orchestration.requestShow` では止まらない）。
- キーの列の結果：全部の組が受けられたら `input_accepted`（`keys_sent`）、1組目が拒まれたら refused（`not_sent`）、1組目が届いたか分からなければ unknown（`unconfirmed`）、途中で止まれば unknown（`partial_sent`）。detail に送った組の数 `sentGroups` と全部の数 `totalGroups` が付く。照会は会話の記録の今の状態だけを読み（答え済みなら `resolved_unverified`）、送り直さない。
- 記録：答えの送る前の行は `action: "answer"`、`mode`（keys・message。構造化 Chat の rpc の行は mode を持たない）、itemId と revision か callId、問いの数、答えの digest、組の数だけを持ち、答えの中身（選んだ id、ラベル、その他の文、キー、発言の文）を書かない。

### 許可の確認（承認）に答える

エージェントが本人に求める許可の確認を、会話の中のカードで出す。

- カード：題、道具、説明、理由、要るパス、計画の本文と計画のファイル、操作の中身（長ければ下見と「詳しく」）、選択肢のボタン（ラベルと説明、最初の選択肢が主）。答え済みは選んだ選択肢を示して閉じ、取り消されたものは「取り消されました」と示して閉じる。
- 構造化 Chat の承認は、カードから答えられる。Orca のチャットの画面と同じ RPC `agentSession.respondToApproval`（itemId と revision の比較つき、optionId）で1回だけ送る。
- 「常に許可」「常に拒否」のように後の確認を省く選択（intent が `allow_always`・`reject_always`）は、押すと確かめの段（何が以後省かれるかの1行と「<ラベル> で答える」「やめる」）を出し、確かめて初めて送る。サーバーも `confirmPersistent: true` のない意図ではその選択肢を受けない。確かめの段にいる間に送れなくなれば（`sendEnabled` が偽など）、「<ラベル> で答える」は押せず理由を示す（「やめる」は押せる）。
- 端末のエージェントの許可の確認（Claude Code の permission prompt など）は、タブの agentStatus の `interactivePrompt` から道具と要約を読み、会話の最後にカードで出す（待っている間だけ。タブの今のセッションが読んでいる会話のセッションと同じときだけ付け、切り替え直後の古い会話には付けない）。カードから答えられる（端末の Claude Code と Codex。端末の Antigravity は、Orca もキーを持たないので答えない：`agent_keys_unknown`）。選択肢は Orca と同じ「Allow once」（allow_once）と「Reject」（reject_once）の2つだけで、常に許可は出さない（Orca も出さない）。答えは Orca と同じ1キー（許可は `1`、拒否は Escape）を、`terminal.send`（enter 偽、書き込みの受け取りを求める）で1回だけ送る。
  - 許可の確認ごとに同一性 `promptId`（`interactivePrompt` と `stateStartedAt` の digest。`ta_` と16進20字）を持ち、意図と確定のどちらでも、送る前に、宛先のペインのタブの agentStatus が待っていて同じ `promptId` の承認を出していること、前面のプロセスがそのエージェントであること、同じ `promptId` に前に送り始めていないことを確かめる。送る前の記録を書いた後、キーを送る直前にも前面と agentStatus を読み直し、違えば送らない。
  - 確かめられない（`interactivePrompt` がない）なら送らずに止まり、理由と「Orca で開く」を出す（押し直せる）。許可の確認が消えた・変わった、前に送った、切った承認、キーを知らない種類のエージェントでは押し直せない形にする。端末の承認の未回答のカードは、いつも「Orca で開く」を出す。
  - 届いたか分からない（unknown）ときは自動で送り直さず、「届いたか分かりません。Orca で確かめてください」の帯と「Orca で開く」を出す。時間切れと確定の 5xx の扱いは質問の答えと同じ：意図は 30 秒、確定は 60 秒で時間切れにし、意図の時間切れは送っていないとして押し直せ、確定の時間切れと、送る前の拒みと分かる識別子でない確定の 5xx（`internal_error` など）は、この帯（結果不明）にする。送り始めた `promptId` には、結果によらず二度と送らない（起動し直しても記録から分かる）。
  - 送れるかは `GET /api/send/status` の `answerKeys`（端末の質問のキーの組と同じ確かめ）で決める。
  - 残る危険：タブの一覧に `interactivePrompt` が出ない Orca ではカードは出ない（安全側）。送る直前の読みと書き込みの間に許可の確認が変わると、`1` が別の確認を許しうる・Escape が動き出したターンを止めうる（Orca 自身は同じ処理の中で読み直すので、隙間はそれより広い）。端末の実機の確かめは本人の確かめに残してある（iss-00054 の report.md）。
- URL を開く承認と、この版の知らない種類の承認は読むだけ（「Orca で答えてください」と「Orca で開く」）。
- 答えられないとき（`sendEnabled` が偽、Orca が承認の能力を持たない、宛先が送れない状態）は、カードは読めるが押せず、理由を1行で示す。

承認の API（送信と同じ守り）：

- `POST /api/approval/intent`：構造化 Chat は `{agent, prompt: {itemId, revision}, optionId, confirmPersistent?, target?}`、端末は `{agent, promptId, optionId, confirmPersistent?, target?}`（prompt と promptId はちょうど片方）。宛先を解き、Orca の会話を読み直して、承認が同じ revision で未回答なこと、選択肢があること、常に許可・常に拒否なら `confirmPersistent` が真なことを確かめ、使い捨ての票を返す。誤りは質問の答えと同じ状態と理由（選択肢の誤りと未確認は 400 `invalid_answer`）。
- `POST /api/approval/confirm`：`{ticket, optionId}`。確かめ直し、送る前の記録を書いてから1回だけ送る。照会は `GET /api/send/<操作の ID>?check=1`（同じ選択肢が付いていれば submitted、別の選択肢なら refused `resolved_by_other`）。
- 送れるかの口 `GET /api/send/status` は `approval: {available, reason}` も返す。
- 記録：承認の送る前の行は `action: "approval"`、itemId、revision、intent、選択肢の digest だけを持ち、選択肢の id・ラベルと承認の中身を書かない。端末の承認の行は `mode: "keys"`、`route: "terminal"`、promptId、intent、digest、組の数（1）だけで、キーのバイト・道具の名前・要約を書かない。端末の承認の照会は、同じ `promptId` の許可の確認がまだ待っていれば `prompt_pending`、なければ `resolved_unverified`（どちらの答えで抜けたかは分からない）。

### スマホ（tailnet）

SpecDock のダッシュボードを Tailscale のアドレスで開くと、状態は `http://<Tailscale の IP>:8791/api/state` から読める。開くボタンは幅 390px 以下では出ない。

### 稼働の印の部品（アイコン・色・経過の時間）

SpecDock の狭い枠（構造の図の箱、Issue の一覧の行）に、worktree ごとのエージェントの印を描く ES Module の部品。要約を1回読めば、同じ文書から多くの箱や行に描ける。部品の5つのファイル（`/embed/agent-marks.js`、`agent-marks-view.js`、`agent-marks-icons.js`、`agent-marks.css`、経過の表記の `elapsed.js`）は、要約と同じ読み取りの CORS で配る（`ORCA_WEB_READ_ORIGINS` のオリジンだけ。ほかのオリジンからの import は 403 で失敗する）。

```html
<link rel="stylesheet" href="http://127.0.0.1:8791/embed/agent-marks.css" />
<script type="module">
  import { findWorktree, renderAgentMarks, watchWorktreeSummary } from 'http://127.0.0.1:8791/embed/agent-marks.js';
  const watch = watchWorktreeSummary('http://127.0.0.1:8791', {
    onDocument(summary) {
      for (const box of document.querySelectorAll('[data-worktree]')) {
        const worktree = findWorktree(summary, { path: box.dataset.worktree });
        if (worktree) renderAgentMarks(box.querySelector('.marks'), worktree, {
          size: 'sm',   // 小 16px、'md' は 20px
          max: 4,       // 超えた分は「+N」にまとめる
          onSelect: ({ detail }) => openDetail(`http://127.0.0.1:8791${detail}`), // 渡さなければボタンにならない
        });
      }
    },
    onError() { /* 前の描画は残る。古いことを示す */ },
  }); // 既定 10 秒ごと。画面が見えない間は読まない。watch.stop() で止める
</script>
```

- 種類はアイコン（Claude、Codex、Antigravity、Gemini はそれぞれのロゴ、ほかの種類は中立の丸、種類がなければ破線の丸）、状態は SpecDock のダッシュボードと同じ色（作業中 緑で、アイコンのまわりの弧が回る、許可待ち 琥珀、入力待ち 青（SpecDock の「着手できる」）、完了 灰、スリープ 薄い灰の線と月の印、不明 紫）、経過の時間は英語の短い形（1分未満 `now`、`5m`、`3h`、`2d`。週や月には上げない）。読み上げの名前と title は読める日本語の文（例「Claude、作業中、この状態になって 3時間」）。印の並びは、同じ worktree の中で、指揮の関係のないエージェント（同じ worktree に親も子もいない）を左に `startedAt` の新しい順、関係のあるものを右に上流から下流（親 → 子 → 孫の深さ優先、兄弟は新しいものが左）。状態では並べない。`parent`・`startedAt` のない古い要約は要約の順。並びは `orderAgents(agents)`（`agent-marks.js` からも import できる純粋な関数）の1か所で決まる。
- 各印の要素（`.orca-mark`）は、エージェントの id を `data-agent-id` に持つ（id のない印と「+N」にはない）。押した印とエージェントを結ぶのに使える。
- バックグラウンドタスクを監視中（`workingMode: monitoring`）の印は、種類のロゴの右（経過の左）に脈の線の印（lucide の `Activity`）を置き、作業中の輪は出さない（回らない）。色は作業中と同じ緑、読み上げの名前と title の状態の言葉は Orca の日本語の画面と同じ「バックグラウンドタスクを監視中」、経過は作業中と同じ規則。受け箱と Run の木の行にも同じ印と言葉を出す。
- 色だけに頼らないよう、各印は種類、状態、経過とその起点を読み上げの名前（aria-label）と title に持つ。
- 形は SpecDock の `.chip` に合わせる（角丸 4px、1px の線、薄い背景、濃い文字、太さ 700、字体 `--ds-font-sans`）。
- 色は `.orca-marks` の CSS のカスタムプロパティで、状態（`working`・`blocked`・`waiting`・`done`・`sleeping`・`unknown`）ごとに4つ：主 `--orca-mark-<状態>`、背景 `-bg`、線 `-line`、文字 `-ink`（ほかにフォーカスの `--orca-mark-focus`、高さ `--orca-mark-h`）。値は SpecDock の変数（`--sd-doing` など）を先に使うので、SpecDock の中では SpecDock の明暗にそのまま従う。外では同じ値の明暗の既定を使う。
- 作業中の弧は CSS の transform だけで回り（1.2 秒、JS の時計を使わない）、`prefers-reduced-motion: reduce` では止まる。
- 経過の表記は `web/embed/elapsed.js` の1か所（`formatElapsed`：短い形、`describeElapsed`：読める形、`elapsedMs`）。受け箱、Run の木、チャットからも同じ関数を import する（`{ clampFuture: true }` で未来の時刻を now にする）。
- アイコンは `web/embed/agent-marks-icons.js` の表 `AGENT_ICONS` の1か所だけで決まる。差し替えるときはこの表の値だけを変える。
- Claude と Codex（OpenAI）のロゴの SVG は、stablyai/orca（MIT）の `src/renderer/src/components/status-bar/icons.tsx`（コミット `80a514c`）から写した。ロゴは Anthropic・OpenAI の商標。
- Gemini のロゴの形は、stablyai/orca（MIT）の `src/renderer/src/components/status-bar/accounts/provider-icons.tsx` の `GeminiIcon`（コミット `5e7ceb6`）の星の path を写した。Antigravity のロゴの形は、同じコミットの同梱の画像 `src/shared/agent-icons/antigravity.png` の輪郭を写した path。表は単色の塗りだけを持つので、どちらもロゴの主な色の単色にした（Gemini `#3186FF`、Antigravity `#3587FF`）。ロゴは Google LLC の商標。
- 「Orca で開く」の Orca のロゴの SVG は、stablyai/orca（MIT）の `resources/logo.svg`（タグ v1.4.258、コミット `c91a7a6`）から写した。ロゴは Orca（Lovecast Inc.）の商標。
- 状態の印は同じファイルの表 `STATE_ICONS` の1か所。監視中の脈の線は lucide（ISC、lucide-react 0.577.0 の `Activity`。Orca 1.4.258 の `AgentStateDot` の monitoring の印）から写した。

### 試しの画面で確かめる

SpecDock に組み込む前に、3つの部品（稼働の印の要約、開くボタン、詳細とチャットの iframe）を、SpecDock とは別のオリジンの試しの画面で確かめる。常駐の orca-web（8791）と本物の SpecDock（47800）は使わず、変えない。

```sh
npm run trial -- --tailscale-ip <Tailscale の IP>   # IP を省くと 127.0.0.1 だけ（環境変数 ORCA_WEB_TAILSCALE_IP でもよい）
npm run trial -- --dry-run                           # 組んだ環境変数と URL を見るだけ
```

- 起動するもの：試し用の orca-web（8792）、試しの画面（47900。`web/trial/` を `src/tools/trial-host.ts` が配る）、許していないオリジンの画面（47901）。どれも 127.0.0.1 と、指定したときは Tailscale の IP だけで待ち受ける。ポートは `--orca-port`、`--page-port`、`--forbidden-port` で変えられる（8791 と 47800 は使えない）。
- 試し用の orca-web が許すのは試しの画面のオリジン（`http://127.0.0.1:47900` と `http://<Tailscale の IP>:47900`）だけ。設定と送信の記録は `--state-dir`（既定 `.workbench/trial`）の `settings.json` と `sends/` に分ける。常駐の置き場は指定できない。
- 開く URL：`http://127.0.0.1:47900/`（Mac の幅）、`/phone.html`（試しの画面を幅 390px の枠に入れたもの）、`http://127.0.0.1:47901/forbidden.html`（要約の読み、iframe、ボタン、トークン、送る意図、部品の import が拒まれることを示す）。スマホからは `http://<Tailscale の IP>:47900/`。`localhost` の名前では開けない（421）。
- 試しの画面：稼働の印の部品を試しの orca-web から import し、要約を1回読んで、構造の図の箱の見本、Issue の一覧の行の見本、worktree ごとの節（印と、色の点と数の札）を描く。worktree `send-test`（試しの送り先）を先頭に置く。印を押すと、幅 720px より広いときは横の欄、狭いときはその見本や節の下に詳細とチャットの iframe が開く。節ごとに開くボタンを置く（幅 390px 以下では出ない）。
- 送信：試しの `settings.json` は `sendEnabled: false` で作られる。試すときだけ、試しの `settings.json` に `"sendEnabled": true` を手で書く。試しでは試しの送り先（worktree `send-test`）にだけ送り、確かめ終わったら `false` に戻す。
- 止める：`kill -TERM $(cat .workbench/trial/trial.pid)`（前面で動かしたときは Ctrl-C）。試し用の orca-web も一緒に止まる。要らなくなったら `.workbench/trial/` を消す。

## 開発

```sh
npm test            # node --test（Orca を起動しない。Orca の応答は録画の再生）
npm run lint        # biome と型の検査
npm run build       # dist/ に出す（常駐はこれを動かす）
npm run probe:live  # この Mac の Orca で読むだけの確かめ（集計だけ）
npm run open:live   # この Mac の Orca で開く口を確かめる（このリポジトリの worktree だけ）
npm run transcript:live  # この Mac の Orca で会話を読むだけで確かめる（件数と結論だけ）
npm run send:live -- --worktree <検証用の worktree のパス> --handle <端末の handle>  # 実物の Orca に送る確かめ（検証用の宛先だけ。業務中のエージェントに使わない）
```

設計と調査の記録は SpecDock の Scope（`spec-dock/initiatives/`）にある。
