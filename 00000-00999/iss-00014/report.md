---
種別: レポート（Issue）
ID: "iss-00014"
関連GitHub: ["#14"]
最終更新: "2026-11-14"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

## レビュー記録

- 仕様レビュー：合格（round-2、2026-11-14）。レビュアー spec-reviewer（Opus 5.5 / high）。P0/P1/P2 0、P3 1（R-05 の受入の後半、確かめの後に欄が書かれることを追う手順が計画にない。欄は統括かタスク担当が本人の答えを受けて書き、Issue を閉じる条件にする。直さずに記録）。round-1 は P0/P1 0 で合格だったが、P2 3・P3 2 を直して再レビュー。
  - 合格した文書の sha256：requirement.cue `82afac4d6a8f8974ced3587af00c291802f0b023978cf6fefdd18838567c5fdb`、design.cue `bd6c7e3d29a0369a69bcfed9850ca584457b1ca1718a1cac12f21b31bc74f369`、plan.cue `d7a19d1c1eef63ce831b1d99b362d7dcbe7079b9dd153deaca14fab1849c4574`
  - 結果：`.workbench/spec-review/iss-00014/round-2.json`（対応の記録は `review-response.md`）。照合のコミット `899491691d883d410dd42dee811b1bf86c0503ee`

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 試しの起動の道具 `npm run trial`（`src/tools/trial.ts`）：試し用の orca-web（8792）、試しの画面（47900）、許していないオリジンの画面（47901）を、127.0.0.1 と、指定したときは Tailscale の IP で起動し、SIGTERM でまとめて止める。試し用の orca-web は試しの画面のオリジンだけを許し、設定と送信の記録を `.workbench/trial/` に分ける（常駐の置き場と 8791・47800 は拒む）。設定のファイルは `sendEnabled: false` で作り、道具は真にしない。
- 試しの静的なサーバー（`src/tools/trial-host.ts`）：決めた表のファイルだけを `web/trial/` から配り、Host を完全一致で確かめ（localhost は 421）、CSP で orca-web の基の URL だけを許す。
- 試しの画面（`web/trial/`）：要約から worktree ごとの節と丸を描き（`send-test` を先頭に「試しの送り先」の札）、丸を押すと詳細とチャットの iframe（広い幅は横の欄、狭い幅は節の下）、節ごとに開くボタン。`phone.html` は幅 390px・高さ 844px の枠、`forbidden.html` は許していないオリジンで5つの口が拒まれることを示す。
- README.md に「試しの画面で確かめる」、AGENTS.md に `web/trial/` と `src/tools/trial*.ts` を足した。
- コミット：`2341333`（S-01）、`fb4d5b7`（S-02）、`521df65`（S-03 の直し：枠の幅）、`baf8ea3`（S-04 の README・AGENTS）。
- 実装担当（`launch.effective`）：impl（S-01）codex / gpt-6.1-sol / medium（dispatch `ctx_b955a2bd329d`）、ui（S-02）claude / claude-opus-5-5 / medium（`ctx_973ca49e9fe2`）、ui-fix（S-03 の直し）claude / claude-opus-5-5 / medium（`ctx_c5b5c1699d19`）。S-03 の実機の確かめと S-04 はタスク担当（Opus 5.5 / medium）。

### 逸脱と判断

- S-02 の実装担当の Chrome での描画の確かめを省いた（Claude in Chrome に3つのブラウザーがつながっていて、選ぶには利用者の操作が要るため）。S-03 でタスク担当が、自分で起動したヘッドレスの Chrome（CDP。`--disable-features=MacAppCodeSignClone`、`Browser.close` で閉じる）で確かめた。Claude in Chrome は使っていない。
- S-03 で、`phone.html` の枠の中の幅が 390px ではなく 370px（`border` が幅に含まれる）だった。D-06 として、ui の値の新しい実装担当が `box-sizing: content-box` で直した（`521df65`）。直した後の中のビューポートは 390px（clientWidth 375 とスクロールバー 15）。
- R-02 の受入「結果が `submitted` か `accepted`」：Claude への送信の結果は `input_accepted`（Orca が入力を受けた。turn の始まりは receipt の時点で観測されていない）だった。端末の経路の成功の結果の1つであり、会話の記録に利用者の行と返事の行が続いて増えたことで届いたと確かめた。受入の意図（届いたこと）は満たすと判断した（仕様は変えない）。Codex は `submitted`。
- 開くボタンの押下（R-03）は、iframe の中のボタンを CDP のマウスの入力で押した。

## Verification

- テスト：開始のコミット `8994916` で `npm test` 515 件 pass（実装担当の基準）、`baf8ea3` で 534 件 pass。`npm run lint` と `npm run build` は成功。最終品質ゲートは下の `## レビュー記録`。
- 実機（2026-11-14、`orca --version` 1.4.258、`npm run trial -- --tailscale-ip <Tailscale の IP>`、ヘッドレスの Chrome。数と結論だけ。写しは `.workbench/trial-evidence/`、コミットしない）：
  - 許し（curl）：試しの orca-web の要約は `Origin: http://127.0.0.1:47900` と `http://<Tailscale の IP>:47900` で 200 と `Access-Control-Allow-Origin`、`http://127.0.0.1:47901`・`http://127.0.0.1:47800`・`http://localhost:47900` は 403。`/embed/agent` の `frame-ancestors` は試しの2つのオリジンだけ。47901 の Origin の `POST /api/token`・`POST /api/send/intent` は 403。orca-web の `/trial/index.html` は 404。試しの画面を `localhost:47900` の Host で開くと 421。
  - Mac の幅（1280px）、127.0.0.1 と Tailscale の IP の両方：節 54、丸 58（IP の回は 57）で、同じ時の要約の worktree とエージェントの数と一致。先頭は `send-test`。開くボタン 54 が出る。帯の誤りなし、横のはみ出しなし。丸を押すと横の欄に iframe が開き、題名、詳細（開いた状態）、Orca で開く、会話の行が出て、読めない印はない。
  - 幅 390px の枠（`/phone.html`）、両方の URL：節と丸の数は同じ、開くボタンの iframe は 54 あるが出ず（読み込まない）、横のはみ出しなし。丸を押すと節の下に iframe が開き、詳細は畳まれ、iframe の中に Orca で開くは出ない。
  - 許していないオリジン（`http://127.0.0.1:47901/forbidden.html`）：要約の読み、トークン、送る意図の3つは拒まれ（ブラウザーが応答を渡さない）、詳細とチャットの iframe とボタンの iframe は描かれない（ブラウザーのエラーの枠）。
  - 開くボタン：worktree `iss-00014` の節のボタンを押し、「開きました」。
  - 送信（試し専用の `settings.json` だけ `sendEnabled: true`）：送る前に `orca terminal list` と状態の API で、send-test のエージェントが2つだけで、Claude が `term_33f82ee2-…`、Codex が `term_0787c5d8-…` であることを確かめ、確認の画面で worktree の末尾 `send-test` と種類が合うのを見てから送った。Claude（Mac の幅）は `input_accepted`、Codex（390px の枠）は `submitted`（stages `input_accepted`、`turn_started`）。試しの `sends.jsonl` は 0 行から 4 行（送る前と後が2組）。どちらの会話にも、送った時刻の利用者の行と、その後の返事の行がある（中身は写していない）。業務中のエージェントには送っていない。
  - 常駐：8791 の `/api/health` の pid は確かめの前と後で同じ（19596）。常駐の設定と登録には触れていない。

## 本人に開いてほしい URL と、見てほしい点

試しのサーバーは動いたままにしてある（下の「止め方」まで止めない）。試し用の orca-web の送信は有効（試し専用の設定だけ）。

- Mac：`http://127.0.0.1:47900/`（3つの部品）、`http://127.0.0.1:47900/phone.html`（幅 390px の枠）、`http://127.0.0.1:47901/forbidden.html`（拒まれることの確かめ）
- スマホ（tailnet）：`http://<Tailscale の IP>:47900/`（実際の IP は統括への報告に書く）

見てほしい点：

1. 稼働の印：worktree ごとの丸（色と文字）と数の見え方。SpecDock の構造の図に重ねるときの大きさと情報の量（丸、種類、状態、経過）として足りるか、多すぎるか。
2. 丸を押して開く詳細とチャット：Mac では横の欄、スマホでは節の下に開く形でよいか。詳細の項目、会話の読みやすさ、スマホで詳細が畳まれて始まること。
3. 送る：`send-test` の Claude か Codex に、確かめて送る流れ（確かめる → 確認の画面 → 送る）。送り先は `send-test` の2つだけにしてください。
4. Orca で開くボタン：Mac で押すと Orca のタブが前面に出ること。スマホでボタンが出ないこと。
5. 許していないオリジンの画面で、すべて拒まれること。
6. SpecDock に組み込んでよいか、直すことがあるか。

### 止め方

```sh
kill -TERM $(cat <orca-web の worktree iss-00014>/.workbench/trial/trial.pid)
```

止めた後、試しの送信を使わないなら `.workbench/trial/settings.json` の `sendEnabled` を `false` にするか、`.workbench/trial/` を消す。常駐の orca-web（8791）には影響しない。

## 本人の確かめ

（本人の確かめの後に、統括かタスク担当が書く。この欄が埋まるまで Issue を閉じない。）

- 日付：
- 見た環境（Mac、スマホ）：
- 見てほしい点ごとの結果：
- 直すこと：
- SpecDock への組み込み（spec-dock の epic-00471・epic-00526）に進んでよいか：

## Residual Risks / Follow-ups

- 詳細とチャットの iframe は、自分の幅が 390px 以下なら「Orca で開く」を出さない。SpecDock が Mac で狭い欄（390px 以下）に置くと、Mac でも出ない。欄の幅は epic-00526 で決める（試しの画面の Mac の欄は 521px）。
- 実物の iPhone の Safari での見え方は、本人の確かめで見る（この Issue の確かめは Mac の上の 390px の枠）。
- 仕様レビューの P3：R-05 の欄を埋める手順は計画の外（統括かタスク担当が本人の答えを受けて書く）。
