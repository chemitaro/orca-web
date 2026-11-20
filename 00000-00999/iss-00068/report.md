---
種別: レポート（Issue）
ID: "iss-00068"
関連GitHub: ["#68"]
最終更新: "2026-11-20"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- worker に結ばれた構造化 Chat のタブ（chat-tab）の `model`・`effort` を、その worker の起動の記録（`startOptions.launch.effective`、なければ `requested`）から出すようにした（`src/state/normalize.ts` の chatTab）。実物の Antigravity の worker で `gemini-3.8-flash-low`・`low` が出た。端末のタブの読み取りは変えていない。

## レビュー記録

- 仕様レビュー（spec-reviewer、Opus / medium、standard なので1人）：合格。round-1 で P0 0・P1 0・P2 1・P3 1（`.workbench/spec-review/iss-00068/round-1.json`、検査 `round-1.check.json`）。
  - 合格した文書の sha256：requirement.cue `864e7834f33ffadc9ffba16790a83fffef82dc49ff7912091bb41dbed073cacf`、design.cue `dde2fe5f375cfd401eae611590e186f63a3ec0f30d8cda332e3b3c0e0c8c96d3`、plan.cue `91b2f26eb8b64d15f1a1c53212cc0370a1013fa96ffe090d19f451085b54d95c`（コードの HEAD は 58275ea）。
  - P2（マージの担い手が AGENTS.md の『PR のマージは利用者が行う』と食い違う）：統括の依頼書のとおり、本人が統括にマージを委任済み。記録だけにする。P3（T-02 の番号が既存のテスト名と重なる）：記録だけにする。

- 最終品質ゲート：キャンペーン `.workbench/final-quality-gate/iss-00068-fqg/`（範囲 `58275ea..d8d44f2`）の attempt 1 で合格。合格のコミット `d8d44f20b6f6a251fbc21f34c14153b1a31273df`。主（quality-gate-reviewer、Opus / medium、観点 functional-correctness・requirements-closure・test-adequacy・compatibility-regression）pass、指摘 0。2人目 ChatGPT GPT-6 / Extra High（chatgpt-code-review-strict、GitHub の SHA の一致を確かめた）pass、指摘 0。テスト lint 0・test 1126/1126・build 0。closure：`.workbench/final-quality-gate/iss-00068-fqg/closure.md`（写し `artifacts/closure.md`）。記録だけのコミットはない。PR の直前に origin/main を確かめ、58275ea のまま。
- 区切りのレビュー：なし（計画のとおり）。
- PR #69（https://github.com/chemitaro/orca-web/pull/69、head d8d44f2 = 合格のコミット）：CI 合格（observer exit 0、run 44656093048 success、MERGEABLE、merge_readiness READY）。マージは統括が行う。

## Verification

- S-01（実装担当 Codex GPT-6.2 Sol / medium、ctx_25c3547c310b、launch.effective codex / gpt-6.2-sol / medium、コミット d8d44f2）：`normalize.ts` の `chatTab` で、結んだ worker の起動の記録から model・effort を作る。テストを5件足し、`structured-worker.test.ts` の T-02 の期待（結ばれた chat-tab が no-source）を新しい振る舞いに直した。基準（58275ea）は lint・test 1121・build 合格、変更後は test 1126 合格・失敗 0。
- 実物で確かめた事実（2026-11-20、Orca 1.4.263、agy 1.5.12）：
  - Antigravity のエージェントは構造化 Chat（タブの type `agent-session`、`agent: "antigravity"`）として動く。タブの項目は type・id・title・sessionId・agent・isActive・chatStatus だけで、model・effort・agentStatus・providerSession はない。`orca worktree ps` の行にもない。
  - worker として起動したものは `worker-show --full` の `startOptions.launch.requested`・`effective` に `{agent: antigravity, model: gemini-3.8-flash-low, effort: low}` が出る（タスク担当の試しの worker と統括の試しの送り先の両方）。
  - `agentSession.history` の利用者の送信の `options` に、画面で選んだ推論の深さ（`effort: medium`）が出ることがある。モデルは出ない（状態のポーリングは会話を読まないので使わない）。
  - `agy models` の id は推論の深さを含む形（`gemini-3.8-flash-low` など）。Gemini CLI はこの PC にない。
- S-02（タスク担当、T-04）：試しの orca-web（port 8798、専用の settings、sendEnabled は偽のまま）を d8d44f2 で起動し、`/api/state` を読んだ。統括の試しの送り先（ctx_972dbcac8726、Antigravity）の chat-tab：`model` gemini-3.8-flash-low、`effort` low、どちらも source workerLaunch、field `startOptions.launch.effective.*`、meaning launch-resolved、readings 2。worker の構造化 Chat の Claude・Codex の chat-tab にも起動の値が出た（例 codex gpt-6.2-sol / medium）。worker のない chat-tab（Antigravity 2件を含む）は no-source のまま。端末のタブ 43件の model・effort は、常駐の orca-web（8791、58275ea 相当）と完全に一致した。試しの orca-web は止めた。送り先には何も送っていない。

## 逸脱と判断

- 範囲の広がり（統括の了承、2026-11-20）：種類によらない形にしたので、Epic の R-04（Antigravity・Gemini）を超えて、worker の構造化 Chat の Claude・Codex などの chat-tab にも起動の記録の model・effort が出る。端末のタブの読み取りは変えていない。
- 統括の条件2（Claude の chat-tab で providerSession.effort と起動の記録の両方があるときの順）：chat-tab ではタブの agentStatus を読まず、起動の記録だけを出どころにする（F-02）。テスト T-01 で、agentStatus を与えても起動の記録の値と出どころになることを確かめた。

## Residual Risks / Follow-ups

- worker でない Antigravity の Chat（利用者が開いたもの）は、Orca がタブにモデルを出さないので no-source のまま。Orca がタブに出すようになれば、別の Issue で読む。
- 試しの orca-web の起動直後の数回は、起動の記録を回ごとに上限の数だけ読むため、まだ読んでいない worker が source-failed と出て、次の回で値に変わった（今のポーリングの振る舞いで、端末のタブも同じ）。
- Antigravity のモデルの id は推論の深さを含むので、model と effort に同じ深さが重ねて見える（id は解かない）。
