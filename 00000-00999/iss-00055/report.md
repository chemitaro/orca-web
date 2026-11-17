---
種別: レポート（Issue）
ID: "iss-00055"
関連GitHub: ["#55"]
最終更新: "2026-11-18"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- (a) 端末の承認の部分は、タブの `agentStatus.providerSession.id` が読んでいる会話のセッションと同じときだけ付く（セッションの切り替え直後に古い会話の末尾へ付かない）。
- (b) 常に許可の確かめの段で送れなくなると（sendEnabled 偽など）、「<ラベル>で答える」が押せず理由が出る。「やめる」は押せる。
- (c) 質問と承認のカードは、確定の 5xx のうち送る前の拒みと分かる識別子（unsupported・unknown_shape・unreachable・record_failed・record_unreadable）だけを押し直せる形にし、ほか（internal_error など）は結果不明（キーの列は partial）にする。
- (d) 答えの流れに時間切れ（意図 30 秒、確定 60 秒、キーの列の確定 5 分）。意図の時間切れは押し直せ、確定の時間切れは結果不明。自動で送り直さない。
- (e) `/api/answer/*` の本文の上限を 640KiB に上げ（ほかの口は 128KiB のまま）、画面は答えの JSON が 512KiB を超えると送らず「答えが長すぎます（その他の文の合計を短くしてください）」を出す。
- (f) 端末のキーの組は、1組目の前にも前面のプロセスを読み直す。
- (g) 端末のキーの組の門は、キーの組が使う RPC の method_not_found だけで止まる（今の送信の照会の `orchestration.requestShow` では止まらない）。
- (h) カードの「Orca で開く」は高さ 44px（見出しと受け箱は 28px・24px のまま）。
- コミット：4bb30f8（サーバー、S-01）、8088bff（画面、S-02）、9bb76fa（README.md・AGENTS.md、S-03）。

## レビュー記録

- 仕様レビュー（spec-reviewer、Opus 5.5 / high、standard なので1人）：合格。round-2 で P0〜P3 がすべて0（`.workbench/spec-review/iss-00055/round-2.json`、検査 `round-2.check.json`）。
  - 合格した文書の sha256：requirement.cue `b3e9d3581cf364a512834855242a265f20acd64b1256be6c831e5c99f9f056e5`、design.cue `168fa2588ba9b812207878977be9426b8a40e96d9d73bf3fc3c49e15948937a7`、plan.cue `4fe2066835a226004444ec64548fdbb51de0f4b5bf767465d9607dad5b546382`（コードの HEAD は 253a1a6）。
  - round-1：合格（P2 2件：新しい長さの確かめが後の発言の 16KB の言葉を出す、T-10 が実機で出せないカードを前提にする。P3 2件）。P2 を直して確かめ直した（`review-response.md`）。
  - round-2：合格、指摘なし。
- 範囲の知らせ：iss-00048 の P3（FQG-01）と P2-d は範囲外として外す。統括の了承（2026-11-18、msg_ba0601d1f97d）。

## Verification

- 開始のコミット 253a1a6 の基準：lint 0、test 1007/1007、build 0（実装担当の記録 `.workbench/implement/iss-00055/start.md`）。9bb76fa：lint 0、test 1027/1027、build 0。
- 描画（S-02、実装担当）：一時の orca-web（偽の会話、sendEnabled 偽）とヘッドレスの Chrome で、幅 1280・390 の明暗の4通り、カードの「Orca で開く」は高さ 44px で枠の中、見出しは 28px のまま、横スクロールなし（`artifacts/card-open-*.png`、`card-open-measure.json`）。
- T-10（S-03、タスク担当、2026-11-18）：試しの orca-web（`.workbench/trial-55/harness.ts`。偽の構造化 Chat の承認と一時の settings。送る口は投げるだけで何も送らない）で、「Allow for this session」を押して確かめの段を出し、settings の sendEnabled を偽に変えて status の読み直し（15 秒）を待った。幅 1280・390 の明暗の4通りすべてで、変える前は「<ラベル>で答える」が押せ、変えた後は disabled、「やめる」は押せ、理由『送信が無効です（設定の sendEnabled が偽）』が出て、横スクロールなし（`artifacts/confirm-{enabled,disabled}-*.png`、`confirm-measure.json`）。実物の Orca と試しのエージェントは使っていない（承認の確かめの段は構造化 Chat の worker が確認なしで動くため実機で出せない。iss-00050 と同じ）。

## 逸脱と判断

- S-01 の実装担当：Codex GPT-6.1 Sol / medium（ctx_e47e891dd0fa）が chat-scratch の symlink の拒否で、何も変えずに止まった。計画の rationale と統括の了承のとおり worker-stop し、Claude Opus 5.5 / medium（ctx_a14a3d41c2ce）に切り替えた。
- S-01：既存の答えの口の 413 のテスト（131073 字）は R-05 とぶつかるので大きさだけ 640KiB+1 に直した（413 の主張は保つ）。answerKeys の既存テスト2件は、1組目の前の前面の読みの分を偽の口の列と回数の期待に足した（計画が許す調整）。
- S-02：既存の T-12 の deepEqual に足した項目 `disabled: false` を加えた。web/ の中の 60_000 の書き方を禁じる既存テストのため、時間切れを `30 * 1000` などと書いた。
- S-01・S-02 のコミットの文は git-autocommit の生成のまま。

## Residual Risks / Follow-ups
