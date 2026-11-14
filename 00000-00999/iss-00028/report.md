---
種別: レポート（Issue）
ID: "iss-00028"
関連GitHub: ["#28"]
最終更新: "2026-11-14"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

`/embed/agent`（エージェントの詳細とチャットの小窓）を、普通のシンプルなチャットにした。

- 詳細は幅によらず畳んで始まる。見出しに、iss-00027 の印の部品でこのエージェントの状態と種類の印を出す（経過は出さない）。
- 入力欄と送るボタン：キーボードが主の端末は Enter で送り Shift+Enter で改行する。変換中の Enter では送らない。タッチが主の端末は Enter で改行し、送るボタンで送る。確認の画面、送る前の「確かめる」、60 秒の期限はない。
- 守りは内部に残した：送れるかの口が宛先の指紋（`target`）を返す。画面は最初の指紋を固定して送る意図に添え、意図はその時の宛先と比べて違えば 409 `changed_since_shown` で送らない。確定の確かめ直し（前面のプロセス、ptyId・incarnation・providerSession）、使い捨ての票（期限は内部だけ）、操作の ID、送る前の記録、`sendEnabled`、書き込みの守りは変えていない。書いている間に宛先が変わると「新しい宛先で続ける」を押すまで送らない。結果不明は帯を出し、その間は送らない。
- 見た目は SpecDock のデザインシステム（`--ds-*`・`--sd-*`、明暗と `?theme=`）に合わせた。会話の時刻は `elapsed.js` の短い形（now・5m・3h・2d）。
- iss-00013 の残りの P2/P3：(a) foreground_mismatch の言葉と README の前面の説明、(b) 後着の unknown の照会が確定を隠す、(c) 照会の追記の失敗を `checkWarning` で示す、(d) 記録を読めないときに not_sent と示さず 503 `record_unreadable`、(e) 再起動の直後の method_not_found でも経路を止める、(f) 構造化 Chat の消えたカードを unknown `card_gone` と示す。6つすべてを直した。
- コミット：`f556284`（S-01）、`9966f51`（S-02）、`46df4ec`（CP-1 の P1 の直し）、`9a694fe`（origin/main の取り込み）、`8583c76`（S-03）、`de9f0c9`（S-04 の README・AGENTS）。
- 実装担当（`launch.effective`、受け取りの値）：
  - impl（S-01・S-02）codex / gpt-6.1-sol / medium（dispatch `ctx_2066e9462e02`）
  - ui（S-03）claude / claude-opus-5-5 / high（`ctx_d9b7997d8231`）
  - S-04 はタスク担当（Opus 5.5 / high）

### 逸脱と判断

- 統括の決定を仕様に入れた：スマホの Enter は案A（msg_745bb8dec9ff）、SpecDock のデザインシステム（msg_6a989e74bba2）、時刻の短い表記（msg_3a70faf1dfc3）。epic-00004 は、了承された節（requirement の includes の2つ目・R-02・R-04 の text・F-01・decisions、design の D-02・D-05）だけを書き直した。
- 開始のコミットは、仕様の途中で iss-00027 が main に入ったので、68d8c88 から fc654c0 に fast-forward した。S-03 の前に、origin/main（1bcca57、iss-00027 の elapsed.js）をマージのコミット `9a694fe` で取り込んだ。依頼書の「origin/main を取り込み直す」に当たる。push 済みのブランチなので、rebase ではなく merge にした。最終品質ゲートの基は、取り込んだ main の先端 1bcca57 にした（1bcca57..HEAD がこの Issue の正味の変更）。
- CP-1 round 1 の P1（メモリーに unknown の照会しかないのに not_sent を返す）は、D-02 (d) の意味（読めないことを not_sent と示さない）を守る読み方で直した。メモリーで答えるのは after・refused・unknown でない照会があるときだけ。
- 計画の観点の名前「concurrency-idempotency」「ui-interaction」は契約の観点の一覧にない。そのため reliability-recovery と e2e-user-flow に置き換え、二重送信・誤送信・鍵・見た目の問いを review_questions に書いた。
- S-03 の実装担当の判断（了承）：pendingAgentType を足した（adopt 後の placeholder のため）。形の違う target は unknown_shape で disabled にする。帯の間は入力欄も止める。status を読み直すのは送る前の拒みの後と「閉じる」の後だけ。時刻は elapsed.js の formatElapsed。誤りの言葉から「もう一度確かめてください」を除いた。agent.css は `--chat-*` を `var(--ds-…/--sd-…, 既定)` で置き、`--sd-*`・`--ds-muted`・`--ds-focus` を明暗ごとに置いた。
- git-autocommit が付けたコミットの題の種類は、`8583c76` が test、`de9f0c9`（文書だけ）が feat で、中身と合わない。履歴を書き換えないので、そのまま残す。
- 試しの orca-web は、iss-00027 の試し（8792・47900）が動いていたので、止めずに別の port（8793・47910・47911）で起動した。

## レビュー記録

### 仕様のレビュー（spec-review、保証レベル strict）：合格（round 4）

- 合格の固定（sha256）：requirement.cue `a06cbe9ec15a2b36b23edb04a6a339a4b1ea410a3aee6eb2c3c068752dc0aaf3`、design.cue `26a35a717d1fb83bf745661c3d7f4dad7d689425f3c18474b7a1ae0e671da3b0`、plan.cue `2854c3abd6d24a2d58a09e30567435a62f58eb0bc55ebd599af274e570d0abc0`、epic-00004/requirement.cue `11469235938c9eee6645def10f612ab9bc68dbb75263dd7f17c7b8ec2a79cfdf`、epic-00004/design.cue `47b5eb9c703850b7fd9b0a95f99123a4e63ee852eae0ada709d5cd3d084f4afc`（epic は統括が了承した節だけが対象）。コードの固定は `fc654c0f9c2838db2ca7d3b69de14adde1c0f3da`
- 結果：`.workbench/spec-review/iss-00028/round-4.json`（Claude spec-reviewer Opus 5.5 / high。P0/P1 0、P2 1）。応答の記録は同じ場所の `review-response.md`
- 経過：round 1 fail（P1 2、P2 2。直した）、round 2 pass（P3 2）、統括の新しい決定（msg_6a989e74bba2、msg_3a70faf1dfc3）による仕様の変更と、開始のコミットの fc654c0 への移動の後、round 3 fail（P1 1、P2 1。直した）、round 4 pass
- P2/P3 の残り：P2 1（スリープの文字の色とフォーカスの輪が `?theme=` に従わない。画面の実装担当に、agent.css に `--ds-muted`・`--ds-focus` も明暗ごとに置くよう伝える）
- ChatGPT の2人目：得られなかった。共有の `spec-dock/canonical` がほかの Issue の自動保存で動き、Strict の前置き（ブランチの先端の一致）を満たせなかった（round 1 は途中で先端が動いて中止、round 2 は古い版のまま 50 分を超えたので止めた）。2人のレビューとは呼ばない

### 区切りのレビュー CP-1：合格

- 範囲 fc654c0..46df4ec（S-01・S-02）。code-reviewer（Opus 5.5 / medium、standards と spec を1人）。round 1 fail（P1 1：メモリーに unknown の照会しかないのに not_sent を返す。直した 46df4ec）、round 2 pass（P0〜P3 0）。`.workbench/code-review/iss-00028-cp1/`

### 最終品質ゲート：合格（de9f0c9）

- campaign `fqg-iss-00028-1`、attempt 01。範囲 `1bcca57..de9f0c9`（取り込んだ main の先端を基にした正味の変更）。
- レビュー（quality-gate-reviewer、Opus 5.5 / high）：pass（P0〜P3 0、coverage 完全）。
- 2人目（ChatGPT GPT-6 / Extra High、chatgpt-code-review-strict。選択の証拠 verified=true）：pass（指摘なし）。
- テスト：`npm run lint`、`npm test`（618 pass）、`npm run build` がすべて exit 0。
- closure：`.workbench/final-quality-gate/fqg-iss-00028-1/closure.md`。記録だけのコミットはなし。P2/P3 なし。
- 仕様の plan.cue は、合格の後に手順の status を done にした（status の更新だけ）。

## Verification

- テスト：開始のコミットで 576 pass。CP-1 の後（46df4ec）で 593、取り込みの後（9a694fe）で 598、`de9f0c9` で 618 件 pass。`npm run lint` と `npm run build` は exit 0。
- 区切りのレビュー CP-1（fc654c0..46df4ec）：round 1 fail（P1 1。直した）、round 2 pass（P0〜P3 0）。`.workbench/code-review/iss-00028-cp1/`
- 実機（2026-11-14、`orca --version` 1.4.258。`npm run trial -- --tailscale-ip <IP> --orca-port 8793 --page-port 47910 --forbidden-port 47911`。ヘッドレスの Chrome は `--disable-features=MacAppCodeSignClone` で起動し、CDP で動かした。数と結論だけを書く）：
  - 写し（send-test の Claude、iframe だけを切り出し、会話の欄・題名・セッションはぼかした）。SpecDock のダッシュボード（`chemitaro/orca-web` の構造の図）と並べた。
    - [Mac の幅・明るい](artifacts/20261114t024349z--compare-1280-light.png)
    - [Mac の幅・暗い](artifacts/20261114t024348z--compare-1280-dark.png)
    - [390px・明るい](artifacts/20261114t024349z-02--compare-390-light.png)
    - [390px・暗い](artifacts/20261114t024349z-01--compare-390-dark.png)
  - 4つの場合（1280px と 390px、明と暗）のすべてで同じ結果だった。
    - 詳細は畳まれ、open の属性がない。
    - 見出しの印は1つで、経過の文字は0。
    - 送るボタン（aria-label「送る」）が見える。
    - 横のはみ出しは0、はみ出す要素も0。確認の画面の要素は0。
    - 会話の時刻は8つすべてが now・Nm・Nh・Nd で、日本語の経過は出ない。
    - 背景は明 rgb(255,255,255)、暗 rgb(17,19,24) で、SpecDock と同じ値。字体はどちらも `"BIZ UDPGothic", …`。
    - placeholder は、キーボードの端末で「Claude に送る（Enter で送信、Shift+Enter で改行）」、タッチの模擬で「Claude に送る」。
  - 送信（試し専用の `.workbench/trial/settings.json` だけ `sendEnabled: true`。送る前に `orca terminal list` と状態の API で、send-test のエージェントが2つだけで、handle が許された2つと一致することを確かめた）：
    - Claude（1280px、キーボード）：1行目を書いて Shift+Enter を押すと、改行が入り（2行）、送られなかった。続けて Enter を押すと1回で送られ、`input_accepted`。欄が空になり「送りました（入力を受けた）」と出た。
    - Codex（390px、タッチの模擬・暗）：Enter で改行が入り、送られなかった。送るボタンで送られ、`submitted`（stages input_accepted・turn_started）。
    - 試しの `sends.jsonl` は 0 行から 4 行になった（送る前と後が2組）。どちらの会話にも、送った時刻の利用者の行と、その後の返事の行がある（中身は写していない）。業務中のエージェントには送っていない。
  - 常駐の orca-web（8791）と、その設定と登録には触れていない。

## 本人に開いてほしい URL と、見てほしい点

試しのサーバーは動いたままにしてある（iss-00027 の試しとは別の port）。試し用の orca-web の送信は有効（試し専用の設定だけ）。

- Mac：`http://127.0.0.1:47910/`（send-test の丸を押すと横の欄に詳細とチャット）、`http://127.0.0.1:47910/phone.html`（幅 390px の枠）
- スマホ（tailnet）：`http://<Tailscale の IP>:47910/`（実際の IP は統括への報告に書く）
- 見てほしい点：詳細が畳まれていること。入力欄と送るボタンの見た目と使い心地（Enter、Shift+Enter、日本語の変換、スマホの送るボタン）。SpecDock と並べたときの色と字体。送り先は `send-test` の2つだけにしてください。
- 止め方：`kill -TERM $(cat <orca-web の worktree iss-00028>/.workbench/trial/trial.pid)`。止めた後、試しの送信を使わないなら `.workbench/trial/` を消す。

## Residual Risks / Follow-ups

- 確認の画面をなくしたので、利用者が宛先を目で確かめる機会は、題名と会話を見ることだけになる。同じタブの中の入れ替わりは指紋で止めるが、別のエージェントの小窓を開いていることには気づけない（埋め込む側の題名と会話で示す。requirement の risks）。
- タッチが主の端末の判定（`(hover: none) and (pointer: coarse)`）は、外付けのキーボードをつないだ iPad などで Enter が改行になる（Cmd/Ctrl+Enter と送るボタンで送れる）。実物の iPhone の Safari での見え方は、本人の確かめで見る（この確かめは Mac の上の模擬）。
- (f) の Orca の withdrawn の形は、Orca のソースが手元にないので確かめていない。unknown（card_gone）にして送り直しを誘わない形にした。構造化 Chat の実機の確かめは、セッションが用意されたときに行う。
- 試しの orca-web は、同時に開ける会話の数に上限がある。多くのタブで同時に開くと、読めない（busy）になる（写しを撮るときに出た。既存の動き）。
- iss-00014 の最終品質ゲートの P3 の2つ（試しの画面の空の横の欄、残った pid のファイル）は、この Issue の範囲の外なので直していない。
- ChatGPT の仕様のレビューは得られなかった（共有の spec-dock/canonical が動き続けるため）。仕様の Strict のレビューを使うには、Issue ごとに固定できる置き場が要る。
