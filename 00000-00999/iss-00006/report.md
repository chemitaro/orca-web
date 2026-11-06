---
種別: レポート（Issue）
ID: "iss-00006"
関連GitHub: ["#6"]
最終更新: "2026-11-06"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

orca-web の状態の API と、選んだ項目だけを表示する簡単な画面を作った。

- Orca の読み取り（`src/orca/read-state.ts`）：取得元（`repos`、`worktrees`、`worktreePs`、`terminals`、`tabs`、`runs`、`tasks`、`workers`、`workerLaunch`）ごとに、
  `ReadOnlyOrcaCli` と `ReadOnlyRpc` だけで読み、その場で決めた項目だけに減らす（プロンプト、ツールの入力、最後の応答、Task の spec と result、transcript のパス、端末の preview は拾わない）。
  `run-list` と `worker-list` はカーソルを最後まで読み、カーソルのない一覧は `truncated` なら `totalCount` まで上限を上げて読み直す。
- 正規化（`src/state/normalize.ts`、型は `model.ts`、`schema: "orca-web.state/v1"`）：各項目は `{ value, source, field, missing }`。鮮度は取得元ごと（`sources`）。
  モデルと推論は `readings` に意味（`current-selection`、`last-observed`、`launch-resolved`、`launch-requested`）と取得元つきで並べ、取れなければ null と欠けた理由。
- 共有のポーリング（`src/state/poller.ts`）：fast（タブ、ps、端末）5秒、orchestration 10秒、slow（repo、worktree list）60秒。見る人がいなければ 30秒・30秒・120秒。
  途中の読みを共有し、取得元ごとに最後に成功した値を残す。`worker-show` は Dispatch ごとに覚え、終わって端末を返した担当は読まない。終わった Run の `task-list` は slow の間隔で読む。
- 項目と設定（`src/state/fields.ts`、`settings.ts`）：`GET /api/fields`、`PUT /api/settings/fields`。設定は `~/Library/Application Support/orca-web/settings.json`（`ORCA_WEB_SETTINGS_FILE` で変えられる）に、一時ファイルから名前を変えて書く。
- HTTP（`src/server/`）：`GET /api/state`、読み取りの CORS（`ORCA_WEB_READ_ORIGINS`、既定 `http://127.0.0.1:47800`、完全一致だけ）、`/api/` の Host の確かめ（selfHosts でなければ 421）、
  書き込みの小さな守り（`same-origin-write.ts`：JSON の Content-Type と、要求の Host と完全に一致する Origin だけ）、静的な画面（決めた4つのファイルだけ）。
- 画面（`web/`）：`view.js`（純粋な表の組み立て）、`main.js`（5秒ごとの読み直し、項目の選択と保存、接続の状態と鮮度）、`style.css`（明るい・暗い、幅 390px）。
- AGENTS.md の古い一文（iss-00005 の FQG-003）を今の形に直した。
- 録画の検査（`sanitize.ts` の `isSafeString`）に、Orca の時刻の文字列と、仮名の値だけの JSON の配列の文字列（Task の deps）を残す規則を足した（テストつき）。

### iss-00007 との関係

開く口と、短期のトークンなどの一般の書き込みの守りは作っていない。項目の選択の保存だけが書き込みで、守りは `src/server/same-origin-write.ts` に閉じた小さな形にした。
Host の確かめ（`app.ts` の selfHosts）は、DNS の付け替えへの守りとして `/api/` のすべての口に入れた。iss-00007 が一般の守りを作るときに、この2つを使うか置き換える。

## 実機の確かめ（読むだけ）

2026-11-06、この Mac の Orca 1.4.251（CLI も 1.4.251）。`PORT=18791` と一時の設定のファイルでサーバーを起動し、`/api/state` を読んだ。Orca に送ったのは読むコマンドと `session.tabs.listAll` だけ。値は件数だけを書く。

- 接続：`connected`、`stale: false`。9つの取得元すべてが成功、`truncated` なし。`readState` と `readTabs` は使える。応答は約 390KB、キャッシュからの応答は数ミリ秒。
- 件数：repo 16、worktree 70（CLI の `worktree list` と `worktree ps` の 70 と一致）、エージェント 47、Run 16、Task 116、担当 118。
- エージェントの置き場：端末のタブ 44、構造化 Chat のタブ 2、タブのない行 1。端末：つながっている 13、復元待ち（`pending-handle`）31。状態が取れたのは 15（working 5、done 10）、復元待ちの 31 などは `not-provided`。
- 種類：すべて Claude Code（`agentStatus.agentType` 12、`launchAgent` 31、chat の `agent` 2、ps 1）。1件は agentStatus に種類がなく null（`not-provided`）。**今は Codex が動いていない**ので、Codex は実機では確かめていない（録画のテストで確かめた）。
- オーケストレーションの担当：エージェントのうち 6件が担当に結び付いた。モデルは 6件すべて `launch-resolved`（`workerLaunch`）。担当の一覧 118件のモデルは、`launch-resolved` 49、`not-fetched`（終わって端末を返した担当）62、`not-provided`（起動の値のない古い担当）7。
- モデル：担当でないエージェントはすべて null（`not-provided` 37、chat と ps の行は `no-source` 3）。iss-00005 の結論（`agentStatus.model` は出ない）と一致した。
- 推論：`current-selection`（`providerSession.effort`）13（担当 6、ふつう 6、種類の欠けた 1）。復元待ちの Claude Code は `not-provided`。
- worktree：PR 22、CI は success 18、failure 3、pending 1。repo の remote の鍵は 16件中 12件（残りは remote がない）。Task の deps と時刻はすべて読めた。
- CORS：Origin `http://127.0.0.1:47800` は 200 で `Access-Control-Allow-Origin` がそのオリジン、`Vary: Origin`。`:47801`、`https://127.0.0.1:47800`、別の名前は 403。Host `evil.example` は 421。SpecDock のオリジンからの PUT は 403。
- 画面（headless Chrome を CDP で操作）：既定の 16項目で worktree・エージェント・担当の3つの表。`agent.model` と `worktree.branch` だけを選んで保存すると、表が worktree（ブランチ）とエージェント（モデル）の2つの列だけになり、再読み込みの後も残った。サーバーを作り直しても `GET /api/fields` の選択が残った。幅 390px で横のはみ出しなし（scrollWidth 390）。
- Orca に届かないとき（`ORCA_BIN` を存在しないパスにした別のサーバー）：`/api/state` は 200 で `connection.state: "unreachable"`（`orca status: spawn-failed`）、`stale: true`、空の一覧、取得元は `lastSuccessAt: null` と誤り。実際の Orca は止めていない（利用者の環境を変えないため）。前に読めた値が残ることは、録画のテストで確かめた。

## Verification

- 仕様のレビュー（spec-review、spec-reviewer opus / medium、CUE は sha256 で固定）：round 1 は pass（P0・P1 0、P2 3・P3 1）。P2・P3 を小さく直して round 2 も pass（P0・P1 0、P2 1・P3 2）。残りの文の食い違いも合わせた（最終の sha256：requirement 3d78217a…、design 84c09a50…）。
- コードのレビュー（code-review、code-reviewer sonnet / high、standards と spec の2人、範囲 2e5fc64..c860e2b）：どちらも pass。standards は指摘 0。spec は P3 2（画面が終わった Task と担当を黙って隠す、最初の読みの途中の /api/state が空を返す）。2件とも 206bbfb で直した（テストつき）。
- 最終品質ゲート（final-quality-gate、quality-gate-reviewer opus / high、1人、ChatGPT なし）：campaign `iss-00006-fqg-1`、試み1で **合格**。合格したコミットは `206bbfb37e8593e09f5a5c739cb26ecf5ce7d8f0`。
  - レビューのレーン：status pass、coverage complete（functional-correctness、requirements-closure、test-adequacy）、P0 0・P1 0・P2 1・P3 2。
  - テストのレーン（同じコミット）：`npm run lint` exit 0、`npm test` exit 0（105件すべて成功）、`npm run build` exit 0。
  - P2・P3（情報のみ）：FQG-001 CLI の stdout が JSON でないとき、Orca の生の stdout が取得元の誤りの文として応答と画面に出うる。FQG-002 録画の検査の JSON の配列の規則が、短い語の並びを安全と判定する。FQG-003 `/api/state` が `noteViewer` を呼ぶ配線のテストがない。
- 実機：上の「実機の確かめ」。
- PR：https://github.com/chemitaro/orca-web/pull/11（head 206bbfb）。CI（GitHub Actions の CI、run 42202184714）は success、GitHub のマージの状態は CLEAN（2026-11-06T10:23Z に確かめた）。

## Residual Risks / Follow-ups

- `/api/state` の応答は、この Mac で約 390KB（Fact の形で各項目に取得元と理由を付けるため）。SpecDock が 5秒ごとに読むと、手元の転送としては問題ないが、要るなら `fields` での絞り込みや worktree の絞り込みを後で足す。
- Codex のふつうのエージェントは、今は動いていないので実機で確かめていない（iss-00008 の実機の受け入れで確かめる）。
- Host の確かめは 127.0.0.1 と localhost だけ。Tailscale のアドレスで待ち受けるとき（iss-00008）は `extraHosts` に足す。
- 最後に読めた状態はメモリーだけに持つ。サーバーの再起動の後は、最初の取得まで空。
- Task の時刻の `YYYY-MM-DD HH:MM:SS` を UTC とみなしている。
- 最終品質ゲートの P2・P3（FQG-001〜003）は後の Issue で直す候補。特に FQG-001 は、誤りの文に Orca の生の出力を載せないようにする（iss-00007 か後の Issue）。
