---
種別: レポート（Issue）
ID: "iss-00073"
関連GitHub: ["#73"]
最終更新: "2026-11-24"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 原因1（構造化 Chat・質問・承認も含め全部止まった原因）：`CapabilityCache` が、Orca の再起動の途中の runtime ID の一致しない機能の判定を持ち、`orca-runtime.json` が新しい ID になった後も使い続けた。一致した報告だけを持つように直した（S-01 a5e525a、D-01）。以後は Orca の再起動のあと、orca-web を再起動しなくても揃った時点で戻る（T-01・T-02）。
- 原因2（端末だけ）：`orca agent launch` で起動した端末のタブは `session.tabs.listAll` に `ptyId` を持たない（Orca 1.4.263 でも同じ。iss-00067）。宛先の `ptyId` を任意にし、同一性は handle と `incarnationId`（と providerSession）で確かめ、`ptyId` は両方にあるときだけ比べ、指紋から外した（S-02 3a32dc8、D-02〜D-05）。送信の門 `SendRpc` と送る経路、記録の schema は変えていない。
- README の送る経路の段に、端末の宛先の同一性と Orca の再起動のあとの確かめ直しを書いた（S-03 b1abd43）。
- 実装担当：impl（Codex、`launch.effective` は agent codex・model gpt-6.2-sol・effort medium、dispatch ctx_ab6ae2adda6b）が S-01・S-02 を実装し、worker_done（succeeded）で終えた。S-03 はタスク担当（Opus 5.5 / high）。
- 今動いている常駐の orca-web（8791、2026-11-20 起動の dist）は古いコードのままで、Chat も端末も送れない状態が続く。直したコードを読み込ませるには、PR のマージの後に一度だけビルドと常駐の再起動（利用者か統括の操作）が要る。

## Verification

環境：Orca 1.4.272（CLI・アプリ）、runtime は 2026-11-23 の版上げの後のもの。宛先はタスク担当がこの worktree に `orca agent launch` で起動した使い捨ての Claude Code（端末1つ、構造化 Chat 1つ、claude-haiku-5-5 / low）だけ。常駐の orca-web（8791）には読むことと送信の意図（票を出すだけで送らない）のほかは触れず、業務中のエージェントには送っていない。会話の中身・id・パスはここに書かない。

### 仕様を書く前の再現（読むだけと、検証用の宛先への診断の送信）

- 常駐の orca-web：検証用の Chat で `GET /api/send/status` が `unsupported`、`POST /api/send/intent` が `unsupported`（`missing: ['runtime-id:consistent']`）。同じ時刻の `npm run probe:live` は `runtimeIdConsistent: true`、全機能 available。
- 開始のコミット 3204e6d のコードを別のポート（8793）で起動した試しの orca-web：検証用の Chat の状態が available で、送信が `accepted`（`dispatchState: pending`）、宛先が返事をした。端末の宛先は `identity_unavailable`。
- `session.tabs.listAll`：agent launch の端末のタブには `ptyId` と `parentLayout.ptyIdsByLeafId` がなく、`incarnationId`・`terminal`・`agentStatus.providerSession` はある。`orca terminal create` で作ったシェルのタブには `ptyId` があった（確かめた後に閉じた）。
- 診断で `ptyId` だけを仮に補った `SendService` では、端末への送信が `submitted`（`input_accepted`、`turn_started`）。使った RPC は `session.tabs.listAll`、`terminal.agentStatus`、`terminal.inspectProcess`、`terminal.send` で、今の門の形のまま通った。

### 直した後（b1abd43 のコード）

- 端末（タブに `ptyId` のない Claude Code）：`npm run send:live -- --worktree <この worktree> --handle <handle>` が成功。sent 1（submitted）、recorded 1、responseLost 1（unknown → 照会 1 回で input_accepted、送信の呼び出しは 1 回だけ）、targetChanged 2（session_changed・terminal_changed、送信 0 回）、notSent 4（ticket_invalid 2・target_changed 1・send_disabled 1、送信 0 回）。宛先は2回とも返事をした。
- 構造化 Chat：直したコードで 8793 に起動し直した試しの orca-web（専用の settings で `sendEnabled` 真、専用の記録の場所）で、状態が available、`/api/send/intent`・`confirm` が `accepted`（`dispatchState: pending`）、宛先が返事をした。端末の宛先の状態も available（answerKeys も available）。
- `npm run lint`（info 1件は基準からある useTemplate）、`npm test`（1146件すべて合格）、`npm run build` が通る。
- 質問の答え・承認の実物の確かめはしていない（検証用の宛先に質問や承認を出させる用意をしていない）。同じ宛先の解決と機能の判定を通ることは T-02・T-05 のテストで確かめた。

## Residual Risks / Follow-ups

- 常駐の orca-web の入れ替え（ビルドと再起動）は利用者か統括の操作。入れ替えるまで、今の常駐は送れないまま。
- Orca の画面がタブを描いた後に agent launch の端末のタブに `ptyId` が付くかは未確認（直したコードはどちらでも送れる）。
- `SendService` の method_not_found による止め（`#blocked`）は、Orca の起動の途中に method_not_found が返ると同じ runtime の間残りうる（今回の再現では関わっていない。runtime ID が変われば消える）。

## レビュー記録

### 仕様のレビュー（spec-review、保証レベル standard）：合格（round 1、2026-11-24）

- レビュアー：spec-reviewer（Opus 5.5 / high、方針の standard）。1人（standard なので ChatGPT の2人目なし）。
- 固定：リポジトリ HEAD 3204e6d3d1051b39fed9a2c2f22426c90c51bc2f（clean）。文書の sha256：
  - requirement.cue `43998810b0698e9a22227f23155f692ceee64ef22c447b528a4237c75850bb30`
  - design.cue `79ec59b46466d4c46ccf29f4b3a4f050f13a2c62c04ca81616ae06cc931c4728`
  - plan.cue `6660a7b0c83c9215fa16adec8574ffada90f711a72ea2cf6460df86cbb4d101b`
- 結果：`.workbench/spec-review/iss-00073/round-1.json`（validate-review の exit 0、P0 0・P1 0・P2 2・P3 0）。
- P2 の2件（直さず記録。意味を変えない解釈として実装担当への依頼に含めた）：
  1. T-02 は R-01 の受け入れの3つ目の順（古い runtime で一致 → 途中の不一致 → 新しい runtime で一致、file の runtimeId が不一致の報告の runtimeId に追いつく条件）で組む。
  2. R-02 の受け入れの3つ目（ptyId null の記録を hasAnswer・hasApproval が読む、前の記録も読める）と、キーの組・端末の承認の確定が ptyId null の宛先で送れることをテストで確かめる。

### 区切りのレビュー cp1（code-review、S-01・S-02）：合格（round 1、2026-11-24）

- 範囲 `3204e6d..3a32dc8`（S-01 a5e525a、S-02 3a32dc8）、worktree clean。レビュアー code-reviewer（Opus 5.5 / medium、axis both）。
- 結果：`.workbench/code-review/iss-00073-cp1/round-1.json`（validate-review の exit 0、P0〜P3 すべて 0）。
- タスク担当の確かめ：同じ HEAD で `npm run lint`（info 1件は基準からある useTemplate）・`npm test`（1146件すべて合格）・`npm run build` が通る。仕様の3つの sha256 は合格のときのまま。差分の本体（capabilities.ts、model.ts、target.ts、send-live.ts）を読み、D-01・D-02・D-04 どおりで送信の門を変えていないことを確かめた。

### 最終品質ゲート（final-quality-gate fqg-iss-00073）：合格（attempt 1、2026-11-24）

- 合格のコミット b1abd43（範囲 3204e6d..b1abd43、clean）。記録だけのコミットなし。
- レビュー：quality-gate-reviewer（Opus 5.5 / medium）、P0〜P3 すべて 0、coverage_complete。観点 functional-correctness・requirements-closure・test-adequacy・security-baseline・reliability-recovery。
- テスト：`npm run lint`・`npm test`（1146件）・`npm run build` すべて exit 0。
- closure：`.workbench/final-quality-gate/fqg-iss-00073/closure.md`

### PR と CI（2026-11-24）

- PR #74 https://github.com/chemitaro/orca-web/pull/74（base main、head b1abd43 = 合格のコミット、`Refs #73`）。
- CI：github-pr-checks の observer（`--watch`）の終わり exit 0、`OBSERVED_CI_PASS`、coverage ACTIONS_AND_COMMIT_STATUSES、merge_readiness READY（run 45407446911 CI success、2026-11-24T13:50:54Z）。マージは統括が行う。
