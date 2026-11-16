---
種別: レポート（Issue）
ID: "iss-00044"
関連GitHub: ["#44"]
最終更新: "2026-11-17"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

構造化 Chat の作業者を、正規化（`src/state/normalize.ts`）で、worker-list の `resource.endpointIncarnation`（`structured:<セッション>`、`src/orca/read-state.ts` が内部の値で拾う）とタブの `sessionId` が同じ chat-tab の `agent.worker` に結んだ。同じセッションの worker が2つ以上なら結ばない。統括は `src/runs/links.ts` の `coordinatorAgent` が、`activeCoordinatorHandle` がないときだけ、根の task を新しい順に見て作業者のエージェントの `parentPaneKey` と `paneKey` が一致するエージェントに結ぶ。木（`tree.ts`）はこの1か所（`workerAgent`・`coordinatorAgent`）だけで探す。受け箱は今の探し方のまま、結んだ chat-tab にその Dispatch の質問が付く。

- コミット：9368eaf（S-01）、e6c847d（S-02）、e43869d（S-03 の文書）。開始のコミット 775226a。
- 実装担当：Codex GPT-6.1 Sol / medium（dispatch ctx_f3bcf2d8a212、launch.effective codex / gpt-6.1-sol / medium）は chat-scratch の symlink の拒否で exec_command を起動できず、変更なしで止まった（outcome failed）。計画の切り替えの条件どおり worker-stop し、Claude Opus 5.5 / medium（dispatch ctx_77d79395af97、launch.effective claude / claude-opus-5-5 / medium）が S-01・S-02 を行った。S-03 はタスク担当（Claude Opus 5.5 / medium）。

## Verification

- `npm run lint` 0、`npm test` 713 中 713 合格、`npm run build` 0（タスク担当が e6c847d で確かめた）。実装担当の基準（775226a）は lint 0・698/698・build 0。既存の木と正規化のテストの期待値は変えていない（`OrcaWorker` の新しい項目のため、手書きの値に `structuredSessionId: null` を足しただけ）。
- 実物（読むだけ、2026-11-17）：常駐の orca-web（直す前、main 相当）と、この worktree の一時の orca-web（直した後、127.0.0.1 だけ・一時の port・設定と送信の記録は .workbench の下・送信は無効）の `GET /api/runs` と全 Run の `GET /api/runs/<id>/tree` を続けて読んだ（`.workbench/iss-00044/count-tree.mjs`）。

| | 直す前 | 直した後 |
|---|---|---|
| Run の数 | 21 | 21 |
| 根の統括のうち agentId のあるもの | 0 / 21 | 2 / 21（どちらも chat-tab） |
| worker の節のうち agentId のあるもの | 0 / 299 | 6 / 299（すべて chat-tab） |
| 対象の Run（epic-00615 の調べの Run）の統括 | null | chat-tab に結ぶ |
| 対象の Run の worker の節 | 0 / 203 | 5 / 203 |
| chat-tab のうち worker のあるもの（状態の API） | 0 / 11 | 6 / 11 |

  端末の worker と統括で agentId のある節は、この時刻、どちらの読みでも 0（タブの残る端末の worker がない）。端末の結び付けは既存のテストと T-04 で固めた。状態の文書の JSON に `endpointIncarnation` と `"structured:` は出ない（直した後の読みで確かめた）。送らず、Orca で開くを呼ばず、統括の連絡を既読にしなかった。

## Residual Risks / Follow-ups

- /clear の後は、worker の系列の根のセッションと今の chat-tab のセッションが違い、結べない（F-02。null のまま）。
- 統括の推定は根の task の作業者の `parentPaneKey` に頼る。`coordinatorResolvedBy` は null のまま（木の文書の契約を変えない）。
- 受け箱の `linkedAgent`（`src/inbox/classify.ts`）は `links.ts` の `workerAgent` と同じ探し方を別に持つ（範囲外。結果は同じ）。iss-00043 は `links.ts` を使える。
- 逸脱：Codex の実装担当を Claude Opus 5.5 / medium に切り替えた（統括が了承済み）。文書のコミット e43869d は `git-autocommit` を使わず通常の `git commit`（フックは通した）で作った。

## レビュー記録

- spec-review：合格 round 1（spec-reviewer、Claude Opus 5.5 / medium）。requirement.cue `bd496e52…291a`、design.cue `096194a9…9397`、plan.cue `b1772ce7…ed47`。P0 0・P1 0・P2 0・P3 0。`.workbench/spec-review/iss-00044/round-1.json`
- final-quality-gate：合格 e43869d（campaign `.workbench/final-quality-gate/iss-00044/`、試み 01 で review P0〜P3 0件・coverage 完全、test lane の lint 0・713/713・build 0）。詳細は closure.md。
