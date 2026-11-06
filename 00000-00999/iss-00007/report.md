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
  - 設定（iss-00006 と共通の `PORT`、`ORCA_BIN`、`ORCA_WEB_READ_ORIGINS`、`ORCA_WEB_SETTINGS_FILE` に、`ORCA_WEB_TAILSCALE_IP` を足した）から、待ち受けのアドレス（127.0.0.1 と Tailscale の IP だけ）、足す Host、SpecDock のオリジン（読み取りの CORS と frame-ancestors）を導く。0.0.0.0、ループバック、不正なオリジンで起動を止める（`ConfigError`）。
  - すべての要求（静的な画面を含む）で、Host を `127.0.0.1:<port>`、`localhost:<port>`、`<Tailscale の IP>:<port>` との完全一致で確かめる（違えば 421 `misdirected_host`。DNS rebinding）。
  - 書き込み（`POST /api/open` と、iss-00006 の項目の選択の保存 `PUT /api/settings/fields`）は、決めた method、`application/json`、`Origin` が `http://<Host>` と完全一致、`Sec-Fetch-Site` があれば `same-origin`、`X-Orca-Web-Token` の有効なトークンを要する。開く口は 4 KiB 以下で `{ worktree, agent? }` だけ。CORS の許可は付けない。
  - トークンは `POST /api/token`（同じオリジンの JSON の POST だけ）が出す。256 ビット、10 分、メモリーだけ、64 個まで。inspect と JSON に値を出さない。
- 開く口（`src/orca/open-target.ts`、`src/orca/open-gates.ts`、`src/orca/open.ts`、`src/orca/wiring.ts`）
  - `POST /api/open` は、worktree（ID かパス）を最新の `worktree list` に完全一致で解決し（`truncated` なら `--limit <totalCount>` で読み直す）、`session.tabs.list` から、指定の paneKey → 最後に動いたエージェント（`agentStatus.updatedAt`）→ 最後に見ていたタブ → worktree だけ、の順に1つを選ぶ。
  - 動いている端末は `orca terminal switch --terminal <handle>`、ほかのタブは `session.tabs.activate`（`navigation: "host"`、`intent: "user"`）、worktree だけは `worktree.activate`（`navigation: "host"`）。送るのは1回だけ。
  - 門（`OpenOrcaCli`、`OpenRpc`）が、読む操作と、この3つ（activate は host だけ）のほかを送らずに拒む。タブやファイルを作る操作を送る経路はない。
  - 時間切れ・接続断・不正な応答と、`terminal switch` の封筒のない非ゼロの終了（シグナルを含む。切り替えが届いた可能性がある）は `unconfirmed`（504）で、別のタブへ切り替えない。CLI を起動できなければ `unavailable`。機能の欠け、形の違い、runtime の ID の変化は何も送らずに理由を返す。重なった要求は `busy`。
- ボタンの部品（`web/embed/`）：1行のスクリプト `open-button.js` が自分の位置に iframe を差し込む。親の幅が 390px 以下の間は隠し、読み込まない。iframe（`/embed/open-button`）は CSP（`frame-ancestors` に SpecDock のオリジンだけ、空なら `'none'`、inline なし）で返り、押すと `web/write.js` で同じオリジンからトークンを得て開く口を呼ぶ。
- 書き込みの送り方（`web/write.js`）：状態の画面と iframe が共有する。初めの書き込みの前に `POST /api/token` でトークンを得て、メモリーにだけ持ち、期限の 30 秒前を過ぎたら取り直し、401 なら取り直して1回だけ送り直す。`theme`（light、dark）と `size`（sm、md）を受ける。
- 実機の確かめの道具（`src/tools/open-live.ts`、`npm run open:live`）：作業の場所と同じ repo の worktree だけを対象に、押す前と後の `session.tabs.listAll` を数だけで比べる。
- iss-00006 との統合（統括の依頼、2026-11-06）：PR #11（0a0e76c）が先にマージされ、PR #10 が衝突したので、`origin/main` をマージのコミット（10fca65）で取り込み、`src/server/app.ts`・`config.ts`・`main.ts` の衝突を解いた。iss-00006 の小さな同じオリジンの守り `src/server/same-origin-write.ts` を消し、項目の選択の保存を、この Issue の書き込みの守り（Host・Origin・短期トークン）の下に置いた。画面（`web/main.js`）の保存は `web/write.js` でトークンを使う。状態の画面（`/`）にも `frame-ancestors` を足した。
- 最終品質ゲートの FQG-002 を直した（711f70a）：`terminal switch` が封筒のない出力で非ゼロ終了したときは、切り替えが届いた可能性があるので `orca_error` ではなく `unconfirmed`。
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
- 本物のサーバー（`node src/server/main.ts`、127.0.0.1:18791）で、端から端まで確かめた：同じオリジンの `POST /api/token` でトークンが出る。別のオリジンは `origin_rejected`、別の Host は `host_rejected`（統合の前の名前。今は `misdirected_host`）、トークンなしは `token_missing`、そろった要求は `opened / terminal-switch / last-agent`、知らない worktree は `worktree_not_found`。サーバーの出力にトークンの値は出なかった。
- 実機で確かめていないこと：スリープ中のエージェントのタブ（orca-web の worktree にない）、タブのない worktree（最初の端末が作られるため、実機では送っていない）。どちらも録画の再生のテストで、経路と引数を確かめた。

### iss-00006 を取り込んだ後（711f70a の内容、2026-11-06）

- 本物のサーバー（`PORT=18791 node src/server/main.ts`、設定のファイルは一時の場所）：トークンなしの `PUT /api/settings/fields` は `token_missing`、トークンつきは 200。`GET /api/state` は 200、別の Host は 421 `misdirected_host`。そろった `POST /api/open`（作業の worktree）は `opened / terminal-switch / last-agent`。サーバーの出力にトークンの値は出なかった。
- `npm run open:live -- --worktree <main のチェックアウト>`：`terminal-switch / last-tab`、タブは全体 88 → 88、対象 1 → 1（増減 0）。

## ボタンの部品（ブラウザー）

ヘッドレスの Chrome（CDP）で、偽の開く処理を持つ orca-web（127.0.0.1:18791、SpecDock のオリジンを 127.0.0.1:18700 に設定）と、別のオリジンの試しの画面（18700 と、許していない 18701）を置いて確かめた。

- 18700 の画面に1行のスクリプトだけを置くと、iframe（`sandbox="allow-scripts allow-same-origin"`）が差し込まれ、ボタンが出た。読み込みでトークンを1回取った。押すと、偽の開く処理に `{ worktree, agent }` がそのまま届き、「開きました」と出た。
- 幅 390px で iframe が隠れ（`display: none`）、391px で出た。390px で読み込んだときは iframe を読み込まず（トークンの要求 0）、広げると読み込んだ。
- 許していない 18701 の画面では、frame-ancestors で iframe が止められ、トークンの要求は 0 だった。
- 暗い表示で iframe の背景が不透明になる不具合を見つけ、iframe の要素と文書の color-scheme をそろえて直した（b7e9583）。
- 取り込みの後（711f70a の内容、同じ harness に設定のファイルを足して）：iframe は読み込みではトークンを取らず（0 回）、押したときに1回取って開く口に `{ worktree, agent }` が届いた。390px で隠れ、391px で出て、390px で読み込むと iframe を読み込まず（0 回）、広げると読み込んだ。許していないオリジンでは、サーバーは iframe の文書を返すがブラウザーが frame-ancestors で止めた（画面の写しで確かめた）。状態の画面（`/`）で項目を選んで保存を押すと、トークンを1回取り、「保存しました」と出て、設定のファイルが書かれた。

## Verification

- 仕様のレビュー（spec-review、spec-reviewer opus / medium）：round 1 で **pass**（P0 0、P1 0、P2 1、P3 1）。固定は CUE の sha256（requirement 38250e60…、design 71595bf4…、plan 54b619fe…）。P2（theme がないときの明暗）と P3（「広げると出る」とテストの対応）は情報のみ。実装は iframe の中の `prefers-color-scheme` に従い、ブラウザーの確かめで 391px に広げると出ることも確かめた。
- コードのレビュー（code-review、code-reviewer sonnet / high、standards と spec の2人、範囲 2e5fc64..4adc35a）：どちらも **pass**。
  - spec：P3 1（`open:live` の出力に worktreeId のパスと Orca の誤りの文が出る）。指摘外の注記（`Referrer-Policy: no-referrer` では Fetch の仕様で同じオリジンの POST の Origin が null になりうる）も正しいと判断した。
  - standards：P3 2（`ORCA_WEB_SPECDOCK_ORIGINS` が `,` だけだと frame-ancestors が空になる、AGENTS.md が古い）。
  - 3c02c18 で、出力を決まった項目に絞り、Referrer-Policy を `same-origin` にし、空のオリジンを設定の誤りにした（テストつき）。ブラウザーと `open:live` で確かめ直した。AGENTS.md は依頼の編集してよい範囲の外なので直していない。
- 最終品質ゲート（final-quality-gate、quality-gate-reviewer opus / high、1人、ChatGPT なし）：campaign `iss-00007-fqg-1`、試み1で **合格**。合格したコミットは `3c02c18cba67b2f381abbb4c4715cf0d9f923210`。
  - レビューのレーン：status pass、coverage complete（functional-correctness、requirements-closure、test-adequacy）、P0 0・P1 0・P2 0・P3 2。
  - テストのレーン（同じコミット）：`npm run lint` exit 0、`npm test` exit 0（108 件すべて成功）、`npm run build` exit 0。
  - P3（情報のみ）：FQG-001 埋め込みの Referrer-Policy が設計 D-06 の文と違う（設計の文を same-origin に直した）。FQG-002 `terminal switch` の CLI が封筒のない出力で非ゼロ終了したとき（シグナルでの終了など）、`unconfirmed`（504）ではなく `orca_error`（502）と返す（書き込みは1回だけで安全は保たれる）。
- 取り込みの後のコードのレビュー（code-review、code-reviewer sonnet / high、standards と spec の2人、範囲 0a0e76c..711f70a）：どちらも **pass**。spec は指摘 0。standards は P3 1（AGENTS.md が古い。編集してよい範囲の外）。コードの修正なし。
- 取り込みの後の最終品質ゲート（campaign `iss-00007-fqg-2`、quality-gate-reviewer opus / high、1人、ChatGPT なし）：試み1で **合格**。合格したコミットは `711f70a709bcb65a504f8124a865492fd4715d82`。レビューのレーンは status pass、coverage complete、P0〜P3 0。テストのレーン（同じコミット）は `npm run lint` exit 0、`npm test` exit 0（155 件すべて成功）、`npm run build` exit 0。参考の注記：Tailscale の Host を HTTP の層で受けるテストと、RPC の unavailable・CLI の invalid-json の分け方の直接のテストがない（守りの境界を越える退行にはつながらない）。
- 仕様（requirement、design、plan）は、統合に合わせて書き直した（変数の名前、421、`localhost`、項目の選択の保存の守り、`write.js`、FQG-002、S-09〜S-11、T-14〜T-16）。仕様のレビューはやり直していない（依頼の手順はコードのレビューと最終品質ゲートのやり直し）。
- PR：https://github.com/chemitaro/orca-web/pull/10（head 3c02c18、base main）。CI（GitHub Actions）：2026-11-06T10:14Z の観測で、head 3c02c18 の Actions と Commit Status は PASS、GitHub のマージの状態は READY（OPEN、draft でない、MERGEABLE、CLEAN）。 取り込みの後は、2026-11-06T11:24Z の観測で、head **711f70a** の Actions と Commit Status は PASS、マージの状態は READY（OPEN、draft でない、MERGEABLE、CLEAN）。最終の SHA は 711f70a709bcb65a504f8124a865492fd4715d82。

## Residual Risks / Follow-ups

- 内部の RPC は非公開。Orca の版が変わったら、`npm run probe:live` と `npm run open:live` を走らせ直す。
- Orca の読む口には「前面の worktree」を示す値がない。時間切れの後に開いたかを読み直して確かめることはできないので、`unconfirmed` を返す。
- Origin とトークンはブラウザー由来の偽の要求を防ぐもので、同じ Mac の悪意あるプロセスへの認証の境界ではない。
- Chrome の Private Network Access で、Tailscale のアドレスからの iframe と要求が止められうる。Mac とスマホの実機の受け入れは iss-00008 で行う。
- iss-00006（状態の API）は、エージェントの識別子として paneKey（`<parentTabId>:<leafId>`）を返す前提にした。
- `AGENTS.md` に、`npm run open:live`、`ORCA_WEB_TAILSCALE_IP`、`POST /api/token`・`POST /api/open`・`/embed/*`、新しいファイル（`open*.ts`、`server/guard.ts`、`web/embed/`、`web/write.js`）の説明がない（編集してよい範囲の外。後で直す）。
- iss-00006 の項目の選択の保存は、トークンを要するようになった。画面のほかの書き手（スクリプトなど）があれば、`POST /api/token` から得る手順が要る。
