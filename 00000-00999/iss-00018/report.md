---
種別: レポート（Issue）
ID: "iss-00018"
関連GitHub: ["#18"]
最終更新: "2026-11-13"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

## レビュー記録

- 仕様レビュー：合格（round-2、2026-11-13）。レビュアー spec-reviewer（Opus 5.5 / high）。P0/P1 0、P2/P3 0（round-1 は P0/P1 0 で合格だったが、P2 4・P3 2 を直して再レビュー）。
  - 合格した文書の sha256：requirement.cue `c91694359466f94d1883fbd1741bacf6483163f82142879916351c1c1a9ad094`、design.cue `ebe58407cf3e16a2e62d23b68186e71a9385f8a653f9d7fec19fe1dabb40da04`、plan.cue `440791199428262a9ac674e0d937753827dac09d2175ae3b90b3126217a76bd9`
  - 結果：`.workbench/spec-review/iss-00018/round-2.json`（対応の記録は `review-response.md`）。照合のコミット `1cab6558fbfff6deeb7c9c4dbda973334bf77054`
- 区切りのレビュー CP-1：合格（round-1、2026-11-13）。範囲 `1cab655..16d9ffe326018ea0a5113a826eeea4249fa24bfa`、レビュアー code-reviewer ×2（standards と spec、Opus 5.5 / medium）。P0〜P3 すべて 0。結果：`.workbench/code-review/iss-00018-cp1/`
- 仕様の変更と再レビュー：合格（round-4、2026-11-13）。S-04 の後に、根の統括の端末の決め方を変えた（`coordinator_handle` が閉じた端末なら、親のない task の作り手のうち今ある端末の最も新しいもの）。新しい S-05（impl-fix）を足し、旧 S-05 を S-06 にした。round-3 は P0/P1 0（P2 1・P3 1 を直した）、round-4 は P0〜P3 0。
  - 合格した文書の sha256：requirement.cue `3948ce5f787b2a9c26c7c57833e1ebb7d42f8d78b4980124e5615cc581db180c`、design.cue `4b6ee1970ac9b5f9a09339921f33d6d6421dfb8a05236ac71ab11eb607184112`、plan.cue `6aca11dce79839c6f4915650e7ddce53cfb8441f9328a3fd8e40b16b13f9ed28`
  - 結果：`.workbench/spec-review/iss-00018/round-4.json`。照合のコミット `bf0d4dc6689da93586327dfa41692c6c2a2bf123`

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- オーケストレーションの木 `/runs/<id>` と API `GET /api/runs/<id>/tree`（`orca-web.run-tree/v1`）。統括を根に、worker を task の親子（`parent_id`）で組む。プロジェクトの札（`otherProject`）、親が分からない節の `orphan` を付ける。
- Run の一覧 `/runs` と `GET /api/runs?project=`（`orca-web.runs/v1`）。プロジェクトの画面 `/projects/<repo の id>`（受け箱とその Run、「<プロジェクト> の統括から」の札）。受け箱の見出しから `/runs` と選んだプロジェクトへのリンク。
- 状態の文書に項目を足した（版は v1 のまま）：RunState の `coordinatorHandle`・`activeCoordinatorHandle`・`coordinatorResolvedBy`・`coordinatorWorktreeId`、TaskState の `createdByTerminalHandle`。`run-list` を `--full` で読む。
- コミット：`e1d5ec2`（S-01）、`45e8cb7`（S-02）、`16d9ffe`（S-03）、`bf0d4dc`（S-04）、`90be0cf`（S-05）、`a207ee9`（S-06 の README・AGENTS）。
- 実装担当（`launch.effective`）：impl-logic（S-01〜S-02）codex / gpt-6-astra / high、impl（S-03）codex / gpt-6.1-sol / medium、ui（S-04）claude / claude-opus-5-5 / medium、impl-fix（S-05）codex / gpt-6-astra / high。S-06 はタスク担当（Opus 5.5 / medium）。

### 逸脱と判断

- 仕様の変更（S-04 の後）：Run の `coordinator_handle` が閉じた端末のことが多い（実機で、今ある端末に当たる Run は 21 本中 1 本）。そのため根の統括の端末を「`coordinator_handle` が今ある端末ならそれ、なければ親のない task を最近作った今ある端末」に変え、S-05（impl-fix）を足した（round-4 で合格）。
- S-02：親をたどると輪になる節だけを orphan として根の子に置き、その子孫は自分の親の下に残す（実装担当の判断。D-02 の「親をたどると自分に戻る」の読み方）。
- S-04：字下げは CSS の変数 `--depth` を CSSOM で入れる（CSP の inline の禁止に当たらない）。プロジェクトの画面の受け箱では「Orca で開く」を出さない。

## Verification

- テスト：開始のコミット `1cab655` で `npm test` 323 件 pass、`90be0cf` で 360 件 pass。`npm run lint` と `npm run build` は成功。
- 実機（2026-11-13、`orca --version` 1.4.258、一時の port 18794 の `npm start`、読むだけ。件数と結論だけ）：
  - `run_b7c4f4c08bbc` の木：節 94（統括 1、worker 93。深さ 1 が 84、深さ 2 が 9）、orphan 0。根は spec-dock のプロジェクトで、`coordinatorResolvedBy: latest-task`（`coordinator_handle` は閉じた端末）。札 5 つ。すべて orca-web の節（このタスク担当と、その実装担当）。1本の木で出た。
  - 一覧：21 の Run。orca-web で絞ると 1 本（`run_b7c4f4c08bbc`）で、`fromOtherProject` は spec-dock（「spec-dock の統括から」）。
  - 道：`/runs`、`/runs/<id>`、`/projects/<id>` は 200、形の正しくない id の画面は 404、知らない Run の木は 404、別のオリジンの `/api/runs` は 403。
  - 画面（ヘッドレス Chrome）：受け箱、一覧、木、プロジェクトの4画面で、1280px と 390px のどちらも横にはみ出さない（scrollWidth が clientWidth と等しい。390px は4画面とも 390）。390px では「Orca で開く」が 0 個。木の札は「orca-web」が 5 つ、根の行に添え書きが出る。プロジェクトの画面に「spec-dock の統括から」が出る。

## Residual Risks / Follow-ups

- 終わった worker のモデルと推論は「—」になる（共有のポーリングは、生きている worker の起動時の値だけを読む）。
- 長く続く Run は節が多い（実機で 94）。畳む・絞る表示は今後の改善。
- プロジェクトが分かる Run は 21 本中 6 本だけ（統括の端末が閉じ、worker もない古い Run はプロジェクトが分からない）。
- 受け箱の連絡の読み取り（iss-00017）は Run を `updated_at` が7日以内のものに絞る。ところが `run_b7c4f4c08bbc` の `updated_at` は、worker を起動しても進まない（2026-11-05 のまま）。この Run への統括あての連絡を、受け箱が読み落とすおそれがある（iss-00017 の範囲。次の Issue で確かめる提案）。
