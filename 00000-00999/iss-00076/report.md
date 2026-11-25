---
種別: レポート（Issue）
ID: "iss-00076"
関連GitHub: ["#76"]
最終更新: "2026-11-25"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- S-01 4a68a6e：`src/apex/`（`buildApexList`、文書 `orca-web.apexes/v1`）と T-01〜T-06。
- S-02 d90da72：`GET /api/apexes`（同じオリジンだけ、`?project=`）と T-07。
- S-03 6985563：画面 `/apexes`、受け箱・Run の一覧・状態の表の見出しの「指揮」リンク、T-08〜T-10。
- S-04 46d6662：README と AGENTS.md の追記（タスク担当）。
- 実装担当：impl（Claude、Orca の worker、dispatch ctx_40b46402ecd5、model claude-opus-5-5、`--effort medium` で起動）。
- 区切りのレビュー cp1（`ac35101..6985563`、code-reviewer Opus 5.5 / medium を規約と仕様の2人）：どちらも合格、指摘 0。

### 逸脱と判断（実装担当の解釈、タスク担当が仕様の意味の内と確かめた）
- members_working は頂点が working でないときだけ付ける（R-02「メンバーだけが動いていれば」）。
- 猶予と member_blocked/waiting の対象：端末のタブは terminal attached だけ、chat-tab と untabbed は terminal を問わない。
- counts は working＝working、waiting＝blocked+waiting、done＝done+sleeping。
- 最後の活動が null の done は done_recent の末尾。
- Issue は worktree の branch と displayName から（頂点に worker がないので task の題名は使わない）。
- 画面は `?project=` を API に渡すだけ（選択欄なし）。
- 見えない間の停止は poll-loop.js を変えず、apexes-dom.js の startApexPolling で包む。
- リンクは plan が名指す index・runs・settings の3つだけ（run.html・project.html は iss-00082 で見直す）。

## Verification

- `npm run lint` 0、`npm test` 合格（実装担当の報告：基準 1145/1146 → HEAD 1177/1178、既存の失敗 `test/tools/trial.test.ts:118` だけ。タスク担当の再実行では全件合格）、`npm run build` 0。この Mac に Node 24 がなく Node 26.13 で実行した。
- 試しの orca-web（この worktree のコード、127.0.0.1:8794、送信は無効の別の設定ファイル、実物の Orca を読むだけ、2026-11-25 16:10 ごろ）：
  - `/api/apexes`：頂点 74 ＋ メンバー 6 ＋ 結べないもの 1 ＝ 状態の文書のエージェント 81（式が成り立つ）。counts：対応が必要 0、作業中 10、完了 64。段：作業中 7、完了（最近）4、以前の完了 6、眠っている 57。unverified 6。
  - stale は真（この Mac の負荷で orchestration の取得元が遅れ、常駐の 8791 でも同じく全部の取得元が stale）。画面に「Orca を読めていません」の帯が出た。
  - 文書に paneKey・terminalHandle はない。`worktreeId` は Orca の識別子（`<repo の id>::<パス>`）でパスを含む。受け箱の文書と同じ扱いで、同じオリジンだけに配る。
  - ヘッドレスの Chrome で `/apexes` を 1280×900 と 390×844 で描いた。1280 は段・畳んだ段・札・配下の数が正しく出た。390 は見出しと行が横にはみ出す（狭い幅は iss-00077 の R-06 で扱う）。Claude in Chrome の拡張からは 127.0.0.1・localhost のどちらもエラーの画面で、拡張での確かめはしていない。

## Residual Risks / Follow-ups

- 見出しの「作業中 n」は status で数え、unverified で 24 時間を過ぎ眠っているに入った頂点も含む（今は作業中 10、作業中の段 7）。iss-00077 で見出しの数を段に合わせるか札で示すかを決める。
- 390px で横にはみ出す（iss-00077 R-06）。
- `worktreeId` にパスが含まれる（Orca の識別子の形。受け箱と同じ）。

## レビュー記録

- 仕様のレビュー（spec-reviewer、Opus 5.5 / high、standard）：round-2 で合格（2026-11-25）。P0 0・P1 0・P2 1・P3 1。
  - 合格した文書の sha256：requirement.cue `4f5e7dcef899cb716fe8da19398252eb90c1a74c233788ce3485e9a0d456df54`、design.cue `10d3f86748d20cbc2790a6ae4e0455e858253d6ea214c7b34da41e98fc0202c1`、plan.cue `20510f6ae9cdd0d6dde7aa0d69a3b5bcfcc8b2498c319a9d53caa213c1dc2cee`
  - 結果：タスク担当の Workbench `.workbench/spec-review/iss-00076/round-1.json`（fail、P1 1）、`round-2.json`（pass）、応答 `review-response.md`
  - P2（Epic R-03 の文言と、復元待ちで state null を完了とする扱い）は、Epic の要件の文言を直して合わせた（Epic の decisions に記録）
- 最終品質ゲート：合格（2026-11-25）。合格のコミット e7d857c、キャンペーン iss-00076-fqg-2（closure はタスク担当の Workbench `.workbench/final-quality-gate/iss-00076-2/closure.md`）。レビュー pass（P0〜P3 0）、テスト lint・test・build すべて 0（Node 24.14.0）。
  - 前のキャンペーンの attempt 01 で、負荷による時間超過と既存の `test/tools/trial.test.ts` の待ち合わせの不具合（基準 ac35101 でも失敗）が出た。trial のテストを直した（e7d857c）。
  - この Mac の Homebrew の Node 26 が途中で起動できなくなった（libsimdjson の不足）。以後は nodenv の Node 24.14.0 で確かめた。
- マージの許し：利用者（2026-11-25、会話）。AGENTS.md の守ることに、merge.md の条件でエージェントがマージしてよい旨を足した（49508d2）。計画の merge を agent にした。
- マージ：PR #83 を merge.md の条件でタスク担当がマージした（2026-11-25、マージのコミット 1da3c6c、head e7d857c、CI OBSERVED_CI_PASS・READY）。
