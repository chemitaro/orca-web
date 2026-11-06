---
種別: レポート（Issue）
ID: "iss-00007"
関連GitHub: ["#7"]
最終更新: "2026-11-06"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

「Orca で開く」の口と、書き込みの守りと、単独のボタンの部品を作った。

- 書き込みの守り（`src/server/config.ts`、`src/server/guard.ts`、`src/server/app.ts`）
  - 設定（`ORCA_WEB_PORT`、`ORCA_WEB_TAILSCALE_IP`、`ORCA_WEB_SPECDOCK_ORIGINS`、`ORCA_WEB_ORCA_CLI`）から、待ち受けのアドレス（127.0.0.1 と Tailscale の IP だけ）、許す Host、自分のオリジン、SpecDock のオリジンを導く。0.0.0.0、ループバックの重ね、不正なオリジンで起動を止める。
  - すべての要求で Host を完全一致で確かめる（DNS rebinding）。書き込みは POST、`application/json`、`Origin` が `http://<Host>` と完全一致、`Sec-Fetch-Site` があれば `same-origin`、`X-Orca-Web-Token` の有効なトークン、4 KiB 以下、`{ worktree, agent? }` だけの物を要する。CORS の許可は付けない。
  - トークンは `POST /api/token`（同じオリジンの JSON の POST だけ）が出す。256 ビット、10 分、メモリーだけ、64 個まで。inspect と JSON に値を出さない。
- 開く口（`src/orca/open-target.ts`、`src/orca/open-gates.ts`、`src/orca/open.ts`、`src/orca/wiring.ts`）
  - `POST /api/open` は、worktree（ID かパス）を最新の `worktree list` に完全一致で解決し（`truncated` なら `--limit <totalCount>` で読み直す）、`session.tabs.list` から、指定の paneKey → 最後に動いたエージェント（`agentStatus.updatedAt`）→ 最後に見ていたタブ → worktree だけ、の順に1つを選ぶ。
  - 動いている端末は `orca terminal switch --terminal <handle>`、ほかのタブは `session.tabs.activate`（`navigation: "host"`、`intent: "user"`）、worktree だけは `worktree.activate`（`navigation: "host"`）。送るのは1回だけ。
  - 門（`OpenOrcaCli`、`OpenRpc`）が、読む操作と、この3つ（activate は host だけ）のほかを送らずに拒む。タブやファイルを作る操作を送る経路はない。
  - 時間切れ・接続断・不正な応答は `unconfirmed`（504）で、別のタブへ切り替えない。機能の欠け、形の違い、runtime の ID の変化は何も送らずに理由を返す。重なった要求は `busy`。
- ボタンの部品（`web/embed/`）：1行のスクリプト `open-button.js` が自分の位置に iframe を差し込む。親の幅が 390px 以下の間は隠し、読み込まない。iframe（`/embed/open-button`）は CSP（`frame-ancestors` に SpecDock のオリジンだけ、inline なし）で返り、同じオリジンから得たトークンで開く口を呼ぶ。`theme`（light、dark）と `size`（sm、md）を受ける。
- 実機の確かめの道具（`src/tools/open-live.ts`、`npm run open:live`）：作業の場所と同じ repo の worktree だけを対象に、押す前と後の `session.tabs.listAll` を数だけで比べる。
- iss-00005 の FQG-001（`_meta.runtimeId` の食い違いのテスト）と FQG-002（keepalive が時間切れを延ばすテストと、その対照）を足した。

統括の判断（2026-11-06）：タブのない worktree を `worktree.activate` で選ぶと、Orca（v1.4.251 の `ensureWorktreeHasInitialTerminal`）は最初の端末を作る。これはサイドバーで選んだときと同じ通常の動きとして許し（案A）、応答の `mayCreateInitialTerminal: true` で示す。「新しいタブを作る経路を持たない」は、orca-web が作る操作を送らない意味とする。

## 実機の確かめ（書き込み）

2026-11-06、この Mac の Orca 1.4.251（CLI も 1.4.251。ソースの根拠はタグ v1.4.251）。対象は orca-web のリポジトリの worktree（この Issue の作業の worktree と main のチェックアウト）だけ。前面の切り替えは、各回の後の画面の写し（scratchpad で見て消した。保存していない）で確かめた。

| # | 対象 | 経路の選び方 | 経路 | 結果 | 前面 | タブ（全体） | タブ（対象） |
|---|---|---|---|---|---|---|---|
| 1 | main のチェックアウト | 既定（エージェントなし → 最後のタブ） | terminal switch | opened / last-tab | main の端末に切り替わった | 89 → 89（増 0、減 0） | 1 → 1 |
| 2 | 作業の worktree | 既定（最後に動いたエージェント） | terminal switch | opened / last-agent | この Issue のエージェントのタブに切り替わった | 89 → 89（0、0） | 1 → 1 |
| 3 | 作業の worktree | `--agent <paneKey>` | terminal switch | opened / requested-agent、requestedAgentFound: true | （すでに前面） | 89 → 89（0、0） | 1 → 1 |
| 4 | main のチェックアウト | `--route tab-activate` | session.tabs.activate | ok | main に切り替わった | 89 → 89（0、0） | 1 → 1 |
| 5 | main のチェックアウト | `--route worktree-activate`（作業の worktree を前面にしてから） | worktree.activate | ok | main に切り替わった | 89 → 89（0、0） | 1 → 1 |

- 3つの経路（CLI の `terminal switch`、RPC の `session.tabs.activate`、`worktree.activate`）が、どれも実機で前面を切り替え、**タブは1つも増えも減りもしなかった**。
- `--route` は実機の確かめの道具だけの指定で、既存のタブ（タブのある worktree）にだけ送る。API の経路の選び方は録画の再生のテストで確かめた。
- 本物のサーバー（`node src/server/main.ts`、127.0.0.1:18791）で、端から端まで確かめた：同じオリジンの `POST /api/token` でトークンが出る。別のオリジンは `origin_rejected`、別の Host は `host_rejected`、トークンなしは `token_missing`、そろった要求は `opened / terminal-switch / last-agent`、知らない worktree は `worktree_not_found`。サーバーの出力にトークンの値は出なかった。
- 実機で確かめていないこと：スリープ中のエージェントのタブ（orca-web の worktree にない）、タブのない worktree（最初の端末が作られるため、実機では送っていない）。どちらも録画の再生のテストで、経路と引数を確かめた。

## ボタンの部品（ブラウザー）

ヘッドレスの Chrome（CDP）で、偽の開く処理を持つ orca-web（127.0.0.1:18791、SpecDock のオリジンを 127.0.0.1:18700 に設定）と、別のオリジンの試しの画面（18700 と、許していない 18701）を置いて確かめた。

- 18700 の画面に1行のスクリプトだけを置くと、iframe（`sandbox="allow-scripts allow-same-origin"`）が差し込まれ、ボタンが出た。読み込みでトークンを1回取った。押すと、偽の開く処理に `{ worktree, agent }` がそのまま届き、「開きました」と出た。
- 幅 390px で iframe が隠れ（`display: none`）、391px で出た。390px で読み込んだときは iframe を読み込まず（トークンの要求 0）、広げると読み込んだ。
- 許していない 18701 の画面では、frame-ancestors で iframe が止められ、トークンの要求は 0 だった。
- 暗い表示で iframe の背景が不透明になる不具合を見つけ、iframe の要素と文書の color-scheme をそろえて直した（b7e9583）。

## Verification

（コードのレビュー、最終品質ゲート、CI の結果を、それぞれ終えたときに書く。）

## Residual Risks / Follow-ups

- 内部の RPC は非公開。Orca の版が変わったら、`npm run probe:live` と `npm run open:live` を走らせ直す。
- Orca の読む口には「前面の worktree」を示す値がない。時間切れの後に開いたかを読み直して確かめることはできないので、`unconfirmed` を返す。
- Origin とトークンはブラウザー由来の偽の要求を防ぐもので、同じ Mac の悪意あるプロセスへの認証の境界ではない。
- Chrome の Private Network Access で、Tailscale のアドレスからの iframe と要求が止められうる。Mac とスマホの実機の受け入れは iss-00008 で行う。
- iss-00006（状態の API）は、エージェントの識別子として paneKey（`<parentTabId>:<leafId>`）を返す前提にした。
- `AGENTS.md` に `npm run open:live` と新しいファイル（`open*.ts`、`server/config.ts`、`server/guard.ts`、`web/embed/`）の説明がない（編集してよい範囲の外。iss-00005 の FQG-003 と合わせて後で直す）。
