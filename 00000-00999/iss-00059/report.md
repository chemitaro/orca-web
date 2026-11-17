---
種別: レポート（Issue）
ID: "iss-00059"
関連GitHub: ["#59"]
最終更新: "2026-11-18"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- 小窓（`/embed/agent`）の端末の承認のカード（iss-00054 の1キー）の答える手段 `createTerminalApprover` を、質問の答え（iss-00055）と同じ時間切れと確定の 5xx の扱いに載せた。意図は 30 秒、確定は 60 秒で時間切れにし、送信中のまま止まらない。意図の時間切れは送っていないので押し直せる拒み、確定の時間切れと、送る前の拒みと分かる識別子でない確定の 5xx（`internal_error`、知らない識別子）は結果不明（「届いたか分かりません。Orca で確かめてください」の帯、押し直せない、「Orca で開く」）にする。4xx と送る前の 5xx（unreachable・record_failed など）は今のとおり blocked と refused に分ける。
- 時間切れと確定の拒みの読み方は `web/embed/question-view.js` の `timing`・`withTimeout`・`confirmRefused` を export して1か所のまま使う（中身は変えない）。サーバー（`src/`）、描画、言葉は変えていない。
- コミット：e70b106（S-01）、90a503f（S-02、AGENTS.md と README.md）。

## レビュー記録

- 仕様レビュー（spec-reviewer、Opus 5.5 / high、standard なので1人）：round-1 で合格。P0・P1・P2・P3 とも 0（`.workbench/spec-review/iss-00059/round-1.json`、検査 `round-1.check.json`）。
  - 合格した文書の sha256：requirement.cue `3b8c7d8b873838bc03ffe30d6cbb52d32b4e287b6322e90bba717dcfa5c1ba61`、design.cue `94d9ae956e2d18d417b6d8fa07beeaaffc196e01ebd7f3bc0697643a9bc3dec1`、plan.cue `b1c787e0894aeafa5e0a3e8a668202173a1ce0c2607910bc17e07b5a9b9ef63b`（コードの HEAD は 3ddeb95）。

- 実装（ui、Claude Opus 5.5 / medium、dispatch ctx_0cb64e2659fa、launch.effective claude / claude-opus-5-5 / medium）：S-01・S-02 を終え HEAD 90a503f で止まった。区切りのレビューは計画どおりなし。

- 最終品質ゲート：キャンペーン `.workbench/final-quality-gate/iss-00059-fqg/`（範囲 `3ddeb95..90a503f`）の attempt 1 で合格。合格のコミット `90a503f5a45e93c0bd564c991297431b8a6d9348`。主（quality-gate-reviewer、Opus 5.5 / medium、観点 functional-correctness・requirements-closure・test-adequacy・reliability-recovery・e2e-user-flow）pass、P0〜P3 0。2人目 ChatGPT GPT-6 / Extra High（chatgpt-code-review-strict、GitHub の SHA の一致を確かめた、モデル選択の証拠 verified）pass、指摘 0。テスト lint 0・test 1075/1075・build 0。closure：`.workbench/final-quality-gate/iss-00059-fqg/closure.md`（写し `artifacts/closure.md`）。記録だけのコミットはない。PR の直前に origin/main を取り直し、3ddeb95 のままで取り込みは要らなかった。

- PR #60（https://github.com/chemitaro/orca-web/pull/60、head 90a503f = 合格のコミット）：CI 合格（observer OBSERVED_CI_PASS、merge_readiness READY）。試しの画面 http://127.0.0.1:47940/ は動かしたまま（試しの orca-web 8797、sendEnabled 偽）。

## Verification

- テスト（T-01〜T-04、`test/web/approval-view.test.ts`）：確定の `500 internal_error`・5xx の知らない識別子で partial、送る前の 5xx・4xx は今のとおり、注入した時計で意図と確定の時間切れ（既定 30000・60000 ミリ秒）、時間切れの後に遅れて届いた応答で結果を書き換えない。iss-00054 の今のテストは変えずに通る。
- 描画（S-02、実装担当）：一時の orca-web（録画の状態、偽の会話、確定で `500 {ok:false, error:'internal_error'}` を返す偽の口。実物の Orca には書き込まない）とヘッドレスの Chrome で、端末の承認のカードの「Allow once」を押し、結果不明の帯が出ることを幅 1280px・390px × 明暗の4通りで写した。どれも帯「届いたか分かりません。Orca で確かめてください」、「Orca で開く」1つ、選択肢は押せない、カードのはみ出し 0、文書の横スクロールなし、例外と console の誤り 0、確定は各1回。写しは Scope の `artifacts/terminal-approval-partial-500-<幅>-<明暗>.png`、数えた値は `artifacts/measure.json`（偽の会話だけ）。
- 試しの画面（T-05、タスク担当）：`npm run trial -- --state-dir .workbench/trial-59 --orca-port 8797 --page-port 47940 --forbidden-port 47941`（sendEnabled は偽のまま）をヘッドレスの Chrome で、Mac の幅（1440px）、390px、`phone.html` で開き、例外 0、文書の横スクロールなし、console の誤りは試しの静的サーバーの favicon の 404 だけ（前からのもの）。`approval-view.js`・`question-view.js`・`agent-frame.js` は 200 で配られる。写しは実機の worktree の名前が写るので Scope に置かず `.workbench/trial-59-shot/` に残した。
- 端末の実機に答えを送る確かめはしていない（iss-00054 の report.md の本人の確かめの手順のまま。この直しは画面の結果の示し方だけ）。

## 逸脱と判断

- 逸脱：coding-task を Skill ツールで呼ぶと、ハーネスが disable-model-invocation で拒んだ。統括に問い、統括が `/coding-task` を送って起動した（2026-11-18）。
- 実装担当の報告の逸脱：開始のコミットで node_modules がなく lint・build が 127 だったため、AGENTS.md の手順の `npm ci` を入れて基準を取り直した（lint 0・test 1070/1070・build 0）。
- 判断：計画どおり Codex の手順は置かなかった（変えるのは画面の JavaScript だけ。本人の指示で画面は Claude Opus 5.5）。

## Residual Risks / Follow-ups

- 確定の時間切れの後にサーバーがキーを送っていても、画面は結果不明と示し押し直させない。二重の送信はサーバーの記録（already_sent）が止める。確定の 60 秒は実測していない（足りなければ結果不明に倒れる、安全側）。
- 端末の実機の確かめは iss-00054 の本人の確かめに残っている。
- iss-00050 の残りの P2-a・P2-b と、iss-00049 の残りの P2・P3 は直していない。
