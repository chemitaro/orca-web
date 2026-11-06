---
種別: レポート（Issue）
ID: "iss-00008"
関連GitHub: ["#8"]
最終更新: "2026-11-06"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

orca-web を launchd の利用者のサービス（LaunchAgent）として常駐させる定義と命令を作り、待ち受けを 127.0.0.1 と指定の Tailscale の IP の2つに閉じ込めた。あわせて iss-00006 の残り（FQG-001〜003）と `AGENTS.md` を直し、epic-00003 をこの Mac の実機で受け入れた。

- 待ち受け（`src/server/listen.ts`、`src/server/main.ts`）
  - `startListeners` が、`loadConfig` の `bindAddresses`（127.0.0.1 と、検査を通った Tailscale の IPv4）だけに、いつもアドレスを付けて listen する（0.0.0.0、`::`、アドレスなしにしない。組み立ての入口でも拒む）。
  - 127.0.0.1 で待ち受けられなければ `orca-web: cannot listen on 127.0.0.1:<port> (<code>)` を書いて終了コード1（launchd が起動し直す）。
  - Tailscale の IP で待ち受けられなければ（ログインの直後で Tailscale がまだ動いていないなど）、127.0.0.1 だけで続け、ログに1行を書き、30 秒ごとに試し直す。同じ誤りの繰り返しは書かず、待ち受けられたら1行を書く。
  - `GET /api/health` が `{ ok, pid, listeners: [{ address, state, error? }] }` を返す。
  - SIGTERM と SIGINT で、試し直しとポーリングを止め、接続を閉じて終了コード0（5 秒の上限）。
- 常駐（`src/service/launchd.ts`、`src/tools/service.ts`、`package.json`）
  - `npm run service:install`（先にビルド）、`service:uninstall`、`service:restart`（先にビルド）、`service:status`。`install --dry-run` は定義と命令を出すだけ。
  - 定義 `~/Library/LaunchAgents/io.github.chemitaro.orca-web.plist`：node の絶対パス（`process.execPath`）と `<リポジトリ>/dist/server/main.js`、作業のディレクトリ、`RunAtLoad`、`KeepAlive`、`ThrottleInterval` 10、ログ `~/Library/Logs/orca-web/service.log`、環境変数（`PATH`、`PORT`、`ORCA_BIN`、あれば `ORCA_WEB_TAILSCALE_IP`・`ORCA_WEB_READ_ORIGINS`・`ORCA_WEB_SETTINGS_FILE`）。`ProcessType` は書かない。
  - 設定は入れるときの引数（`--port`、`--tailscale-ip IP|auto|none`、`--read-origins`、`--orca-bin`、`--settings-file`）で決め、サーバーと同じ `loadConfig` で確かめる。`auto` は `tailscale ip -4` の 100.64.0.0/10。取れなければ 127.0.0.1 だけの定義にし、そう出す。
  - `install` は、読み込み済みなら `bootout` して外れたことを確かめてから、一時ファイルから名前を変えて定義を書き、`bootstrap` し、`/api/health` の `pid` が `launchctl print` の pid と一致するまで待つ（同じポートの別のプロセスの答えを成功と見なさない）。`bootout` の失敗では定義を書き換えない。設定の誤り・古い node・成果物のなさは、何も書かず何も送らずに終了コード2。
- iss-00006 の残り
  - FQG-001：`OrcaCli` の失敗の文に stdout を入れない（`stdout is not JSON (<n> bytes)`、非ゼロは stderr か `exited with code <n>`）。状態の API の取得元の誤りと開く口の応答にも出ないことをテストした。
  - FQG-002：録画の検査の JSON の配列の規則を、仮名を含む短い ID の要素に限った（`["fix","the","bug"]` は安全としない）。
  - FQG-003：`/api/state` の GET だけが `noteViewer` を呼ぶことをテストした（呼び出しを外すと落ちることも確かめた）。
- 文書：README（入れ方、外し方、引数と環境変数、待ち受けと守り、SpecDock への置き方、スマホ、開発）、AGENTS.md（今のモジュール、道、環境変数、命令、エージェントは `service:install` などを実行しないこと）。

## 実機の受け入れ（2026-11-06）

この Mac の Orca 1.4.251。`npm run build` の後の一時の起動 `PORT=18791 ORCA_WEB_TAILSCALE_IP=<この Mac の Tailscale の IP> ORCA_WEB_READ_ORIGINS=http://127.0.0.1:18700 ORCA_WEB_SETTINGS_FILE=<一時> node dist/server/main.js`。ブラウザーはヘッドレスの Chrome 157（`--disable-features=MacAppCodeSignClone`、CDP で操作し `Browser.close` で閉じた）。値は件数と結論だけを書く。

| # | 確かめたこと | 結果 |
|---|---|---|
| 0 | 待ち受け | `lsof` の LISTEN は `127.0.0.1:18791` と `<Tailscale の IP>:18791` の2つだけ。LAN のアドレスからは接続できない（curl の exit 7）。ログは待ち受けの2行だけ |
| 1 | 状態の画面と API | 「Orca に接続」。9つの取得元すべてが成功。repo 16、worktree 70、エージェント 46〜47、Run 16、Task 119、担当 121。エージェントの種類は Claude Code 45、Codex 1（下）、種類の欠け 1。担当に結び付いたエージェント 4 |
| 1' | Codex | 統括が orca-web の main のチェックアウトに Codex を1つ起動した。状態の API に `agentType: codex`（取得元 tabs）、状態 `done`、paneKey つきで1件返った。モデルは null（`not-provided`）、推論は null（`no-source`）。担当ではない |
| 2 | 項目の選択 | 既定の 16 項目で3つの表。`agent.model` と `worktree.branch` だけを選んで保存すると「保存しました」と出て、再読み込みの後は worktree（ブランチ）とエージェント（モデル）の2つの表になった。SIGTERM で止めて起動し直しても同じ選択で表示された（設定のファイルに2項目） |
| 3 | 開くボタン（別のオリジン 127.0.0.1:18700 の画面に1行だけ） | iframe が差し込まれた。押すと `/api/token` と `/api/open` が1回ずつ送られ、「開きました」。応答は `opened / terminal-switch / last-agent`。対象は orca-web の main のチェックアウトとこの Issue の worktree だけ（2回）。押す前と後の `session.tabs.listAll`：全体 90 → 90（増 0、減 0）、対象 2 → 2 と 1 → 1 |
| 3' | 許していないオリジン（18701） | frame-ancestors で iframe が止められた（画面の写しで確かめた）。`/api/` への要求は 0 |
| 4 | 幅 | 1200px で出て、390px で隠れ（`display: none`）、391px で出た。390px で読み込むと iframe を読み込まず（ボタンの画面の要求 0）、800px に広げると読み込んだ |
| 5 | Orca に届かないとき | `ORCA_BIN` を存在しないパスにした別の起動（18792）：画面は「Orca に接続できない orca status: spawn-failed ・古い値を含む」と出て止まらず、5 秒ごとの読み直しが続いた。API は 200、`connection.state: unreachable`、`stale: true`、取得元は `lastSuccessAt: null` と誤り |
| 5' | 読めた後に届かなくなったとき | CLI を中継する一時の包みを、読めた後に `exit 1`（stdout に偽の文）に替えた別の起動（18793）：worktree 70、エージェント 46 が残り、「最後に読めた時刻 …・古い値を含む」と出た。取得元の誤りは `exited with code 1` で、偽の stdout の文は応答に出なかった（FQG-001） |
| 6 | Tailscale の IP | `http://<Tailscale の IP>:18791/api/health` は 200（pid と listeners 2つとも `listening`）。`/api/state` は Origin `http://127.0.0.1:18700` で 200、`Access-Control-Allow-Origin` はそのオリジン、`Vary: Origin`。Host `evil.example:18791` は 421。状態の画面も Tailscale の IP で開け、幅 390px で横のはみ出しはなかった |
| 7 | 常駐の定義 | `node src/tools/service.ts install --dry-run` の定義が `plutil -lint` で OK。Tailscale の IP は `auto` で見つかり、定義に入った。`~/Library/LaunchAgents` には何も書いていない |

- 前面の切り替えを画面の写しで見ようとしたが、この起動の画面の写しには窓が写らず（壁紙だけ）、目では確かめていない。開いたかは、iss-00007 の決めごと（送った書き込みが成功を返したか）で判断した。同じ経路（`terminal switch`）で前面が切り替わることは、iss-00007 で目で確かめている。写しは見てすぐ消した。
- 5' の観察：CLI だけが落ちて RPC（タブの読み取り）が通るとき、画面の接続の表示が「接続できない」と「接続」の間で揺れる。iss-00006 の設計（接続の状態を、取得の組ごとに、その組がすべて落ちたかで決める）どおりで、Orca そのものが止まったとき（機能の確かめが落ちる）には起きない。直していない。

### 統括と利用者に頼む確かめ

本物の launchd の登録とスマホの確かめは、この Issue では行っていない。結果は epic-00003 の report.md に書き、Epic の受け入れを閉じる。

**統括（マージの後、main のチェックアウトで）**

```sh
cd <orca-web の main のチェックアウト> && git pull && npm ci
npm run service:install -- --dry-run     # 定義を見る（Tailscale の IP が入っているか）
npm run service:install                  # 「入れた」と待ち受けの2行（listening）が出る
npm run service:status                   # state = running、pid、127.0.0.1 listening、<Tailscale の IP> listening
lsof -nP -iTCP:8791 -sTCP:LISTEN         # 127.0.0.1:8791 と <Tailscale の IP>:8791 の2つだけ
```

その後、ログアウトしてログインし直し（または再起動し）、`npm run service:status` で `state = running` と2つの `listening` を確かめる。Tailscale が後から動いたときは、ログ（`~/Library/Logs/orca-web/service.log`）に `cannot listen on <IP>` の後 `listening on http://<IP>:8791/` が出る。外すときは `npm run service:uninstall`。

**利用者（スマホ、tailnet）**

1. スマホの Tailscale をつなぐ。
2. スマホのブラウザーで `http://<Mac の Tailscale の IP>:8791/` を開く。「Orca に接続」と、worktree・エージェント・担当の表が出て、横にはみ出さずに読める。
3. SpecDock のダッシュボード（`http://<Mac の Tailscale の IP>:47800/`）に開くボタンが置かれた後は、スマホの幅（390px 以下）ではボタンが出ないことを見る。

## Verification

- 仕様のレビュー（spec-review、spec-reviewer opus / medium、CUE は sha256 で固定）：round 1 は **pass**（P0 0、P1 0、P2 2、P3 3）。P2・P3 は情報だが取り込んだ（`/api/health` の pid と install の pid の照らし合わせ、bootout の失敗の扱い、Epic の残りの記録先、文の食い違い）。round 2 も **pass**（P0〜P2 0、P3 1。compatibility に pid を足して直した）。固定の sha256：requirement 5523e998…、design a92421aa…（round 2）。pass の後に design の文を小さく直した（compatibility の pid、`ProcessType` を書かない）。
- コードのレビュー（code-review、code-reviewer sonnet / high、standards と spec の2人、範囲 fd89ac6..479b83f）：どちらも **pass**（P0〜P2 0）。
  - spec：P3 1（`tailscale ip -4` の時間切れが仕様の 5 秒でなく 10 秒）。
  - standards：P3 1（`npm run service:install -- --dry-run` は先にビルドするので、「何も書かない」と食い違う）。
  - 2件とも d673dee で直した（tailscale だけ 5 秒、テストつき。dry-run はビルドしない `node src/tools/service.ts install --dry-run` で案内）。ChatGPT のレビューは使っていない（統括の依頼でレビュアーを指定）。
- 最終品質ゲート（final-quality-gate、quality-gate-reviewer opus / high、1人、ChatGPT なし）：campaign `iss-00008-fqg-1`、試み1で **合格**。合格したコミットは `d673dee70cdd9e05e45cc63990e490eb7018299e`。
  - レビューのレーン：status pass、coverage complete（functional-correctness、requirements-closure、test-adequacy）、P0 0・P1 0・P2 0・P3 1。
  - テストのレーン（同じコミット）：`npm run lint` exit 0、`npm test` exit 0（187 件すべて成功）、`npm run build` exit 0。
  - P3（情報のみ）：FQG-001 restart の kickstart の失敗と pid の食い違いで 1 を返すことを確かめるテストがない（実装は正しい。install の同じ経路にはテストがある）。
- 実機：上の「実機の受け入れ」。
- PR：https://github.com/chemitaro/orca-web/pull/15（head d673dee、base main fd89ac6）。CI（GitHub Actions の CI、run 42215309801）は success。2026-11-06T12:09Z の観測で、Actions と Commit Status は PASS、マージの状態は READY（OPEN、draft でない、MERGEABLE、CLEAN）。最終の SHA は d673dee70cdd9e05e45cc63990e490eb7018299e。

## Residual Risks / Follow-ups

- 定義の node のパスは、入れたときの `process.execPath`（nodenv などの版のディレクトリ）。版を消すと起動できなくなるので、入れ直す（README）。この Mac では node とリポジトリが外付けの区画（`/Volumes/...`）にあるので、ログインのときに区画がまだ見えないと、launchd が 10 秒ごとに起動し直す。
- Tailscale の IP は入れたときに定義に書く。IP が変わったら入れ直す（試し直しは古い IP で続き、ログに出る）。
- ログは回転しない（起動と待ち受けの変化だけで少ない）。
- 接続の表示の揺れ（上の 5' の観察）は iss-00006 の設計の範囲。部分的な故障を区別して示すなら、後の Issue で接続の状態の決め方を見直す。
- Codex のモデルと推論は、状態の API では null（`not-provided`、`no-source`）。Orca が値を出さないため（iss-00005 の結論と同じ）。
