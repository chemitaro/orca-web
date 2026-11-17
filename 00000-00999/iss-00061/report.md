---
種別: レポート（Issue）
ID: "iss-00061"
関連GitHub: ["#61"]
最終更新: "2026-11-18"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 小窓（`/embed/agent`）の会話で、エージェント側（role assistant）の発言を Markdown として描く。範囲は見出し、段落と改行、太字・斜体・取り消し線、行内のコード、言語つきのコードの塊（枠の中で横に動く）、入れ子・番号付き・チェックの箇条書き、引用、GFM の表（狭い枠では枠が横に動く）、横線、リンク（http・https だけ、newTabLink で新しいタブ）。画像はリンクとして出す。
- 解くのは純な関数 `web/embed/markdown.js`（`parseMarkdown`、`safeHref`）、描くのは `web/embed/markdown-dom.js`（createElement・textContent と決めた属性だけ）。生の HTML と http・https のほかの URL は文字のまま。例外のときはその行だけ今の文字の bubble に戻る。依存は足していない。
- `createMarkdownCache` で key と本文の同じ行の要素を使い回し、解き直さない。
- 本人の発言、ツールの行、質問・承認のカードは今のまま文字。
- コミット：41b3a3f（S-01）、06ca927（CP-1 の直し）、7258a0d（S-02）、fec0d6c（S-03 の文書）、83360ea（箇条書きの印の直し）。

## レビュー記録

- 仕様レビュー（spec-reviewer、Opus / high、standard なので1人）：合格。round-2 で P0・P1・P2・P3 0（`.workbench/spec-review/iss-00061/round-2.json`、検査 `round-2.check.json`）。
  - 合格した文書の sha256：requirement.cue `f9dcc29901a801de60469c174e09702ff6d212a10e6661bb18e12a26796ead32`、design.cue `856091b155f79d92a4d7983233b7d9e64e9776a30bebf38f9211cc81b15f7c57`、plan.cue `2385b0ea1f93fac9f63682a25f4618a6fd7d85bcb5ee46cd8b54721eef262685`（コードの HEAD は 0a55268）。
  - round-1：fail（P1 1：`_`・`__` の語の中の条件で強調が成り立たない、P2 2：R-02 の属性の一覧、見出しの末尾の `#`）。全部を直した（応答は `review-response.md`）。

- 区切りのレビュー CP-1（code-reviewer、Opus / medium、standards と spec の両方）：範囲 `0a55268..06ca927`、round-2 で合格、指摘なし（`.workbench/code-review/iss-00061-cp1/round-2.json`）。round-1（`0a55268..41b3a3f`）は合格（P0/P1 0）で P2 2（表の幅×行数の時間、行内のコードの閉じの前の `\`）。R-03・D-01 に直接反するのでタスク担当の判断で直した（06ca927）。


- 最終品質ゲート：キャンペーン `.workbench/final-quality-gate/iss-00061-fqg/`（範囲 `0a55268..83360ea`）の attempt 1 で合格。合格のコミット `83360eabd22729867b392a68f353ef394cac17e5`。主（quality-gate-reviewer、Opus / medium、観点 functional-correctness・requirements-closure・test-adequacy・security-baseline・performance-capacity・e2e-user-flow）pass、指摘 0。2人目 ChatGPT GPT-6 / Extra High（chatgpt-code-review-strict、GitHub の SHA の一致を確かめた）P0/P1 0、P2 2。テスト lint 0・test 1116/1116・build 0。closure：`.workbench/final-quality-gate/iss-00061-fqg/closure.md`（写し `artifacts/closure.md`）。記録だけのコミットはない。

## Verification

### 偽の会話での描画（S-02、画面の実装担当）

- 一時の orca-web（偽の会話だけを返す、実物の Orca と常駐の 8791 に触らない）とヘッドレスの Chrome で、幅 1280px と 390px、明暗の4通り。どれも文書の横のはみ出し 0、横に動くのは pre（4通り）と表の枠（390 の2通り）だけで overflow-x auto、`.md` の中に script・img・iframe 0、本人の発言は文字のまま。写し `artifacts/markdown-fake-<幅>-<明暗>.png`、数えた値 `artifacts/markdown-fake-measure.json`（この写しは 83360ea の箇条書きの印の直しの前のもの）。

### 試しのエージェントでの実機（S-03、タスク担当）

- 試しのエージェント（構造化 Chat、Claude Sonnet 5.5 / low。haiku は Orca が推論の段を受けず、フックが段の指定を求めるため）に、架空の ToDo アプリの説明を、見出し・表（寄せ）・ts のコード（横に長い行）・入れ子と番号付きとチェックの箇条書き・引用・リンク・強調で書かせた。
- 試しの orca-web（`npm run trial -- --state-dir .workbench/trial-61 --orca-port 8799 --page-port 47960 --forbidden-port 47961`、sendEnabled は偽のまま）の `/embed/agent` を、ヘッドレスの Chrome で 1280px と 390px、明暗の4通りで描き、その返事の行だけを写した。どれも文書の横のはみ出し 0、横に動くのは pre だけ。写し `artifacts/markdown-live-<幅>-<明暗>.png`、数えた値 `artifacts/markdown-live-measure.json`。
- 最初の写しで、いちばん上の段の箇条書きの印が ○ だった（会話の欄 `ul#log` の中にあり、ブラウザーの既定が入れ子の段として数えた）。画面の実装担当が `.md` の中の段で印を決める規則を足し（83360ea）、撮り直して ●・○・■ になったことを確かめた。
- 試しのエージェントは返事を書いて止まっている（settled、idle）。構造化 Chat のタブは端末のコマンドで閉じられないので、タブは残っている。
- 本人に見てほしい試しの画面：http://127.0.0.1:47960/（試しの orca-web は 8799）。

## 逸脱と判断

- 逸脱（実装担当の切り替え）：Codex GPT-6.1 Sol / medium の実装担当（ctx_a187dd809c24）が、最初のコマンドで Orca の chat-scratch の書き込みの根の symlink を拒まれ、何もせずに止まった。統括の依頼書の補足に従い worker-stop し、S-01 を Claude Opus 5.5 / medium（ctx_4dbbd906a077）で行った。
- CP-1 の P2 2件（R-03・D-01 に直接反する）は、タスク担当の判断で直した（06ca927）。
- 質問・承認のカードの中の文は Markdown にしない（requirement.cue の decisions）。
- 試しのエージェントは haiku でなく Sonnet 5.5 / low（上のとおり）。
- PR #62（https://github.com/chemitaro/orca-web/pull/62、head 83360ea = 合格のコミット）：CI 合格（observer exit 0、run 44201196847 success、MERGEABLE・CLEAN）。マージは統括が行う。

## Residual Risks / Follow-ups

- 最終品質ゲートの ChatGPT の P2（直していない）：(a) 表のセルの `\\|`（逆斜線2つの後の `|`）を列の区切りにしない。(b) 正規化した会話の role tool の text の部分は、buildChat が assistant の bubble にするので Markdown で描かれる（ふだんの tool-result の行は今のまま文字）。次の提案：splitCells で逆斜線の偶奇を数える、buildChat の bubble に元の role を持たせて assistant だけを描く、の小さな直し。
- 自前の解き方は CommonMark と細部が違う（参照式のリンク、Setext の見出し、字下げのコード、実体参照は文字のまま）。
- 試しのエージェントのタブが残っている（idle）。不要なら Orca の画面で閉じる。
