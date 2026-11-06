# epic-00003 の報告（2026-11-06、統括）

## 結果
- iss-00005（PR #9）：雛形、CI、Orca のアダプター、機能の確かめ、録画と再生。実機：model は出ない（担当の起動値だけ）、effort は Claude だけ、スリープ中は pending-handle、端末は handle で結ぶ、nativeChat.readSession は読める。
- iss-00006（PR #11）：`GET /api/state`、項目の一覧と選択、読み取りの CORS、Host の確かめ。
- iss-00007（PR #10）：書き込みの守り、`POST /api/open`、単独のボタン（`/embed/open-button`）。タブのない worktree で Orca が最初の端末を作るのは許す（統括の判断、R-04 に反映）。
- iss-00008（PR #15）：launchd の LaunchAgent、待ち受けは 127.0.0.1 と Tailscale の IP の2つだけ、`/api/health`、README、AGENTS.md。

## 導入（2026-11-06）
- 利用者が `npm run service:install` を実行。node に外付けのディスク（リムーバブルボリューム）の読み取りの許可が要り、利用者が macOS で許可した。
- `/api/health` は ok、待ち受けは 127.0.0.1:8791 と Tailscale の IP:8791 の2つ、`/api/state` が答える。

## 残り
- 利用者の確かめ：スマホでの表示、ログインし直した後の常駐。
- PR #15 はふつうのマージで、本物の Tailscale の IP を含むコミット 78a6e3f が main の履歴にある（最新のファイルにはない）。tailnet の中だけのアドレスなので残す。
- iss-00008 の FQG の P3（restart の失敗の経路のテスト）。
