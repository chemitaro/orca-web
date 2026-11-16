---
種別: レポート（Issue）
ID: "iss-00043"
関連GitHub: ["#43"]
最終更新: "2026-11-17"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

要約（`GET /api/worktrees/summary`、版 v1 のまま）の各 worktree に `main`、各エージェントに `parent {id, worktreeId}`（`parentPaneKey` と `paneKey` の完全一致がちょうど1つのときだけ。なければ null、見えなければ `{id: null, worktreeId: null}`）と `startedAt`（端末のタブの Orca の `firstStateStartedAt`／`stateHistory` の先頭 → 状態の文書の新しい Fact `sessionStartedAt`。なければ `src/summary/started.ts` の `FirstSeenStartTimes` が初めて見た `stateStartedAt`）を足した。稼働の印の部品の並びを `orderAgents`（関係なしを新しい順に左、関係ありを右に根から深さ優先、兄弟は新しい順。状態の重さの `ORDER` は削除）にし、印の要素に `data-agent-id` を付けた。README と AGENTS.md を合わせた。

- コミット：6a6f5d0（S-01）、f1c95bd（S-02）、c87e264（S-03 の文書）。開始のコミット c485804。
- 実装担当：Codex GPT-6.1 Sol / medium（dispatch ctx_ef439c5fe2eb、launch.effective codex / gpt-6.1-sol / medium）は chat-scratch の symlink の拒否で最初の exec_command が UnsupportedOperation となり、変更なしで止まった（outcome failed）。計画の切り替えの条件どおり worker-stop し（既に settled）、Claude Opus 5.5 / medium（dispatch ctx_94debec0375a、launch.effective claude / claude-opus-5-5 / medium）が S-01・S-02 を行った。S-03 はタスク担当（Claude Opus 5.5 / medium）。
- 判断（実装担当）：D-05 は偽の DOM でも動くよう `dataset` ではなく同じ結果の `setAttribute('data-agent-id', …)`。`orderAgents` を部品の入口（`agent-marks.js`）からも書き出した。
- 判断（タスク担当）：受け箱と Run の木は印の部品の並びを使っていない（状態の印 `stateIcon` だけ）ので、並びの変更は部品を使う画面（SpecDock、`/embed/agent` の見出し）に効く（requirement.cue decisions）。

## Verification

- `npm run lint` 0、`npm test` 730 中 730 合格、`npm run build` 0（タスク担当が f1c95bd で確かめた）。基準（c485804）は lint 0・713/713・build 0（実装担当）。
- 実物（読むだけ、2026-11-17）：常駐の orca-web（直す前、main 相当）と、この worktree の一時の orca-web（直した後、127.0.0.1 だけ・一時の port・設定と送信の記録は .workbench の下・送信は無効）の要約を続けて読んだ（`.workbench/iss-00043/live.mjs`）。一時の orca-web は読んだ後に止めた。

| | 直す前 | 直した後 |
|---|---|---|
| worktree / エージェント | 54 / 57 | 54 / 57 |
| `parent` の項目のあるエージェント | 0 | 57 |
| parent が null / 解けた / 見えない | – | 51 / 6 / 0 |
| 解けた親の worktreeId が同じ要約にある | – | 6 / 6 |
| `main` が true / false / null | – / – / 54（項目なし） | 10 / 42 / 2 |
| `startedAt` のあるエージェント | 0 | 12（`since` のある 12 と同じ。残りはスリープ等で状態の始まりがない） |
| 2回の読み（6 秒あけて）で startedAt が同じ | – | 57 / 57 |
| 印の `data-agent-id` が `buildMarks` の並びと同じ | – | 54 / 54 の worktree（57 の印） |

  解けた組（Run `run_b7c4f4c08bbc` の今いるもの。id は略す）：

| 子（リポジトリ:ブランチ、種類/状態） | 親（リポジトリ:ブランチ、main） | 同じ worktree |
|---|---|---|
| orca-web:iss-00043（claude/working、このタスク担当） | spec-dock:main、main（統括 `claude_4d9…`） | いいえ |
| orca-web:iss-00043（claude/done、実装担当） | orca-web:iss-00043、main でない（このタスク担当） | はい |
| spec-dock:iss-00627（claude/working） | spec-dock:main、main（同じ統括） | いいえ |
| spec-dock:iss-00629（claude/done、タスク担当） | spec-dock:main、main（同じ統括） | いいえ |
| spec-dock:iss-00629（claude/working、実装担当） | spec-dock:iss-00629、main でない（上のタスク担当） | はい |
| tenting-cradle:iss-00025（codex/working） | tenting-cradle:main、main（別の統括 `claude_42d…`） | いいえ |

  報告書 §1.3（2026-11-16）の5組は、その後に解放されて今はいない（今の ps に同じ組はない）。同じ形（統括 → タスク担当、タスク担当 → 実装担当、別のリポジトリの統括 → Codex）の今の組がすべて解けた。
  同じ worktree の親子の並び（`orderAgents`）：orca-web:iss-00043 は「タスク担当 → 実装担当」、spec-dock:iss-00629 は「タスク担当 → 実装担当」で、上流が左。この時刻、同じ worktree に関係のないエージェントが一緒にいる例はなかった（その並びは単体テストで固めた）。
  要約の JSON に `paneKey` は出ない。送らず、Orca で開くを呼ばず、統括の連絡を既読にしなかった。

## Residual Risks / Follow-ups

- 構造化 Chat には Orca の開始の時刻がなく、orca-web の記憶に頼る。orca-web を立て直すと、その時の状態の始まりの時刻で覚え直し、並びが変わりうる。要約を読む人がいない間に始まったエージェントは、次に読んだ時の値になる。
- スリープなど状態の始まりがないエージェントは `startedAt` が null で、並びは要約の順（id の順）になる。
- 逸脱：Codex の実装担当を Claude Opus 5.5 / medium に切り替えた（統括が了承済み）。

## レビュー記録

- spec-review：合格 round 1（spec-reviewer、Claude Opus 5.5 / medium）。requirement.cue `17448496…05bb`、design.cue `065a92c8…2ff3`、plan.cue `8941f23f…bc86`。P0 0・P1 0・P2 0・P3 2（D-04 の startedAt は文字列だけを時刻として読む F-02 に従う／D-01 の stateHistory は先頭の要素だけを見る R-03 に従う。どちらも実装で要件の側に従う）。`.workbench/spec-review/iss-00043/round-1.json`
