---
種別: レポート（Issue）
ID: "iss-00063"
関連GitHub: ["#63"]
最終更新: "2026-11-18"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 表のセルの `\|` を、行内のコードや強調の中でも文字の `|` として出すようにした（parseTable が各セルの `\|` を `|` にしてから行内を解く。GitHub の GFM と同じで、`\\|` でも列を分けない）。
- 会話の role tool の件の本文を Markdown で描かず、文字のまま出すようにした（buildChat の bubble の行に `markdown`、renderChatRow はそれが真の行だけを描く）。
- README の Markdown の説明に2点を足した。PR #64（https://github.com/chemitaro/orca-web/pull/64）、Refs #63。

## レビュー記録

- 仕様レビュー（spec-reviewer、Opus / medium、light なので1人）：合格。round-1 で P0・P1・P2・P3 0（`.workbench/spec-review/iss-00063/round-1.json`、検査 `round-1.check.json`）。
  - 合格した文書の sha256：requirement.cue `368989c4150bf8ee142db783bc50b8817327210bef5e77e122d9a937f35a8bf7`、design.cue `32eb6bd47a09ddfcc6cf405c40239c4fd35b645e155c6369c57c33f9b37708f7`、plan.cue `b341a86ed4540fd4b5348058acc86333d4397d555a5a7cb6feea590f34c60010`（コードの HEAD は 5d1353f）。

- 最終品質ゲート：キャンペーン `.workbench/final-quality-gate/iss-00063-fqg/`（範囲 `5d1353f..f7cbee3`）の attempt 1 で合格。合格のコミット `f7cbee32bf8e25a1677b613a20de9675a2bae945`。主（quality-gate-reviewer、Opus / medium、観点 functional-correctness・requirements-closure・test-adequacy・security-baseline）pass、指摘 0。2人目 ChatGPT GPT-6 / Extra High（chatgpt-code-review-strict、GitHub の SHA の一致を確かめた）pass、指摘 0。テスト lint 0・test 1121/1121・build 0。closure：`.workbench/final-quality-gate/iss-00063-fqg/closure.md`（写し `artifacts/closure.md`）。記録だけのコミットはない。PR の直前に origin/main を確かめ、5d1353f のまま（取り込みは要らなかった）。
- 区切りのレビュー：なし（計画のとおり）。
- PR #64（head f7cbee3 = 合格のコミット）：CI 合格（observer exit 0、run 44204181211 success、MERGEABLE・CLEAN）。マージは統括が行う。

## Verification

- S-01（実装担当 Claude Opus 5.5 / medium、21a68e5）：単体のテストを5件足した（T-01：表の文字・行内のコード・強調・逆斜線2つ・見出し。T-03：buildChat の markdown の印、role tool の行を文字で描き options.markdown を呼ばない）。今の XSS と病的な入力のテスト（T-02）はそのまま通る。基準（5d1353f）は lint・test 1116・build 合格。
- 試しの画面（S-02、タスク担当）：試しの orca-web（`npm run trial -- --state-dir .workbench/trial-63 --orca-port 8799 --page-port 47960 --forbidden-port 47961`、sendEnabled は偽のまま）で、試しのエージェント（構造化 Chat、Claude Sonnet 5.5 / low）に、`\|` で逃がした縦棒を含む架空の演算子の表を書かせ、`/embed/agent` をヘッドレスの Chrome で 1280px と 390px、明暗の4通りで描いた。どれも3列3行、セルに `\|` が残らず `|` があり、行内のコードは `a | b`・`||`・`&&`、文書の横のはみ出し 0。写し `artifacts/iss63-table-<幅>-<明暗>.png`、数えた値 `artifacts/iss63-table-measure.json`。試しのエージェントの会話には role tool の text の件がなかったので、R-02 は単体のテストで確かめた。
- 本人に見てほしい試しの画面：http://127.0.0.1:47960/（試しの orca-web は 8799）。

## 逸脱と判断

- 逸脱（実装担当の切り替え）：Codex GPT-6.1 Sol / medium の実装担当（ctx_b4954f28874f）が、最初のコマンドで Orca の chat-scratch の書き込みの根の symlink を拒まれ、何もせずに止まった。統括の依頼書の補足と計画の rationale に従い worker-stop し、S-01 を Claude Opus 5.5 / medium（ctx_2711d485e2c5）で行った。
- `\\|` の扱いは ChatGPT の iss-00061 P2-a（逆斜線の偶奇で分ける）を採らず、GitHub の GFM の実際の出力に合わせた（requirement.cue の decisions）。
- 試しのエージェントは haiku でなく Sonnet 5.5 / low（iss-00061 と同じ理由）。返事を書いて止まった（succeeded）。構造化 Chat のタブは残っている。

## Residual Risks / Follow-ups

- Orca が道具の出力の本文として整った Markdown を返す場合も文字のまま出る（iss-00061 の決定どおり）。
- 自前の解き方と CommonMark の細部の違い（参照式のリンクなど）は iss-00061 の Residual Risks のまま。
- 試しのエージェントのタブ（iss-00063 の worktree、idle）と、試しの orca-web（`kill -TERM $(cat .workbench/trial-63/trial.pid)` で止まる）が残っている。
