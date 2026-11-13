# orca-web

Orca（stablyai/orca のデスクトップアプリ）の状態を読み、既存のタブを前面に出す、この Mac の小さな Web サービス。
SpecDock のダッシュボードに部品として埋め込む。

- 要対応の受け箱（`/`）：全プロジェクトのエージェントと統括あての連絡を、要対応（許可待ち・入力待ち、統括あての未読の質問と判断の依頼、マージ待ちの PR）、止まっている（CI の失敗、長く出力のない作業中、終了した端末）、動いている、不明、終わった（畳む）の段に分ける。プロジェクトで絞り込め（`?project=<repo の id>`）、各項目から詳細とチャット、Orca で開く（Mac だけ）、PR へ進める。許可の承認や返事はしない（Orca で開いて答える）。
- 状態の API と画面（`/settings`）：repo・worktree・エージェント・オーケストレーションの状態（種類、状態、時刻、親子、PR と CI、取れるときのモデルと推論）。表示する項目を選べる。
- 「Orca で開く」：この Mac の Orca で、指定の worktree の既存のタブを前面に出す。別の画面に1行で置けるボタンの部品がある。
- エージェントの詳細とチャット（読むだけ）：`/embed/agent?id=…` で、エージェントの詳細と会話のログを読む。受け箱の項目と、状態の画面のエージェントの行から開ける。
- 後の予定：確かめたうえで指示を送る（epic-00004 の iss-00013）。

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
| `ORCA_WEB_SETTINGS_FILE` | `~/Library/Application Support/orca-web/settings.json` | 項目の選択の保存先 |
| `ORCA_WEB_STALL_MINUTES` | 30 | 受け箱で、最後の出力からこの分数を過ぎた作業中のエージェントを「止まっている」にする（1〜1440 の整数） |

## 待ち受けと守り

- 待ち受けは 127.0.0.1 と `ORCA_WEB_TAILSCALE_IP` の2つだけ。0.0.0.0 や `::` では待ち受けない。
- 127.0.0.1 で待ち受けられない（ポートの使用中など）ときは、ログに書いて終了コード1で止まる（launchd が起動し直す）。
- Tailscale の IP で待ち受けられない（ログインの直後で Tailscale がまだ動いていないなど）ときは、127.0.0.1 だけで動き、ログに1行を書き、30 秒ごとに試し直す。`GET /api/health` の `listeners` に、アドレスごとの状態（`listening`、`retrying` と誤りの種類）が出る。
- すべての要求で Host を完全一致で確かめる（`127.0.0.1:<port>`、`localhost:<port>`、`<Tailscale の IP>:<port>`。違えば 421）。
- 書き込み（`POST /api/open`、`PUT /api/settings/fields`）は、同じオリジンの JSON と、`POST /api/token` が出す短期のトークン（`X-Orca-Web-Token`）を要する。書き込みに CORS は付けない。
- 会話の API（`GET /api/transcript`、`GET /api/transcript/events`）と受け箱の API（`GET /api/inbox`）は同じオリジンだけに読ませ、CORS を付けない（別のオリジンは 403）。
- 受け箱は、オーケストレーションの連絡を `orca orchestration check --peek --terminal run:<id>` だけで読み、判断の門を `gate-list` で読む。統括の連絡を既読にしない（読む口は `--peek` のない check と `--ack`・`--all` などを送らずに拒む）。連絡は受け箱を見る人がいる間だけ読む。
- Orca の authToken と書き込みのトークンを、ログ、URL、画面に出さない。会話の記録のパスを応答に出さない。

## SpecDock のダッシュボードに置く

### 状態を読む

SpecDock の画面（`ORCA_WEB_READ_ORIGINS` のオリジン）から、読み取りの CORS で読める。SpecDock の画面と同じ名前（127.0.0.1 か Tailscale の IP）の orca-web を読む。

```js
const res = await fetch('http://127.0.0.1:8791/api/state');   // Tailscale なら http://<IP>:8791/api/state
const state = await res.json();   // schema: "orca-web.state/v1"。worktree ごとに path、branch、id。エージェントは paneKey
```

- `GET /api/fields`：表示できる項目の一覧と、選んだ項目。
- Orca に届かないときも 200 で、`connection.state: "unreachable"` と、取得元ごとの最後に読めた時刻（鮮度）を返す。

### 「Orca で開く」のボタン

SpecDock の画面に1行のスクリプトを置く。スクリプトが自分の位置に iframe のボタンを差し込む。状態の画面やチャットは読み込まない。

```html
<script src="http://127.0.0.1:8791/embed/open-button.js"
        data-worktree="<worktree の ID かパス>" data-agent="<paneKey（任意）>"
        data-theme="dark" data-size="sm"></script>
```

- `data-worktree`（必須）：Orca の worktree の ID かパス。`data-agent`（任意）：エージェントの paneKey（`<parentTabId>:<leafId>`）。なければ最後に動いたエージェント、最後に見ていたタブ、worktree だけ、の順に選ぶ。
- `data-theme`（`light`、`dark`、なければ親の色の明暗）、`data-size`（`sm`、`md`）、`data-width`（既定 260）。
- 置ける画面は `ORCA_WEB_READ_ORIGINS` のオリジンだけ（`frame-ancestors`）。
- 親の画面の幅が 390px 以下の間は、ボタンを出さず、読み込まない（スマホでは出ない）。
- 押すと、この Mac の Orca で既存のタブを前面に出す。新しいタブやファイルは作らない（スリープ中のエージェントの復元と、タブのない worktree を選んだときに Orca が作る最初の端末は、Orca の通常の動きとして起こりうる）。

### エージェントの詳細とチャット（読むだけ）

SpecDock の画面に iframe で置く。iframe の中は orca-web のオリジンなので、会話の API を同じオリジンで読む。

```html
<iframe src="http://127.0.0.1:8791/embed/agent?id=<エージェントの id を URL の符号にしたもの>"
        title="エージェント" style="border:0;width:100%;height:640px"></iframe>
```

- `id`：状態の API のエージェントの `id`（端末のタブは paneKey、構造化 Chat は `chat:<タブの id>`）。`theme`（`light`、`dark`）も渡せる。
- 上に詳細（題名、worktree、種類、状態、モデルと推論とその意味、親と子、PR と CI、Orca で開く）、下に会話。幅 390px 以下では詳細を畳んで始め、Orca で開くを出さない。
- 会話は、指示と返答の吹き出し、折り畳んだツール、Orca の知らせの行。思考は出さない。画像や未知の部分は「表示できない」と示す。読めないときは、空の会話ではなく理由を示す。送信の欄はない。
- 置ける画面は `ORCA_WEB_READ_ORIGINS` のオリジンだけ（`frame-ancestors`）。

会話の API：

- `GET /api/transcript?agent=<id>&limit=<1〜200>&before=<前の応答の before>`：会話の末尾（`schema: "orca-web.transcript/v1"`）。`before` で古いページを読む。セッションが変わっていれば 409 `session_changed`。読めないときは `agent_not_found`・`no_session`・`transcript_not_found`（404）、`unsupported`（501）、`unreachable`・`busy`（503）、`read_failed`・`unknown_shape`（502）。
- `GET /api/transcript/events?agent=<id>`：Server-Sent Events。`snapshot`（文書）、`appended`（足された件と、同じ id で中身が変わった件）、`replacement`（全体の置き換え。前のページも捨てる）、`unavailable`（読めない理由）。Orca の Unix ソケットは購読の口を受けないので、サーバーが 1.5 秒ごとに末尾を読み直して差を作る。同じエージェントを見る画面は読みを共有する。

### スマホ（tailnet）

SpecDock のダッシュボードを Tailscale のアドレスで開くと、状態は `http://<Tailscale の IP>:8791/api/state` から読める。開くボタンは幅 390px 以下では出ない。

## 開発

```sh
npm test            # node --test（Orca を起動しない。Orca の応答は録画の再生）
npm run lint        # biome と型の検査
npm run build       # dist/ に出す（常駐はこれを動かす）
npm run probe:live  # この Mac の Orca で読むだけの確かめ（集計だけ）
npm run open:live   # この Mac の Orca で開く口を確かめる（このリポジトリの worktree だけ）
npm run transcript:live  # この Mac の Orca で会話を読むだけで確かめる（件数と結論だけ）
```

設計と調査の記録は SpecDock の Scope（`spec-dock/initiatives/`）にある。
