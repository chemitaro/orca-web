# closure：iss-00039 final-quality-gate

- campaign：`.workbench/final-quality-gate/iss-00039/campaign.json`（schema 2、assurance standard、second_opinion none）。範囲 `373a2c7..2aa3014`。
- 合格のコミット：**2aa3014991a0d0ff42f115d86da5ee63e4c2307e**（PR #40 の head）。記録だけのコミット：なし（記録は Scope の中で、Git の外）。
- レビューの道（quality-gate-reviewer、Claude Opus 5.5 / medium）：attempt 01。最初の `review.json` はスキーマの外の項目で検証の exit 20（機械の失敗で、指摘ではない）。同じレビュアーが `review-r2.json` に書き直し、`review-r2.check.json`：status pass、coverage_complete true、P0 0・P1 0・P2 0・P3 0、next_obligations なし。
- テストの道：
  - `npm run lint` exit 0、`npm run build` exit 0（手元の5回すべて）。
  - `npm test`：手元では5回とも exit 1。この Mac の負荷（load average 約550、30分以上続いた）で、時間に敏感なテストが落ちた。
    1. run1：「health 不応答・子の早い終了・使用中の画面ポートで起動分を片付けて1」（test/tools/trial.test.ts）、「keepalive の行は時間切れを延ばし、時間切れより遅い応答も受ける（FQG-002）」（test/orca/rpc.test.ts）
    2. run2：「SSE の道は snapshot の文書を送り、足された件を appended で送る。CORS を付けない」（test/server/transcript-api.test.ts）
    3. run3：「health 不応答…」、「起動は設定を初期化し、SIGTERM で子とサーバーと pid を片付ける。既存設定は保つ」（test/tools/trial.test.ts）
    4. run4：「health 不応答…」
    5. run5（`attempts/01/tests/manifest.json`、validator exit 10）：「health 不応答…」、「起動は設定を初期化し…」
  - 開始のコミット 373a2c7（`git archive` で取り出した写しで、同じ node_modules）で `npm test` を1回走らせると、686 中 3 件が落ちた：trial.test.ts の「health 不応答…」と「起動は設定を初期化し…」（上と同じテスト）、ほかに「main は SendService を HTTP に接続し、停止中の意図は403、照会は使える」。rpc.test.ts と transcript-api.test.ts は、その1回の基準では落ちなかった。どちらも 373a2c7 で 13/13・14/14 合格する。
  - 単独で走らせると、HEAD で trial.test.ts 6/6、transcript-api.test.ts 14/14、rpc.test.ts 13/13 がすべて合格した。落ちた3つのファイルは、このブランチで変えていない（`git diff 373a2c7 HEAD` に出ない）。bdf38ef（src と test は 2aa3014 と同じ。2aa3014 は README.md と AGENTS.md だけを変えた）では、手元で 698/698 合格した。
  - **test lane の証拠（逸脱、統括が了承 2026-11-16）**：PR #40 の head 2aa3014 での GitHub CI（run 43801129986、workflow CI、conclusion success）。CI の作業のコミットは cab52b1（2aa3014 を 373a2c7 にマージしたもの）。`npm run lint` 合格、`npm test` は tests 698・pass 698・fail 0、`npm run build` 合格。observer の結果：observable_ci PASS、merge_readiness READY（`.workbench/coding-task/iss-00039/ci.json`）。
- P2/P3：なし（final-quality-gate）。仕様レビューの P3 は1件（report.md）。
