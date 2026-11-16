---
種別: レポート（Issue）
ID: "iss-00039"
関連GitHub: ["#39"]
最終更新: "2026-11-16"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

構造化 Chat の1人を、正規化（`src/state/normalize.ts`）で Orca の式の paneKey によって1つの chat-tab にまとめ、操作できない untabbed（`structured-agent-session-…`）を状態・要約・受け箱・Run の木・稼働の印・埋め込みに出さなくした。古い id の `/embed/agent` は正の id へ 302 で転送する（`src/server/app.ts`）。会話・送信の API は古い id に `agent_not_found` を返す（前から使えなかった）。

- コミット：54ebd0c（S-01）、bdf38ef（S-02）、2aa3014（S-03 の文書）。開始のコミット 373a2c7。
- 実装担当：Codex GPT-6.1 Sol / medium（dispatch ctx_1954002d7d22、launch.effective gpt-6.1-sol / medium）は chat-scratch の symlink の拒否で exec_command を起動できず、コミットなしで止まった。計画の切り替えの条件どおり worker-stop し、Claude Opus 5.5 / medium（dispatch ctx_9bb1f36907ae、launch.effective claude-opus-5-5 / medium）が S-01・S-02 を行った。S-03 はタスク担当（Claude Opus 5.5 / medium）。

## Verification

- `npm run lint` 0、`npm run build` 0、`npm test` 698 中 698 合格（タスク担当が 2aa3014 の前の bdf38ef で確かめた）。実装担当の基準（373a2c7）では test/tools/trial.test.ts の1件が既存の不安定で失敗（単独では合格）。
- 実物（読むだけ、2026-11-16）：常駐の orca-web（直す前、main 相当）と、この worktree の一時の orca-web（直した後、127.0.0.1 だけ・一時の port・送信は無効）の `GET /api/worktrees/summary` を同時に読んだ。

| | 直す前 | 直した後 |
|---|---|---|
| worktree の数 | 55 | 55 |
| total が変わらない worktree | — | 48 |
| total が減った worktree | — | 7（3→2、2→1 ×4、3→1、4→2） |
| `structured-agent-session-` の id | 9 | 0 |
| total の合計 | 66 | 57 |

  減った分（9）は、消えた `structured-agent-session-` の id の数と同じ。chat-tab の数は同じ時刻の読みで変わらない。3→1 の worktree は、直す前の structured 2 のうち1つが、常駐の orca-web の古い読み（常駐の取得元は最大1時間ほど古く、この時刻 Orca の応答が遅い）にだけ残ったセッションで、一時の orca-web の新しい読みにはなかった。
- 古い id の `/embed/agent?id=<structured-agent-session-…>&theme=dark` を一時の orca-web で読むと、9件のうち8件が 302・Location `/embed/agent?id=chat%3A…&theme=dark`。1件は一時の orca-web の新しい読みにないセッション（上と同じ古い読みの分）で、仕様どおり 200 の画面。一致しない古い形の id も 200。
- 送らず、Orca で開くを呼ばなかった。会話の API は、この時刻 Orca の応答が遅く、どちらの id も unreachable で差を実機で示せなかった（コードと単体のテストで確かめた）。

## Residual Risks / Follow-ups

- Orca が paneKey の式を変えると、まとめが効かず今の2つに戻る（悪くはならない）。
- 転送先は URLSearchParams で組み直すので、ほかの引数の空白などの符号化が `+` に変わりうる（意味は同じ）。
- 逸脱：Codex の実装担当を Claude Opus 5.5 / medium に切り替えた（統括が了承済み）。文書のコミット 2aa3014 は `git-autocommit` を使わず通常の `git commit`（フックは通した）で作った。

## レビュー記録

- （前の作業の記録。本人の再判断と新しい事実で要件を直したので、この合格は使わない）spec-review：合格 round 1（spec-reviewer、Claude Opus 5.5 / medium）。requirement.cue `dc46994a…cd0255`、design.cue `d2de551d…2705`、plan.cue `1adc2b00…74453`。P0 0・P1 0・P2 0・P3 1（「sessionId を文書に出さない」の制約が、paneKey と chat の id に sessionId が含まれることと字面で食い違う。意味は「新しい項目として出さない」）。`.workbench/spec-review/iss-00039/round-1.json`
- spec-review：合格 round 1（作り直しの系列、spec-reviewer、Claude Opus 5.5 / medium）。requirement.cue `b42c5c04…6666`、design.cue `d2de551d…2705`、plan.cue `1160df21…693d`。P0 0・P1 0・P2 0・P3 1（転送先の Location の符号化が要件の encodeURIComponent と設計の URLSearchParams で字面が違う。`:` の扱いは同じ値の `%3A`）。`.workbench/spec-review/iss-00039-r2/round-1.json`
- final-quality-gate：合格 2aa3014（campaign `.workbench/final-quality-gate/iss-00039/`、review-r2 で P0〜P3 0件）。test lane は手元の負荷で `npm test` が落ちたため、統括が了承した逸脱として PR #40 の CI（run 43801129986、698/698）を証拠にした。詳細は closure.md。
- PR：https://github.com/chemitaro/orca-web/pull/40（head 2aa3014、CI success、マージは統括が行う）。
