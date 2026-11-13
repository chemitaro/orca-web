---
種別: レポート（Issue）
ID: "iss-00017"
関連GitHub: ["#17"]
最終更新: "2026-11-13"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

## レビュー記録

- 仕様レビュー：合格（round-3、2026-11-13）。レビュアー spec-reviewer（Opus 5.5 / high）。P0/P1 0、P2/P3 0（round-1 の P2 4・P3 2 と round-2 の P2 1 は直して再レビュー）。
  - 合格した文書の sha256：requirement.cue `8fdb46c9fe1731803a799b12d364fe9553fab593cc15a06a278a2a4ca3965c42`、design.cue `93d44408611cd50c9c96d4c65fde81bd91dff9995f296381b44c4d7ff94ce8f9`、plan.cue `279452efffe264febef83d3c4960ed073ec4e0ecce3041ca1cb0a517e3ac4df6`
  - 結果：`.workbench/spec-review/iss-00017/round-3.json`（対応の記録は `review-response.md`）。照合のコミット `4fa942020a7113fafb979a9c8d290b5c35f44520`
- 区切りのレビュー CP-1：合格（round-1、2026-11-13）。範囲 `4fa9420..7a3301ae475ca6ca8a4559c237b874737cedfb9b`、レビュアー code-reviewer ×2（standards と spec、Opus 5.5 / medium）。P0/P1 0、P2 1（両方の軸が同じ指摘：連絡と門の `created_at` を ISO に直さず since に流す。実機の連絡の `created_at` は ISO の `Z` 付きで観測しており、SQLite の形が来たときだけずれる。直さずに記録）。結果：`.workbench/code-review/iss-00017-cp1/`


詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- `/` を要対応の受け箱にした（段：要対応、止まっている、動いている、不明、終わった（畳む））。一覧の表と項目の選択は `/settings` へ移した。
- `GET /api/inbox?project=<repo の id>`（`orca-web.inbox/v1`、同じオリジンだけ、CORS なし）。段の決め方は純粋な関数 `src/inbox/classify.ts` の `buildInbox`。
- 統括あての連絡は `orchestration check --peek --terminal run:<id>`、判断の門は `gate-list --run <id>` で読む。読む口は `--peek` のない check と `--ack`・`--all`・`--unread`・`--wait`・`--retry-request` を拒み、開く門（OpenOrcaCli）からは check と gate-list を外した。
- 最後の一言は `agentStatus.lastAssistantMessage` を受け箱の文書にだけ出す（状態の API には出さない）。止まっているとみなす時間は `ORCA_WEB_STALL_MINUTES`（既定 30）。
- コミット：`66f7448`（S-01）、`1d44c80`（S-02）、`7a3301a`（S-03）、`216e0ed`（S-04）、`e511aa5`（S-05 の README・AGENTS）。

### 逸脱と判断

- S-01：本文に PR の URL がない未読の worker_done は無視する（D-01 の「URL が合わない」は URL を拾えた件だけを指す。タスク担当の回答）。
- S-02：開く門の OpenOrcaCli が READ_COMMANDS を取り込んでいたため、check と gate-list を開く門の一覧から外した（「既読にしない」をすべての門で守る。タスク担当が許可パスに open-gates.ts を足して承認）。
- S-04：連絡が一度も読めていないとき、要対応の段に「なし」を出さず「読めていません（空ではありません）」だけを出す。画面の目視は、Claude in Chrome の選択に利用者への問いが要るため、ヘッドレス Chrome（CDP）で代えた。
- タスク担当：他の統括の受け箱への `check --all` は自動の判定で止められたので使わず、マージ待ちの PR は状態の API（succeeded の worker と open の PR）から決めた。

## Verification

- テスト：開始のコミット `4fa9420` で `npm test` 267 件 pass → `216e0ed` で 323 件 pass、`npm run lint` と `npm run build` 成功。
- 実機（2026-11-13、`orca --version` 1.4.256、一時の port 18792 の `npm start`、読むだけ。件数と結論だけ）：
  - 連絡：21 の Run を読み、失敗 0。`check --peek --terminal run:<id>` と `gate-list --run` は Orca の端末の外からの管理した環境で読めた。
  - 段の件数（ある時点）：要対応 1（PR の merge_pending）、止まっている 1（PR の ci_failed）、動いている 5、不明 3（state の欠けたエージェント。state_missing）、終わった 50（done 14、スリープ 36）。
  - 統括あての質問：タスク担当が統括に送った未読の質問が、要対応の段にエージェントの項目（理由 question）として出た。受け箱を2回読む前と後で、その統括の受け箱の未読の件数は 1 のまま（既読にならない）。
  - 許可待ち（blocked）：実機に許可待ちのエージェントがなく、統括も用意できなかった（試しのエージェントの起動が統括の決まりで止められた）。手書きの入力のテスト（T-01）で、blocked が理由 blocked で要対応に入ることだけを確かめた。**実機では確かめていない（残り）**。
  - 絞り込み：いちばん項目の多いプロジェクトで 28 件が出て、すべてそのプロジェクトの項目。別のオリジンの `/api/inbox` は 403、`/settings` は 200。
  - 画面（ヘッドレス Chrome）：1280px と 390px で横にはみ出さない（390px で scrollWidth 390）。Orca で開くは 1280px で表示、390px で 0 個。終わった段は畳まれている。

## Residual Risks / Follow-ups

- 許可待ちのエージェントが要対応に出ることは、実機で確かめていない（上の Verification）。
- 連絡と門の `created_at` を ISO に直していない（CP-1 の P2）。実機の連絡は ISO の `Z` 付きで来ていたが、SQLite の形で来れば並びと経過が地方時の差だけずれる。
- gate-list の各件の形は、実機に待っている門がなく確かめていない（名前の揺れを受ける作り）。
- 次：iss-00018（オーケストレーションの木とプロジェクトの画面）。
