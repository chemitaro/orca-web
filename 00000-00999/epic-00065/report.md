---
種別: レポート（Epic）
ID: "epic-00065"
関連GitHub: ["#65"]
最終更新: "2026-11-20"
依存: ["requirement.cue", "design.cue", "plan.cue"]
---

# Result Summary

詳細: [Report Guide](../../../docs/authoring/report.md)

## Outcome

- iss-00066（PR #70 → 4ad7471）：`AGENT_ICONS`・`iconKey` に `antigravity`・`gemini`。Gemini は stablyai/orca（MIT）の GeminiIcon、Antigravity は Orca 同梱の画像の輪郭から写した path（逸脱として iss-00066 の report.md に記録）。送信の欄の名前は表から引く。
- iss-00067（PR #71 → 3204e6d、strict）：端末の前面の照合に `antigravity`（完全一致）を足した。構造化 Chat の Antigravity には、今のコードのままで送信と RPC の回答（単一・複数・自由記述）が届く。端末の Antigravity の質問には答えない（Orca 自身が unsupported）。
- iss-00068（PR #69 → 9ad58fa）：chat-tab の worker のモデルと推論の深さを、起動の記録（effective → requested）から出す。種類によらない形で、構造化 Chat の Claude・Codex の worker にも効く。

## Verification

統括が常駐の orca-web（3204e6d で立て直し）と Orca 1.4.263・agy 1.5.12 で確かめた：
- 試しの Antigravity（構造化 Chat の worker、gemini-3.8-flash-low / low）の `/api/state` に model・effort が `startOptions.launch.effective` から出た。
- SpecDock の iss-00674 の担当が、この試しの Antigravity の2つが SpecDock の詳細の欄で『Antigravity』と出ることを実データで確かめた（送信なし）。
- iss-00067 の担当が、構造化 Chat の Antigravity に orca-web から送り、問いへの答えが届いて作業が続くことを確かめた。
- 各 PR は最終品質ゲート（主のレビューと ChatGPT GPT-6 の2人目がともに指摘0）・CI 成功で、統括が差分と個人の情報の有無を見てマージした。

## Residual Risks / Follow-ups

- 端末の Antigravity への送信が届くところは未確認：Orca の agent launch で起動した端末のタブに ptyId がなく、orca-web は `identity_unavailable` で送らない（今の守りどおり）。Orca の receipt は `provider: unsupported` で、届いても『要確認』になる。
- Gemini CLI は、この PC に未導入で、送信・回答・状態を確かめていない。アイコンと名前だけ入っている。
- worker でない Antigravity の Chat のモデルは、Orca がタブに出さないので『出どころなし』のまま。
- Antigravity のアイコンは公式のベクターの素材が出れば、表の値だけを差し替える。
